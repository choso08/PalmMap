# CLAUDE.md — PalmMap

Guide for Claude Code and other AI assistants working in this repository, written in plain
language so a person can read it too. **The author talks in European Portuguese: answer them
in Portuguese.** The code, the comments and this file are in English.

## Where this stands — read first

If you are picking this project up now, this section tells you where it is. The rest of the
file explains the reason behind each thing.

**Done and confirmed on the phone:** the maps app works. Map, search, businesses, routes,
navigation, settings, saved places, satellite. And **the offline map too** — Portugal and
São Tomé were seen drawing in airplane mode, with place names, which was the project's
biggest unknown and no longer is.

**Three things to know before touching anything:**

1. **The version comes from the build number** (`7.0.<n>`) — see "Installing on the phone".
   The author asked: **build only when they say so.** Do not start the workflow unasked.
2. **The maps are published under the `mapas` tag**: mainland Portugal, Madeira, Azores,
   São Tomé and Príncipe, Cape Verde, Guinea-Bissau, Spain, Italy, Germany, United Kingdom,
   Ireland, Netherlands, Belgium, Luxembourg, Switzerland and Austria. **France failed** for
   going over GitHub's 2 GB limit — to have it, lower its `maxzoom` to 12 in
   `map-regions.json` and run the workflow again.
3. **When touching the offline map, always test with data off.** If the stored map fails to
   open, the app falls back to the Internet tiles by itself and everything looks fine — a
   fault goes unnoticed with a network.

**Still to confirm on the phone:** the screen staying on while navigating, the voice
announcements after the manoeuvre filter, the speedometer — which needs a moving phone —
and the speed cameras, bus times and tolls, which depend on services the development
environment cannot reach.

**Recent work (November 2026), none of it seen on a phone yet unless said:**

- **Buses:** the `[YA15B]` prefix left the line number (`lineLabel`, in `transit.ts`); moving
  buses came back — TML sends `timestamp` in **milliseconds** and every bus was being thrown
  away as "from the future" (`vehicles.ts`). Proved with the timetables workflow's `sondar`
  mode. Two 3601 arrivals a minute apart are **not duplicates**: one is a bus half an hour
  late.
- **Tapping a stop on the transport map opens its panel.** ÖPNVKarte's stops are part of the
  image; Carris's are drawn on top from zoom 15 (`stopsInBounds`), **small, as in the Maps**:
  a blue disc with a white bus (`stop-bus`, drawn by `generate-poi-icons.py`), with the name
  only from zoom 17 or on the open stop. A closed transit trip no longer leaves the map
  showing only its two stops (`transitTrips` is cleared without a destination) — that was
  why "stops were missing".
- **Metro Sul do Tejo with real timetables**, from the operator's own site service
  (`https://www.mts.pt/mts-timetable-api/`: `lines`, `stations` by POST with `line_id`,
  `search` by POST with `line`, `stations`, `day_type` and `season`), converted by
  `build_mts()` in `build-transit.py`. The area's timetables download by themselves when the
  transport map opens (`ensureFeedsFor`). All timetables are now valid **until 6 February
  2027**.
- **Fast business pins.** With the country downloaded they come from a **business file**
  (`<id>.pois`, generated from Geofabrik by the maps workflow, read by squares in
  `localPois.ts`): mainland Portugal has 218,642 businesses in 24.5 MB. Without a downloaded
  country they come **inside the OpenFreeMap tiles** (`poi` layer), and a tap asks Overpass
  for that one place only (`placeDetails`). Overpass is no longer called for automatic pins —
  **on the transport map either** (there are no automatic pins there; it only produced
  "Could not search for places" when Overpass refused). Only the category buttons ask it.
  The maps workflow has an `apenas_negocios` option.
- **Junk removed from the pins** (author's photo): trail signposts (`tourism=information`
  that is not `information=office` — "TB.442", "TB.444"… in Monsanto/Restelo, probed) are
  dropped from all three sources. Mobi.E charging points carry their code as `name`
  ("ALM-90010", equal to `ref`): the card and the country file show the **brand**
  (`displayName`, in `overpass.ts`); in the tiles, which have no brand, a charging point gets
  the icon only (a bolt, `ev-station`). Schools and universities got a mortarboard instead
  of the camera.
- **The map type is now remembered**, at the author's request, with no brake on live buses.
- **Directions screen** (button next to the search): any origin and destination, swap, travel
  mode. Navigation always starts from the GPS.
- **Satellite:** Sentinel-2 moved to 2025. The DGT orthophotos stay at 2023 — nothing newer is
  published (probed: `ortos.dgterritorio.gov.pt` only has `ortosat2023`).
- **Maps list:** retries once, keeps the last full list, is alphabetical, and maps and
  timetables are collapsible sections in Settings.
- **Main screen in the style of Google Maps** (the author: "imitate Google Maps in the vast
  majority of things"), in four phases, all done. Bottom tab bar (`BottomTabs`: Explore, Go,
  Saved, Settings), hidden whenever a panel is open or while navigating; a big Directions
  button bottom right, with the locate button above it; a layers button under the category
  buttons (`LayersSheet`: map type with thumbnails, businesses on the map, live buses and the
  measuring tape); a Saved screen (`SavedSheet`); and the search takes the whole screen while
  in use. The floating buttons' heights all live in `App.tsx` (`compassBottom`,
  `TAB_BAR_HEIGHT`). Phases 2–4: see 6-0-A, 6-0-B and 6-0-C.
- **Metro, train and ferry trips with one change**, and **Fertagus and the ferries'
  timetables** — see 6-B-3 and 6-B-4.
- **Bicycle type: Estrada / Normal / BTT**, routed by FOSSGIS's Valhalla — see its usage
  rules.
- **Recent destinations no longer repeat** (`recents.ts`): the same name within 300 m is the
  same place; the stored list is cleaned on reading and writes are one at a time.
- **Compass cone** in front of the blue dot, as in Google Maps: which way the phone points,
  standing still too (`watchCompass`, in `location.ts`; image `heading-cone`, drawn by
  `generate-poi-icons.py`). Only outside navigation and with the app on screen. The blue dot
  is drawn by us (children of `UserLocation`) so the cone can go under it.
- **Voice search** in the main search bar, **search box in Settings**, **"Rate the app"** and
  **"Missing a country?"** — see section 4 and the Nominatim rules.
- **São Tomé no longer ships inside the app** (`assets/mapas/` does not exist); it downloads
  like the others. Older parts of this file may still say otherwise.

**The English translation is done** for the code, the README, the workflows and this file.
The Portuguese in `src/i18n/pt.ts` is the app's Portuguese text, not a leftover.

**Idea for later (the author's): a "trail mode"**, something Google Maps lacks — the trail
signposts (`tourism=information` + `information=guidepost`, like Monsanto's "TB.4xx", taken
out of the normal pins for being junk outside that mode), boards, and marked walking and
cycling routes. Do not start without the author asking.

## Project goal

**PalmMap** is a phone maps app, meant as an alternative to Google Maps, built only with open
and free services.

**It is a personal project** — for the author and, at most, a few more people. Not meant to
serve thousands of users. That matters: simple, free solutions are plenty, and there is no
point complicating things with infrastructure of our own. Whenever in doubt between "the
simplest" and "the most scalable", choose the simplest.

The central rule: **no Google Maps, no paid API keys.** All data comes from open sources.

There was the idea of **running on Android Auto** (the car screen), but that part is
**paused by the author's decision** — see "Android Auto (paused)" further down. Do not start
work in that direction unless the author asks again.

## Glossary

| Term | What it is |
| --- | --- |
| **OpenStreetMap (OSM)** | A collaborative, free world map — the open equivalent of Google's map. |
| **Tiles** | The little squares that together make up the map on screen. Either ready-drawn images or geometry still to draw. |
| **Nominatim** | Service that turns a written address ("Rua Augusta, Lisboa") into coordinates. OpenStreetMap's search engine. |
| **OSRM** | Service that works out the way between two points and returns the route and distance. |
| **Overpass** | Service to ask OpenStreetMap "which restaurants are around here?". Behind the businesses. |
| **Expo** | A toolset that makes building and testing React Native apps much simpler. |
| **APK** | The file installed directly on an Android phone, without the Play Store. |
| **PMTiles** | A whole map in a single file. Used to store countries on the phone without downloading thousands of images. |
| **Vector tiles** | Tiles carrying geometry (this line is a road, this polygon is water) instead of a ready image. Much smaller, but someone has to give them colours. |
| **Style** | The file saying how to draw vector tiles: water colour, road widths, label sizes. |
| **Glyphs** | Fonts in a format the map can use to write street names. |

## Technologies

| What for | Choice |
| --- | --- |
| App base | React Native 0.86 + Expo SDK 57 |
| Language | TypeScript |
| Map component | `@maplibre/maplibre-react-native` — see "Important decision" |
| Location (GPS) | `expo-location` |
| Storage on the phone | `@react-native-async-storage/async-storage` and `expo-file-system` |
| Files inside the APK | `expo-asset` |
| Voice | `expo-speech` |
| Phone language | `expo-localization` |
| Installed version | `expo-application` |
| Opening Android's installer, speech recognition | `expo-intent-launcher` |
| Knowing if on Wi-Fi | `expo-network` |
| Screen on while driving | `expo-keep-awake` |
| Background navigation | `expo-task-manager` (`expo-location`'s foreground service) |
| Internet requests | `axios` |
| Map tiles | OpenStreetMap; business pins from OpenFreeMap |
| Address search | Nominatim (`https://nominatim.openstreetmap.org`), and Photon when it fails |
| Routing | FOSSGIS OSRM (`https://routing.openstreetmap.de`), one server per travel mode; bicycles from FOSSGIS Valhalla (`https://valhalla1.openstreetmap.de`) |
| Offline maps | Protomaps (PMTiles), cut from the world map |

The target platform is **Android**. Nothing prevents iOS, but the permissions and the
install-file build described here are Android-specific.

## Important decision: which map component — decided

**The project uses MapLibre** (`@maplibre/maplibre-react-native`). The reason is recorded
here so nobody goes back on it without understanding what is at stake.

The original brief named `react-native-maps`. **The problem:** on Android that library runs
on top of Google Maps and, in practice, usually needs a Google key just to start — even when
all we want is to draw OpenStreetMap tiles on top. It clashes directly with the project's
goal.

MapLibre is a completely free map library, with no tie to Google. The original brief already
listed it as an option. As a bonus: if Android Auto is ever resumed, MapLibre also has a
native Android library, so phone and car could share the same map engine and tile source.

## ⚠️ Expo Go does not work for this project

MapLibre brings native code that **is not included in the Expo Go app**. So
`npx expo start` alone, with Expo Go on the phone, shows the search bar but cannot draw the
map.

It needs a **development build** — a build of the app with the native code inside. Done
once, and then it is like Expo Go: change the code and reload.

```bash
# Option A: build on your own computer (needs Android Studio)
npx expo run:android

# Option B: build in the cloud with Expo (needs a free Expo account)
npx eas-cli build -p android --profile development
```

This is not a sign of misconfiguration — it is how any library with native code works. The
project stays in "managed" Expo: there is no `android/` folder in the repository; Expo
generates it when building.

## Commands

### Development

```bash
npm install                 # Install dependencies
npx expo start              # Start the development server
npx expo run:android        # Build and run on an Android emulator or phone
```

### Type checking

```bash
npx tsc --noEmit
```

**Always run this before calling work done.** It is the project's only automatic check, and
since much of the code cannot be tried in the development environment (see below), it is
what catches errors before they reach the phone.

There is no test or formatting tool. For a personal project this size it is not needed — but
if you add one, document it here.

### What cannot be tested here

The development environment has no free Internet access. These services are blocked and
**not worth trying**:

- `overpass-api.de` — businesses can never be tested here
- `routing.openstreetmap.de`, `router.project-osrm.org` — nor routes
- `nominatim.openstreetmap.org`, `tiles.openfreemap.org`
- `build.protomaps.com` — the world map is only cut in GitHub Actions
- `api.expo.dev`, `dl.google.com` — building locally is not possible

Everything that needs these services goes into a GitHub Actions workflow. That is why the
workflows exist: not a taste for automation, it is the only way. **The timetables workflow
has a read-only `sondar` mode** that runs a function of `scripts/probe.py`
(`sondar: <function>`) and publishes nothing — use it to look at real data before guessing.
Probes like this may be run without asking; builds may not.

## Installing on the phone

No Android Studio or Play Store needed: the GitHub workflow builds the APK and publishes it
in a Release. Go to the "Actions" tab, choose the build workflow and press "Run workflow".

**The author asked that nothing be built until they say so.** Do not start the workflow on
your own initiative, even after big changes. When they do ask: push to `main`
(`git push origin HEAD:main`) and run `build-apk.yml` on `main`.

Alternatively, with a (free) Expo account, the build profiles are in `eas.json`:

| Profile | What for |
| --- | --- |
| `preview` | The real, standalone app. Install and use. To change the code, build again. |
| `development` | Install once and connect to the computer with `npx expo start`. The code reloads without rebuilding. |

The APK is built only for **arm64-v8a**, the processor of every current Android phone.
Including all four architectures tripled the size for no benefit, and a huge file is more
likely to arrive truncated — which gives "there was a problem parsing the package".

**The version comes from the build, not from anyone's hand.** `app.json` keeps only the
meaningful part — the `7.0` of "version 7" — and the workflow appends the run number. APK 12
is `7.0.12`, the next `7.0.13`, and **there are never two with the same version**. It used
to depend on someone remembering to edit the file, and five builds in a row once all said
the same. When touching `app.json`, touch only the `7.0`.

The same number is the `versionCode`. Without a new number, Android refuses to install over
a previous version.

The workflow checks the APK before publishing it: archive integrity, identification
(package, `minSdk`, architectures) and signing schemes. A broken file is caught at build
time, not on the phone. **A failure installing `ndk;…` or other SDK components is Google's
download hiccuping** (it happened with 7.0.28): run it again.

Notes for installing on Android:

- Installing apps from outside the Play Store must be allowed, in the browser or file
  manager that opens the APK.
- Xiaomi/POCO phones (HyperOS or MIUI) usually show an extra security warning. If the
  install is blocked, turn off automatic app scanning in the security settings.
- The app needs Internet for the map tiles, Nominatim and OSRM. Offline, only areas already
  seen, saved places and downloaded countries work.

**The Play Store** (asked about in November 2026): a one-off US$25 developer account, no
subscription; new personal accounts must run a closed test with 12 testers for 14 days;
the in-app updater (`REQUEST_INSTALL_PACKAGES`) would have to go, and the build would have
to produce an AAB. For Android Auto it is the only way — see that section.


## Project structure

```text
/
├── assets/
│   ├── (icons and splash image, drawn by scripts/generate-icons.py)
│   ├── poi/                # Pin icons and the compass cone, drawn by generate-poi-icons.py
│   └── glyphs/*.pbf        # Fonts the map writes with
├── scripts/
│   ├── generate-icons.py   # Draws the logo and writes the files in assets/
│   ├── generate-poi-icons.py # Draws the business pins, stop symbol and compass cone
│   ├── build-transit.py    # Converts an operator's GTFS into compact timetables
│   ├── build-pois.py       # Business file for a downloaded country (from Geofabrik)
│   ├── probe.py            # Read-only probes run by the timetables workflow (`sondar`)
│   └── probe-trips.js      # Runs the trip planning against the real API
├── docs/
│   └── project-brief-original.pdf
├── src/
│   ├── components/
│   │   ├── MapView.tsx       # Map, business pins, route, destination, blue dot and cone
│   │   ├── SearchBar.tsx     # Search bar (Nominatim, saved places, voice)
│   │   ├── CategoryBar.tsx   # "Restaurants", "Pharmacies", … buttons
│   │   ├── BottomTabs.tsx    # Explore / Go / Saved / Settings
│   │   ├── LayersSheet.tsx   # Map type, businesses, live buses, measuring tape
│   │   ├── SavedSheet.tsx    # Saved places
│   │   ├── DirectionsSheet.tsx # Any origin and destination
│   │   ├── PlaceSheet.tsx    # A place's card: open now, hours, buttons
│   │   ├── RoutePanel.tsx    # Route panel: times per mode, alternatives
│   │   ├── StepsList.tsx     # The route's instructions
│   │   ├── NavigationPanel.tsx # Navigation screen: manoeuvre, lanes, limit, footer
│   │   ├── SpeedBadge.tsx    # The speedometer, while navigating and on the map
│   │   ├── TransitSheet.tsx  # Stops nearby and their arrival times
│   │   ├── MeasureSheet.tsx  # Measuring tape: distances and areas
│   │   ├── OfflineMaps.tsx   # Countries to download, with sizes
│   │   ├── Schedules.tsx     # Timetables to download
│   │   ├── Updates.tsx       # Check, download and install new versions
│   │   ├── UpdateSplash.tsx  # The new-version notice at start-up
│   │   ├── FeedbackForm.tsx  # "Rate the app"
│   │   ├── Collapsible.tsx   # A Settings section that opens and closes
│   │   ├── Reveal.tsx        # Makes a panel fade in and out
│   │   ├── DraggableSheet.tsx # Bottom panel that shrinks when dragged
│   │   ├── ErrorBoundary.tsx # Shows the error instead of the app closing
│   │   └── SettingsSheet.tsx # Settings screen
│   ├── services/             # Everything that talks to the outside
│   │   ├── config.ts         # Addresses, User-Agent and limits — all in one place
│   │   ├── rateLimit.ts      # Queue that spaces requests and skips unwanted ones
│   │   ├── nominatim.ts      # Search by name (Nominatim, and Photon as fallback)
│   │   ├── overpass.ts       # Businesses by category, place details, `displayName`
│   │   ├── localPois.ts      # Business pins from a downloaded country's file
│   │   ├── osrm.ts           # Routes, instructions and lanes
│   │   ├── speedLimits.ts    # The road's speed limit along the route (Overpass)
│   │   ├── cameras.ts        # Speed cameras on the route, by type
│   │   ├── location.ts       # GPS and compass
│   │   ├── voiceInput.ts     # Android's speech recogniser, for voice search
│   │   ├── offlineMap.ts     # Installs, downloads and deletes country maps
│   │   ├── vectorStyle.ts    # How a stored map is drawn: colours and widths
│   │   ├── tiles.ts          # Map styles (light/dark/satellite/transport) and cache
│   │   ├── transit.ts        # Stops and arrival times (Carris Metropolitana)
│   │   ├── vehicles.ts       # Where the buses are right now
│   │   ├── schedules.ts      # Train, metro and ferry timetables stored on the phone
│   │   ├── update.ts         # New version check, and handing it to the installer
│   │   ├── crash.ts          # Stores what closed the app, to read later
│   │   ├── favourites.ts     # Saved places
│   │   └── recents.ts        # Recent destinations
│   ├── types/                # TypeScript types
│   │   ├── geo.ts            # Types the app uses (Coordinates, Place, Route, Lane)
│   │   ├── nominatim.ts, osrm.ts, overpass.ts, photon.ts, transit.ts
│   │   │                     # The exact shape of each service's answer
│   │   └── schedule.ts       # The format of the converted GTFS
│   ├── utils/
│   │   ├── format.ts         # Distances and durations as readable text
│   │   ├── geometry.ts       # Map distances and position along the route
│   │   ├── eta.ts            # Arrival time: per-mode model and measured pace
│   │   ├── voice.ts          # Reading the instructions aloud
│   │   ├── categories.ts     # Business categories and OSM tag labels
│   │   ├── poiStyle.ts       # OSM value → pin icon and family
│   │   ├── openingHours.ts   # Reads `opening_hours`: "Open · Closes at 19:00"
│   │   └── maneuvers.ts      # Turns OSRM manoeuvres into sentences
│   ├── i18n/                 # The text, in Portuguese and English
│   │   ├── pt.ts             # The source table
│   │   ├── en.ts             # English, typed against pt.ts
│   │   └── index.ts          # Picking the language; useT() and t()
│   ├── theme.ts              # Light and dark colours
│   ├── settings.tsx          # Stored settings and the useTheme() hook
│   └── useUpdateDownload.ts  # Download and install, shared by two screens
├── App.tsx                   # Entry point: puts everything together and holds the state
├── README.md                 # The project's front page on GitHub
├── AGENTS.md                 # Points to this file
├── app.json                  # Expo config and Android permissions
├── eas.json                  # Build profiles
├── map-regions.json          # Which countries are cut for offline, and at what detail
├── transit-feeds.json        # Where each operator's GTFS comes from
├── metro.config.js           # Makes the bundler accept .pmtiles and .pbf
└── .github/workflows/
    ├── build-apk.yml         # Builds the APK and publishes it in a Release
    ├── build-map.yml         # Cuts the country maps (and business files)
    └── build-transit.yml     # Converts the timetables; also the read-only probes
```

Note the split inside `src/types/`: `nominatim.ts`, `osrm.ts` and the others describe
exactly what each service returns; `geo.ts` describes what the app uses. The services
translate one into the other. If OSRM were ever swapped for another service, only that
translation would change.

**Rule of thumb:** every Internet request lives in `src/services/`. Screen components never
call `axios` directly — they ask the services. The services' usage rules (further down) stay
in one place instead of spread through the code.

## Architecture guidelines

### 1. The map

- **Never use a Google API key.** The central rule.
- The map styles are in `src/services/tiles.ts`; the drawn map uses
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png` — the plain address, without the old
  `a.`/`b.`/`c.` subdomains, which OpenStreetMap itself discourages.
- The tile requests' `User-Agent` is registered at start-up, in `App.tsx`, through MapLibre's
  `TransformRequestManager`. The usage policy requires it.
- The OpenStreetMap attribution stays visible on the map (`attribution` on the `Map`). The
  data licence requires it.

### 2. Location permissions (Android)

- `app.json` declares `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`, in full
  (`android.permission.…`), the same spelling `expo-location`'s plugin uses, so they are not
  duplicated.
- Permission is asked **while in use**, in `src/services/location.ts`.
- If the person refuses, nothing breaks: `getCurrentPosition()` returns `null` and the map
  and search still work, just without the position. Keep it that way.

### 3. The logo

- The logo is **a palm tree — brown trunk, green leaves — on a small sandy island sitting in
  the sea, on a white background** (`island_layer`), with a band of **wet sand**, darker,
  where the island meets the water, and **waves lapping** — scallops of foam along the
  waterline, drops leaping at the ends and a lighter swell in the water. The island sits in a
  lens of sea; the loose rows of waves that used to hang underneath were removed at the
  author's request. Both details were asked for by the author as a sign of care; do not
  remove them for looking decorative. No foam in the one-colour version. For volume without
  new shapes: darker back leaves, rings on the trunk, three coconuts, the palm's shadow on
  the sand (`detail`, in `draw_palm`). **Not a map pin, on purpose**: it was a pin with the
  palm inside until November 2026, and the author found it too close to Google Maps'. The
  adaptive icon and splash backgrounds are white in `app.json`.
- The files in `assets/` **are not edited by hand**: `scripts/generate-icons.py` draws them.
  To change colours or proportions, change the script and run it again
  (`pip install Pillow && python3 scripts/generate-icons.py`).
- Android uses the adaptive icon and crops it to a circle, so the logo sits well inside the
  edges. When changing it, check nothing gets cut.

### 4. Settings

- Settings live in `src/settings.tsx`: a context wrapping the whole app, stored with
  `AsyncStorage`. Stored values are merged with the defaults at start-up, so old versions do
  not break.

  | Setting | What it does |
  | --- | --- |
  | `language` | Automatic, Portuguese or English |
  | `appearance` | Automatic, light or dark |
  | `travelMode` | Car, walk, bike or bus (chosen in Directions and the route panel) |
  | `bikeType` | Road, normal or BTT — chosen in the route panel when cycling (see the Valhalla rules) |
  | `timeAdjustment` | Arrival time correction: 1×, 1.25×, 1.5× or 2× |
  | `cacheSize` | Map cache: off, 100 MB, 250 MB, 500 MB or 1 GB |
  | `showPlacesOnMap` | Show businesses on the map by themselves |
  | `voiceGuidance` | Read instructions aloud while navigating |
  | `mapType` | Drawn map, satellite or transport — **remembered between sessions** |
  | `satelliteDetail` | Normal (Sentinel-2) or high (DGT orthophotos in Portugal) |
  | `speedCameraAlerts` | Warn about cameras on the route |
  | `speedLimitAlerts` | Warn when over the road's limit — **off by default** (author's request) |
  | `avoidTolls` | Ask for a toll-free route |
  | `batterySaver` | Read the GPS less often far from manoeuvres |
  | `showSpeed` | Show the GPS speed |
  | `showVehicles` | Show moving buses on the transport map |

- To add a setting: add it to the `Settings` type, give it a value in `DEFAULT_SETTINGS`,
  show it in `SettingsSheet` **and add it to `show`** (the settings search; see below).
- **The map type is remembered between sessions**, at the author's request (November 2026):
  closing on satellite and reopening on the drawn map was the opposite of what they wanted.
  It was deliberately not stored before because of the live buses (1.1 MB every twenty
  seconds) — the author chose no brake. An unknown value falls back to the drawn map.
- **The navigation options are grouped in a collapsible "Navigation" section**
  (`Collapsible`), at the author's request: voice, speed limit, cameras, tolls, speedometer
  and battery.
- **Settings has a search box** at the top (`show`, in `SettingsSheet`): it hides whatever
  does not match the text (name, hint or section, accents ignored) and opens the sections
  holding a match by themselves (`forceOpen` on `Collapsible`). A new option must go into
  `show`.
- **"Rate the app"** (`FeedbackForm`): stars and a comment, sent as a pre-filled GitHub issue
  (with the version) — there is no server of ours, and nothing leaves the phone until the
  person confirms there. It needs a GitHub account. **"Missing a country?"**, at the end of
  the maps list, does the same to ask for a map (`MAP_REQUEST_URL`). To receive feedback
  without a GitHub account, the way is the author's e-mail address (`mailto:`) — only with
  the author saying which.
- **Updates are not a setting**, they are a screen inside Settings — see "6-I".
- **The last crash is not a setting either**, it is a card at the top of the screen that only
  exists when the app closed by itself — see "6-K".
- **The travel mode is no longer on the Settings screen** (author's request, November 2026):
  it is chosen in Directions and in the route panel, and is still stored (`travelMode`).
- **The travel mode is switched in the route panel**, where the decision is really made: one
  picks the destination and only then thinks of how to get there. Pressing recalculates at
  once and the choice is stored.

### 4-A. Languages

The app speaks **European Portuguese and English**. "Automatic" follows **the phone's
language**; Settings can force either.

**"Automatic" is the phone's language, not the country one is in.** That is what
"automatic" means in any other app, and it avoids a Portuguese person abroad seeing
everything in English. Any language other than Portuguese falls back to English; adding a
language is adding a file next to `en.ts`.

The pieces are in **`src/i18n/`**: `pt.ts` (**the source table**, all user-facing text),
`en.ts` (**typed against `pt.ts`**) and `index.ts`.

**The check that stops half the app staying in Portuguese.** `en.ts` is declared as
`typeof pt`: a key added to Portuguese and forgotten in English **does not compile**.
`npx tsc --noEmit` tells you; nothing to remember.

**Two ways to get the text, and the difference matters:**

- **`useT()`**, in components. A hook, so the screen redraws when the language changes —
  without restarting.
- **`t()`**, in services. Services cannot use hooks and still throw errors with messages; this
  reads the language from a module variable set by the `SettingsProvider`.

**Beware `t()` captured in a function with empty dependencies.** A `useCallback(…, [])`
closing over the component's `strings` stays stuck on the start-up language, and TypeScript
does not catch it. It happened with the map type's name: switching to English left it saying
"Transportes" for good. In those places use `t()`, which reads the language when called.

**Sentences with values are functions, and grammar lives inside each language.** "Vire à
esquerda **para** a Rua Augusta" vs "Turn left **onto** Rua Augusta". Building sentences
from translated pieces gave one language the other's grammar. `maneuvers.ts` decides
**which** manoeuvre it is; the language table says **how to say it** — including English
roundabout exit ordinals, where 11th to 13th are "th" and a naive rule fails.

**Four things that change with the language and are not text:**

1. **The decimal separator.** 12,4 km in Portuguese, 12.4 km in English.
2. **The navigation voice** (`speechTag`). Without it, an English instruction was read with a
   Portuguese accent.
3. **The search** (`accept-language` on Nominatim). English gets "Lisbon".
4. **The map attributions.** For Sentinel-2, in English, the official sentence EOX asks for —
   copied, not translated.

**Option lists do not hold names.** `TRAVEL_MODES`, `MAP_TYPES` and the others only have the
`id` and the icon; the name comes from the language table.

### 5. Arrival time and road surfaces

OSRM works out time from the road type and OpenStreetMap's `surface` tag. The car profile
caps speed by surface — `surface=unpaved` at 40 km/h, dirt lower still.

**The problem is bigger than it looks.** Even with the tag filled in, the 40 km/h OSRM
assumes for unpaved roads is too fast for São Tomé's dirt roads, where people really drive at
20. Those roads are already marked unpaved in OpenStreetMap — the dashed line on the map is
exactly that — and the time still comes out about 60% short. So **better data is not
enough**.

Two fixes, not exclusive:

1. **The manual correction in Settings** (`timeAdjustment`), multiplying the time by 1, 1.25,
   1.5 or 2. Crude — the same for every route — but the only one that solves São Tomé.
2. **Filling the tag in OpenStreetMap** where missing. Helps elsewhere, for everyone, but does
   not replace the correction on very bad roads.

The factor is applied **where the time is shown** (`useEta()`), not in the service: the
`Route` keeps what OSRM answered, untouched.

### 5-A. The arrival time adapts to whoever is driving

The author asked that **the arrival time count on the speed the person really goes at.**
Three layers, in `src/utils/eta.ts` and `useEta()`:

1. **The travel mode's model.** Car and walking: what OSRM answered. Bike: OSRM's profile
   assumes **15 km/h** (`default_speed` in their `bicycle.lua`, read in their code); we count
   on **12.5 km/h**, the author's request — but **as a floor**: where OSRM already answers
   slower, it knows something about the road an average does not, and its value stays.
2. **The measured pace.** While navigating, the time the stretch covered really took is
   compared with what the route predicted. The result multiplies what is left, and is
   **stored per travel mode** (`LearnedPace`, in `settings.tsx`) so the next estimate is born
   right — the one that matters is the one read **before** leaving.
3. **The manual correction**, which only applies while there is no measured pace.

**Measured beats guessed, and they do not multiply.** Both measure the same thing;
multiplying them counted it twice (1.5× by hand and 1.6 measured gave 2.4×). So Settings
**shows the learned pace and has a button to forget it** — a value learned in silence that
nobody sees or clears is, the day it goes wrong, a fault with no explanation.

**When driving, the pace never shrinks the time, and that is a decision.** The floor is 1
(`PACE_MIN_DRIVING`): **the app does not promise an arrival time that requires speeding.**
The author asked for "always the time for the local limit or a bit below", and it fits what
OSRM already does: their `car.lua` computes time at **the limit × 0.8** where the limit is
tagged (`speed_reduction`), and below it where not. The measured pace can widen it freely;
it cannot shorten it. Otherwise fast drivers would teach the app to count on it.

**The pace is not measured in the first metres.** Only after `PACE_MIN_MS` (3 min) **and**
`PACE_MIN_METERS` (500 m): a traffic light outside the house gave a factor of five. It is
still a cumulative ratio since the trip started, so an early stop weighs more than it should
— it dilutes as one goes; a known limitation, not a fault.

**What is stored is a blend** (`PACE_LEARN_WEIGHT`, a third): an odd trip moves the value
without turning it upside down. It resets on every recalculation — the total distance changes
and "how far have I gone" would stop adding up.

Proved with a trip simulation: a dirt road with OSRM assuming 40 km/h and driving at 20 gives
pace 2.00 and the remaining time right to the minute; a bike at 10 km/h with the 12.5 model
gives 1.25; driving at 120 where OSRM counts 90, the pace stays at 1 and one arrives earlier
than promised, which is the right side to err on.

### 6. Satellite imagery

- The source is **EOX's Sentinel-2 cloudless** (2025): a Copernicus Sentinel-2 mosaic with
  clouds removed. Free, no keys, Creative Commons, free for non-commercial use.
- **The attribution is required** and is in the style's `attribution`. Do not remove it.
- **Detail has a physical limit:** Sentinel-2 sees at 10 metres per pixel, about zoom 14.
  Hence `maxzoom: 14` — above it MapLibre enlarges what it has instead of requesting tiles
  that bring nothing more. Coast, forest, fields; not individual houses.
- **"High" detail adds the DGT orthophotos in Portugal** (`ortoSat2023-CorVerdadeira`, from
  `ortos.dgterritorio.gov.pt/wms/ortosat2023`): 2023 Pléiades-Neo satellite imagery, under a
  metre per pixel. **This is the sharpest open imagery there is.** The author compared it
  with Google (November 2026) and found it blurrier when zoomed right in: Google uses
  commercial aerial photography at about 10 cm. The DGT's aerial orthophotos are not
  published as an open service (probed: no `ortos2018`/`ortos2021` on any DGT host).
  **Detailed imagery is a paid product everywhere**; do not go looking again.
- **The orthophotos fade in over a whole zoom level.** They used to appear at once, at full
  opacity, past zoom 12 — over Sentinel-2 at ten metres per pixel. The jump looked like a
  map fault. Spreading it over a level fixes it **without a single extra request**: `minzoom`
  stays at 12, only the opacity changes.
- **Each orthophoto tile is requested at 512 pixels and drawn in a 256 square** — four times
  the pixels, the same detail as one more zoom level with a quarter of the requests to a
  public service.
- Satellite imagery **has no names or drawn roads** — it is only a photo. Route and pins
  still show, because they are our layers.

### 6-0. Business pins

Drawn **like the maps everyone knows**, at the author's request (November 2026): a circle in
the family colour with a white icon inside, the name underneath in the same colour. Food
orange, shops blue, health red, lodging pink, services grey-blue, leisure green. The chosen
place — open card or destination — gets the **red teardrop pin**, with the family icon
inside.

- **The table is in `src/utils/poiStyle.ts`**: OpenStreetMap value → icon and family, with
  the key (`shop`, `office`…) as fallback. It serves all three business sources: the
  country's file, the OpenFreeMap tiles (there as style expressions, `TILE_POI_*`, because
  the geometry is not ours) and the category results. Each `Place` carries `kindKey` and
  `kindValue` for this.
- **The icons are images, drawn by `scripts/generate-poi-icons.py`** from the
  MaterialCommunityIcons font, at 1x, 2x and 3x, into `assets/poi/` (with a generated
  `index.ts` that `require`s them). Colours are read from `poiStyle.ts`, so they cannot
  drift. **Not edited by hand**: change the table and run the script (needs Pillow). **Few on
  purpose**: the author asked for fewer symbols — one or two per family.
- **Two layers**: underneath, a small dot in the family colour for each place; on top, the
  icon, without overlaps. When two icons collide, the map keeps the more important one
  (`symbol-sort-key`: food and health first) and the other stays a dot. The name is optional.
- **Junk that is filtered** (author's photo, November 2026): trail signposts
  (`tourism=information` other than `information=office`) are dropped from all three sources;
  Mobi.E charging points named by their code show the brand (`displayName`) or, in the
  tiles, no label at all. See "Where this stands".
- Validated against the MapLibre spec with every image present; **the look on the phone has
  been seen** (November 2026, the author's screenshots).

### 6-0-A. A place's card (phase 2 of the Google Maps imitation)

`PlaceSheet.tsx`: name; kind and distance ("Restaurant · 350 m"); **whether it is open now**
("Open · Closes at 19:00", "Closes soon", "Closed · Opens tomorrow at 9:00"); a sideways
scrolling row of round buttons (Directions filled, Call, Save, Stop, Share, Website — only
those that make sense); and the details. Tapping the hours opens the whole week, today in
bold. Share sends name, address and an openstreetmap.org link — not Google's.

**Hours are read in `src/utils/openingHours.ts`**, which understands the part of OSM's
`opening_hours` that covers nearly all businesses: days and ranges (`Mo-Fr`, `Mo,We`,
`Fr-Mo`), several ranges per day, past midnight, `off`, `24/7`, and later rules overriding
earlier ones. Holiday-only rules (`PH off`) are skipped. **What it does not understand makes
it give up** — `sunrise-sunset`, months, weeks — and the card shows the text as written, with
no status line: a wrong "Open" sends someone to a closed door, worse than saying nothing.

### 6-0-B. Directions (phase 3)

The route panel (`RoutePanel.tsx`):

- **Each travel mode button shows its time** ("12 min", "45 min"). The chosen mode's comes
  from the route; the others' from `getDuration` (`osrm.ts`), OSRM's lightest request — no
  geometry or manoeuvres — through the same one-a-second queue and kept for the session. Two
  extra requests per destination; switching back and forth asks nothing. Public transport's
  only shows when chosen (from the first trip). Until a time arrives the button shows the
  name. `useEta` takes the mode, so each time carries that mode's learned pace.
- **Alternative routes are a list**: time large, distance and the main roads ("via A2, IC20",
  from the OSRM legs' `summary`). The fastest gets "Fastest", whatever OSRM's order.
- **Start and Steps side by side.**

### 6-0-C. Navigation (phase 4)

`NavigationPanel.tsx`, with the manoeuvre banner on top and a new footer:

- **"Then"**: a tab hanging under the banner with the icon of the manoeuvre after the next,
  only when both are within `THEN_MAX_METERS` (400 m). Banner, "Then" and camera warning are
  one column, so they stack whatever the text height.
- **Maps-style footer**: end (red X) on the left; in the middle the time left, large and green
  (`theme.open`), with distance and **arrival time** under it; on the right **see the whole
  route** (`overview()` in `MapView`, which drops following and frames what is left).
- **"Re-centre"** appears when the camera let go of the car — dragging the map or the
  overview — where the GPS button was; that button is hidden while navigating
  (`navCameraFree`, in `App.tsx`; `onTrackUserLocationChange` reports the drop).
- **Lanes**, as in Maps and Waze: each lane's arrow under the manoeuvre, those serving the
  route lit, from `LANES_SHOW_METERS` (1.5 km) before it. Free in OSRM's answer
  (`intersections[0].lanes` of each step, from OSM's `turn:lanes`) — no extra request.
  **Confirmed on the real server**: the A2 exit to Lisbon has four lanes, the two on the right
  valid. On a "straight and right" lane the arrow the route uses is drawn (`shown`). Where OSM
  lacks them, none appear.
- **The destination side** comes from the arrival manoeuvre ("You have arrived, on your
  right").

**What cannot be copied from Waze: live traffic and people's reports** (accidents, police,
roadworks). Both come from millions of phones sending data to the company's server; there is
no open source of that in Portugal, and a personal project with no server has nowhere to
send them. From Waze we take what open data gives: cameras (6-C), the road's limit and the
warning when over it (6-H).

**Not yet seen on the phone.**


### 6-A. Public transport map

- The source is **ÖPNVKarte**, from memomaps.de: it draws the **routes** of buses, trains,
  metros, trams and ferries, each line in its colour, plus stops and stations. Made from
  OpenStreetMap; one of openstreetmap.org's official layers. No keys.
- **It is a map type, not a layer on top.** ÖPNVKarte brings its own base, deliberately faded
  so the routes stand out — laying it over our map would give two bases on top of each other.
- The map type is chosen in the layers sheet (`LayersSheet`), with thumbnails.
- **The attribution is required by the licence** (CC-BY-SA for the map, ODbL for the data).
- **What it is not:** it shows where lines run, not when. Times come from the next sections.
- It needs a network, like the satellite — no stored substitute. That is why these two always
  win over the offline map in `mapStyleFor`.

### 6-B. Arrival times

Different from the transport map: the map shows **where** lines run, anywhere in the world;
this says **when** they pass, and only where there is open data.

- The source is **Carris Metropolitana's open API** (`src/services/transit.ts`), the same the
  official app uses. No key. Address in `config.ts`.
- **It covers the Lisbon Metropolitan Area**, fifteen of its eighteen municipalities. Outside
  it there is nothing — **Portugal has no single open source with every operator's
  timetables**. The panel says so instead of showing an empty list.
- **The stops and stations are those near the middle of the map, not near the GPS** (see
  `mapCentre` in `App.tsx`). It was tied to the phone's position — the same fault the category
  buttons had had: dragging the map to another town brought nothing, and without a GPS fix
  nothing showed at all.
- The stops (`/stops`) are thousands and do not move: requested **once per session** and kept
  in memory. It is the only way to know which are near — the service has no proximity search.
  The list has its own timeout (`CARRIS_STOPS_TIMEOUT_MS`, a minute): megabytes of JSON, and
  fifteen seconds was right on the limit on mobile data.
- Arrivals (`/arrivals/by_stop/:id`) come for the whole day, including what has passed — the
  filtering is ours. **`estimated_arrival` is always preferred to `scheduled_arrival`**: it
  carries the real delay. The green dot in the panel marks the difference.
- **Use the `_unix` fields, not the text times.** `estimated_arrival_unix` and
  `scheduled_arrival_unix` are seconds since 1970, with the past-24h arithmetic already done
  on their side (`25:10:00` is ten past one the next morning, still the previous day's
  service).
- While a stop is open, the minutes refresh every `ARRIVALS_REFRESH_MS` (30 s), without the
  spinner — otherwise the panel flickered.
- **The field names were read from the service's code**, which is open, after the first
  attempt guessed them all wrong: `long_name` (not `name`), `locality_name` (not `locality`),
  `line_ids` (not `lines`). With the wrong names the list showed "Stop" six times, **with no
  error at all**.
- **Tapping a stop on the transport map opens its panel**; the open stop lives in `App.tsx`,
  not in the panel, because it opens from the list or the map — two copies would diverge.
- **The error says what really failed** (`carrisGet`): the service answering with a status
  (shown on screen), taking too long, or the network down. Without the phone at hand, a status
  code in a photo saves several rounds of guessing.
- **One stop failing does not bring planning down** — see `passesAt`.

### 6-B-2. Bus trips

The third floor of transport: **"how do I get from here to there by bus"**.

- **No open service answers that in Portugal.** It is built from what there is: each stop's
  arrivals. See `planBusTrips` in `src/services/transit.ts`.
- **What makes it work is knowing it is the same trip.** If the same trip appears at a stop
  near the origin and at one near the destination, it is the same bus — and the two times are
  the real departure and arrival. The order between them confirms the direction.
- **Since 11 August 2026 `trip_id` no longer does that**: Carris moved arrivals to TML's hub,
  and `trip_id` only comes **with a real-time estimate** (read in `carrismetropolitana/api`).
  Matching by `trip_id` found nothing: zero trips, **with no error**.
- **Today a trip is identified by its order within the pattern** (`tripKeys`). At a stop, the
  arrivals of one `pattern_id` sorted by timetable time are that pattern's trips in order —
  within a pattern buses do not overtake in the timetable. The key is `pattern#order`. **Two
  confirmations**: both stops must have the same number of trips of that pattern
  (`tripsPerPattern`), and when both sides carry `trip_id` they must match.
- **Stops are chosen by the lines they share, not by distance** (`busStopsFor`): the three
  nearest stops at each end almost never share a line. `/stops` carries each stop's
  `pattern_ids`; those of both ends (within `TRANSIT_WALK_MAX_M`) are crossed and only stops
  with a bus in common are asked about, up to `TRIP_STOPS_PER_SIDE` per side.
- **With one change of bus** (the author's request, November 2026, after "No direct
  connection" on a real trip): when there is no direct bus, or only one line, `transferPlan`
  finds — **without any request** — stops reached by a pattern from near the origin that are
  the same as, or within `TRANSFER_WALK_M` (250 m) of, a stop left by a pattern to near the
  destination (terminals like Sete Rios have arriving and departing lines at different
  stops). The `TRANSFER_STOPS` places with the least detour from the straight line are asked
  about; a first ride is joined to a second leaving at least `TRANSFER_MIN_S` (2 min) plus the
  walk later, on another line. The panel shows both line badges and "change at X (wait N
  min)", and the map marks the change stop. At most one change; trains are not mixed into
  changes.
- **A trip can pass the same stop twice** (a circular line starts and ends at Cacilhas): all
  passes are kept and the one after the departure is chosen.
- **A stop answering 404 is a stop with no arrivals**, left out; the others carry on.
- **Carris requests go out in parallel**, spaced `CARRIS_MIN_INTERVAL_MS` (300 ms) between
  departures (`overlap`, in `rateLimit.ts`).
- **`stop_sequence` is the second confirmation**: the boarding stop must come before the
  alighting one within the trip; otherwise the same line in the opposite direction passed for
  a trip.
- **A line appears once** (a pair of lines once, for changes): the same bus's next three
  passes are one option. **The recommendation is not opinion**: the first is the one that
  reaches the destination earliest, counting the walk at both ends (`reachAt`).
- Walking time is **estimated** (straight line × `WALK_DETOUR`, at `WALK_SPEED_MS`).
- **Results with the real API, 30 September 2026:** Almada → Cacilhas five live trips;
  Almada → Costa da Caparica three; Oeiras → Cascais one; Seixal → Barreiro and Amadora →
  Sintra zero without changes. **Use the `trajetos` mode of the timetables workflow before
  calling a fix done** — it compiles the app's `transit.ts` and runs `planBusTrips` against
  the real API (`scripts/probe-trips.js`). A simulation with made-up data proves what was made
  up.

### 6-B-3. Other operators: what exists and what does not

Investigated properly so nobody searches again. **State in August 2026**, updated since:

| Operator | Locations | Timetables | Real time |
| --- | --- | --- | --- |
| Carris Metropolitana (buses) | ✅ open API | ✅ open API | ✅ open API |
| Metro de Lisboa | ✅ `/facilities/subway_stations` | ✅ GTFS on dados.gov.pt | ❌ |
| TUB — Braga (buses) | ❌ outside Carris's area | ✅ GTFS on their site | ❌ |
| Train (CP) | ✅ `/facilities/train_stations` | ✅ `publico.cp.pt/gtfs/gtfs.zip` | ❌ |
| Fertagus | ✅ | ✅ **Mobility Database's stored copy** (old, 2020–22, `frequencies.txt`) | ❌ |
| Ferry (Transtejo/Soflusa) | ✅ `/facilities/boat_stations` | ✅ Mobility Database's copy (`api.transtejo.pt` has a wrong certificate) | ❌ |
| **Metro Sul do Tejo** | ✅ `/facilities/light_rail_stations` | ✅ **the operator's own site service** (`build_mts`) | ❌ |
| Carris de Lisboa (city buses, trams) | — | ✅ `gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS` (47 MB, 177 lines; not generated yet — size to measure first) | GTFS-RT Protobuf only |
| Service alerts (several) | — | — | ✅ **TML, JSON, no key** |

**The Mobility Database catalogue is where to look first** (`MobilityData/mobility-database-catalogs`
on GitHub, readable from the development environment): each source has a `direct_download` and,
for dead ones, a `latest` copy kept on `storage.googleapis.com/…/mdb-latest/…`. That is how
Fertagus, the ferries and Carris de Lisboa were found in November 2026, after dados.gov.pt
searches had given nothing.

**Locations all come from the API already used** — the four `/facilities/*` endpoints. Each
station carries `stop_ids` with the bus stops serving it.

**Metro Sul do Tejo** publishes no GTFS (beware: TST — Transportes Sul do Tejo — is a bus
company of the same group, **not the metro**). Its timetable comes from the service behind
its own site, `https://www.mts.pt/mts-timetable-api/` — see "Where this stands".

**TML's door is open.** `https://go.tmlmobilidade.pt/hub/api/v1/alerts` answers **200 JSON
without a key** (`_id`, `active_period_start_date`, `active_period_end_date`, `agency_id`,
`cause`, `coordinates`, `description`), alerts from **several operators**. Dates in
**milliseconds**, unlike Carris, which sends seconds — and neither says so. Everything else
tried gave 404; do not keep guessing paths. Vehicle positions in GTFS-RT Protobuf would need a
new library just to decode them.

**TML's geoportal is not for timetables**: 186 collections, only `gtfs_stops` and
`gtfs_shapes` start with `gtfs_` — no `trips`, `stop_times` or `calendar`.

### 6-B-4. Static GTFS timetables (train, metro, ferry)

**Operators without real time have timetables.** Same path as the offline maps: a GTFS is a
ZIP with the whole timetable (CP's `stop_times.txt` has hundreds of thousands of lines); a
phone cannot read that to answer "when is the next one". The conversion runs once in GitHub
Actions and the phone gets a file of hundreds of kilobytes.

- **`transit-feeds.json`** — the catalogue: operators and where each GTFS downloads from,
  **several candidate addresses** each, tried in order (these sources move). The `confirmado`
  field says which were confirmed; what was tried and failed is in the notes, address by
  address.
- **`scripts/build-transit.py`** — the conversion. Standard library only.
- **`.github/workflows/build-transit.yml`** — runs it and publishes under the `horarios` tag.
  Modes: `gerar`, `descobrir` (searches dados.gov.pt), and read-only probes `veiculos`,
  `passagens`, `trajetos` and `sondar`.
- **`src/types/schedule.ts`** and **`src/services/schedules.ts`** — the format and the queries.
- **`src/components/Schedules.tsx`** — the list in Settings, under "Timetables". The area's
  timetables also download by themselves the first time the transport map opens there
  (`ensureFeedsFor`).

**CP's trap:** `www.cp.pt/gtfs/gtfs.zip` answers **200** with their **HTML page**;
`publico.cp.pt` has the file. The check that the ZIP really contains `stops.txt` and
`stop_times.txt` is what catches it. `ttsl.pt` does the same.

**`naApp: false` is not the same as `kind: bus`.** Carris Metropolitana is left out of the
app's list because it has real time, which beats a timetable. Braga's buses **have no real
time** — for them the timetable is everything, and they go in.

**dados.gov.pt addresses come in two forms**; prefer the stable `/api/1/datasets/r/<id>`,
which always points to the latest version (the dated one changes on every publication).

What is kept, and why:

- **Only a window of days** (60 by default). The rest is most of the weight. Past the date the
  file **stops answering and says why** (`isExpired`). The workflow has to run again now and
  then.
- **Minutes, not seconds.** Trains run to the minute.
- **Stations, not platforms.** Merged into the station, which is what matters to someone
  waiting.
- **Actual dates, not the weekday mask with holidays apart.** A few tens of kilobytes more,
  and no holiday arithmetic written twice.

Three traps already solved, not to be undone:

- **GTFS hours go past 24.** So **three days** are looked at — yesterday, today, tomorrow: at
  00:50 the train to catch is yesterday's service.
- **Minutes are handed to `Date`, not added to midnight.** `new Date(y, m, d, 0, 1505)`
  normalises itself and is right on clock-change days; adding `1505 × 60` seconds is an hour
  off twice a year.
- **The last station of a trip is not a departure.**

**Trips with one change** (`planScheduledTransfers`, November 2026): without it the metro
answered almost nothing — most Lisbon journeys need a change of line. From the stored files
only, no request: every trip leaving within `SCHEDULED_HORIZON_S` (2 h) from near the origin
marks the earliest arrival at each later station; every trip calling near the destination is
indexed; at each reached station, stations of any operator within `SCHEDULED_TRANSFER_WALK_M`
(300 m — CP and metro at Oriente or Sete Rios are separate stations) are boarding points for a
second trip on another line, at least `SCHEDULED_TRANSFER_MIN_S` (3 min) plus the walk later.
Offered when there are fewer than two direct trips or when changing arrives earlier. **Proved
against the real files** (metro, CP, Fertagus): Alvalade → Baixa-Chiado Amarela → Azul;
Aeroporto → Sintra Vermelha → CP at Oriente; Corroios → Saldanha Fertagus → Azul at Sete Rios;
tens of milliseconds each. Two changes (Odivelas → Cascais) and bus ↔ rail changes are not done.

**Stations and timetables come from different sources and are linked by proximity, not by
name.** "Lisboa Oriente" and "Oriente" are the same station; coordinates always agree.

**This is the timetable, not the train.** If it is late, this does not know. It says so on
screen, and must keep saying so: buses get a green dot because they are real time.

Train trips go **in the same list as bus trips**, sorted by arrival time — see
`planScheduledTrips` and the merge in `App.tsx`. The stored timetable answers first and
offline.

#### What the real data taught

Run against CP's and Metro de Lisboa's real timetables in GitHub Actions. Three things only
showed there, and none gave an error:

1. **A fixed radius around the station does not work — use the nearest.** With 400 metres
   **Cascais was out by thirty metres**; a wide radius put the Marquês trains at Rotunda.
   Keeping **the nearest station for each timetable** solves both (`nearestStop`).
2. **The alighting station is chosen by arrival time, not route order.** The first version
   got off at **Portela de Sintra, 831 metres from the destination**, when the same train
   stopped at Sintra next, four metres away. Today every possible exit's `reachAt` is
   compared.
3. **"Linha de Sintra" is not a short name.** CP puts it in `route_short_name`; "Linha de" is
   stripped (`shortLine`).

With real timetables: Cais do Sodré → Cascais gives the 08:00 arriving 08:33; Oriente →
Sintra 08:08–08:55; Oriente → Coimbra-B the 08:09 Alfa Pendular arriving 09:53. Trips needing
a change say so instead of inventing.

The conversion was also proved against a synthetic GTFS with a holiday, weekend service and a
25:05 trip — worth keeping: it is the only test covering a holiday removed from the calendar.

### 6-B-5. Moving buses on the map

What Carris Metropolitana's site shows: where each bus is now, with its line number. From the
**same open API** (`/v2/vehicles`), **in JSON** — which is what made it possible. The GTFS-RT
Protobuf exists but is not used (a new library just to decode it).

**The trap, and the most important thing here.** The service returns **the whole fleet**, not
the buses running. Measured on 9 August 2026, at night:

| | |
| --- | --- |
| Response size | **1.1 MB** |
| Vehicles in the list | 1679 |
| With a position | 1550 |
| Position age | median **9 hours**, worst **12 days** |

Almost every position is **the last known**, where the bus was parked. Drawing the list as it
comes filled the map with fifteen hundred buses in depots, **with no error**. So only those
that reported within `VEHICLE_MAX_AGE_S` (2 minutes) go in. **Do not turn that filter off.**
**`timestamp` comes in milliseconds** since TML took over (it was seconds) — every bus was
being discarded as "from the future" until that was found with a probe.

At night the list is almost empty, and that is the right answer.

**The weight demands brakes**: only on the transport map, only above `VEHICLES_MIN_ZOOM` (12),
only with `showVehicles` on — and Settings **says what it costs in data**. There is no way to
ask for less: no filter by area or line (`by_line` gives 404).

**The field names were read from a real response**: `lat`, `lon`, `bearing`, `line_id`,
`trip_id`, `speed` (**metres per second**), `timestamp` and `current_status` (`STOPPED_AT`,
`IN_TRANSIT_TO`, `INCOMING_AT`).

Each bus is a circle with the line number inside; those stopped at a stop are fainter. **They
go over the stops**, on purpose. No direction arrow despite `bearing`: it would need an image
or a character the bundled glyphs lack.


### 6-C. Speed cameras

- From OpenStreetMap, through Overpass (`src/services/cameras.ts`). **Every type tagged
  there**, not only the fixed camera: `highway=speed_camera`, plus points with
  `enforcement=*`, which carries **average-speed checks** and **red-light cameras** — often
  without the `speed_camera` tag.
- **Those not on this route are filtered out.** The query brings everything in the route's
  rectangle, including the motorway next to it. Only those within `CAMERA_CORRIDOR_M` (40 m)
  of the line go in. After two false warnings nobody pays attention — and then it stops
  serving its purpose.
- Requested **once per route**, never while driving. A failure here breaks nothing.
- Warned at `CAMERA_WARN_METERS` (300 m), once per camera, with the limit when tagged. The
  screen shows it **under** the manoeuvre: where to turn always comes first.
- **Always say what this is not.** Mobile cameras are on no map — they move daily, and Waze
  only has them because people mark them. And OpenStreetMap is incomplete. It is a help, not
  a guarantee — said on the Settings screen, and it must stay there.

### 6-D. Tolls

- Turned on with `avoidTolls`, which adds `exclude=toll` to the OSRM request (car only).
- **The public server may not have that exclusion installed.** Then it errors — and the
  request goes again without it, because a route with tolls beats no route. `Route.avoidedTolls`
  says what really happened, and the panel warns when it was not possible. **Do not promise
  what was not done.**
- **Per-section prices are not possible.** Portugal has no open source with toll prices
  (Infraestruturas de Portugal publishes PDFs, per concession and vehicle class, changing
  yearly). OSM has `toll=yes` but not the amount.

### 6-E. Battery saving

- On a long straight road the GPS is read every `BATTERY_SAVER_INTERVAL_MS` (4 s) instead of
  every second. Near the manoeuvre it goes back to normal, because there the position decides
  whether the warning comes in time.
- **Accuracy never drops.** Still `BestForNavigation`: what changes is how often, not how
  well. Lower accuracy would have Android answer from cell towers.
- The two distances switching this on and off are **deliberately different**
  (`BATTERY_SAVER_MIN_METERS` and two thirds of it). Switching pace resubscribes the GPS, so it
  must not flip at the threshold.

### 6-F. Measuring tape

- Turned on in the layers sheet. While on, **a tap on the map adds a point** instead of the
  long-press hint — the only thing in the app that changes what a tap does.
- **Two modes**, as in Google Earth: *Distance* along an open line; *Area* closes the shape
  and gives **perimeter and area**. The way from home to work does not close.
- **The perimeter is not the line's length.** Four corners of a plot give three drawn
  segments; the fourth only exists when closing (`perimeterMeters`).
- **Each segment has its length written halfway along it**, as in Google Earth. Needs the
  glyphs (`labelsReady`).
- **Area is not computed in degrees.** It is projected to metres around the shape's centre
  (longitude shrinks by the cosine of the latitude) and then the shoelace formula applies
  (`polygonAreaM2`, in `geometry.ts`). Shown in **m², hectares or km²** — the hectare is how
  plots are talked about in Portugal.
- **Say what this is not:** the map's and the finger's precision. An idea, not a boundary.
- Polygon and line only draw from three and two points: a geometry without enough points is
  not valid GeoJSON and takes the whole source down, silently.

### 6-G. Stops along the way and alternative routes

- **Waypoints** (`waypoints`, in `App.tsx`) are points the route must pass before the
  destination, added from a place's card ("Stop here on the way", only with a destination
  chosen). They go at the end of the list.
- **When recalculating while navigating, only the waypoints still ahead go in** — going
  through the pharmacy again would mean a U-turn (`waypointIndices`).
- **Alternatives and waypoints do not mix.** OSRM can only find alternatives between two
  points; with waypoints it says "not implemented". So `alternatives=3` only goes in without
  waypoints.
- Routes not chosen are drawn **before** the chosen one, and faded: in MapLibre the order
  layers are added is the order they stack.
- The chosen route is `routeOptions[routeIndex]`; switching is only changing the index — no
  new request.

### 6-H. Speedometer and speed limit

The speed one is going at, in a corner of the navigation screen (`showSpeed`).

- **It comes from the GPS receiver, not from distance over time.** The phone measures speed by
  the Doppler shift of the satellite signal — directly, with little error. The home-made sum,
  with one-second readings and five metres of uncertainty each, gave about **twenty km/h of
  error per reading**.
- **So there is no fallback sum.** When Android cannot tell the speed — it sends `-1`, and some
  phones `null` — the speedometer **disappears** instead of showing a number. In a tunnel,
  saying 0 to someone doing 100 is worse than saying nothing.
- **The number is the GPS's, untouched** (the author's request): a speedometer that lies a
  little when stopped is trusted a little less when moving. The only sum is m/s to km/h.
- **It shows both while navigating and when driving without a destination.** The drawing
  lives in `SpeedBadge`, used by the navigation screen and the map.
- **Outside navigation, the GPS pace goes up when moving fast.** Every ten seconds is plenty
  for a blue dot and useless for a speedometer. Above `DRIVING_SPEED_MS` (18 km/h) it reads
  every two seconds, **with `distanceInterval` at zero** — otherwise braking from 90 to zero
  never covers the fifty metres that unlock the next reading, and it stuck at 90.
- **Quick in, slow out** (`DRIVING_LINGER_MS`, a minute and a half). The first version
  vanished at every traffic light — a speedometer shows zero when stopped, it does not hide.
- **It turns red over the limit** — the camera's when one is near (that one fines), otherwise
  **the road's**: OpenStreetMap's `maxspeed`, asked of **Overpass** along the route
  (`speedLimitsAhead`, in `src/services/speedLimits.ts`). **OSRM does not give it** —
  `annotations=maxspeed` only exists at Mapbox; the FOSSGIS server answers "query string
  malformed" (probed). The query takes the nodes within 10 m of a thinned polyline (a point
  every ~100 m) and then their ways (`node(around)` → `way(bn)`), with its own
  `LIMITS_TIMEOUT_MS` (60 s) because nobody waits for it. **Proved with real data** (Lazarim →
  Marquês): 263 of 351 points with a limit — 70 on the 25 de Abril bridge, 40 on the toll's
  Via Verde lanes, 90 and then 50 on Duarte Pacheco. The `way(around)` version gave the same
  and got a 502. The window covers `LIMITS_WINDOW_M` (80 km) from the car; the next is asked
  when `LIMITS_REFETCH_M` (10 km) are left — about one request per motorway hour; a failure
  only removes the sign (retried after `LIMITS_RETRY_MS`). Each route point takes the limit
  of the nearest way within `LIMITS_MATCH_M` (25 m). Next to the speedometer, the **limit
  sign**, as in Waze; the voice says "Speed limit 50" **once** when going over, and not again
  for `LIMIT_WARNING_EVERY_MS` (a minute). Its own setting (`speedLimitAlerts`), **off by
  default** at the author's request. Where OSM has no limit, no sign. Implicit limits
  (`PT:urban`, `PT:rural`) are left out: only numbers are read.
- `SPEED_OVER_LIMIT_KMH` (5 km/h) is not leniency: it is the GPS's own uncertainty.
- **Say what this is not:** the car's speedometer rules. The GPS one measures ground speed and
  usually reads a few km/h **below** the dashboard, which is deliberately optimistic by law.
- Always **km/h**, in both languages. Language is not country.

### 6-I. In-app updates

The app knows when there is a new version, downloads it and hands it to Android's installer —
no trip to GitHub. In Settings, "Updates".

**No key, and that is not luck.** GitHub's Releases API answers anyone because the repository
is public — the same decision that lets the country maps download without authentication.

**It does not install by itself.** Android does not let an app install itself silently. What
is done is everything possible: check, download, open the installer with the file in hand.
**The person presses "Install"**; the first time Android also asks to allow installs from
PalmMap. The screen no longer says so (the author removed it as implied).

**An install that did not finish is told at the next start** (`unfinishedInstall`, in
`update.ts`). Before opening the installer the attempted version is stored
(`palmmap.instalacaoPendente`); at start-up it is compared with the running one. Lower: the
notice opens with "The installation did not finish" and "Install now", **without downloading
again**. It does not start by itself — opening the installer to someone who just saw it fail
would be insisting.

**When the app opens, it updates itself as far as Android allows** (the author's request):
check at start-up, and if there is a new version **and on Wi-Fi**, the download starts with
no tap; when done, the installer opens. **The same happens after "Check for updates" in
Settings on Wi-Fi**: the check sets `update`, and the notice, already knowing it is on Wi-Fi,
starts the download — the author saw this in November 2026 ("it updated by itself").

- **The automatic download is Wi-Fi only** (`onWifi`). Tens of megabytes on someone's plan
  without asking is what was already ruled out for country maps.
- **Whoever asked for nothing must be able to leave.** In a download the person asked for,
  "Not now" disappears; **in the automatic one it stays**. Quitting does **not** cancel the
  download, only stops the installer opening (`cancel`, in `useUpdateDownload`).
- **The network is read before the check answers**, so the notice is born knowing.

**The check runs at every start**, with a quarter-hour brake (`UPDATE_CHECK_INTERVAL_MS`).
GitHub allows 60 unauthenticated requests per hour **per IP address**; the date of the last
check is **stored** and marked *before* asking. A failure puts no error on screen; whoever
presses the button sees it.

Four decisions that matter:

- **`/releases/latest` is not used — a real trap.** It returns the most recently published
  Release, **whatever it is**: maps (`mapas`), timetables (`horarios`) are Releases too. The
  list is fetched and the highest `apk-*` chosen.
- **The build number is compared, not the version text.** As text, `"7.0.9" < "7.0.10"` is
  **false**.
- **The file goes to the cache, not documents**, and only gets its `.apk` name at the end — a
  truncated APK gives "problem parsing the package".
- **The startup notice shows once per version**: the **number** of the postponed build is
  stored, so it goes quiet for that version and speaks again for the next.

**Two Android things without which this fails**, with no explanatory error:

1. `REQUEST_INSTALL_PACKAGES` in `app.json`. Without it the installer does not open.
2. A **`content://`** address, never `file://` — since Android 7 passing a `file://` to another
   app throws `FileUriExposedException`. `getContentUriAsync` (from `expo-file-system/legacy`)
   gives it through Expo's FileProvider, and `FLAG_GRANT_READ_URI_PERMISSION` lets the
   installer read it.

**Download and install live in a hook** (`useUpdateDownload`), because two screens do it — the
notice and Settings. Two copies would diverge, in the error handling nobody tries.

### 6-J. Screen text — across the whole app

**Write the minimum; what is implied is not written.** The author's request (November 2026),
for every screen. The Settings screen once had 4557 characters of explanations, went to 2609
and then to **1190**: out went lines repeating the option's name, those explaining internals,
and those telling users to run GitHub workflows. The why of each decision is this file; the
screen keeps what changes a choice.

- **No line under an option whose name is enough.**
- **Errors say what failed in one sentence, without obvious advice.** "Check the connection"
  is gone everywhere. Messages telling apart refusal (with the status), delay and no network
  stay — that difference is information.
- **Four short warnings stay**, preventing a wrong expectation: cameras are only
  OpenStreetMap's; the car's speedometer rules; live buses cost 1.1 MB every 20 s;
  train/metro/ferry timetables show no delays.
- When adding text, measure:
  `Object.values(pt.settings).filter(v => typeof v === 'string').join(' ').length`. Over 1500
  means some explanation is growing again.

### 6-K. When the app closes by itself

`ErrorBoundary` never catches **an error inside a promise, a `setTimeout` or a call from the
native side.** In a release build those go to React Native's global handler, which hands them
to Android as fatal. The app vanishes.

This does not fix the fault. **It fixes the report** — without the phone at hand, a
photographed message saves rounds of guessing.

- **`installCrashHandler()`** (`src/services/crash.ts`) runs at start-up, before everything,
  and **chains** onto the existing handler instead of replacing it. It stores the message and
  the first twelve stack lines in `AsyncStorage`, and lets the app close: keeping alive an app
  whose state already blew up makes what follows harder to understand.
- **It shows at the top of Settings** the next time, with a button to clear it. Read when the
  screen opens, not at start-up.
- **`ErrorBoundary` writes there too**, in case the person closes the app without photographing
  the red screen.
- **`guarded()` is for functions the native side calls**, and only those: the two position
  trackings. An error there goes through none of our `try`s and would close the app **in the
  middle of a road**. Wrapped, one GPS reading is lost. **Do not use this everywhere:**
  swallowing errors in normal code hides faults.

Nothing leaves the phone.


### 7. Offline — what is allowed and what is not

**Downloading an area of OpenStreetMap tiles for offline use is forbidden** by their tile
usage policy: "download this city for offline use" features rely on fetching tiles ahead, which
counts as bulk downloading. Offenders are blocked without warning.

So **`OfflineManager.createPack()` is not used** with OpenStreetMap or CARTO tiles. Not a
technical limit — a rule this project respects. The distinction to keep whenever touching
this:

> **Keeping what the person saw is a cache, and legitimate. Fetching ahead what they have not
> seen yet is bulk downloading, and is not done.**

What is done, legitimately:

- **A zoom ceiling on tiles** (`MAX_TILE_ZOOM`, 18); above it MapLibre enlarges what it has.
  It also takes about sixteen times the load off OpenStreetMap's servers.
- **A cache of what was seen.** Size is a setting (off, 100 MB to 1 GB), applied by
  `setMapCacheSize()`, with a clear button. **No expiry can be set** — MapLibre's API takes a
  size, not a time; when full it forgets what was least recently seen.
- **Country maps in PMTiles** — the legitimate way to have a whole country offline (next
  section).
- **Saved places on the phone**, always available.

**The cache's limit:** it only has the zoom levels one passed through. That is what country
maps solve.

### 8. Country maps (PMTiles)

#### The idea

Instead of thousands of images, a whole country fits in **one file** of map geometry.
Protomaps publishes the whole planet in PMTiles, daily, **precisely to be cut like this** — no
policy problem, unlike OSM tiles. `pmtiles extract` reads only the pieces it needs: dozens of
requests, not thousands. São Tomé and Príncipe is **2 MB** in geometry, where image tiles would
be about 240 MB.

All countries are downloaded on request (São Tomé used to ship in the APK; it no longer does).
They end up in the same folder with an identification file next to them.

#### The pieces

- **`assets/glyphs/*.pbf`** — fonts, Noto Sans regular and medium, two 256-character blocks
  each (enough for Portuguese), from `protomaps/basemaps-assets` (SIL Open Font). Copied once
  to the app folder at first start (`installBundledAssets()`), because files inside the APK
  have no path MapLibre can open.
- **`metro.config.js`** — without it the bundler rejects `.pmtiles` and `.pbf`.
- **`src/services/vectorStyle.ts`** — the style: colours, widths, zooms.
- **`src/services/offlineMap.ts`** — downloads and deletes, and says which region covers a
  position (`regionAt`).
- **`src/components/OfflineMaps.tsx`** — the list in Settings. **Several download at once**;
  progress is a map of `id` to progress, and the list of downloads in progress also lives in a
  `ref`, otherwise the download function changed identity on every bar step and every row
  redrew. At the end, **"Missing a country? Ask on GitHub"** opens a pre-filled issue
  (`MAP_REQUEST_URL`).
- **`map-regions.json`** — the **catalogue**: 90 regions worldwide. Being there does not mean
  generated; the app lists what is in the Release's `mapas.json`.
- **`.github/workflows/build-map.yml`** — generates the regions given. **Runs by itself on the
  1st of each month**: OSM changes daily and a stored map ages silently. A scheduled run has no
  list, so it **redoes exactly those already published** — not the catalogue's 90 (days of
  work, over 100 GB). Each manifest entry carries its generation date (`gerado`). **It adds,
  it does not replace**: otherwise generating France would erase Portugal. Each region is
  uploaded and deleted from disk right after — the runner has about 20 GB and some countries
  are over 1 GB. It also builds each country's **business file** (`<id>.pois`, from
  Geofabrik, `build-pois.py`); option `apenas_negocios` builds only those.

#### Keeping maps up to date

The workflow refreshes the published ones monthly, and the app refreshes the ones it has —
**only on Wi-Fi**, a decision: mainland Portugal is 325 MB. Off Wi-Fi nothing downloads and
the maps screen **marks them outdated**; a tap then **refreshes instead of deleting**.

**Without a date on one side, nothing is concluded** — a map generated before `gerado` existed
would otherwise be refetched by mistake.

**The manifest is requested with a changing parameter.** GitHub serves these files through a
CDN; without it a freshly generated country could be invisible for hours. That is also why **a
new country needs no app update**.

#### How it switches on by itself

No setting, on purpose. **With a network, the stored map is not used**: the drawn
OpenStreetMap map is shown from start to end. Using the stored file with a network swapped the
map for one that looks completely different as the country filled the screen. **The stored map
comes in when there is no Internet** (`isInternetReachable`, not `isConnected` — a hotel portal
is connected without Internet); while that is still unknown at start-up, it is not used. The
comparison is by region `id`, so the style only switches when the region really changes —
switching style reloads the map. The trade-off: with a network, tiles are requested in areas
already stored.

Satellite and transport always win: they have no stored substitute.

#### Far out, the country is not enough

A stored country **does not carry the world**: `pmtiles extract` keeps the tiles touching its
borders, at every level. Zoomed out, the screen is bigger than what the file holds. Two things
handle it, not to be undone:

- **Internet tiles go on top of the stored map**, with a zoom ceiling from the country's size
  (`regionMinZoom`, in `vectorStyle.ts`): above it the country fills the screen and the layer
  disappears; below it, it covers it and the world shows. **Offline they do not appear** and the
  country shows again. Portugal gives zoom 6, São Tomé 7, Madeira 8.
- **Below `OFFLINE_SWITCH_MIN_ZOOM` (5) the country no longer switches.** Far out the choice
  changes nothing visible, it only reloads.

The image styles also got a background layer in the map's colour: a missing tile showed the
void, which MapLibre draws black.

**If the stored map fails to open, the app falls back to the Internet tiles**
(`onDidFailLoadingMap`), recorded **per country** (`failedRegions`) — it was once a latch
that, once closed, turned offline off for the session. It is what avoids a blank screen — and
what lets a fault go unnoticed, hence the warning at the top about testing with data off.

Real sizes (zoom 14): São Tomé 2.0 MB, Madeira 5.1 MB, Cape Verde 8.4 MB, Azores 11.7 MB,
Guinea-Bissau 23.8 MB, mainland Portugal 324.6 MB. **The whole planet at Portugal's detail is
about 120 GB**, and GitHub refuses files over 2 GB in a Release — so countries are generated on
request. Zoom 14 gives every street and each level down roughly halves the file; over 2 GB the
workflow warns and skips it, so the entry's `maxzoom` can be lowered.

#### The style, and the fault that is hard to find

With geometry we say water is blue, a motorway wider than a track, and from which zoom each
thing appears. 25 layers, light and dark.

**Layers and filter values were not guessed:** they came from reading the file itself.
**Protomaps Basemap v4.15.1** schema: `earth`, `landcover`, `landuse`, `water`, `roads`,
`buildings`, `boundaries`, `places`. The `pois` layer exists and is not used on purpose.

**The fault to fear:** a layer name or filter value that stops matching makes that layer
disappear **with no error**. When changing the map version, check the names first.

Two checks that run without a phone, to repeat after touching the style:

```bash
# 1. Does the style respect the MapLibre spec?
npx tsc src/services/vectorStyle.ts --ignoreConfig --outDir /tmp/vs \
  --module commonjs --target es2020 --skipLibCheck --esModuleInterop
node -e "const {buildVectorStyle}=require('/tmp/vs/vectorStyle.js');
const {validateStyleMin}=require('@maplibre/maplibre-gl-style-spec');
console.log(validateStyleMin(buildVectorStyle('pmtiles://x','y/{fontstack}/{range}.pbf',false)))"
```

The second is comparing the layers the style asks for with those the file really has.
`@maplibre/maplibre-gl-style-spec` already comes with MapLibre.

**Reading a local PMTiles file was the biggest unknown and is confirmed working** (Portugal
and São Tomé seen in airplane mode). If it ever breaks, the other way to write the address is
`pmtiles:///absolute/path`, without `file://` — noted in `localStyleSource()`.

### 9. The position, and using the app with no network

The GPS **needs no Internet**: it works in airplane mode, with location on and sky in view.
What needs a network is the rest: tiles, search, routes. With a country downloaded, the app
still shows where one is and the map around — on a plane, a boat or in the mountains.

- **`Accuracy.High`, not `Balanced`.** Android's `Balanced` answers from Wi-Fi networks and
  cell towers — fast in a city and **useless without a network**.
- **The first fix without a network is slow.** The phone usually asks the Internet for help
  with the satellite list (A-GPS); without it, thirty seconds to two minutes. So the last known
  position comes first, and tracking corrects it.

Outside navigation the position is followed slowly (`watchPositionIdle`, every ten seconds or
fifty metres). While navigating that subscription is off and the navigation one, every
second, takes over — both on was battery spent twice.

**The compass** (`watchCompass`) runs only outside navigation and with the app on screen, for
the cone in front of the blue dot; it only **checks** the permission, never asks, and skips
changes under `HEADING_MIN_CHANGE_DEG` (4°).

### A stored position has an expiry

**With the app in the background, Android cuts GPS readings** — the trade-off of asking
permission "while in use", and right. What stays behind: someone who moved comes back with the
position from where they **were**, and for a few seconds nothing tells it from a good one.
That is how centring sometimes went to a place one had been. Three things handle it:

- **The last reading carries the time it was measured** (`lastFix`, in `location.ts`) — the
  reading's time, not arrival time: Android sometimes hands a cached position on resubscribe.
- **The button does not centre on state** — it asks `getBestPosition()`, which returns the
  stored one if still recent (`POSITION_FRESH_MS`, 20 s) and fetches a new one otherwise.
  After `POSITION_TIMEOUT_MS` it gives up and uses what there is.
- **On coming back to the screen, a new reading is asked right away.**

The start-up shortcut to the last known position has a maximum age too
(`LAST_KNOWN_MAX_AGE_MS`).

**No reading may wait forever, and that cost a version.** `getCurrentPositionAsync` has no
timeout: without signal it waits indefinitely. All readings go through `comPrazo()`, and
start-up ends on the last known position of any age when nothing arrives in time.

**Asking for permission is not done outside start-up.** Asking opens a system dialog, which
takes focus away, which Android reports as leaving and coming back — waking everything
listening for that. Start-up asks, once; `getFreshPosition()` and `watchCompass()` only
**check** (`getForegroundPermissionsAsync`).

**The GPS button has two levels, as in Maps.** One tap takes the camera to the position once;
**two taps make it follow** and the button lights up. With following on, any tap turns it
off. All in `handleLocatePress`:

- **A single tap acts at once**, without waiting for a possible second.
- **Outside navigation following uses `'default'`, not `'course'`** — turning the map with
  the heading helps driving and disorients on foot.
- **`onTrackUserLocationChange` reports that following dropped**, not `onRegionDidChange`'s
  `userInteraction`: dragging drops following, **pinching does not**, and both are
  interaction. The library knows the difference.

Choosing a destination turns following off — the map frames the whole route.

**The app opens where the person is.** Until the GPS answers it opens in Lisbon, and when the
first position arrives the camera moves there — once, without animation. If a destination was
chosen meanwhile, the camera stays. See `openedOnUser`, in `MapView.tsx`.

**Trap:** route calculation **must not depend on the position in state** — every GPS reading
would send a new OSRM request. The position is read from a `ref` and the effect depends on
`hasLocation`, a boolean that only changes on the first reading.

### 10. Real-time navigation

- While navigating, **normal route calculation is off** — a request a second otherwise. The
  navigation engine recalculates, only after `OFF_ROUTE_STRIKES` readings in a row off the
  route.
- The GPS is followed only while navigating, and the subscription is always cancelled on
  leaving.
- Distances are in `src/utils/geometry.ts`. Manoeuvre indices along the line are computed once
  per route.
- The voice is optional and uses `expo-speech`. Failing to speak must never interrupt
  navigation — see "10-A".
- **The screen stays on while navigating** (`expo-keep-awake`, tag `KEEP_AWAKE_TAG`), switched
  on entering and **always off on leaving**: Android counts requests by name.
- **Navigation carries on with the phone in a pocket.** A **foreground service** with a
  permanent notification (`expo-location` + `expo-task-manager`, task `NAVIGATION_TASK`).
  **It needs `RECEIVE_BOOT_COMPLETED` in `app.json`** — see "10-B". With `foregroundService`
  **no background location permission is needed** (read in `expo-location`'s native code).

  **The most serious trap here: Android only lets a foreground service start with the app in
  front.** The tracking effect re-runs whenever the route, cameras or GPS pace change; with
  the screen locked, stopping and restarting threw and left the trip without a position. So
  stopping the service is **scheduled** (`SERVICE_STOP_GRACE_MS`, 2 s) and cancelled by
  whoever comes next; and if options cannot be changed, **what is there stays**. If the
  service never starts — some manufacturers — the normal subscription is used.

  **Still to confirm on a phone:** that `expo-speech` really speaks with the app in the
  background.

### 10-A. The voice

The voice is the only thing guiding someone driving without looking, so it is worth not
sounding like a badly programmed robot.

**The voice is chosen by hand** (`prepareVoices`, in `utils/voice.ts`). Only saying
`language: 'pt-PT'` **is not enough**: if the phone lacks European Portuguese, Android serves
what it has — Brazilian Portuguese reads "Rua Augusta" differently; and Android usually has a
small local voice and a much more natural network one, and the default is usually the small
one (on Android the declared quality does not tell them apart — `network` in the identifier
does). So the phone is asked for its voices and the best kept. **Region beats quality.**
Without one that fits, the language is said and the system chooses.

#### ⚠️ Ask the speech engine nothing before it answers

Not what was closing the app (see "10-B"), but a real trap. In `expo-speech`'s
`SpeechModule.kt`: the Android engine **only starts on first use** and takes seconds; requests
before that **queue**, and the queue is drained inside `onInit` — a plain callback **with no
`try`**. And **`textToSpeech.voices` throws** on several Android engines. Inside an
`AsyncFunction` that is a rejected promise; inside `onInit` it closes the app. Listing voices,
and **speaking with a chosen voice** (their `speakOut` also walks `voices`), both touched it.

> Until the speech engine has given a sign of life, **do not ask for the voice list nor name a
> voice**. Only say the language, the path that never touches `voices`.

The sign of life is any of a reading's four events. **It costs the first sentence**, read with
the system's voice.

**When there is no voice for the region, say so** (`hasRegionVoice`), a line under the voice
option: otherwise an unexpected accent reads as an app fault, and the fix is in Android's
Text-to-speech settings.

**In English, Portuguese street names are read with the Portuguese voice** (the author's
request, November 2026, reversing an earlier decision): an English voice saying "Rua Augusta"
was hard to understand. `speak(text, portugueseNames)` cuts the sentence around the names
(`splitAroundNames`) and queues the pieces, each with its voice; the short pause around the
name was judged better than the accent. Only where names are Portuguese
(`namesArePortuguese`: Portugal, Madeira, Azores, São Tomé, Cape Verde, Guinea-Bissau) — in
London the English voice is right. Today only the manoeuvre's street (`step.streetName`) is
passed.

**Distances are spelled out** (`formatDistanceSpoken`): "850 m" read aloud is "eight hundred
and fifty em". The screen keeps the abbreviation.

**What the voice says goes through the language table** (`navigation.inDistance`,
`cameraAhead`, `cameraAheadLimit`, `recalculatingVoice`, `overLimitVoice`).

**The voice is not cut mid-sentence.** `stopSpeaking()` was in the tracking effect's cleanup,
which runs whenever the route changes: recalculating said "recalculating" and cut itself off.
Silencing the voice belongs to **ending** navigation, in the effect that sees it end.

### 10-B. The permission without which navigation closes the app

**From a real crash, caught with the stack trace in hand.** The app closed on pressing "Go",
then at every start — immediately or five seconds later. Three symptoms, one cause:

```
java.lang.IllegalArgumentException: Requested job cannot be persisted without holding
android.permission.RECEIVE_BOOT_COMPLETED permission
  at android.app.job.IJobScheduler$Stub$Proxy.schedule(IJobScheduler.java:479)
  at expo.modules.taskManager.TaskManagerUtils.updateOrScheduleJob(TaskManagerUtils.java:155)
  at expo.modules.location.taskConsumers.LocationTaskConsumer.reportLocationsImmediately(…:265)
  at …handleLocationUpdate(LocationTaskConsumer.kt:106)
```

1. `expo-location` hands each GPS reading to the task **through Android's `JobScheduler`**.
2. `expo-task-manager` builds that job with **`.setPersisted(true)`**, always.
3. **Android requires `RECEIVE_BOOT_COMPLETED` to accept a persisted job**; without it,
   `schedule()` throws `IllegalArgumentException`.
4. `expo-task-manager` **catches the wrong type** (`IllegalStateException` only), and on the
   main thread that closes the app.

**The permission is in `app.json` now, and stays.** It also closed at start-up because the task
is **stored** and restored on the next start (`restoreTasks()`), re-subscribing the GPS. The
task is now dropped at start-up too, but **the permission is the fix**: the cleanup runs in
JavaScript and the GPS reading may come first.

**The bigger lesson:** the stack trace answered in two minutes what two rounds of code reading
had not. After a crash nobody can reproduce, the first thing to ask the person who has it in
front of them is the error message — not one more hypothesis.

### 11. Screen insets (camera, system bars)

Expo draws edge to edge: the map goes under the status bar, the camera cut-out and the
navigation bar. The elements on top of the map move away.

- Always `useSafeAreaInsets()` from `react-native-safe-area-context`; `SafeAreaProvider` wraps
  the app in `App.tsx`.
- **Never `react-native`'s `SafeAreaView`.** It only works on iOS; on Android it does nothing —
  that is how the search bar ended up under the camera.
- `Modal` screens get `statusBarTranslucent` and `navigationBarTranslucent`.

### 11-A. Draggable bottom panels

- The panels with a handle — place card, route, transport, measuring tape — shrink when the
  handle is pulled down, and come back when pulled up. A tap on the handle does the same.
- **The gesture is only on the handle, never the whole panel**, otherwise dragging the stops
  list pulled the panel down. That is why `DraggableSheet` hands the gestures through a
  function (`children(dragHandlers)`).
- The touch area around the handle is much bigger than it.
- **`Reveal` uses `pointerEvents="box-none"`**, so taps reach the map under a shrunk panel.
- The animation runs natively (`useNativeDriver`).

### 12. Light and dark theme

- All colours are in `src/theme.ts`, in two palettes. No component writes a colour by hand —
  ask the theme with `useTheme()`, from `src/settings.tsx`. (The map's own drawings — the blue
  dot, the cone — are the exceptions, as in every maps app.)
- Which palette: "automatic" follows the phone, otherwise the person's choice.
- Styles are a function of the theme: `makeStyles(theme)` at the end of the file, with `useMemo`.
- `app.json` has `userInterfaceStyle: "automatic"`; without `expo-system-ui` it does not work
  on Android.
- The map changes too: OpenStreetMap tiles in light, CARTO in dark (OSM has no dark tiles;
  CARTO is free for non-commercial use with attribution, no keys).

### 13. App state

The main information lives in `App.tsx`, with `useState`: `userLocation`, `destination`,
`routeOptions`/`routeIndex`, `transitTrips`, `navigating`… The route is drawn from
`route.coordinates`. React state and, if ever needed, Context are enough — no state library.


## Android Auto (paused)

> **Status: paused.** The author set this aside after seeing what it involves. Do not start
> working on Android Auto, do not install libraries for it and do not run `expo prebuild` to
> prepare it. This section records the research done, so it need not be repeated.

The idea was to use PalmMap on the car screen. It is possible, but the rules are much
stricter than on the phone:

1. **The car part cannot be written in React Native.** Android Auto apps use Google's
   *Android for Cars App Library*, in Kotlin/Java. The car **does not show the app's screen**:
   the app provides templates (lists, navigation panel, map) and the car draws them, with
   strict rules not to distract the driver. A native module apart from the React Native code.
2. **It means leaving managed Expo** (`npx expo prebuild`, editing `android/` by hand).
3. **The big trap: it cannot be installed by APK in the car.** Android Auto's "Unknown
   sources" developer option **does not apply to navigation apps** built with the Cars App
   Library — Google's documentation says so.
4. **For a real car, the Play Store is needed**: a developer account (a one-off US$25) and, for
   navigation apps, **an extra manual review by Google**: real turn-by-turn, lane guidance,
   sending the next manoeuvre to the instrument cluster, a driving demo mode, driver
   distraction rules. A bar set for Waze and Sygic. (Whether internal test tracks skip the
   review is contradictory in Google's docs — test rather than assume.)
5. **What can be done now, for free: the Desktop Head Unit (DHU)**, a car-screen simulator that
   comes with Android Studio. Development and testing need no car, store or review.

**Why paused:** native Kotlin code apart from the rest, leaving managed Expo, and above all no
APK install in the car — the Play Store and Google's review as the only way. Not worth it for a
personal project.

**If ever resumed:** have the phone app working (done); `npx expo prebuild`; write the Android
Auto module in Kotlin and test it on the DHU; the Play Store only at the end, and only if the
DHU step goes well. Lanes and the speed limit, which the review asks for, already exist on the
phone side.

## Usage rules of the external services

These are not style preferences — they are the services' terms of use. If they are not met,
the app's requests end up blocked. PalmMap's volume is tiny and the free public services are
plenty; **no servers of our own are needed**. One only has to be polite to services run by
volunteers. All of this is already in the code; what follows says where, so it is not undone
without understanding what is being switched off. Addresses, `User-Agent`, intervals and
timeouts are all in `src/services/config.ts`.

### Nominatim — address search

- **At most 1 request per second**, a hard limit. *In the code:* a queue in
  `src/services/nominatim.ts`.
- **A `User-Agent` identifying the app is mandatory** (`USER_AGENT`). It names the project and
  its repository — **never anyone's e-mail address**.
- **No request per keystroke.** The public service forbids search-as-you-type. *In the code:*
  `SearchBar` waits `SEARCH_DEBOUNCE_MS` (1 second) after typing stops, and only searches from
  3 letters. **Do not lower this value.**
- Results are kept in memory, so the same search is never repeated (`Map` cache in
  `nominatim.ts`).
- **When Nominatim fails, Photon is asked** (`PHOTON_BASE_URL`, by Komoot: OSM data, open, no
  key). Only after Nominatim fails, never both at once, with its own one-a-second queue. The
  search has a shorter timeout (`SEARCH_TIMEOUT_MS`, 7 s). Photon is GeoJSON, **longitude
  first**.
- **The search error says what failed**: refusal (with the status on screen), delay, or no
  network — see `searchError`. In September 2026 the author saw "check your connection" on
  every search with the network working; the cause was never known (probably Nominatim's
  side). If it comes back, the photo of the new message says which.
- **What is on the phone does not wait for the second.** While typing, saved places and recent
  destinations matching the text (accents ignored) show at once, above the results.
- **A search already on its way is not repeated, and one nobody wants any more does not go
  out.**
- **Choosing a result does not search its name** (`escolhido`, in `SearchBar`).
- **Voice search** (microphone in the bar, with the box empty): opens Android's own speech
  recogniser (`RECOGNIZE_SPEECH`, through `expo-intent-launcher`, which was already here — no
  new library or key), and what was heard is searched at once, as with Enter. See
  `voiceInput.ts`. JavaScript cannot ask Android whether a recogniser exists without a new
  library, so it is learnt: the first time the screen fails to open, it is stored
  (`palmmap.semReconhecimentoVoz`) and **the microphone never shows again** on that phone (the
  author's request). Practically every Android phone has one (the Google app's).
- Reverse geocoding (coordinates → address), for the dropped pin, goes through the same queue
  and cache. If it fails, the pin stays, without an address.

### Overpass — businesses and points of interest

The heaviest of the services: each query makes the server walk OpenStreetMap's data.

- **Since November 2026, Overpass is only asked by the category buttons, a tapped pin's
  details (`placeDetails`), the speed cameras and the speed limits.** Automatic pins come from
  the country's business file or from the OpenFreeMap tiles. Much of what follows was written
  when automatic pins came from Overpass; the queue rules still apply to every caller.
- At least 2 seconds between requests (`OVERPASS_MIN_INTERVAL_MS`), in **one queue**,
  exported by `overpass.ts` as `overpassSchedule` and used by cameras and limits too. A queue
  per file is two queues, each keeping its own two seconds while requests go out together.
- **A 200 with `remark` is a failure** — Overpass answers success and explains there that the
  query died from time or memory. Caching that left the area empty all session.
- The category buttons search **the visible map area**, not around the GPS
  (`searchCategoryInBounds`), with a "zoom in" notice below `CATEGORY_MIN_ZOOM` (12).
- **Automatic pins must never be a request per drag.** When they came from Overpass: only from
  `MAP_PINS_MIN_ZOOM` (15), only `MAP_PINS_DEBOUNCE_MS` (1.2 s) after the map stops, an area
  snapped to a grid (`MAP_PINS_GRID_DEG`) so the cache could hit, cached per grid square asking
  only for the missing ones, and identical in-flight requests shared. **Do not switch any of
  this off** if Overpass pins ever come back.
- **The limit is per tag group, not per query.** One `out center 80` at the end of a union of
  three groups was spent entirely on the first group, by OSM id order — no shops, and eighty
  restaurants scattered over the whole area. Each group gets its own `out` (`taggedQuery`),
  and duplicates are removed by type+id.
- **A queued request nobody wants any more does not go out** (`isWanted`, in `rateLimit.ts`;
  skipped with `SupersededError`, not counting for the interval). For a shared request, one
  interested party wanting it is enough.
- **There is a second server for when the main one refuses** (`OVERPASS_FALLBACK_URL`,
  `overpass.private.coffee`, listed on the OSM wiki). Only after the main one fails — 429,
  504, network, or 200 with `remark` — never both at once (`askOverpass`). The speed-limit
  query passes a longer timeout.
- `MAP_PINS_LIMIT` is 40 per group.

### OSRM — routing

- **`https://`, not `http://`** — Android blocks cleartext since version 9.
- **`router.project-osrm.org` is not used.** It is OSRM's demo server and **only has the car
  profile**: a walking request came back as a car route (confirmed in the street: 719 metres
  on foot gave "2 minutes" and a detour round a one-way street).
- **The three FOSSGIS servers** (`routed-car`, `routed-foot`, `routed-bike`), the ones
  openstreetmap.org uses, each with its profile — hence the mode in the address
  (`OSRM_ENDPOINTS`).
- Their terms ask for **at most one request per second**, a valid `User-Agent` and attribution
  to OSM and OSRM. The queue is in `osrm.ts` (`OSRM_MIN_INTERVAL_MS`); the credit is on the
  Settings screen. **Switch off neither.**
- Community servers, no guarantees: show a decent error when they are down.
- Routes are requested with `steps=true` (manoeuvres one by one, phrased in
  `src/utils/maneuvers.ts`) and come with lanes. **No `maxspeed` annotation** on this server
  (see 6-H).

### Valhalla — bicycle routes

- **FOSSGIS's Valhalla** (`VALHALLA_URL`), the other engine behind openstreetmap.org's
  directions, same organisation and terms as the OSRM servers: it **shares OSRM's queue** (one
  request a second), the `User-Agent` and the attribution.
- Why (November 2026): OSRM's bicycle profile has one kind of bike, and sent the author up an
  overgrown lane above Trafaria — Rua 28 de Setembro, tagged only `highway=residential` in OSM
  (Komoot routes it the same way). Valhalla takes a **bicycle type**: `Road`
  (`avoid_bad_surfaces` 1), `Hybrid` (0.25) and `Mountain` (0). **Probed on that trip:** Road
  and Hybrid stay on the EN 377-1, Mountain takes Rua 28 de Setembro and the dirt track. The
  app calls them Estrada / Normal / BTT (`bikeType`, `valhalla.ts`).
- The answer is read from a real response: `trip.legs[].shape` (polyline, **six decimals**,
  `decodePolyline6`), `maneuvers[]` with a numeric `type`, `length` in km (the request asks
  for km), `street_names`, `begin_shape_index`, `roundabout_exit_count`. The codes are mapped
  to OSRM's words (`asOsrm`) so the sentences, icons and voice are the app's own — Valhalla's
  Portuguese reads "em direção à a ciclovia". No lanes for bikes.
- `directions_type: 'none'` for the chip times; `alternates: 2` only between two points.
- **Any failure falls back to OSRM's bicycle server**: one kind of bike beats no route.

### Protomaps — offline maps

- The planet in PMTiles is published **to be used like this**, cut included. No rate limit, no
  mandatory User-Agent.
- Builds are daily, at a dated address; today's may not be ready, so the workflow goes back up
  to ten days.
- The data is still OpenStreetMap's: **the attribution stays mandatory**.

### OpenFreeMap — business pins in the tiles

- Free vector tiles from OpenStreetMap data, no key (`https://tiles.openfreemap.org/planet`).
  Only its `poi` layer is used, for the business pins where no country is downloaded; the
  attribution is in the source.

## Code style

- Clean TypeScript, with types for **every** API response — no `any` for data from the
  Internet; types live in `src/types/`.
- Function components with hooks.
- Styles grouped at the end of each component file, in a `makeStyles(theme)` returning a
  `StyleSheet.create`. Never hand-written colours.
- Icons: `@expo/vector-icons`, `MaterialCommunityIcons`. Check a new name exists in
  `node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/`.
- **Code, comments and this file in English.** User-facing text only in `src/i18n/` (Portuguese
  in `pt.ts`, English in `en.ts`). Some variable names are still Portuguese (`falha`,
  `semRede`…); rename them only when touching that code anyway. Data keys the app or the
  workflows read (`horarios`, `estacoes`, `regioes`, `gerado`, `fim`, the workflow modes
  `gerar`, `descobrir`, `sondar`…) **must not be renamed** — published files use them.
- When installing an Expo package, take the version from
  `node_modules/expo/bundledNativeModules.json` instead of npm's latest.

## Working with Git

- The main branch is `main`. Development happens on `claude/claude-md-documentation-k64ki9`.
- **The repository is public**, on purpose: the country maps download from a Release without
  authentication, which a private repository would break (the alternative would be a
  credential inside the APK, which is not done).
- **Never commit API keys or `.env` files.**
- The `.gitignore` comes from Expo and covers `node_modules/`, `.expo/`, the generated
  `android/` and `ios/`, and signing files (`*.jks`, `*.p12`).
- `package-lock.json` stays in the repository.
- **Do not open a Pull Request unless explicitly asked.**
- **Do not start builds unless asked.** The author asked for this expressly.


## Lessons learnt by trial and error

Mistakes already made in this project, so they are not repeated.

- **`react-native`'s `SafeAreaView` does nothing on Android.** The search bar ended up under
  the camera. Always `react-native-safe-area-context`.
- **"There was a problem parsing the package"** was not a truncated file — the first suspicion
  was wrong. The real causes were a repeated `versionCode` and the size of four architectures.
- **Wrong times on dirt roads are not missing data.** The roads are tagged unpaved; it is OSRM
  assuming 40 km/h where people drive at 20. Check before proposing "improve the OSM data".
- **Category filters search the visible area, not around the GPS.**
- **A text layer needs glyphs.** An attempt to show business names failed for lack of a font
  server; that is why the glyphs ship in the APK.
- **Read the file before writing the style.** The vector map's layers and filters came from
  decoding the `.pmtiles` itself. A wrong filter gives an invisible layer, not an error.
- **`gh release create` needs `-R`** when the workflow does not check out the repository.
- **A line without points is not valid GeoJSON, and takes the whole source with it.** Splitting
  the route into "done" and "left", the first half starts empty — and MapLibre threw the whole
  source away, **silently**. Hence two separate sources, each drawn only from two points.
- **A WMS service can have more than one layer, and the wrong one gives no error.** Asking
  only for `ortoSat2023` returned the false-colour one: **every field bright red** (infrared).
  Read the layer names.
- **A demo server can have only one profile, and not say so.** Walking routes came back as
  car routes. Confirm a shared service really has what is asked of it.
- **Read the service's code instead of guessing field names.** Carris's were all guessed wrong
  at first (`name`, `locality`, `lines` do not exist).
- **"No position" is not "no permission".** Any missing position counted as refusal, and the
  GPS button and blue dot disappeared for good indoors — exactly when the button is most
  needed. The refusal is asked of whoever knows.
- **On Android there cannot be two permission requests at once**; the second blows up natively
  and a native exception closes a release build. `requestPermission()` **checks before
  asking**, and whoever comes next waits for the first.
- **A position is not just a place: it is a place at a time.** Store **the time it was
  measured**, not when it arrived.
- **Progress is per chunk written, not per percent.** `File.downloadFileAsync` calls back on
  every chunk — thousands per second for hundreds of MB. Only notify when the whole percent
  changes.
- **"The latest" may not be the latest of what you want.** `/releases/latest` returns the
  newest Release of any tag.
- **A prop with "initial" in its name is read once.** `initialViewState` is read when the
  camera is born, before the GPS answers. Wait for `onDidFinishLoadingMap` and move the camera
  — a move given to a map not ready is lost **with no error**.
- **Rebuilding a native component costs, and the cost shows far from the cause.** Rebuilding
  the camera with a `key` made **the keyboard slow on the first search**. Look for a "ready"
  signal before choosing to recreate.
- **Two image sources with very different sharpness are not swapped abruptly** — fade over a
  zoom level, at no request cost.
- **A screen corner can be taken by something that is not our component.** The compass was put
  bottom-left "because it was free" — the ruler button was there. Floating-button arithmetic
  lives in one place, `App.tsx`.
- **A floating button that does not rise with panels ends up behind them.** Check three
  situations: clean map, panel open, navigating. The rise condition is one and the same for
  every element (`selectedPlace || destination || measuring`), and the compass and speedometer
  must not share a height. **Write the matrix**: a script listing every element per scenario
  and flagging overlaps caught the compass.
- **A cache whose key is exact almost never hits.** A position cache needs a grid.
- **An indicator that disappears is worse than one at zero** — the speedometer vanished at
  every traffic light. Walking a whole use case stop by stop caught it.
- **A limit in a response does not pick what matters — it picks what comes first.** Ask in
  **which order** the service applies a limit.
- **A "near you" list follows the map, not the GPS — learnt twice.**
- **A wait that protects a service need not apply to what asks it nothing.** Ask **what** a
  brake protects and let through what does not touch it.
- **A queue spacing requests does not stop two identical requests — it delays the second.** A
  cache of answers needs a second one of pending requests.
- **An error message that always says the same thing hides the fault.** Refusal, delay and no
  network need different fixes; show the status code.
- **A queue spacing requests must also know how to give up** on requests nobody wants.
- **A missing Android permission may give no error until the day it does.**
  `RECEIVE_BOOT_COMPLETED` was never needed until navigation used a background task. When
  adding a library that runs in the background, check which permissions its native code
  **assumes** the app declares.
- **A library can have a protected door and an unprotected one for the same thing**
  (`expo-speech` voices: promise when the engine is ready, crash in `onInit` when cold). Check
  which path a call takes at that moment.
- **A task registered with `expo-task-manager` outlives the app** (`restoreTasks()`); a
  trip-only task is dropped at start-up, in `location.ts`.
- **Three different symptoms can be one cause** — and **the stack trace found it, not the
  reasoning.** Ask for the error message first.
- **A simulation with made-up data proves what was made up.** When the code can run against the
  real service (here, through GitHub Actions), that decides.
- **A field a service stops sending gives no error — it gives an empty list.** When a feature
  depending on an external service stops returning results, first ask **what changed on their
  side**.
- **A library can catch the wrong exception type** (`IllegalStateException` vs Android's
  `IllegalArgumentException`). A `try` around it is not protection; the caught type is.
- **`expo-location` throws no exception when the foreground service cannot start** — it logs
  a warning and resolves. The fix is not stopping the service between subscriptions
  (`SERVICE_STOP_GRACE_MS`), not a `catch`.
- **Check MapLibre v11 APIs before using them.** Several names changed from the widely spread
  docs (`fitBounds`, `attribution`), source features come in `event.features`, a zoom
  expression must be the top-level `interpolate`/`step` (a `case` inside its stops is fine),
  and `UserLocation`'s children **replace** the default puck.
- **Not every service in the documentation is open.** OSRM's `maxspeed` annotation is
  Mapbox-only; the DGT's aerial orthophotos are not published as an open service. Probe before
  building on it.
- **An identifier can arrive in a different unit after the provider changes.** TML sends
  `timestamp` in milliseconds where Carris sent seconds; every bus was "from the future".

