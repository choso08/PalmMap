#!/usr/bin/env python3
"""
Read-only probe of the services the app depends on, run from GitHub Actions
(the development environment cannot reach them). Publishes nothing.

Prints what is needed to fix things against real data instead of guesses:
- Carris arrivals at one stop: the raw fields, the line prefix, duplicates.
- Carris vehicles: timestamp units and age.
- Metro Sul do Tejo stations, as the Carris API lists them.
- Which satellite / orthophoto editions exist (EOX, DGT).
"""
import json
import time
import urllib.error
import urllib.request

UA = "PalmMap/1.0 (personal project; https://github.com/choso08/PalmMap)"
CARRIS = "https://api.carrismetropolitana.pt/v2"


def get(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read()
    except Exception as e:  # noqa: BLE001
        return None, "", str(e).encode()


def section(title):
    print("\n" + "=" * 70 + "\n" + title + "\n" + "=" * 70)


def arrivals():
    section("ARRIVALS")
    _, _, body = get(f"{CARRIS}/stops")
    stops = json.loads(body)
    wanted = [s for s in stops if "LOROSAE" in (s.get("long_name") or "").upper()]
    wanted += [s for s in stops if "CACILHAS" in (s.get("long_name") or "").upper()][:2]
    for stop in wanted[:4]:
        status, _, body = get(f"{CARRIS}/arrivals/by_stop/{stop['id']}")
        print(f"\n--- stop {stop['id']} {stop.get('long_name')} -> {status}")
        if status != 200:
            continue
        data = json.loads(body)
        now = time.time()
        upcoming = [
            a for a in data
            if (a.get("estimated_arrival_unix") or a.get("scheduled_arrival_unix") or 0) > now - 60
        ]
        upcoming.sort(key=lambda a: a.get("estimated_arrival_unix") or a.get("scheduled_arrival_unix") or 0)
        print("keys:", sorted({k for a in data for k in a}))
        print("line_id samples:", sorted({str(a.get("line_id")) for a in data})[:15])
        print("route_id samples:", sorted({str(a.get("route_id")) for a in data})[:10])
        for a in upcoming[:14]:
            print(json.dumps({k: a.get(k) for k in (
                "line_id", "route_id", "pattern_id", "trip_id", "vehicle_id", "headsign",
                "stop_sequence", "scheduled_arrival_unix", "estimated_arrival_unix",
                "observed_arrival_unix")}, ensure_ascii=False))


def vehicles():
    section("VEHICLES")
    status, ctype, body = get(f"{CARRIS}/vehicles")
    print("status", status, ctype, len(body), "bytes")
    if status != 200:
        print(body[:500])
        return
    data = json.loads(body)
    print("count", len(data))
    print("keys:", sorted({k for v in data for k in v}))
    now = time.time()
    ts = sorted(v.get("timestamp") for v in data if isinstance(v.get("timestamp"), (int, float)))
    print("now(s)", int(now), "timestamp min/median/max", ts[:1], ts[len(ts) // 2:len(ts) // 2 + 1], ts[-1:])
    fresh_s = [t for t in ts if 0 <= now - t <= 120]
    fresh_ms = [t for t in ts if 0 <= now - t / 1000 <= 120]
    print("fresh if seconds:", len(fresh_s), " fresh if milliseconds:", len(fresh_ms))
    for v in sorted(data, key=lambda v: -(v.get("timestamp") or 0))[:3]:
        print(json.dumps(v, ensure_ascii=False)[:600])


def light_rail():
    section("METRO SUL DO TEJO (light_rail_stations)")
    status, _, body = get(f"{CARRIS}/facilities/light_rail_stations")
    print("status", status)
    if status == 200:
        data = json.loads(body)
        print("count", len(data), "keys", sorted({k for s in data for k in s}))
        for s in data:
            print(" -", s.get("id"), "|", s.get("name"), "|", s.get("lat"), s.get("lon"),
                  "| lines:", s.get("lines") or s.get("line_ids"))


def satellite():
    section("SATELLITE")
    status, _, body = get("https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml", 90)
    print("EOX capabilities", status)
    if status == 200:
        text = body.decode("utf-8", "replace")
        import re
        names = sorted(set(re.findall(r"<ows:Identifier>(s2cloudless[^<]*)</ows:Identifier>", text)))
        print("s2cloudless layers:", names)
    for y in (2024, 2025, 2026):
        s, c, _ = get(f"https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-{y}_3857/default/g/10/388/488.jpg")
        print(f"EOX tile s2cloudless-{y}:", s, c)
    for name in ("ortosat2023", "ortosat2024", "ortosat2025", "ortosat2026",
                 "ortos2021", "ortos2023", "ortos2024", "ortos2025"):
        s, _, body = get(f"https://ortos.dgterritorio.gov.pt/wms/{name}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities", 60)
        layers = []
        if s == 200:
            import re
            layers = re.findall(r"<Name>([^<]+)</Name>", body.decode("utf-8", "replace"))[:8]
        print(f"DGT {name}:", s, layers)
    s, _, body = get("https://ortos.dgterritorio.gov.pt/", 60)
    print("DGT index", s)
    if s == 200:
        import re
        print(sorted(set(re.findall(r"wms/([a-zA-Z0-9_]+)", body.decode("utf-8", "replace")))))


def mts():
    section("METRO SUL DO TEJO WEBSITE (frequencies)")
    import re
    seen = set()
    queue = ["https://www.mts.pt/", "https://mts.pt/"]
    while queue and len(seen) < 25:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        status, ctype, body = get(url, 40)
        print(f"\n--- {url} -> {status} {ctype} {len(body)} bytes")
        if status != 200 or "html" not in ctype:
            continue
        html = body.decode("utf-8", "replace")
        for href in re.findall(r'href="([^"#]+)"', html):
            full = href if href.startswith("http") else "https://www.mts.pt" + ("" if href.startswith("/") else "/") + href
            if "mts.pt" in full and re.search(r"hor|freq|linha|rede|servi|pdf|tarif", full, re.I) and full not in seen:
                queue.append(full)
        text = re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text)
        for m in re.finditer(r"(.{0,160}(?:minutos|frequ|intervalo|\b\d{1,2}h\d{2}\b|\b\d{1,2}:\d{2}\b).{0,160})", text, re.I):
            print("  >", m.group(1).strip())
    print("visited:", sorted(seen))


def mts_form():
    section("MTS TIMETABLE FORM")
    import re
    status, _, body = get("https://www.mts.pt/horarios/", 40)
    html = body.decode("utf-8", "replace")
    for form in re.findall(r"<form.*?</form>", html, re.S | re.I):
        print("\nFORM:", re.sub(r"\s+", " ", form)[:3000])
    for tag in re.findall(r"<(?:table|ul)[^>]*class=\"[^\"]*(?:hor|result|time)[^\"]*\".*?</(?:table|ul)>", html, re.S | re.I)[:3]:
        print("\nRESULT BLOCK:", re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " | ", tag))[:3000])
    idx = html.find("Resultados da Pesquisa")
    print("\nAROUND RESULTS:", re.sub(r"\s+", " ", html[idx - 500: idx + 6000]))
    for src in re.findall(r'<script[^>]+src="([^"]+)"', html):
        if "mts" in src and ("hor" in src or "main" in src or "app" in src or "custom" in src):
            print("script:", src)
    for m in re.findall(r"(?:ajax|admin-ajax|action)[^\n]{0,200}", html)[:20]:
        print("ajax:", m)


def mts_js():
    section("MTS main.js (timetable calls)")
    import re
    status, _, body = get("https://www.mts.pt/wp-content/themes/mts/js/main.js?ver=20261025", 40)
    js = body.decode("utf-8", "replace")
    print("status", status, len(js), "chars")
    for kw in ("ajax", "url", "line", "stations", "season", "day_type", "timetable", "horario", "fetch(", "$.get", "$.post", "action"):
        for m in re.finditer(re.escape(kw), js):
            a = max(0, m.start() - 300)
            print(f"\n[{kw}@{m.start()}]", re.sub(r"\s+", " ", js[a:m.start() + 500]))
            break
    i = js.find("searchForm")
    print("\nAROUND searchForm:", js[max(0, i - 2000): i + 6000] if i >= 0 else "not found")


def post(url, params):
    import urllib.parse
    req = urllib.request.Request(url, data=urllib.parse.urlencode(params).encode(),
                                 headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded",
                                          "X-Requested-With": "XMLHttpRequest"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:  # noqa: BLE001
        return None, str(e).encode()


def mts_api2():
    section("MTS timetable API (intranet)")
    import re
    _, _, page = get("https://www.mts.pt/horarios/", 40)
    html = page.decode("utf-8", "replace")
    m = re.search(r'"apiUrl"\s*:\s*"([^"]+)"', html)
    api = (m.group(1).replace("\\/", "/") if m else "https://intranet.mts.pt/api/")
    print("api:", api, "(from page)" if m else "(fallback)")
    st, _, b = get(api + "lines")
    print("lines GET", st, b[:800])
    if st != 200:
        st, b = post(api + "lines", {})
        print("lines POST", st, b[:800])
    lines = json.loads(b)["data"]
    for ln in lines:
        st, b = post(api + "stations", {"line_id": ln["id"]})
        print(f"\nstations line {ln['id']} {ln.get('name')}:", st, b[:1500])
    ln = lines[0]["id"]
    st, b = post(api + "stations", {"line_id": ln})
    station = json.loads(b)[0]["id"]
    for day in (1, 2, 3):
        st, b = post(api + "search", {"line": ln, "stations": station, "day_type": day, "season": 2})
        print(f"\nsearch line {ln} station {station} day {day}:", st, len(b), "bytes")
        try:
            d = json.loads(b)["data"]
            print(" keys:", list(d.keys()))
            print(" stations:", json.dumps(d.get("stations"), ensure_ascii=False)[:1500])
            print(" times count:", len(d.get("times", [])), "first:", json.dumps(d.get("times", [])[:5]), "last:", json.dumps(d.get("times", [])[-3:]))
        except Exception as e:  # noqa: BLE001
            print(" not json", e, b[:800])


def mts_api():
    section("MTS timetable API")
    import re
    import urllib.parse
    _, _, body = get("https://www.mts.pt/wp-content/themes/mts/js/main.js?ver=20261025", 40)
    js = body.decode("utf-8", "replace")
    _, _, page = get("https://www.mts.pt/horarios/", 40)
    html = page.decode("utf-8", "replace")
    for name in ("function call", "function onLineChange", "function onSearchResult", "apiURL"):
        i = js.find(name)
        print(f"\n[{name}]", re.sub(r"\s+", " ", js[i:i + 1800]) if i >= 0 else "not in js")
    m = re.search(r"apiURL\s*=\s*['\"]([^'\"]+)", js) or re.search(r"apiURL['\"]?\s*[:=]\s*['\"]([^'\"]+)", html)
    api = m.group(1) if m else None
    print("\napiURL:", api)
    if not api:
        for mm in re.finditer(r"apiURL", html):
            print("html apiURL ctx:", html[mm.start() - 200: mm.start() + 200])
        return
    api = api.replace("\\/", "/")
    status, ctype, b = get(api + "lines")
    print("\nlines", status, ctype, b[:1500])
    try:
        lines = json.loads(b)["data"]
    except Exception:  # noqa: BLE001
        return
    for ln in lines:
        for path in (f"stations?line={ln['id']}", f"stations/{ln['id']}", f"lines/{ln['id']}/stations"):
            st, ct, bb = get(api + path)
            print(f"\n{path}", st, bb[:1200])
            if st == 200:
                break
    first = lines[0]["id"]
    st, ct, bb = get(api + f"stations?line={first}")
    try:
        station = json.loads(bb)["data"][0]["id"]
    except Exception:  # noqa: BLE001
        station = 1
    q = {"line": first, "stations": station, "day_type": 1, "season": 2}
    st, ct, bb = get(api + "search?" + urllib.parse.urlencode(q))
    print("\nsearch GET", st, ct, bb[:4000])
    req = urllib.request.Request(api + "search", data=urllib.parse.urlencode(q).encode(),
                                 headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            print("\nsearch POST", r.status, r.read()[:4000])
    except Exception as e:  # noqa: BLE001
        print("search POST failed", e)


def openfreemap():
    section("OPENFREEMAP")
    st, ct, b = get("https://tiles.openfreemap.org/planet")
    print("tilejson", st, ct)
    if st == 200:
        tj = json.loads(b)
        print("tiles:", tj.get("tiles"), "minzoom", tj.get("minzoom"), "maxzoom", tj.get("maxzoom"))
        for layer in tj.get("vector_layers", []):
            if layer.get("id") in ("poi", "building"):
                print(layer.get("id"), layer.get("minzoom"), layer.get("maxzoom"), json.dumps(layer.get("fields"))[:1500])
        print("attribution:", tj.get("attribution"))


def osrm():
    """Whether the FOSSGIS car server gives speed limits and lanes."""
    section("OSRM maxspeed + lanes")
    base = "https://routing.openstreetmap.de/routed-car/route/v1/driving/"
    # Almada (Lazarim) -> Lisboa (Marquês), over the 25 de Abril bridge and the A2.
    path = "-9.2017,38.6480;-9.1500,38.7253"
    for extra in ("annotations=maxspeed", "annotations=speed", ""):
        url = f"{base}{path}?overview=full&geometries=geojson&steps=true&alternatives=3" + (f"&{extra}" if extra else "")
        status, _, body = get(url)
        data = json.loads(body)
        print("params:", extra or "(none)", "status", status, "code", data.get("code"), data.get("message"))
        for r in data.get("routes", [])[:1]:
            n = len(r["geometry"]["coordinates"])
            ms = [x for leg in r["legs"] for x in (leg.get("annotation") or {}).get("maxspeed", [])]
            print("  points", n, "segments", n - 1, "maxspeed entries", len(ms))
            known = [m for m in ms if "speed" in m]
            print("  known", len(known), "sample", json.dumps(ms[:3]), json.dumps(known[:5]))
            steps = [st for leg in r["legs"] for st in leg["steps"]]
            withlanes = [st for st in steps if (st.get("intersections") or [{}])[0].get("lanes")]
            print("  steps", len(steps), "steps with lanes at manoeuvre", len(withlanes))
            for st in withlanes[:4]:
                print("   ", st["maneuver"].get("type"), st["maneuver"].get("modifier"), st.get("name"),
                      json.dumps(st["intersections"][0]["lanes"]))


def stops():
    """Stops the transport map shows (from OSM) but the app does not draw."""
    section("STOPS")
    status, _, body = get(f"{CARRIS}/stops")
    print("status", status, "bytes", len(body))
    data = json.loads(body)
    print("count", len(data), "fields", sorted(data[0].keys()) if data else None)
    by_id = {str(s.get("id")): s for s in data}
    for sid in ("020657", "020707", "020555"):
        s = by_id.get(sid)
        print(sid, "->", json.dumps(s, ensure_ascii=False)[:600] if s else "MISSING")
    # Everything within 400 m of the Lazarim roundabout.
    import math
    lat0, lon0 = 38.6585, -9.1700
    for ref in ("020555",):
        if ref in by_id:
            lat0, lon0 = float(by_id[ref]["lat"]), float(by_id[ref]["lon"])
    for s in data:
        try:
            dy = (float(s["lat"]) - lat0) * 111320
            dx = (float(s["lon"]) - lon0) * 111320 * math.cos(math.radians(lat0))
        except (KeyError, TypeError, ValueError):
            continue
        d = math.hypot(dx, dy)
        if d < 400:
            print(f"{d:5.0f} m", s.get("id"), s.get("long_name"), s.get("lat"), s.get("lon"),
                  "lines", s.get("line_ids"), "status", s.get("operational_status"))


if __name__ == "__main__":
    import sys
    steps = (arrivals, vehicles, light_rail, satellite, mts)
    if len(sys.argv) > 1:
        steps = [globals()[n] for n in sys.argv[1:]]
    for step in steps:
        try:
            step()
        except Exception as e:  # noqa: BLE001
            print("FAILED", step.__name__, e)
