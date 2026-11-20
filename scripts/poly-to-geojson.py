#!/usr/bin/env python3
"""
Turns an Osmosis .poly outline (the format Geofabrik publishes beside every
extract) into GeoJSON, for `pmtiles extract --region`.

Usage: poly-to-geojson.py <in.poly> <out.geojson>

A .poly file is a name line, then sections: a section name (starting with "!"
for a hole), "lon lat" lines, "END"; and a last "END". Holes are left out on
purpose: a zone's map then also carries the tiles of an enclave inside it,
which costs little and leaves no hole in the map. Standard library only.
"""

import json
import sys


def read_poly(path):
    with open(path, encoding="utf-8") as fh:
        lines = [line.strip() for line in fh]
    rings = []
    i = 1  # the first line is the file's name
    while i < len(lines):
        name = lines[i]
        i += 1
        if name == "END" or not name:
            continue
        ring = []
        while i < len(lines) and lines[i] != "END":
            parts = lines[i].split()
            if len(parts) >= 2:
                ring.append([float(parts[0]), float(parts[1])])
            i += 1
        i += 1  # the section's END
        if name.startswith("!") or len(ring) < 3:
            continue
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        rings.append(ring)
    return rings


def main():
    src, out = sys.argv[1], sys.argv[2]
    rings = read_poly(src)
    if not rings:
        sys.exit(f"{src}: no outline in it")
    feature = {
        "type": "Feature",
        "properties": {},
        "geometry": {"type": "MultiPolygon", "coordinates": [[ring] for ring in rings]},
    }
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(feature, fh)
    print(f"{src}: {len(rings)} ring(s), {sum(len(r) for r in rings)} points")


if __name__ == "__main__":
    main()
