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
2. **The maps are published under the `mapas` tag** — 27 regions in November 2026: mainland
   Portugal, Madeira, Azores, São Tomé and Príncipe, Cape Verde, Guinea-Bissau, Angola,
   Mozambique, Timor-Leste, Brazil, Morocco, Spain, France, Italy, Germany, United Kingdom,
   Ireland, Netherlands, Belgium, Luxembourg, Switzerland, Austria, Poland, Czechia,
   Croatia, Denmark and Greece. The manifest (`mapas.json` in that Release) is the truth;
   read it rather than this list.
3. **When touching the offline map, always test with data off.** If the stored map fails to
   open, the app falls back to the Internet tiles by itself and everything looks fine — a
   fault goes unnoticed with a network.

**Still to confirm on the phone:** the screen staying on while navigating, the voice
announcements after the manoeuvre filter, the speedometer — which needs a moving phone —
and the speed cameras, bus times and tolls, which depend on services the development
environment cannot reach.

**Recent work (November 2026), none of it seen on a phone yet unless said:**

- **Built in 7.0.38** (11 November); up to the Maps-style steps in **7.0.40**, and everything below, with the expo-speech patch, in **7.0.41** (13 November):
  - **Start a transport trip, as in Maps** (`transitGuide.ts`, `TransitGuidePanel.tsx`):
    the route panel's Start for the chosen bus/train/metro/ferry option. Steps: walk to the
    stop (OSRM walking, a straight line if it fails), take the line, the stops to ride,
    (change), walk on. Each option carries a `RideRef` — a Carris pattern between two
    sequence numbers, or a stored trip between two positions — and only the trip started
    loads its stops (`carrisRide`, times spread by the pattern's distance between the two
    real ends; `scheduledRide`). The GPS (every 2 s, through the navigation foreground
    service) moves the steps **only forward** (`guideProgress`); a tapped step is the way
    back. The voice says the line to take, "get off at the next stop" one stop before, and
    the arrival. The map draws rides solid and walks dotted (`guidePaths`).
  - **Transport is planned as soon as a destination is chosen**, whatever the mode
    (`planTransit`, in `transitPlan.ts`, kept 2 min): its chip shows the best trip's time like
    car, bike and walking, and switching to it asks nothing again. **No change waits more than
    `TRANSFER_MAX_WAIT_S` (45 min)**, and **no trip slower than walking** is offered
    (`beatsWalking`) — the probe had found Seixal → Barreiro changing at 19:37 for a 00:30 bus.
  - **From the author's phone, 12 November (7.0.38):** a **speaker button** turns the voice
    on and off while navigating and on a transport trip (the `voiceGuidance` setting, as in
    Maps); **a dropped pin is its address** — Nominatim's reverse answers with the business
    there, and the pin came out as "Bento Barbearias" with its icon and phone; **search gave
    400** zoomed in: the viewbox rounded north and south to the same tenth, and Nominatim
    refuses a box with no height ("Bounding box with invalid parameters", reproduced with
    `sondar: search400`) — now rounded outwards; **the bus is drawn along its real way**, on
    the directions map before starting too (`previewGuide`, handed to Start): the pattern's
    `shape_id` → `/v2/shapes/<id>` (prefix included; `carrisRideShape`, cut at the first pass
    within `SHAPE_CUT_M` of each stop); trains and metro keep the stations in a row; **the
    area's timetables download when a trip is planned there** (`ensureFeedsFor` in
    `planTransit`, now once per half-degree area, not once per session) — central Lisbon
    answered "no stops nearby", having only Carris de Lisboa and the metro.
  - **Bus and rail in one trip** (author's report: Caparica → Estefânia gave no buses, "and
    there certainly are"). Two causes, read with `sondar: estefania`: Estefânia's nearest
    Carris Metropolitana stops (Marquês de Pombal, Campo Pequeno) are 1–1.2 km away, past
    `TRANSIT_WALK_MAX_M`; and a live bus was never joined to a stored timetable. Now
    `planBusTrips` widens the destination's end to `TRANSIT_WALK_WIDE_M` (1600 m) when nothing
    nearer shares a line, and, when direct options are fewer than two, `planTransit` tries
    **bus → rail** (`busToPoints` to Carris stops within 300 m of stations from which a
    timetable reaches the destination, `scheduledBoardingsTo`, then `scheduledOnward`) and
    **rail → bus** (`scheduledReachedFrom`, then `busFromPoints`). Rail here is any stored
    timetable: metro, CP, Fertagus, ferries, MTS, Carris de Lisboa. **Checked in `trajetos`**
    at 23:30: Granja → the 3708 to Cais do Sodré (Metro), 5 m from the station.
  - **Several changes, and when to travel** (author's requests, 12 November):
    `planScheduledRaptor` (end of `schedules.ts`) is RAPTOR over **every stored timetable at
    once** — up to `RAPTOR_MAX_RIDES` (4) vehicles, walks of up to 300 m between stations of
    any operator, bounded from the start by the time to walk the whole way, one answer per
    number of vehicles that arrives sooner than with fewer, run twice for a later option.
    **Proved against the real published files** (scratch harness compiling `schedules.ts`
    with `expo-file-system` stubbed): Granja → Estefânia 3601 → Fertagus at Pragal → 732 at
    Entrecampos, arriving 08:52; Odivelas → Cascais Amarela → Verde → CP at Cais do Sodré.
    Speed in Node: 35–640 ms without Carris Metropolitana, ~1.5 s with it (27 MB, 13 000
    stops) — hence `callsByMinute` (each station's calls sorted, a binary search per day), a
    `(day, minute)` clock table instead of a `Date` per call, and `breathe()` yields so the
    screen never freezes. Trips with several changes use `TransitTrip.changes`, always read
    through `changesOf`. **Leave now / depart at / arrive by** (`TransitWhen`,
    `TransitWhenPicker` in the route panel, reset per destination): stored timetables answer
    any day; Carris Metropolitana's live arrivals only today (`planBusTrips(…, at)`). The
    travel mode is now called "Transportes" / "Transit". Each change shows its walk.
    **Carris Metropolitana's timetable is listed in Settings** (27 MB, never downloaded by
    itself — `naApp: false` now only means that); with it, buses plan for later and with
    several changes, and a live trip hides its timetable twin (`unique`, in `transitPlan.ts`).
  - **Each step as in Maps** (author's request, 13 November): the route panel's trip cards
    read door-to-door time, duration, the trip as a chain (🚶 5 › [3601] › 🚶 1 › [Fertagus]
    › 🚶 2) and "08:02 from <stop>"; under the chosen one, and in the trip under way, a
    **timeline** (`TripTimeline.tsx`, from the same `buildGuide` steps): times on the left,
    a rail solid in the line's colour while riding and dotted while walking, a circle at each
    place, "Walk 5 min (400 m)", the line's badge → headsign, real time or timetable, the wait
    at a change and "N stops · M min", which unfolds. Line colours: Carris Metropolitana's
    pattern colour (`RideLeg.colour`), Metro de Lisboa's four by name, else by mode
    (`src/utils/lineColour.ts` — the stored timetables carry no colours). The trip list
    scrolls, with Start below it.
  - **The time picker redone** (author's report: each +5 min replanned and the panel shrank
    and grew under the finger): `TransitWhenPicker` is a chip that opens its own sheet — now /
    depart / arrive, seven days, hour and minute wheels (minute by minute, author's request 16 November) — and **plans once,
    on "Set"**. The chip sits above the "calculating" line, so it stays put. The sheet closes
    by being pulled down by its handle or tabs (not the wheels, which scroll); the wheels start
    on the value through `contentOffset` — a `scrollTo` before layout was lost, and they
    opened at 14:55 at 17:29.
  - **Arriving at the door** (author's photo, Almada Forum: the walk ended behind the
    building): `entrances.ts` asks Overpass for the `entrance=*` nodes on the outlines of the
    buildings/malls/hospitals containing the place (`is_in` → `around.p:3`) and any within
    60 m; the door nearest to where one comes from wins, a main one by up to 120 m. Used for
    walking, cycling and transport (the final walk, from the alighting stop) — **not by car**,
    which goes to the place itself. The lookup starts when a card opens; a route waits for it
    at most `ENTRANCE_WAIT_MS` (3 s), then uses the place's point. Dropped pins (negative ids)
    are exact and left alone. Probed with `sondar: entrances`.
    **Probed 13 November:** Almada Forum has one door mapped, `entrance=main` on the east
    side; Garcia de Orta five (the two `emergency` ones are skipped).
  - **From the author's photos, 13 November:** the camera keeps the blue dot in the visible
    part above the bottom panel (`bottomInset` on `MapView` → the `Camera`'s `padding`, and passed explicitly by
    `recenter`, `frame` and the route framing; limiting it to following was tried and undone —
    on Android the `padding` prop alone moves nothing), as in Maps; on a transport trip the GPS button
    always brings the camera back to the person (it used to toggle following off, which
    looked like nothing); the trip's footer is laid out like driving navigation — end left,
    time left in the middle, speaker on the right, no longer next to the end button; and in
    Directions, choosing an end when the other is known goes straight to the route.
  - **Offline, as Maps** (author's request, 13 November): `services/network.ts` keeps
    whether the Internet is reachable (`isInternetReachable`, listener; unknown counts as
    online) — `isOnline()` for services, `useOnline()` for screens. Offline: transport plans
    from the stored timetables only (`planTransit`; Carris Metropolitana's stored timetable
    stands in for its live arrivals when downloaded, and its stops come from it,
    `scheduledBusStops(…, withLive)`); a live stop's panel shows its stored times
    (`busDeparturesNear`); live buses are not asked; the transport map type draws the
    downloaded country (`mapStyleFor`) with our stops on top; and a place's **doors come
    from the country's business file**: `build-pois.py` now also writes every
    `entrance=*` node (the maps workflow's `tags-filter` gained `n/entrance`) as a
    `doors` cell index beside `cells` — the file stays v1, older apps ignore it — read by
    `localDoorsNear` (doors within 150 m), also the fallback when Overpass fails. A pill
    under the search bar says "Offline · using downloaded maps and timetables" and "Back
    online" for 3 s (`ConnectivityBanner`); the route and the chip times are worked out
    again when the state changes. **From the author's phone, 17 November:** after switching
    apps the app said "offline" for good — in the background Android stops checking and the
    event saying the network is back may never come. `network.ts` now asks Android again on
    coming back to the app and every 10 s while offline, ignores "offline" heard in the
    background, and is the only watcher (`MapView` uses `useInternetReachable` instead of its
    own listener). The pill goes away after 5 s or with a swipe sideways or up. **The published business files have doors since 16
    November 2026** (all 27 regions); phones fetch the new file on Wi-Fi.
  - **Double tap on a map pin → directions** (`pinDoubleTap`, `PIN_DOUBLE_TAP_MS` 450 ms):
    the first tap opens the card, the second makes it the destination. **A tap on a bus, stop or
    station never reaches the business pins under it** (author's report, 17 November: tapping a
    bus or a stop planned a route by itself — the taps landed on a business underneath too, and
    two made it the destination): MapLibre fires `onPress` only on the topmost source, and the
    business pins are drawn above the transit layers, so a business handler first asks
    `queryRenderedFeatures` for a bus, stop or station within `TAP_HALF_BOX` (22 px) of the
    tap (`transitAt`, in `MapView.tsx`) and opens that instead.
  - **Live buses are a drop pointing where the bus heads**, a white bus on it and the line
    number in a pill underneath (see 6-B-5).
  - **A tapped stop or station opens alone** — its panel shows only its passages; the clock
    button that opened the "stops nearby" list is gone.
  - **Station pins** for train, metro, light rail and boat (`station-<kind>` images), tappable;
    **only from zoom `STATIONS_MIN_ZOOM` (13)** — zoomed out over a city, a few pins in the
    middle looked like a fault (author's photo, 17 November); the open station shows at any zoom.
  - **A scale bar**, as in Maps (author's request, 17 November). First MapLibre's own, which
    Android only places top-left; the author found it inconvenient, so it is now ours
    (`ScaleBar.tsx`): top-left under the category chips (measured, `chipsBottom` + `SCALE_BAR_GAP`; hidden on a transport trip too), shown while the
    zoom changes (`onRegionIsChanging`, a drag alone does not bring it up) and fading out
    2.5 s after, metric, 1/2/5 × 10ⁿ, on a faint pill, hidden while navigating. In 7.0.49 it
    sat low on the left at `compassBottom`, which follows the panels: with a bus's panel open
    it floated mid-map (author's photo) — not tied to the floating buttons again.
  - **Business photos** in the card (`photos.ts`): OSM's `image`, `wikimedia_commons`,
    `wikidata` (P18) and `panoramax` tags, else a Panoramax street photo within 25 m. No keys.
    **Coverage measured 18 November** (`sondar: photo_coverage`, 40 random businesses from
    central Lisbon and Almada in `portugal.pois`): 2 have a photo tag in OSM, 1 a Panoramax
    picture within 25 m — so most cards have no photo, and that is the data, not a fault.
    Wikimedia Commons' geosearch finds files near 21 of 40, but they are of anything nearby
    (a racing helmet by a bank, a girl by the bar association): **not used**, a wrong photo
    is worse than none. Mapillary would cover far more but needs a token in the APK.
  - **Carris de Lisboa timetables** generated and published (`horarios`); its timetable-only
    bus stops show on the transport map (`scheduledBusStops`, kind `'bus'`, ids
    `sched:<feed>:<index>`) and open with `departuresAtStop`. Carris Metropolitana stays out
    of the timetables on purpose: it has real time.
  - **A recent search is forgotten** by swiping it sideways or its ✕ (`SwipeToRemove`,
    `forgetRecent`).

- **Built in 7.0.43** (16 November): the bus panel's refresh, origin/destination and stop list,
  and the live buses' refresh interval in Settings (`vehiclesRefresh`).
- **Built in 7.0.45 and 7.0.46** (17 November): 7.0.46 carries everything up to the bell that
  lights at once and the notification icon. Not in it yet: the scale bar, station pins from
  zoom 13, the Data and storage group, the network recheck and the Moovit points below.
- **Built in 7.0.47** (17 November): everything above, from the scale bar and station pins
  to the Moovit points and the timetable speed fixes below.
- **Colours per operator** (author's request, 17 November; not seen on a phone):
  `OPERATOR_COLOURS` in `src/utils/lineColour.ts` — Carris Metropolitana yellow `#FFD100`,
  Carris de Lisboa deep blue `#1E3A8A` (its trams and lifts, `\d+E`, orange), CP green,
  Fertagus purple. **Each line its own** (`BY_LINE`) where known: Metro de Lisboa and
  Transtejo/Soflusa from their GTFS `route_color` (probed, `sondar: fares`); Metro Sul do
  Tejo's L1/L2/L3 lime, orange and cyan — its service has no colours, and one teal for all
  of it looked like the metro's Verde line (author's report). The MTS station pin is lime too. Badges and timelines pass the operator (`tripOperator`,
  `rideOperator`, `RideLeg.operator`, `ScheduleDeparture.feedId`); a Carris Metropolitana
  line's own colour from the service still wins. The live buses on the map use the same two
  colours (`generate-poi-icons.py`, `VEHICLE_OPERATORS`; same list as `lineColour.ts`).
- **Less data for transport** (author's request, 17 November; not seen on a phone). Measured
  first (`sondar: data_use`): Carris Metropolitana's `/vehicles` is 99 KB gzipped (751 KB
  raw, 952 buses), no filter of any kind (`agency_id`, `line_id`, `bbox`, `fields` all
  ignored), no ETag, and 922 of 950 positions change in 10 s; Carris de Lisboa's GTFS-RT is
  45 KB and **not compressed**; `/stops` 760 KB gzipped; `/lines` 53 KB; a pattern ~20 KB,
  a shape ~23 KB, alerts 10 KB, a stop's arrivals 1 KB. So:
  - only the operators whose area the view touches are asked (`vehicleAreas` in
    `vehicles.ts`; `vehicleOperators` in `App.tsx`) — no Carris de Lisboa over Almada,
    nothing outside the Lisbon area;
  - a map untouched for `VEHICLES_IDLE_MS` (90 s), with no bus's panel open, refreshes a
    third as often, at most once a minute; a touch brings the pace back — a switch in
    Data and storage since 18 November (`vehiclesIdleSlowdown`, author: 10 s became 30 s);
  - nothing is asked while a full-screen sheet hides the map (`mapCovered`);
  - the bus panel's refresh asks the view's operators and the open bus's own;
  - patterns (a day), shapes (a week) and the list of lines (a day) are kept on the phone
    (`keptOrAsked`, `Paths.cache/carris`, pruned after 14 days), as the stop list already is.
  The Settings line gives the most per hour ("less with the map still").
- **Bus models: not available** (author asked, 17 November; `sondar: bus_models`). Carris
  Metropolitana's `/vehicles` has `make`, `model`, `propulsion`, `emission_class`,
  `capacity_*`, `license_plate`, `registration_date` and `wheelchair_accessible`, but all
  947 live buses had them empty (`bikes_allowed` always false, `occupancy_status` always
  `NO_DATA_AVAILABLE`). Only `agency_id` (41–44, the four contracted areas) is filled. Probe
  again before building on any of these.
- **Fares, probed 17 November** (`sondar: fares`): only some exist as data. Metro de
  Lisboa's GTFS has `fare_attributes` (1,90 €, the Carris/Metro ticket, same as its price
  page); Transtejo/Soflusa's (the old Mobility Database copy) one price per crossing (MT
  3,25, SX 2,85, CA 1,60, BR 2,95, TF 1,50 — possibly out of date); TUB 1,55/2,00; MTS's
  price page says 0,85 €. **None** in CP, Fertagus, Carris de Lisboa or Carris Metropolitana
  (its `/fares` is 404; its and navegante's pages are drawn by JavaScript). The Carris
  Metropolitana GTFS address on GitHub is 404 now; `api.carrismetropolitana.pt/gtfs` serves it.
  **The author chose no fares for now** (17 November): not partial prices, not "included in
  navegante". Do not add them unless asked again.
- **Transport loading, round two** (author, 17 November: "slow to load, above all the
  transport"; asked whether Rust would help — the answer was the file format first, measured):
  - **Timetables v2** (`<id>.v2.json`, `ScheduleFeedV2`): trips that share line, service,
    headsign, pattern and gaps between stops are one group with their start times; the gaps
    are stored once (`profiles`). Carris Metropolitana 27 MB → 3.1 MB, Carris de Lisboa
    5.5 → 1.1 MB, metro 163 → 25 KB; CP barely shrinks (one service per trip). Reading all
    seven in Node: 520 → 155 ms. **Checked against the real files**: every query in the bench
    harness gives the same answers as v1, only the internal trip numbers differ (trips are
    renumbered group by group).
  - `build-transit.py` writes both files (`formato_v2`) and the manifest entry gains
    `ficheiro2`/`bytes2`; **older apps keep reading v1**, so the v1 files must stay published
    until no phone runs a version before this one. The app prefers `ficheiro2` (`fileName`),
    reads either (`fromFile`), deletes the v1 file after a v2 download, and `ensureFeedsFor`
    replaces an installed v1 by itself — Carris Metropolitana included.
  - **The Carris Metropolitana stop list is kept on the phone** (`carris-paragens.json` in
    the cache, `STOPS_COPY_MAX_AGE_MS`, 3 days; an older copy is still used when the network
    fails). It was megabytes asked at every start before the transport map could show stops.
    `probe-trips.js` stubs `expo-file-system` (no copy there, every question is real).
- **Security review, palette and update notice** (author's requests, 17 November; none seen
  on a phone):
  - **The APK was signed with React Native's public debug key** (`CN=Android Debug`, SHA-1
    `5e8f1606…`, up to 7.0.49 and whatever came before our key): `expo prebuild`'s template
    signs `release` with `debug.keystore`, which everyone has — anyone could sign an APK
    Android accepts as an update of PalmMap, and AhnLab flagged the APK as
    `PUP/Android.Malct` (1 of 63 on VirusTotal, 17 November). **Our own key, ready but not made yet** (author's
    decision, 17 November): the author is to make it and put it in the repository's secrets
    `PALMMAP_KEYSTORE_BASE64` (the `.jks`, base64) and `PALMMAP_KEYSTORE_PASSWORD` (store and
    key, alias `palmmap`). `build-apk.yml` writes it to `$RUNNER_TEMP`, and
    `plugins/withReleaseSigning.js` (an Expo config plugin, only when `PALMMAP_KEYSTORE` is
    set) gives `release` a signing config read from the environment. **Until the secrets exist
    the build signs with the debug key and warns** (the author asked to build before making
    the key); with them, it fails if the APK still says `CN=Android Debug`. When the
    certificate differs from the previous Release's APK, the notes tell people to uninstall
    first — Android refuses an update with another key, and the old app's in-app updater
    just ends in "App not installed" (saved places and downloads are lost once). **Losing the
    key means doing this again**: the author keeps a copy of the `.jks` outside GitHub.
  - **Links from OpenStreetMap are filtered** (`src/utils/safeLink.ts`): a `website` tag, a
    photo or a phone goes to Android only as `http(s)` (a bare `www.x.pt` gets `https://`) or
    a plain `tel:` number — `Linking.openURL` opens any scheme, and anyone edits OSM.
  - **File names from the published manifests** (`mapas.json`, `horarios.json`) must be plain
    names (`safeFileName`); **the update APK must come from this repository's Releases**
    (`RELEASE_DOWNLOAD_PREFIX`, in `update.ts`).
  - **The palette is "Lagoon"** (author: the sand/coral one felt heavy): cool near-white
    surfaces, ink text, teal accent `#0B7C74` (4.5:1 on every light surface), violet
    destination, amber businesses; dark is blue-grey with `#2DD4BF`. `theme.ts`,
    `vectorStyle.ts` (the offline map), `tiles.ts`' empty colour and `app.json`'s
    notification colour changed together.
  - **"Update downloaded — Install" notification** (`updateNotice.ts`): posted when a download
    the person started ends, with an Install button (category `atualizacao`, channel
    `atualizacoes`); a tap brings the app to the front and opens the installer with the file
    already downloaded (`downloadedUpdate`). The installer no longer opens from the
    background, which Android refuses — the notice does it. Permission asked when the
    download starts.
- **A trip with changes lists its next departures** (author's report, 17 November: "some
  changes give only one option"; not seen on a phone). Every planner kept each pair of lines
  once, so Amarela → Azul was one card. Now `optionsPerKey` (`src/utils/tripOptions.ts`) keeps
  each combination first, then up to `TRANSFER_DEPARTURES_PER_PAIR` (3) of its departures to
  fill the list; two arriving at the same minute are one, the later departure kept. Used by
  `planScheduledTransfers`, the bus ↔ rail joins in `transitPlan.ts` and the bus changes in
  `planBusTrips`. A direct line still appears once.
- **"High" satellite was blurry on a Galaxy A20e (Android 11), sharp on the author's X8**
  (17 November): `ortos.dgterritorio.gov.pt`'s chain ends on **HARICA TLS RSA Root CA 2021**
  (`sondar: tls_chains`), a root Android 11 and older never shipped — every orthophoto
  request failed the handshake, silently, and Sentinel-2 was stretched instead. Fixed with
  Android's network security config: `plugins/withExtraTrust.js` adds that public root
  (`assets/certs/harica_tls_rsa_root_2021.crt`, SHA-256 `D9:5D:0E:8E:…:CB:7B:1D`, the one in
  Mozilla's store) **for that host only**, beside the system roots; release keeps cleartext
  off, the debug variant allows it (Metro). Checked with `expo prebuild` (files and manifest
  attribute in place); **confirmed on the A20e with 7.0.53** (author, 17 November: "it works"). The other imagery hosts end on old roots (ISRG
  X1, GlobalSign, Starfield, GTS via GlobalSign). **A service that works on a new phone and
  not an old one: probe its chain first.**
- **"Report" on a place's card → an OpenStreetMap note** (author's request, 17 November: mark
  a business that no longer exists, from the app; not seen on a phone): `ReportPlace.tsx` —
  no longer here / name changed / wrong hours / other, optional details — and
  `createOsmNote` (`services/osmNotes.ts`) posts `api.openstreetmap.org/api/0.6/notes.json`
  at the place, **anonymous** (OSM takes notes without an account: no key, no credential in
  the APK), only on "Send", once (`busy`). The text names the place and kind in the app's
  language and ends "(Sent from the PalmMap app)"; after sending, "See the note" opens
  `openstreetmap.org/note/<id>`. Local mappers fix the map; the fix reaches the tiles in days
  and the country files with the monthly rebuild. Not offered on a bare dropped pin. Never
  tried against the real API (the development environment cannot reach it, and a probe
  would publish a real note).
- **Borders and place names over the satellite** (author's photo, 17 November: "the borders
  and capitals are missing, as in Google"; not seen on a phone): a `VectorSource`
  `ofm-satellite-labels` in `MapView.tsx`, only on `satellite` and `satelliteTransit`, from the
  same OpenFreeMap tiles as the business pins (OpenMapTiles `boundary` and `place`): country
  lines (light over a dark casing, no maritime ones), regions dashed from zoom 5, capitals
  (`capital` 2) as a dot with the name beside it, country names in capitals up to zoom 7,
  cities from 5, towns 9, villages 12, neighbourhoods 13. Names are `name:<language>`, then
  `name:latin`, then `name` — the bundled glyphs are Latin-1 only. Checked against the style
  spec (a `zoom` inside `case` is refused: `text-anchor`/`text-offset` use a top-level `step`).
- **Built in 7.0.55** (18 November): the parked car and walk to it, the height profile, the
  idle-slowdown setting (off), the business pins on "Satellite + bus", the native compass
  (7.0.54), the back button, the search shortcuts, the screen on during a transport trip and
  arriving ending the trip. Not in it: the card's travel time, opening where the map was left
  and the clever features below.
- **Directions by notification with the app in the background** (author, 18 November; not
  seen on a phone): `services/navNotice.ts` — a quiet notification (channel `navegacao`, low
  importance, sticky) with the next manoeuvre and its distance, replaced in place as the
  distance changes by steps (10 m under 200, 50 m to 1 km, then 100 m), and a heads-up with a
  buzz (channel `navegacao-aviso`) once per announced manoeuvre within 250 m by car, 120 by
  bike, 50 on foot. Only while navigating with the app off screen (`appActive`); cleared on
  coming back or ending. Setting `notifyDirections` (Notifications group, on); the permission
  is asked on Start (`prepareNavNotices`). `expo-location`'s own service notification cannot
  be changed after starting (restarting it in the background is refused), hence ours beside it.
- **The route comes out faster after choosing a place** (author's report, 18 November: about
  5 s from tapping an address to the route; not seen on a phone). Two waits were in front of
  it: `arrivalPoint` waited up to 3 s for Overpass's doors on every walk, bike and transport
  route, and the other modes' chip times went into OSRM's one-a-second queue ahead of the
  route. Now a plain address (`isPlainAddress`: `place`, `highway`, a house-type `building`)
  skips the doors; the Overpass wait is `ENTRANCE_WAIT_MS` 1.2 s; and the chip times wait for
  the route (`routeLoading`, and `routePending`, a ref set in the same commit) — those started
  before are dropped from the queue unsent (`isWanted`). **Online, the country file's doors are
  not used first**: they are every door within 150 m, whoever's building — tried and undone
  after a review (a café's walk ended at a metro entrance or a neighbour's door).
- **Review of the 18 November work, and arriving** (author: "I reach the destination and it
  does not end"; not seen on a phone): a transport trip now **ends by itself** 4 s after
  arriving (`GUIDE_END_AFTER_MS`) and opens the destination's card; navigation also arrives
  within `ARRIVAL_METERS` + the GPS accuracy (+25 m by car) of the route's end or the place,
  once under `ARRIVAL_NEAR_M` (300 m) is left — OSRM ends the line on the road, and one parks
  short. The trip's place along the ride lives in a ref (`guideAlong`): kept in the step
  state, it was thrown away with every unchanged step and a ride never moved on (start at
  the stop, a change at one stop, a tapped step). It moves by 5 m or more at a time, so a
  crawling bus adds up. Stops are placed along the line from the stop before
  (`stopPositions`). Also: a new subject in an open panel (place, stop, bus, destination)
  brings it to the top (`panelSubject`); no place card over a transport trip; back closes
  the tape; the follow hold has a deadline (`getFreshPositionWithin`) and only recentres if
  following is still on; a height profile shared by two runs goes out while either wants it;
  `addressOf` (shared by the dropped pin and Home/Work) keeps the street when the reverse
  answer is the street, and reads "26-A" as a number; "Use current location" asks
  `getBestPosition` and a late answer saves nothing after closing or choosing; the walk to the
  car's notification shows the walk's metres; the blue dot snaps around `progressIndex` and to
  the trip's current leg only.
- **Labels of one's own** (author: "more customisable location tags", then "if the tag could
  really be customised", 19 November 2026; not seen on a phone): as Google's "Labelled", a
  name, a colour (`LABEL_COLOURS`) and an icon — one of `LABEL_ICONS` or any emoji typed
  (`isEmojiIcon`, drawn by `LabelIcon`) — each pointing at one place. Stored in
  `palmmap.etiquetas` (`homeWork.ts`, at most `LABELS_MAX` 20; in the automatic copy). They
  are Home and Work's kin: `HomeWorkKind` is `'home' | 'work' | 'label:<id>'`, so the
  `HomeWorkPicker` screen (search, current location, "Choose on map") and the map pin bar
  serve them through `placeOf`, `kindName`, `kindIcon`, `kindColour`. Made and changed in
  `LabelEditor` (name, colour, icon or emoji, change/remove the place, delete): from the Saved
  screen's row of label chips (a tap goes there, a long press edits, the last chip makes a new
  one) or a place's card ("Label", the place already set). Labels with a place show among the
  empty search's chips, and a dropped pin within `PIN_SAVED_M` of one takes its name.
- **Learn from my movements** (author, 19 November 2026: "an option, off by default, to let the
  app follow the person to learn habits and paces"; not seen on a phone, needs a full build):
  `services/movementLearning.ts`, setting `learnFromMovements` (Navigation group, **off**),
  `LearningSettings.tsx`. Turning it on asks for "Allow all the time"
  (`askBackgroundPermission`; refused → stays off with a note) — the **eighth permission**,
  `ACCESS_BACKGROUND_LOCATION`, with the `expo-location` plugin's
  `isAndroidBackgroundLocationEnabled`. A second task, `LEARNING_TASK` (GPS, 30 m / 20 s,
  its own notification, `killServiceOnDestroy: false`), started and stopped by `syncLearning`
  with the app on screen and **paused while navigating or on a transport trip**. It keeps
  only results, never the path: stays (100 m, 10 min) merge into frequent places (120 m) with
  the nights (03:00) and weekday working days (2 h in 09–18) they cover; the trip between two
  stays is classed by the GPS's speeds (median / 95th percentile) and a walking or cycling one
  of 3 min and 500 m gives a pace factor against 5 and 12.5 km/h (car and mixed trips teach
  nothing). Waiting in `palmmap.aprendizagem` (the trip under way in `…estado`) until App
  takes them (`takePending`): paces through `learnPace` (only with
  `paceLearning`), and trips ending at Home, Work, a label or a saved place into
  `recordTrip(…, at)` for the opening suggestion. Settings lists the places ("Looks like Home"
  / "Work" with a button to set it, a tap shows it on the map) and deletes everything
  (`forgetLearnt`). Checked with simulated days in a scratch harness: Home and Work found,
  4.5 km/h walks give 1.11.
- **"Businesses take ages to load"** (author, 19 November 2026; not seen on a phone). Measured:
  **from the country file**, a Lisbon view at zoom 15 reads 6 cells, 1 MB, 8,046 records; in
  Node without JIT (closer to Hermes) 115 ms the first time, 10 ms after. Now 45 ms: UTF-8 is
  decoded through `String.fromCharCode` slices + `decodeURIComponent(escape())` (79 → 17 ms
  for that MB; the byte loop stays as the fallback), a `Place` is built only for the ≤300 kept
  (it was built for every record in view), and the ring of cells around the view is read
  into memory a couple at a time after the pins show (`prefetchAround`, local file only).
  **Without a downloaded country** the pins come in OpenFreeMap's whole z14 tiles
  (`sondar: ofm_tiles`): central Lisbon 320 KB compressed (533 KB raw), Almada 149 KB, Évora
  157 KB — every layer, for the `poi` one alone; that is the slow case on mobile data, and the
  only real cure is the business file (today it comes with the country map).
- **Privacy, "bulletproof"** (author, 19 November 2026: "for the habits it has to be
  bulletproof… open source and as clean as possible on privacy"; not seen on a phone, needs a
  full build): **`PRIVACY.md`** lists every service, what it receives and when — keep it true
  when adding a request. What `movementLearning.ts` stores is **sealed** with AES-256-GCM by a
  Keystore key that never leaves Android's Keystore (`VaultModule.kt`, `PalmMapVault`:
  `seal`/`open`/`destroy`); without the module or if sealing fails **nothing is stored**,
  never clear text (`writeJson`), and learning does not start (`canLearn`). It is **not** in
  the automatic copy (`KEPT_KEYS`), places unvisited for 90 days are dropped (`pruned`), and
  "Delete" — offered too when turning the switch off — removes the data **and destroys the
  key**. Android's Auto Backup is now off (`allowBackup: false`) for the whole app. A line under
  the switch says it stays on the phone, encrypted, nothing sent or copied.
- **From the author's phone, 19 November 2026 (7.0.61, not seen on a phone yet):** stops over
  Almada at a region-wide zoom — the stop symbols (`paragens-icon`) had no `minzoom`; now the
  others show from `STOPS_SHOWN_MIN_ZOOM` (12) and the open one (`paragens-icon-aberta`) at any
  zoom. The empty search's rows ease in (`FadeIn` in `SearchBar.tsx`: 180 ms fade and 8 px rise,
  35 ms apart, native driver) — the author found them "very blunt"; they also said the recents
  took ~5 s to show, "always", cause not found by reading (the list is built at once on
  focus). So the phone measures it: **`services/perfLog.ts`** (memory only) — `mark`, `timed`,
  `note`, `since`, and a watchdog that notes when the JavaScript thread was blocked over
  300 ms, with the last mark before it; App and MapView renders over 30 ms, the country-file
  pins and the timetable stops are timed, and the search notes focus → list on screen.
  Shown newest first in Settings → About (`PerfCard`), for a screenshot. **First reading (7.0.63,
  author's screenshot):** the list was on screen 41 ms after focus, and the JavaScript thread
  was then blocked for 4070 ms — so the delay is not the search. The stall's "after" label was a
  mark three minutes old; now a stall names the `timed` spans that ran inside it ("in: …") or
  the last mark with its age, coming back to the app is marked (`app: active`), and the
  heavy synchronous reads are timed: each timetable's read and index, the Carris stop copy
  and the kept patterns/shapes (read and write), and the business pins' prefetch ticks. **High satellite pixelated close in** is the DGT's WMS:
  `sondar: dgt_speed` measured 1–3 s per tile and 7–13 s for the first ones (rendered on
  demand), and `dgt_wmts` found **no cached tiles** — its GeoWebCache only has GeoServer's
  demo layers. What shows meanwhile is the parent tile stretched; once seen, tiles stay cached.
- **"There was a problem parsing the package" on updating from 7.0.61** (author's photo, 19
  November 2026): `systemDownload` called `source.move(destination)` **without `await`** —
  `File.move`/`copy` return promises — and then `forget()` had DownloadManager delete its
  file. From the system's folder to the app's cache the move is a copy across filesystems, so
  the delete cut it short, and the truncated file had the final `.apk` name. Now both are
  awaited, the landed size is checked against the download's total, `downloadUpdate` and
  `downloadedUpdate` (`update.ts`) only hand over a file the Release's size, and
  `dropCutShortFiles` (`offlineMap.ts`, at start-up) removes country maps and business files
  whose size is not the published one (the manifest's `bytes`/`negociosBytes` are the exact
  file sizes, checked). **To update from 7.0.61 itself**, that version's updater is the broken
  one: install 7.0.63 from the Release page in the browser.
- **A refresh button for transport plans** (author's photo, 19 November 2026: "time goes by and
  this stops being current"; not seen on a phone): beside the time chip in the route panel,
  `forgetTransitPlans` + `transitRefresh` plan again from scratch; and coming back to the app
  with a "leave now" plan older than `TRANSIT_STALE_MS` (2 min) replans by itself.
- **Live buses: asked when due, kept when missed, and sliding** (author, 19 November 2026:
  "every 10 s, and if it only updates at 11 s it disappears" — chose all three; not seen on a
  phone). `mergeVehicles` (`vehicles.ts`) keeps a bus missing from a fresh list at its last
  place for `MISSING_GRACE_S` (45 s) since it was last listed, while `VEHICLE_MAX_AGE_S` still
  applies, and of two copies keeps the newer report. `nextVehiclesDelay` learnt each operator's (undone 20 November, see above)
  pace from its newest report and asks a moment (`DUE_MARGIN_S`, 1.5 s) after the next is due —
  never sooner than the chosen `vehiclesRefresh`, at most 3× it or a minute — and retries an
  ask that brought nothing newer once, 3 s later. `useGlidingVehicles` (`MapView.tsx`) slides
  each bus to its new place over `GLIDE_MS` (1.2 s, ~15 frames a second), not for jumps over
  800 m nor above 400 buses moving at once; the bus panel reads the real list.
- **Updates and country maps download with the app in the background** (author's photo,
  19 November 2026, 7.0.60: "Software caused connection abort" after leaving the app
  mid-download; not seen on a phone, needs a full build). The app's own connection
  (`File.downloadFileAsync`) is cut when Android puts it in the background. Now the APK, the
  country maps and their business files go through **Android's DownloadManager**
  (`DownloaderModule.kt` in `modules/palmmap-voice`, `PalmMapDownloader`: `start`, `status`,
  `remove`), which keeps going in the background or with the app closed, with the system's own
  progress notification, into the app's external files folder (no permission).
  `systemDownload` (`services/systemDownload.ts`) polls every 700 ms, keeps each download's id
  (`palmmap.descarga.<key>`: `atualizacao`, `mapa.<id>`, `negocios.<id>`) so a restart picks
  the same download up, and moves the finished file to where it belongs (copies if a move
  fails). Without the module (an older build) the old way is used.
- **Street view, from Panoramax** (author's request, 19 November 2026; not seen on a phone).
  Coverage measured first (`sondar: streetview`, 25 points per town, a picture within 100 m):
  Évora 12 (most of them 360°), Porto 4, Lisbon's Baixa 3, Viseu 1, and none in Lisbon's
  Avenidas, Almada, Seixal, Coimbra, Braga or Faro — so the map **shows where pictures
  exist** instead of promising them. A "Street view" switch in the layers sheet (this session
  only, `streetViewOn` in `App.tsx`: it changes what a tap does) draws Panoramax's own vector
  tiles in their orange (`PANORAMAX_TILES`, `/api/map/{z}/{x}/{y}.mvt`, layers `sequences`
  and `pictures`, **maxzoom 15** — 16 answers 400; probed with `sondar: streetview_tiles`). A
  tap, on a line or anywhere while it is on, opens the nearest picture within
  `STREET_VIEW_TAP_M` (40 m, `pictureNear`) or says there is none. `StreetViewSheet` shows the
  2048 px `sd` picture with ‹ › to the sequence's `prev`/`next` (item links; `pictureById`),
  the date and the credit (author, CC BY-SA 4.0). A 360° picture
  (`pers:interior_orientation.field_of_view` 360) is the equirectangular image at the screen's
  height, twice as wide, turned by dragging sideways, starting at its middle — not a true
  sphere, which would need a 3-D view and a native library. A Panoramax photo on a place's
  card opens there too. Mapillary would cover far more but needs a token in the APK.
  **Made smoother** (author: "not very fluid", same day): pictures are kept by id for the
  session and the two ahead (in the direction walked) and one behind are preloaded, answer and
  image (`preloadAround`, `Image.prefetch`); the new picture fades in over the last one drawn
  (`under`), its 500 px thumbnail first, with only a small spinner in the header; a 360°
  picture is three copies side by side, put back on the middle one when a turn ends, so it
  never meets an end, and opens facing where one was looking in the last one (`looking`,
  from the scroll and `view:azimuth`); a plain picture walks with a sideways swipe.
- **The stop nearest home, not one back** (author's photo, 19 November 2026: sent 570 m back
  to Lazarim Pilotos while the 3022 passed at the door; not seen on a phone). RAPTOR boards
  each trip at its first reachable stop, and every stop within a walk of the origin is
  reachable; `planScheduledTrips` kept the first boarding on equal arrival too. Now RAPTOR's
  first ride moves its boarding to the stop on the same trip one can leave home latest for
  (`raptorJourney`), the direct planner prefers the later departure on equal arrival, and
  `unique`/`finish`/`fastestTrip` (`transitPlan.ts`) treat the same lines arriving within a
  minute as one option, keeping the later departure. **Checked with the real Carris
  Metropolitana timetable** at 12:35: before, leave 12:36 and walk 410 m to Lazarim Pilotos;
  now leave 12:44 and walk 63 m to Rotunda Campo Flores, same bus, same arrival. The live
  planner already broke ties this way (`optionsPerKey`).
- **Country maps by zone** (author, 20 November 2026: "download by zones, like Alentejo,
  Norte, Centro, Sul… for the other countries too, with a drop-down per country and
  administrative area"; not seen on a phone, no zone generated yet). The catalogue
  (`map-regions.json`) gains `pais` (the country a zone belongs to) and `poligono` (the
  Geofabrik path whose `.poly` outline cuts it: `scripts/poly-to-geojson.py` →
  `pmtiles extract --region`, and `osmium extract -p` for the business file); the manifest
  entry carries `pais`. **Portugal has no Geofabrik sub-regions**: its zones (Norte, Centro,
  Lisboa e Vale do Tejo, Alentejo, Algarve — roughly NUTS II) are rectangles that overlap a
  little. The other countries' zones come from Geofabrik's index (`sondar:
  geofabrik_zones_compact`, and `geofabrik_zones_ac` for its first part — the log is cut
  past ~200 lines): 109 zones in Spain (16), France (22, Geofabrik's old regions), Italy (5),
  Germany (16), United Kingdom (3; England at zoom 13), Netherlands (12), Poland (16),
  Czechia (14) and Brazil (5, zoom 13), named in Portuguese, ids `<country>-<geofabrik id>`.
  The map workflow takes patterns: `regioes: "alemanha-*"` is every German zone. **Offline, every downloaded zone in view is drawn at once**
  (`regionsForView`, at most `MAX_ZONES_IN_VIEW` 6): `buildVectorStyle` takes several
  `pmtiles://` addresses and repeats each layer once per zone side by side (`earth`,
  `earth@1`…), so zone B's land never covers zone A's roads; overlapping tiles are the same
  tiles. The set is kept while it still holds every zone wanted (each change reloads the
  map). A failure drops the side zones first. Business pins read up to four zones' files
  (`poisRegionsFor`), twins merged as before. The maps list (`OfflineMaps.tsx`) groups by
  `pais ?? nome`: one row for a country with one map, a drop-down for the rest, opened by a
  matching search. Published entries without `pais` stay their own country until redone.
- **Timetables of 23 EU countries** (author, 20 November 2026: "sources per country:
  timetables and, if possible, live positions"; none generated yet, none seen on a phone).
  `scripts/eu-catalogue.py` picked the active, keyless EU sources from the Mobility Database
  (446, `scripts/eu-candidates.json`); `sondar: eu_feeds` (and `eu_feeds_compact`,
  `_compact_a`, `_compact_fr` — the log is cut past ~300 lines) tried each from GitHub's
  runners: real GTFS, size, stops, trips, last day, and every GTFS-RT feed's vehicles and age.
  140 entries went into `transit-feeds.json` with `pais` (and `posicoes` for 28 live feeds):
  only current ones (to mid-December 2026 or later), big cities and national rail first.
  Left out on purpose: DELFI (Germany, 3.2 million trips — the transport associations
  instead), TFI (Ireland, the operators instead), Sweden (all keyed), Greece's OASA, Lyon's
  TCL, Lille, Strasbourg, Nantes, Rennes, Montpellier, Milan's ATM, Katowice, Wrocław,
  Luxembourg, STIB, ÖBB, Porto's STCP (expired), and OVapi's live feed (`http://` only).
  **National feeds too big for a phone are cut by area** (`recorte` in the entry: trips
  calling inside, each kept whole; `build-transit.py`, which now streams `stop_times.txt`
  — a list of dicts of OVapi's did not fit a runner): OVapi in four (Randstad, North and East,
  South, Gelderland), Autolinee Toscane to Florence. The workflow takes `pais:IT` for a whole
  country. Licences are in each entry's `notas`; most are CC BY or the national open
  licences — credit the operators in About if they are ever listed there.
  **Big timetables wait for Wi-Fi** (`AUTO_FEED_MAX_BYTES`, 8 MB, in `ensureFeedsFor`): a
  covering feed up to that size downloads by itself on any network and the plan waits for it,
  as before; a bigger one (national rail, the EU catalogue's regions) only on Wi-Fi, in the
  background, with nobody waiting — Settings still offers it for a tap.
- **The next bus from the timetable when none comes now** (author's photo, 20 November 2026:
  Pêra de Cima said "no connection, not even with one change" — "I know there is a bus here,
  just not now"; not seen on a phone). The live arrivals only hold what is left of today, so a
  line running a few times a day vanished. When a plan finds nothing, `timetableBusTrips`
  (`transit.ts`) reads the patterns shared by stops near both ends (`/patterns`, kept on the
  phone, at most `TIMETABLE_PATTERNS_MAX` 6) and offers each line's next two trips by
  `valid_on`, up to `TIMETABLE_DAYS_AHEAD` (7) days on — timetable times, not live, with the
  pattern as `ride` so Start follows it. Walking is beaten from when one leaves for it, not
  from now. The trip card puts "Amanhã" or the weekday before the times (`dayLabel`).
  **With one change too** (`timetableTransferTrips`), when no line goes the whole way or the
  shared ones only go the other way: `transferPlan`'s meeting places, up to
  `TIMETABLE_TRANSFER_PATTERNS_MAX` (12) patterns, a first ride joined to the first second
  ride `TRANSFER_MIN_S` + the walk later within 45 min, day by day, two per pair of lines.
  **Checked with the real API** (`trajetos`, 20 November 2026, destination Rua Azinhaga de
  Pêra): Almada at 22:50 → 3009 23:26, tomorrow 06:36; Costa da Caparica at night → 3021
  tomorrow 07:05; Seixal → 3116 to Corroios, change to the 3527; Amadora → 1716 to Marquês
  de Pombal, then the 3709, at the weekend Monday's first. 2–9 s the first time (patterns
  asked), milliseconds after.
  **Bus to bus, several times** (author: "it can change from bus to bus", same day): still
  nothing, and `planScheduledRaptor` (up to four vehicles, buses included once Carris
  Metropolitana's stored timetable is on the phone) is asked window after window
  (`RAPTOR_WINDOWS` × 2 h, twelve hours on) — it only looks two hours ahead. Without that
  timetable (`BUS_TIMETABLE_ID` `carris`, 3.1 MB in v2) the plan carries `offerFeed`, and the
  route panel offers "Download bus timetables (3,1 MB) for more changes" under "no
  connection": a tap downloads and plans again. Never downloaded by itself.
- **Live buses of any operator with open GTFS-RT** (20 November 2026; not seen on a phone,
  none published yet): a timetable's manifest entry may carry `posicoes` (its GTFS-RT
  vehicle positions, from `transit-feeds.json`; https only — Android refuses cleartext, so
  OVapi's `http://` is out). With that timetable downloaded, `vehicleAreas` adds its id when
  the view touches its `bbox`, `liveVehicles` reads it with the same decoder as Carris de
  Lisboa (`gtfsRtVehicles`, ids `<feed>:<vehicle>`), the number comes from the stored
  timetable's `routeIds` (`carrisLisboaLine(routeId, feedId)`, its side file
  `<feed>.linhas.json`; else the `route_id` itself) and the panel's trip from it too
  (`carrisLisboaTrip(…, feedId)`). Operators are a `Record<string, boolean>` and the App's
  key is `operatorsKey` ("cl,cm,…"). Drawn with one slate set, `vehicle-*-gen`.
- **Orthophotos of other EU countries in "High" satellite detail** (author, 20 November
  2026; not seen on a phone): `EU_ORTHOS` in `tiles.ts` — France (IGN's WMTS, Licence
  Ouverte) and the German states Bavaria, Hesse, Rhineland-Palatinate, Saarland and Bremen
  (WMS with `image/vnd.jpeg-png(8)`), same fade from zoom 12, bounds per service, credits in
  `attributions`. **Only services transparent outside their area**: `sondar: eu_orthos2`
  asked each for a tile inside and one across its border; JPEG-only services (Netherlands,
  Austria, Luxembourg, Belgium, Czechia, Saxony, NRW, Brandenburg/Berlin, Thuringia, BW,
  Saxony-Anhalt, SH, MV) send blank opaque squares there and are left out — the DGT's white
  squares again; their PNG is 5–10× heavier. Keys needed: Denmark, Finland, Lithuania; no
  Web Mercator: Croatia, Cyprus, Greece, Sweden; nothing open found for Italy (PCN is 2012,
  HTTP), Ireland, Hungary, Bulgaria, Malta, Romania, Slovakia, Slovenia, Latvia. Every
  candidate's TLS root is an old one (USERTrust, ISRG X1, SwissSign, GlobalSign R6, D-TRUST).
- **Built in 7.0.66** (20 November): the next bus from the timetable (direct, one change, several
  with the bus timetable), the parked car asking first, big timetables waiting for Wi-Fi, and
  the EU catalogue, zones and orthophotos above (none of those generated yet).
- **Built in 7.0.65** (19 November): every fix of the code review below.
- **Live buses every minute, fixed** (author, 20 November 2026, on 7.0.65: "transport now takes
  1 min to update"; not seen on a phone): `nextVehiclesDelay` "learnt each feed's pace" from the
  step between the newest reports — but ~900 buses report at their own moments, so the newest
  sits about a second behind each ask and the step was **the app's own interval** plus that
  second. Fed back, every wait grew the next until the one-minute ceiling (simulated: 10 s → 18 s,
  20 s → 33 s and climbing). It now waits the chosen `vehiclesRefresh`, with the one quick retry
  when nothing newer came; the kept-when-missed grace and the glide stay.
- **Code review of the 19 November work, every finding fixed** (author: "see really all the
  bugs and fix them"; none seen on a phone, the Kotlin parts need a full build):
  - **Downloads** (`systemDownload.ts`, `DownloaderModule.kt`): the Wi-Fi-only refresh asks
    DownloadManager for Wi-Fi only (`allowMetered`, `allowRoaming` — it went on over mobile data
    and roaming); a job paused for `STALL_MS` (90 s) with no byte moved ends in
    `SystemDownloadStalled` (kept, so the next try picks it up) instead of polling forever; two
    calls with one key join (`inFlight`), and so do two update downloads of one build
    (`updateJob`); a refusal (`""` from `start`) falls back to the old download; the file lands as
    `<name>.recebido` beside its place, is size-checked, then renamed.
  - **Country maps** (`offlineMap.ts`, `OfflineMaps.tsx`): the identification is written as soon
    as the map lands (`mapLanded`), without the business file until that lands too — the start-up
    check (`dropCutShortFiles`) had deleted a freshly refreshed map whose business file was still
    coming; a size mismatch now deletes the map only and keeps the identification, so the Wi-Fi
    refresh fetches it again (`droppedMaps`); orphan maps and `.recebido` leftovers go; the list
    drops "out of date" when a download ends, whoever started it.
  - **Automatic copy** (`backup.ts`): restoring restarts the app; nothing is written while a
    picker is open (it went to the background and overwrote the copy about to be restored);
    choosing a folder that already holds a copy asks Replace or Restore
    (`chooseBackupFolderWithNotice`).
  - **Learning** (`movementLearning.ts`, `location.ts`, `App.tsx`, `settings.tsx`): App waits for
    the stored settings (`loaded`) — at start the defaults said "off" and learning was stopped and
    its trip wiped; a GPS gap no longer drops the stay one leaves by car or bus
    (`GAP_DEPARTURE_MAX_M`); navigation's start stops learning first
    (`setBeforeNavigationStart`) and learning starts again only once navigation's service is gone
    (`whenNavigationServiceIdle`) — expo-location runs one foreground service for both tasks, and
    stopping one took the other's away; a walk that climbs ≥ 15 m teaches no flat pace (the climb
    is read from the GPS altitude); a ride teaches the chosen bike type's pace; a vault that cannot
    be read keeps its data (five tries) instead of being overwritten empty; a refused background
    permission is shown under the switch (`learningNeedsPermission`).
  - **Map** (`MapView.tsx`): street view's lines and the trails go under our layers
    (`OVERLAY_FLOOR`, an empty always-mounted layer used as `beforeId`) — added late, they landed
    on top of the route and pins and took their taps; only buses in view glide; the open line's
    stops show at any zoom (`transitStopsFocused`).
  - **Transport**: `unique` keeps the earlier-arriving live option before the later departure.
  - **Buses**: after a pause the operator's pace is not learnt from the gap (`lastAskAt`).
  - **Perf log**: a pause (picker, permission, background) is not a stall; the search's
    "list shown" is timed once per focus.
  - **Learnt place → "Show on map"** moves the map there and drops a pin, no lookup.
  - **Street view while measuring** adds a point, as every tap does then.
  - **Search rows are keyed by place** (no index): a row removed above no longer remounts and
    replays every fade below it.
  - **Street view sheet**: the 500 px thumbnail is really seen (the fade starts with whichever
    image comes first), a spinner stays until the big one lands, a failed thumbnail says
    nothing, the drag hint stays until the first turn; the pictures ahead are warmed as hidden
    `Image`s with the app's User-Agent (`Image.prefetch` sends none); a picture found by
    `pictureNear` without sequence links asks its item for them (‹ › stayed off); the viewer's
    own colours are one `VIEWER` table, the arrows `theme.onAccent`.
  - **Labels**: the emoji box keeps the last character as seen (`lastGrapheme`: `Intl.Segmenter`,
    else ZWJ, variation selectors, skin tones, keycaps, tags and flag pairs glued by hand —
    `[...text].slice(-2)` cut 👍🏽 and 👨‍👩‍👧‍👦); `addLabel` refuses at `LABELS_MAX` and says so
    (`labels.full`) instead of adding and cutting it off; the icon colour is `LABEL_INK`.
  - **Business file caches** (`localPois.ts`): keyed by region and `negociosGerado`, so a new
    file is read afresh; failed reads are not remembered; least recently used out; at most
    `PREFETCH_MAX` (24) cells warmed per view.
- **A dropped pin says whose it is** (author's photo, 19 November: a pin on their house read
  "Point on the map" with its coordinates; not seen on a phone): within `PIN_SAVED_M` (40 m) of
  Home, Work or a saved place it takes that name and address; otherwise the address as before.
  And **reverse geocoding falls back to Photon** (`reversePhoton`, `/reverse`, its own queue)
  when Nominatim fails — it had answered 503 after 15 s, and the pin stayed nameless.
- **A copy that survives uninstalling** (author: "it should keep a file on the phone by
  itself", 19 November; not seen on a phone): `services/backup.ts`. Android deletes the app's
  folders on uninstall, and a file it put in Downloads is no longer readable by it after
  reinstalling; what survives is **a folder the person picks once** (Settings → Data and
  storage → Automatic copy; `Directory.pickDirectoryAsync`, which keeps the permission). From
  then on `PalmMap-copia.json` is written there **each time the app goes to the background**
  (`keepBackupUpToDate`): settings, saved places, Home/Work, favourite stops and lines,
  recents, the parked car, the learnt pace, the trips started, the last view (`KEPT_KEYS`) —
  not maps, timetables, a pending update or the last crash. The file is found by its decoded
  address (a picked folder's addresses are document ids) and padded with spaces to the old
  size (mode "w" does not truncate on some providers). **Restore**: "Restore a copy" picks
  the file, writes only `KEPT_KEYS` and restarts the app (`reloadAppAsync`; every store read
  its value at start — closing only sent it to the background, and it wrote the old values back);
  a fresh install — none of the person's keys stored — is offered it once, 1.5 s after
  start (`offerRestoreOnFirstStart`). Android's own Auto Backup is **off** since 19 November 2026
  (`allowBackup: false`, privacy: it uploaded the app's storage to Google's servers). The alerts' text is in a
  `backup` section of the language table, not `settings`.
- **A tap on a map that "did nothing"** (author's report, 19 November; not seen on a phone):
  two causes. A tap on a downloaded, current map **deleted** it at once — now it asks first
  (`offline.removeTitle`). And the Wi-Fi refresh's download was invisible in the list: a tap
  then started a second download of the same file, each deleting the other's `.parcial`.
  `downloadRegion` now keeps one download per region (`running`), a second request joins it,
  and the list shows every download under way, whoever started it (`watchDownloads`).
- **One bottom panel at a time, the newest** (author's report, 18 November: two panels open at
  once; not seen on a phone). Each panel decided alone — the stop's (`transitVisible`), the
  bus's and the measuring tape's showed over a place card or the route. `topPanel` in
  `App.tsx`: each open panel gets a number when it opens (`openedAt`), the newest shows, ties
  in the same render go by `PANEL_RANK`; closing it brings back the one underneath. `shownPanel`
  (camera padding, floating buttons) follows it, and the back button closes `topPanel` first.
- **A transport trip moves on only riding forward** (author's report, 18 November: "get off
  at the next stop" came while on a bus the opposite way — getting off would have left them
  far from where they were going; not seen on a phone). `guideProgress` took the furthest stop
  within 80 m, in any order. Now each reading is placed along the ride's path (`alongLine`,
  around the last reading's place first, so a loop keeps its pass) and the trip moves on only
  when on the path (80 m) and at least 5 m further along than the last reading; stops count as
  passed by their own place along the path (`stopPositions`, `lastStopBehind`), so a reading
  missed in a pocket is caught up and a bus the other way moves nothing. `GuideProgress`
  carries `along`/`alongLeg` for this.
- **Following waits for a fresh fix** (author's report, 18 November: after switching apps and
  turning following on, the map went to an old position first): the camera's following uses
  the native location layer, whose first answer on coming back is Android's last known
  position. `holdFollowUntilFresh` (`App.tsx`) lets the camera go (`followHold`), centres on
  `getFreshPosition`, and ties it again 0.7 s later; on coming back to the app while
  following, and on turning following on when the last fix is old (`lastFixIsFresh`). The
  "following dropped" event the release causes is ignored (`followHoldRef`).
- **The blue dot on the line being travelled** (author's photo, 18 November: on the bus by
  Almada Forum the dot sat beside the road — "I'm a perfectionist"; not seen on a phone):
  `snappedLocation` in `App.tsx` projects the GPS onto the route while navigating (within
  40 m, 20 on foot) and onto the trip's paths on a transport trip (60 m on a ride, 20 on a
  walk), with `snapToLine` (`geometry.ts`, onto segments, not vertices). `MapView` then draws
  the dot and cone from its own `user-snapped` source and leaves the native `UserLocation`
  layers mounted but see-through, so following and the camera are untouched. Farther than
  that, the dot is where the GPS says.
- **Setting Home and Work, as Google** (author, 18 November: "setting home is very
  impractical, copy Google"; not seen on a phone): `HomeWorkPicker.tsx`, a screen of its own
  with the address search focused (Nominatim's rules, as the main bar), "Use current location",
  "Choose on map", "Remove", and the saved and recent places below. "Choose on map" closes it
  and puts a fixed pin in the middle of the map with a bar ("Set home here" / Cancel; back
  cancels too); the place is the map's centre, named by `addressAt` (`nominatim.ts`: street
  and number, never the business there). Opened from the Saved screen (empty tile, pencil or
  long press) and from the empty search, whose chips now show "Home · Set" when unset. The old
  "tap a place in the list below" mode is gone. **An address result is "Rua da Granja 26",
  not "26"** (author's photo): Nominatim gives an address no `name`, and the first part of
  `display_name` is the number alone (`shortName`). Probed with `sondar: granja26`: house
  numbers are found where OSM has them (Granja 7 and 26); a missing number gives the street;
  once the app's exact request took 15 s and got a 503, and Photon then answered.
- **"Clever" features** (author: "I'd like to say the app has very clever features", then
  "do them all", 18 November; none seen on a phone):
  - **Walking time counts the climbs, at the person's own pace up hills** (author: "of
    course, it learns from how you walk up and down"): Naismith's minute per 10 m
    (`NAISMITH_SECONDS_PER_M`, `utils/eta.ts`) until learnt, then the learnt `walking-climb`
    (seconds per metre climbed, a `PaceKey` that is not a factor; shown in Settings as
    "Climbs N s/10 m"). Learnt on a walk climbing at least `CLIMB_LEARN_MIN_M` (30 m): the time
    beyond the flat pace already learnt, over the metres climbed so far (the climb assumed
    spread evenly along the route), clamped 2–30 s/m (`clampClimbRate`), blended like any
    pace; such a walk then teaches the flat pace nothing (it would count the hills twice).
    Walking only: Valhalla's bicycle already slows on hills. Every walking alternative's
    profile is asked (cached per route, OSRM's queue), so each option's time counts its climb
    and "Fastest" compares them only once all are known; navigation's remaining time counts
    the climbs still ahead. The chip times of other modes do not include it.
  - **Sunset warning** on walking and cycling routes that set off before sunset and arrive
    after it (`utils/sun.ts`, the sunrise equation as `suncalc` writes it, checked: Lisbon
    17:23 UTC on 18 November, 21:05 summer time on 21 June).
  - **"Open now"** chip first in the category row while a category is on (`openNowOnly`,
    `shownPlaces`): only places whose OSM hours say open now; unknown hours are left out.
  - **Last connection tonight: removed** at the author's request the same day ("maybe
    take the last transport out"). What was learnt doing it stays true: **CP's GTFS has the
    night trains from Cais do Sodré ending at Caxias** (nothing on to Cascais after 21:10 on
    18 November, probably the line's works), so the planner finds no evening Cascais train —
    data, not a fault.
  - **Suggestion on opening** (`tripHabits.ts`, key `palmmap.viagensFeitas`, last 200
    trips started — navigation or transport): the destination most often started within
    1 km of here, same kind of day, within 75 min of now, at least twice; else Work on a
    weekday morning at Home, Home on a weekday evening at Work. A card under the search
    (`SuggestionCard`) with the time; once per session.
  - **Rain at the destination** around the arrival (`weather.ts`, Open-Meteo): one
    request per destination and arrival hour, kept 30 min per place rounded to ~1 km;
    warned from 50 % or 0.5 mm in that hour, for every travel mode, in the route panel.
    Credited in Settings (CC BY 4.0). Probed (`sondar: open_meteo`, `met_no`): Open-Meteo
    timed out twice from GitHub's runners, then answered; MET Norway (`api.met.no`) also
    works with no key and is the fallback to reach for if Open-Meteo misbehaves.
  - **Notifications group in Settings** (author: "don't make the app annoying; a new
    Notifications category with sensible defaults"): `notifyGetOff` (get off at the next
    stop), `notifyParking` (the parking timer's notice), `notifyUpdates` (update
    downloaded — no permission asked either when off), `suggestOnOpen` (the opening card)
    and `routeHints` (rain and sunset notes) — all on by default. The bells a person taps
    (a bus's arrival, time to leave) have no switch: they were asked for. A suggestion
    waved away is not offered again that day (`palmmap.sugestaoDispensada`). The Settings
    text is 1863 characters (measured 19 November 2026, over the 1500 mark) — names, not explanations.
  - **Parking timer** on the Saved screen's car: paid for 30 min / 1 h / 2 h / 3 h, a
    notice 10 min before (`setParkingPaidUntil`, `scheduleNotice` in `arrivalReminders.ts`).
- **"As seamless as possible"** (author's challenge, 18 November; not seen on a phone):
  - **Android's back button closes what is on top**, one thing at a time (`backRef` +
    `BackHandler` in `App.tsx`): the search, navigation, a transport trip, a bus, a stop, a
    line, a place's card or dropped pin, the route, the measuring tape — only then does
    Android leave the app. There was no handler at all: back with a card or a route open
    left the app. `Modal` screens keep handling it through `onRequestClose`. The search is
    closed from outside with `blurRequest` on `SearchBar`.
  - **The empty search starts with Home, Work and Car** chips (only those set), as in Maps.
  - **The screen stays on during a transport trip** too, not only while driving
    (`keepAwake`).
  - **A place's card shows how long to get there** on its directions button ("🚗 12 min",
    the chosen mode's icon), as Maps: one `getDuration` when the card opens (`cardTime` in
    `App.tsx`, same queue and session cache as the mode chips; with the parked car, its
    walk added). Not for transport (its planning is heavy) nor while navigating.
  - **The map opens where it was left** while the GPS has not answered, or with location
    off (`palmmap.ultimaVista`, written at most every 5 s from `handleViewportChange`, not
    in the first seconds; `lastView` on `MapView`, used once at opening and never over a
    position, destination or route). It opened on Lisbon.
  - **Arriving ends the trip**: the route is cleared and the destination's card opens
    (hours, phone), as in Maps — the route used to stay with "Start", as if about to leave.
- **Where I parked** (author's request, 18 November; not seen on a phone):
  `services/parkedCar.ts` (key `palmmap.carroEstacionado`) keeps where the car was left —
  saved from the Saved screen ("Car": a tap saves where one is, or walks there; ✕ forgets
  it) and by itself when a car navigation arrives. Drawn as a car on the map (`parkedCar`
  on `MapView`); a tap opens its card. **Car trips start at the car** when the person is
  farther than `PARKED_WALK_MIN_M` (80 m) and nearer than `PARKED_WALK_MAX_M` (10 km), the
  origin is the GPS and the destination is not the car (`carStartFor`): the drive is asked
  from the car, the walk to it from OSRM's walking server (`walkToCarFrom`, straight line
  × `WALK_DETOUR` if it fails), and the walk goes on the route as `Route.walkToCar` — added
  to the car chip, the route list and "Includes N min walking to the car", drawn dotted.
  Navigation walks first ("Walk to the car", the drive's first manoeuvre as "then", no
  off-route recalculation, no announcements, no pace measured), then drives; within
  `CAR_REACHED_M` (35 m) the car counts as reached and is forgotten. Setting off by car
  next to it forgets it too.
  **Saving it from the Saved screen asks first** (author's report, 20 November 2026: saving
  the school's label parked the car — the Car row sits just under the label chips and saved
  on one tap).
- **Height profile on walking and cycling routes** (author's request, 18 November; not
  seen on a phone): `routeElevation` (`osrm.ts`, OSRM's queue — FOSSGIS rules) asks
  Valhalla's `/height` with the route as `encoded_polyline` (at most ~400 points),
  `range: true` and `resample_distance` of a hundredth of the route (20–500 m); probed
  with `sondar: valhalla_height` (`range_height: [[metres, height], …]`). `summariseHeights`
  (`utils/elevation.ts`) counts climbs past `NOISE_M` (3 m) only; `ElevationProfileView`
  shows up/down, the range and 48 columns.
- **CP delays: not done** (author's request, 18 November). Infraestruturas de Portugal's
  circulation service (`/negocios-e-servicos/estacao-nome`, `partidas-chegadas`,
  `horarios-ncombio`) answers **403 to an honest client** and 200 only to a request that
  passes for a browser (`sondar: cp_realtime`, `cp_realtime2`) — it is their site's
  internal endpoint, not an open service, and dressing the app up as a browser is not done.
  The Mobility Database lists no Portuguese GTFS-RT. Trains stay timetable-only.
- **Business pins on "Satellite + bus"** (a friend's report, 18 November: they come and go;
  not seen on a phone): the tile pins (`tilePois`) were off on every transport map type, so
  without a downloaded country "Satellite + bus" had none — only the plain transport map is
  left without them now. And the satellite's place names (`sat-place-labels`) take
  `text-ignore-placement`: that source mounts when the map type changes, lands above the
  pins, is placed first, and a neighbourhood's name hid the business icons around it.
- **Spain's aerial orthophotos in "High" satellite detail** (author's request, 17 November;
  not seen on a phone): the IGN's PNOA "máxima actualidad" (`PNOA_ORTOS` in `tiles.ts`, the
  WMS `www.ign.es/wms-inspire/pnoa-ma`, layer `OI.OrthoimageCoverage`), 15–25 cm, the newest
  flight of each area; mainland, Balearics, Ceuta, Melilla and the Canaries (two sources,
  `pnoa` and `pnoa-canarias`, for tight `bounds`). CC BY 4.0 `scne.es`, "no conditions" in its
  capabilities; attribution `attributions.pnoa`. Under the DGT's layer, same fade from zoom 12.
  **Both orthophoto services now ask `image/vnd.jpeg-png8`** (`ORTHO_FORMAT`): JPEG where there
  is imagery, a 139-byte transparent PNG where there is none. Plain JPEG sent opaque squares
  outside each country — **the DGT's were white, over Spain and the sea inside its bounds, on
  the map already** — and the PNOA a blurry picture over Portugal; plain PNG is 3–10× heavier.
  Probed with `sondar: pnoa`, `pnoa_blank` and `ortho_formats`. An Airbus 2025 image the
  author had heard of is not open: Airbus sells it (OneAtlas); the DGT's 2023 one is Airbus
  Pléiades Neo, bought by the State.
- **Built in 7.0.53** (17 November): the HARICA root for the DGT host (old Androids' "High"
  satellite), borders and place names over the satellite, "Report" → OpenStreetMap note, and
  ratings through the issue form with the "avaliação" label.
- **Built in 7.0.52** (17 November): Spain's PNOA orthophotos and the transparent orthophoto
  format (no more white squares from the DGT along the border). Not in it: the borders and
  place names over the satellite.
- **Built in 7.0.51** (17 November): a tap on a bus, stop or station under a business pin
  opens the transit thing (`transitAt`), "Add stop" in the route panel, and the review fixes
  around it — still signed with the debug key.
- **Built in 7.0.50** (17 November): arm64 + armeabi-v7a (for the Galaxy A13), the next
  departures per pair of lines, the code-review fixes (scale bar, see-through pull-to-close
  screens, header drag) — still signed with the debug key, no secrets yet.
- **Built in 7.0.49** (17 November): everything after 7.0.48 below — trail mode, the
  time-to-go and get-off notifications, the security fixes, the Lagoon palette, the
  update-downloaded notice, timetables v2, the kept stop list and Carris caches, the new scale
  bar, colours per operator and line, and less data for live buses.
- **Built in 7.0.48** (17 November): the favourites screen (Home, Work, favourite lines).
- **After 7.0.48** (author: "do the other things", 17 November; none seen on a phone):
  a **time-to-go reminder** — a bell beside Start for a planned transport trip, shown when
  leaving is more than 3 min away, notifies `LEAVE_LEAD_S` (2 min) before one must leave
  (`toggleLeaveReminder`, key `sair|<tripId>`, in `arrivalReminders.ts`); **"get off at the
  next stop" as a notification** too, once per ride, voice on or off (`notifyNow`, the
  `guideNotified` effect in `App.tsx`; the permission is prepared on Start,
  `prepareTripNotices`); and **trail mode**: Waymarked Trails' overlay tiles — walking,
  cycling or BTT (`trails` setting, chips in the layers sheet and Settings → Map;
  `TRAILS_TILES` in `MapView.tsx`, a `RasterSource` under all our layers, `maxzoom` 17,
  attribution CC-BY-SA). Probed with `sondar: trails`: the tiles answer 200 PNG with no key;
  no usage terms page was found, so it stays to tiles on screen, cached like any other.
  Overpass has Monsanto's guideposts and boards and 28 marked routes (PR1LSB, PR3–5PFM…);
  guideposts on the map are **not** done yet. **Bike-share (Gira and the like) is left out on
  the author's word** ("not yet"): some cycling relations carry network "Gira", and the
  cycling overlay draws whatever OSM marks.
- **The favourites screen, as Moovit** (author's request, 17 November; not seen on a phone):
  the Saved screen opens with **Home** and **Work** shortcuts (`homeWork.ts`, key
  `palmmap.casaTrabalho`) — set, a tap makes it the destination; empty, or with a long press,
  the next place tapped in the lists below becomes it ("Clear" and "Cancel" in the bar that
  says so) — then **favourite lines** (`favouriteLines.ts`, key `palmmap.linhasFavoritas`, a
  star on `LineSheet`; a tap opens the line through `handleSelectLine`), favourite stops,
  saved places and recents. Both stores use `savedStore.ts` (one value, listeners, written at
  each change); `favouriteStops.ts` predates it.
- **"The app takes ages to load"** (author, 17 November, after 7.0.46; not seen on a phone):
  the stored timetables were the suspects, measured with the real published files in Node
  (`schedules.ts` compiled, `expo-file-system` stubbed). Opening one built a per-trip index —
  1.6 million objects for Carris de Lisboa, 7.8 million for Carris Metropolitana — taking 255
  and 1086 ms in Node, many times that on a phone, all on the JavaScript thread. Now the
  index is per pattern (`stationPatterns`, `patternTrips`) and a station's calls and a trip's
  minutes are put together when first asked (`callsAt`, `tripMinutes`): 95 and 394 ms, the
  rest being `JSON.parse`, **with every query's answer byte-identical** to before. The
  transport map's stops and stations no longer open files they then skip (`loadedFeeds`
  takes a filter on the identification — they used to parse Carris Metropolitana's 27 MB
  online); `installedFeeds()` is kept until a download or removal (it re-read the folder on
  each Carris de Lisboa bus, every refresh); and the live buses' numbers come from a
  2 KB side file, `carris-lisboa.linhas.json`, written the first time that timetable is
  opened (`CARRIS_LISBOA_WARM_MS`, 4 s after the first live buses, once per install) and
  dropped when it changes. **After a review:** every query names the files it needs before
  any is read (`loadedFeeds(wanted)`: expired ones, other operators, `hasCoverage` from the
  identification's `bbox`); a failed update forgets what was kept (`forgetFeed`);
  `callsByMinute` builds its own list without a second copy in `callsAt`. Author's report
  behind it: on "Satellite + bus", with the timetables downloaded, only the imagery showed —
  no position, nothing else.
- **"As Moovit", four points** (author: "I want to imitate Moovit, it is so annoying with the
  ads"; 17 November, none seen on a phone): a **Transit tab** (`NearbySheet`, tab `'nearby'`,
  icon `bus-clock`) listing the stops (`nearbyStops`, `arrivalsAt`) and stations
  (`departuresNear`) around the map's centre with the next passes per line, refreshed every
  30 s; a **service alerts screen** (`AlertsSheet`, from that tab's button, with the count);
  **trip preferences** in the route panel — Best / Less walking / Fewer changes and the
  means to leave out (bus, metro incl. light rail and trams, train, boat), stored as
  `transitSort` and `transitAvoid`, applied to the finished plan by `applyTransitPrefs`
  (`transitPlan.ts`; walking compared in 100 m steps, ties by arrival; App keeps the raw
  plan in `plannedTrips` and shows the result as `transitTrips`, so a preference asks
  nothing again and an empty list says how many were hidden); and a **line's full
  timetable at a stop** — "Full timetable" under a tapped line's journey
  (`LineTimetable`, `stopTimetable` in `transit.ts`): seven day chips, the pattern's trips
  that run that day (`valid_on`) at that stop sequence, hour by hour, the ones gone faded.
  Same pattern answer as the journey, nothing new asked.
  **Fixed after a review (17 November):** the transport chip's time is the preferences
  applied to the plan (`chipTrips` → `shownModeTimes`, `fastestTrip`), and the badge says
  the chosen order ("less walking") instead of "best" on a slower trip; the chosen option is
  stamped with the preferences (`chosenTrip`) so a new order is 0 in the same render; Carris
  de Lisboa's trams and lifts (`\d+E`, all `bus` in its timetable) go with the rail in
  `modeGroup`; the timetable is per calendar day (yesterday's 24:xx trips at the top, the
  day's own at the next day); the Transit tab follows the map's centre, lists Carris de
  Lisboa's stops and, offline, Carris Metropolitana's stored times (`busDeparturesNear(…,
  withLive)`), opens a tapped station (the map there, its panel when listed) and ignores
  a load that finished after a newer one.
- **Built in 7.0.44** (16 November): everything in "After 7.0.43" below, and tapping an
  alternative route on the map. **After 7.0.44**, from a code review: the reminder's channel
  is created **before** asking for the permission (Android 13+ shows no prompt without a
  channel), a second tap on the bell while the first is on its way does nothing (`busy`), a
  delivered reminder is never rescheduled (`at`), reminders whose bus has gone are dropped
  (`prune`), and a failure says so under the arrivals.
  **Then, from the author's phone (7.0.44):** the bell took ages to light — it waited for
  the channel, the permission and the scheduling, all native round trips; now it lights at
  once and the scheduling follows, undone if it fails. The notification had no icon: a
  white `palm-tree` glyph (`assets/notification-icon.png`, drawn by `generate-icons.py`)
  with the accent colour, through `expo-notifications`' plugin options in `app.json`
  (needs a full build). The reminder's key is the line and the timetable's minute at the
  stop, so a bell set offline is the same bus once live arrivals come back.
- **After 7.0.43** (author: "pull the other real-time library and the open-data things"; none
  seen on a phone): **Carris de Lisboa's buses and trams live** — GTFS-RT vehicle positions
  (`CARRIS_LISBOA_VEHICLES_URL`, Protobuf, ~10 KB for ~110 vehicles), decoded with
  `gtfs-realtime-bindings` (on `protobufjs/minimal`: no `eval`; `Long` numbers go through
  `plain()`), merged into `liveVehicles()` (`operator: 'cl'`, ids `cl:<n>`). The feed has
  only `route_id` (`172_1`), `stop_id`, `current_stop_sequence`; the public number (735, 28E)
  and the bus panel come from the **stored Carris de Lisboa timetable**, which now carries
  `stopIds`/`routeIds` (`build-transit.py`, optional fields; regenerated 16 November) —
  `carrisLisboaLine`, `carrisLisboaTrip` (the trip of that line at that stop due nearest
  now, marked approximate; no shape stored, stops joined). Without the timetable the bus
  shows with no number. **Service alerts** (`alerts.ts`, `ServiceAlerts.tsx`): Carris
  Metropolitana's `/v2/alerts` (JSON, ~57 KB, kept 10 min), on a stop's panel (its lines and
  the stop) and a Carris Metropolitana bus's panel. **Favourite stops** (`favouriteStops.ts`):
  a star on the stop's panel; the Saved screen lists them first with the next three buses
  (`FavouriteStopRow`). **Settings grouped**, as in Maps: General, Map, Transit (live buses
  and timetables), country maps, Navigation, About (opens by itself when an update is
  waiting) — `Collapsible` with an `icon` is a top-level group. **The bus panel no longer
  shows the speed** (author: wrong). Probed with `sondar: realtime_feeds`: Carris de Lisboa
  has no trip updates or alerts (404); TML's alert/GTFS-RT addresses are 404 now; **Gira has
  no open real-time data** (EMEL 403, dados.cm-lisboa.pt behind Cloudflare; only a static
  station list on dados.gov.pt). **Line search**: the search bar also lists Carris Metropolitana lines
  matching the text — by number ("36" → 3601…), or from four letters by the places in the
  name (`searchLines`; `/v2/lines`, 717 lines, ~340 KB, asked once, filtered on the phone,
  so no Nominatim rule is touched). A chosen line opens `LineSheet`: a chip per direction
  (`lineDirections`, up to four patterns at ~400 KB each, cached), its alerts, every stop
  (a tap opens the stop's arrivals; closing it comes back to the line), and its way on the
  map (`lineJourneyShown` with `shape`, framed by `MapViewRef.frame`). **Arrival reminder**:
  a bell on each bus in a stop's arrivals schedules a local notification 5 min before
  (`arrivalReminders.ts`, `expo-notifications`, channel `chegadas`; permission asked only
  on the first tap; `POST_NOTIFICATIONS` in `app.json`). It moves with each refresh of the
  stop's arrivals while the panel is open (`updateReminders`); otherwise it keeps the last
  estimate. Reminders live for the session. **Fares were not added**: no open source of
  current prices was found, and made-up numbers would be worse than none.
- **Built in 7.0.42** (16 November): the bus panel below and the time picker's minute wheels and swipe-to-close.
- **Tap a live bus** (author's request, 16 November 2026; not seen on a phone): its panel
  (`VehicleSheet.tsx`) shows the line and headsign, **"position from N s ago"** (counting up
  each second from the bus's own `timestamp`), the stop it stands at or heads to with the
  minutes left, how late it runs, and the stops after with the time at each; the map draws
  its way from where it is (the pattern's shape, cut at the bus) and those stops, and the bus
  is drawn bigger. `vehicleTrip` (in `transit.ts`) loads the pattern, stops, shape and **the
  bus's own trip**: its `trip_id` without the `[…]` prefixes is one of the pattern's
  `trips[].trip_ids` without theirs (`[7DQC0][LA77N]1529_0_1_1730_1759_0_1` ↔
  `[XS3H8]1529_0_1_1730_1759_0_1`; else the trip due nearest now lends its minutes, marked
  "approximate"). `vehicleProgress` places it at each refresh: `stop_id` is a plain id in the
  pattern's path, `current_status` `STOPPED_AT` means at it, otherwise heading to it; on a
  circular line (1012 starts and ends at one stop) the pass is the one whose stretch the bus
  is on. The delay is the timetable's time at the bus's point (interpolated by distance
  between the two stops) against the report time. Probed with `sondar: vehicle_trip` and
  checked with the app's code in `trajetos` (17:39, four buses, all trips matched, e.g. 1722
  at R Cravos Abril 45, 19 min late). The panel keeps the last known bus when it drops out
  of the list.
  **Added after 7.0.42** (author's requests): a **refresh button** asks `/vehicles` at once
  (`handleBusRefresh`; the newest `reportedAt` wins between the list and this, and "no newer
  position" is said when nothing moved); the line's **origin → destination** under the title;
  the list shows the origin, the passed stops folded ("N earlier stops"), a bus row where it
  is, then the stops ahead ending at the destination; **a tapped stop** takes the map to it
  (`recenter`, marked in the list and on the map). The panel counts as `'vehicle'` in
  `shownPanel`, so the camera and floating buttons keep above it.
- **A line's journey, as in Maps** (author's request): tapping a line in a stop's arrivals
  shows its stops from there (`lineJourney`, in `transit.ts`; `LineJourney.tsx`), folded into
  "12 paragens · 25 min" when there are many, with the time at each — the pattern's timetable
  shifted by the bus's real delay at this stop — and, with a destination chosen, ending at
  the line's stop nearest it ("Sair aqui"). The map draws the way and those stops. The source
  is `/v2/patterns/<id>`, **without** the `[YA15B]` prefix the arrivals carry (with it: 404);
  about 400 KB per pattern, kept for the session. Probed with `sondar: pattern`, checked with
  the app's own code in `trajetos`.
- **"Satélite + bus" map type** (`satelliteTransit`, `isTransitMap`): the satellite underneath,
  with the live buses, Carris stops and arrivals button of the transport map on top.
- **The compass cone has its own native compass** (author's report, 17 November: "very
  buggy", on the Galaxy A20e and other phones; not seen on a phone, needs a full build):
  `expo-location`'s heading is the raw accelerometer + magnetometer sum, unfiltered, read with
  `getOrientation`, which goes wild with the phone upright. `CompassModule.kt`
  (`modules/palmmap-voice`, `PalmMapCompass`) reads Android's fused `TYPE_ROTATION_VECTOR`,
  else `TYPE_GEOMAGNETIC_ROTATION_VECTOR` (no gyroscope), else the raw pair low-passed; the
  direction is the top edge plus the back (`R[1]-R[2]`, `R[4]-R[5]`), so flat, upright and
  in between agree; true north from the last fix's declination. `watchCompass` prefers it,
  falls back to `expo-location`, and averages either as a direction (`HEADING_SMOOTHING`).
- **The compass cone keeps one size**: it was `icon-pitch-alignment: 'map'`, which drew it at
  its tile's size and made it grow and shrink against the dot with the zoom (author's report);
  now `'viewport'`.
- **The voice speaks on Start**: the first instruction is said at once (before, nothing until
  400 m from the first manoeuvre — on a long road the voice seemed off), and the speech engine
  is woken when a destination is chosen (`warmUpVoice`, through `isSpeakingAsync`, which never
  touches the voice list).
- **Efficiency round** (author's request), none of it seen on a phone yet:
  the map's sources get their GeoJSON **as memoized text** (`GeoJSONSource` stringifies an
  object `data` on every render — the whole route once a second while navigating); the lists
  App hands the map are memoized and missing ones default to a shared `NONE`, not `= []`;
  the compass lives in its own `HeadingCone` component inside `MapView` (in `App` each
  reading redrew the whole app); `distanceAlong` uses cumulative distances kept per route
  (one subtraction) and `locateOnRoute` searches around the last index (`near`), falling
  back to the whole route only beyond `LOCATE_TRUST_M` — measured on a 400 km route,
  0.01 ms a reading instead of ~2 ms, and a there-and-back route no longer jumps to the
  return pass; live buses and a stop's arrivals stop asking while the app is in the
  background (`useAppActive`).
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
  `localPois.ts`): mainland Portugal has 164,867 businesses and 22,651 doors in 18.9 MB (218,642
  businesses in 24.5 MB before the twins below were dropped). **All 27 regions regenerated on
  16 November 2026, with doors and without twins** (`apenas_negocios`); in Germany, Spain and
  Switzerland doors outnumber businesses or come close (house doors are mapped there) — Germany's
  file is 234.5 MB. Without a downloaded
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
- **Dark map without CARTO**: their tiles now say "API KEY REQUIRED"; dark is OSM's tiles
  inverted on the phone (`DARK_PAINT`). **Travel-mode buttons** use `formatDurationShort`
  (whole hours from 10 h) and shrink the text, so a long walk fits.
- **PalmMap opens location links** (`geo:` and `google.navigation:`, `intentFilters` in
  `app.json`; `parseGeoLink` in `src/utils/geoLink.ts`; the effect after `handleSearchSelect`
  in `App.tsx`): "Open in maps" in WhatsApp, Contacts, Calendar or a page can pick PalmMap,
  and the place becomes the destination. A point without a name waits up to 4 s for its
  address before becoming the destination (changing it later would ask OSRM twice).
  **Gemini cannot be made to use PalmMap**: it only talks to Google's apps and approved
  partners, and calls Google Maps by name. `maps.google.com` links cannot be claimed either
  (Android gives them to Google). Asked by the author, November 2026; not seen on a phone.
- **Directions screen** (button next to the search): any origin and destination, swap, travel
  mode. Navigation always starts from the GPS.
- **Satellite:** Sentinel-2 moved to 2025. The DGT orthophotos stay at 2023 — nothing newer is
  published (probed again 17 November 2026, `sondar: satellite`: `ortos.dgterritorio.gov.pt` only has `ortosat2023`, and EOX's newest is `s2cloudless-2025`; 2026 is 404).
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

**Trail mode (the author's idea)**, something Google Maps lacks: the marked walking and
cycling routes are in (see "After 7.0.48"). Still to do, only if the author asks: the trail
signposts (`tourism=information` + `information=guidepost`, like Monsanto's "TB.4xx", taken
out of the normal pins for being junk outside that mode) and boards, as pins in that mode.

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
| GTFS-RT (Protobuf) | `gtfs-realtime-bindings` — Carris de Lisboa's live vehicles |
| Local notifications | `expo-notifications` — the arrival reminder |
| Internet requests | `axios` |
| Map tiles | OpenStreetMap; business pins from OpenFreeMap |
| Address search | Nominatim (`https://nominatim.openstreetmap.org`), and Photon when it fails |
| Routing | FOSSGIS OSRM (`https://routing.openstreetmap.de`), one server per travel mode; bicycles from FOSSGIS Valhalla (`https://valhalla1.openstreetmap.de`) |
| Offline maps | Protomaps (PMTiles), cut from the world map |

The target platform is **Android**. Nothing prevents iOS, but the permissions and the
install-file build described here are Android-specific.

**iPhone: left for later, by the author's decision** (17 November 2026). The routes were
researched and written up in `docs/ios-custo-minimo.md` (in Portuguese): an unsigned `.ipa`
built free on GitHub's macOS runners and signed by each person with SideStore (free Apple ID,
7-day renewal — too fiddly for the author's friends), or the US$99/year Apple Developer
Program with TestFlight or the App Store (possibly paid by the donation goal). No iOS work
until the author asks.

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

The APK is built for **arm64-v8a and armeabi-v7a**. It was arm64 only until November 2026,
when a colleague's **Samsung Galaxy A13** refused it ("the app is not compatible with your
phone"): budget phones often run a 32-bit Android on a 64-bit processor, and then only
`armeabi-v7a` libraries load. The x86 ones stay out: all four tripled the size, and a huge
file is more likely to arrive truncated — which gives "there was a problem parsing the
package".

**The version comes from the build, not from anyone's hand.** `app.json` keeps only the
meaningful part — the `7.0` of "version 7" — and the workflow appends the run number. APK 12
is `7.0.12`, the next `7.0.13`, and **there are never two with the same version**. It used
to depend on someone remembering to edit the file, and five builds in a row once all said
the same. When touching `app.json`, touch only the `7.0`.

The same number is the `versionCode`. Without a new number, Android refuses to install over
a previous version.

**No verification machinery in the Releases** (author's decision, 17 November 2026): a
VirusTotal scan, signed build provenance and a "Verify" section were added and taken out the
same day — the author found that, to someone wary, all of it reads as a reason to give up.
To reassure a person, the advice is: upload the APK to virustotal.com yourself, and look at
the eight permissions the app asks for. Do not add it back unless asked.

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
│   ├── poly-to-geojson.py  # A zone's Geofabrik outline, for cutting its map
│   ├── eu-catalogue.py     # Open EU transport sources from the Mobility Database
│   ├── probe.py            # Read-only probes run by the timetables workflow (`sondar`)
│   └── probe-trips.js      # Runs the trip planning against the real API
├── modules/
│   └── palmmap-voice/      # Our only native code: speech, compass, downloads, vault (Kotlin)
├── docs/
│   └── project-brief-original.pdf
├── src/
│   ├── components/
│   │   ├── MapView.tsx       # Map, business pins, route, destination, blue dot and cone
│   │   ├── SearchBar.tsx     # Search bar (Nominatim, saved places, voice)
│   │   ├── CategoryBar.tsx   # "Restaurants", "Pharmacies", … buttons
│   │   ├── BottomTabs.tsx    # Explore / Go / Transit / Saved / Settings
│   │   ├── LayersSheet.tsx   # Map type, businesses, live buses, measuring tape
│   │   ├── SavedSheet.tsx    # Saved places
│   │   ├── DirectionsSheet.tsx # Any origin and destination
│   │   ├── PlaceSheet.tsx    # A place's card: open now, hours, buttons
│   │   ├── RoutePanel.tsx    # Route panel: times per mode, alternatives
│   │   ├── StepsList.tsx     # The route's instructions
│   │   ├── NavigationPanel.tsx # Navigation screen: manoeuvre, lanes, limit, footer
│   │   ├── SpeedBadge.tsx    # The speedometer, while navigating and on the map
│   │   ├── TransitSheet.tsx  # Stops nearby and their arrival times
│   │   ├── LineJourney.tsx   # A tapped line's stops from here, Maps-style
│   │   ├── TransitGuidePanel.tsx # A transport trip under way, step by step
│   │   ├── VehicleSheet.tsx  # A tapped live bus: its way, stop, next stops, age
│   │   ├── ServiceAlerts.tsx # Strikes, diversions, works on what is shown
│   │   ├── LineSheet.tsx     # A searched line: directions, alerts, stops
│   │   ├── LineTimetable.tsx # A line's whole-day timetable at a stop, per day
│   │   ├── NearbySheet.tsx   # Transit tab: stops and stations around, next passes
│   │   ├── AlertsSheet.tsx   # Every service alert
│   │   ├── FavouriteStopRow.tsx # A favourite stop with its next buses (Saved)
│   │   ├── TripTimeline.tsx  # A trip's steps as a Maps-style timeline
│   │   ├── StreetViewSheet.tsx # Street view: a Panoramax picture, ‹ › along the street
│   │   ├── LabelEditor.tsx   # A label of one's own: name, colour, icon or emoji, place
│   │   ├── LabelIcon.tsx     # A label's icon: the font's or an emoji
│   │   ├── PerfCard.tsx      # Settings → About: what blocked the app, this session
│   │   ├── LearningSettings.tsx # "Learn from my movements" and what it learnt
│   │   ├── ConnectivityBanner.tsx # "Offline" / "Back online"
│   │   ├── SwipeToRemove.tsx # Swipe a row away (recent searches)
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
│   │   ├── vehicles.ts       # Where the buses are right now (Carris Metropolitana and Lisboa)
│   │   ├── alerts.ts         # Service alerts (Carris Metropolitana)
│   │   ├── favouriteStops.ts # Starred stops
│   │   ├── arrivalReminders.ts # "Your bus arrives in 5 min" notifications
│   │   ├── transitGuide.ts   # A transport trip as steps, and following it with the GPS
│   │   ├── photos.ts         # A business's photos (Commons, Wikidata, Panoramax)
│   │   ├── streetView.ts     # Street view pictures (Panoramax): nearest, by id, sequence
│   │   ├── osmNotes.ts       # "This shop closed": an anonymous OpenStreetMap note
│   │   ├── entrances.ts      # A place's doors, to arrive at the right side
│   │   ├── network.ts        # Online or offline, for the whole app
│   │   ├── systemDownload.ts # Big downloads through Android's DownloadManager
│   │   ├── backup.ts         # The automatic copy in a folder the person picked, and restoring it
│   │   ├── schedules.ts      # Train, metro and ferry timetables stored on the phone
│   │   ├── update.ts         # New version check, and handing it to the installer
│   │   ├── crash.ts          # Stores what closed the app, to read later
│   │   ├── favourites.ts     # Saved places
│   │   ├── parkedCar.ts      # Where the car was left, and its parking timer
│   │   ├── tripHabits.ts     # Trips started, for the suggestion on opening
│   │   ├── perfLog.ts        # In-memory performance log and a stall watchdog
│   │   ├── movementLearning.ts # Opt-in background learning: paces, frequent places
│   │   ├── weather.ts        # Rain at the destination (Open-Meteo)
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
│   │   ├── lineColour.ts     # A transport line's badge colour
│   │   ├── openingHours.ts   # Reads `opening_hours`: "Open · Closes at 19:00"
│   │   └── maneuvers.ts      # Turns OSRM manoeuvres into sentences
│   ├── i18n/                 # The text, in Portuguese and English
│   │   ├── pt.ts             # The source table
│   │   ├── en.ts             # English, typed against pt.ts
│   │   └── index.ts          # Picking the language; useT() and t()
│   ├── theme.ts              # Light and dark colours
│   ├── settings.tsx          # Stored settings and the useTheme() hook
│   ├── useAppActive.ts       # Whether the app is on screen, for repeating requests
│   └── useUpdateDownload.ts  # Download and install, shared by two screens
├── App.tsx                   # Entry point: puts everything together and holds the state
├── README.md                 # The project's front page on GitHub
├── AGENTS.md                 # Points to this file
├── PRIVACY.md                # What leaves the phone, to whom; what stays
├── app.json                  # Expo config and Android permissions
├── eas.json                  # Build profiles
├── map-regions.json          # Which countries are cut for offline, and at what detail
├── transit-feeds.json        # Where each operator's GTFS comes from
├── metro.config.js           # Makes the bundler accept .pmtiles and .pbf
├── patches/                  # patch-package fixes to libraries (expo-speech's language tag)
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
  | `showPlacesOnMap` | Show businesses on the map by themselves |
  | `voiceGuidance` | Read instructions aloud while navigating |
  | `mapType` | Drawn map, satellite, transport or satellite + bus — **remembered between sessions** |
  | `satelliteDetail` | Normal (Sentinel-2) or high (DGT orthophotos in Portugal, IGN's PNOA in Spain) — **high by default** since November 2026 (author's request; switched once on existing phones, `palmmap.satelliteAltaPorDefeito`) |
  | `speedCameraAlerts` | Warn about cameras on the route |
  | `speedLimitAlerts` | Warn when over the road's limit — **off by default** (author's request) |
  | `avoidTolls` | Ask for a toll-free route |
  | `batterySaver` | Read the GPS less often far from manoeuvres |
  | `showSpeed` | Show the GPS speed |
  | `showVehicles` | Show moving buses on the transport map |
| `trails` | Marked trails over the map: off, walking, cycling or BTT (Waymarked Trails) |
  | `vehiclesRefresh` | How often they are asked for: 10, 20 (default), 30 or 60 s — author's request, November 2026; the line under it gives the data per hour (~150 KB compressed per ask) |
  | `vehiclesIdleSlowdown` | Ask for the buses a third as often (at most once a minute) with the map untouched for 90 s — **off by default** (author's request, 18 November 2026): the chosen interval always |
  | `mapsOnMobileData` | Refresh outdated country maps on mobile data too — off by default (Wi-Fi only, as before); author's request, November 2026 |
  | `transitSort` | Transport options by earliest arrival, least walking or fewest changes — chosen in the route panel |
  | `transitAvoid` | Means left out of transport options (bus, metro, train, boat) — chosen in the route panel |
  | `notifyGetOff`, `notifyParking`, `notifyUpdates`, `suggestOnOpen`, `routeHints` | The Notifications group — see "Clever features" in "Where this stands"; all on by default |
  | `paceLearning` | Learn the person's pace (5-A); off, OSRM's time as it comes and nothing is measured or stored |
  | `learnFromMovements` | Follow the person in the background to learn paces and frequent places — **off by default**, needs "Allow all the time" |

- To add a setting: add it to the `Settings` type, give it a value in `DEFAULT_SETTINGS`,
  show it in `SettingsSheet` **inside its group** **and add it to `show`** (the settings
  search; see below), with the group's name among its terms.
- **The screen is in groups** (author's request, November 2026): General (language,
  appearance, recent destinations), Map (businesses), Transit (timetables), country maps,
  Navigation, **Data and storage** (live buses and their interval with the MB per hour,
  satellite detail, `mapsOnMobileData`, and what the maps and timetables take up), About
  (updates, rating, credits). Each closed by default; the search opens those holding a match.
- **The map type is remembered between sessions**, at the author's request (November 2026):
  closing on satellite and reopening on the drawn map was the opposite of what they wanted.
  It was deliberately not stored before because of the live buses (1.1 MB every twenty
  seconds) — the author chose no brake. An unknown value falls back to the drawn map.
- **The navigation options are grouped in a collapsible "Navigation" section**
  (`Collapsible`), at the author's request: the arrival-time correction for bad roads and
  terrain (with the learned pace), voice, speed limit, cameras, tolls, speedometer and battery.
- **The route panel has a shortcut to it** (the square button next to Start and Steps,
  `onOpenNavSettings`): Settings opens with `onlyNavigation` — titled "Navigation", no
  search, no other sections, the group already open.
- **Settings has a search box** at the top (`show`, in `SettingsSheet`): it hides whatever
  does not match the text (name, hint or section, accents ignored) and opens the sections
  holding a match by themselves (`forceOpen` on `Collapsible`). A new option must go into
  `show`.
- **"Rate the app"** (`FeedbackForm`): stars and a comment, sent as a pre-filled GitHub issue
  (with the version) through the issue form `.github/ISSUE_TEMPLATE/avaliacao.yml`, which puts
  the **"avaliação" label** on it (author's request, 17 November 2026) — a form's labels apply
  whoever opens it, the `labels=` address parameter only for people allowed to label. Its
  fields are filled by id (`comentario`, `versao`). The label itself is made by
  `.github/workflows/labels.yml` (on a change to that file on `main`, or by hand) — there is no server of ours, and nothing leaves the phone until the
  person confirms there. It needs a GitHub account. **"Missing a country?"**, at the end of
  the maps list, does the same to ask for a map (`MAP_REQUEST_URL`). To receive feedback
  without a GitHub account, the way is the author's e-mail address (`mailto:`) — only with
  the author saying which.
- **"Support PalmMap"** (author's choice, 17 November 2026): donations towards goals — the
  Play Store fee and the like — instead of ads or a paid app, which the free services' terms
  (EOX's non-commercial licence, the volunteer-run OSM/FOSSGIS servers) would not allow without
  replacing them. A link in About to `DONATE_URL` (`config.ts`), **hidden while it is empty**:
  the author makes the page (Ko-fi with a goal was suggested) and gives the address.
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

1. **The learnt pace** (5-A): after one trip on those roads the arrival time counts on the
   speed really driven. There was also a manual ×1.25–×2 in Settings (`timeAdjustment`);
   **removed at the author's request, November 2026** — OSRM already slows down on `surface`,
   and the learnt pace does the rest, measured instead of guessed.
2. **Filling the tag in OpenStreetMap** where missing. Helps elsewhere, for everyone.

The factor is applied **where the time is shown** (`useEta()`), not in the service: the
`Route` keeps what OSRM answered, untouched.

### 5-A. The arrival time adapts to whoever is driving

The author asked that **the arrival time count on the speed the person really goes at.**
Two layers, in `src/utils/eta.ts` and `useEta()`:

1. **The travel mode's model.** Car and walking: what OSRM answered. Bike: OSRM's profile
   assumes **15 km/h** (`default_speed` in their `bicycle.lua`, read in their code); we count
   on **12.5 km/h**, the author's request — but **as a floor**: where OSRM already answers
   slower, it knows something about the road an average does not, and its value stays.
2. **The measured pace.** While navigating, the time the stretch covered really took is
   compared with what the route predicted. The result multiplies what is left, and is
   **stored per travel mode, and per bicycle type** (`LearnedPace`, `paceKeyFor`, in
   `settings.tsx`: `cycling-road`, `cycling-normal`, `cycling-mtb` — a slow BTT ride must not
   slow the road bike; the old shared `cycling` value is only a fallback) so the next estimate
   is born right — the one that matters is the one read **before** leaving. A setting turns
   all of this off (`paceLearning`, author's request).

Settings **shows the learned pace and has a button to forget it** — a value learned in silence that
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
- **"High" detail adds Spain's PNOA too** (IGN, CC BY 4.0, 15–25 cm aerial; see "Where this
  stands"), and both are asked as `image/vnd.jpeg-png8` so each is transparent outside its
  country.
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
- **The red pin falls into place** with a small bounce and a shadow growing on the ground
  (`DroppingPin`, in `MapView.tsx`), again each time it moves to another place; the long-press
  pin pops in (`PopIn`). Author's request ("animations on the pin appearing"). Native-driver
  `Animated` inside the `Marker`'s view, whose box is taller by `PIN_FALL` so nothing falls
  outside it.
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
| Carris de Lisboa (city buses, trams) | — | ✅ `gateway.carris.pt/gateway/gtfs/api/v2.11/GTFS` (generated, `carris-lisboa`) | ✅ vehicle positions only, GTFS-RT (`…/GTFS/realtime/vehiclepositions`) |
| Service alerts | — | — | ✅ **Carris Metropolitana `/v2/alerts`, JSON** (TML's address is 404 since November 2026) |

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
tried gave 404; do not keep guessing paths. **Since November 2026 that alerts address is 404
too**; Carris Metropolitana's `/v2/alerts` serves the same alerts in JSON.

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

Each bus is a drop in its **operator's colour** whose point turns to the service's `bearing`
(`vehicle-heading-<op>`; a plain disc, `vehicle-disc-<op>`, when none comes), a bus on it that
never turns (`vehicle-live-<op>`), and the line number in a pill underneath (`vehicle-pill-<op>`);
`<op>` is `cm` (Carris Metropolitana, yellow, dark bus and text) or `cl` (Carris de Lisboa, deep
blue, white) — the author's
pick among three drawings. All from `generate-poi-icons.py`. Those stopped at a stop are fainter. **They go over the
stops**, on purpose.


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
- **"Add stop" in the route panel** (author's report, 17 November 2026: "I have no option to
  add a stop" — the card's button was too hidden): it puts the cursor in the search with
  "Search for a stop on the way" (`choosingStop`, `stopSearchRequest`, SearchBar's
  `focusRequest`/`placeholder`), and the place chosen becomes a waypoint instead of the
  destination. Closing the search gives up. Not offered by transport.
- **When recalculating while navigating, only the waypoints still ahead go in** — going
  through the pharmacy again would mean a U-turn (`waypointIndices`).
- **Alternatives and waypoints do not mix.** OSRM can only find alternatives between two
  points; with waypoints it says "not implemented". So `alternatives=3` only goes in without
  waypoints.
- Routes not chosen are drawn **before** the chosen one, and faded: in MapLibre the order
  layers are added is the order they stack.
- The chosen route is `routeOptions[routeIndex]`; switching is only changing the index — no
  new request.
- **An alternative is tapped on the map to switch to it**, as in Maps (author's request,
  November 2026): each faded line has a wide, nearly transparent line under it to catch the
  finger (`rota-alternativa-<i>-hit`), and `onAlternativePress` hands back the `Route`.

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

**Nothing downloads without a tap, not even on Wi-Fi** (the author's request, November 2026:
"I'd rather be the one to click"). It used to start by itself on Wi-Fi and open the installer
when done; now the start-up check only shows the notice, with the button waiting
(`autoDownload={false}` on `UpdateSplash`; the prop stays in case it is ever wanted back).
In a download the person started, "Not now" disappears — closing halfway left a half file and
nobody knowing whether it updated.

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
  OpenStreetMap's; the car's speedometer rules; live buses cost ~100–150 KB per refresh (with
  the MB per hour of the chosen interval under it);
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

So **`OfflineManager.createPack()` is not used** with OpenStreetMap tiles. Not a
technical limit — a rule this project respects. The distinction to keep whenever touching
this:

> **Keeping what the person saw is a cache, and legitimate. Fetching ahead what they have not
> seen yet is bulk downloading, and is not done.**

What is done, legitimately:

- **A zoom ceiling on tiles** (`MAX_TILE_ZOOM`, 18); above it MapLibre enlarges what it has.
  It also takes about sixteen times the load off OpenStreetMap's servers.
- **A cache of what was seen**, fixed at `MAP_CACHE_MB` (250 MB), applied by
  `setMapCacheSize()`. It was a setting with a clear button until November 2026; the author
  removed it (the country maps are the offline answer). **It must not go to zero**: OSM's tile
  policy asks clients to cache instead of asking again. **No expiry can be set** — MapLibre's API takes a
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
  **A manual run with `regioes` left empty does not mean "the published ones"**: GitHub
  puts the input's default (`portugal`) in its place, and only Portugal is redone (seen
  16 November 2026). To redo everything, list the ids.

#### Keeping maps up to date

The workflow refreshes the published ones monthly, and the app refreshes the ones it has —
**only on Wi-Fi**, a decision: mainland Portugal is 325 MB — unless `mapsOnMobileData` is on
(Data and storage). `refreshOutdatedOnWifi` runs one at a time: the stored setting arriving
at start-up runs it a second time. Off Wi-Fi nothing downloads and
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

**The language tag was read wrong by `expo-speech`, patched** (author's report, November
2026: the voice was Brazilian). Its Android `speakOut` built the locale with
`Locale("pt-PT")` — the Java constructor takes the whole tag as a language code, `pt-pt`,
which the engine does not know, and Google's TTS fell back to its default Portuguese,
Brazil's. `patches/expo-speech+57.0.1.patch` changes it to `Locale.forLanguageTag`;
`patch-package` applies it on every `npm install`/`npm ci` (the `postinstall` script). **When
upgrading `expo-speech`, check the patch still applies** — `patch-package` fails the install
otherwise. The phone still needs the Portugal voice installed in Google's TTS.

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
- **The gesture is on the handle and the header, never the whole panel**, otherwise dragging
  the stops list pulled the panel down. That is why `DraggableSheet` hands the gestures through
  a function (`children(dragHandlers, headerHandlers)`).
- **The header drags too** (author's report, November 2026: the bar alone was too small a
  target): `headerHandlers` never claim a touch at its start, so a tap on a button or the title
  stays a tap; only a clearly vertical move (`HEADER_DRAG_MIN`, 8 pt, 1.5× more vertical than
  sideways) takes over. Every bottom panel spreads it on its `header` (the trip's `banner`).
- The touch area around the handle is much bigger than it (16 pt above, 10 below, full width).
- **The screens that open over the map close when pulled down by their header**
  (`useSwipeToClose`): layers, Saved, Transit, alerts, Directions, Settings and the steps list.
  They follow the finger and spring back short of `CLOSE_AT` (90 pt) unless flicked.
  Those `Modal`s are `transparent` (their root has the background), so the gap a pull opens
  shows the map, not a blank band; the pull is reset while rendering on reopening, not in an
  effect, which ran after the first frame.
- **`Reveal` uses `pointerEvents="box-none"`**, so taps reach the map under a shrunk panel.
- The animation runs natively (`useNativeDriver`).

### 12. Light and dark theme

- All colours are in `src/theme.ts`, in two palettes. No component writes a colour by hand —
  ask the theme with `useTheme()`, from `src/settings.tsx`. (The street view's photo viewer —
  dark whatever the theme, its `VIEWER` table — and a label's white icon, `LABEL_INK`, are
  exceptions too. The map's own drawings — the blue
  dot, the cone — are the exceptions, as in every maps app.)
- Which palette: "automatic" follows the phone, otherwise the person's choice.
- Styles are a function of the theme: `makeStyles(theme)` at the end of the file, with `useMemo`.
- `app.json` has `userInterfaceStyle: "automatic"`; without `expo-system-ui` it does not work
  on Android.
- The map changes too: in dark, **the same OpenStreetMap tiles, inverted by MapLibre**
  (`DARK_PAINT`, in `tiles.ts`: `raster-brightness-min` above `-max` inverts, `raster-hue-rotate`
  180 puts the colours back). It was CARTO's "dark matter" until November 2026, when their
  tiles started coming back stamped **"API KEY REQUIRED"** — seen on a phone without them in
  cache, invisible on one with. No new service, and light and dark share the cache.

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
  recogniser (`RECOGNIZE_SPEECH`) — no new library or key — and what was heard is searched at
  once, as with Enter. See `voiceInput.ts`. **It goes through our own small native module,
  `modules/palmmap-voice`** (Kotlin, autolinked from `./modules`, built by `expo prebuild`
  like the rest), not `expo-intent-launcher`: that one hands the whole result Bundle to
  JavaScript, and when Google's recogniser did not understand, converting its extras failed
  in a native callback and **closed the app** (author's report, November 2026). The module
  reads only `EXTRA_RESULTS`, inside a `try`. `expo-intent-launcher` stays for the updater
  and as the fallback when the module is missing. JavaScript cannot ask Android whether a recogniser exists without a new
  library, so it is learnt: the first time the screen fails to open, it is stored
  (`palmmap.semReconhecimentoVoz`) and **the microphone never shows again** on that phone (the
  author's request). Practically every Android phone has one (the Google app's).
- Reverse geocoding (coordinates → address), for the dropped pin, goes through the same queue
  and cache. If it fails, the pin stays, without an address.

### Overpass — businesses and points of interest

The heaviest of the services: each query makes the server walk OpenStreetMap's data.

- **Since November 2026, Overpass is only asked by the category buttons, a tapped pin's
  details (`placeDetails`) and doors (`findEntrances`, cached per place), the speed cameras
  and the speed limits.** Automatic pins come from
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
- **A fresh-install probe** (`sondar: fresh_install`, November 2026) asks every outside
  service as a phone with nothing cached would — the CARTO "API KEY REQUIRED" stamp only showed
  on such phones. Everything answered with real content except Overpass: on 11 November, from
  GitHub Actions, **every** public server (`overpass-api.de`, `private.coffee`, `kumi.systems`,
  `mail.ru`, `osm.jp`; `sondar: overpass_mirrors`) timed out or refused. Not the app; no
  mirror was added. Rerun both probes after touching any service address.

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
- **A route too long for its mode is refused before asking** (`ROUTE_MAX_KM`, straight line:
  walking 200 km, bike 600, car 4000), and alternatives stop past `ALTERNATIVES_MAX_KM`
  (1000). A bike to the Taklamakan (~9000 km) answered with so many points and steps that
  parsing and drawing them froze the phone until Android closed the app.
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

### OpenStreetMap notes — "Report" on a place

- `POST https://api.openstreetmap.org/api/0.6/notes.json` with `lat`, `lon`, `text`
  (`osmNotes.ts`), **anonymous**. Only a person's tap on "Send" sends one: nothing automatic,
  no retries, no bulk. The `User-Agent` goes with it. Notes are public; no name, e-mail or
  account goes in them.
- **Never probe it by sending** — a test note is a real note someone has to close.

### Open-Meteo — rain at the destination

- Free for non-commercial use, no key, CC BY 4.0: the credit is in Settings → About and stays.
- One small request per destination and arrival hour, cached 30 min; only the place rounded to
  two decimals (~1 km) goes out. Nothing is asked in the background.

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
- **An export can give the same object twice.** Geofabrik's GeoJSON (osmium) has every closed
  way as the way (`w123`) **and** as its area (`a246`: a way's area is 2 × id, a relation's
  2 × id + 1), with centres a few metres apart: 50,625 of mainland Portugal's 218,642 business
  records were such twins, and the map showed "Parque da Biblioteca" twice. `build-pois.py`
  now drops the way when its area exists, and `localPlacesInBounds` keeps one of the same name
  and kind within `SAME_PLACE_M` (150 m) for files already on phones.
- **Every `<Layer>` inside a source carries `key` equal to its `id`.** MapLibre RN's sources
  drop `null` children (`filter(child => !!child)`) before `Children.map`, so a conditional
  layer that disappears shifts the next ones up a slot; React then reuses the element with
  another `id`, and `useFrozenId` throws "`id` cannot be changed" — a red screen. It happened
  with the compass cone (it hides while following) moving the blue dot onto its slot. A key
  keeps each layer its own element.
- **A library that hands a whole Android result to JavaScript can crash on extras it cannot
  convert** — natively, past every `try`. When another app's result is involved (Google's
  speech recogniser), read only the field needed, natively (`modules/palmmap-voice`).
- **An index built object by object costs more than the file it indexes.** A timetable's
  per-trip index was millions of small objects, four times `JSON.parse` itself. Index the
  shared shape (the pattern) and expand on demand; and judge which files are needed before
  reading them.
- **`GeoJSONSource` turns an object `data` into text on every render.** Hand it a string
  built in a `useMemo`, and keep the lists it is built from stable — a `= []` default or a
  `.filter()` in the parent's JSX is a new array each time and undoes the memo.
- **Fast-changing state belongs in the smallest component that shows it.** The compass in
  `App` redrew every panel several times a second.
- **An identifier can arrive in a different unit after the provider changes.** TML sends
  `timestamp` in milliseconds where Carris sent seconds; every bus was "from the future".

