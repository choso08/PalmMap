# Privacy

PalmMap has **no server, no account, no analytics, no ads and no crash reporting** that leaves
the phone. All of its code is in this repository, so everything below can be checked.

What it stores lives on the phone, in the app's private storage. Android deletes it when the app
is uninstalled, and **Android's cloud backup is turned off** (`allowBackup: false`), so none of it
goes to Google's servers.

## What leaves the phone, and to whom

The app needs public services to draw the map, search and route. Each one sees **your IP
address** and **what that request asks for**, nothing else. No name, e-mail, phone number or
device identifier is sent. Every request carries the same `User-Agent`, which names the app
and not you.

| Service | Run by | What it receives | When |
| --- | --- | --- | --- |
| Map tiles (OpenStreetMap, ÖPNVKarte, Waymarked Trails, OpenFreeMap) | OSM Foundation, memomaps, Waymarked Trails, OpenFreeMap | The map squares on screen, so the area you are looking at | While the map is shown |
| Satellite imagery (EOX, DGT, IGN Spain, IGN France, German state surveys) | EOX; the Portuguese, Spanish and French mapping agencies; the survey offices of Bavaria, Hesse, Rhineland-Palatinate, Saarland and Bremen | The same, for the satellite view (each only for a view over its own area) | Satellite map type only ("High" detail for the orthophotos) |
| Search (Nominatim, Photon as fallback) | OSM Foundation, Komoot | What you type (from 3 letters, after a pause), and the area in view | When you search, or drop a pin (its point) |
| Routes (OSRM, Valhalla) | FOSSGIS e.V. | **Start, stops on the way and destination** | When you ask for a route, and on recalculating |
| Businesses, speed cameras and limits (Overpass) | Volunteers (overpass-api.de, private.coffee) | The area in view, or along the route | Category buttons, a tapped business, cameras/limits on a route |
| Public transport (Carris Metropolitana, Carris) | The operators | Which stop, line or bus you look at; the live bus list | Transport map and trips |
| Weather at the destination (Open-Meteo) | Open-Meteo | The destination rounded to about 1 km, and the hour | A route with route hints on |
| Photos and street view (Wikimedia, Wikidata, Panoramax) | Wikimedia, Panoramax | The business's photo name, or a point near the place; with street view on, the coverage squares of the area in view and the point tapped | Opening a card, using street view |
| OpenStreetMap notes | OSM Foundation | Your report's text and the place, **anonymously** | Only when you press Send on "Report" |
| Updates, maps and timetables (GitHub) | GitHub | That a copy of PalmMap is checking | At start (at most every 15 min), and downloads you start |

The routing servers are the most sensitive: a route from home shows where home is. There is no
open way to route on the phone itself yet. The servers are run by FOSSGIS, the same ones
openstreetmap.org uses, under their usage policy.

## What stays on the phone

Settings, saved places, Home, Work, labels, recent destinations, favourite stops and lines,
where the car was parked, the trips you started (for the suggestion on opening), the learnt
pace, the downloaded maps and timetables, and the last crash's message.

**Automatic copy** (off until you pick a folder): writes those settings and places, as plain
text, to a file in the folder **you** choose, so they survive uninstalling. If you pick a
cloud-synced folder, that copy goes wherever that folder syncs. What the app learns from your
movements is never in it.

## "Learn from my movements" (off unless you turn it on)

This is the one feature that follows you with the app closed. It is built to keep as little as
possible, and to be useless to anyone but you:

- **Off by default.** It needs Android's "Allow all the time" location, which only you can grant,
  and shows a permanent notification while it runs.
- **It keeps results, never your path**: frequent places (a point, how many visits, which nights
  and working days) and pace numbers. The trip under way is a few numbers until it ends.
- **Encrypted**: sealed with AES-256-GCM using a key that is created inside Android's Keystore and
  can never be read out of it (`VaultModule.kt`). If encryption is not available, nothing is
  stored.
- **Never sent and never copied**: no request carries it, it is not in the automatic copy, and
  cloud backup is off. The one exception is when you tap "Home" or "Work" next to a learnt place:
  that point is sent to Nominatim to get its street name, as when you set Home any other way.
  "Show on the map" only moves the map there: the point is not looked up.
- **Forgotten by itself** after 90 days without a visit.
- **Deleted for good** from Settings → Navigation, or when turning the feature off: the data
  is removed and the encryption key destroyed.

## Permissions

Location (while in use; "all the time" only for the feature above), notifications, installing
updates, foreground service (navigation and learning), and starting after a reboot (required by
Android for the navigation service). No contacts, camera, microphone recording, storage or
phone permissions. Voice search uses Android's own speech recogniser, which is Google's app on
most phones.
