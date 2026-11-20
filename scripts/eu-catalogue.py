#!/usr/bin/env python3
"""
Candidate transport sources for the European Union, from the Mobility
Database catalogue (MobilityData/mobility-database-catalogs on GitHub).

Keeps what the app may use: active, open (no key: authentication_type 0) —
the project puts no credential in the APK — in the 27 EU countries. Writes
`eu-candidates.json` (the timetables, and the live vehicle positions linked
to them) for `probe.py eu_feeds` to try from GitHub Actions, where the
producers' servers can be reached.

    git clone --depth 1 https://github.com/MobilityData/mobility-database-catalogs.git /tmp/mdb
    python3 scripts/eu-catalogue.py /tmp/mdb > scripts/eu-candidates.json
"""
import glob
import json
import os
import sys

EU = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split()


def is_open(urls):
    return str(urls.get("authentication_type", 0)) == "0"


def main(root):
    base = os.path.join(root, "catalogs", "sources", "gtfs")
    schedules = {}
    for path in glob.glob(os.path.join(base, "schedule", "*.json")):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        loc = d.get("location") or {}
        if loc.get("country_code") not in EU or d.get("status") in ("deprecated", "inactive"):
            continue
        urls = d.get("urls") or {}
        if not is_open(urls) or not urls.get("direct_download"):
            continue
        box = loc.get("bounding_box") or {}
        schedules[str(d["mdb_source_id"])] = {
            "mdb": d["mdb_source_id"],
            "pais": loc["country_code"],
            "operador": d.get("provider", ""),
            "nome": d.get("name", ""),
            "local": loc.get("municipality") or loc.get("subdivision_name") or "",
            "oficial": d.get("is_official") in (True, "True"),
            "url": urls["direct_download"],
            "copia": urls.get("latest", ""),
            "licenca": urls.get("license", ""),
            "bbox": [box.get("minimum_longitude"), box.get("minimum_latitude"),
                     box.get("maximum_longitude"), box.get("maximum_latitude")],
            "posicoes": [],
        }
    for path in glob.glob(os.path.join(base, "realtime", "*.json")):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        if "vp" not in (d.get("entity_type") or []) or d.get("status") in ("deprecated", "inactive"):
            continue
        urls = d.get("urls") or {}
        if not is_open(urls) or not urls.get("direct_download"):
            continue
        for ref in d.get("static_reference") or []:
            if str(ref) in schedules:
                schedules[str(ref)]["posicoes"].append(urls["direct_download"])
    out = sorted(schedules.values(), key=lambda s: (s["pais"], s["operador"]))
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    print()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/mdb")
