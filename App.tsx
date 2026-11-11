import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  AppState,
  type LayoutChangeEvent,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';

import { CategoryBar } from './src/components/CategoryBar';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { SpeedBadge } from './src/components/SpeedBadge';
import { UpdateSplash } from './src/components/UpdateSplash';
import {
  checkForUpdate,
  forgetInstallAttempt,
  unfinishedInstall,
  type UpdateInfo,
} from './src/services/update';
import { guarded, installCrashHandler } from './src/services/crash';

/** When a new version was last looked for. See the effect that uses it. */
const UPDATE_CHECK_KEY = 'palmmap.ultimaProcuraDeVersao';

/**
 * The version that was dismissed, so the notice does not come back.
 *
 * The **number** of the postponed build is stored, not a yes-or-no: the notice
 * goes quiet for that version and speaks again when the next one comes out,
 * which is the behaviour wanted. A notice that reappears at every start stops
 * being read after two days — the same lesson as the camera warnings.
 */
const UPDATE_DISMISSED_KEY = 'palmmap.versaoAdiada';
import { MapView, type MapViewRef } from './src/components/MapView';
import { NavigationPanel } from './src/components/NavigationPanel';
import { PlaceSheet } from './src/components/PlaceSheet';
import { RoutePanel } from './src/components/RoutePanel';
import { SearchBar } from './src/components/SearchBar';
import { SettingsSheet } from './src/components/SettingsSheet';
import { DraggableSheet } from './src/components/DraggableSheet';
import { Reveal } from './src/components/Reveal';
import { MeasureSheet, type MeasureMode } from './src/components/MeasureSheet';
import { BottomTabs, TAB_BAR_HEIGHT, type Tab } from './src/components/BottomTabs';
import { DirectionsSheet } from './src/components/DirectionsSheet';
import { LayersSheet } from './src/components/LayersSheet';
import { SavedSheet } from './src/components/SavedSheet';
import { StepsList } from './src/components/StepsList';
import { TransitSheet } from './src/components/TransitSheet';
import {
  ANNOUNCE_AT_METERS,
  ARRIVAL_METERS,
  BATTERY_SAVER_INTERVAL_MS,
  BATTERY_SAVER_MIN_METERS,
  CAMERA_WARN_METERS,
  CATEGORY_MIN_ZOOM,
  DOUBLE_TAP_MS,
  KEEP_AWAKE_TAG,
  LIMITS_REFETCH_M,
  LIMITS_RETRY_MS,
  LIMIT_WARNING_EVERY_MS,
  SPEED_OVER_LIMIT_KMH,
  THEN_MAX_METERS,
  MAP_PINS_DEBOUNCE_MS,
  VEHICLES_MIN_ZOOM,
  STOPS_MAP_MIN_ZOOM,
  VEHICLES_REFRESH_MS,
  MAP_PINS_MIN_ZOOM,
  OFF_ROUTE_METERS,
  DRIVING_GPS_INTERVAL_MS,
  DRIVING_LINGER_MS,
  DRIVING_SPEED_MS,
  DRIVING_STOP_MS,
  OFF_ROUTE_STRIKES,
  PACE_MIN_METERS,
  PACE_MIN_MS,
  UPDATE_CHECK_INTERVAL_MS,
} from './src/services/config';
import {
  cameraIcon,
  cameraLabel,
  camerasAlongRoute,
  type SpeedCamera,
} from './src/services/cameras';
import { isSamePlace, loadFavourites, saveFavourites } from './src/services/favourites';
import { loadRecents, rememberRecent } from './src/services/recents';
import {
  getBestPosition,
  getCurrentPosition,
  getFreshPosition,
  requestPermission,
  watchPosition,
  watchPositionIdle,
} from './src/services/location';
import {
  installBundledAssets,
  installedRegions,
  type OfflineRegion,
  refreshOutdatedOnWifi,} from './src/services/offlineMap';
import { reverseGeocode, searchPlaces } from './src/services/nominatim';
import { parseGeoLink } from './src/utils/geoLink';
import { RouteError, getDuration, getRoutes } from './src/services/osrm';
import {
  placeDetails,
  searchCategoryInBounds,
} from './src/services/overpass';
import {
  ensureFeedsFor,
  planScheduledTransfers,
  planScheduledTrips,
} from './src/services/schedules';
import { ALL_BUSINESSES, localPlacesInBounds, poisRegionFor } from './src/services/localPois';
import { liveVehicles, type LiveVehicle } from './src/services/vehicles';
import { configureTileRequests, setMapCacheSize } from './src/services/tiles';
import {
  nearbyStations,
  nearbyStops,
  stopsInBounds,
  planBusTrips,
  type TransitTrip,
  type TransitStation,
  type TransitStop,
} from './src/services/transit';
import {
  SettingsProvider,
  cacheMegabytesFor,
  osrmProfile,
  useLearnedPace,
  useSettings,
  useT,
  useTheme,
  type MapType,
  type TravelMode,
} from './src/settings';
import { t } from './src/i18n';
import type { Theme } from './src/theme';
import type { Bounds, Coordinates, Place, Route, RouteStep } from './src/types/geo';
import type { SearchCategory } from './src/utils/categories';
import { formatDistance, formatDistanceSpoken } from './src/utils/format';
import { clampPace, modelSeconds } from './src/utils/eta';
import { distanceAlong, locateOnRoute, nearestIndex } from './src/utils/geometry';
import { namesArePortuguese, speak, stopSpeaking } from './src/utils/voice';
import { speedLimitsAhead, type LimitsWindow } from './src/services/speedLimits';
import { useAppActive } from './src/useAppActive';

// **Before everything else.** An error while loading the modules below already
// has someone to write it down — and that is exactly where an error has no other
// way of making itself known. See `src/services/crash.ts`.
installCrashHandler();

// Identifies us to OpenStreetMap right at start-up, before any tile.
configureTileRequests();

/** Settings have to wrap everything, because the theme comes from them. */
export default function App() {
  return (
    <SafeAreaProvider>
      {/*
        Outside everything: an error while drawing the screen shows instead of
        closing the app with no explanation. See `ErrorBoundary`.
      */}
      <ErrorBoundary>
        <SettingsProvider>
          <PalmMap />
        </SettingsProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function PalmMap() {
  const theme = useTheme();
  const strings = useT();
  // The system margins: status bar, centre camera and navigation bar. On
  // Android they have to be asked for — the map draws under them.
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const { settings, update } = useSettings();
  const { learnPace } = useLearnedPace();

  const mapRef = useRef<MapViewRef>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  // The bottom panels' measured heights — see `raisedBottom`.
  const [panelHeights, setPanelHeights] = useState({ place: 0, route: 0, measure: 0 });
  const measurePanel = useCallback(
    (which: 'place' | 'route' | 'measure') => (event: LayoutChangeEvent) => {
      const height = Math.round(event.nativeEvent.layout.height);
      setPanelHeights((old) => (old[which] === height ? old : { ...old, [which]: height }));
    },
    [],
  );
  // Settings opened from the route panel's shortcut: only the navigation group.
  const [settingsNavOnly, setSettingsNavOnly] = useState(false);
  /**
   * The new version, when there is one.
   *
   * It lives here and not inside Settings because it marks the Settings button
   * with a dot — someone who never opens Settings still has to see there is
   * something new.
   */
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  /**
   * Whether the new version may download by itself: only on Wi-Fi.
   *
   * Read **once, when checking**, not on every render: changing network in the
   * middle of a download must not restart or stop it.
   */
  /** The version already dismissed. 0 when none was. */
  const [updateDismissed, setUpdateDismissed] = useState(0);
  /** The installer was opened last time and the new version is not running. */
  const [installUnfinished, setInstallUnfinished] = useState(false);
  /** The stops and arrival times panel. */
  const [transitVisible, setTransitVisible] = useState(false);
  /**
   * Measuring tape: while on, each tap on the map adds a point instead of
   * showing the hint. It is the only thing that changes what a tap does, so it is
   * worth making it obvious that it is on.
   */
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<Coordinates[]>([]);
  /**
   * Measure along a line or measure a closed shape.
   *
   * Two different things: the way from home to work does not close, and closing
   * it by itself gave a wrong number to someone who only wanted the distance.
   */
  const [measureMode, setMeasureMode] = useState<MeasureMode>('linha');
  /**
   * The stops near you, on the transport map.
   *
   * They live here and not in the panel because the pins have to show on the map
   * **just by being on the transport map** — without opening the arrivals panel
   * to see them.
   */
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  // Every stop in view on the transport map, so a tap on any of them opens its
  // times — see `stopsInBounds`.
  const [mapStops, setMapStops] = useState<TransitStop[]>([]);
  const [transitLoading, setTransitLoading] = useState(false);
  const [transitError, setTransitError] = useState<string | null>(null);
  /** Outside the Lisbon Metropolitan Area, where there is no open data. */
  const [transitOutside, setTransitOutside] = useState(false);
  /**
   * Train, metro, light-rail and ferry stations near you.
   *
   * They show even without timetables, because knowing there is a station there
   * is half the question — and the first step towards one day having its times.
   */
  const [transitStations, setTransitStations] = useState<TransitStation[]>([]);

  /**
   * The moving buses, and whether the zoom is close enough to show them.
   *
   * The zoom lives in a `ref` (the `viewport`), which an effect cannot watch. So
   * only the **boolean** of being above the threshold is kept here: it changes
   * twice a session instead of on every drag.
   */
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [vehicleZoomOk, setVehicleZoomOk] = useState(false);
  /**
   * The middle of the map, as text and rounded to three decimals — about a
   * hundred metres.
   *
   * For the same reason as the boolean above: the `viewport` is a `ref` and an
   * effect cannot watch it. This is what makes stops and stations follow the map
   * instead of the GPS.
   */
  const [mapCentre, setMapCentre] = useState<string | null>(null);
  /** The open stop. It lives here because it opens from the list **or** the map. */
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  /**
   * The last position, outside the render cycle.
   *
   * The route reads it from here instead of depending on state. If it depended on
   * it, every GPS reading — every ten seconds — sent a new request to OSRM while
   * a destination was chosen.
   */
  const userLocationRef = useRef<Coordinates | null>(null);
  /** Becomes true on the first position. It is what unlocks the route. */
  const [hasLocation, setHasLocation] = useState(false);

  const [destination, setDestination] = useState<Place | null>(null);
  /**
   * Where the route starts, when it is not the GPS — chosen on the Directions
   * screen. `null` is "my location", which is what it always was before.
   */
  const [routeOrigin, setRouteOrigin] = useState<Place | null>(null);
  // The street one is on, for "From: My location (Rua X)" in the route panel.
  const [hereName, setHereName] = useState<string | null>(null);
  const [directionsVisible, setDirectionsVisible] = useState(false);
  const [layersVisible, setLayersVisible] = useState(false);
  const [savedVisible, setSavedVisible] = useState(false);
  /** The search is open and covers the screen — see `SearchBar`. */
  const [searchFocused, setSearchFocused] = useState(false);
  /**
   * Stops along the way, in the order they are passed.
   *
   * "Go by the pharmacy and then home" — the destination is still the
   * destination; these are the points the route has to go through before it.
   */
  const [waypoints, setWaypoints] = useState<Place[]>([]);
  /**
   * The routes the service returned, and which one is chosen.
   *
   * OSRM can give two or three different routes to the same destination. The
   * first is the one it considers best, but the driver knows which they prefer —
   * so they are all kept and drawn.
   */
  const [routeOptions, setRouteOptions] = useState<Route[]>([]);
  const [routeIndex, setRouteIndex] = useState(0);
  const route = routeOptions[routeIndex] ?? null;
  const setRoute = useCallback((novo: Route | null) => {
    setRouteOptions(novo ? [novo] : []);
    setRouteIndex(0);
  }, []);
  /**
   * Bus trips, when the chosen mode is public transport.
   *
   * Kept apart from `routeOptions` on purpose: a bus trip is not a route drawn on
   * the map, it is a list of times. Mixing them would force everything that
   * reads the route to tell the two apart.
   */
  const [transitTrips, setTransitTrips] = useState<TransitTrip[] | null>(null);
  const [transitTripIndex, setTransitTripIndex] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [stepsVisible, setStepsVisible] = useState(false);

  const [category, setCategory] = useState<SearchCategory | null>(null);
  /** Businesses from the chosen category (buttons) or the visible map area. */
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  /** Point dropped on the map with a long press, with no route drawn yet. */
  const [droppedPin, setDroppedPin] = useState<Coordinates | null>(null);

  /** Saved places, read from the phone at start-up. */
  const [favourites, setFavourites] = useState<Place[]>([]);
  /** Recent destinations, so the same address does not have to be typed again. */
  const [recents, setRecents] = useState<Place[]>([]);

  /** Speed cameras on the route, in the order they are passed. */
  const [cameras, setCameras] = useState<SpeedCamera[]>([]);
  /** The camera being warned about right now, if any. */
  const [cameraAhead, setCameraAhead] = useState<{
    camera: SpeedCamera;
    meters: number;
  } | null>(null);
  /** Cameras already announced, so the same one is not repeated on every GPS reading. */
  const warnedCameras = useRef(new Set<number>());

  /**
   * True when the next manoeuvre is still far and the GPS can be read less often.
   *
   * Changing this resubscribes the GPS, so it must not flip back and forth: the
   * two distances are different on purpose, so it does not switch on and off
   * right at the threshold.
   */
  const [slowGps, setSlowGps] = useState(false);

  /**
   * The camera moves with the person, outside navigation. Turned on with a
   * double tap on the GPS button and off by dragging the map — see
   * `handleLocatePress`.
   */
  const [followUser, setFollowUser] = useState(false);
  /** When the GPS button was last tapped, to recognise a double tap. */
  const lastLocateTap = useRef(0);

  /** Navigation running: follows the position and announces the manoeuvres. */
  const [navigating, setNavigating] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [nextStep, setNextStep] = useState<RouteStep | null>(null);
  /** The manoeuvre after the next one, shown as "Then" when the two are close. */
  const [thenStep, setThenStep] = useState<RouteStep | null>(null);
  /** The camera has let go of the car during navigation (dragged, or overview). */
  const [navCameraFree, setNavCameraFree] = useState(false);
  const [distanceToStep, setDistanceToStep] = useState(0);
  const [remaining, setRemaining] = useState({ meters: 0, seconds: 0 });
  /**
   * The speed, in km/h. `null` while the GPS cannot tell it.
   *
   * It comes free inside the navigation readings, so there is no extra
   * subscription here — see `watchPosition`.
   */
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  /** The speed limit of the road being driven, in km/h, during navigation. */
  const [roadLimit, setRoadLimit] = useState<number | null>(null);
  /** When the over-the-limit warning was last spoken, so it does not nag. */
  const lastLimitWarning = useRef(0);
  /** The speed-limit window for the route being driven — see `speedLimitsAhead`. */
  const limitsRef = useRef<{ route: Route; win: LimitsWindow } | null>(null);
  const limitsBusy = useRef(false);
  const limitsFailedAt = useRef(0);
  /**
   * Moving fast enough for this to be a car.
   *
   * It is what turns on the speedometer outside navigation and speeds up the GPS
   * readings. On foot or standing still it is off, and the GPS goes back to its
   * usual slow pace — that is what stops this feature costing battery to someone
   * who does not use it.
   */
  const [drivingGps, setDrivingGps] = useState(false);
  /** When car speed was last seen. See `DRIVING_LINGER_MS`. */
  const lastDrivingAt = useRef(0);
  /**
   * This trip's pace: how many times longer it is really taking than the route
   * predicted. `null` until enough has been travelled for it to mean anything —
   * see `PACE_MIN_MS`.
   */
  const [livePace, setLivePace] = useState<number | null>(null);
  /**
   * Where the pace started being counted: the time, the distance already done
   * and what the route predicted up to there.
   *
   * Reset on every recalculation, because the new route has another total
   * distance and the "how far have I gone" sums would stop adding up.
   */
  const paceStart = useRef<{
    atMs: number;
    coveredMeters: number;
    assumedSeconds: number;
  } | null>(null);
  /**
   * The measured pace and the travel mode it was measured in, to be stored when
   * the trip ends.
   *
   * In a `ref` and with the mode inside on purpose: the one storing it is the
   * effect that sees navigation end, and that one cannot depend on the settings
   * without running again on every change to them.
   */
  const paceToLearn = useRef<{ mode: TravelMode; factor: number } | null>(null);
  /** How far along the route the person is. The map fades what is behind. */
  const [progressIndex, setProgressIndex] = useState(0);
  /** How many readings in a row have been off the route. */
  const offRouteStrikes = useRef(0);
  /** Manoeuvres already announced, so the same one is not repeated endlessly. */
  const announced = useRef(new Set<string>());
  const [placesError, setPlacesError] = useState<string | null>(null);

  /**
   * Shows the hint on how to drop a point, for a few seconds.
   *
   * It only appears when the person taps the map and nothing happens — which is
   * exactly when it helps to know the press has to be long. Always on screen it
   * only covered the map for those who already know.
   */
  const [hintVisible, setHintVisible] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  /**
   * The stops nearby, whenever the transport map is on.
   *
   * **Near the middle of the map, not near the GPS.** This was tied to the
   * phone's position, the same fault the category buttons had already had:
   * dragging the map to another town brought no stops from there, and whoever
   * opened the panel before the GPS answered — indoors, for example — saw
   * nothing at all, neither stops nor times. What is in view rules; the position
   * is the fallback for when there has been no map yet.
   *
   * **It depends on the rounded coordinates, not on the position object.** The
   * GPS returns a new object every ten seconds, and depending on it made this run
   * again on every reading — the list reordered under the finger and the map pins
   * were redrawn with nothing changed. Rounded to three decimals is about a
   * hundred metres, the scale at which the answer really changes.
   */
  const perto =
    mapCentre ??
    (userLocation
      ? `${userLocation.latitude.toFixed(3)},${userLocation.longitude.toFixed(3)}`
      : null);

  useEffect(() => {
    if (settings.mapType !== 'transit' || !perto) {
      setTransitStops([]);
      setTransitStations([]);
      return;
    }

    const [lat, lon] = perto.split(',').map(Number);
    let cancelled = false;

    setTransitLoading(true);
    void (async () => {
      try {
        // The stations come together with the stops: four short lists, kept in
        // memory after the first request.
        const [encontradas, estacoes] = await Promise.all([
          nearbyStops({ latitude: lat, longitude: lon }),
          nearbyStations({ latitude: lat, longitude: lon }).catch(() => []),
        ]);
        if (cancelled) {
          return;
        }
        setTransitStations(estacoes);
        // The three states are always reset, not only when something fails: without
        // that, opening the panel outside Lisbon and then entering the area left the
        // "no timetables" notice on top of a full list.
        setTransitOutside(encontradas === null);
        setTransitStops(encontradas ?? []);
        setTransitError(null);
      } catch (error) {
        if (!cancelled) {
          setTransitStops([]);
          setTransitOutside(false);
          setTransitError(
            error instanceof Error ? error.message : t().transit.stopsFailed,
          );
        }
      } finally {
        if (!cancelled) {
          setTransitLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [settings.mapType, perto]);

  /**
   * The moving buses, on the transport map.
   *
   * **Three brakes, and none is decoration.** The answer is the whole fleet,
   * 1.1 MB each time, because the service has no filter by area or line. So it is
   * only asked for when actually looking at transport (`mapType`), with the map
   * zoomed in enough to tell buses apart (`vehicleZoomOk`), and with the setting
   * on.
   *
   * A failure here is not worth a message: the buses from last time stay and the
   * next update tries again. This is extra information on the map, not the map.
   */
  const appActive = useAppActive();
  useEffect(() => {
    if (settings.mapType !== 'transit' || !settings.showVehicles || !vehicleZoomOk) {
      setVehicles([]);
      return;
    }
    // In the background the buses stay as they were and nothing is asked; back
    // on screen this runs again and asks at once.
    if (!appActive) {
      return;
    }

    let cancelled = false;

    const carregar = async () => {
      try {
        const lista = await liveVehicles();
        if (!cancelled) {
          setVehicles(lista);
        }
      } catch {
        // See above: without new positions, the old ones stay.
      }
    };

    void carregar();
    const timer = setInterval(() => void carregar(), VEHICLES_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settings.mapType, settings.showVehicles, vehicleZoomOk, appActive]);

  /** Visible area of the map, updated when the map stops moving. */
  const viewport = useRef<{ bounds: Bounds; zoom: number } | null>(null);
  const stopsRequest = useRef(0);
  /** Whether a downloaded country's business file covers the view. */
  const [localPoisHere, setLocalPoisHere] = useState(false);
  const pinsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Identifies the latest request, to ignore late answers. */
  const latestPlaces = useRef(0);
  /** Country maps stored, so the map can work without a network. */
  const [offlineRegions, setOfflineRegions] = useState<OfflineRegion[]>([]);
  /** Becomes true once the map's fonts are in place. */
  const [labelsReady, setLabelsReady] = useState(false);

  // The map cache size, whenever the setting changes.
  useEffect(() => {
    setMapCacheSize(cacheMegabytesFor(settings.cacheSize));
  }, [settings.cacheSize]);

  // Saved places, read once at start-up.
  useEffect(() => {
    void loadFavourites().then(setFavourites);
    void loadRecents().then(setRecents);
  }, []);

  // The fonts have to be placed in the app's folder before the map looks for
  // them. It only does anything on the first start. If it fails, only the
  // offline map is lost, so start-up is not interrupted for it.
  useEffect(() => {
    void installBundledAssets()
      .then(() => setLabelsReady(true))
      .catch(() => undefined)
      .then(() => setOfflineRegions(installedRegions()));
  }, []);

  /**
   * Refreshes the country maps that have a newer version, at start-up.
   *
   * **Only on Wi-Fi.** A country is hundreds of megabytes — mainland Portugal is
   * 325 MB — and downloading that by itself over someone's mobile data was
   * spending their allowance without asking. On Wi-Fi it costs nothing and is
   * what is wanted: the map keeps up to date without anyone thinking about it.
   *
   * Off Wi-Fi nothing happens here, and the maps screen marks them as outdated
   * for whoever wants to refresh them by hand.
   *
   * Silent from end to end: someone who did not ask for this does not need to
   * see a spinner or an error. See `refreshOutdatedOnWifi`.
   */
  useEffect(() => {
    void refreshOutdatedOnWifi().then((renovados) => {
      if (renovados > 0) {
        // The map in use may have been replaced underfoot.
        setOfflineRegions(installedRegions());
      }
    });
  }, []);

  const toggleFavourite = useCallback((place: Place) => {
    setFavourites((current) => {
      const already = current.some((saved) => isSamePlace(saved, place));
      const next = already
        ? current.filter((saved) => !isSamePlace(saved, place))
        : [place, ...current];
      void saveFavourites(next);
      return next;
    });
  }, []);

  const isFavourite = useCallback(
    (place: Place | null) =>
      place ? favourites.some((saved) => isSamePlace(saved, place)) : false,
    [favourites],
  );

  /**
   * Looks for a new version when the app opens, and on Wi-Fi downloads it by
   * itself.
   *
   * **The date of the last check is stored**, not just kept in memory: without
   * that, opening and closing the app six times in a row was six requests.
   * GitHub's API counts 60 an hour **per IP address**, shared with everything on
   * the same network. The brake is a quarter of an hour — see
   * `UPDATE_CHECK_INTERVAL_MS`.
   *
   * **Nothing downloads without a tap, not even on Wi-Fi** (the author's
   * request, November 2026: "I'd rather be the one to click"). It used to start
   * by itself on Wi-Fi; now the notice always waits for the button.
   *
   * A failure here must not put any error on screen: someone who asked for
   * nothing does not need to know a silent check could not reach the Internet.
   * Whoever wants an answer presses the button in Settings, and there sees the
   * error.
   */
  useEffect(() => {
    void (async () => {
      try {
        setUpdateDismissed(Number(await AsyncStorage.getItem(UPDATE_DISMISSED_KEY)) || 0);

        // An install that was opened and did not finish comes before everything,
        // with no request to GitHub: the version is known and the APK is usually
        // still in the cache. See `unfinishedInstall`.
        const pendente = await unfinishedInstall();
        if (pendente) {
          setInstallUnfinished(true);
          setUpdateInfo(pendente);
          return;
        }

        const ultima = Number(await AsyncStorage.getItem(UPDATE_CHECK_KEY)) || 0;
        if (Date.now() - ultima < UPDATE_CHECK_INTERVAL_MS) {
          return;
        }
        // Marked **before** asking. If the network is down, what is not wanted is to
        // try again at every start for the whole day.
        await AsyncStorage.setItem(UPDATE_CHECK_KEY, String(Date.now()));

        setUpdateInfo(await checkForUpdate());
      } catch {
        // Silent, on purpose — see the note above.
      }
    })();
  }, []);

  // Current position, asked once at start-up.
  useEffect(() => {
    void (async () => {
      // **"No position" is not "no permission".** The two used to go together:
      // any missing position counted as a refusal, and the app hid the right
      // notice and the GPS button. But the GPS fails for many reasons other than
      // the person saying no — indoors, with no sky in view, or simply not having
      // answered yet. The refusal is asked of whoever knows.
      const autorizada = await requestPermission();
      setLocationDenied(!autorizada);

      const position = await getCurrentPosition();
      userLocationRef.current = position;
      setUserLocation(position);
      setHasLocation(position !== null);
    })();
  }, []);

  /**
   * When coming back from the background, fetch the position again.
   *
   * **With the app off screen, Android cuts the GPS readings** — the trade-off of
   * asking for the permission "while in use" only, and what is wanted. But
   * someone who moved meanwhile came back with the position from before, and
   * nothing on screen said it no longer held.
   *
   * A new reading is asked for here, without waiting for the tracking one: that
   * comes every ten seconds and only after the person moves fifty metres, which
   * left a wide window in which centring the map went to the wrong place.
   *
   * Not needed while navigating: then it reads every second, and Android resumes
   * that as soon as the app comes back.
   */
  useEffect(() => {
    if (navigating) {
      return;
    }

    const subscription = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') {
        return;
      }
      void getFreshPosition().then((posicao) => {
        if (posicao) {
          userLocationRef.current = posicao;
          setUserLocation(posicao);
        }
      });
    });

    return () => subscription.remove();
  }, [navigating]);

  /**
   * Outside navigation, keep following the position slowly, so the blue dot
   * keeps up with someone walking instead of staying where it was at opening.
   * While navigating it is off, because then the navigation engine follows the
   * GPS and having both on was spending battery twice.
   *
   * **In a car, the pace goes up.** Every ten seconds is plenty for a blue dot
   * and not nearly enough for a speedometer: at 90 km/h, ten seconds is two
   * hundred and fifty metres, and the number shown was from a block ago. Above
   * `DRIVING_SPEED_MS` it reads every two seconds, with `distanceInterval` at
   * zero — otherwise braking from 90 to zero never covers the fifty metres that
   * would unlock the next reading, and the speedometer stuck at 90 with the car
   * standing still.
   */
  useEffect(() => {
    if (navigating) {
      return;
    }

    let stop: (() => void) | null = null;
    let cancelled = false;

    void watchPositionIdle(
      // For the same reason as navigation tracking: the native side calls this,
      // and an error here closed the app without a trace.
      guarded((position: Coordinates, speedMs: number | null) => {
        userLocationRef.current = position;
        setUserLocation(position);
        setHasLocation(true);
        setLocationDenied(false);

        // **The number is the GPS's, untouched.** The receiver measures speed by
        // the Doppler effect and it is the one that knows; the app only converts
        // metres per second to km/h. When Android cannot tell the speed, the
        // speedometer disappears — that is not touching up the number, it is having
        // no number at all.
        setSpeedKmh(speedMs === null ? null : Math.round(speedMs * 3.6));

        // **Quick in, slow out.** One reading above the threshold turns it on; to
        // turn it off it has to be slow for more than `DRIVING_LINGER_MS`. Without
        // that wait the speedometer vanished at every traffic light and came back
        // when pulling away — and a speedometer shows zero when stopped, it does
        // not hide.
        if (speedMs !== null) {
          if (speedMs >= DRIVING_SPEED_MS) {
            lastDrivingAt.current = Date.now();
            setDrivingGps(true);
          } else if (
            speedMs < DRIVING_STOP_MS &&
            Date.now() - lastDrivingAt.current > DRIVING_LINGER_MS
          ) {
            setDrivingGps(false);
          }
        }
      }),
      drivingGps ? DRIVING_GPS_INTERVAL_MS : 10000,
      drivingGps ? 0 : 50,
    ).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        stop = fn;
      }
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [navigating, drivingGps]);

  // Calculates the route when there is an origin and a destination.
  useEffect(() => {
    // While navigating the position changes every second. Recalculating here
    // would send one request a second to OSRM — the navigation engine
    // recalculates, and only when really off the route.
    if (navigating) {
      return;
    }

    if (!destination) {
      setRoute(null);
      setRouteError(null);
      // A transit trip left behind kept the transport map showing only its two
      // stops, long after the route was closed.
      setTransitTrips(null);
      return;
    }

    const origem = routeOrigin?.coordinates ?? userLocationRef.current;
    if (!origem) {
      setRoute(null);
      setTransitTrips(null);
      setRouteError(t().errors.noLocationForRoute);
      return;
    }

    let cancelled = false;
    setRouteLoading(true);
    setRouteError(null);

    const perfil = osrmProfile(settings.travelMode);

    // --- Public transport ---------------------------------------------------
    //
    // Public transport does not go through OSRM: no routing engine can work it
    // out from open data. It is assembled from two quite different sources:
    //
    // - **Buses**, from Carris Metropolitana's real-time arrivals. Needs a
    //   network — see `planBusTrips`.
    // - **Train, metro and ferry**, from the timetable stored on the phone. Needs
    //   no network and answers at once, but it is the timetable and not the
    //   moving train — see `planScheduledTrips`.
    if (perfil === null) {
      setRouteOptions([]);
      void (async () => {
        // The stored timetable first, without waiting for a network: there is
        // something on screen at once, even if the bus service is down or there
        // is no connection at all.
        let doHorario: TransitTrip[] = [];
        try {
          doHorario = planScheduledTrips(origem, destination.coordinates);
          // With one change (Azul to Verde, metro to train): most journeys in
          // Lisbon need one. Offered when there are few direct trips, or when
          // changing gets there sooner than the best of them.
          const directos = doHorario;
          const melhor = directos[0]?.reachAt ?? Infinity;
          const comMudanca = planScheduledTransfers(origem, destination.coordinates).filter(
            (trip) => directos.length < 2 || trip.reachAt < melhor,
          );
          doHorario = [...directos, ...comMudanca].sort((a, b) => a.reachAt - b.reachAt);
        } catch {
          // A broken timetable must not stop the buses from showing.
        }

        // Earliest arrival first, wherever it comes from. Same rule as among the
        // buses: what matters is what time you are there.
        const juntar = (outros: TransitTrip[]) =>
          [...outros, ...doHorario].sort((a, b) => a.reachAt - b.reachAt);

        try {
          const trajetos = await planBusTrips(origem, destination.coordinates);
          if (cancelled) {
            return;
          }
          const todos = juntar(trajetos ?? []);
          setTransitTrips(todos);
          setTransitTripIndex(0);
          setRouteError(
            trajetos === null && todos.length === 0
              ? t().errors.noTransitStops
              : null,
          );
          void rememberRecent(destination).then(setRecents);
        } catch (error) {
          if (!cancelled) {
            setTransitTrips(doHorario);
            setTransitTripIndex(0);
            // The error message says what really failed — the service answering with
            // a number, taking too long or the network down. It used to always be
            // "check the connection", which says the opposite of what is happening to
            // someone with a network and the map loading normally.
            setRouteError(
              doHorario.length > 0
                ? null
                : error instanceof Error
                  ? error.message
                  : t().errors.schedulesFailed,
            );
          }
        } finally {
          if (!cancelled) {
            setRouteLoading(false);
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    setTransitTrips(null);

    void (async () => {
      try {
        const result = await getRoutes(
          origem,
          waypoints.map((w) => w.coordinates),
          destination.coordinates,
          perfil,
          settings.avoidTolls,
          settings.bikeType,
        );
        if (!cancelled) {
          setRouteOptions(result);
          setRouteIndex(0);
          // The recents list is only touched when the route really comes out: a
          // destination that gave no route is no place at all.
          void rememberRecent(destination).then(setRecents);
        }
      } catch (error) {
        if (!cancelled) {
          setRoute(null);
          setRouteError(
            error instanceof RouteError
              ? error.message
              : t().errors.routeGeneric,
          );
        }
      } finally {
        if (!cancelled) {
          setRouteLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // The position comes in as `hasLocation`, not coordinates: the route is
    // drawn when the destination is chosen (or when the first position
    // arrives), not again at every step. Following the person is navigation's
    // job, which has its own recalculation.
  }, [destination, routeOrigin, waypoints, hasLocation, settings.travelMode, settings.avoidTolls, settings.bikeType, navigating]);

  /**
   * Each travel mode's time, for the route panel buttons ("car 12 min · walk
   * 45 min"), as in the maps everyone knows.
   *
   * Only the **other** modes are asked for — the chosen one already has the full
   * route — and with OSRM's lightest request (no geometry or manoeuvres). They
   * go through the same one-a-second queue and are kept for the session:
   * switching modes back and forth asks nothing again. Public transport is not
   * included — its time comes from the trips, when it is the chosen mode.
   */
  const [modeTimes, setModeTimes] = useState<
    Partial<Record<TravelMode, { distanceMeters: number; durationSeconds: number } | null>>
  >({});
  // Another destination, origin or stops: the earlier times no longer apply.
  useEffect(() => {
    setModeTimes({});
  }, [destination, routeOrigin, waypoints, settings.bikeType]);
  useEffect(() => {
    if (navigating || !destination) {
      return;
    }
    const origem = routeOrigin?.coordinates ?? userLocationRef.current;
    if (!origem) {
      return;
    }
    let cancelled = false;
    const via = waypoints.map((w) => w.coordinates);
    for (const mode of ['driving', 'walking', 'cycling'] as const) {
      if (mode === settings.travelMode) {
        continue;
      }
      getDuration(origem, via, destination.coordinates, mode, () => !cancelled, settings.bikeType)
        .then((result) => {
          if (!cancelled) {
            setModeTimes((prev) => ({ ...prev, [mode]: result }));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setModeTimes((prev) => ({ ...prev, [mode]: null }));
          }
        });
    }
    return () => {
      cancelled = true;
    };
    // With the chosen mode in the dependencies: on switching, the one left
    // needs its time. The others come from the service cache, with no request.
  }, [destination, routeOrigin, waypoints, hasLocation, navigating, settings.travelMode, settings.bikeType]);

  /**
   * Looks for businesses to show on the map.
   *
   * With a category chosen, it searches **the area in view** — not around the
   * GPS. Otherwise, when looking at another area the results appeared far from
   * there and the button seemed to do nothing.
   */
  const searchPlacesIn = useCallback(
    async (bounds: Bounds, zoom: number, chosen: SearchCategory | null) => {
      const requestId = ++latestPlaces.current;
      // Asked by the Overpass queue when this request's turn comes: if the map
      // has moved elsewhere meanwhile, the request never goes out.
      const stillWanted = () => requestId === latestPlaces.current;

      if (chosen) {
        if (zoom < CATEGORY_MIN_ZOOM) {
          setPlaces([]);
          setPlacesError(t().errors.zoomIn);
          return;
        }

        setPlacesError(null);

        // The downloaded country's business file first: instant, and works
        // without network. Overpass only where there is none.
        const local = localPlacesInBounds(bounds, chosen.tags);
        if (local) {
          setPlaces(local);
          setPlacesError(
            local.length === 0
              ? t().errors.noneOfCategory(t().categories[chosen.labelKey])
              : null,
          );
          return;
        }

        try {
          const found = await searchCategoryInBounds(chosen, bounds, stillWanted);
          if (requestId === latestPlaces.current) {
            setPlaces(found);
            setPlacesError(
              found.length === 0
                ? t().errors.noneOfCategory(t().categories[chosen.labelKey])
                : null,
            );
          }
        } catch (error) {
          if (requestId === latestPlaces.current) {
            setPlaces([]);
            setPlacesError(
              error instanceof Error ? error.message : t().errors.searchFailed,
            );
          }
        }
        return;
      }

      // No category: the automatic pins, which only show zoomed well in.
      if (!settings.showPlacesOnMap || zoom < MAP_PINS_MIN_ZOOM) {
        setPlaces([]);
        return;
      }

      const local = localPlacesInBounds(bounds, ALL_BUSINESSES);
      if (local) {
        setPlaces(local);
        setPlacesError(null);
        return;
      }

      // Automatic pins never ask Overpass: on the drawn maps they come with the
      // tiles, and the transport map is about stops, not shops. Asking there
      // only produced "Could not search for places" whenever Overpass refused.
      setPlaces([]);
      setPlacesError(null);
    },
    [settings.showPlacesOnMap, settings.mapType],
  );

  // When a category is chosen, search the area in view straight away.
  useEffect(() => {
    const current = viewport.current;
    if (!current) {
      return;
    }
    if (!category) {
      setPlacesError(null);
    }
    void searchPlacesIn(current.bounds, current.zoom, category);
  }, [category, searchPlacesIn]);

  /**
   * When the map stops moving, update the businesses in view.
   *
   * Only after a pause — Overpass is run by volunteers and one request per drag
   * would be abusive.
   */
  const handleViewportChange = useCallback(
    (bounds: Bounds, zoom: number) => {
      viewport.current = { bounds, zoom };

      // Only the boolean, and only when it crosses over: setting the same value
      // redraws nothing, but it is worth making clear that is what is relied on.
      const daParaVer = zoom >= VEHICLES_MIN_ZOOM;
      setVehicleZoomOk((atual) => (atual === daParaVer ? atual : daParaVer));

      // The middle of the map, rounded to about a hundred metres. It tells the
      // stops and stations where to look — rounded because the list does not
      // have to reorder under the finger with every pixel the map moves.
      const centro = `${((bounds.south + bounds.north) / 2).toFixed(3)},${(
        (bounds.west + bounds.east) /
        2
      ).toFixed(3)}`;
      setMapCentre((atual) => (atual === centro ? atual : centro));

      const temLocal = poisRegionFor(bounds) !== null;
      setLocalPoisHere((atual) => (atual === temLocal ? atual : temLocal));

      // The stops in view, only on the transport map and close enough in for
      // them to be told apart. From memory: no request once `/stops` is loaded.
      if (settings.mapType === 'transit' && zoom >= STOPS_MAP_MIN_ZOOM) {
        const pedido = (stopsRequest.current += 1);
        void stopsInBounds(bounds)
          .then((found) => {
            if (pedido === stopsRequest.current) {
              setMapStops(found);
            }
          })
          .catch(() => undefined);
      } else {
        stopsRequest.current += 1;
        setMapStops((atual) => (atual.length === 0 ? atual : []));
      }

      if (pinsTimer.current) {
        clearTimeout(pinsTimer.current);
      }

      // **What is already in memory shows at once, with no wait.** The wait
      // exists so as not to fire a request at Overpass on every drag — and a
      // stored answer fires no request. Going back and forth in an area already
      // visited no longer has a second and a fifth of map without pins at every
      // stop, which was what most made this feel slow. Only without a category,
      // because only the automatic pins fit the cache grid.
      // With the country downloaded, the pins come from the phone, now —
      // no wait, no request. See `localPois.ts`.
      if (!category && settings.showPlacesOnMap && zoom >= MAP_PINS_MIN_ZOOM) {
        const local = localPlacesInBounds(bounds, ALL_BUSINESSES);
        if (local) {
          latestPlaces.current += 1;
          setPlaces(local);
          setPlacesError(null);
          return;
        }
      }

      if (!category) {
        // The pins come inside the map's tiles, or not at all on the transport
        // map: nothing to fetch.
        latestPlaces.current += 1;
        setPlaces((atual) => (atual.length === 0 ? atual : []));
        return;
      }

      pinsTimer.current = setTimeout(() => {
        void searchPlacesIn(bounds, zoom, category);
      }, MAP_PINS_DEBOUNCE_MS);
    },
    [category, searchPlacesIn, settings.showPlacesOnMap, settings.mapType],
  );

  useEffect(() => {
    return () => {
      if (pinsTimer.current) {
        clearTimeout(pinsTimer.current);
      }
    };
  }, []);

  /**
   * Where each manoeuvre sits along the route line.
   *
   * Worked out once per route, because it is a heavy sum and while navigating
   * the answer is needed every second.
   */
  const stepIndices = useMemo(() => {
    if (!route) {
      return [];
    }
    return route.steps.map((step) => nearestIndex(route.coordinates, step.location));
  }, [route]);

  /**
   * Where the stops sit along the route line.
   *
   * For recalculation: leaving the route after the pharmacy, sending the service
   * through it again meant a U-turn. Only those still ahead go in.
   */
  const waypointIndices = useMemo(() => {
    if (!route) {
      return [];
    }
    return waypoints.map((w) => nearestIndex(route.coordinates, w.coordinates));
  }, [route, waypoints]);

  /** Stops a new recalculation being asked while the previous one has not answered. */
  const recalculating_ = useRef(false);

  /**
   * Keeps the screen on while navigating.
   *
   * Without this the phone locks after half a minute — the person is not
   * touching it, they are driving. It is the difference between a navigation app
   * and a map looked at standing still. Outside navigation it is left alone:
   * keeping the screen always on would spend battery for no reason.
   *
   * The voice keeps talking with the screen off, but the map can no longer be
   * seen and Android ends up throttling the position updates — so sound alone is
   * not enough.
   */
  useEffect(() => {
    if (!navigating) {
      return;
    }

    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [navigating]);

  /**
   * Fetches the speed cameras that sit on the route.
   *
   * Done once per route and not while driving: it is an Overpass request, which
   * is heavy, and cameras do not move in the middle of a trip.
   *
   * A failure here must not break anything — no warnings, and navigation goes
   * on, which is much better than no route.
   */
  useEffect(() => {
    warnedCameras.current.clear();
    setCameraAhead(null);

    // The camera indices are positions on the **previous** route line. Keeping
    // them until the new request arrives announced cameras at made-up
    // distances, measured against the wrong line.
    setCameras([]);

    if (!route || !settings.speedCameraAlerts) {
      return;
    }

    let cancelled = false;
    void camerasAlongRoute(route.coordinates)
      .then((found) => {
        if (!cancelled) {
          setCameras(found);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCameras([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [route, settings.speedCameraAlerts]);

  /** Follows the position while navigation runs. */
  useEffect(() => {
    if (!navigating || !route || !destination) {
      return;
    }

    let stopWatching: (() => void) | undefined;
    let cancelled = false;
    // Where on the route the last reading was: the next one is searched around
    // it, not along the whole route (see `locateOnRoute`).
    let lastIndex: number | null = null;

    void (async () => {
      // **Wrapped.** The native side calls this every second for a whole trip:
      // an error here goes through none of our `try`s nor the `ErrorBoundary`,
      // it goes straight to the global handler and, in an APK, closes the app —
      // in the middle of a road. See `guarded`, in `services/crash.ts`.
      const stop = await watchPosition(
        guarded((position, accuracyMeters, speedMs) => {
          setUserLocation(position);

          // The speed comes from the same reading, at no cost, and goes on screen
          // exactly as the GPS gave it — see the note on slow tracking.
          setSpeedKmh(speedMs === null ? null : Math.round(speedMs * 3.6));

          const { index, offRouteMeters } = locateOnRoute(
            route.coordinates,
            position,
            lastIndex,
          );
          lastIndex = index;
          setProgressIndex(index);
          const remainingMeters = distanceAlong(
            route.coordinates,
            index,
            route.coordinates.length - 1,
          );

          // Chegada.
          if (remainingMeters < ARRIVAL_METERS) {
            // The voice speaks **after** navigation closes, not before: leaving
            // navigation undoes this effect, and its cleanup calls `stopSpeaking` —
            // which cut "you have arrived" off in the middle of the first syllable.
            const dizer = settings.voiceGuidance;
            setNavigating(false);
            if (dizer) {
              setTimeout(() => speak(t().navigation.arrived), 250);
            }
            return;
          }

          // Off the route? Only confirmed after a few readings in a row, because a
          // single one may just be GPS inaccuracy.
          // Only what the reading can really assert counts as "off the route".
          // Between buildings the GPS easily errs by fifty metres; without this
          // margin, standing at a traffic light was enough for the app to think it
          // had left the route and recalculate out of nowhere.
          const margem = OFF_ROUTE_METERS + Math.min(accuracyMeters, 100);
          if (offRouteMeters > margem) {
            offRouteStrikes.current += 1;
          } else {
            offRouteStrikes.current = 0;
          }

          if (offRouteStrikes.current >= OFF_ROUTE_STRIKES && !recalculating_.current) {
            offRouteStrikes.current = 0;
            recalculating_.current = true;
            setRecalculating(true);
            if (settings.voiceGuidance) {
              speak(t().navigation.recalculatingVoice);
            }

            void (async () => {
              try {
                // Only the stops still to come. Those already passed would send the
                // route on a U-turn.
                const emFalta = waypoints.filter((_, i) => waypointIndices[i] > index);

                const [fresh] = await getRoutes(
                  position,
                  emFalta.map((w) => w.coordinates),
                  destination.coordinates,
                  osrmProfile(settings.travelMode) ?? 'driving',
                  settings.avoidTolls,
                  settings.bikeType,
                );
                setRoute(fresh);
                announced.current.clear();
      // Without this, navigating the same route again never warned about any
      // camera already passed.
      warnedCameras.current.clear();
      setCameraAhead(null);
      // And it started with the GPS at the slow pace the previous trip ended on.
      setSlowGps(false);
                // New route, new count: without this, the line showed faded as far as
                // the old route had got.
                setProgressIndex(0);
                // And the pace counts from zero again, because the new route has another
                // total distance — "how far have I gone" would stop adding up. What was
                // measured is not lost: it stays in `livePace` until there is a new
                // measurement.
                paceStart.current = null;
              } catch {
                // With no connection, carry on with the old route instead of having nothing.
              } finally {
                setRecalculating(false);
                recalculating_.current = false;
              }
            })();
            return;
          }

          // The next manoeuvre is the first one still ahead.
          const ahead = stepIndices.findIndex((stepIndex) => stepIndex > index);
          const step = ahead >= 0 ? route.steps[ahead] : route.steps[route.steps.length - 1];
          const toStep =
            ahead >= 0
              ? distanceAlong(route.coordinates, index, stepIndices[ahead])
              : remainingMeters;

          // --- Speed cameras -------------------------------------------------
          //
          // The next camera is the first one still ahead on the line. Since the list
          // comes sorted, it is enough to find the first whose route point is past
          // the current one.
          if (settings.speedCameraAlerts && cameras.length > 0) {
            const seguinte = cameras.find((c) => c.routeIndex > index);

            if (seguinte) {
              const ate = distanceAlong(route.coordinates, index, seguinte.routeIndex);
              setCameraAhead(ate <= CAMERA_WARN_METERS ? { camera: seguinte, meters: ate } : null);

              if (ate <= CAMERA_WARN_METERS && !warnedCameras.current.has(seguinte.id)) {
                warnedCameras.current.add(seguinte.id);
                if (settings.voiceGuidance) {
                  const v = t().navigation;
                  speak(
                    seguinte.maxspeed
                      ? v.cameraAheadLimit(
                          cameraLabel(seguinte),
                          formatDistanceSpoken(ate),
                          seguinte.maxspeed,
                        )
                      : v.cameraAhead(cameraLabel(seguinte), formatDistanceSpoken(ate)),
                  );
                }
              }
            } else {
              setCameraAhead(null);
            }
          }

          // --- Battery saving ------------------------------------------------
          //
          // On a long straight road the position does not need reading every
          // second: what is left stays right and the next manoeuvre is kilometres
          // away. Near the manoeuvre it goes back to the normal pace, because there
          // the position decides whether the turn warning comes in time.
          if (settings.batterySaver) {
            if (toStep > BATTERY_SAVER_MIN_METERS && !slowGps) {
              setSlowGps(true);
            } else if (toStep < BATTERY_SAVER_MIN_METERS * 0.66 && slowGps) {
              setSlowGps(false);
            }
          }

          // --- The pace actually being kept ----------------------------------
          //
          // The time the stretch already covered really took is compared with what
          // the route predicted for it. The result multiplies what is left, and that
          // is what makes the arrival time right for whoever reads it. The model has
          // to be the same one the screen uses — hence `modelSeconds` here too,
          // otherwise on a bike it measured against one prediction and showed
          // another.
          const coveredMeters = route.distanceMeters - remainingMeters;
          const assumedTotal = modelSeconds(
            route.distanceMeters,
            route.durationSeconds,
            settings.travelMode,
          );
          const assumedCovered =
            route.distanceMeters > 0
              ? assumedTotal * (coveredMeters / route.distanceMeters)
              : 0;

          if (!paceStart.current) {
            paceStart.current = {
              atMs: Date.now(),
              coveredMeters,
              assumedSeconds: assumedCovered,
            };
          } else {
            const elapsedMs = Date.now() - paceStart.current.atMs;
            const andados = coveredMeters - paceStart.current.coveredMeters;
            const previstos = assumedCovered - paceStart.current.assumedSeconds;

            // The two minimums are what stop a traffic light outside the house from
            // counting as a whole trip — see `PACE_MIN_MS`.
            if (elapsedMs >= PACE_MIN_MS && andados >= PACE_MIN_METERS && previstos > 0) {
              const medido = clampPace(elapsedMs / 1000 / previstos, settings.travelMode);
              setLivePace(medido);
              paceToLearn.current = { mode: settings.travelMode, factor: medido };
            }
          }

          setNextStep(step ?? null);
          // "Then" only when the next two manoeuvres come close together, as in
          // the Maps: otherwise it is a second instruction to read for nothing.
          const then = ahead >= 0 ? route.steps[ahead + 1] : undefined;
          setThenStep(then && step && step.distanceMeters <= THEN_MAX_METERS ? then : null);
          setDistanceToStep(toStep);
          // The limit of the road under the car (OSM maxspeed, from Overpass —
          // see `speedLimitsAhead`). Asked a window at a time: the first when
          // the trip starts, the next when the car is near the end of it.
          const janela = limitsRef.current?.route === route ? limitsRef.current.win : null;
          const limite = janela?.byIndex.get(index) ?? null;
          setRoadLimit((atual) => (atual === limite ? atual : limite));
          const precisa =
            settings.speedLimitAlerts &&
            settings.travelMode === 'driving' &&
            !limitsBusy.current &&
            Date.now() - limitsFailedAt.current > LIMITS_RETRY_MS &&
            (!janela ||
              (janela.untilIndex < route.coordinates.length - 1 &&
                distanceAlong(route.coordinates, index, janela.untilIndex) < LIMITS_REFETCH_M));
          if (precisa) {
            limitsBusy.current = true;
            const pedido = route;
            void speedLimitsAhead(route.coordinates, index)
              .then((win) => {
                limitsRef.current = { route: pedido, win };
              })
              .catch(() => {
                // Without limits navigation goes on as before; try again later.
                limitsFailedAt.current = Date.now();
              })
              .finally(() => {
                limitsBusy.current = false;
              });
          }
          setRemaining({
            meters: remainingMeters,
            seconds:
              route.distanceMeters > 0
                ? route.durationSeconds * (remainingMeters / route.distanceMeters)
                : 0,
          });

          // Spoken announcements, once per manoeuvre and distance. Manoeuvres that
          // need no decision are left out — see `worthAnnouncing`.
          if (settings.voiceGuidance && step?.announce) {
            for (const threshold of ANNOUNCE_AT_METERS) {
              const key = `${ahead}|${threshold}`;
              if (toStep <= threshold && !announced.current.has(key)) {
                announced.current.add(key);
                const instruction =
                  step.instruction.charAt(0).toLowerCase() + step.instruction.slice(1);
                speak(
                  threshold >= 200
                    ? t().navigation.inDistance(
                        formatDistanceSpoken(threshold),
                        instruction,
                      )
                    : `${step.instruction}.`,
                  // In English, Portuguese street names are read with the
                  // Portuguese voice — see `speak`.
                  step.streetName && namesArePortuguese(position) ? [step.streetName] : [],
                );
                break;
              }
            }
          }
        }),
        settings.batterySaver && slowGps ? BATTERY_SAVER_INTERVAL_MS : 1000,
      );

      if (cancelled) {
        stop();
      } else {
        stopWatching = stop;
      }
    })();

    // **The voice is not silenced nor the speedometer cleared here**, and that
    // changed for a reason one could hear. This cleanup runs whenever the
    // route, the cameras or the GPS pace change — not only when leaving
    // navigation. With `stopSpeaking()` in here, recalculating said
    // "recalculating" and cut itself off: the new route arrived, the effect ran
    // again and the cleanup silenced the sentence. Those two things belong to
    // the effect that sees navigation end, further down.
    return () => {
      cancelled = true;
      stopWatching?.();
    };
  }, [
    navigating,
    route,
    destination,
    stepIndices,
    cameras,
    waypoints,
    waypointIndices,
    slowGps,
    settings.voiceGuidance,
    settings.travelMode,
    settings.avoidTolls,
    settings.speedCameraAlerts,
    settings.batterySaver,
  ]);

  /**
   * What to do when entering and leaving navigation: silence the voice, clear
   * the speedometer and store the trip's pace.
   *
   * It lives in an effect of its own, not in the navigation effect's cleanup,
   * because that one runs again whenever the route, the cameras or the GPS pace
   * change — and then the same pace was stored half a dozen times mid-trip, each
   * pulling the stored value further towards this trip's.
   */
  useEffect(() => {
    if (navigating) {
      paceStart.current = null;
      paceToLearn.current = null;
      setLivePace(null);
      return;
    }

    // Silencing the voice and clearing the speedometer belong to **ending**
    // navigation, and live here for that: in the tracking effect's cleanup
    // they ran on every route change and cut the announcements off.
    stopSpeaking();
    setSpeedKmh(null);

    const medido = paceToLearn.current;
    paceToLearn.current = null;
    paceStart.current = null;
    setLivePace(null);

    if (medido) {
      learnPace(medido.mode, medido.factor);
    }
  }, [navigating, learnPace]);

  /**
   * The visible area, so the search prefers what is nearby.
   *
   * Stable on purpose: it reads from a `ref`, so its identity never changes. If
   * it were created on every render, the `SearchBar` would repeat the search
   * endlessly.
   */
  const getMapBounds = useCallback(() => viewport.current?.bounds ?? null, []);

  /**
   * How high the floating buttons go while a bottom panel is open: just above
   * the panel actually showing, measured (`onLayout` on its `Reveal`).
   *
   * It was a fixed 260 points, and the route panel — with the time per mode,
   * the bike types and the alternatives — is taller than that: the locate
   * button sat on top of the panel's star and close cross (author's photo).
   * The fixed value stays as the floor, for the instant before the first
   * measurement.
   */
  const shownPanel = selectedPlace ? 'place' : destination ? 'route' : measuring ? 'measure' : null;
  const raisedBottom = Math.max(
    insets.bottom + 260,
    (shownPanel ? panelHeights[shownPanel] : 0) + 12,
  );

  /**
   * How high the map's compass sits, in the bottom-left corner.
   *
   * It lives here and not in `MapView` because **the corner is shared** and
   * covered by the bottom panels. The compass has to follow the same three
   * heights as the floating buttons, otherwise it ends up under one of them or
   * behind a panel — and since it only shows with the map rotated, the
   * misalignment goes unnoticed by anyone who never rotates the map.
   *
   * The numbers are the same as `measureRaised`, `locateNavigating` and
   * `measureButton`, in that order.
   */
  const compassBottom =
    selectedPlace || destination || measuring
      ? raisedBottom
      : navigating
        ? // While navigating, this corner has the speedometer, which `NavigationPanel`
          // puts at 130. The compass goes above it — they were at the same height,
          // and with the map turning with the heading the compass is always in
          // view, so they sat on top of each other the whole trip. Of the two, the
          // speedometer owns the lower spot.
          insets.bottom + 192
        : // Above the tab bar. The ruler that used to share this corner now
          // lives in the layers panel.
          insets.bottom + TAB_BAR_HEIGHT + 16;

  /**
   * Whether the tab bar shows: only on the plain map. Every bottom panel sits
   * where it would be, and so does navigation.
   */
  const tabsVisible =
    !navigating &&
    !selectedPlace &&
    !destination &&
    !measuring &&
    !transitVisible &&
    !searchFocused;

  const activeTab: Tab = savedVisible
    ? 'saved'
    : settingsVisible
      ? 'settings'
      : directionsVisible
        ? 'go'
        : 'explore';

  const handleTabPress = useCallback((tab: Tab) => {
    if (tab === 'go') {
      setDirectionsVisible(true);
    } else if (tab === 'saved') {
      setSavedVisible(true);
    } else if (tab === 'settings') {
      setSettingsVisible(true);
    }
  }, []);

  const handleTapEmpty = useCallback((coordinates: Coordinates) => {
    // With the measuring tape on, a tap adds a point and nothing else.
    if (measuringRef.current) {
      setMeasurePoints((atuais) => [...atuais, coordinates]);
      return;
    }

    setHintVisible(true);
    if (hintTimer.current) {
      clearTimeout(hintTimer.current);
    }
    hintTimer.current = setTimeout(() => setHintVisible(false), 3500);
  }, []);

  /**
   * The measuring tape read from a `ref`, not from state.
   *
   * If `handleTapEmpty` depended on `measuring`, its identity changed whenever
   * it was turned on or off — and `MapView` re-rendered because of it.
   */
  const measuringRef = useRef(false);
  measuringRef.current = measuring;

  // Without this, leaving the screen with the hint counting left a stray timer.
  useEffect(() => () => {
    if (hintTimer.current) {
      clearTimeout(hintTimer.current);
    }
  }, []);

  const handleStartNavigation = useCallback(() => {
    // Navigation always follows the GPS. A route planned from somewhere else
    // is redrawn from where the person really is at the first reading.
    setRouteOrigin(null);
    announced.current.clear();
    offRouteStrikes.current = 0;
    setSelectedPlace(null);
    setStepsVisible(false);
    setProgressIndex(0);

    // What is left is worked out now, with the position at hand. Without this
    // the panel started at zero and only corrected itself on the first GPS
    // reading — which, with the person standing still waiting to set off,
    // might never come. That is what showed "1 min · 0 m" on a route of
    // kilometres.
    if (route && route.coordinates.length > 0) {
      const aqui = userLocationRef.current;
      const inicio = aqui ? locateOnRoute(route.coordinates, aqui).index : 0;
      const faltam = distanceAlong(route.coordinates, inicio, route.coordinates.length - 1);

      setRemaining({
        meters: faltam,
        seconds:
          route.distanceMeters > 0
            ? route.durationSeconds * (faltam / route.distanceMeters)
            : route.durationSeconds,
      });
    }

    setNavCameraFree(false);
    setNavigating(true);
  }, [route]);

  /**
   * Over the road's limit: said once, as Waze does with its chime, and then not
   * again for a minute. The sign turning red does the rest — a voice repeating
   * the limit every second would be switched off on the first trip.
   */
  useEffect(() => {
    if (!navigating || !settings.speedLimitAlerts || !settings.voiceGuidance) {
      return;
    }
    if (roadLimit === null || speedKmh === null) {
      return;
    }
    if (speedKmh <= roadLimit + SPEED_OVER_LIMIT_KMH) {
      return;
    }
    const agora = Date.now();
    if (agora - lastLimitWarning.current < LIMIT_WARNING_EVERY_MS) {
      return;
    }
    lastLimitWarning.current = agora;
    speak(t().navigation.overLimitVoice(roadLimit));
  }, [navigating, settings.speedLimitAlerts, settings.voiceGuidance, roadLimit, speedKmh]);

  const handleStopNavigation = useCallback(() => {
    setNavigating(false);
    setNextStep(null);
    setThenStep(null);
    setRoadLimit(null);
    setNavCameraFree(false);
    setRecalculating(false);
    stopSpeaking();
  }, []);

  /**
   * The GPS button: one tap centres once, two taps make the camera move with
   * the person.
   *
   * **A single tap acts at once, without waiting to see if another follows.**
   * Waiting three hundred milliseconds for a second tap that hardly ever comes
   * made the most used action feel slow to serve the least used. So the second
   * tap promotes what the first already did: the first takes the camera to the
   * position, the second tells it to stay there.
   *
   * With following on, any tap turns it off. The button is lit, you press it and
   * it goes off — what one expects from a lit button, and no need to hit another
   * double tap to undo it.
   */
  const handleLocatePress = useCallback(() => {
    // Navigation has its own following, which turns the map with the heading.
    // Here the button only ties the camera to the car again after the map was
    // dragged to peek at what comes next.
    if (navigating) {
      mapRef.current?.followAgain();
      setNavCameraFree(false);
      return;
    }

    const agora = Date.now();
    const duplo = agora - lastLocateTap.current < DOUBLE_TAP_MS;
    // Zero and not `now`: otherwise the third tap in a row counted as a second
    // double tap, and three taps in a row turned following on and off without
    // anyone understanding why.
    lastLocateTap.current = duplo ? 0 : agora;

    if (followUser) {
      setFollowUser(false);
      return;
    }

    if (duplo) {
      setFollowUser(true);
      return;
    }

    // Do not centre on what is in state: ask the service, which only returns
    // the stored position if it is still recent and fetches a new one if not.
    // That is what stops the map going to a place one has already been after
    // the app passed through the background — see `getBestPosition`.
    void (async () => {
      const posicao = await getBestPosition();
      if (!posicao) {
        // Doing nothing is the worst this button could do: whoever presses it is
        // left not knowing whether the app heard. Indoors the GPS really is slow,
        // and saying so saves the person pressing and waiting for nothing.
        setPlacesError(t().errors.locationUnavailable);
        return;
      }
      userLocationRef.current = posicao;
      setUserLocation(posicao);
      mapRef.current?.recenter(posicao);
    })();
  }, [navigating, followUser]);

  /**
   * Choosing a destination turns following off.
   *
   * With a destination chosen, the map frames the whole route — and a camera
   * tied to the person undid that framing on the first GPS reading. Whoever
   * chooses a destination wants to see the way, not their own dot.
   */
  useEffect(() => {
    if (destination || navigating) {
      setFollowUser(false);
    }
  }, [destination, navigating]);

  const placesById = useMemo(() => {
    const index = new Map<number, Place>();
    for (const place of places) {
      index.set(place.id, place);
    }
    return index;
  }, [places]);

  /**
   * A tap on one of the map's own pins: open it at once with what the tile
   * knows, then fill in hours, phone and website with one small Overpass query.
   */
  const handleTilePoiPress = useCallback((place: Place) => {
    setSelectedPlace(place);
    void placeDetails(place).then((full) => {
      if (!full) {
        return;
      }
      setSelectedPlace((current) =>
        current && current.id === place.id
          ? { ...current, ...full, id: place.id, coordinates: place.coordinates }
          : current,
      );
    });
  }, []);

  const handlePlacePress = useCallback(
    (placeId: number) => {
      const place = placesById.get(placeId);
      if (place) {
        setSelectedPlace(place);
      }
    },
    [placesById],
  );

  /**
   * Long press on the map: drops a pin there and opens its card.
   *
   * The card shows at once, with the coordinates, and the address comes later —
   * so there is no waiting for Nominatim to be able to draw the route.
   */
  const handleDropPin = useCallback((coordinates: Coordinates) => {
    const fallback: Place = {
      // Negative id so it never clashes with OpenStreetMap's.
      id: -Date.now(),
      name: t().search.mapPoint,
      address: `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`,
      coordinates,
    };

    setDroppedPin(coordinates);
    setSelectedPlace(fallback);
    setCategory(null);

    void (async () => {
      const found = await reverseGeocode(coordinates);
      if (!found) {
        return;
      }
      // Only replaced if the person is still looking at this same pin.
      setSelectedPlace((current) =>
        current?.id === fallback.id
          ? { ...found, id: fallback.id, coordinates: fallback.coordinates }
          : current,
      );
    })();
  }, []);

  const handleSearchSelect = useCallback((place: Place) => {
    setCategory(null);
    setSelectedPlace(null);
    setDroppedPin(null);
    // New destination, new trip: the previous route's stops have nothing to
    // do with this one.
    setWaypoints([]);
    setDestination(place);
  }, []);

  /**
   * A location sent by another app: "Open in maps" in WhatsApp, Contacts,
   * Calendar, a web page (`geo:` links), or a navigation request
   * (`google.navigation:`). Registered in `app.json` (`intentFilters`).
   *
   * It becomes the destination, as if picked in the search: the route panel
   * opens ready for "Start". A point without a name gets its address from
   * Nominatim afterwards, like a dropped pin; a text is searched once.
   *
   * Both ways in are needed: `getInitialURL` when the link started the app,
   * the `url` event when it was already open (Expo's activity is singleTask).
   */
  useEffect(() => {
    const open = (url: string | null) => {
      const link = url ? parseGeoLink(url) : null;
      if (!link) {
        return;
      }
      if (link.coordinates) {
        const coordinates = link.coordinates;
        const place: Place = {
          id: -Date.now(),
          name: link.label || t().search.mapPoint,
          address: `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`,
          coordinates,
        };
        if (link.label) {
          handleSearchSelect(place);
          return;
        }
        // The address is asked first and the destination set once: changing
        // it afterwards would ask OSRM for the same route a second time. Four
        // seconds at most, then the coordinates do as the name.
        const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000));
        void Promise.race([reverseGeocode(coordinates).catch(() => null), timeout]).then(
          (found) => handleSearchSelect(found ? { ...found, id: place.id, coordinates } : place),
        );
        return;
      }
      if (link.query) {
        const query = link.query;
        void searchPlaces(query, 1)
          .then((found) => {
            if (found[0]) {
              handleSearchSelect(found[0]);
            } else {
              Alert.alert(t().search.linkNotFound(query));
            }
          })
          .catch(() => Alert.alert(t().search.linkNotFound(query)));
      }
    };
    void Linking.getInitialURL().then(open).catch(() => undefined);
    const subscription = Linking.addEventListener('url', (event) => open(event.url));
    return () => subscription.remove();
  }, [handleSearchSelect]);

  /**
   * Adds a stop to the existing route.
   *
   * It goes at the end of the list, before the destination: the natural order
   * for someone adding places along the way. Reordering would be one more screen
   * for little use.
   */
  const handleAddWaypoint = useCallback((place: Place) => {
    setWaypoints((atuais) =>
      atuais.some((w) => isSamePlace(w, place)) ? atuais : [...atuais, place],
    );
    setSelectedPlace(null);
    setDroppedPin(null);
  }, []);

  /**
   * Draws the way to a stop, from the transport panel.
   *
   * The travel mode is not touched here on purpose: someone catching the bus
   * usually walks, but may cycle or leave the car nearby. Changing the setting
   * behind the person's back would be deciding for them.
   */
  // Switching to the transport map draws the stops already in view, without
  // waiting for the map to move.
  useEffect(() => {
    const current = viewport.current;
    if (settings.mapType !== 'transit' || !current || current.zoom < STOPS_MAP_MIN_ZOOM) {
      setMapStops([]);
      return;
    }
    let cancelled = false;
    void stopsInBounds(current.bounds)
      .then((found) => {
        if (!cancelled) {
          setMapStops(found);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [settings.mapType]);

  // The timetables for the area (metro, train, Metro Sul do Tejo) arrive on
  // their own the first time the transport map opens there — see
  // `ensureFeedsFor`. Without this the metro "did not exist" until someone
  // found the download in Settings.
  useEffect(() => {
    if (settings.mapType !== 'transit' || !perto) {
      return;
    }
    const [lat, lon] = perto.split(',').map(Number);
    void ensureFeedsFor({ latitude: lat, longitude: lon });
  }, [settings.mapType, perto]);

  /** What the transport map draws: the stops in view plus the panel's list. */
  const mapStopsShown = useMemo(() => {
    const byId = new Map<string, TransitStop>();
    for (const stop of [...transitStops, ...mapStops]) {
      if (!byId.has(stop.id)) {
        byId.set(stop.id, stop);
      }
    }
    return [...byId.values()];
  }, [transitStops, mapStops]);

  /*
    The lists handed to the map are kept the same array while nothing in them
    changes. The map turns each into GeoJSON text only when its list changes;
    a list rebuilt on every render here — every GPS reading — redid that work
    for nothing.
  */
  const mapAlternatives = useMemo(
    () => (navigating ? [] : routeOptions.filter((_, i) => i !== routeIndex)),
    [navigating, routeOptions, routeIndex],
  );
  const mapWaypoints = useMemo(() => waypoints.map((w) => w.coordinates), [waypoints]);
  const mapTransitStops = useMemo(() => {
    const trip = transitTrips?.[transitTripIndex];
    if (!trip) {
      return mapStopsShown;
    }
    return [trip.from, ...(trip.change ? [trip.change.at, trip.change.boardAt] : []), trip.to];
  }, [transitTrips, transitTripIndex, mapStopsShown]);

  /**
   * The panel's list, with the stop tapped on the map at the top when it is
   * not already among the nearest — otherwise tapping a stop a few streets
   * away opened a panel that did not show it.
   */
  const sheetStops = useMemo(() => {
    if (!selectedStopId || transitStops.some((s) => s.id === selectedStopId)) {
      return transitStops;
    }
    const tapped = mapStops.find((s) => s.id === selectedStopId);
    return tapped ? [tapped, ...transitStops] : transitStops;
  }, [transitStops, mapStops, selectedStopId]);

  /** A tap on a stop opens its times straight away, without the clock button. */
  const handleStopPress = useCallback((stopId: string) => {
    setSelectedStopId(stopId);
    setTransitVisible(true);
  }, []);

  // Where "my location" is, in words: one Nominatim request per destination
  // (rounded to about ten metres, so the service's cache answers repeats).
  useEffect(() => {
    if (!destination || routeOrigin) {
      return;
    }
    const aqui = userLocationRef.current;
    if (!aqui) {
      return;
    }
    let cancelled = false;
    void reverseGeocode({
      latitude: Math.round(aqui.latitude * 10000) / 10000,
      longitude: Math.round(aqui.longitude * 10000) / 10000,
    }).then((place) => {
      if (!cancelled) {
        // The first part of the address that is not a house number: the street.
        const rua = place?.address
          ?.split(',')
          .map((part) => part.trim())
          .find((part) => part && !/^\d+[A-Za-z]?$/.test(part));
        setHereName(rua || place?.name || null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [destination, routeOrigin, hasLocation]);

  const handleGoToStop = useCallback((stop: TransitStop) => {
    setTransitVisible(false);
    setSelectedStopId(null);
    // New destination, new trip: the previous route's stops have nothing to
    // do with this one.
    setWaypoints([]);
    setSelectedPlace(null);
    setDroppedPin(null);
    setDestination({
      id: -Date.now(),
      name: stop.name,
      address: stop.locality ? `${t().route.busStop} · ${stop.locality}` : t().route.busStop,
      coordinates: stop.coordinates,
      category: t().route.busStop,
    });
  }, []);

  const handleRouteToSelected = useCallback(() => {
    if (selectedPlace) {
      // As with search: new destination, new trip. Without this, the route to the
      // new place was still forced through the old route's stop.
      setWaypoints([]);
      setDestination(selectedPlace);
      setSelectedPlace(null);
      // The destination gets its own marker, so the pin goes.
      setDroppedPin(null);
    }
  }, [selectedPlace]);

  const handleClearRoute = useCallback(() => {
    setDestination(null);
    setRouteOrigin(null);
    setWaypoints([]);
    setRoute(null);
    setRouteError(null);
    setDroppedPin(null);
  }, []);

  // See the note by the panels, further down.
  const lastPlace = useLastValue(selectedPlace);
  const lastDestination = useLastValue(destination);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        userLocation={userLocation}
        destination={destination?.coordinates ?? null}
        pinned={selectedPlace ?? destination}
        route={route}
        places={places}
        onViewportChange={handleViewportChange}
        onPlacePress={handlePlacePress}
        tilePois={
          settings.showPlacesOnMap &&
          !category &&
          !localPoisHere &&
          settings.mapType !== 'transit'
        }
        onTilePoiPress={handleTilePoiPress}
        droppedPin={droppedPin}
        onDropPin={handleDropPin}
        onTapEmpty={handleTapEmpty}
        following={navigating}
        followUser={followUser}
        onFollowUserChange={(seguir) => {
          setFollowUser(seguir);
          if (!seguir && navigating) {
            setNavCameraFree(true);
          }
        }}
        progressIndex={progressIndex}
        cameras={cameras}
        measurePoints={measuring ? measurePoints : undefined}
        measureClosed={measureMode === 'area'}
        alternativeRoutes={mapAlternatives}
        waypoints={mapWaypoints}
        transitStops={mapTransitStops}
        selectedStopId={selectedStopId}
        onStopPress={handleStopPress}
        transitStations={transitStations}
        vehicles={vehicles}
        compassBottom={compassBottom}
        offlineRegions={offlineRegions}
        labelsReady={labelsReady}
      />

      {!navigating ? (
      <View
        style={[styles.top, searchFocused && styles.searchBackdrop]}
        pointerEvents="box-none"
      >
        <SearchBar
          onSelect={(place) => {
            // A destination picked from the main search starts from the GPS,
            // as it always did; only the Directions screen changes the start.
            setRouteOrigin(null);
            handleSearchSelect(place);
          }}
          onFocusChange={setSearchFocused}
          favourites={favourites}
          recents={recents}
          getBounds={getMapBounds}
        />

        {searchFocused ? null : (
          <>
            <CategoryBar selected={category} onSelect={setCategory} />

            {/*
              The map layers button, under the search bar on the right, where
              people look for it. It replaces the corner button that cycled
              through the map types.
            */}
            {!navigating ? (
              <Pressable
                style={({ pressed }) => [styles.layersTop, pressed && styles.buttonPressed]}
                onPress={() => setLayersVisible(true)}
                accessibilityLabel={t().layers.open}
              >
                <MaterialCommunityIcons name="layers-outline" size={22} color={theme.text} />
              </Pressable>
            ) : null}
          </>
        )}

        {locationDenied ? (
          <Text style={styles.notice}>
            {strings.errors.locationDenied}
          </Text>
        ) : null}

        {placesError ? <Text style={styles.notice}>{placesError}</Text> : null}

        <Reveal
          visible={
            hintVisible && !destination && !selectedPlace && !locationDenied && !placesError
          }
          from={-10}
        >
          <Text style={styles.hint}>
            {strings.hints.longPress}
          </Text>
        </Reveal>
      </View>
      ) : null}

      {/*
        The business card takes priority over the route panel.

        Both draw from the last value they had, not the current one: as soon as one
        closes, the value becomes null, and without this there was nothing to
        animate — the panel vanished in an instant. `visible` is what takes it off
        screen.
      */}
      {lastPlace ? (
        <Reveal
          style={styles.bottom}
          visible={!navigating && !!selectedPlace}
          onLayout={measurePanel('place')}
        >
          <DraggableSheet>
            {(drag) => (
              <PlaceSheet
                dragHandlers={drag}
                place={lastPlace}
                from={userLocation}
                favourite={isFavourite(lastPlace)}
                onToggleFavourite={() => toggleFavourite(lastPlace)}
                onRoute={handleRouteToSelected}
                onAddStop={destination ? () => handleAddWaypoint(lastPlace) : undefined}
                onClose={() => {
                  setSelectedPlace(null);
                  setDroppedPin(null);
                }}
              />
            )}
          </DraggableSheet>
        </Reveal>
      ) : null}

      {lastDestination ? (
        <Reveal
          style={styles.bottom}
          visible={!navigating && !selectedPlace && !!destination}
          onLayout={measurePanel('route')}
        >
          <DraggableSheet>
            {(drag) => (
              <RoutePanel
                dragHandlers={drag}
                fromLabel={
                  routeOrigin
                    ? routeOrigin.name
                    : hereName
                      ? `${t().directions.myLocation} (${hereName})`
                      : t().directions.myLocation
                }
                onOpenDirections={() => setDirectionsVisible(true)}
                destination={lastDestination}
                route={route}
                loading={routeLoading}
                error={routeError}
                onClear={handleClearRoute}
                onShowSteps={() => setStepsVisible(true)}
                onOpenNavSettings={() => {
                  setSettingsNavOnly(true);
                  setSettingsVisible(true);
                }}
                onStart={handleStartNavigation}
                favourite={isFavourite(lastDestination)}
                onToggleFavourite={() => toggleFavourite(lastDestination)}
                avoidTollsWanted={settings.avoidTolls}
                travelMode={settings.travelMode}
                onChangeTravelMode={(mode) => update('travelMode', mode)}
                bikeType={settings.bikeType}
                onChangeBikeType={(bike) => update('bikeType', bike)}
                modeTimes={modeTimes}
                waypoints={waypoints}
                onRemoveWaypoint={(i) =>
                  setWaypoints((atuais) => atuais.filter((_, j) => j !== i))
                }
                options={routeOptions}
                optionIndex={routeIndex}
                onChooseOption={setRouteIndex}
                transitTrips={transitTrips}
                transitTripIndex={transitTripIndex}
                onChooseTransitTrip={setTransitTripIndex}
              />
            )}
          </DraggableSheet>
        </Reveal>
      ) : null}

      {measuring ? (
        <Reveal style={styles.bottom} onLayout={measurePanel('measure')}>
          <DraggableSheet>
            {(drag) => (
              <MeasureSheet
                dragHandlers={drag}
                points={measurePoints}
                mode={measureMode}
                onChangeMode={setMeasureMode}
                onUndo={() => setMeasurePoints((atuais) => atuais.slice(0, -1))}
                onClear={() => setMeasurePoints([])}
                onClose={() => {
                  setMeasuring(false);
                  setMeasurePoints([]);
                }}
              />
            )}
          </DraggableSheet>
        </Reveal>
      ) : null}

      {/*
        The arrival times. Only on the transport map: elsewhere it would be one more
        button covering the map for someone driving.
      */}
      {!navigating && settings.mapType === 'transit' ? (
        <Pressable
          style={({ pressed }) => [
            styles.transitButton,
            selectedPlace || destination || measuring ? { bottom: raisedBottom + 62 } : null,
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={() => setTransitVisible(true)}
        >
          <MaterialCommunityIcons name="clock-outline" size={22} color={theme.accent} />
        </Pressable>
      ) : null}

      {/*
        The Directions button, bottom right, the most used action of a maps
        app. Only on the plain map: with a panel open there is already a route
        or a place on screen.
      */}
      {tabsVisible ? (
        <Pressable
          style={({ pressed }) => [styles.directionsFab, pressed && styles.buttonPressed]}
          onPress={() => setDirectionsVisible(true)}
          accessibilityLabel={t().directions.open}
        >
          <MaterialCommunityIcons name="directions" size={28} color={theme.onAccent} />
        </Pressable>
      ) : null}

      {/*
        Button to go back to the current position.

        One tap centres, two taps make the camera move with the person — see
        `handleLocatePress`. While following it stays lit, like the measuring tape
        button, because it is a mode one enters and not an action one does.

        While navigating it is replaced by "Re-centre", which ties the camera to the
        car again after the map was dragged.

        **The button does not depend on the position being known yet**, and that was
        once the other way round: it only appeared after the first position. The GPS
        not answering — indoors, or standing still, where slow tracking may never
        give a reading — was enough for there to be no button at all, which is
        exactly when it is needed most. With no position, pressing it is what sends
        the GPS looking. It only disappears if the permission was refused, because
        then there is nothing it can do.
      */}
      {!locationDenied && !navigating ? (
        <Pressable
          style={({ pressed }) => [
            styles.locateButton,
            followUser && !navigating ? styles.locateFollowing : null,
            navigating
              ? styles.locateNavigating
              : selectedPlace || destination || measuring
                ? { bottom: raisedBottom }
                : null,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleLocatePress}
        >
          <MaterialCommunityIcons
            name="crosshairs-gps"
            size={24}
            color={followUser && !navigating ? theme.onAccent : theme.accent}
          />
        </Pressable>
      ) : null}

      {/*
        The speedometer when driving, **without navigating**.

        Only above `DRIVING_SPEED_MS`: standing or walking it would be a permanent
        zero taking up the corner. It sits above the compass — the heights of the
        left corner are all here and in `compassBottom`, on purpose.

        While navigating `NavigationPanel` draws it, lower down, because there the
        other buttons and the compass are not shown.
      */}
      {!navigating && drivingGps && settings.showSpeed ? (
        <SpeedBadge kmh={speedKmh} bottom={compassBottom + 52} />
      ) : null}

      {navigating ? (
        <NavigationPanel
          step={nextStep}
          thenStep={thenStep}
          roadLimit={settings.speedLimitAlerts ? roadLimit : null}
          cameraFree={navCameraFree}
          onRecenter={handleLocatePress}
          onOverview={() => {
            mapRef.current?.overview();
            setNavCameraFree(true);
          }}
          distanceToStep={distanceToStep}
          remainingMeters={remaining.meters}
          remainingSeconds={remaining.seconds}
          pace={livePace}
          recalculating={recalculating}
          camera={
            cameraAhead
              ? {
                  label: cameraLabel(cameraAhead.camera),
                  icon: cameraIcon(cameraAhead.camera.kind),
                  maxspeed: cameraAhead.camera.maxspeed,
                  meters: cameraAhead.meters,
                }
              : null
          }
          speedKmh={settings.showSpeed ? speedKmh : null}
          onStop={handleStopNavigation}
        />
      ) : null}

      {/*
        The new-version notice. It shows on top of everything as soon as the check
        answers, and only when that version has not been dismissed.
      */}
      <UpdateSplash
        info={
          updateInfo && (installUnfinished || updateInfo.build > updateDismissed)
            ? updateInfo
            : null
        }
        unfinished={installUnfinished}
        // The installer is not opened by itself for someone who just saw it fail.
        autoDownload={false}
        onDismiss={() => {
          if (!updateInfo) {
            return;
          }
          if (installUnfinished) {
            setInstallUnfinished(false);
            void forgetInstallAttempt();
          }
          setUpdateDismissed(updateInfo.build);
          void AsyncStorage.setItem(
            UPDATE_DISMISSED_KEY,
            String(updateInfo.build),
          ).catch(() => undefined);
        }}
      />

      <SettingsSheet
        visible={settingsVisible}
        onRecentsCleared={() => setRecents([])}
        update={updateInfo}
        onUpdateFound={setUpdateInfo}
        onlyNavigation={settingsNavOnly}
        onClose={() => {
          setSettingsVisible(false);
          setSettingsNavOnly(false);
          // A country may have been downloaded or deleted in there.
          setOfflineRegions(installedRegions());
        }}
      />

      {/*
        The arrival times. Mounted only while open: when it closes, the
        thirty-second timer that updates the minutes has to stop, and unmounting is
        the surest way to guarantee it.
      */}
      {transitVisible ? (
        <Reveal style={styles.bottom}>
          <DraggableSheet>
            {(drag) => (
              <TransitSheet
                dragHandlers={drag}
                stops={sheetStops}
                stations={transitStations}
                loading={transitLoading}
                error={transitError}
                outside={transitOutside}
                semPosicao={!userLocation}
                onClose={() => {
                  setTransitVisible(false);
                  setSelectedStopId(null);
                }}
                onGoToStop={handleGoToStop}
                onSelectedStopChange={setSelectedStopId}
                selectedStopId={selectedStopId}
              />
            )}
          </DraggableSheet>
        </Reveal>
      ) : null}

      {tabsVisible ? (
        <BottomTabs
          active={activeTab}
          onPress={handleTabPress}
          updateAvailable={updateInfo !== null}
        />
      ) : null}

      <LayersSheet
        visible={layersVisible}
        onClose={() => setLayersVisible(false)}
        onMeasure={() => {
          setMeasuring(true);
          setMeasurePoints([]);
        }}
      />

      <SavedSheet
        visible={savedVisible}
        favourites={favourites}
        recents={recents}
        onClose={() => setSavedVisible(false)}
        onSelect={(place) => {
          setRouteOrigin(null);
          handleSearchSelect(place);
        }}
      />

      <DirectionsSheet
        visible={directionsVisible}
        origin={routeOrigin}
        destination={destination}
        travelMode={settings.travelMode}
        favourites={favourites}
        recents={recents}
        getBounds={getMapBounds}
        onClose={() => setDirectionsVisible(false)}
        onConfirm={(from, to, mode) => {
          setDirectionsVisible(false);
          setRouteOrigin(from);
          if (mode !== settings.travelMode) {
            update('travelMode', mode);
          }
          handleSearchSelect(to);
        }}
      />

      <StepsList
        visible={stepsVisible}
        route={route}
        onClose={() => setStepsVisible(false)}
      />

      {/* "auto" faz a barra de estado acompanhar o tema claro/escuro. */}
      <StatusBar style="auto" />
    </View>
  );
}

/**
 * Keeps the last value that was not null.
 *
 * So a panel can fade off screen: the moment it closes, what it showed no
 * longer exists, and without a copy there was nothing to draw during the exit
 * animation.
 */
function useLastValue<T>(value: T | null): T | null {
  const last = useRef<T | null>(value);
  if (value) {
    last.current = value;
  }
  return last.current;
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    /** The search open: the header covers the whole screen. */
    searchBackdrop: {
      bottom: 0,
      backgroundColor: theme.surface,
    },
    /** The map layers button, right-aligned under the category chips. */
    layersTop: {
      alignSelf: 'flex-end',
      marginRight: 14,
      marginTop: 2,
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      elevation: 6,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    /** The main action: a larger, filled button on the tab bar's right. */
    directionsFab: {
      position: 'absolute',
      right: 14,
      bottom: insets.bottom + TAB_BAR_HEIGHT + 14,
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.accent,
      elevation: 8,
      shadowColor: '#000000',
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    top: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      // No side padding here on purpose. The search bar wants a margin on both
      // sides; the category buttons want to start aligned with it but run off
      // the right edge, to show there is more to the side. Each handles its own.
      paddingTop: insets.top + 12,
    },
    notice: {
      marginTop: 8,
      marginRight: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: theme.overlay,
      color: theme.onOverlay,
      fontSize: 13,
    },
    bottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    },
    hint: {
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: theme.overlay,
      color: theme.onOverlay,
      fontSize: 12,
    },
    transitButton: {
      position: 'absolute',
      right: 16,
      // Above the locate button, which is above the Directions button.
      bottom: insets.bottom + TAB_BAR_HEIGHT + 16 + 64 + 64,
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      elevation: 6,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    locateButton: {
      position: 'absolute',
      right: 16,
      // Above the Directions button, which sits on the tab bar.
      bottom: insets.bottom + TAB_BAR_HEIGHT + 16 + 64,
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
      elevation: 6,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    // With a panel open at the bottom, the button moves up so it is not covered.
    /**
     * Touch feedback for the round buttons.
     *
     * Done by hand on purpose. Android's ripple (`android_ripple`) becomes the
     * button's background and wipes the `backgroundColor` — that is how the white
     * circles of these two disappeared and the icons floated loose on the map.
     */
    buttonPressed: {
      transform: [{ scale: 0.92 }],
      opacity: 0.9,
    },
    /** Above the navigation panel, which is lower than the others. */
    locateNavigating: {
      bottom: insets.bottom + 130,
    },
    /** Lit while the camera moves with the person, like the measuring tape button. */
    locateFollowing: {
      backgroundColor: theme.accent,
    },
  });
}
