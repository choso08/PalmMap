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
        ("OSM tile (map, dark)", "https://tile.openstreetmap.org/14/7773/6178.png", "image"),
        ("EOX Sentinel-2 2025", "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/12/1554/1943.jpg", "image"),
        ("DGT orthophotos", "https://ortos.dgterritorio.gov.pt/wms/ortosat2023?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
            f"&LAYERS=ortoSat2023-CorVerdadeira&STYLES=&CRS=EPSG:3857&BBOX={x0},{y0},{x1},{y1}"
            "&WIDTH=512&HEIGHT=512&FORMAT=image/jpeg&TRANSPARENT=false", "image"),
        ("OePNVKarte transport", "https://tileserver.memomaps.de/tilegen/14/7773/6178.png", "image"),
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
