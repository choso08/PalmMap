#!/usr/bin/env python3
"""
Turns an `osmium export` of named businesses into the app's compact,
random-access business file (`<region>.pois`).

Why a file of our own, and not the `pois` layer of the downloaded map: the
Protomaps map keeps only a handful of places per tile at the zoom the
countries are cut at — about forty in the busiest tile of São Tomé. The app
wants every named business, with hours, phone and website, and without
network.

Why not Overpass: asking Overpass for a whole country is exactly the bulk use
its rules forbid. The data comes from Geofabrik's daily extract instead, which
is published to be downloaded whole.

## File format (v1)

    <10-digit header length><header JSON>\n<cell blocks...>

The header is `{"v":1,"grid":G,"gerado":"YYYY-MM-DD","count":N,"cells":{"ix,iy":[offset,length],...}}`,
with offsets counted from the first byte after the header line. Each cell
block is a JSON array of places:

    [lon, lat, name, key, value, hours, phone, website, osm, address]

`ix = floor(lon / G)`, `iy = floor(lat / G)`. The app reads the header once
and then only the cells in view — Portugal is tens of megabytes, and reading
it whole into a phone's memory to show twenty pins would be absurd.

Usage: build-pois.py <export.geojsonseq> <bbox w,s,e,n> <out.pois>
"""
import datetime
import json
import math
import sys

GRID = 0.02

# The main keys, in the order the app's `categoryLabel` reads them.
MAIN_KEYS = ("amenity", "shop", "tourism", "leisure", "office", "craft", "healthcare")

# Values that are named but are not a place anyone looks for on a map.
SKIP = {
    ("amenity", "bench"), ("amenity", "waste_basket"), ("amenity", "parking_space"),
    ("amenity", "bicycle_parking"), ("amenity", "vending_machine"), ("amenity", "grit_bin"),
    ("amenity", "recycling"), ("amenity", "shelter"), ("amenity", "drinking_water"),
    ("amenity", "toilets"), ("amenity", "fountain"), ("amenity", "clock"),
    ("leisure", "pitch"), ("leisure", "playground"), ("leisure", "garden"),
    ("leisure", "picnic_table"), ("leisure", "swimming_pool"), ("leisure", "track"),
    ("shop", "vacant"), ("shop", "no"), ("amenity", "disused"),
}


def centre(geometry):
    """A point for any geometry: the point itself, or the average of the outer ring."""
    kind = geometry.get("type")
    coords = geometry.get("coordinates")
    if kind == "Point":
        return coords
    if kind == "Polygon":
        ring = coords[0]
    elif kind == "MultiPolygon":
        ring = max((p[0] for p in coords), key=len)
    elif kind == "LineString":
        ring = coords
    else:
        return None
    if not ring:
        return None
    return [sum(c[0] for c in ring) / len(ring), sum(c[1] for c in ring) / len(ring)]


def closed(tags):
    """Places OpenStreetMap marks as no longer there."""
    if tags.get("opening_hours", "").strip().lower() in ("closed", "off"):
        return True
    end = tags.get("end_date")
    if end:
        try:
            if end[:10] < datetime.date.today().isoformat():
                return True
        except Exception:  # noqa: BLE001
            pass
    return False


def main():
    src, bbox, out = sys.argv[1], sys.argv[2], sys.argv[3]
    west, south, east, north = (float(x) for x in bbox.split(","))
    cells = {}
    count = 0
    with open(src, encoding="utf-8") as f:
        for line in f:
            line = line.strip().lstrip("\x1e")
            if not line:
                continue
            try:
                feature = json.loads(line)
            except json.JSONDecodeError:
                continue
            tags = feature.get("properties") or {}
            name = tags.get("name")
            if not name:
                continue
            main_kv = next(((k, tags[k]) for k in MAIN_KEYS if k in tags), None)
            if not main_kv or main_kv in SKIP or closed(tags):
                continue
            point = centre(feature.get("geometry") or {})
            if not point:
                continue
            lon, lat = point
            if not (west <= lon <= east and south <= lat <= north):
                continue
            osm = str(feature.get("id") or tags.get("@id") or "")
            address = ", ".join(
                p for p in (
                    " ".join(x for x in (tags.get("addr:street"), tags.get("addr:housenumber")) if x),
                    tags.get("addr:postcode"),
                    tags.get("addr:city"),
                ) if p
            )
            record = [
                round(lon, 5), round(lat, 5), name, main_kv[0], main_kv[1],
                tags.get("opening_hours") or "",
                tags.get("phone") or tags.get("contact:phone") or "",
                tags.get("website") or tags.get("contact:website") or "",
                osm, address,
            ]
            # Trailing empty fields cost bytes in a file of hundreds of
            # thousands of records; the app treats missing as empty.
            while record and record[-1] == "":
                record.pop()
            key = f"{math.floor(lon / GRID)},{math.floor(lat / GRID)}"
            cells.setdefault(key, []).append(record)
            count += 1

    blocks = []
    index = {}
    offset = 0
    for key in sorted(cells):
        data = json.dumps(cells[key], ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        index[key] = [offset, len(data)]
        blocks.append(data)
        offset += len(data)

    header = json.dumps(
        {"v": 1, "grid": GRID, "gerado": datetime.date.today().isoformat(), "count": count, "cells": index},
        separators=(",", ":"),
    ).encode("utf-8") + b"\n"
    with open(out, "wb") as f:
        f.write(f"{len(header):010d}".encode())
        f.write(header)
        for b in blocks:
            f.write(b)
    print(f"{out}: {count} places in {len(cells)} cells, {offset / 1048576:.1f} MB")


if __name__ == "__main__":
    main()
