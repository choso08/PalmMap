#!/usr/bin/env python3
"""
Converts static GTFS into a compact timetable file for the app.

## Why

Buses in the Lisbon Metropolitan Area have an open real-time API, and the app
uses it. Trains, the metro and ferries have nothing like that — what they have is
static GTFS: a ZIP with the whole timetable, published every so often.

A GTFS cannot be used directly on a phone. CP's `stop_times.txt` has hundreds of
thousands of lines, and the app would have to read all of it to answer "when is
the next one here". So it is converted here, once, into a format that answers
that question at once.

Same pattern as the offline maps: the heavy work runs in GitHub Actions, the
result goes to a Release, and the app downloads a small file.

## What is dropped, and why

- **Outside the window of days.** A GTFS carries months of calendar; only the
  next `--dias` (60 by default) are kept. Cutting the rest removes most of the
  weight and nothing useful: whoever wants the train times three months ahead
  goes to the operator's site.
- **Seconds.** Trains run to the minute. Keeping seconds was one more digit for
  every stop of every trip, for nothing.
- **Platforms.** GTFS separates a station from its platforms; everything is
  merged into the station, which is what matters to someone waiting.

## The format

See `src/types/schedule.ts`, on the app side, which describes the same with types.
The keys are short on purpose: they repeat thousands of times in the file.

Needs only Python's standard library — nothing to install.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import date, timedelta
from pathlib import Path

USER_AGENT = "PalmMap/1.0 (personal project; https://github.com/choso08/PalmMap)"

# In the order GTFS writes them in calendar.txt.
WEEKDAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


def log(message: str) -> None:
    print(message, flush=True)


# --- Download ----------------------------------------------------------------


def fetch(url: str, timeout: int = 180) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def download_feed(urls: list[str]) -> tuple[str, zipfile.ZipFile]:
    """
    The first address that returns a ZIP that looks like GTFS.

    An address that answers but returns something else — an error page, a
    redirect to the operator's site — does not count as good. It has happened
    often enough to be worth checking instead of assuming.
    """
    if not urls:
        raise RuntimeError("No addresses to try.")

    problemas = []
    for url in urls:
        try:
            log(f"  Trying {url}")
            dados = fetch(url)
            arquivo = zipfile.ZipFile(io.BytesIO(dados))
            nomes = set(arquivo.namelist())
            if "stops.txt" not in nomes or "stop_times.txt" not in nomes:
                raise RuntimeError(f"ZIP does not look like GTFS (has: {sorted(nomes)[:6]})")
            log(f"  OK — {len(dados) / 1048576:.1f} MB")
            return url, arquivo
        except (urllib.error.URLError, zipfile.BadZipFile, RuntimeError, OSError) as erro:
            log(f"  Not usable: {erro}")
            problemas.append(f"{url}: {erro}")

    raise RuntimeError("No address worked.\n    " + "\n    ".join(problemas))


# --- Read the GTFS-------------------------------------------------------------


def read_table(archive: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    """A GTFS table. Returns an empty list if the file does not exist."""
    if name not in archive.namelist():
        return []
    with archive.open(name) as bruto:
        # utf-8-sig: many GTFS files carry a BOM, and without this the first
        # column gets an invisible character stuck to its name and is never found.
        texto = io.TextIOWrapper(bruto, encoding="utf-8-sig", newline="")
        return list(csv.DictReader(texto))


def parse_minutes(value: str) -> int | None:
    """
    `HH:MM:SS` as minutes since midnight of the service day.

    **GTFS hours can go past 24.** `25:10:00` is ten past one the next morning,
    still counted as the previous day's service — and that is how it is stored,
    as 1510 minutes. The app handles that; it is not corrected here.
    """
    partes = (value or "").strip().split(":")
    if len(partes) < 2:
        return None
    try:
        return int(partes[0]) * 60 + int(partes[1])
    except ValueError:
        return None


def service_days(
    archive: zipfile.ZipFile, janela: list[str]
) -> dict[str, list[str]]:
    """
    On which days of the window each service runs.

    Returns the actual list of dates, instead of the weekday mask with the
    exceptions apart. It is bigger — a few tens of kilobytes — and well worth it:
    the app answers "does it run today?" with a lookup in a list, instead of
    repeating the holiday arithmetic. That kind of sum done twice always ends up
    diverging in one of the two places.
    """
    dias: dict[str, set[str]] = {}
    na_janela = set(janela)

    for linha in read_table(archive, "calendar.txt"):
        service = linha.get("service_id")
        if not service:
            continue
        inicio = (linha.get("start_date") or "").strip()
        fim = (linha.get("end_date") or "").strip()
        semana = [linha.get(dia) == "1" for dia in WEEKDAYS]

        corre = set()
        for data in janela:
            if inicio and data < inicio:
                continue
            if fim and data > fim:
                continue
            # weekday(): 0 = Monday, which is GTFS's order.
            if semana[date(int(data[:4]), int(data[4:6]), int(data[6:8])).weekday()]:
                corre.add(data)
        dias[service] = corre

    # Exceptions override the calendar: a holiday removes the service from a day
    # the week said it ran, and an extra service adds it to a day it did not.
    # Some feeds only have this and carry no calendar.txt at all.
    for linha in read_table(archive, "calendar_dates.txt"):
        service = linha.get("service_id")
        data = (linha.get("date") or "").strip()
        if not service or data not in na_janela:
            continue
        atual = dias.setdefault(service, set())
        if linha.get("exception_type") == "1":
            atual.add(data)
        elif linha.get("exception_type") == "2":
            atual.discard(data)

    return {service: sorted(datas) for service, datas in dias.items() if datas}


def station_of(stops: dict[str, dict[str, str]], stop_id: str) -> str:
    """
    The station a stop belongs to.

    GTFS separates a station from its platforms, and it is the platform that
    appears in the timetables. Someone waiting for the train wants the time at
    "Pragal", not at "Pragal — platform 2".
    """
    linha = stops.get(stop_id)
    if not linha:
        return stop_id
    pai = (linha.get("parent_station") or "").strip()
    return pai if pai and pai in stops else stop_id


def build(feed: dict, janela: list[str]) -> tuple[dict, str]:
    """Converts an already downloaded GTFS into the compact file."""
    url, archive = download_feed(feed.get("urls") or [])

    stops_raw = {
        linha["stop_id"]: linha
        for linha in read_table(archive, "stops.txt")
        if linha.get("stop_id")
    }
    dias_por_servico = service_days(archive, janela)
    log(f"  {len(dias_por_servico)} service(s) with days inside the window")

    routes = {
        linha["route_id"]: linha
        for linha in read_table(archive, "routes.txt")
        if linha.get("route_id")
    }

    # The trips that matter: those of a service running in the window.
    viagens: dict[str, dict[str, str]] = {}
    for linha in read_table(archive, "trips.txt"):
        trip = linha.get("trip_id")
        if trip and linha.get("service_id") in dias_por_servico:
            viagens[trip] = linha
    log(f"  {len(viagens)} trip(s) in the window")

    if not viagens:
        raise RuntimeError("No trip runs in the coming days. Feed out of date?")

    # The stop times, grouped by trip. It is the big table — hundreds of
    # thousands of lines at CP — so only the essentials are kept.
    passagens: dict[str, list[tuple[int, str, int]]] = {}
    for linha in read_table(archive, "stop_times.txt"):
        trip = linha.get("trip_id")
        if trip not in viagens:
            continue
        minuto = parse_minutes(linha.get("departure_time") or linha.get("arrival_time") or "")
        stop = (linha.get("stop_id") or "").strip()
        if minuto is None or not stop:
            continue
        try:
            ordem = int(linha.get("stop_sequence") or 0)
        except ValueError:
            ordem = 0
        passagens.setdefault(trip, []).append((ordem, stop, minuto))

    # Indices: each station, headsign and stop pattern appears once, and trips
    # refer to them by number. That is where most of the saving is — on a train
    # line, hundreds of trips share the same handful of patterns.
    idx_stops: dict[str, int] = {}
    lista_stops: list[dict] = []
    idx_routes: dict[str, int] = {}
    lista_routes: list[list[str]] = []
    idx_headsigns: dict[str, int] = {}
    lista_headsigns: list[str] = []
    idx_patterns: dict[tuple[int, ...], int] = {}
    lista_patterns: list[list[int]] = []
    idx_services: dict[str, int] = {}
    lista_services: list[list[str]] = []

    def stop_index(stop_id: str) -> int | None:
        estacao = station_of(stops_raw, stop_id)
        if estacao in idx_stops:
            return idx_stops[estacao]
        linha = stops_raw.get(estacao)
        if not linha:
            return None
        try:
            lat = float(linha.get("stop_lat") or "")
            lon = float(linha.get("stop_lon") or "")
        except ValueError:
            return None
        idx_stops[estacao] = len(lista_stops)
        lista_stops.append(
            {
                "n": (linha.get("stop_name") or "").strip() or estacao,
                # Five decimals is just over a metre. More than that is noise
                # taking up space on thousands of lines.
                "y": round(lat, 5),
                "x": round(lon, 5),
            }
        )
        return idx_stops[estacao]

    trips_out: list[dict] = []

    for trip_id, linha_viagem in viagens.items():
        paradas = sorted(passagens.get(trip_id, []))
        if len(paradas) < 2:
            continue

        percurso: list[int] = []
        tempos: list[int] = []
        for _, stop_id, minuto in paradas:
            i = stop_index(stop_id)
            if i is None:
                continue
            # A trip stopping twice in a row at the same station (it happens with
            # adjacent platforms once merged) keeps one.
            if percurso and percurso[-1] == i:
                continue
            percurso.append(i)
            tempos.append(minuto)

        if len(percurso) < 2:
            continue

        chave = tuple(percurso)
        if chave not in idx_patterns:
            idx_patterns[chave] = len(lista_patterns)
            lista_patterns.append(list(percurso))

        route_id = linha_viagem.get("route_id") or ""
        if route_id not in idx_routes:
            r = routes.get(route_id, {})
            idx_routes[route_id] = len(lista_routes)
            lista_routes.append(
                [
                    (r.get("route_short_name") or "").strip(),
                    (r.get("route_long_name") or "").strip(),
                ]
            )

        letreiro = (linha_viagem.get("trip_headsign") or "").strip()
        if not letreiro:
            letreiro = lista_stops[percurso[-1]]["n"]
        if letreiro not in idx_headsigns:
            idx_headsigns[letreiro] = len(lista_headsigns)
            lista_headsigns.append(letreiro)

        service_id = linha_viagem.get("service_id") or ""
        if service_id not in idx_services:
            idx_services[service_id] = len(lista_services)
            lista_services.append(dias_por_servico[service_id])

        # The first time is absolute, the following ones are what is added to
        # the previous. Nearly all end up with one or two digits instead of four.
        deltas = [tempos[0]]
        for anterior, atual in zip(tempos, tempos[1:]):
            deltas.append(atual - anterior)

        trips_out.append(
            {
                "r": idx_routes[route_id],
                "s": idx_services[service_id],
                "h": idx_headsigns[letreiro],
                "p": idx_patterns[chave],
                "t": deltas,
            }
        )

    if not trips_out:
        raise RuntimeError("No usable trip after converting.")

    lats = [s["y"] for s in lista_stops]
    lons = [s["x"] for s in lista_stops]

    resultado = {
        "id": feed["id"],
        "nome": feed["nome"],
        "kind": feed.get("kind", "train"),
        "gerado": date.today().isoformat(),
        "inicio": janela[0],
        "fim": janela[-1],
        "stops": lista_stops,
        "routes": lista_routes,
        "headsigns": lista_headsigns,
        "patterns": lista_patterns,
        "services": lista_services,
        "trips": trips_out,
    }

    log(
        f"  {len(lista_stops)} stations, {len(lista_routes)} lines, "
        f"{len(lista_patterns)} patterns, {len(trips_out)} trips"
    )

    resultado["bbox"] = [
        round(min(lons), 4),
        round(min(lats), 4),
        round(max(lons), 4),
        round(max(lats), 4),
    ]
    return resultado, url


# --- Metro Sul do Tejo (the operator's own timetable service) ------------------

MTS_API = "https://www.mts.pt/mts-timetable-api/"

# Station coordinates, from Carris Metropolitana's `/facilities/light_rail_stations`
# (probe of 9 November 2026), keyed by the MTS service's station id. They come
# from the same source the app uses to place the stations, so the app links the
# timetable to the station exactly.
MTS_COORDS = {
    1: (38.637163, -9.151019), 2: (38.642502, -9.151832), 3: (38.647186, -9.153257),
    4: (38.6564, -9.154345), 5: (38.66045, -9.157276), 6: (38.664459, -9.159932),
    7: (38.667019, -9.165623), 8: (38.673456, -9.166254), 9: (38.676584, -9.164155),
    10: (38.679353, -9.1575), 11: (38.682258, -9.152387), 12: (38.68421, -9.149815),
    13: (38.687196, -9.147759), 14: (38.670185, -9.168259), 15: (38.66636, -9.180196),
    16: (38.663803, -9.190167), 17: (38.665517, -9.194342), 18: (38.66457, -9.20021),
    19: (38.663702, -9.209134),
}


def easter(year: int) -> date:
    """Gregorian Easter Sunday (anonymous algorithm)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def pt_holidays(year: int) -> set[date]:
    """Portugal's national public holidays. MTS runs its Sunday timetable on them."""
    e = easter(year)
    fixed = [(1, 1), (4, 25), (5, 1), (6, 10), (8, 15), (10, 5), (11, 1), (12, 1), (12, 8), (12, 25)]
    return {date(year, m, d) for m, d in fixed} | {e - timedelta(days=2), e, e + timedelta(days=60)}


def mts_season(day: date) -> int:
    """MTS's two seasons, as its form lists them: summer (1) 15 Jul–7 Sep, winter (2) the rest."""
    if (day.month, day.day) >= (7, 15) and (day.month, day.day) <= (9, 7):
        return 1
    return 2


def mts_post(path: str, params: dict) -> object:
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(
        MTS_API + path,
        data=data,
        headers={"User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def build_mts(feed: dict, janela: list[str]) -> tuple[dict, str]:
    """
    Builds the compact timetable from MTS's own service.

    The service answers, per line direction, day type and season: the stations
    in order with the minutes from the previous one (`time_diff`), and every
    departure from the first station (`start_time`, seconds after midnight).
    Departures after midnight come as small numbers at the end of the list
    (1800 = 00:30) and are moved past 1440, as GTFS does.
    """
    lines = json.loads(fetch(MTS_API + "lines"))["data"]
    dias = [date(int(d[:4]), int(d[4:6]), int(d[6:])) for d in janela]
    feriados = set().union(*(pt_holidays(y) for y in {d.year for d in dias}))

    # One service per (season, day type), with its dates inside the window.
    services: dict[tuple[int, int], list[str]] = {}
    for d in dias:
        tipo = 3 if (d.weekday() == 6 or d in feriados) else 2 if d.weekday() == 5 else 1
        services.setdefault((mts_season(d), tipo), []).append(d.strftime("%Y%m%d"))

    lista_stops: list[dict] = []
    idx_stops: dict[int, int] = {}
    lista_routes: list[list[str]] = []
    idx_routes: dict[str, int] = {}
    lista_headsigns: list[str] = []
    lista_patterns: list[list[int]] = []
    lista_services: list[list[str]] = []
    idx_services: dict[tuple[int, int], int] = {}
    trips_out: list[dict] = []

    for line in lines:
        stations = mts_post("stations", {"line_id": line["id"]})
        stations = [s for s in stations if str(s.get("active", "1")) == "1"]
        if len(stations) < 2:
            continue
        pattern = []
        for s in stations:
            sid = int(s["id"])
            if sid not in MTS_COORDS:
                raise RuntimeError(f"MTS station without coordinates: {s}")
            if sid not in idx_stops:
                idx_stops[sid] = len(lista_stops)
                lat, lon = MTS_COORDS[sid]
                lista_stops.append({"n": s["name"], "y": lat, "x": lon})
            pattern.append(idx_stops[sid])
        diffs = [int(s.get("time_diff") or 0) for s in stations][1:]
        p = len(lista_patterns)
        lista_patterns.append(pattern)

        # "LINHA 1 - sentido Corroios / Cacilhas" → short "L1".
        name = line.get("name") or ""
        number = re.search(r"LINHA\s*(\d+)", name)
        short = f"L{number.group(1)}" if number else name
        if short not in idx_routes:
            idx_routes[short] = len(lista_routes)
            lista_routes.append([short, name.split(" - ")[0].title()])
        h = len(lista_headsigns)
        lista_headsigns.append(stations[-1]["name"])

        for (season, tipo), datas in services.items():
            res = mts_post(
                "search",
                {"line": line["id"], "stations": stations[0]["id"], "day_type": tipo, "season": season},
            )
            times = [int(t["start_time"]) for t in (res.get("data") or {}).get("times", [])]
            if not times:
                continue
            if (season, tipo) not in idx_services:
                idx_services[(season, tipo)] = len(lista_services)
                lista_services.append(datas)
            previous = -1
            extra = 0
            for secs in times:
                if secs + extra < previous:
                    extra += 86400  # past midnight: still the previous day's service
                secs += extra
                previous = secs
                trips_out.append(
                    {
                        "r": idx_routes[short],
                        "s": idx_services[(season, tipo)],
                        "h": h,
                        "p": p,
                        "t": [round(secs / 60)] + diffs,
                    }
                )
        log(f"  {name}: {len(stations)} stations")

    if not trips_out:
        raise RuntimeError("MTS: no trips in the window.")

    lats = [s["y"] for s in lista_stops]
    lons = [s["x"] for s in lista_stops]
    resultado = {
        "id": feed["id"],
        "nome": feed["nome"],
        "kind": feed.get("kind", "light_rail"),
        "gerado": date.today().isoformat(),
        "inicio": janela[0],
        "fim": janela[-1],
        "stops": lista_stops,
        "routes": lista_routes,
        "headsigns": lista_headsigns,
        "patterns": lista_patterns,
        "services": lista_services,
        "trips": trips_out,
        "bbox": [round(min(lons), 4), round(min(lats), 4), round(max(lons), 4), round(max(lats), 4)],
    }
    log(f"  {len(lista_stops)} stations, {len(lista_patterns)} patterns, {len(trips_out)} trips")
    return resultado, MTS_API


# --- Discover addresses -----------------------------------------------------


def probe(url: str, bytes_corpo: int = 500) -> None:
    """Knocks on a door and says what answered, without drawing conclusions."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as resposta:
            tipo = resposta.headers.get("Content-Type", "?")
            corpo = resposta.read(bytes_corpo + 100)
            log(f"  {resposta.status}  {tipo}  {url}")
            log(f"        {corpo[:bytes_corpo]!r}")
    except urllib.error.HTTPError as erro:
        # 401 and 403 are the answers worth telling apart: they mean the door
        # exists but is closed, which is different from not existing.
        log(f"  {erro.code}  {erro.reason}  {url}")
    except Exception as erro:  # noqa: BLE001
        log(f"  ---  {erro}  {url}")


def probe_tml() -> None:
    """
    Knocks on the TML API's door and says what answers.

    **Why this exists.** Transportes Metropolitanos de Lisboa aggregates real
    time from eight operators — CP, Fertagus, Metro de Lisboa, Transtejo/Soflusa
    and the buses — and says publicly that most data is open with no special
    treatment: "everyone has access to the same information at the same time".
    It also says **some** data requires authentication, without saying which.

    Where this code was written cannot reach it, and guessing the addresses
    would repeat the mistake already recorded in CLAUDE.md — the Carris field
    names were all guessed wrong at first. So instead of writing code against
    supposed addresses, they are asked from here, from a place with Internet,
    and whatever they answer is written down.

    What is known about the format: static GTFS for the plan, and GTFS-RT for
    real time — alerts in JSON and Protobuf, vehicle positions in Protobuf.
    **Protobuf is not free in this project:** it would need a new library just
    to decode it. The JSON alerts would not.
    """
    base = "https://go.tmlmobilidade.pt/hub/api"
    log("\n=== TML API (real time from several operators) ===")
    log("The documentation says the base is " + base + "/:version/:path\n")

    for caminho in [
        "",
        "/v1",
        "/v1/alerts",
        "/v1/alerts.json",
        "/v1/service_alerts",
        "/v1/gtfs-rt/alerts",
        "/v1/gtfs-rt/vehicles",
        "/v1/vehicles",
        "/v1/gtfs",
    ]:
        probe(base + caminho)

    # Carris's are the yardstick: they are known to work without a key.
    log("\n--- For comparison, Carris Metropolitana's ---")
    for url in [
        "https://api.carrismetropolitana.pt/v2/alerts",
        "https://api.carrismetropolitana.pt/gtfs",
    ]:
        probe(url)


def probe_geoportal() -> None:
    """
    Asks the TML geoportal which collections it has.

    **This is the lead that matters.** The dados.gov.pt search returned two
    collections called `gtfs_stops` and `gtfs_shapes` on this geoportal. If those
    two exist, the other GTFS tables might too — and a GTFS published by TML
    would be the **whole Lisbon Metropolitan Area**'s, with CP, Fertagus, the
    Metro, ferries and buses all in one file. Exactly what this project lacks.
    (Answer, August 2026: no — only those two start with `gtfs_`.)

    It is an OGC API, which always has a `/collections` saying what is there.
    Instead of guessing collection names, it is asked.
    """
    url = "https://geoportal.tmlmobilidade.pt/ogc-api/collections?f=json"
    log("\n=== TML geoportal: which collections exist ===")
    try:
        dados = json.loads(fetch(url, timeout=60))
    except Exception as erro:  # noqa: BLE001
        log(f"  Failed: {erro}")
        return

    colecoes = dados.get("collections", [])
    log(f"  {len(colecoes)} collection(s):")
    for colecao in colecoes:
        identificador = colecao.get("id", "?")
        titulo = colecao.get("title", "")
        log(f"    {identificador:<28} {titulo}")


# GTFS addresses it would be worth having, to cover the Lisbon area.
# They are not in the catalogue because they are guesses — this is exactly to
# stop them being guesses. What answers moves there; what does not is recorded
# as tried, so the same is not tried again.
CANDIDATOS = [
    # Carris de Lisboa — the city's, buses and trams. NOT Carris
    # Metropolitana, which serves the other municipalities.
    "https://www.carris.pt/gtfs/gtfs.zip",
    "https://gtfs.carris.pt/gtfs/gtfs.zip",
    "https://api.carris.pt/gtfs",
    # CP — Lisbon urban trains, among others.
    "https://publico.cp.pt/gtfs/gtfs.zip",
    "https://www.cp.pt/gtfs/gtfs.zip",
    # Fertagus and ferries.
    "https://www.fertagus.pt/gtfs/gtfs.zip",
    "https://ttsl.pt/gtfs/gtfs.zip",
    "https://www.transtejo.pt/gtfs/gtfs.zip",
    # And the good hypothesis: a GTFS for the whole area, published by TML.
    "https://api.tmlmobilidade.pt/gtfs",
    "https://go.tmlmobilidade.pt/hub/api/v1/gtfs.zip",
]


def probe_candidatos() -> None:
    log("\n=== GTFS addresses to test ===")
    for url in CANDIDATOS:
        probe(url)


def probe_vehicles() -> None:
    """
    Looks for the positions of moving buses.

    Carris Metropolitana's site shows the buses moving on the map, so the data
    exists. **What decides whether this is possible here is the format.**

    - If there is **JSON**, it is free: one more request, like the arrival
      times, with no new dependency.
    - If there is only **GTFS-RT in Protobuf**, it would need a library just to
      decode it. Not impossible, but a different and costlier decision.

    So it asks instead of assuming, and prints each answer's `Content-Type` —
    which is what tells one from the other.
    """
    log("\n=== Positions of moving buses ===")
    for url in [
        "https://api.carrismetropolitana.pt/v2/vehicles",
        "https://api.carrismetropolitana.pt/vehicles",
        "https://api.carrismetropolitana.pt/v2/vehicles/by_line/1523",
        "https://api.carrismetropolitana.pt/v1/vehicles",
        "https://api.carrismetropolitana.pt/gtfs-rt/vehicle-positions",
        "https://api.carrismetropolitana.pt/v2/gtfs-rt/vehicle_positions",
    ]:
        probe(url, 1400)

    # **The size decides the design.** There is no filter by area or line —
    # `by_line` gives 404 — so the app would have to download the whole fleet on
    # every update. If that is hundreds of kilobytes every twenty seconds, it is
    # serious mobile data and has to be braked by zoom and by a setting. Measured
    # instead of guessed.
    log("\n--- How heavy the whole fleet is, and how many are really moving ---")
    try:
        bruto = fetch("https://api.carrismetropolitana.pt/v2/vehicles", timeout=60)
        dados = json.loads(bruto)
        com_posicao = [v for v in dados if v.get("lat") and v.get("lon")]
        log(f"  {len(bruto) / 1024:.0f} KB, {len(dados)} vehicles in the list")
        log(f"  {len(com_posicao)} with a position — the rest are only fleet records")

        if com_posicao:
            campos = sorted(com_posicao[0].keys())
            log(f"  fields of a moving one: {campos}")
            agora = max(v.get("timestamp", 0) for v in com_posicao)
            idades = sorted(agora - v.get("timestamp", 0) for v in com_posicao)
            meio = idades[len(idades) // 2]
            log(f"  position age: median {meio}s, worst {idades[-1]}s")
    except Exception as erro:  # noqa: BLE001
        log(f"  Failed: {erro}")


def probe_arrivals() -> None:
    """
    Looks at the real arrivals of two stops on the same line, and tries on them
    the trip matching the app does (`tripKeys`, in `src/services/transit.ts`).

    It exists because bus trips stayed empty after the September 2026 fix, and
    the environment where the code is written cannot reach the Carris API. It
    prints the fields that really come, how many arrivals carry each, and how
    many trips can be matched between the two stops.
    """
    base = "https://api.carrismetropolitana.pt/v2"

    def get(caminho: str):
        return json.loads(fetch(base + caminho, timeout=90))

    def resumo(nome: str, passagens: list) -> None:
        log(f"  {nome}: {len(passagens)} arrivals")
        if not passagens:
            return
        chaves = sorted({k for p in passagens for k in p.keys()})
        log(f"    fields: {chaves}")
        for campo in ["trip_id", "pattern_id", "stop_sequence", "scheduled_arrival_unix",
                      "estimated_arrival_unix", "observed_arrival", "line_id", "stop_id"]:
            preenchidos = [p.get(campo) for p in passagens if p.get(campo) not in (None, "")]
            tipos = sorted({type(v).__name__ for v in preenchidos})
            exemplo = preenchidos[0] if preenchidos else None
            log(f"    {campo}: {len(preenchidos)}/{len(passagens)} {tipos} ex={exemplo!r}")
        log(f"    first: {json.dumps(passagens[0], ensure_ascii=False)[:700]}")

    log("\n=== Real arrivals and trip matching ===")
    try:
        paragens = get("/stops")
    except Exception as erro:  # noqa: BLE001
        log(f"  /stops failed: {erro}")
        return
    log(f"  /stops: {len(paragens)} paragens; campos: {sorted(paragens[0].keys())}")

    # Near the centre of Almada, served by Carris Metropolitana.
    alvo = (38.6790, -9.1569)

    def dist(p) -> float:
        try:
            return (float(p["lat"]) - alvo[0]) ** 2 + (float(p["lon"]) - alvo[1]) ** 2
        except (KeyError, TypeError, ValueError):
            return 1e9

    candidatas = sorted(paragens, key=dist)[:8]
    origem = None
    passagens_a: list = []
    for paragem in candidatas:
        try:
            passagens_a = get(f"/arrivals/by_stop/{paragem['id']}")
        except Exception as erro:  # noqa: BLE001
            log(f"  /arrivals/by_stop/{paragem['id']} failed: {erro}")
            continue
        if passagens_a:
            origem = paragem
            break
    if origem is None:
        log("  No stop near Almada returned arrivals.")
        return
    log(f"  Paragem A: {origem['id']} {origem.get('long_name')}")
    resumo("A", passagens_a)

    padrao = next((p.get("pattern_id") for p in passagens_a if p.get("pattern_id")), None)
    if not padrao:
        log("  No pattern_id in A's arrivals — matching cannot work.")
        return

    try:
        dados_padrao = get(f"/patterns/{padrao}")
    except Exception as erro:  # noqa: BLE001
        log(f"  /patterns/{padrao} failed: {erro}")
        return
    if isinstance(dados_padrao, list):
        dados_padrao = dados_padrao[0] if dados_padrao else {}
    log(f"  /patterns/{padrao}: campos {sorted(dados_padrao.keys())}")
    caminho = dados_padrao.get("path") or []
    ids = []
    for passo in caminho:
        stop = passo.get("stop") if isinstance(passo, dict) else None
        sid = (stop or {}).get("id") if isinstance(stop, dict) else None
        sid = sid or (passo.get("stop_id") if isinstance(passo, dict) else None)
        if sid:
            ids.append(str(sid))
    log(f"  the pattern has {len(ids)} stops; first entry: {json.dumps(caminho[:1], ensure_ascii=False)[:400]}")
    if str(origem["id"]) not in ids:
        log("  Stop A is not on the pattern's path.")
        return
    i = ids.index(str(origem["id"]))
    j = min(i + 6, len(ids) - 1)
    if j == i:
        log("  A is the pattern's last stop; nothing to match.")
        return
    destino = ids[j]
    passagens_b = get(f"/arrivals/by_stop/{destino}")
    log(f"  Stop B: {destino} ({j - i} stops after A on pattern {padrao})")
    resumo("B", passagens_b)

    def chaves(passagens: list) -> tuple[dict, dict]:
        grupos: dict = {}
        for n, p in enumerate(passagens):
            if not p.get("pattern_id") or not isinstance(p.get("scheduled_arrival_unix"), (int, float)):
                continue
            grupos.setdefault(f"{p['pattern_id']}|{p.get('stop_sequence') or 0}", []).append(n)
        resultado = {}
        por_padrao: dict = {}
        for grupo, lista in grupos.items():
            lista.sort(key=lambda n: passagens[n]["scheduled_arrival_unix"])
            for ordem, n in enumerate(lista):
                resultado[n] = f"{passagens[n]['pattern_id']}#{ordem}"
            pad = grupo.rsplit("|", 1)[0]
            antes = por_padrao.get(pad)
            por_padrao[pad] = len(lista) if antes in (None, len(lista)) else -1
        return resultado, por_padrao

    ka, pa = chaves(passagens_a)
    kb, pb = chaves(passagens_b)
    log(f"  trips of pattern {padrao}: A={pa.get(padrao)} B={pb.get(padrao)}")
    em_b = {k: n for n, k in kb.items()}
    pares = 0
    exemplo = None
    for n, k in ka.items():
        if not k.startswith(f"{padrao}#") or k not in em_b:
            continue
        a, b = passagens_a[n], passagens_b[em_b[k]]
        if (a.get("stop_sequence") or 0) >= (b.get("stop_sequence") or 0):
            continue
        if a["scheduled_arrival_unix"] >= b["scheduled_arrival_unix"]:
            continue
        if a.get("trip_id") and b.get("trip_id") and a["trip_id"] != b["trip_id"]:
            log(f"    trip_id mismatch at {k}: {a['trip_id']} vs {b['trip_id']}")
            continue
        pares += 1
        exemplo = exemplo or (k, a.get("scheduled_arrival"), b.get("scheduled_arrival"))
    log(f"  viagens emparelhadas: {pares}; exemplo: {exemplo}")

    # E como estava antes: pelo trip_id.
    ta = {p.get("trip_id") for p in passagens_a if p.get("trip_id")}
    tb = {p.get("trip_id") for p in passagens_b if p.get("trip_id")}
    log(f"  by trip_id: {len(ta & tb)} in common")


# The words searched for. One is not enough: not everyone writes "GTFS" in the
# title, and that is how CP and Fertagus did not show up at first.
CONSULTAS = [
    "GTFS",
    "comboios",
    "CP Comboios de Portugal",
    "Fertagus",
    "Transtejo Soflusa",
    "horários transportes públicos",
    "transportes ferroviários",
    # The target is the Lisbon Metropolitan Area. The ones above caught Metro de
    # Lisboa and, by chance, the Braga buses — but missed Carris de Lisboa (the
    # city's, which is not Carris Metropolitana), the urban trains and the
    # ferries, which are what is missing to cover the area.
    "Carris",
    "Área Metropolitana de Lisboa",
    "Metropolitano de Lisboa",
    "navegante",
    "elétricos Lisboa",
    "transporte fluvial",
]


def discover() -> None:
    """
    Searches dados.gov.pt for GTFS and prints what it finds.

    It exists because the catalogue addresses could not be confirmed from where
    this code was written. Run it in GitHub Actions, which has Internet, and copy
    the ones that answer into `transit-feeds.json`.

    **The stable address is always preferred.** dados.gov.pt gives two addresses
    for the same file: one with the date inside, which changes on every
    publication, and a `/datasets/r/<id>` that always points to the latest
    version. That one goes into the catalogue — otherwise the timetable stopped
    downloading as soon as the operator published the next version.
    """
    vistos: set[str] = set()

    for consulta in CONSULTAS:
        url = (
            "https://dados.gov.pt/api/1/datasets/"
            f"?q={urllib.parse.quote(consulta)}&page_size=30"
        )
        log(f"\n=== Searching: {consulta} ===")
        try:
            dados = json.loads(fetch(url, timeout=60))
        except Exception as erro:  # noqa: BLE001 — here any failure just means "did not work"
            log(f"  Failed: {erro}")
            continue

        for conjunto in dados.get("data", []):
            titulo = conjunto.get("title", "?")
            organizacao = (conjunto.get("organization") or {}).get("name", "?")
            recursos = [
                r
                for r in conjunto.get("resources", [])
                if "gtfs" in (r.get("title", "") + r.get("url", "")).lower()
                or (r.get("format") or "").lower() in ("zip", "gtfs")
            ]
            if not recursos or titulo in vistos:
                continue
            vistos.add(titulo)

            log(f"## {titulo}  [{organizacao}]")
            for r in recursos:
                estavel = (
                    f"https://dados.gov.pt/api/1/datasets/r/{r['id']}"
                    if r.get("id")
                    else ""
                )
                log(f"   {r.get('format', '?'):>5}  {r.get('url')}")
                if estavel:
                    log(f"          stable: {estavel}")
            log("")


# --- Entry ---------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogo", default="transit-feeds.json")
    parser.add_argument("--saida", default="horarios")
    parser.add_argument(
        "--ids",
        default="",
        help='Space-separated ids. "todos" does the whole catalogue.',
    )
    parser.add_argument("--dias", type=int, default=60)
    parser.add_argument(
        "--veiculos",
        action="store_true",
        help="Only probes the bus positions and exits.",
    )
    parser.add_argument(
        "--passagens",
        action="store_true",
        help="Only probes Carris arrivals and trip matching.",
    )
    parser.add_argument(
        "--descobrir",
        action="store_true",
        help="Only searches dados.gov.pt for addresses and exits.",
    )
    args = parser.parse_args()

    if args.veiculos:
        probe_vehicles()
        return 0

    if args.passagens:
        probe_arrivals()
        return 0

    if args.descobrir:
        discover()
        probe_geoportal()
        probe_candidatos()
        probe_vehicles()
        probe_tml()
        return 0

    catalogo = json.loads(Path(args.catalogo).read_text(encoding="utf-8"))
    pedidos = args.ids.split()
    hoje = date.today()
    janela = [(hoje + timedelta(days=i)).strftime("%Y%m%d") for i in range(args.dias)]

    pasta = Path(args.saida)
    pasta.mkdir(parents=True, exist_ok=True)

    entradas = []
    falhados = []

    for feed in catalogo.get("feeds", []):
        if pedidos and pedidos != ["todos"] and feed["id"] not in pedidos:
            continue

        log(f"::group::{feed['nome']}")
        try:
            if feed.get("fonte") == "mts-api":
                resultado, url = build_mts(feed, janela)
            elif not feed.get("urls"):
                # No address is not a failure of the run, it is a source not yet
                # found. Say so and move on, without tainting the rest.
                log(f"  NO ADDRESS — {feed.get('notas') or 'nothing published.'}")
                log("::endgroup::")
                continue
            else:
                resultado, url = build(feed, janela)
            destino = pasta / f"{feed['id']}.json"
            # separators without spaces: thousands of commas, and each one saved
            # is a byte less to download on a phone.
            destino.write_text(
                json.dumps(resultado, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            bytes_ = destino.stat().st_size
            log(f"  {destino}: {bytes_ / 1024:.0f} KB  (from {url})")

            entradas.append(
                {
                    "id": feed["id"],
                    "nome": feed["nome"],
                    "kind": feed.get("kind", "train"),
                    "ficheiro": f"{feed['id']}.json",
                    "bytes": bytes_,
                    "gerado": resultado["gerado"],
                    "fim": resultado["fim"],
                    "estacoes": len(resultado["stops"]),
                    "bbox": resultado["bbox"],
                    "origem": url,
                    # Only written when false, so the list is not full of fields
                    # stating what is already the rule.
                    **({} if feed.get("naApp", True) else {"naApp": False}),
                }
            )
        except Exception as erro:  # noqa: BLE001 — one operator does not take the others down
            log(f"  FAILED: {erro}")
            falhados.append(f"{feed['id']} ({erro})")
        finally:
            log("::endgroup::")

    (pasta / "lote.json").write_text(
        json.dumps({"horarios": entradas}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    if falhados:
        log("::warning::Operators that did not come out: " + "; ".join(falhados))

    if not entradas:
        log("No operator generated.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
