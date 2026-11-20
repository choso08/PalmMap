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
import gzip
import math
import os
import re
import urllib.parse
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
        with urllib.request.urlopen(req, timeout=90) as r:
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


def limits():
    """The app's speed-limit query (speedLimits.ts) against real Overpass."""
    import math
    import urllib.parse
    section("SPEED LIMITS via Overpass")
    url = ("https://routing.openstreetmap.de/routed-car/route/v1/driving/"
           "-9.2017,38.6480;-9.1500,38.7253?overview=full&geometries=geojson")
    _, _, body = get(url)
    pts = [(lat, lon) for lon, lat in json.loads(body)["routes"][0]["geometry"]["coordinates"]]

    def dist(a, b):
        k = math.cos(math.radians(a[0]))
        return math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * k)

    thin, since = [pts[0]], 0
    for i in range(1, len(pts)):
        since += dist(pts[i - 1], pts[i])
        if since >= 100:
            thin.append(pts[i]); since = 0
    thin.append(pts[-1])
    line = ",".join(f"{a:.5f},{b:.5f}" for a, b in thin)
    variants = {
        "health": '[out:json][timeout:10];node(38.70,-9.15,38.701,-9.149);out ids 1;',
        "way-around": f'[out:json][timeout:25];\nway(around:25,{line})["highway"]["maxspeed"];\nout tags geom;',
        "node-around-bn": f'[out:json][timeout:25];\nnode(around:10,{line});\nway(bn)["highway"]["maxspeed"];\nout tags geom;',
    }
    print("route points", len(pts), "thinned", len(thin))
    for name, q in variants.items():
      for server in ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"):
        print("--", name)
        data = urllib.parse.urlencode({"data": q}).encode()
        req = urllib.request.Request(server, data=data, headers={"User-Agent": UA})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                res = json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            print(server, "FAILED", e); continue
        ways = res.get("elements", [])
        print(server, "ways", len(ways), "remark", res.get("remark"), f"{time.time() - t0:.1f}s")
        segs = []
        for w in ways:
            g = w.get("geometry") or []
            for i in range(1, len(g)):
                segs.append(((g[i-1]["lat"], g[i-1]["lon"]), (g[i]["lat"], g[i]["lon"]), w["tags"].get("maxspeed"), w["tags"].get("name") or w["tags"].get("ref")))
        def seg_d(p, a, b):
            k = math.cos(math.radians(p[0]))
            ax, ay = (a[1]-p[1])*k, a[0]-p[0]; bx, by = (b[1]-p[1])*k, b[0]-p[0]
            dx, dy = bx-ax, by-ay; L = dx*dx+dy*dy
            t = max(0, min(1, -(ax*dx+ay*dy)/L)) if L else 0
            return math.hypot(ax+t*dx, ay+t*dy)*111320
        matched, last = 0, None
        for i, p in enumerate(pts):
            best, lim = 25, None
            for a, b, m, n in segs:
                if abs(a[0]-p[0]) > 0.002 and abs(b[0]-p[0]) > 0.002:
                    continue
                d = seg_d(p, a, b)
                if d < best:
                    best, lim = d, (m, n)
            if lim:
                matched += 1
                if lim != last:
                    print(f"   from point {i}: {lim[0]} on {lim[1]}")
                    last = lim
        print("  matched", matched, "of", len(pts))
        break



def pois():
    """What the odd map pins really are (TB.442, ALM-00112, Egas Moniz)."""
    import urllib.parse
    section("ODD POIS via Overpass")
    q = """[out:json][timeout:60];
(
  nwr["name"~"^TB[.]"](38.69,-9.24,38.73,-9.19);
  nwr["amenity"="charging_station"](38.64,-9.24,38.70,-9.14);
  nwr["name"~"Egas Moniz"](38.64,-9.24,38.70,-9.14);
);
out tags center 80;"""
    for base in ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"):
        try:
            st, body = post(base, {"data": q})
        except Exception as e:  # noqa: BLE001
            print(base, "failed", e)
            continue
        print(base, st)
        if st != 200:
            continue
        for el in json.loads(body).get("elements", []):
            print(el["type"], el["id"], json.dumps(el.get("tags", {}), ensure_ascii=False))
        break


def ortos():
    """Which DGT orthophoto services exist, and which is the sharpest."""
    import re as _re
    section("DGT ORTHOPHOTOS")
    for name in ("ortosat2023", "ortos2018", "ortos2021", "ortos2022", "ortos2023",
                 "ortos2024", "ortos2025", "ortosat2024", "ortosat2025", "ortos"):
        url = f"https://ortos.dgterritorio.gov.pt/wms/{name}?SERVICE=WMS&REQUEST=GetCapabilities"
        try:
            st, ct, b = get(url, timeout=40)
        except Exception as e:  # noqa: BLE001
            print(name, "failed", e)
            continue
        text = b.decode("utf-8", "replace") if isinstance(b, bytes) else str(b)
        layers = _re.findall(r"<Layer[^>]*>\s*<Name>([^<]+)</Name>\s*<Title>([^<]*)</Title>", text)
        abstract = _re.findall(r"<Abstract>([^<]{0,300})</Abstract>", text)
        print(name, st, ct, "layers:", layers[:8])
        if abstract:
            print("   abstract:", abstract[0][:300])
    st, ct, b = get("https://ortos.dgterritorio.gov.pt/", timeout=40)
    text = b.decode("utf-8", "replace") if isinstance(b, bytes) else str(b)
    print("index", st, sorted(set(_re.findall(r"/wms/([a-zA-Z0-9_-]+)", text)))[:40])


def ortos2():
    """DGT aerial orthophotos (sharper than the 2023 satellite), on other hosts."""
    import re as _re
    section("DGT AERIAL ORTHOPHOTOS")
    hosts = ["https://cartografia.dgterritorio.gov.pt", "https://geo2.dgterritorio.gov.pt",
             "https://ortos.dgterritorio.gov.pt", "https://si.dgterritorio.gov.pt"]
    paths = ["/wms/ortos2018", "/wms/ortos2021", "/wms/ortos", "/ortos2018/service",
             "/ortos2021/service", "/wms-inspire/ortos2018", "/wmts/ortos2018",
             "/geoserver/ows", "/ortos/wms"]
    for h in hosts:
        for pth in paths:
            url = f"{h}{pth}?SERVICE=WMS&REQUEST=GetCapabilities"
            st, ct, b = get(url, timeout=25)
            text = b.decode("utf-8", "replace") if isinstance(b, bytes) else str(b)
            names = _re.findall(r"<Name>([^<]+)</Name>", text)
            if st == 200 and names:
                print("FOUND", url, names[:25])
                ab = _re.findall(r"<Abstract>([^<]{0,200})</Abstract>", text)
                if ab:
                    print("   ", ab[:3])
            else:
                print(st, url)

def gtfs_feeds():
    """Which GTFS feeds for Lisbon operators answer, and what is inside (agencies, counts)."""
    import io
    import zipfile

    feeds = {
        "tml-plans": "https://go.tmlmobilidade.pt/hub/api/v1/plans/gtfs",
        "carris-lisboa": "https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS",
        "ttsl": "https://api.transtejo.pt/files/GTFS.zip",
        "fertagus-mdb": "https://storage.googleapis.com/storage/v1/b/mdb-latest/o/pt-lisboa-fertagus-gtfs-1034.zip?alt=media",
        "fertagus-transporlis": "http://www.transporlis.pt/Portals/0/OpenData/gtfs/zip/13/gtfs_13.zip",
        "fertagus-site": "https://www.fertagus.pt/gtfs/gtfs.zip",
    }
    for name, url in feeds.items():
        section(name)
        status, ctype, body = get(url, timeout=180)
        print(status, ctype, len(body), "bytes")
        if status != 200:
            print(body[:300])
            continue
        if body[:2] != b"PK":
            print("not a zip:", body[:300])
            continue
        z = zipfile.ZipFile(io.BytesIO(body))
        print("files:", z.namelist())
        for f in ("agency.txt", "feed_info.txt", "calendar.txt"):
            if f in z.namelist():
                print("--", f)
                print(z.read(f).decode("utf-8-sig", "replace")[:1200])
        if "calendar_dates.txt" in z.namelist():
            lines = z.read("calendar_dates.txt").decode("utf-8-sig", "replace").splitlines()
            dates = sorted({l.split(",")[1] for l in lines[1:] if l.count(",") >= 2})
            print("calendar_dates:", dates[:1], "…", dates[-1:])
        if "routes.txt" in z.namelist():
            r = z.read("routes.txt").decode("utf-8-sig", "replace").splitlines()
            print("routes:", len(r) - 1, r[:6])


def bike_way():
    """OSM tags of Rua 28 de Setembro (Trafaria), which the bike route took."""
    import urllib.parse
    q = """[out:json][timeout:60];
    way["name"~"28 de Setembro"](38.655,-9.27,38.69,-9.20);
    out tags center;"""
    for base in ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"):
        status, _, body = get(base + "?data=" + urllib.parse.quote(q), timeout=90)
        print(base, status)
        if status == 200:
            for el in json.loads(body).get("elements", []):
                print(el["id"], el.get("center"), json.dumps(el.get("tags"), ensure_ascii=False))
            break


def valhalla_bike():
    """FOSSGIS Valhalla bicycle types on the Trafaria route (Rua 28 de Setembro?)."""
    import urllib.parse
    start = {"lat": 38.6655, "lon": -9.1985}   # east of Trafaria, on EN 377-1
    end = {"lat": 38.6690, "lon": -9.2620}     # Rua do Parque, Cova do Vapor
    for btype, bad in (("Road", 1.0), ("Hybrid", 0.25), ("Mountain", 0.0)):
        body = {
            "locations": [start, end],
            "costing": "bicycle",
            "costing_options": {"bicycle": {"bicycle_type": btype, "avoid_bad_surfaces": bad}},
            "language": "pt-PT",
            "units": "kilometers",
            "alternates": 1,
        }
        url = "https://valhalla1.openstreetmap.de/route?json=" + urllib.parse.quote(json.dumps(body))
        status, ctype, raw = get(url, timeout=60)
        section(f"{btype} (avoid_bad_surfaces={bad}): {status} {ctype}")
        if status != 200:
            print(raw[:400])
            continue
        data = json.loads(raw)
        trip = data["trip"]
        print("summary", trip["summary"]["length"], "km", round(trip["summary"]["time"] / 60), "min")
        for m in trip["legs"][0]["maneuvers"]:
            print(" ", m.get("type"), m.get("length"), m.get("street_names"), "|", m.get("instruction"))
        print("keys of a maneuver:", sorted(trip["legs"][0]["maneuvers"][0].keys()))
        print("alternates:", len(data.get("alternates", [])))
        time.sleep(1.5)


def valhalla_raw():
    """One whole Valhalla bicycle answer, as the app asks for it, to replay offline."""
    import urllib.parse
    body = {
        "locations": [{"lat": 38.6655, "lon": -9.1985}, {"lat": 38.6690, "lon": -9.2620}],
        "costing": "bicycle",
        "costing_options": {"bicycle": {"bicycle_type": "Mountain", "avoid_bad_surfaces": 0, "use_roads": 0.25}},
        "units": "kilometers",
        "directions_type": "maneuvers",
        "alternates": 2,
    }
    url = "https://valhalla1.openstreetmap.de/route?json=" + urllib.parse.quote(json.dumps(body))
    status, _, raw = get(url, timeout=60)
    print(status)
    print("RAW-BEGIN")
    print(raw.decode("utf-8"))
    print("RAW-END")


def dup_parking():
    """Why "Parque da Biblioteca" shows twice: every OSM object with that name."""
    import urllib.parse
    q = """[out:json][timeout:60];
    nwr["name"="Parque da Biblioteca"](38.55,-9.35,38.80,-9.05);
    out tags center;"""
    status, _, body = get("https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote(q), timeout=90)
    print(status)
    if status == 200:
        for el in json.loads(body).get("elements", []):
            print(el["type"], el["id"], el.get("center") or (el.get("lat"), el.get("lon")), json.dumps(el.get("tags"), ensure_ascii=False))


def tile_dup():
    """The OpenFreeMap tile(s) around Parque da Biblioteca: how many poi features carry that name."""
    import math
    import subprocess
    import sys
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "mapbox-vector-tile"], check=False)
    import mapbox_vector_tile  # noqa: E402

    status, _, body = get("https://tiles.openfreemap.org/planet", timeout=60)
    tj = json.loads(body)
    url = tj["tiles"][0]
    print("tiles:", url, "maxzoom", tj.get("maxzoom"))
    lat, lon = 38.6631576, -9.2056355
    for z in (14,):
        n = 2 ** z
        x = int((lon + 180) / 360 * n)
        y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                u = url.replace("{z}", str(z)).replace("{x}", str(x + dx)).replace("{y}", str(y + dy))
                st, ct, raw = get(u, timeout=60)
                if st != 200:
                    print(u, st)
                    continue
                import gzip
                if raw[:2] == b"\x1f\x8b":
                    raw = gzip.decompress(raw)
                tile = mapbox_vector_tile.decode(raw)
                for layer, data in tile.items():
                    for f in data["features"]:
                        props = f.get("properties", {})
                        if "Biblioteca" in str(props.get("name", "")):
                            print(z, x + dx, y + dy, layer, f["geometry"]["type"], f["geometry"]["coordinates"], props)


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



def pattern():
    """A line's pattern as the app would ask for it after a tap: its stops in order, shape, trips."""
    section("PATTERN")
    _, _, body = get(f"{CARRIS}/stops")
    stops = {s["id"]: s for s in json.loads(body)}
    stop = next(s for s in stops.values() if "CACILHAS" in (s.get("long_name") or "").upper())
    status, _, body = get(f"{CARRIS}/arrivals/by_stop/{stop['id']}")
    data = json.loads(body)
    now = time.time()
    upcoming = sorted(
        (a for a in data if (a.get("estimated_arrival_unix") or a.get("scheduled_arrival_unix") or 0) > now),
        key=lambda a: a.get("estimated_arrival_unix") or a.get("scheduled_arrival_unix") or 0)
    first = upcoming[0]
    print("stop", stop["id"], stop.get("long_name"), "arrival", json.dumps(first, ensure_ascii=False)[:600])
    pid = first["pattern_id"]
    bare = pid.split("]")[-1]
    line = first["line_id"].split("]")[-1]
    print("stop record pattern_ids sample:", (stop.get("pattern_ids") or [])[:5])
    from urllib.parse import quote
    urls = [
        f"{CARRIS}/patterns/{quote(pid)}", f"{CARRIS}/patterns/{bare}",
        f"https://api.carrismetropolitana.pt/patterns/{bare}",
        f"{CARRIS}/lines/{line}", f"{CARRIS}/lines/{quote(first['line_id'])}",
        f"{CARRIS}/routes/{first['route_id'].split(']')[-1]}",
        f"https://go.tmlmobilidade.pt/hub/api/v1/patterns/{quote(pid)}",
    ]
    for url in urls:
        status, ctype, body = get(url)
        print(f"\n--- {url} -> {status} {len(body)} bytes")
        if status != 200 or len(body) < 5:
            print(body[:200])
            continue
        p = json.loads(body)
        if isinstance(p, list):
            print("list of", len(p)); p = p[0] if p else {}
        print("keys:", sorted(p) if isinstance(p, dict) else type(p))
        if not isinstance(p, dict):
            continue
        for k, v in p.items():
            if isinstance(v, list):
                print(f"{k}: list[{len(v)}]", json.dumps(v[:2], ensure_ascii=False)[:1200])
            elif isinstance(v, dict):
                print(f"{k}: dict", json.dumps(v, ensure_ascii=False)[:400])
            else:
                print(f"{k}:", json.dumps(v, ensure_ascii=False)[:200])
    # Does the same trip carry per-stop times? Arrivals at a later stop of the pattern.
    for later in (first.get("stop_sequence", 0) + 3, first.get("stop_sequence", 0) + 8):
        print("later stop_sequence", later)


def fresh_install():
    """Every outside service the app uses, asked as a phone with nothing cached would.

    Reports status, type and size of each; flags what needs a key, answers HTML
    where data is expected, or an image suspiciously small (CARTO's "API KEY
    REQUIRED" stamp only showed on phones without the tiles in cache).
    """
    section("FRESH INSTALL")
    lisbon = (38.7223, -9.1393)
    z, x, y = 14, 7773, 6178  # Lisbon, Baixa
    import math
    def merc(lat, lon):
        return lon * 20037508.34 / 180, math.log(math.tan((90 + lat) * math.pi / 360)) * 20037508.34 / math.pi
    x0, y0 = merc(38.70, -9.15); x1, y1 = merc(38.71, -9.14)
    checks = [
        ("OSM tile (map, dark)", "https://tile.openstreetmap.org/14/7776/6278.png", "image"),
        ("EOX Sentinel-2 2025", "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/12/1569/1944.jpg", "image"),
        ("DGT orthophotos", "https://ortos.dgterritorio.gov.pt/wms/ortosat2023?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
            f"&LAYERS=ortoSat2023-CorVerdadeira&STYLES=&CRS=EPSG:3857&BBOX={x0},{y0},{x1},{y1}"
            "&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg&TRANSPARENT=false", "image"),
        ("OePNVKarte transport", "https://tileserver.memomaps.de/tilegen/14/7776/6278.png", "image"),
        ("OpenFreeMap TileJSON", "https://tiles.openfreemap.org/planet", "json"),
        ("Nominatim search", "https://nominatim.openstreetmap.org/search?q=Rossio%20Lisboa&format=jsonv2&limit=1", "json"),
        ("Nominatim reverse", f"https://nominatim.openstreetmap.org/reverse?lat={lisbon[0]}&lon={lisbon[1]}&format=jsonv2", "json"),
        ("Photon", "https://photon.komoot.io/api/?q=Rossio&limit=1", "json"),
        ("OSRM car", "https://routing.openstreetmap.de/routed-car/route/v1/driving/-9.1393,38.7223;-9.1500,38.7100?overview=false", "json"),
        ("OSRM foot", "https://routing.openstreetmap.de/routed-foot/route/v1/foot/-9.1393,38.7223;-9.1500,38.7100?overview=false", "json"),
        ("OSRM bike", "https://routing.openstreetmap.de/routed-bike/route/v1/bike/-9.1393,38.7223;-9.1500,38.7100?overview=false", "json"),
        ("Valhalla bike", "https://valhalla1.openstreetmap.de/route?json=" + urllib.parse.quote(json.dumps({
            "locations": [{"lat": 38.7223, "lon": -9.1393}, {"lat": 38.71, "lon": -9.15}],
            "costing": "bicycle", "directions_type": "none"})), "json"),
        ("Overpass", "https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote(
            '[out:json][timeout:25];node(around:200,38.7223,-9.1393)[amenity=pharmacy];out 1;'), "json"),
        ("Overpass fallback", "https://overpass.private.coffee/api/interpreter?data=" + urllib.parse.quote(
            '[out:json][timeout:25];node(around:200,38.7223,-9.1393)[amenity=pharmacy];out 1;'), "json"),
        ("Carris vehicles", f"{CARRIS}/vehicles", "json"),
        ("Carris pattern", f"{CARRIS}/patterns/3013_0_2", "json"),
        ("Carris stations", f"{CARRIS}/facilities/subway_stations", "json"),
        ("GitHub releases", "https://api.github.com/repos/choso08/PalmMap/releases?per_page=5", "json"),
        ("Maps manifest", "https://github.com/choso08/PalmMap/releases/download/mapas/mapas.json", "json"),
        ("Timetables manifest", "https://github.com/choso08/PalmMap/releases/download/horarios/horarios.json", "json"),
    ]
    for name, url, kind in checks:
        t0 = time.time()
        status, ctype, body = get(url, timeout=60)
        ms = int((time.time() - t0) * 1000)
        flag = ""
        if status != 200:
            flag = "FAIL"
        elif kind == "image" and not ctype.startswith("image"):
            flag = "NOT AN IMAGE"
        elif kind == "image" and len(body) < 1500:
            flag = "SUSPICIOUSLY SMALL"
        elif kind == "json":
            try:
                json.loads(body)
            except Exception:  # noqa: BLE001
                flag = "NOT JSON"
        low = body[:4000].lower()
        if b"api key" in low or b"apikey" in low or b"token" in low and status in (401, 403):
            flag += " MENTIONS A KEY"
        print(f"{'OK ' if not flag else '!! '}{name:24} {status} {ctype[:28]:28} {len(body):>9} B {ms:>6} ms {flag}")
        if flag:
            print("     ", body[:200])
    # The Carris stop list is the big one: time it on its own.
    t0 = time.time()
    status, _, body = get(f"{CARRIS}/stops", timeout=90)
    print(f"Carris stops: {status} {len(body)} B in {int((time.time() - t0) * 1000)} ms")


def overpass_mirrors():
    """Public Overpass servers (OSM wiki list), asked as the app asks: POST, a small query."""
    section("OVERPASS MIRRORS")
    q = '[out:json][timeout:25];node(around:300,38.7223,-9.1393)[amenity=pharmacy];out 3;'
    for url in (
        "https://overpass-api.de/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        "https://overpass.osm.jp/api/interpreter",
    ):
        for attempt in (1, 2):
            t0 = time.time()
            req = urllib.request.Request(url, data=q.encode(), headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    body = r.read(); status = r.status
            except urllib.error.HTTPError as e:
                body = e.read(); status = e.code
            except Exception as e:  # noqa: BLE001
                body = str(e).encode(); status = None
            n = None
            try:
                n = len(json.loads(body).get("elements", []))
            except Exception:  # noqa: BLE001
                pass
            print(f"{url:58} try {attempt}: {status} {int((time.time()-t0)*1000):>6} ms elements={n}", body[:80] if n is None else "")
            time.sleep(3)


def search400():
    """The author's "Rua eleuterio Teixeira 8" answered 400: the app's exact
    Nominatim request, then variations, then Photon."""
    section("SEARCH 400")
    import urllib.parse as up
    base = "https://nominatim.openstreetmap.org/search?"
    q = "Rua eleuterio Teixeira 8"
    variants = {
        "app": dict(q=q, format="jsonv2", limit=8, addressdetails=0, extratags=1,
                    **{"accept-language": "pt-PT,pt;q=0.9,en;q=0.5"},
                    viewbox="-9.2,38.7,-9.1,38.6", bounded=0),
        "no viewbox": dict(q=q, format="jsonv2", limit=8, addressdetails=0, extratags=1),
        "no extratags": dict(q=q, format="jsonv2", limit=8),
        "plain": dict(q=q, format="jsonv2"),
        "flat viewbox": dict(q=q, format="jsonv2", limit=8, viewbox="-9.2,38.7,-9.1,38.7", bounded=0),
        "point viewbox": dict(q=q, format="jsonv2", limit=8, viewbox="-9.2,38.7,-9.2,38.7", bounded=0),
    }
    for name, params in variants.items():
        st, ct, body = get(base + up.urlencode(params))
        print(name, st, ct, body[:300])
        time.sleep(1.5)
    for extra in ("", "&lang=en", "&lat=38.65&lon=-9.15"):
        st, ct, body = get("https://photon.komoot.io/api/?q=" + up.quote(q) + "&limit=8" + extra)
        print("photon" + extra, st, ct, body[:300])
        time.sleep(1.5)


def granja26():
    """The author's "Rua da granja 26": does Nominatim/Photon find house numbers here?"""
    section("GRANJA 26")
    import urllib.parse as up
    base = "https://nominatim.openstreetmap.org/search?"
    for q, extra in (
        ("Rua da granja 26", dict(viewbox="-9.30,38.72,-9.05,38.55", bounded=0)),
        ("Rua da granja 26", {}),
        ("Rua da Granja 999", {}),
        ("Rua da Granja 7", dict(viewbox="-9.30,38.72,-9.05,38.55", bounded=0)),
        ("Rua da Granja 7, Almada", {}),
    ):
        params = dict(q=q, format="jsonv2", limit=8, addressdetails=1,
                      **{"accept-language": "pt-PT"}, **extra)
        t0 = time.time()
        st, ct, body = get(base + up.urlencode(params), timeout=30)
        print(f"\nnominatim {q!r} {extra} -> {st} in {time.time()-t0:.1f}s")
        try:
            for r in json.loads(body):
                a = r.get("address", {})
                print("  ", r.get("addresstype"), "|", r.get("display_name", "")[:110], "| nº", a.get("house_number"))
        except Exception:  # noqa: BLE001
            print("  ", body[:300])
        time.sleep(1.5)
    for extra in ("", "&lat=38.66&lon=-9.17"):
        st, ct, body = get("https://photon.komoot.io/api/?q=" + up.quote("Rua da granja 7") + "&limit=8" + extra, timeout=30)
        print(f"\nphoton{extra} -> {st}")
        try:
            for f in json.loads(body)["features"]:
                pr = f["properties"]
                print("  ", pr.get("type"), "|", pr.get("name"), pr.get("street"), pr.get("housenumber"), "|", pr.get("city"), pr.get("postcode"))
        except Exception:  # noqa: BLE001
            print("  ", body[:300])
        time.sleep(1.5)


def shapes():
    """A Carris pattern's fields (is there a shape_id?) and the shape service."""
    section("SHAPES")
    st, ct, body = get(f"{CARRIS}/patterns/3034_0_1")
    print("pattern", st, ct, len(body))
    try:
        data = json.loads(body)
        pat = data[0] if isinstance(data, list) else data
        print("keys", sorted(pat.keys()))
        sid = pat.get("shape_id")
        print("shape_id", sid)
        for url in (f"{CARRIS}/shapes/{sid}", f"https://api.carrismetropolitana.pt/shapes/{sid}"):
            st, ct, body = get(url)
            print(url, st, ct, len(body), body[:600])
    except Exception as e:  # noqa: BLE001
        print("ERR", e, body[:300])


def estefania():
    """The author's trip to Estefânia gave no buses: where the origin is, and
    which Carris Metropolitana stops lie near each end."""
    section("ESTEFANIA")
    import math, urllib.parse as up
    def geo(q):
        st, ct, body = get("https://nominatim.openstreetmap.org/search?" + up.urlencode(
            dict(q=q, format="jsonv2", limit=3, countrycodes="pt")))
        time.sleep(1.5)
        try:
            return [(r["display_name"][:90], float(r["lat"]), float(r["lon"])) for r in json.loads(body)]
        except Exception:  # noqa: BLE001
            return []
    for q in ("Rua da Granja, Almada", "Rua da Granja, Lisboa", "Rua da Granja", "Estefânia, Lisboa"):
        print(q, geo(q))
    _, _, body = get(f"{CARRIS}/stops")
    stops = json.loads(body)
    def dist(a, b, c, d):
        k = math.pi / 180
        x = (d - b) * k * math.cos((a + c) / 2 * k)
        return 6371000 * math.hypot(x, (c - a) * k)
    est = (38.7318, -9.1436)
    near = sorted(((dist(est[0], est[1], float(s["lat"]), float(s["lon"])), s) for s in stops), key=lambda x: x[0])[:12]
    for m, s in near:
        print(round(m), s.get("id"), s.get("long_name"), len(s.get("pattern_ids") or []), (s.get("line_ids") or [])[:8])


def photos():
    """Open photo sources a place card could use: Commons by file, Wikidata P18, Panoramax."""
    section("PHOTOS")
    st, ct, body = get("https://www.wikidata.org/wiki/Special:EntityData/Q597.json")
    print("wikidata", st, ct, len(body))
    files = []
    try:
        ent = json.loads(body)["entities"]["Q597"]
        files = [c["mainsnak"]["datavalue"]["value"] for c in ent["claims"].get("P18", [])]
    except Exception as e:  # noqa: BLE001
        print("  parse failed", e)
    print("  P18:", files)
    for f in files[:1]:
        url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(f.replace(" ", "_")) + "?width=640"
        st, ct, body = get(url)
        print("commons FilePath", st, ct, len(body), url)
    st, ct, body = get("https://api.panoramax.xyz/api/search?bbox=-9.142,38.708,-9.136,38.714&limit=2")
    print("panoramax search", st, ct, len(body))
    try:
        feats = json.loads(body).get("features", [])
        for f in feats[:1]:
            print("  id", f.get("id"), "assets", json.dumps(f.get("assets"), ensure_ascii=False)[:600])
            for u in (f"https://api.panoramax.xyz/api/pictures/{f.get('id')}/sd.jpg",
                      f"https://api.panoramax.xyz/api/pictures/{f.get('id')}/thumb.jpg"):
                st, ct, b = get(u)
                print("  ", u, st, ct, len(b))
    except Exception as e:  # noqa: BLE001
        print("  parse failed", e, body[:300])

def entrances():
    """Entrances of a place, the query `entrances.ts` uses (author's photo:
    the walk ended on the far side of Almada Forum)."""
    section("entrances")
    places = ["Almada Forum", "Hospital Garcia de Orta, Almada", "Centro Colombo, Lisboa",
              "Mosteiro dos Jeronimos"]
    for name in places:
        st, ct, body = get("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q="
                           + urllib.parse.quote(name))
        try:
            hit = json.loads(body)[0]
        except Exception:  # noqa: BLE001
            print(name, "nominatim", st, body[:200])
            continue
        lat, lon = float(hit["lat"]), float(hit["lon"])
        print(name, hit.get("osm_type"), hit.get("osm_id"), lat, lon, hit.get("category"), hit.get("type"))
        q = ENTRANCE_QUERY.format(lat=lat, lon=lon)
        for base in ("https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"):
            st, ct, body = get(base + "?data=" + urllib.parse.quote(q), timeout=60)
            print("  ", base.split("/")[2], st, len(body))
            try:
                data = json.loads(body)
            except Exception:  # noqa: BLE001
                print("   ", body[:300])
                continue
            if data.get("remark"):
                print("    remark", data["remark"][:200])
            for el in data.get("elements", [])[:40]:
                t = el.get("tags", {})
                print("    ", el["type"], el["id"], el.get("lat"), el.get("lon"),
                      {k: t[k] for k in t if k in ("entrance", "door", "access", "name", "ref", "wheelchair", "building", "shop", "amenity")})
            break


def vehicle_trip():
    """A moving bus tapped on the map: its pattern, its stop, its trip — to place it on its way."""
    section("VEHICLE TRIP")
    _, _, body = get(f"{CARRIS}/vehicles")
    data = json.loads(body)
    now = time.time()
    def age(v):
        t = v.get("timestamp") or 0
        t = t / 1000 if t > 1e12 else t
        return now - t
    fresh = [v for v in data if v.get("lat") and 0 <= age(v) <= 120 and v.get("pattern_id")]
    print("fresh with pattern:", len(fresh), "of", len(data))
    from urllib.parse import quote
    for v in fresh[:3]:
        print("\nVEHICLE", json.dumps({k: v.get(k) for k in (
            "id", "line_id", "route_id", "pattern_id", "trip_id", "stop_id", "current_status",
            "bearing", "speed", "timestamp", "lat", "lon", "shift_id", "block_id")}, ensure_ascii=False),
            "age", round(age(v)))
        bare = v["pattern_id"].split("]")[-1]
        status, _, pb = get(f"{CARRIS}/patterns/{quote(bare)}")
        print("pattern", bare, status, len(pb))
        if status != 200:
            continue
        p = json.loads(pb)
        p = p[0] if isinstance(p, list) else p
        path = p.get("path") or []
        print("headsign", p.get("headsign"), "color", p.get("color"), "shape", p.get("shape_id"), "stops", len(path))
        print("path[0]", json.dumps(path[0], ensure_ascii=False)[:300] if path else None)
        sid = str(v.get("stop_id") or "").split("]")[-1]
        hits = [x.get("stop_sequence") for x in path if str(x.get("stop_id")) == sid]
        print("vehicle stop", v.get("stop_id"), "-> in path at sequences", hits)
        trips = p.get("trips") or []
        print("trips", len(trips), "trip keys", sorted(trips[0]) if trips else None)
        tid = str(v.get("trip_id") or "")
        match = [t for t in trips if tid and (tid in json.dumps(t))]
        print("trip_id", tid, "found in pattern trips:", len(match))
        if trips:
            print("trip[0]", json.dumps({k: trips[0][k] for k in trips[0] if k != "schedule"}, ensure_ascii=False)[:400])
            print("schedule[0:2]", json.dumps((trips[0].get("schedule") or [])[:2], ensure_ascii=False)[:400])


def pb_fields(buf):
    """Protobuf wire format, generically: [(field, wiretype, value)]."""
    out, i, n = [], 0, len(buf)
    def varint():
        nonlocal i
        shift = v = 0
        while True:
            b = buf[i]; i += 1
            v |= (b & 0x7F) << shift
            shift += 7
            if b < 0x80:
                return v
    while i < n:
        key = varint()
        f, wt = key >> 3, key & 7
        if wt == 0:
            out.append((f, 0, varint()))
        elif wt == 1:
            out.append((f, 1, buf[i:i + 8])); i += 8
        elif wt == 2:
            ln = varint(); out.append((f, 2, buf[i:i + ln])); i += ln
        elif wt == 5:
            out.append((f, 5, buf[i:i + 4])); i += 4
        else:
            raise ValueError("wire type %d" % wt)
    return out


def pb_dump(buf, depth=0, maxdepth=4):
    """Readable tree: nested messages tried, strings shown, floats decoded."""
    import struct
    res = {}
    for f, wt, v in pb_fields(buf):
        if wt == 2:
            val = None
            try:
                text = v.decode("utf-8")
                if text and all(c.isprintable() or c in "\n\r\t" for c in text):
                    val = text
            except UnicodeDecodeError:
                pass
            if val is None and depth < maxdepth:
                try:
                    sub = pb_dump(v, depth + 1, maxdepth)
                    if sub:
                        val = sub
                except Exception:  # noqa: BLE001
                    val = None
            if val is None:
                val = "<%d bytes>" % len(v)
        elif wt == 5:
            val = round(struct.unpack("<f", v)[0], 6)
        elif wt == 1:
            val = struct.unpack("<d", v)[0]
        else:
            val = v
        res.setdefault(str(f), []).append(val)
    return res


def realtime_feeds():
    """Open real-time feeds beyond Carris Metropolitana's JSON: Carris de
    Lisboa's GTFS-RT vehicle positions, TML's alerts and trip updates, and
    bike-share candidates for Gira."""
    import gzip, io, zipfile, csv
    now = time.time()
    feeds = {
        "carris-lisboa vp": "https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS/realtime/vehiclepositions",
        "carris-lisboa tu": "https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS/realtime/tripupdates",
        "carris-lisboa sa": "https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS/realtime/alerts",
        "carris-lisboa servicealerts": "https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS/realtime/servicealerts",
        "tml tu": "https://go.tmlmobilidade.pt/hub/api/v1/realtime/trip-updates/gtfs",
        "tml vp": "https://go.tmlmobilidade.pt/hub/api/v1/realtime/vehicles/positions/gtfs",
        "tml sa pb": "https://go.tmlmobilidade.pt/hub/api/v1/alerts/gtfs",
        "cm sa pb": "https://api.carrismetropolitana.pt/alerts.pb",
    }
    vp_trips = []
    for name, url in feeds.items():
        section("GTFS-RT " + name)
        status, ctype, body = get(url, timeout=60)
        print("status", status, "type", ctype, "bytes", len(body))
        if status != 200:
            print(body[:300])
            continue
        if body[:2] == b"\x1f\x8b":
            body = gzip.decompress(body)
            print("gzipped; unpacked", len(body))
        try:
            tree = pb_dump(body, maxdepth=6)
        except Exception as e:  # noqa: BLE001
            print("not protobuf:", e, body[:200])
            continue
        header = tree.get("1", [{}])[0]
        ents = tree.get("2", [])
        print("header", json.dumps(header)[:300])
        ts = header.get("3", [0])[0] if isinstance(header, dict) else 0
        if ts:
            print("header age s", round(now - (ts / 1000 if ts > 1e11 else ts)))
        print("entities", len(ents))
        for e in ents[:3]:
            print(json.dumps(e, ensure_ascii=False)[:1500])
        if name == "carris-lisboa vp":
            ages = []
            for e in ents:
                v = (e.get("4") or [{}])[0]
                if not isinstance(v, dict):
                    continue
                t = (v.get("5") or [0])[0]
                if t:
                    ages.append(now - (t / 1000 if t > 1e11 else t))
                trip = (v.get("1") or [{}])[0]
                if isinstance(trip, dict) and trip.get("1"):
                    vp_trips.append((trip.get("1")[0], (trip.get("5") or [None])[0]))
            ages.sort()
            if ages:
                print("vehicles with time", len(ages), "median age s", round(ages[len(ages) // 2]),
                      "under 120 s", sum(1 for a in ages if a < 120))
            print("sample trip/route", vp_trips[:8])

    section("Carris de Lisboa static GTFS: do the live trip ids match?")
    status, _, body = get("https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS", timeout=180)
    print("status", status, "bytes", len(body))
    if status == 200 and vp_trips:
        z = zipfile.ZipFile(io.BytesIO(body))
        print(z.namelist())
        trips = {r["trip_id"]: r for r in csv.DictReader(io.TextIOWrapper(z.open("trips.txt"), "utf-8-sig"))}
        routes = {r["route_id"]: r for r in csv.DictReader(io.TextIOWrapper(z.open("routes.txt"), "utf-8-sig"))}
        vp_trips = [(t, r) for t, r in vp_trips if isinstance(t, str)]
        hit = sum(1 for t, _ in vp_trips if t in trips)
        stops = {r["stop_id"]: r for r in csv.DictReader(io.TextIOWrapper(z.open("stops.txt"), "utf-8-sig"))}
        print("stops", len(stops), "sample", list(stops.values())[:2])
        print("live trips", len(vp_trips), "found in trips.txt", hit)
        print("sample static trip ids", list(trips)[:5])
        for t, r in vp_trips[:6]:
            st = trips.get(t)
            rid = r or (st or {}).get("route_id")
            ro = routes.get(rid or "", {})
            print(t, "route", rid, ro.get("route_short_name"), ro.get("route_long_name"), "headsign",
                  (st or {}).get("trip_headsign"), "shape", (st or {}).get("shape_id"))
        print("route sample", list(routes.values())[:2])

    section("TML alerts JSON: one whole")
    status, _, body = get("https://go.tmlmobilidade.pt/hub/api/v1/alerts")
    print("status", status, "bytes", len(body))
    try:
        data = json.loads(body)
        items = data if isinstance(data, list) else data.get("data", data)
        print("count", len(items))
        for a in items[:2]:
            print(json.dumps(a, ensure_ascii=False)[:2500])
        keys = {}
        for a in items:
            for k in a:
                keys[k] = keys.get(k, 0) + 1
        print("keys", keys)
        print("agencies", sorted({str(a.get("agency_id")) for a in items}))
    except Exception as e:  # noqa: BLE001
        print("not json", e, body[:300])
    for url in ("https://api.carrismetropolitana.pt/alerts", "https://api.carrismetropolitana.pt/v2/alerts"):
        status, ctype, body = get(url)
        print(url, status, ctype, len(body), body[:600])

    section("Bike share (Gira and others)")
    for url in (
        "https://opendata.emel.pt/cycling/gira/station/list",
        "https://emel.city-platform.com/opendata/gira/station/list",
        "https://api-gira.emel.pt/gbfs/gbfs.json",
        "https://gira.emel.pt/gbfs/gbfs.json",
        "https://dados.cm-lisboa.pt/api/3/action/package_search?q=gira",
        "https://dados.gov.pt/api/1/datasets/?q=gira",
        "https://mds.bird.co/gbfs/v2/public/lisbon/gbfs.json",
    ):
        status, ctype, body = get(url, timeout=30)
        print("\n", url, status, ctype, len(body))
        print(body[:900])


def lines():
    """Carris Metropolitana's /v2/lines: the fields, for the line search."""
    section("/v2/lines")
    status, ctype, body = get(CARRIS + "/lines")
    print("status", status, ctype, "bytes", len(body))
    data = json.loads(body)
    print("count", len(data))
    for x in data[:2]:
        print(json.dumps(x, ensure_ascii=False)[:1500])
    sample = next((x for x in data if x.get("short_name") == "3601" or x.get("id") == "3601"), data[0])
    print("3601:", json.dumps(sample, ensure_ascii=False)[:1500])
    for path in ("/lines/3601", "/routes", "/routes/3601_0"):
        status, ctype, body = get(CARRIS + path)
        print("\n", path, status, len(body), body[:1200])


def trails():
    """Trail mode (author's idea): Waymarked Trails' overlay tiles and terms,
    and how many guideposts OSM has around Monsanto."""
    import math
    lat, lon, z = 38.725, -9.19, 13
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    section("Waymarked Trails tiles")
    for kind in ("hiking", "cycling", "mtb", "riding", "skating", "slopes"):
        url = f"https://tile.waymarkedtrails.org/{kind}/{z}/{x}/{y}.png"
        status, ctype, body = get(url)
        print(kind, status, ctype, len(body), "png" if body[:4] == b"\x89PNG" else body[:80])
    section("Waymarked Trails terms")
    for url in ("https://waymarkedtrails.org/help/legal", "https://hiking.waymarkedtrails.org/help/legal",
                "https://waymarkedtrails.org/#help-legal", "https://raw.githubusercontent.com/waymarkedtrails/waymarkedtrails-frontend/master/README.md"):
        status, ctype, body = get(url)
        text = re.sub(r"<[^>]+>", " ", body.decode("utf-8", "replace"))
        text = re.sub(r"\s+", " ", text)
        print("\n", url, status, len(body))
        for m in re.finditer(r"(?i)(tile|usage|licen|attribut|commercial|bulk|api)", text):
            print("  ...", text[max(0, m.start() - 160): m.start() + 200])
            break
        print("  ", text[:1500])
    section("Guideposts around Monsanto (Overpass)")
    q = '[out:json][timeout:25];(node[tourism=information][information~"guidepost|board|map|route_marker"](38.70,-9.23,38.75,-9.16););out tags 20;'
    status, ctype, body = get("https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote(q))
    print("status", status, len(body))
    try:
        els = json.loads(body).get("elements", [])
        print("count (first 20)", len(els))
        for e in els[:20]:
            print(e.get("tags"))
    except Exception as e:
        print("not json", body[:300])
    q = '[out:json][timeout:25];rel[route~"hiking|foot|bicycle|mtb"](38.70,-9.23,38.75,-9.16);out tags;'
    status, ctype, body = get("https://overpass-api.de/api/interpreter?data=" + urllib.parse.quote(q))
    try:
        els = json.loads(body).get("elements", [])
        print("routes", len(els))
        for e in els[:15]:
            t = e.get("tags", {})
            print(t.get("route"), t.get("ref"), t.get("name"), t.get("network"), t.get("osmc:symbol"))
    except Exception:
        print("routes: not json", status, body[:300])


ENTRANCE_QUERY = """[out:json][timeout:20];
is_in({lat},{lon})->.a;
(way(pivot.a)[~"^(building|shop|amenity|tourism|leisure|healthcare|office|historic)$"~"."];
 rel(pivot.a)[~"^(building|shop|amenity|tourism|leisure|healthcare|office|historic)$"~"."];)->.p;
(way(r.p);.p;)->.p;
(node(around.p:3)[entrance];node(around:60,{lat},{lon})[entrance];);
out;
.p out tags center;"""

def fares():
    """Fares: what the operators' GTFS carry (fare_* files), what the APIs and
    the price pages say, and the Metro Sul do Tejo lines' own colours."""
    import io
    import zipfile

    catalogue = json.load(open("transit-feeds.json", encoding="utf-8"))
    for feed in catalogue.get("feeds", []):
        for url in feed.get("urls") or []:
            section(f"GTFS {feed['id']}: {url[:90]}")
            status, ctype, body = get(url, timeout=240)
            print(status, ctype, len(body), "bytes")
            if status != 200 or body[:2] != b"PK":
                continue
            z = zipfile.ZipFile(io.BytesIO(body))
            names = z.namelist()
            print("files:", names)
            for name in names:
                if "fare" in name or name in ("networks.txt", "route_networks.txt", "areas.txt", "stop_areas.txt", "timeframes.txt", "rider_categories.txt", "fare_media.txt"):
                    lines = z.read(name).decode("utf-8-sig", "replace").splitlines()
                    print(f"-- {name}: {len(lines) - 1} rows")
                    for line in lines[:25]:
                        print("   ", line[:300])
            if "routes.txt" in names:
                r = z.read("routes.txt").decode("utf-8-sig", "replace").splitlines()
                print("-- routes.txt header:", r[0])
                for line in r[1:6]:
                    print("   ", line[:200])
            break

    section("MTS lines (colours?)")
    status, ctype, body = get("https://www.mts.pt/mts-timetable-api/lines", 40)
    print(status, ctype, body[:3000])

    section("Carris Metropolitana API: fares?")
    for path in ("/fares", "/v2/fares", "/v2/lines/3601", "/v2/stops/010001"):
        base = "https://api.carrismetropolitana.pt"
        st, ct, b = get(base + path, 40)
        print(path, st, ct, b[:1500])

    section("Price pages (lines with €)")
    pages = [
        "https://www.navegante.pt/viajar/bilhetes",
        "https://www.navegante.pt/viajar/titulos",
        "https://www.navegante.pt/tarifario",
        "https://www.metrolisboa.pt/comprar/",
        "https://www.metrolisboa.pt/comprar/tarifario/",
        "https://www.carris.pt/viaje/tarifario/",
        "https://www.carris.pt/viaje/titulos-e-tarifas/",
        "https://www.carrismetropolitana.pt/tarifarios/",
        "https://www.carrismetropolitana.pt/tarifas/",
        "https://www.mts.pt/tarifario/",
        "https://www.mts.pt/bilhetes-e-passes/",
        "https://www.fertagus.pt/pt/bilhetes-e-passes",
        "https://www.ttsl.pt/passageiros/bilhetes-e-passes/",
        "https://www.cp.pt/passageiros/pt/comprar-bilhetes/tarifas",
    ]
    for url in pages:
        st, ct, b = get(url, 40)
        text = re.sub(r"<[^>]+>", " ", b.decode("utf-8", "replace"))
        text = re.sub(r"\s+", " ", text)
        hits = [m.start() for m in re.finditer("€", text)][:12]
        print(f"\n{url} -> {st} {len(b)} bytes, {len(hits)} € shown")
        for i in hits:
            print("   ", text[max(0, i - 110): i + 20])


def data_use():
    """What the transport requests cost on the wire: compressed and raw sizes,
    whether the server answers 304 to a repeat, filters that might shrink the
    fleet list, and how often positions really change."""
    import gzip

    def fetch(url, extra=None):
        headers = {"User-Agent": UA, "Accept-Encoding": "gzip"}
        headers.update(extra or {})
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
                return r.status, dict(r.headers), body
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def size(url, label=None):
        st, h, body = fetch(url)
        raw = gzip.decompress(body) if h.get("Content-Encoding") == "gzip" else body
        print(f"{label or url}: {st} wire {len(body)/1024:.0f} KB, raw {len(raw)/1024:.0f} KB, "
              f"enc={h.get('Content-Encoding')} etag={h.get('ETag')} lm={h.get('Last-Modified')} "
              f"cc={h.get('Cache-Control')}")
        return st, h, raw

    section("Wire sizes")
    st, h, raw = size(CARRIS + "/vehicles", "vehicles")
    if h.get("ETag"):
        st2, h2, b2 = fetch(CARRIS + "/vehicles", {"If-None-Match": h["ETag"]})
        print("  repeat with If-None-Match:", st2, len(b2), "bytes")
    try:
        first = json.loads(raw)
        print("  vehicles:", len(first), "fields:", sorted(first[0].keys()) if first else None)
        now = time.time() * 1000
        fresh = [v for v in first if v.get("timestamp") and now - v["timestamp"] < 120000]
        print("  reported in the last 2 min:", len(fresh))
        print("  a fresh one:", json.dumps(fresh[0])[:600] if fresh else None)
    except Exception as e:  # noqa: BLE001
        print("  parse failed", e)
        first = []
    for q in ("?agency_id=41", "?line_id=3601", "?lat=38.7&lon=-9.14&radius=2000",
              "?bbox=-9.2,38.7,-9.1,38.75", "?fields=id,lat,lon"):
        st, h, b = fetch(CARRIS + "/vehicles" + q)
        print(f"  /vehicles{q}: {st} {len(b)/1024:.0f} KB wire")
    for url in ("https://api.carrismetropolitana.pt/v2/vehicles/by_line/3601",
                "https://api.carrismetropolitana.pt/v2/lines/3601/vehicles",
                "https://go.tmlmobilidade.pt/hub/api/v1/vehicles",
                "https://api.carrismetropolitana.pt/v2/gtfs/realtime/vehicle-positions",
                "https://api.carrismetropolitana.pt/gtfs-rt"):
        st, h, b = fetch(url)
        print(f"  {url}: {st} {len(b)/1024:.0f} KB wire, {h.get('Content-Type')}")

    time.sleep(10)
    st, h, raw2 = fetch(CARRIS + "/vehicles")
    try:
        second = json.loads(gzip.decompress(raw2) if h.get("Content-Encoding") == "gzip" else raw2)
        a = {v["id"]: (v.get("lat"), v.get("lon"), v.get("timestamp")) for v in first}
        changed = sum(1 for v in second if a.get(v["id"]) != (v.get("lat"), v.get("lon"), v.get("timestamp")))
        print(f"  10 s later: {changed} of {len(second)} changed")
    except Exception as e:  # noqa: BLE001
        print("  second parse failed", e)

    size(CARRIS + "/stops", "stops")
    size(CARRIS + "/lines", "lines")
    size(CARRIS + "/alerts", "alerts")
    size(CARRIS + "/arrivals/by_stop/010001", "arrivals one stop")
    try:
        pattern_id = json.loads(fetch(CARRIS + "/lines")[2] if False else size(CARRIS + "/lines", "lines again")[2])[0]["pattern_ids"][0]
        _, _, praw = size(CARRIS + "/patterns/" + pattern_id, "one pattern")
        shape = json.loads(praw)[0].get("shape_id") if praw[:1] == b"[" else json.loads(praw).get("shape_id")
        if shape:
            size(CARRIS + "/shapes/" + shape, "its shape")
    except Exception as e:  # noqa: BLE001
        print("pattern failed", e)
    size("https://gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS/realtime/vehiclepositions", "carris lisboa vp")


def bus_models():
    """How many live buses carry make, model, propulsion and the rest, and the values."""
    from collections import Counter

    _, _, body = get(CARRIS + "/vehicles")
    fleet = json.loads(body)
    now = time.time() * 1000
    live = [v for v in fleet if v.get("timestamp") and now - v["timestamp"] < 120000]
    print("live:", len(live), "of", len(fleet))
    for field in ("make", "model", "propulsion", "emission_class", "wheelchair_accessible",
                  "bikes_allowed", "capacity_total", "capacity_seated", "registration_date",
                  "license_plate", "owner", "occupancy_status", "occupancy_estimated", "agency_id"):
        values = Counter(str(v.get(field)) for v in live)
        filled = sum(n for k, n in values.items() if k not in ("None", "", "0"))
        print(f"{field}: {filled}/{len(live)} filled; top {values.most_common(8)}")


def pnoa():
    """Spain's IGN aerial orthophotos (PNOA, latest per area): does the WMTS answer, which
    layers and tile sets, which format, and what comes back outside Spain (Lisbon) and
    for Portugal's DGT outside Portugal (Badajoz) — an opaque tile there would cover the
    other country's imagery."""
    import math
    section("PNOA (IGN Spain)")

    def tile(lat, lon, z):
        n = 2 ** z
        x = int((lon + 180) / 360 * n)
        y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
        return x, y

    for base in ("https://www.ign.es/wmts/pnoa-ma", "https://www.ign.es/wmts/pnoa-ma-2025"):
        st, ct, b = get(base + "?request=GetCapabilities&service=WMTS", 90)
        print(base, "capabilities", st, ct, len(b))
        if st == 200:
            t = b.decode("utf-8", "replace")
            print(" layers:", sorted(set(re.findall(r"<ows:Identifier>([^<]+)</ows:Identifier>", t)))[:40])
            print(" formats:", sorted(set(re.findall(r"<Format>([^<]+)</Format>", t))))
            print(" title/abstract/fees/constraints:",
                  re.findall(r"<ows:(?:Fees|AccessConstraints)>([^<]*)<", t)[:4])
    places = {"Madrid": (40.4168, -3.7038), "Badajoz": (38.8794, -6.9707),
              "Lisboa": (38.7223, -9.1393), "Elvas (PT, border)": (38.8810, -7.1630),
              "Tenerife": (28.4636, -16.2518), "Palma": (39.5696, 2.6502)}
    for name, (lat, lon) in places.items():
        for z in (14, 18):
            x, y = tile(lat, lon, z)
            for fmt in ("image/jpeg", "image/png"):
                url = ("https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0"
                       f"&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible"
                       f"&tilematrix={z}&tilerow={y}&tilecol={x}&format={fmt}")
                st, ct, b = get(url, 60)
                print(f"PNOA {name} z{z} {fmt}: {st} {ct} {len(b)} bytes", b[:80] if st != 200 else "")
    # DGT outside Portugal: what does it answer over Badajoz?
    for name, (lat, lon) in (("Badajoz", (38.8794, -6.9707)), ("Elvas", (38.8810, -7.1630))):
        z = 15
        x, y = tile(lat, lon, z)
        r = 6378137 * math.pi
        size = 2 * r / 2 ** z
        minx = -r + x * size; maxy = r - y * size
        bbox = f"{minx},{maxy - size},{minx + size},{maxy}"
        url = ("https://ortos.dgterritorio.gov.pt/wms/ortosat2023?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
               "&LAYERS=ortoSat2023-CorVerdadeira&STYLES=&CRS=EPSG:3857&BBOX=" + bbox +
               "&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=true")
        st, ct, b = get(url, 60)
        print(f"DGT png transparent {name}: {st} {ct} {len(b)} bytes")
    st, ct, b = get("https://www.ign.es/web/ign/portal/licencias", 60)
    if st == 200:
        t = re.sub(r"<[^>]+>", " ", b.decode("utf-8", "replace"))
        i = t.find("CC BY")
        print("licence page:", " ".join(t[max(0, i - 400):i + 400].split()) if i >= 0 else "no CC BY text")
    else:
        print("licence page", st)


def pnoa_blank():
    """What a PNOA JPEG tile looks like where there is no imagery (Portugal, sea, France),
    and DGT's JPEG over Spain: small tiles are printed in base64 to be decoded elsewhere."""
    import base64
    import math
    section("PNOA blank tiles")

    def tile(lat, lon, z):
        n = 2 ** z
        return (int((lon + 180) / 360 * n),
                int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n))

    spots = {"Lisboa": (38.7223, -9.1393, 18), "Atlantic off Galicia": (43.0, -10.5, 13),
             "Cadiz coast": (36.53, -6.31, 14), "France Toulouse": (43.60, 1.44, 14),
             "Tanger": (35.77, -5.80, 14), "Mediterranean": (39.0, 1.0, 13)}
    for name, (lat, lon, z) in spots.items():
        x, y = tile(lat, lon, z)
        url = ("https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0"
               f"&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible"
               f"&tilematrix={z}&tilerow={y}&tilecol={x}&format=image/jpeg")
        st, ct, b = get(url, 60)
        print(f"PNOA jpeg {name} z{z}: {st} {ct} {len(b)}")
        if st == 200 and len(b) < 4000:
            print("B64", name, base64.b64encode(b).decode())
    lat, lon, z = 38.8794, -6.9707, 15
    x, y = tile(lat, lon, z)
    r = 6378137 * math.pi
    size = 2 * r / 2 ** z
    minx = -r + x * size; maxy = r - y * size
    bbox = f"{minx},{maxy - size},{minx + size},{maxy}"
    url = ("https://ortos.dgterritorio.gov.pt/wms/ortosat2023?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
           "&LAYERS=ortoSat2023-CorVerdadeira&STYLES=&CRS=EPSG:3857&BBOX=" + bbox +
           "&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg&TRANSPARENT=false")
    st, ct, b = get(url, 60)
    print(f"DGT jpeg Badajoz: {st} {ct} {len(b)}")
    if st == 200 and len(b) < 8000:
        print("B64 DGT-Badajoz", base64.b64encode(b).decode())
    for fmt in ("image/webp", "image/png8", "image/png; mode=8bit"):
        x, y = tile(40.4168, -3.7038, 16)
        url = ("https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0"
               f"&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible"
               f"&tilematrix=16&tilerow={y}&tilecol={x}&format={urllib.parse.quote(fmt)}")
        st, ct, b = get(url, 60)
        print(f"PNOA Madrid {fmt}: {st} {ct} {len(b)}")


def ortho_formats():
    """Which image formats the DGT WMS and the IGN PNOA WMS offer, and what each weighs
    over imagery and over the other country: a format that is JPEG where there is
    imagery and transparent PNG where there is none would let both sit on the map
    without blank squares and without PNG's weight."""
    import math
    section("ORTHOPHOTO FORMATS")
    r = 6378137 * math.pi

    def bbox(lat, lon, z):
        n = 2 ** z
        x = int((lon + 180) / 360 * n)
        y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
        size = 2 * r / n
        minx = -r + x * size
        maxy = r - y * size
        return f"{minx},{maxy - size},{minx + size},{maxy}"

    services = {
        "DGT": ("https://ortos.dgterritorio.gov.pt/wms/ortosat2023", "ortoSat2023-CorVerdadeira"),
        "PNOA": ("https://www.ign.es/wms-inspire/pnoa-ma", "OI.OrthoimageCoverage"),
    }
    for name, (base, layer) in services.items():
        st, ct, b = get(base + "?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities", 90)
        t = b.decode("utf-8", "replace") if st == 200 else ""
        getmap = t[t.find("<GetMap>"):t.find("</GetMap>")] if "<GetMap>" in t else ""
        print(name, "capabilities", st, "GetMap formats:", re.findall(r"<Format>([^<]+)</Format>", getmap))
        print(name, "server hint:", re.findall(r"(MapServer|GeoServer|ArcGIS|QGIS)", t)[:3])
        for place, (lat, lon) in (("Elvas PT", (38.8810, -7.1630)), ("Badajoz ES", (38.8794, -6.9707)),
                                  ("Lisboa PT", (38.7223, -9.1393)), ("Sea", (39.0, -10.2))):
            for fmt in ("image/jpeg", "image/png", "image/vnd.jpeg-png", "image/vnd.jpeg-png8",
                        "image/png8", "image/png; mode=8bit"):
                url = (f"{base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS={layer}&STYLES="
                       f"&CRS=EPSG:3857&BBOX={bbox(lat, lon, 15)}&WIDTH=512&HEIGHT=512"
                       f"&FORMAT={urllib.parse.quote(fmt)}&TRANSPARENT=true")
                st, ct, b = get(url, 60)
                print(f"  {name} {place} {fmt}: {st} {ct} {len(b)}")


def tls_chains():
    """Which certificate chain each imagery server sends, and the root it ends on: an old
    Android (11 and below) only trusts the roots it shipped with, so a server on a newer
    root works on a recent phone and fails, silently, on an old one."""
    import subprocess
    section("TLS CHAINS")
    for host in ("ortos.dgterritorio.gov.pt", "www.ign.es", "tiles.maps.eox.at",
                 "tile.openstreetmap.org", "tiles.openfreemap.org"):
        try:
            out = subprocess.run(
                ["openssl", "s_client", "-connect", f"{host}:443", "-servername", host, "-showcerts"],
                input=b"", capture_output=True, timeout=30).stdout.decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(host, "FAILED", e)
            continue
        print(f"--- {host}")
        for line in out.splitlines():
            if re.match(r"\s*\d+ s:", line) or re.match(r"\s*i:", line) or "Verify return code" in line:
                print("  ", line.strip())


def post_json(url, payload, timeout=60):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"User-Agent": UA, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read()
    except Exception as e:  # noqa: BLE001
        return None, "", str(e).encode()


def cp_realtime():
    """Infraestruturas de Portugal's public train circulation service (CP delays)."""
    section("IP / CP REAL TIME")
    base = "https://www.infraestruturasdeportugal.pt/negocios-e-servicos"
    for name in ("Oriente", "Cais do Sodre", "Pragal", "Sintra"):
        st, ct, body = get(f"{base}/estacao-nome/{urllib.parse.quote(name)}")
        print(f"\n--- estacao-nome {name} -> {st} {ct} {len(body)} B")
        print(body[:600].decode("utf-8", "replace"))
    now = time.strftime("%Y-%m-%d %H:%M", time.localtime())
    later = time.strftime("%Y-%m-%d %H:%M", time.localtime(time.time() + 2 * 3600))
    kinds = "INTERNACIONAL, ALFA, IC, IR, REGIONAL, URB|SUBUR, ESPECIAL"
    for station in ("94-31039", "94-69005", "94-30007"):
        url = f"{base}/partidas-chegadas/{station}/{urllib.parse.quote(now)}/{urllib.parse.quote(later)}/{urllib.parse.quote(kinds)}"
        st, ct, body = get(url)
        print(f"\n--- partidas-chegadas {station} -> {st} {ct} {len(body)} B")
        text = body.decode("utf-8", "replace")
        print(text[:2500])
        try:
            data = json.loads(text)
            resp = data.get("response") or []
            for block in resp[:1]:
                print("block keys:", sorted(block))
                for t in (block.get("NodesComboioTabelsPartidasChegadas") or [])[:6]:
                    print(json.dumps(t, ensure_ascii=False))
                    number = t.get("NComboio1")
                    if number:
                        day = time.strftime("%Y-%m-%d", time.localtime())
                        st2, _, b2 = get(f"{base}/horarios-ncombio/{number}/{day}")
                        print(f"   horarios-ncombio {number} -> {st2} {len(b2)} B")
                        print("  ", b2[:1500].decode("utf-8", "replace"))
                        number = None
                        break
        except Exception as e:  # noqa: BLE001
            print("not JSON:", e)


def valhalla_height():
    """FOSSGIS Valhalla's /height: elevation along a line (for the profile)."""
    section("VALHALLA HEIGHT")
    shape = [{"lat": 38.7169, "lon": -9.1399}, {"lat": 38.7139, "lon": -9.1335},
             {"lat": 38.7110, "lon": -9.1290}]
    for payload in ({"range": True, "shape": shape},
                    {"range": True, "resample_distance": 50, "shape": shape}):
        st, ct, body = post_json("https://valhalla1.openstreetmap.de/height", payload)
        print(f"--- {list(payload)} -> {st} {ct} {len(body)} B")
        print(body[:1500].decode("utf-8", "replace"))
    # A long line: how many points does it accept?
    long_shape = [{"lat": 38.70 + i * 0.001, "lon": -9.20 + i * 0.001} for i in range(3000)]
    st, ct, body = post_json("https://valhalla1.openstreetmap.de/height", {"range": True, "shape": long_shape})
    print(f"--- 3000 points -> {st} {len(body)} B", body[:300].decode("utf-8", "replace"))
    long_shape = long_shape[:500]
    st, ct, body = post_json("https://valhalla1.openstreetmap.de/height", {"range": True, "shape": long_shape})
    print(f"--- 500 points -> {st} {len(body)} B", body[:300].decode("utf-8", "replace"))
    # And does a route answer carry elevation already?
    st, ct, body = post_json("https://valhalla1.openstreetmap.de/route", {
        "locations": [shape[0], shape[-1]], "costing": "pedestrian", "elevation_interval": 30,
        "directions_type": "none", "units": "km"})
    text = body.decode("utf-8", "replace")
    print(f"--- route elevation_interval -> {st} {len(body)} B")
    try:
        trip = json.loads(text)["trip"]
        print("summary:", trip.get("summary"))
        print("leg keys:", sorted(trip["legs"][0]))
        print("elevation sample:", str(trip["legs"][0].get("elevation"))[:300])
    except Exception as e:  # noqa: BLE001
        print(text[:800], e)


def cp_realtime2():
    """Why the IP service answers 403: the request's shape, or where it comes from."""
    section("IP / CP REAL TIME, ROUND 2")
    base = "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/estacao-nome/Oriente"
    variants = {
        "ours + json": {"User-Agent": UA, "Accept": "application/json"},
        "browser-like": {"User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36",
                         "Accept": "application/json, text/plain, */*", "Accept-Language": "pt-PT,pt;q=0.9",
                         "Referer": "https://www.infraestruturasdeportugal.pt/negocios-e-servicos/partidas-e-chegadas"},
    }
    for name, headers in variants.items():
        for url in (base, "https://www.infraestruturasdeportugal.pt/", "https://www.cp.pt/passageiros/pt"):
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    print(f"{name:14} {url} -> {r.status} {r.headers.get('Server')} {len(r.read())} B")
            except urllib.error.HTTPError as e:
                print(f"{name:14} {url} -> {e.code} server={e.headers.get('Server')} cf={e.headers.get('cf-ray')} {e.read()[:200]!r}")
            except Exception as e:  # noqa: BLE001
                print(f"{name:14} {url} -> {e}")


def open_meteo():
    """Open-Meteo's forecast: free, no key; the fields for "rain at the destination"."""
    section("OPEN-METEO")
    url = ("https://api.open-meteo.com/v1/forecast?latitude=38.80&longitude=-9.38"
           "&hourly=precipitation_probability,precipitation,weather_code&forecast_hours=12&timezone=auto")
    st, ct, body = get(url)
    print(st, ct, len(body), "B")
    print(body[:1500].decode("utf-8", "replace"))
    st, ct, body = get(url + "&timeformat=unixtime")
    print("unixtime:", st, body[:600].decode("utf-8", "replace"))


def met_no():
    """MET Norway's locationforecast (free, CC BY 4.0, asks for an identifying User-Agent)."""
    section("MET NORWAY")
    for url in ("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=38.80&lon=-9.38",
                "https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=38.80&lon=-9.38"):
        st, ct, body = get(url, timeout=30)
        print(url.rsplit('/', 1)[1][:9], st, ct, len(body), "B")
        try:
            data = json.loads(body)
            ts = data["properties"]["timeseries"]
            print("first:", json.dumps(ts[0])[:900])
            print("count:", len(ts), "last time:", ts[-1]["time"])
        except Exception as e:  # noqa: BLE001
            print(body[:300], e)
    st, ct, body = get("https://api.open-meteo.com/v1/forecast?latitude=38.80&longitude=-9.38&hourly=precipitation&forecast_hours=3", timeout=20)
    print("open-meteo again:", st, body[:200])


def photo_coverage():
    """How many real businesses would get a photo, per source (author: "no business photo yet")."""
    section("PHOTO COVERAGE")
    import random
    url = "https://github.com/choso08/PalmMap/releases/download/mapas/portugal.pois"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=120).read()
    n = int(data[:10])
    header = json.loads(data[10:10 + n])
    base = 10 + n
    g = header["grid"]
    places = []
    for lon0, lat0, lon1, lat1 in ((-9.16, 38.70, -9.12, 38.73), (-9.17, 38.67, -9.14, 38.69)):
        for ix in range(math.floor(lon0 / g), math.floor(lon1 / g) + 1):
            for iy in range(math.floor(lat0 / g), math.floor(lat1 / g) + 1):
                cell = header["cells"].get(f"{ix},{iy}")
                if cell:
                    places += json.loads(data[base + cell[0]: base + cell[0] + cell[1]])
    random.seed(7)
    sample = random.sample(places, min(40, len(places)))
    print(len(places), "businesses in central Lisbon + Almada; sampling", len(sample))
    hits = {"panoramax25": 0, "panoramax60": 0, "commons30": 0, "commons60": 0, "osmtags": 0}
    for r in sample:
        lon, lat, name = r[0], r[1], r[2]
        d = 0.0006
        dl = d / math.cos(math.radians(lat))
        st, _, body = get(f"https://api.panoramax.xyz/api/search?bbox={lon-dl:.6f},{lat-d:.6f},{lon+dl:.6f},{lat+d:.6f}&limit=50", timeout=30)
        best = None
        if r is sample[0]:
            print("  panoramax status", st, body[:300])
        try:
            for f in json.loads(body).get("features", []):
                plon, plat = f["geometry"]["coordinates"][:2]
                dist = math.hypot((plon - lon) * 111320 * math.cos(math.radians(lat)), (plat - lat) * 110540)
                best = dist if best is None else min(best, dist)
        except Exception:  # noqa: BLE001
            pass
        if best is not None and best <= 25:
            hits["panoramax25"] += 1
        if best is not None and best <= 60:
            hits["panoramax60"] += 1
        st2, _, body2 = get("https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&format=json"
                            f"&gscoord={lat}|{lon}&gsradius=60&gsnamespace=6&gslimit=20", timeout=30)
        near = []
        try:
            near = json.loads(body2)["query"]["geosearch"]
        except Exception:  # noqa: BLE001
            pass
        if any(x.get("dist", 99) <= 30 for x in near):
            hits["commons30"] += 1
        if near:
            hits["commons60"] += 1
        osm = r[8] if len(r) > 8 else None
        tagged = False
        if osm:
            num = int(osm[1:])
            if osm[0] == "a":  # osmium area: 2 × way id, or 2 × relation id + 1
                kind, num = ("way", num // 2) if num % 2 == 0 else ("relation", num // 2)
            else:
                kind = {"n": "node", "w": "way", "r": "relation"}[osm[0]]
            st3, _, body3 = get(f"https://api.openstreetmap.org/api/0.6/{kind}/{num}.json", timeout=30)
            try:
                tags = json.loads(body3)["elements"][0].get("tags", {})
                tagged = any(k in tags for k in ("image", "wikimedia_commons", "wikidata", "panoramax"))
            except Exception:  # noqa: BLE001
                pass
        if tagged:
            hits["osmtags"] += 1
        print(f"  {name[:30]:30} panoramax {best and round(best)} m · commons {[ (x['title'][5:40], round(x['dist'])) for x in near[:2]]} · osm photo tag {tagged}")
        time.sleep(0.3)
    print("HITS of", len(sample), hits)


def streetview():
    """Panoramax street-level coverage per town, and what a picture carries (author: a Street View)."""
    section("STREET VIEW (PANORAMAX)")
    import random
    for path in ("/map/style.json", "/configuration", "/map/14/7826/6261.mvt"):
        st, ct, body = get("https://api.panoramax.xyz/api" + path, timeout=30)
        print(path, st, ct, len(body), body[:600] if b"json" in ct.encode() else "")
    url = "https://github.com/choso08/PalmMap/releases/download/mapas/portugal.pois"
    data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=120).read()
    n = int(data[:10])
    header = json.loads(data[10:10 + n])
    base = 10 + n
    g = header["grid"]
    towns = {
        "Lisboa Baixa": (-9.145, 38.707, -9.130, 38.716),
        "Lisboa Avenidas": (-9.150, 38.730, -9.135, 38.745),
        "Almada": (-9.165, 38.672, -9.150, 38.685),
        "Seixal/Amora": (-9.120, 38.615, -9.095, 38.635),
        "Porto": (-8.620, 41.142, -8.600, 41.155),
        "Coimbra": (-8.435, 40.200, -8.415, 40.215),
        "Braga": (-8.435, 41.545, -8.415, 41.558),
        "Faro": (-7.945, 37.012, -7.925, 37.022),
        "Evora": (-7.915, 38.567, -7.900, 38.576),
        "Viseu": (-7.920, 40.652, -7.905, 40.662),
    }
    sample_feature = None
    for town, (lon0, lat0, lon1, lat1) in towns.items():
        places = []
        for ix in range(math.floor(lon0 / g), math.floor(lon1 / g) + 1):
            for iy in range(math.floor(lat0 / g), math.floor(lat1 / g) + 1):
                cell = header["cells"].get(f"{ix},{iy}")
                if cell:
                    places += [r for r in json.loads(data[base + cell[0]: base + cell[0] + cell[1]])
                               if lon0 <= r[0] <= lon1 and lat0 <= r[1] <= lat1]
        random.seed(11)
        sample = random.sample(places, min(25, len(places)))
        hits = {25: 0, 50: 0, 100: 0}
        years = {}
        spherical = 0
        total = 0
        for r in sample:
            lon, lat = r[0], r[1]
            d = 0.0009
            dl = d / math.cos(math.radians(lat))
            st, _, body = get(f"https://api.panoramax.xyz/api/search?bbox={lon-dl:.6f},{lat-d:.6f},{lon+dl:.6f},{lat+d:.6f}&limit=100", timeout=30)
            best = None
            try:
                for f in json.loads(body).get("features", []):
                    total += 1
                    if sample_feature is None:
                        sample_feature = f
                    props = f.get("properties", {})
                    y = str(props.get("datetime", ""))[:4]
                    years[y] = years.get(y, 0) + 1
                    if "equirectangular" in json.dumps(props).lower() or props.get("pers:interior_orientation", {}).get("field_of_view") == 360:
                        spherical += 1
                    plon, plat = f["geometry"]["coordinates"][:2]
                    dist = math.hypot((plon - lon) * 111320 * math.cos(math.radians(lat)), (plat - lat) * 110540)
                    best = dist if best is None else min(best, dist)
            except Exception as e:  # noqa: BLE001
                print("   fail", st, str(e)[:80], body[:120])
            for k in hits:
                if best is not None and best <= k:
                    hits[k] += 1
            time.sleep(0.25)
        print(f"{town:16} {len(sample)} points · within 25 m {hits[25]} · 50 m {hits[50]} · 100 m {hits[100]}"
              f" · pictures seen {total} · 360 {spherical} · years {dict(sorted(years.items()))}")
    if sample_feature:
        print("\nSAMPLE FEATURE:")
        print(json.dumps(sample_feature, indent=1)[:4000])
        item = next((l["href"] for l in sample_feature.get("links", []) if l.get("rel") == "self"), None)
        if item:
            st, _, body = get(item, timeout=30)
            print("\nITEM", st)
            try:
                it = json.loads(body)
                print("links:", [(l.get("rel"), l.get("href", "")[-60:]) for l in it.get("links", [])])
                print("assets:", {k: (v.get("href", "")[-60:], v.get("type")) for k, v in it.get("assets", {}).items()})
                print("props keys:", sorted(it.get("properties", {})))
            except Exception as e:  # noqa: BLE001
                print(e, body[:300])


def streetview_tiles():
    """Panoramax's coverage tiles: the style's source and a tile over Evora."""
    section("STREET VIEW TILES")
    st, _, body = get("https://api.panoramax.xyz/api/map/style.json", timeout=30)
    style = json.loads(body)
    print("sources:", json.dumps(style.get("sources"))[:800])
    print("layers:", [(l["id"], l.get("source-layer"), l.get("minzoom"), l.get("maxzoom")) for l in style["layers"]])
    lon, lat = -7.908, 38.571
    for z in (7, 12, 14, 15, 16):
        x = int((lon + 180) / 360 * 2 ** z)
        y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * 2 ** z)
        st, ct, body = get(f"https://api.panoramax.xyz/api/map/{z}/{x}/{y}.mvt", timeout=30)
        names = re.findall(rb"\x1a[\x01-\x7f]([a-z_]{4,20})", body[:4000])
        print(z, x, y, st, ct, len(body), sorted(set(n.decode() for n in names))[:10])
    st, _, body = get("https://api.panoramax.xyz/api/search?ids=5fe2c3b5-18de-4667-8d91-2c22770c2da4&limit=1", timeout=30)
    try:
        f = json.loads(body)["features"][0]
        print("search by id:", st, f.get("collection"), [l.get("rel") for l in f.get("links", [])])
    except Exception as e:  # noqa: BLE001
        print("search by id failed", st, e, body[:300])


def ofm_tiles():
    """OpenFreeMap: what a phone downloads to show business pins (whole tiles)."""
    section("OPENFREEMAP TILES")
    t0 = time.time()
    st, _, body = get("https://tiles.openfreemap.org/planet", timeout=30)
    print("tilejson", st, round(time.time() - t0, 2), "s", body[:300])
    tj = json.loads(body)
    url = tj["tiles"][0]
    print("minzoom", tj.get("minzoom"), "maxzoom", tj.get("maxzoom"))
    for name, lon, lat in (("Lisboa Baixa", -9.1394, 38.7139), ("Almada", -9.158, 38.679), ("Evora", -7.908, 38.571)):
        for z in (14,):
            x = int((lon + 180) / 360 * 2 ** z)
            y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * 2 ** z)
            for dx in (0, 1):
                t0 = time.time()
                req = urllib.request.Request(url.replace("{z}", str(z)).replace("{x}", str(x + dx)).replace("{y}", str(y)),
                                             headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
                try:
                    with urllib.request.urlopen(req, timeout=30) as r:
                        raw = r.read()
                        enc = r.headers.get("Content-Encoding")
                    size = len(gzip.decompress(raw)) if enc == "gzip" else len(raw)
                    print(name, z, x + dx, y, "wire", len(raw), "raw", size, enc, round(time.time() - t0, 2), "s")
                except Exception as e:  # noqa: BLE001
                    print(name, z, "failed", e)


def dgt_speed():
    """How long the DGT orthophoto WMS takes per tile, and whether a cached WMTS exists."""
    section("DGT SPEED")
    base = ("https://ortos.dgterritorio.gov.pt/wms/ortosat2023?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
            "&LAYERS=ortoSat2023-CorVerdadeira&STYLES=&CRS=EPSG:3857&FORMAT=image/vnd.jpeg-png8&TRANSPARENT=true")
    def bbox(z, x, y):
        n = 2 ** z
        size = 40075016.68557849 / n
        minx = -20037508.342789244 + x * size
        maxy = 20037508.342789244 - y * size
        return f"{minx},{maxy - size},{minx + size},{maxy}"
    lon, lat = -9.1394, 38.7139
    for z in (15, 16, 17, 18):
        x = int((lon + 180) / 360 * 2 ** z)
        y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * 2 ** z)
        for dx in range(3):
            for px in (256, 512):
                t0 = time.time()
                try:
                    st, ct, body = get(f"{base}&BBOX={bbox(z, x + dx, y)}&WIDTH={px}&HEIGHT={px}", timeout=60)
                    print("z", z, "x+", dx, "px", px, st, ct, len(body), round(time.time() - t0, 2), "s")
                except Exception as e:  # noqa: BLE001
                    print("z", z, "px", px, "failed", e, round(time.time() - t0, 2), "s")
    for url in ("https://ortos.dgterritorio.gov.pt/wmts/ortosat2023?SERVICE=WMTS&REQUEST=GetCapabilities",
                "https://ortos.dgterritorio.gov.pt/wmts?SERVICE=WMTS&REQUEST=GetCapabilities",
                "https://ortos.dgterritorio.gov.pt/wmts/ortosat2023/1.0.0/WMTSCapabilities.xml",
                "https://ortos.dgterritorio.gov.pt/geoserver/gwc/service/wmts?REQUEST=GetCapabilities",
                "https://ortos.dgterritorio.gov.pt/mapproxy/service?SERVICE=WMTS&REQUEST=GetCapabilities",
                "https://ortos.dgterritorio.gov.pt/"):
        t0 = time.time()
        try:
            st, ct, body = get(url, timeout=30)
            print(url, st, ct, len(body), round(time.time() - t0, 2), "s")
            text = body.decode("utf-8", "replace")
            print("  ", re.findall(r"<(?:ows:)?Identifier>([^<]{1,80})<", text)[:20])
            print("  ", re.findall(r"href=[\"']([^\"']{1,120})", text)[:30])
        except Exception as e:  # noqa: BLE001
            print(url, "failed", e)
    st, ct, body = get("https://ortos.dgterritorio.gov.pt/wms/ortosat2023?SERVICE=WMS&REQUEST=GetCapabilities", timeout=60)
    text = body.decode("utf-8", "replace")
    print("wms caps", st, len(body))
    for tag in ("TileSet", "tiled", "VendorSpecific", "MaxWidth", "Fees", "AccessConstraints"):
        i = text.find(tag)
        if i >= 0:
            print("  ", tag, text[i:i + 300].replace("\n", " "))


def dgt_wmts():
    """The DGT's GeoServer GeoWebCache: which layers it caches, and how fast a cached tile is."""
    section("DGT WMTS")
    st, ct, body = get("https://ortos.dgterritorio.gov.pt/geoserver/gwc/service/wmts?REQUEST=GetCapabilities", timeout=60)
    text = body.decode("utf-8", "replace")
    layers = re.findall(r"<Layer>.*?<ows:Identifier>([^<]+)</ows:Identifier>", text, re.S)
    print("layers", len(layers), layers[:80])
    sets = re.findall(r"<TileMatrixSet>\s*<ows:Identifier>([^<]+)</ows:Identifier>", text)
    print("matrix sets", sets[:30])
    for name in layers:
        if "orto" in name.lower() or "sat" in name.lower() or "2023" in name:
            i = text.find(f"<ows:Identifier>{name}</ows:Identifier>")
            chunk = text[i:i + 3000]
            print(name, re.findall(r"<Format>([^<]+)</Format>", chunk)[:5],
                  re.findall(r"<TileMatrixSet>([^<]+)</TileMatrixSet>", chunk)[:8],
                  re.findall(r'template="([^"]+)"', chunk)[:2])
    st, ct, body = get("https://ortos.dgterritorio.gov.pt/geoserver/ows?service=WMS&request=GetCapabilities", timeout=60)
    text = body.decode("utf-8", "replace")
    names = re.findall(r"<Name>([^<]+)</Name>", text)
    print("geoserver wms names", len(names), [n for n in names if "orto" in n.lower() or "sat" in n.lower()][:40])


def _varint(buf, i):
    shift = value = 0
    while True:
        b = buf[i]
        i += 1
        value |= (b & 0x7F) << shift
        if b < 0x80:
            return value, i
        shift += 7


def _fields(buf):
    """Top-level protobuf fields: (number, wire type, value or bytes)."""
    i = 0
    while i < len(buf):
        key, i = _varint(buf, i)
        num, wt = key >> 3, key & 7
        if wt == 0:
            v, i = _varint(buf, i)
        elif wt == 2:
            n, i = _varint(buf, i)
            v = buf[i:i + n]
            i += n
        elif wt == 1:
            v = buf[i:i + 8]
            i += 8
        elif wt == 5:
            v = buf[i:i + 4]
            i += 4
        else:
            return
        yield num, wt, v


def _gtfs_rt_summary(body):
    """Entities in a GTFS-RT FeedMessage, how many carry a vehicle, the header time."""
    entities = vehicles = 0
    stamp = None
    for num, _, v in _fields(body):
        if num == 1:
            for n2, _, v2 in _fields(v):
                if n2 == 3:
                    stamp = v2
        elif num == 2:
            entities += 1
            if any(n == 4 for n, _, _ in _fields(v)):
                vehicles += 1
    return entities, vehicles, stamp


def eu_feeds_compact_a():
    """The compact list for Austria to Finland only (the log is cut past ~300 lines)."""
    os.environ["EU_PAISES"] = "AT BE BG CY CZ DE DK EE ES FI"
    eu_feeds(compact=True)


def eu_feeds_compact_fr():
    """The compact list for France only: its first half was cut."""
    os.environ["EU_PAISES"] = "FR"
    eu_feeds(compact=True)


def eu_feeds_compact():
    """`eu_feeds`, printing only a short line per working source at the end."""
    eu_feeds(compact=True)


def eu_feeds(compact=False):
    """
    Every open EU source in scripts/eu-candidates.json (from the Mobility
    Database, scripts/eu-catalogue.py): does the producer's timetable address
    answer, with a real GTFS (stops.txt, stop_times.txt), how big, how many
    stops and trips, until when it runs; and do its live positions answer,
    with how many vehicles and how fresh. One "EU|" JSON line per source.
    """
    import concurrent.futures
    import csv
    import io
    import os
    import tempfile
    import zipfile

    section("EU FEEDS")
    with open(os.path.join(os.path.dirname(__file__), "eu-candidates.json"), encoding="utf-8") as f:
        candidates = json.load(f)
    only = os.environ.get("EU_PAISES", "").split()
    if only:
        candidates = [c for c in candidates if c["pais"] in only]

    def fetch_to_file(url):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        fd, path = tempfile.mkstemp(suffix=".zip")
        size = 0
        try:
            with urllib.request.urlopen(req, timeout=120) as r, os.fdopen(fd, "wb") as out:
                status, ctype = r.status, r.headers.get("Content-Type", "")
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk:
                        break
                    size += len(chunk)
                    out.write(chunk)
                    if size > 1_500_000_000:
                        raise RuntimeError("over 1.5 GB")
            return status, ctype, size, path
        except urllib.error.HTTPError as e:
            os.path.exists(path) and os.remove(path)
            return e.code, "", 0, None
        except Exception as e:  # noqa: BLE001
            os.path.exists(path) and os.remove(path)
            return None, str(e)[:80], 0, None

    def lines(z, name):
        try:
            with z.open(name) as f:
                return sum(1 for _ in f) - 1
        except KeyError:
            return None

    def last_day(z):
        best = ""
        for name, col in (("calendar.txt", "end_date"), ("calendar_dates.txt", "date")):
            try:
                with z.open(name) as f:
                    for row in csv.DictReader(io.TextIOWrapper(f, "utf-8-sig")):
                        d = (row.get(col) or "").strip()
                        if d > best:
                            best = d
            except KeyError:
                pass
        return best

    def one(c):
        r = {"mdb": c["mdb"], "pais": c["pais"], "operador": c["operador"][:60], "local": c["local"][:40]}
        for label, url in (("url", c["url"]), ("copia", c.get("copia"))):
            if not url:
                continue
            status, ctype, size, path = fetch_to_file(url)
            r[label] = {"estado": status, "mb": round(size / 1e6, 1)}
            if not path:
                r[label]["erro"] = ctype
                continue
            try:
                with zipfile.ZipFile(path) as z:
                    names = set(z.namelist())
                    if "stops.txt" not in names or "stop_times.txt" not in names:
                        r[label]["erro"] = "not a GTFS"
                    else:
                        r[label].update(
                            paragens=lines(z, "stops.txt"),
                            viagens=lines(z, "trips.txt"),
                            linhas=lines(z, "routes.txt"),
                            ate=last_day(z),
                        )
            except zipfile.BadZipFile:
                r[label]["erro"] = "not a zip"
            finally:
                os.remove(path)
            if "paragens" in r[label]:
                break  # the producer's own address works: no need for the copy
        r["posicoes"] = []
        for url in c.get("posicoes") or []:
            status, ctype, body = get(url, timeout=30)
            p = {"url": url[:120], "estado": status, "kb": round(len(body) / 1e3, 1)}
            if status == 200:
                try:
                    ents, veh, stamp = _gtfs_rt_summary(body)
                    p.update(entidades=ents, veiculos=veh,
                             idade_s=None if stamp is None else round(time.time() - stamp))
                except Exception as e:  # noqa: BLE001
                    p["erro"] = f"not GTFS-RT: {e}"[:60]
            r["posicoes"].append(p)
        return r

    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        results = []
        for r in pool.map(one, candidates):
            results.append(r)
            if not compact:
                print("EU|" + json.dumps(r, ensure_ascii=False), flush=True)
    if not compact:
        return
    # One line per source that gave a real GTFS, and one per live feed with
    # buses reported in the last ten minutes. Fields split by "|".
    for r in sorted(results, key=lambda x: (x["pais"], x["local"], x["operador"])):
        for label in ("url", "copia"):
            g = r.get(label) or {}
            if "paragens" in g:
                print(f"OK|{r['mdb']}|{r['pais']}|{r['local']}|{r['operador']}|{label}|"
                      f"{g['mb']}MB|{g['paragens']}st|{g['viagens']}tr|{g['ate']}")
                break
        for p in r["posicoes"]:
            if p.get("veiculos") and (p.get("idade_s") is None or p["idade_s"] < 600):
                print(f"VP|{r['mdb']}|{r['pais']}|{r['local']}|{r['operador']}|"
                      f"{p['veiculos']}v|{p.get('idade_s')}s|{p['kb']}kB|{p['url']}")


# Open orthophoto services of EU countries, to try (author's request, 20 November
# 2026: "the orthophoto maps of each EU country", as the DGT's and the PNOA). Each:
# country, name, kind (wms / wmts / xyz), address, layer (for WMS; a guess if
# unknown, the capabilities say), and a test point (lat, lon) in a city.
EU_ORTHOS = [
    ("FR", "IGN Géoplateforme WMTS", "wmts", "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetCapabilities", "ORTHOIMAGERY.ORTHOPHOTOS", (48.8566, 2.3522)),
    ("FR", "IGN Géoplateforme WMS", "wms", "https://data.geopf.fr/wms-r/wms", "HR.ORTHOIMAGERY.ORTHOPHOTOS", (48.8566, 2.3522)),
    ("NL", "PDOK Luchtfoto WMS", "wms", "https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0", "Actueel_orthoHR", (52.3702, 4.8952)),
    ("NL", "PDOK Luchtfoto WMTS", "wmts", "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0?request=GetCapabilities&service=wmts", "Actueel_orthoHR", (52.3702, 4.8952)),
    ("BE", "Vlaanderen orthofoto WMS", "wms", "https://geo.api.vlaanderen.be/omw/wms", "", (51.0543, 3.7174)),
    ("BE", "Vlaanderen OMZ WMS", "wms", "https://geo.api.vlaanderen.be/OMZ/wms", "", (51.2194, 4.4025)),
    ("BE", "Wallonie ortho WMS", "wms", "https://geoservices.wallonie.be/arcgis/services/IMAGERIE/ORTHO_LAST/MapServer/WMSServer", "", (50.6326, 5.5797)),
    ("BE", "Bruxelles UrbIS ortho WMS", "wms", "https://geoservices-urbis.irisnet.be/geoserver/ows", "", (50.8467, 4.3525)),
    ("LU", "Geoportail.lu WMTS", "wmts", "https://wmts1.geoportail.lu/opendata/service?SERVICE=WMTS&REQUEST=GetCapabilities", "ortho_latest", (49.6116, 6.1319)),
    ("LU", "Geoportail.lu WMS", "wms", "https://wms.geoportail.lu/opendata/service", "ortho_latest", (49.6116, 6.1319)),
    ("AT", "basemap.at orthofoto", "xyz", "https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg", "", (48.2082, 16.3738)),
    ("AT", "basemap.at WMTS", "wmts", "https://mapsneu.wien.gv.at/basemapneu/1.0.0/WMTSCapabilities.xml", "bmaporthofoto30cm", (48.2082, 16.3738)),
    ("DE-NW", "NRW DOP WMS", "wms", "https://www.wms.nrw.de/geobasis/wms_nw_dop", "nw_dop_rgb", (50.9375, 6.9603)),
    ("DE-BY", "Bayern DOP20 WMS", "wms", "https://geoservices.bayern.de/od/wms/dop/v1/dop20", "by_dop20c", (48.1372, 11.5756)),
    ("DE-BB", "Berlin/Brandenburg DOP20 WMS", "wms", "https://isk.geobasis-bb.de/mapproxy/dop20c/service/wms", "bebb_dop20c", (52.5200, 13.4050)),
    ("DE-SN", "Sachsen DOP WMS", "wms", "https://geodienste.sachsen.de/wms_geosn_dop-rgb/guest", "sn_dop_020", (51.0504, 13.7373)),
    ("DE-HH", "Hamburg DOP WMS", "wms", "https://geodienste.hamburg.de/HH_WMS_DOP", "", (53.5511, 9.9937)),
    ("DE-NI", "Niedersachsen DOP WMS", "wms", "https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms", "", (52.3759, 9.7320)),
    ("DE-HE", "Hessen DOP WMS", "wms", "https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows", "", (50.1109, 8.6821)),
    ("DE-TH", "Thüringen DOP WMS", "wms", "https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP", "", (50.9848, 11.0299)),
    ("DE-BW", "Baden-Württemberg DOP WMS", "wms", "https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C", "", (48.7758, 9.1829)),
    ("DE-ST", "Sachsen-Anhalt DOP WMS", "wms", "https://www.geodatenportal.sachsen-anhalt.de/wss/service/ST_LVermGeo_DOP_WMS_OpenData/guest", "", (52.1205, 11.6276)),
    ("DE-SH", "Schleswig-Holstein DOP WMS", "wms", "https://service.gdi-sh.de/WMS_SH_DOP20col_OpenGBD", "", (54.3233, 10.1228)),
    ("DE-MV", "Mecklenburg-Vorpommern DOP WMS", "wms", "https://www.geodaten-mv.de/dienste/adv_dop", "", (54.0924, 12.0991)),
    ("DE-RP", "Rheinland-Pfalz DOP WMS", "wms", "https://geo4.service24.rlp.de/wms/rp_dop20.fcgi", "", (49.9929, 8.2473)),
    ("DE-SL", "Saarland DOP WMS", "wms", "https://geoportal.saarland.de/freewms/dop2022", "", (49.2402, 6.9969)),
    ("DE-HB", "Bremen DOP WMS", "wms", "https://geodienste.bremen.de/wms_dop_lb", "", (53.0793, 8.8017)),
    ("CZ", "ČÚZK Ortofoto WMS", "wms", "https://ags.cuzk.cz/arcgis1/services/ORTOFOTO/MapServer/WMSServer", "0", (50.0755, 14.4378)),
    ("PL", "Geoportal ORTO WMS", "wms", "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution", "Raster", (52.2297, 21.0122)),
    ("PL", "Geoportal ORTO HR WMS", "wms", "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution", "Raster", (52.2297, 21.0122)),
    ("SK", "ZBGIS ortofoto WMS", "wms", "https://zbgisws.skgeodesy.sk/zbgis_ortofoto_wms/service.svc/get", "", (48.1486, 17.1077)),
    ("SI", "GURS DOF WMS", "wms", "https://ipi.eprostor.gov.si/wms-si-gurs-dts/wms", "", (46.0569, 14.5058)),
    ("HR", "DGU orthophoto WMS", "wms", "https://geoportal.dgu.hr/services/inspire/orthophoto_2021_2022/ows", "", (45.8150, 15.9819)),
    ("HR", "DGU DOF WMS", "wms", "https://geoportal.dgu.hr/services/dof/ows", "", (45.8150, 15.9819)),
    ("EE", "Maa-amet fotokaart WMS", "wms", "https://kaart.maaamet.ee/wms/fotokaart", "EESTIFOTO", (59.4370, 24.7536)),
    ("EE", "Maa-amet foto tiles", "xyz", "https://tiles.maaamet.ee/tm/tms/1.0.0/foto@GMC/{z}/{x}/{ty}.png", "", (59.4370, 24.7536)),
    ("LV", "LVM ortofoto WMS", "wms", "https://lvmgeoserver.lvm.lv/geoserver/ows", "", (56.9496, 24.1052)),
    ("LT", "Geoportal.lt ortofoto WMS", "wms", "https://www.geoportal.lt/mapproxy/gisc_ortofoto/wms", "", (54.6872, 25.2797)),
    ("IT", "PCN ortofoto 2012 WMS", "wms", "http://wms.pcn.minambiente.it/ogc?map=/ms_ogc/WMS_v1.3/raster/ortofoto_colore_12.map", "", (41.9028, 12.4964)),
    ("GR", "Ktimatologio WMS", "wms", "http://gis.ktimanet.gr/wms/wmsopen/wmsserver.aspx", "", (37.9838, 23.7275)),
    ("CY", "DLS orthophoto WMS", "wms", "https://eservices.dls.moi.gov.cy/inspire/services/INSPIRE/OI_Orthoimagery/MapServer/WMSServer", "", (35.1856, 33.3823)),
    ("FI", "MML ortokuva WMTS (key?)", "wmts", "https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/WMTSCapabilities.xml", "ortokuva", (60.1699, 24.9384)),
    ("DK", "Dataforsyningen ortofoto (token?)", "wms", "https://api.dataforsyningen.dk/orto_foraar_DAF", "", (55.6761, 12.5683)),
    ("SE", "Lantmäteriet ortofoto (open?)", "wms", "https://minkarta.lantmateriet.se/map/ortofoto/", "", (59.3293, 18.0686)),
    ("IE", "Tailte Éireann (open?)", "wms", "https://maps.tailte.ie/arcgis/services/Basemaps/Ortho/MapServer/WMSServer", "", (53.3498, -6.2603)),
    ("RO", "ANCPI ortofoto WMS", "wms", "https://geoportal.ancpi.ro/maps/services/Ortofoto/MapServer/WMSServer", "", (44.4268, 26.1025)),
    ("HU", "Lechner ortofoto (open?)", "wms", "https://inspire.lechnerkozpont.hu/geoserver/OI/wms", "", (47.4979, 19.0402)),
    ("BG", "Cadastre ortophoto (open?)", "wms", "https://inspire.cadastre.bg/arcgis/services/Orthophoto/MapServer/WMSServer", "", (42.6977, 23.3219)),
    ("MT", "Planning Authority ortho (open?)", "wms", "https://geoserver.pa.org.mt/geoserver/ows", "", (35.8989, 14.5146)),
]


def _merc(lat, lon):
    x = lon * 20037508.34 / 180
    y = math.log(math.tan((90 + lat) * math.pi / 360)) / (math.pi / 180) * 20037508.34 / 180
    return x, y


def _tile(lat, lon, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def _root_of(host):
    import subprocess
    try:
        out = subprocess.run(["openssl", "s_client", "-connect", f"{host}:443", "-servername", host, "-showcerts"],
                             input=b"", capture_output=True, timeout=20).stdout.decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return "?"
    issuers = re.findall(r"^\s*i:(.*)$", out, re.M)
    return issuers[-1].strip()[:90] if issuers else "?"


def eu_orthos():
    """
    Each candidate orthophoto service: does it answer without a key, which
    layers look like orthophotos, which formats and Web Mercator support, does
    a 512 px tile at a city come back as an image (and how heavy), and which root
    its certificate chain ends on (old Androids). One "ORTO|" JSON line each.
    """
    section("EU ORTHOS")
    for country, name, kind, url, layer, (lat, lon) in EU_ORTHOS:
        r = {"pais": country, "nome": name, "tipo": kind, "url": url}
        host = urllib.parse.urlparse(url).hostname
        r["https"] = url.startswith("https")
        if r["https"]:
            r["raiz"] = _root_of(host)
        if kind == "xyz":
            z = 17
            x, y = _tile(lat, lon, z)
            t = url.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y)).replace("{ty}", str(2 ** z - 1 - y))
            st, ct, body = get(t, timeout=40)
            r["tile"] = {"estado": st, "tipo": ct, "kb": round(len(body) / 1e3, 1)}
        elif kind == "wmts":
            st, ct, body = get(url, timeout=60)
            text = body.decode("utf-8", "replace")
            r["caps"] = st
            layers = re.findall(r"<Layer>.*?<ows:Identifier>([^<]+)</ows:Identifier>", text, re.S)
            r["camadas"] = [l for l in layers if re.search(r"orto|ortho|foto|photo|luchtfoto|dop|ortokuva", l, re.I)][:15] or layers[:15]
            r["matrizes"] = sorted(set(re.findall(r"<TileMatrixSet>([^<]+)</TileMatrixSet>", text)))[:12]
            tpl = re.findall(r'template="([^"]+)"', text)
            want = [t for t in tpl if layer and layer in t] or tpl
            r["modelo"] = want[0][:200] if want else None
        else:
            sep = "&" if "?" in url else "?"
            st, ct, body = get(f"{url}{sep}SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0", timeout=60)
            text = body.decode("utf-8", "replace")
            r["caps"] = st
            names = re.findall(r"<Name>([^<]+)</Name>", text)
            r["camadas"] = [n for n in names if re.search(r"orto|ortho|foto|photo|dop|oi\.|luchtfoto|raster|ortofoto", n, re.I)][:20] or names[:20]
            r["formatos"] = sorted(set(re.findall(r"<Format>(image/[^<]+)</Format>", text)))[:10]
            r["3857"] = "EPSG:3857" in text
            r["acesso"] = (re.findall(r"<AccessConstraints>([^<]{0,200})", text) or [""])[0]
            r["taxas"] = (re.findall(r"<Fees>([^<]{0,120})", text) or [""])[0]
            use = layer or (r["camadas"][0] if r["camadas"] else "")
            if use and st == 200:
                x, y = _merc(lat, lon)
                h = 300  # metres each side: about zoom 17 at 512 px
                crs = "EPSG:3857" if r["3857"] else "EPSG:4326"
                if crs == "EPSG:3857":
                    bbox = f"{x - h},{y - h},{x + h},{y + h}"
                else:
                    d = h / 111320
                    bbox = f"{lat - d},{lon - d},{lat + d},{lon + d}"
                for fmt in ("image/vnd.jpeg-png8", "image/jpeg", "image/png"):
                    q = (f"{url}{sep}SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={urllib.parse.quote(use)}"
                         f"&STYLES=&CRS={crs}&BBOX={bbox}&WIDTH=512&HEIGHT=512&FORMAT={fmt}&TRANSPARENT=true")
                    st2, ct2, body2 = get(q, timeout=60)
                    r.setdefault("mapa", []).append({"formato": fmt, "estado": st2, "tipo": ct2, "kb": round(len(body2) / 1e3, 1),
                                                     "erro": body2[:120].decode("utf-8", "replace") if not ct2.startswith("image") else ""})
                    if st2 == 200 and ct2.startswith("image"):
                        break
                r["camada_usada"] = use
        print("ORTO|" + json.dumps(r, ensure_ascii=False), flush=True)



def geofabrik_zones_compact():
    """`geofabrik_zones` for the countries of map-regions.json only, short lines."""
    geofabrik_zones(compact=True)


def geofabrik_zones_ac():
    """The compact list's first part only (ids up to "cataluna"), for a short log."""
    geofabrik_zones(compact=True, upto="cataluna")


def geofabrik_zones(compact=False, upto=None):
    """
    Geofabrik's sub-regions of every country (author's request, 20 November
    2026: maps by zone — Alentejo, Norte… — and per administrative area in
    other countries). Each Geofabrik extract has a polygon, published, that
    `pmtiles extract --region` can cut with. One "GF|" JSON line per child of a
    country: id, parent, name, bbox (west, south, east, north), and whether it
    has children of its own.
    """
    section("GEOFABRIK ZONES")
    for attempt in range(4):
        st, ct, body = get("https://download.geofabrik.de/index-v1.json", timeout=120)
        print("index:", st, len(body), ct[:80], body[:120] if st != 200 else b"")
        if st == 200:
            break
        time.sleep(10 * (attempt + 1))
    if st != 200:
        return
    feats = json.loads(body)["features"]
    by_id = {f["properties"]["id"]: f for f in feats}
    parents = {f["properties"].get("parent") for f in feats}
    continents = {f["properties"]["id"] for f in feats if not f["properties"].get("parent")}

    def bbox(geom):
        xs, ys = [], []
        def walk(c):
            if isinstance(c[0], (int, float)):
                xs.append(c[0]); ys.append(c[1])
            else:
                for k in c:
                    walk(k)
        walk(geom["coordinates"])
        return [round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)]

    wanted = None
    if compact:
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "..", "map-regions.json"), encoding="utf-8") as fh:
            cat = json.load(fh)["regioes"]
        wanted = {r["geofabrik"].split("/")[-1] for r in cat if r.get("geofabrik")}
    for f in feats:
        p = f["properties"]
        parent = p.get("parent")
        if not parent or parent in continents or parent not in by_id:
            continue
        if wanted is not None:
            grand = by_id[parent]["properties"].get("parent")
            if parent not in wanted or grand not in continents:
                continue
            if upto and p["id"] >= upto:
                continue
            name = re.sub(r"<br\s*/?>.*", "", p.get("name") or "")
            b = bbox(f["geometry"]) if f.get("geometry") else None
            print(f"Z|{parent}|{p['id']}|{name}|{','.join(map(str, b)) if b else ''}"
                  f"{'|+' if p['id'] in parents else ''}")
            continue
        # A child of a country (its parent's parent is a continent), or one
        # level below for countries split twice (England's counties, Bayern's
        # Regierungsbezirke).
        grand = by_id[parent]["properties"].get("parent")
        depth = 2 if grand in continents else 3
        print("GF|" + json.dumps({
            "id": p["id"], "pai": parent, "nivel": depth, "nome": p.get("name"),
            "bbox": bbox(f["geometry"]) if f.get("geometry") else None,
            "filhos": p["id"] in parents,
            "pbf": p.get("urls", {}).get("pbf"),
        }, ensure_ascii=False), flush=True)



# The orthophoto services that answered in eu_orthos, each with a point inside
# and a point just across its border (in a neighbour, inside its rectangle).
# kind, address (WMS base, or tile template), layer, inside (lat, lon), outside.
EU_ORTHOS2 = [
    ("FR", "wmts", "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg", "", (48.8566, 2.3522), (41.3874, 2.1686)),
    ("FR", "wms", "https://data.geopf.fr/wms-r/wms", "HR.ORTHOIMAGERY.ORTHOPHOTOS", (48.8566, 2.3522), (41.3874, 2.1686)),
    ("NL", "xyz", "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg", "", (52.3702, 4.8952), (51.2194, 4.4025)),
    ("NL", "wms", "https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0", "Actueel_orthoHR", (52.3702, 4.8952), (51.2194, 4.4025)),
    ("BE-WAL", "wms", "https://geoservices.wallonie.be/arcgis/services/IMAGERIE/ORTHO_LAST/MapServer/WMSServer", "0", (50.6326, 5.5797), (50.8514, 5.6909)),
    ("BE-VLA", "wms", "https://geo.api.vlaanderen.be/omw/wms", "OMWRGB25VL", (51.0543, 3.7174), (50.6292, 3.0573)),
    ("LU", "wms", "https://wms.geoportail.lu/opendata/service", "ortho_latest", (49.6116, 6.1319), (49.6833, 5.8167)),
    ("AT", "xyz", "https://mapsneu.wien.gv.at/basemap/bmaporthofoto30cm/normal/google3857/{z}/{y}/{x}.jpeg", "", (48.2082, 16.3738), (48.1486, 17.1077)),
    ("DE-NW", "wms", "https://www.wms.nrw.de/geobasis/wms_nw_dop", "nw_dop_rgb", (50.9375, 6.9603), (51.3704, 6.1724)),
    ("DE-BY", "wms", "https://geoservices.bayern.de/od/wms/dop/v1/dop20", "by_dop20c", (48.1372, 11.5756), (47.8095, 13.0550)),
    ("DE-BB", "wms", "https://isk.geobasis-bb.de/mapproxy/dop20c/service/wms", "bebb_dop20c", (52.5200, 13.4050), (53.4285, 14.5528)),
    ("DE-SN", "wms", "https://geodienste.sachsen.de/wms_geosn_dop-rgb/guest", "sn_dop_020", (51.0504, 13.7373), (50.6607, 14.0323)),
    ("DE-HE", "wms", "https://www.gds-srv.hessen.de/cgi-bin/lika-services/ogc-free-images.ows", "he_dop20_rgb", (50.1109, 8.6821), (49.7913, 9.9534)),
    ("DE-TH", "wms", "https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP", "th_dop", (50.9848, 11.0299), (51.3127, 9.4797)),
    ("DE-BW", "wms", "https://owsproxy.lgl-bw.de/owsproxy/ows/WMS_LGL-BW_ATKIS_DOP_20_C", "IMAGES_DOP_20_RGB", (48.7758, 9.1829), (48.5734, 7.7521)),
    ("DE-ST", "wms", "https://www.geodatenportal.sachsen-anhalt.de/wss/service/ST_LVermGeo_DOP_WMS_OpenData/guest", "lsa_lvermgeo_dop20_2", (52.1205, 11.6276), (52.2689, 10.5268)),
    ("DE-SH", "wms", "https://service.gdi-sh.de/WMS_SH_DOP20col_OpenGBD", "sh_dop20_rgb", (54.3233, 10.1228), (53.5511, 9.9937)),
    ("DE-MV", "wms", "https://www.geodaten-mv.de/dienste/adv_dop", "mv_dop", (54.0924, 12.0991), (53.4285, 14.5528)),
    ("DE-RP", "wms", "https://geo4.service24.rlp.de/wms/rp_dop20.fcgi", "rp_dop20", (49.9929, 8.2473), (50.0782, 8.2398)),
    ("DE-SL", "wms", "https://geoportal.saarland.de/freewms/dop2022", "sl_dop20_rgb", (49.2402, 6.9969), (49.1193, 6.1757)),
    ("DE-HB", "wms", "https://geodienste.bremen.de/wms_dop_lb", "DOP Luftbilder Land Bremen", (53.0793, 8.8017), (53.0505, 8.6316)),
    ("DE-NI", "wms", "https://opendata.lgln.niedersachsen.de/doorman/noauth/dop_wms", "ni_dop20", (52.3759, 9.7320), (53.0793, 8.8017)),
    ("CZ", "wms", "https://ags.cuzk.cz/arcgis1/services/ORTOFOTO/MapServer/WMSServer", "0", (50.0755, 14.4378), (51.0504, 13.7373)),
    ("PL", "wms", "https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution", "Raster", (52.2297, 21.0122), (52.3471, 14.5506)),
    ("EE", "xyz", "https://tiles.maaamet.ee/tm/tms/1.0.0/foto@GMC/{z}/{x}/{ty}.png", "", (59.4370, 24.7536), (57.8667, 24.3600)),
]


def eu_orthos2():
    """
    For each orthophoto service that answered: a tile inside and a tile just
    across its border, in each format it might be asked in. A uniform tile
    (white, black, transparent) is a few kB; imagery tens. "Outside" decides
    whether the service can be drawn over its neighbours: a big opaque JPEG
    there means squares of nothing over the neighbour's map.
    """
    section("EU ORTHOS 2")
    z = 16
    for country, kind, url, layer, inside, outside in EU_ORTHOS2:
        r = {"pais": country, "tipo": kind}
        for where, (lat, lon) in (("dentro", inside), ("fora", outside)):
            if kind in ("xyz", "wmts"):
                x, y = _tile(lat, lon, z)
                t = url.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y)).replace("{ty}", str(2 ** z - 1 - y))
                t0 = time.time()
                st, ct, body = get(t, timeout=40)
                r[where] = f"{st} {ct.split(';')[0]} {len(body) / 1e3:.1f}kB {time.time() - t0:.1f}s"
                continue
            mx, my = _merc(lat, lon)
            h = 20037508.34 * 2 / 2 ** z / 2  # half a z16 tile, in metres
            bbox = f"{mx - h},{my - h},{mx + h},{my + h}"
            out = []
            for fmt in ("image/vnd.jpeg-png8", "image/vnd.jpeg-png", "image/jpeg", "image/png"):
                q = (f"{url}{'&' if '?' in url else '?'}SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={urllib.parse.quote(layer)}"
                     f"&STYLES=&CRS=EPSG:3857&BBOX={bbox}&WIDTH=512&HEIGHT=512&FORMAT={urllib.parse.quote(fmt)}&TRANSPARENT=true")
                t0 = time.time()
                st, ct, body = get(q, timeout=40)
                ok = st == 200 and ct.startswith("image")
                out.append(f"{fmt.split('/')[1]}:{(ct.split('/')[-1].split(';')[0] + ' ' + format(len(body) / 1e3, '.1f') + 'kB ' + format(time.time() - t0, '.1f') + 's') if ok else 'X' + str(st)}")
            r[where] = " ; ".join(out)
        print("O2|" + json.dumps(r, ensure_ascii=False), flush=True)


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
