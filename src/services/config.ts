/**
 * Configuration shared by all the external services.
 *
 * This is the "single place" CLAUDE.md refers to: base URLs, User-Agent and the
 * minimum interval between requests all live here. If one of these rules has
 * to change, it changes here and not scattered across the code.
 */

/**
 * Nominatim requires a User-Agent that identifies who is making the requests.
 * Anonymous requests are refused. If this project changes owner or address,
 * update this line.
 */
/** Where someone asks for a country map that is not published yet: a pre-filled GitHub issue. */
export const MAP_REQUEST_URL =
  'https://github.com/choso08/PalmMap/issues/new?title=Map%20request%3A%20';

/** The feedback form's destination: a new GitHub issue, filled in by the app. */
export const FEEDBACK_URL = 'https://github.com/choso08/PalmMap/issues/new';

export const USER_AGENT = 'PalmMap/1.0 (personal project; https://github.com/choso08/PalmMap)';

/** Address search. */
export const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

/**
 * The search's fallback, for when Nominatim refuses or does not answer.
 *
 * Photon is by Komoot, built on the same OpenStreetMap data, open and with no
 * key. Their rules ask for a reasonable number of requests; so it is only asked
 * **after** Nominatim fails, and at the same pace of one request per second.
 * **It has not been tried** from the development environment, which blocks
 * both.
 */
export const PHOTON_BASE_URL = 'https://photon.komoot.io';

/**
 * How long to wait for Nominatim during a search before giving up on it.
 *
 * Shorter than `REQUEST_TIMEOUT_MS` because there is someone else to ask
 * afterwards: fifteen seconds staring at a spinner, and only then going to
 * Photon, made the search look broken even when it did end up answering.
 */
export const SEARCH_TIMEOUT_MS = 7000;

/**
 * Route calculation, one address per travel mode.
 *
 * **Why it is not `router.project-osrm.org`.** That is OSRM's demo server and
 * it only has the car profile installed. Asking it for a walking route still
 * returned the car route — with one-way streets respected, which makes no sense
 * on foot, and with the time calculated at car speed. It was seen: 719 metres
 * on foot came out as "2 minutes".
 *
 * These are the FOSSGIS servers, the same ones openstreetmap.org uses in its
 * own directions panel. They are three separate installations, each with its
 * own profile — which is why the travel mode is in the base address and not
 * only in the path.
 *
 * It has to be https:// — Android has blocked insecure connections since
 * version 9.
 *
 * The terms of use ask for at most one request per second, a valid
 * `User-Agent` and attribution to OpenStreetMap and OSRM. All of it is done:
 * the queue in `osrm.ts`, the `USER_AGENT` above and the credits on the
 * settings screen.
 */
/**
 * FOSSGIS's Valhalla, the other engine behind openstreetmap.org's directions.
 * Used for bicycles, because it knows the type of bike — see `valhalla.ts`.
 */
export const VALHALLA_URL = 'https://valhalla1.openstreetmap.de';

export const OSRM_ENDPOINTS = {
  driving: 'https://routing.openstreetmap.de/routed-car',
  walking: 'https://routing.openstreetmap.de/routed-foot',
  cycling: 'https://routing.openstreetmap.de/routed-bike',
} as const;

/**
 * The profile name in the request path: **always `driving`**.
 *
 * It looks wrong and it isn't. OSRM ignores this segment of the address — the
 * real profile is the installation's, chosen by the `routed-car`/`routed-foot`/
 * `routed-bike` in the base address. This was confirmed in openstreetmap.org's
 * own code, which sends `routed-foot/route/v1/driving/…` for walking routes.
 * The same form is used because it is the one proven in production.
 */
export const OSRM_PROFILE_PATH = {
  driving: 'driving',
  walking: 'driving',
  cycling: 'driving',
} as const;

/**
 * Minimum interval between route requests, in milliseconds.
 * FOSSGIS's terms of use ask for at most one per second.
 */
export const OSRM_MIN_INTERVAL_MS = 1000;

/**
 * Querying businesses and points of interest.
 * It is what lets the app ask "which restaurants are around here?".
 */
export const OVERPASS_BASE_URL = 'https://overpass-api.de/api/interpreter';

/**
 * The second Overpass server, for when the first one refuses.
 *
 * `overpass-api.de` is the main server and is often overloaded: it answers 429
 * or 504, or a 200 with a `remark` saying the query did not fit. In those
 * cases the pins for the new area simply did not come. This is one of the
 * public instances listed on the Overpass page of the OpenStreetMap wiki, with
 * the same data and no key.
 *
 * **It is only used when the main one fails**, never both at once: asking two
 * servers to keep the fastest answer would spend twice the volunteers'
 * resources to save a second. **It could not be tried from the development
 * environment** (which blocks both); if it ever disappears, the failure is the
 * same one there was without it.
 */
export const OVERPASS_FALLBACK_URL = 'https://overpass.private.coffee/api/interpreter';

/**
 * Public transport arrival times.
 *
 * It is Carris Metropolitana's open API, the same one their official app uses.
 * It covers the Lisbon Metropolitan Area and needs no key at all. Outside that
 * area there is no open equivalent — see `src/services/transit.ts`.
 */
export const CARRIS_BASE_URL = 'https://api.carrismetropolitana.pt/v2';

/**
 * Minimum interval between requests to Nominatim, in milliseconds.
 * The public service allows at most 1 request per second.
 */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

/**
 * Minimum interval between requests to Carris Metropolitana.
 *
 * There is no published limit. Three hundred milliseconds is just over three
 * requests per second — well below what their own official app does, and
 * polite enough for a service that asks nothing of us in return.
 *
 * It was lowered from one second because of trip planning: that needs the
 * times for half a dozen stops at once, and at one request per second it was
 * six seconds staring at a spinner. Since September 2026 the requests also go
 * out in parallel — see `overlap`, in `rateLimit.ts`.
 */
export const CARRIS_MIN_INTERVAL_MS = 300;

/**
 * How long to wait for the list of stops, which is the heaviest response the
 * app depends on.
 *
 * **The fifteen seconds used for everything else are not enough here.** It is
 * thousands of stops, with name, locality, lines and connections to other
 * modes — megabytes of JSON, to download and then to parse, on a phone. On
 * Wi-Fi it goes unnoticed; on mobile data it sits right on the limit, and there
 * it fails some times and not others, with nothing to tell it apart from the
 * service being down.
 *
 * It is requested once per session, so waiting a minute costs nobody
 * anything: what the person sees is the spinner turning a little longer,
 * instead of an error saying there is no transport.
 */
export const CARRIS_STOPS_TIMEOUT_MS = 60000;

/**
 * How far one is willing to walk to catch the bus, in metres.
 *
 * A kilometre is about twelve minutes at a normal pace. Beyond that, someone
 * walking that far would rather walk the whole way.
 */
export const TRANSIT_WALK_MAX_M = 1000;

/**
 * Walking speed, in metres per second.
 *
 * 1.35 m/s is about 4.9 km/h, an adult's normal pace. It is the same value
 * OSRM's pedestrian profile uses.
 */
export const WALK_SPEED_MS = 1.35;

/**
 * How much is added to the straight-line distance to get the real one.
 *
 * Between two points in a city one always walks more than the straight line,
 * because there are blocks in between. A third more is the usual approximation
 * — and it is enough, because this only serves to rank options and to say
 * "five minutes' walk".
 */
export const WALK_DETOUR = 1.3;

/**
 * How often the arrival times are requested again while the panel is open.
 * Thirty seconds is enough for the number of minutes to stay right without
 * requesting for nothing.
 */
export const ARRIVALS_REFRESH_MS = 30000;

/**
 * At most how long ago a bus can have reported in for it to still count as
 * moving.
 *
 * **This is what makes the feature worth anything.** The service returns the
 * whole fleet with each vehicle's last known position, not just the ones that
 * are moving. Measured in the small hours: 1550 vehicles with a position,
 * median age nine hours, the worst twelve days — almost all parked in depots.
 *
 * Two minutes is generous for a position that usually comes every thirty
 * seconds, and tight enough to leave out everything that is parked.
 */
export const VEHICLE_MAX_AGE_S = 120;

/**
 * How often the bus positions are requested again.
 *
 * Twenty seconds is the compromise: faster brings no new positions, because
 * that is roughly the rate at which the buses report them, and slower made them
 * look like they were jumping rather than moving.
 */
export const VEHICLES_REFRESH_MS = 20000;

/**
 * Minimum zoom for showing the moving buses.
 *
 * **The main reason is weight, not the screen.** The response is the whole
 * fleet — 1.1 MB, with no way to ask for less, because there is no filter by
 * area or by line. It is this app's heaviest request, and it should not be
 * repeating while one is looking at the whole country.
 */
export const VEHICLES_MIN_ZOOM = 12;

/**
 * From which zoom every stop in view is drawn on the transport map, ready to
 * be tapped. Further out they would be hundreds of dots on top of each other.
 */
export const STOPS_MAP_MIN_ZOOM = 15;

/**
 * The navigation banner shows the manoeuvre after the next one ("Then") only
 * when the two are at most this far apart — a roundabout straight after a turn.
 */
export const THEN_MAX_METERS = 400;

/**
 * Minimum interval between requests to Overpass.
 * It is a shared service and heavy to run — it pays to be generous here.
 */
export const OVERPASS_MIN_INTERVAL_MS = 2000;

/**
 * How long to wait after the map stops moving before fetching the businesses
 * in view. Avoids one request per finger drag.
 */
export const MAP_PINS_DEBOUNCE_MS = 1200;

/**
 * Zoom level from which businesses are shown on the map.
 * Further out than this, the area is huge and the request would be extremely
 * heavy, returning pins that could not even be told apart on screen.
 */
export const MAP_PINS_MIN_ZOOM = 15;

/**
 * Maximum number of businesses requested **per tag group**.
 *
 * **Not per query, and that difference was the bug.** Overpass had a single
 * `out` at the end of a union of several groups — restaurants and the like,
 * then shops, then accommodation — and the limit applied to the whole. It
 * fills the quota in group order and, within each group, **by OpenStreetMap
 * id**, which has nothing to do with where things are. In a busy area, all 80
 * places went to the first group, picked from one side of the requested area
 * to the other: no shops came at all, and the restaurants came as eighty spread
 * across the query's kilometres, most of them outside what was on screen. The
 * screen was left without pins **with no error at all** — and in an empty area
 * everything showed, which made it look like it sometimes worked.
 *
 * Today each group has its own `out`, and this number is how many each one may
 * bring. See `searchInBounds`.
 *
 * **Forty and not a hundred, and that is about waiting time.** With three
 * groups, a hundred each is three hundred places per query: three hundred tag
 * sets to resolve on Overpass's side, a few hundred kilobytes to download and
 * three hundred symbols to draw on the map. In a half-kilometre square, a
 * hundred and twenty pins is already more than fits on screen without them
 * covering each other — anything beyond that is work done not to be seen.
 */
export const MAP_PINS_LIMIT = 40;

/**
 * The grid the automatic-pin area snaps to, in degrees.
 *
 * **This is what makes the cache good for anything.** The cache key is the
 * requested area, with four decimal places — that is, to the metre. Without a
 * grid, dragging the finger a little gave a different area, a different key
 * and **a new request to Overpass**, the heaviest of the three services and one
 * run by volunteers. The cache existed and almost never hit.
 *
 * With the grid, every view that falls in the same square shares the same
 * request. A little more than what is seen is requested, and in return moving
 * around the same area stops requesting anything.
 *
 * **The square cannot be much bigger than the screen.** Everything requested
 * beyond it is places that won't be seen and that still take up room in the
 * response's limit — see `MAP_PINS_LIMIT`. 0.005° is about 550 metres, which
 * adds at most one square on each side to what is in view. It used to be
 * double this and requested an area four times the screen's.
 */
export const MAP_PINS_GRID_DEG = 0.005;

/** Radius, in metres, of category searches ("restaurants near me"). */
export const CATEGORY_SEARCH_RADIUS_M = 1500;

/**
 * Minimum zoom for the category buttons to work.
 *
 * Further out than this, the visible area is tens of kilometres: the query
 * would be extremely heavy and return thousands of results that could not even
 * be told apart on screen. Below this zoom a notice asks the person to zoom in,
 * instead of making the request.
 */
export const CATEGORY_MIN_ZOOM = 12;

/** Distance at which the person is considered to have left the route, in metres. */
export const OFF_ROUTE_METERS = 60;

/**
 * How many consecutive readings off the route before recalculating.
 *
 * During navigation the position is read once a second, so this is eight
 * seconds in a row travelling away from the line. It used to be three, and it
 * recalculated on its own in the middle of a trip: three seconds of bad signal
 * — a short tunnel, a flyover, a narrow street between buildings — were enough.
 *
 * The accuracy the GPS reports also counts, in `App.tsx`: a reading known to be
 * imprecise cannot be used to claim one has left the route.
 */
export const OFF_ROUTE_STRIKES = 8;

/** Distance to the destination at which one is considered to have arrived. */
export const ARRIVAL_METERS = 35;

/**
 * How far from the route line a speed camera still counts as being "on this
 * route".
 *
 * The query brings everything in the route's rectangle, including cameras on
 * parallel roads and on the motorway running alongside. Warning about those is
 * worse than not warning: after twice, nobody pays attention to the warning.
 */
export const CAMERA_CORRIDOR_M = 40;

/**
 * How far ahead a speed camera is announced, in metres.
 *
 * Three hundred metres at 90 km/h is twelve seconds — enough to glance at the
 * speedometer and slow down without braking hard.
 */
export const CAMERA_WARN_METERS = 300;

/**
 * Battery saver: every how many milliseconds the GPS is read while the next
 * manoeuvre is still far away.
 *
 * Every second, the GPS is what drains the most on a long trip. On a straight
 * motorway, reading four times less changes nothing on screen — the remaining
 * time stays right and the next manoeuvre is ten kilometres away.
 */
export const BATTERY_SAVER_INTERVAL_MS = 4000;

/**
 * From what distance to the next manoeuvre the readings may slow down.
 *
 * Below this it goes back to every second, because that is where the position
 * has to be right: it decides whether the turn warning comes in time.
 */
export const BATTERY_SAVER_MIN_METERS = 1500;

/** Distances at which the next manoeuvre is announced, in metres. */
export const ANNOUNCE_AT_METERS = [400, 80];

/**
 * From what age a position stops being good enough to centre the map on.
 *
 * Outside navigation the GPS is read every ten seconds, and only when the
 * person moves — standing still, much longer can pass without any reading, and
 * that is normal. **With the app in the background, Android cuts the readings
 * off entirely**, and that is where this matters: someone who moved about with
 * the app closed comes back with a position from where they were before. Past
 * this age, a new one is fetched instead of trusting the stored one.
 */
export const POSITION_FRESH_MS = 20000;

/**
 * How long to wait for a new position before giving up on it.
 *
 * Without network, the GPS can take minutes to give the first position —
 * waiting for it with the button pressed would leave the app looking stuck.
 * After this, whatever is available is used.
 */
export const POSITION_TIMEOUT_MS = 4000;

/**
 * The maximum age the last known position may have to be used at start-up.
 *
 * The shortcut exists so there is something on screen straight away while the
 * GPS wakes up, and that still holds. But with no limit at all it served a
 * position from yesterday: someone who used the app at home and opens it at
 * work would see the map open at home, with complete confidence.
 */
export const LAST_KNOWN_MAX_AGE_MS = 120000;

/**
 * Speed from which one is assumed to be driving, in metres per second.
 *
 * Five metres per second is 18 km/h — above anyone's walking pace and almost
 * any bike going uphill. It is what turns on the speedometer outside
 * navigation and speeds up the GPS readings.
 */
export const DRIVING_SPEED_MS = 5;

/**
 * Speed below which one stops being assumed to be driving.
 *
 * **Deliberately different from the one above**, for the same reason as the
 * battery saver's brake: changing pace means re-subscribing to the GPS, and
 * with a single threshold it would switch on and off at every traffic light.
 * Two metres per second is 7 km/h.
 */
export const DRIVING_STOP_MS = 2;

/**
 * How long one stays "driving" after the speed drops.
 *
 * **Without this, the speedometer disappeared at every traffic light** and came
 * back on pulling away. A speedometer shows zero when you stop — it does not
 * hide. A minute and a half comfortably covers a traffic light, a queue or a
 * stop to drop someone off, and it still switches off shortly after parking.
 *
 * The cost is reading the GPS quickly for another minute and a half after
 * stopping, which does not show on the battery.
 */
export const DRIVING_LINGER_MS = 90000;

/**
 * How often the GPS is read while driving, outside navigation.
 *
 * Normal tracking is every ten seconds, plenty for the blue dot to follow
 * someone walking. For a speedometer it is not enough: at 90 km/h, ten seconds
 * is two hundred and fifty metres, and the number showed the speed from a block
 * ago. Two seconds give a number that reads like a speedometer.
 *
 * **It only happens when moving fast with the speedometer on.** Standing still
 * or walking, it goes back to ten seconds.
 */
export const DRIVING_GPS_INTERVAL_MS = 2000;

/**
 * Up to how many milliseconds between two taps they still count as a double
 * tap.
 *
 * Three hundred is the value Android itself uses for double tap. It is best not
 * lowered: people with less dexterity in their fingers stop being able to hit
 * it, and the second tap starts counting as a single tap — which does
 * something else here.
 */
export const DOUBLE_TAP_MS = 300;

/**
 * A note about the speed, so nobody touches it again without thinking.
 *
 * **It goes to the screen as the GPS gave it, with no minimum and no rounding
 * to zero.** There used to be a threshold here that showed zero below half a
 * metre per second, so the number would not flicker between 0 and 2 km/h with
 * the car stopped. The author asked for the opposite, and is right: a
 * speedometer that lies a little when stopped is a speedometer one believes a
 * little less when moving. What the receiver measures through the Doppler
 * effect is what is shown.
 *
 * The only thing that still isn't a number is `null`: when Android cannot tell
 * the speed — in a tunnel, for instance — the speedometer disappears instead
 * of saying zero.
 */

/**
 * How far over the limit one can go before the speedometer turns red, in km/h.
 *
 * It is not leniency: it is the speedometer's own margin. GPS speed has a few
 * km/h of uncertainty, and a warning that lights up exactly at the limit would
 * light up on its own at a constant speed — and a warning that lights up for
 * no reason stops being read.
 */
export const SPEED_OVER_LIMIT_KMH = 5;

/** The spoken over-the-limit warning is said at most once in this long. */
export const LIMIT_WARNING_EVERY_MS = 60000;

/** How much of the route each speed-limit request to Overpass covers. */
export const LIMITS_WINDOW_M = 80000;

/** How far from the route a way may be and still be the road being driven. */
export const LIMITS_MATCH_M = 25;

/** The next window of limits is asked for when this little is left of the current one. */
export const LIMITS_REFETCH_M = 10000;

/** After a failed limits request, wait this long before asking again. */
export const LIMITS_RETRY_MS = 120000;

/** The limits request runs in the background, so it may wait longer than the rest. */
export const LIMITS_TIMEOUT_MS = 60000;

/**
 * Cycling speed, in metres per second. It is 12.5 km/h.
 *
 * OSRM assumes **15 km/h** for a bike (the `default_speed` of the
 * `bicycle.lua` profile, confirmed in their code), capped at 21. That is the
 * speed of a serious cyclist; not of someone riding to work, with traffic
 * lights, pavements and a backpack. Hence this value, requested by the author.
 *
 * **It is a floor, not a replacement:** where OSRM already answers slower — a
 * climb where the bike is pushed, a path with steps — its figure stands, since
 * it knows something about the road that this number does not. See
 * `modelSeconds`.
 */
export const CYCLING_SPEED_MS = 12.5 / 3.6;

/**
 * How long one must travel before the measured pace is worth anything.
 *
 * In the first metres the pace measures nothing: a traffic light outside the
 * front door gave a factor of five and the arrival time jumped to double.
 * Three minutes is enough for the arithmetic to stop being about a traffic
 * light and start being about the trip.
 */
export const PACE_MIN_MS = 180000;

/**
 * And how many metres, for the same reason seen from the other side: three
 * minutes stopped at a level crossing say nothing about the rest of the way.
 */
export const PACE_MIN_METERS = 500;

/** The most the measured pace can stretch the estimated time. */
export const PACE_MAX = 3;

/** And the least it can shrink it, outside the car. */
export const PACE_MIN = 0.5;

/**
 * The floor of the driving factor, and it is a decision, not a number picked
 * at random.
 *
 * **The app does not promise an arrival time that requires exceeding the
 * limit.** OSRM already computes the time at **the speed limit times 0.8**
 * where the limit is tagged in OpenStreetMap (the `speed_reduction` in their
 * `car.lua`), and below that where it is not — 90 on a motorway, 55 on a
 * secondary road. That is, its time is already that of someone driving at the
 * limit or a little under, which is what the author asked for.
 *
 * Without this floor, someone who drives fast would teach the app to count on
 * it, and the arrival time would only work out by breaking the limits. The
 * measured pace can widen the time as much as it likes — what it cannot do is
 * shrink it.
 */
export const PACE_MIN_DRIVING = 1;

/**
 * How much of this trip's pace goes into what is stored for the next one.
 *
 * A third: one odd trip — a rainy day, an unusual queue — moves the stored
 * value without turning it upside down, and three or four similar trips are
 * enough to really change it.
 */
export const PACE_LEARN_WEIGHT = 0.3;

/**
 * Name of the request that keeps the screen on during navigation.
 *
 * It has to always be the same to switch it on and off: Android counts the
 * requests by name, and one left unreleased would keep the screen on forever.
 * The value stays in Portuguese because it is a runtime name, not text.
 */
export const KEEP_AWAKE_TAG = 'palmmap-navegacao';

/**
 * The name Android knows the task that receives positions while navigating
 * by.
 *
 * **It has to always be the same**, and it is by this name that the foreground
 * service is switched on and off. Changing it between versions would leave the
 * old service running, with a notification the new app no longer knows how to
 * switch off — which is why the value stays in Portuguese.
 */
export const NAVIGATION_TASK = 'palmmap-navegacao-posicao';

/**
 * How long the navigation service stays alive after the subscription is
 * dropped.
 *
 * **It is not excess slack: it is what stops navigation dying in the pocket.**
 * The effect that follows the position runs again whenever the route, the
 * speed cameras or the GPS pace change, and each time it drops the subscription
 * and makes another. And Android **only lets a foreground service start with
 * the app in front** — with the screen locked, stopping and starting again
 * ended in an exception and the trip was left without a position, exactly when
 * only the voice is guiding.
 *
 * Two seconds comfortably cover a subscription swap and are too short for
 * anyone to notice the notification lingering a little.
 */
export const SERVICE_STOP_GRACE_MS = 2000;

/**
 * How long to wait after the person stops typing, before searching.
 * Nominatim forbids searching on every keystroke, so this value must not be
 * reduced without fully understanding what is being done.
 */
export const SEARCH_DEBOUNCE_MS = 1000;

/**
 * The farthest a route is asked for, per travel mode, in straight-line km.
 *
 * A bicycle from Monte da Caparica to the Taklamakan desert (the author's test,
 * November 2026) is some 9000 km: hundreds of thousands of points and thousands
 * of steps, times four with the alternatives. Parsing and drawing that froze
 * the phone until Android closed the app. Nobody walks 200 km in one go, and a
 * route this long is planned in stages anyway; past these the panel says the
 * place is too far for that mode, and nothing is asked.
 */
export const ROUTE_MAX_KM = { walking: 200, cycling: 600, driving: 4000 } as const;

/** Past this straight-line distance, no alternative routes: each one is the
 * whole route again, and far apart they are rarely what anyone compares. */
export const ALTERNATIVES_MAX_KM = 1000;

/** Maximum time waiting for a response, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 15000;

/**
 * Where the app finds out whether there is a new version.
 *
 * It is GitHub's public API, and **it answers without any key** because the
 * repository is public — which is no accident: it is the same decision that
 * lets the countries' maps be downloaded from an address without
 * authentication. See the note about the repository being public, in
 * `CLAUDE.md`.
 *
 * **`/releases/latest` is not used, and the reason is a trap.** That address
 * returns the most recently published Release, **whichever it is** — and in
 * this repository Releases are not only APKs: the country maps are under the
 * `mapas` tag and the timetables under `horarios`. Generating maps after a
 * build was enough for "latest" to become the maps Release, and the version
 * check would stop finding anything at all. With no error: it answered 200,
 * with a real Release that just wasn't the one that mattered.
 *
 * So the list is requested and the highest-numbered `apk-*` is picked. Twenty
 * is plenty: the other tags are always the same four, because each run of
 * those workflows rewrites its own instead of creating a new one.
 */
export const RELEASES_API_URL =
  'https://api.github.com/repos/choso08/PalmMap/releases?per_page=20';

/**
 * How long has to pass between two automatic checks for a new version.
 *
 * **It checks on every start-up**, which is what the author asked for: opening
 * the app is the moment when updating interrupts nothing. It used to be once a
 * day, which meant opening the app in the morning, a version coming out in the
 * afternoon and only noticing it the next day.
 *
 * The quarter of an hour is only a brake against nonsense. GitHub's API gives
 * 60 requests an hour to anyone not identifying with a key, counted **per IP
 * address** — shared with everything on the same network. Opening and closing
 * the app six times in a row, which does happen, cannot be worth six requests.
 *
 * Checking by hand, with the button in the settings, does not go through this
 * — whoever presses it wants to know now.
 */
export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Place photos (`services/photos.ts`). Panoramax is the open street-level
 * photo service (OSM France and IGN), no key; Commons thumbnails are asked at
 * this width — plenty for a card, a fraction of the original's weight.
 */
export const PANORAMAX_URL = 'https://api.panoramax.xyz/api';
export const PHOTO_WIDTH = 640;
/** How near a street-level picture must be to stand in for a place's own photo. */
export const PHOTO_NEARBY_M = 25;
