#!/usr/bin/env python3
"""
Converte GTFS estático num ficheiro compacto de horários, para a aplicação usar.

## Porquê

Os autocarros da Área Metropolitana de Lisboa têm uma API aberta com tempo real,
e é isso que a aplicação usa. O comboio, o metro e o barco não têm nada disso —
o que têm é GTFS estático: um ZIP com o horário todo, publicado de vez em quando.

Um GTFS não se pode usar diretamente num telemóvel. O `stop_times.txt` da CP tem
centenas de milhares de linhas, e a aplicação teria de o ler inteiro para
responder "a que horas passa o próximo aqui". Por isso converte-se aqui, uma vez,
num formato que responde a essa pergunta de imediato.

É o mesmo padrão dos mapas offline: o trabalho pesado é feito no GitHub Actions,
o resultado vai para uma Release, e a aplicação descarrega um ficheiro pequeno.

## O que se descarta, e porquê

- **Fora da janela de dias.** Um GTFS traz meses de calendário; guardam-se só os
  próximos `--dias` (60 por omissão). Cortar o resto tira a maior parte do peso e
  não tira nada de útil: quem quer saber a que horas passa o comboio daqui a três
  meses vai ao sítio do operador.
- **Os segundos.** Comboios andam ao minuto. Guardar segundos era mais um dígito
  por cada paragem de cada viagem, para nada.
- **As plataformas.** O GTFS separa a estação das linhas dela; junta-se tudo na
  estação, que é o que interessa a quem espera.

## O formato

Ver `src/types/schedule.ts`, do lado da aplicação, que descreve o mesmo com tipos.
As chaves são curtas de propósito: repetem-se milhares de vezes no ficheiro.

Só precisa da biblioteca padrão do Python — não há nada a instalar.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import date, timedelta
from pathlib import Path

USER_AGENT = "PalmMap/1.0 (projeto pessoal; https://github.com/choso08/PalmMap)"

# Pela ordem em que o GTFS os escreve em calendar.txt.
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


# --- Descarregar --------------------------------------------------------------


def fetch(url: str, timeout: int = 180) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def download_feed(urls: list[str]) -> tuple[str, zipfile.ZipFile]:
    """
    O primeiro endereço que devolva um ZIP com cara de GTFS.

    Um endereço que responda mas devolva outra coisa — uma página de erro, um
    redireccionamento para o sítio do operador — não conta como bom. Já aconteceu
    o suficiente para valer a pena confirmar em vez de assumir.
    """
    if not urls:
        raise RuntimeError("Sem endereços para tentar.")

    problemas = []
    for url in urls:
        try:
            log(f"  A tentar {url}")
            dados = fetch(url)
            arquivo = zipfile.ZipFile(io.BytesIO(dados))
            nomes = set(arquivo.namelist())
            if "stops.txt" not in nomes or "stop_times.txt" not in nomes:
                raise RuntimeError(f"ZIP sem cara de GTFS (tem: {sorted(nomes)[:6]})")
            log(f"  OK — {len(dados) / 1048576:.1f} MB")
            return url, arquivo
        except (urllib.error.URLError, zipfile.BadZipFile, RuntimeError, OSError) as erro:
            log(f"  Não serve: {erro}")
            problemas.append(f"{url}: {erro}")

    raise RuntimeError("Nenhum endereço serviu.\n    " + "\n    ".join(problemas))


# --- Ler o GTFS ----------------------------------------------------------------


def read_table(archive: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    """Uma tabela do GTFS. Devolve lista vazia se o ficheiro não existir."""
    if name not in archive.namelist():
        return []
    with archive.open(name) as bruto:
        # utf-8-sig: muitos GTFS trazem BOM, e sem isto a primeira coluna fica
        # com um caractere invisível colado ao nome e nunca mais é encontrada.
        texto = io.TextIOWrapper(bruto, encoding="utf-8-sig", newline="")
        return list(csv.DictReader(texto))


def parse_minutes(value: str) -> int | None:
    """
    `HH:MM:SS` em minutos desde a meia-noite do dia de serviço.

    **As horas do GTFS podem passar das 24.** `25:10:00` é a uma e dez da manhã
    seguinte, ainda a contar como serviço do dia anterior — e é assim que fica
    guardado, com 1510 minutos. Do lado da aplicação isso é tratado, não corrigido.
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
    Em que dias da janela corre cada serviço.

    Devolve a lista de datas mesmo, em vez da máscara de dias da semana com as
    excepções à parte. É maior — umas dezenas de kilobytes — e vale bem a pena: a
    aplicação passa a responder "corre hoje?" com uma procura numa lista, em vez
    de ter de repetir aqui a aritmética dos feriados. Este género de conta feita
    duas vezes acaba sempre por divergir numa delas.
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
            # weekday(): 0 = segunda, que é a ordem do GTFS.
            if semana[date(int(data[:4]), int(data[4:6]), int(data[6:8])).weekday()]:
                corre.add(data)
        dias[service] = corre

    # As excepções mandam sobre o calendário: um feriado tira o serviço de um dia
    # em que a semana dizia que corria, e um reforço acrescenta-o a um dia em que
    # não corria. Há feeds que só têm isto e nem calendar.txt trazem.
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
    A estação a que uma paragem pertence.

    O GTFS separa a estação das plataformas dela, e é a plataforma que aparece nos
    horários. Quem espera pelo comboio quer saber a hora em "Pragal", não em
    "Pragal — plataforma 2".
    """
    linha = stops.get(stop_id)
    if not linha:
        return stop_id
    pai = (linha.get("parent_station") or "").strip()
    return pai if pai and pai in stops else stop_id


def build(feed: dict, janela: list[str]) -> tuple[dict, str]:
    """Converte um GTFS já descarregado no ficheiro compacto."""
    url, archive = download_feed(feed.get("urls") or [])

    stops_raw = {
        linha["stop_id"]: linha
        for linha in read_table(archive, "stops.txt")
        if linha.get("stop_id")
    }
    dias_por_servico = service_days(archive, janela)
    log(f"  {len(dias_por_servico)} serviço(s) com dias dentro da janela")

    routes = {
        linha["route_id"]: linha
        for linha in read_table(archive, "routes.txt")
        if linha.get("route_id")
    }

    # As viagens que interessam: as de um serviço que corre na janela.
    viagens: dict[str, dict[str, str]] = {}
    for linha in read_table(archive, "trips.txt"):
        trip = linha.get("trip_id")
        if trip and linha.get("service_id") in dias_por_servico:
            viagens[trip] = linha
    log(f"  {len(viagens)} viagem(ns) na janela")

    if not viagens:
        raise RuntimeError("Nenhuma viagem corre nos próximos dias. Feed fora de validade?")

    # As passagens, agrupadas por viagem. É a tabela grande — na CP são centenas
    # de milhares de linhas — por isso guarda-se só o indispensável.
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

    # Índices: cada estação, letreiro e padrão de paragens aparece uma vez só, e
    # as viagens referem-se a eles por número. É onde está a maior parte da
    # poupança — numa linha de comboio, centenas de viagens partilham o mesmo
    # punhado de padrões.
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
                # Cinco casas decimais são pouco mais de um metro. Mais do que
                # isso é ruído a ocupar espaço em milhares de linhas.
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
            # Uma viagem que pare duas vezes seguidas na mesma estação (acontece
            # com plataformas juntas depois de as colapsarmos) fica com uma.
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

        # A primeira hora é absoluta, as seguintes são o que se acrescenta à
        # anterior. Ficam quase todas com um ou dois dígitos em vez de quatro.
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
        raise RuntimeError("Nenhuma viagem utilizável depois de converter.")

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
        f"  {len(lista_stops)} estações, {len(lista_routes)} linhas, "
        f"{len(lista_patterns)} padrões, {len(trips_out)} viagens"
    )

    resultado["bbox"] = [
        round(min(lons), 4),
        round(min(lats), 4),
        round(max(lons), 4),
        round(max(lats), 4),
    ]
    return resultado, url


# --- Descobrir endereços -------------------------------------------------------


def probe(url: str) -> None:
    """Bate a uma porta e diz o que respondeu, sem tirar conclusões."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as resposta:
            tipo = resposta.headers.get("Content-Type", "?")
            corpo = resposta.read(300)
            log(f"  {resposta.status}  {tipo}  {url}")
            log(f"        {corpo[:200]!r}")
    except urllib.error.HTTPError as erro:
        # 401 e 403 são a resposta que interessa distinguir: querem dizer que a
        # porta existe mas está fechada, o que é diferente de não existir.
        log(f"  {erro.code}  {erro.reason}  {url}")
    except Exception as erro:  # noqa: BLE001
        log(f"  ---  {erro}  {url}")


def probe_tml() -> None:
    """
    Bate à porta da API da TML e diz o que responde.

    **Porque é que isto existe.** A Transportes Metropolitanos de Lisboa agrega
    tempo real de oito operadores — CP, Fertagus, Metro de Lisboa,
    Transtejo/Soflusa e os autocarros — e diz publicamente que a maior parte dos
    dados é aberta e sem tratamento especial: "toda a gente tem acesso à mesma
    informação ao mesmo tempo". Também diz que **alguns** dados exigem
    autenticação, sem especificar quais.

    De onde este código foi escrito não se chega lá, e adivinhar os endereços
    seria repetir o erro que já está registado no CLAUDE.md — os nomes dos campos
    da Carris foram todos adivinhados mal à primeira. Por isso em vez de escrever
    código contra endereços supostos, pergunta-se-lhes daqui, de um sítio que tem
    Internet, e escreve-se o que eles responderem.

    O que se sabe do formato: GTFS estático para o planeado, e GTFS-RT para o
    tempo real — alertas em JSON e em Protobuf, posições dos veículos em
    Protobuf. **O Protobuf não é de graça neste projeto:** obrigava a uma
    biblioteca nova só para o descodificar. Os alertas em JSON não.
    """
    base = "https://go.tmlmobilidade.pt/hub/api"
    log("\n=== API da TML (tempo real de vários operadores) ===")
    log("A documentação diz que a base é " + base + "/:version/:path\n")

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

    # Os da Carris são o termo de comparação: sabe-se que funcionam sem chave.
    log("\n--- Para comparar, os da Carris Metropolitana ---")
    for url in [
        "https://api.carrismetropolitana.pt/v2/alerts",
        "https://api.carrismetropolitana.pt/gtfs",
    ]:
        probe(url)


# As palavras por que se procura. Uma só não chega: nem toda a gente escreve
# "GTFS" no título, e foi assim que a CP e o Fertagus não apareceram à primeira.
CONSULTAS = [
    "GTFS",
    "comboios",
    "CP Comboios de Portugal",
    "Fertagus",
    "Transtejo Soflusa",
    "horários transportes públicos",
    "transportes ferroviários",
]


def discover() -> None:
    """
    Procura GTFS no dados.gov.pt e imprime o que encontra.

    Existe porque os endereços do catálogo não puderam ser confirmados de onde
    este código foi escrito. Correr isto no GitHub Actions, que tem Internet, e
    copiar para o `transit-feeds.json` os que responderem.

    **Prefere-se sempre o endereço estável.** O dados.gov.pt dá dois endereços
    para o mesmo ficheiro: um com a data lá dentro, que muda a cada publicação, e
    um `/datasets/r/<id>` que aponta sempre para a versão mais recente. É este
    que vai para o catálogo — senão o horário deixava de descarregar assim que o
    operador publicasse a versão seguinte.
    """
    vistos: set[str] = set()

    for consulta in CONSULTAS:
        url = (
            "https://dados.gov.pt/api/1/datasets/"
            f"?q={urllib.parse.quote(consulta)}&page_size=30"
        )
        log(f"\n=== A pesquisar: {consulta} ===")
        try:
            dados = json.loads(fetch(url, timeout=60))
        except Exception as erro:  # noqa: BLE001 — aqui qualquer falha é só "não deu"
            log(f"  Não deu: {erro}")
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
                    log(f"          estável: {estavel}")
            log("")


# --- Entrada -------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalogo", default="transit-feeds.json")
    parser.add_argument("--saida", default="horarios")
    parser.add_argument(
        "--ids",
        default="",
        help='Ids separados por espaços. "todos" faz o catálogo inteiro.',
    )
    parser.add_argument("--dias", type=int, default=60)
    parser.add_argument(
        "--descobrir",
        action="store_true",
        help="Só procura endereços no dados.gov.pt e sai.",
    )
    args = parser.parse_args()

    if args.descobrir:
        discover()
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
            if not feed.get("urls"):
                # Sem endereço não é falha da corrida, é uma fonte que ainda não
                # se encontrou. Diz-se e passa-se à frente, sem manchar o resto.
                log(f"  SEM ENDEREÇO — {feed.get('notas') or 'nada publicado.'}")
                log("::endgroup::")
                continue

            resultado, url = build(feed, janela)
            destino = pasta / f"{feed['id']}.json"
            # separators sem espaços: são milhares de vírgulas, e cada uma
            # poupada é um byte a menos a descarregar num telemóvel.
            destino.write_text(
                json.dumps(resultado, ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            bytes_ = destino.stat().st_size
            log(f"  {destino}: {bytes_ / 1024:.0f} KB  (de {url})")

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
                    # Só se escreve quando é false, para a lista não ficar cheia
                    # de campos que dizem o que já é a regra.
                    **({} if feed.get("naApp", True) else {"naApp": False}),
                }
            )
        except Exception as erro:  # noqa: BLE001 — um operador não leva os outros atrás
            log(f"  FALHOU: {erro}")
            falhados.append(f"{feed['id']} ({erro})")
        finally:
            log("::endgroup::")

    (pasta / "lote.json").write_text(
        json.dumps({"horarios": entradas}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    if falhados:
        log("::warning::Operadores que não saíram: " + "; ".join(falhados))

    if not entradas:
        log("Nenhum operador gerado.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
