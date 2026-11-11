import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Images,
  Layer,
  VectorSource,
  Map,
  Marker,
  type PressEvent,
  type TrackUserLocationChangeEvent,
  UserLocation,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Network from 'expo-network';
import { Animated, AppState, Easing, type NativeSyntheticEvent, StyleSheet, View } from 'react-native';

import { type SpeedCamera } from '../services/cameras';
import { stationLabel, type TransitStation, type TransitStop } from '../services/transit';
import { regionForView, type OfflineRegion } from '../services/offlineMap';
import type { LiveVehicle } from '../services/vehicles';
import { mapStyleFor } from '../services/tiles';
import { watchCompass } from '../services/location';
import { useSettings, useTheme } from '../settings';
import type { Bounds, Coordinates, Place, Route } from '../types/geo';
import { formatDistance } from '../utils/format';
import { categoryLabel } from '../utils/categories';
import { MAP_PINS_MIN_ZOOM } from '../services/config';
import type { FilterSpecification } from '@maplibre/maplibre-gl-style-spec';
import { boundsOf, distanceMeters } from '../utils/geometry';
import {
  TILE_POI_COLOUR,
  TILE_POI_ICON,
  TILE_POI_PRIORITY,
  poiLook,
  type PoiFamily,
} from '../utils/poiStyle';
import { POI_IMAGE_SOURCES } from '../../assets/poi';

/** The MaterialCommunityIcons glyph inside the red pin, per family. */
const PIN_GLYPH: Record<PoiFamily, string> = {
  food: 'silverware-fork-knife',
  shop: 'shopping',
  health: 'plus-thick',
  lodging: 'bed',
  service: 'office-building',
  leisure: 'camera',
  other: 'circle',
};

/** OpenFreeMap's TileJSON: free, no key, OpenStreetMap data. See `tilePois`. */
const OPENFREEMAP_TILEJSON = 'https://tiles.openfreemap.org/planet';
const OPENFREEMAP_ATTRIBUTION = 'OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors';

/**
 * Named places, minus transport stops and entrances — those are not
 * businesses, and the transport map has its own stops.
 */
const TILE_POI_FILTER = [
  'all',
  ['has', 'name'],
  [
    '!',
    [
      'in',
      ['get', 'class'],
      ['literal', ['bus', 'railway', 'aerialway', 'ferry_terminal', 'entrance', 'tram']],
    ],
  ],
  // Trail signposts and boards ("TB.442") — spam on the map, as the author saw.
  ['!=', ['coalesce', ['get', 'subclass'], ''], 'information'],
  ['!=', ['coalesce', ['get', 'class'], ''], 'information'],
] as unknown as FilterSpecification;

interface MapViewProps {
  userLocation: Coordinates | null;
  destination: Coordinates | null;
  /**
   * The place that gets the big red pin: the one whose card is open, or the
   * destination. Its kind picks the glyph inside the pin.
   */
  pinned?: Place | null;
  route: Route | null;
  /** Businesses to mark on the map. */
  places: Place[];
  /** Called when the map stops moving, with the visible area and the zoom. */
  onViewportChange: (bounds: Bounds, zoom: number) => void;
  /** Called on a tap on a business pin. */
  onPlacePress: (placeId: number) => void;
  /**
   * Draw the businesses that come inside OpenFreeMap's vector tiles. They
   * arrive with the map — no request of our own, no wait — so they replace the
   * Overpass pins wherever no downloaded country has a business file.
   */
  tilePois?: boolean;
  /** A tap on one of those pins, with what the tile knows about it. */
  onTilePoiPress?: (place: Place) => void;
  /** Pin dropped with a long press, waiting to become the destination. */
  droppedPin: Coordinates | null;
  /** Called on a long press anywhere on the map. */
  onDropPin: (coordinates: Coordinates) => void;
  /**
   * Called on a single tap on the map, away from any pin.
   *
   * It carries the coordinates because the measuring tape needs them — for the
   * other uses, knowing there was a tap is enough.
   */
  onTapEmpty: (coordinates: Coordinates) => void;
  /** The measuring tape's points, in the order they were placed. */
  measurePoints?: Coordinates[];
  /** Whether the tape is measuring a closed shape instead of a line. */
  measureClosed?: boolean;
  /** The routes not chosen, drawn faded underneath. */
  alternativeRoutes?: Route[];
  /** Stops along the way, marked on the route. */
  waypoints?: Coordinates[];
  /** While navigating the map follows the position and turns with the heading. */
  following?: boolean;
  /**
   * Outside navigation: the camera moves with the person, without turning the map.
   *
   * It is what a double tap on the GPS button turns on. It does not turn on
   * purpose — when driving, turning the map with the heading helps; on foot,
   * looking at the phone, a map that turns by itself only disorients.
   */
  followUser?: boolean;
  /**
   * Called when following drops by itself.
   *
   * MapLibre lets go as soon as the person drags the map — and without this the
   * button stayed lit saying it followed when it no longer did.
   */
  onFollowUserChange?: (following: boolean) => void;
  /**
   * How far along the route the person is, while navigating.
   *
   * What is behind is drawn faded, so what is left stands out at a glance —
   * when driving there is no time to look for where the line was.
   */
  progressIndex?: number;
  /**
   * Speed cameras on the route, to be seen before getting there.
   *
   * Only the route's: marking every one in the area filled the map with points
   * that do not matter to someone going another way.
   */
  cameras?: SpeedCamera[];
  /** Transport stops to mark on the map, while the panel is open. */
  transitStops?: TransitStop[];
  /** The stop open in the panel, drawn highlighted. */
  selectedStopId?: string | null;
  /**
   * A line tapped in the stop panel: its way from the boarding stop, through
   * its stops, in the line's colour (the theme's accent without one).
   */
  journeyLine?: { coordinates: Coordinates[]; colour: string | null } | null;
  /** Called on a tap on a stop pin. */
  onStopPress?: (stopId: string) => void;
  /**
   * Train, metro, light-rail and ferry stations.
   *
   * For some of these only the location is known — not every operator has open
   * timetables. They show anyway: knowing there is a station there is half the
   * question.
   */
  transitStations?: TransitStation[];
  /**
   * The buses moving right now, with the line number.
   *
   * Only those that reported recently get here — the service returns the whole
   * fleet, parked ones included. See `src/services/vehicles.ts`.
   */
  vehicles?: LiveVehicle[];
  /**
   * How high the compass sits, in points from the bottom edge of the screen.
   *
   * The bottom-left corner is shared with other buttons and covered by the
   * bottom panels — see `compassBottom`, in `App.tsx`.
   */
  compassBottom: number;
  /** Country maps stored on the phone, for use without a network. */
  offlineRegions: OfflineRegion[];
  /**
   * Whether the fonts are installed yet.
   *
   * Without them a text layer draws nothing and gives no error — that is how an
   * earlier attempt at writing the names failed without anyone knowing why.
   */
  labelsReady: boolean;
  ref?: Ref<MapViewRef>;
}

export interface MapViewRef {
  /** Takes the camera back to the current position. */
  recenter: (coordinates: Coordinates) => void;
  /** Ties the camera to the car again, while navigating. */
  followAgain: () => void;
  /** During navigation: let go of the car and frame what is left of the route. */
  overview: () => void;
}

/**
 * The compass cone in front of the blue dot (as in Google Maps): which way the
 * phone points, standing still too.
 *
 * Its own component on purpose. The compass reads many times a second while
 * the phone moves in the hand; held in `App`, each reading redrew the whole
 * app — panels, map and every source. Here it redraws one layer.
 *
 * Mounted only outside navigation (there the map itself turns with the
 * heading), and the sensor is only read while the app is on screen: nobody
 * looks at the cone in a pocket.
 */
function HeadingCone() {
  const [heading, setHeading] = useState<number | null>(null);

  useEffect(() => {
    let stop: (() => void) | null = null;
    // Each start gets a number; a subscription that arrives after a newer start
    // or a stop is dropped at once, so none is left running.
    let generation = 0;
    const start = () => {
      const mine = ++generation;
      void watchCompass(setHeading).then((unsubscribe) => {
        if (mine === generation) {
          stop = unsubscribe;
        } else {
          unsubscribe();
        }
      });
    };
    const halt = () => {
      generation += 1;
      stop?.();
      stop = null;
    };
    start();
    const subscription = AppState.addEventListener('change', (estado) => {
      halt();
      if (estado === 'active') {
        start();
      }
    });
    return () => {
      halt();
      subscription.remove();
    };
  }, []);

  if (heading === null) {
    return null;
  }
  return (
    <Layer
      type="symbol"
      id="user-heading-cone"
      source="mlrn-user-location"
      layout={{
        'icon-image': 'heading-cone',
        'icon-rotate': heading,
        'icon-rotation-alignment': 'map',
        // 'viewport', not 'map': a map-aligned icon is drawn at the size of its
        // tile, so it grew and shrank against the blue dot with every zoom
        // (author's report). Facing the screen it keeps one size, like the dot.
        // The rotation stays tied to the map, so it still points north-relative.
        'icon-pitch-alignment': 'viewport',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      }}
    />
  );
}

/*
  One shared empty list for every list prop left out. A `= []` default is a
  new array on each render, which would rebuild the memoized sources every
  time.
*/
const NONE: never[] = [];

/** Where the camera starts while the person's position is not yet known. */
const DEFAULT_CENTER: [number, number] = [-9.1393, 38.7223]; // Lisboa
const DEFAULT_ZOOM = 11;

/**
 * Below this zoom the stored country no longer changes.
 *
 * 5 is the level at which half of Europe is in view: further out, no country
 * fills the screen, so choosing between them changes nothing that is seen — it
 * only makes the map reload, and that is what caused the jumps.
 */
const OFFLINE_SWITCH_MIN_ZOOM = 5;

/**
 * Draws the map with the OpenStreetMap tiles, the current position, the
 * businesses, the destination and the route line.
 */
export function MapView({
  userLocation,
  destination,
  pinned = null,
  route,
  places,
  onViewportChange,
  onPlacePress,
  tilePois = false,
  onTilePoiPress,
  droppedPin,
  onDropPin,
  onTapEmpty,
  following,
  followUser,
  onFollowUserChange,
  progressIndex = 0,
  cameras = NONE,
  measurePoints = NONE,
  measureClosed = false,
  alternativeRoutes = NONE,
  waypoints = NONE,
  transitStops = NONE,
  selectedStopId = null,
  journeyLine = null,
  transitStations = NONE,
  vehicles = NONE,
  onStopPress,
  compassBottom,
  offlineRegions,
  labelsReady,
  ref,
}: MapViewProps) {
  const cameraRef = useRef<CameraRef>(null);
  const theme = useTheme();
  const { settings } = useSettings();

  /** The stored map covering the area in view, if there is one. */
  const [offlineRegion, setOfflineRegion] = useState<OfflineRegion | null>(null);
  /**
   * The stored maps that failed to open.
   *
   * Kept **per country**, not as one yes-or-no for everything. It used to be a
   * latch that, once closed, turned offline off for the rest of the session: one
   * passing failure in one country was enough for another country's map —
   * downloaded and perfect — never to be used again, which in airplane mode is
   * an empty screen with no explanation at all.
   */
  const [failedRegions, setFailedRegions] = useState<string[]>([]);
  /**
   * Changes every time going back to the car is asked for while navigating.
   *
   * It is the camera's `key`. As soon as the person drags the map, MapLibre
   * drops following — and asking again does nothing, because the prop did not
   * change. Recreating the camera ties it to the position again.
   */
  const [followNonce, setFollowNonce] = useState(0);
  /** Navigation overview: the camera stops following so the route can be framed. */
  const [overviewing, setOverviewing] = useState(false);
  useEffect(() => {
    if (!following) {
      setOverviewing(false);
    }
  }, [following]);

  /**
   * Whether the Internet really reaches the phone.
   *
   * **`isInternetReachable`, not `isConnected`**: being on a Wi-Fi does not
   * mean getting out — a hotel with a login portal, or a network with no way
   * out, is connected and without Internet. What matters here is whether the
   * tiles will actually arrive.
   *
   * It starts `null` — "not known yet" — and while it is, **the stored map is
   * not used**: at start-up there is nearly always a network, and switching
   * style twice in a row makes the map reload in front of whoever is looking.
   */
  const [internetReachable, setInternetReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    void Network.getNetworkStateAsync()
      .then((estado) => {
        if (vivo) {
          setInternetReachable(estado.isInternetReachable ?? estado.isConnected ?? null);
        }
      })
      .catch(() => undefined);

    // The network comes and goes mid-trip — exactly the case stored maps are
    // for. Without listening, entering a tunnel left the map blank until the
    // app was closed and opened again.
    const subscricao = Network.addNetworkStateListener((estado) => {
      setInternetReachable(estado.isInternetReachable ?? estado.isConnected ?? null);
    });

    return () => {
      vivo = false;
      subscricao.remove();
    };
  }, []);

  /** How many route points are already behind. */
  const andado = following ? progressIndex : 0;

  /**
   * The tape's points, with the return to the start when measuring an area.
   * Without this the shape showed shaded with one side not drawn — and the
   * perimeter the panel shows did not match what was seen.
   */
  const measureLine = useMemo(() => {
    const par = (p: Coordinates): [number, number] => [p.longitude, p.latitude];
    const linha = measurePoints.map(par);
    if (measureClosed && measurePoints.length >= 3) {
      linha.push(par(measurePoints[0]));
    }
    return linha;
  }, [measurePoints, measureClosed]);

  /** The segments being measured, including the one that closes the shape. */
  const measureSegments = useMemo(() => {
    const pontos =
      measureClosed && measurePoints.length >= 3
        ? [...measurePoints, measurePoints[0]]
        : measurePoints;

    return pontos.slice(1).map((p, i) => ({ de: pontos[i], ate: p }));
  }, [measurePoints, measureClosed]);

  /**
   * The two halves of the route, as [longitude, latitude] — the order GeoJSON
   * wants. They overlap by one point, otherwise there was a gap between them.
   */
  // Converted once per route; each step forward only cuts the list.
  const routePairs = useMemo(() => (route?.coordinates ?? []).map(lonLat), [route]);
  const { andadoLine, faltaLine } = useMemo(
    () => ({
      andadoLine: routePairs.slice(0, Math.max(0, andado)),
      faltaLine: routePairs.slice(Math.max(0, andado - 1)),
    }),
    [routePairs, andado],
  );

  /*
    The sources' data, already as text.

    `GeoJSONSource` runs `JSON.stringify` on an object `data` on **every
    render** — and this component renders on every GPS reading, every pin
    batch and every camera change. Handing it a string skips that: the text is
    only rebuilt when what it describes changes. On a long route it was tens of
    thousands of points turned into text once a second while navigating. The
    small sources (measuring tape, route gap, waypoints) stay inline.
  */
  const doneJson = useMemo(() => lineJson(andadoLine), [andadoLine]);
  const leftJson = useMemo(() => lineJson(faltaLine), [faltaLine]);

  const alternativesJson = useMemo(
    () => alternativeRoutes.map((alt) => lineJson(alt.coordinates.map(lonLat))),
    [alternativeRoutes],
  );

  const placesJson = useMemo(
    () =>
      pointsJson(places, (place) => {
        const look = poiLook(place.kindKey, place.kindValue);
        return {
          id: place.id,
          at: place.coordinates,
          properties: {
            placeId: place.id,
            name: place.name,
            icon: look.icon,
            cor: look.colour,
            prio: look.priority,
          },
        };
      }),
    [places],
  );

  const stationsJson = useMemo(
    () =>
      pointsJson(transitStations, (estacao) => ({
        at: estacao.coordinates,
        properties: { nome: estacao.name, genero: stationLabel(estacao.kind) },
      })),
    // The kind's name depends on the language.
    [transitStations, settings.language],
  );

  const journeyJson = useMemo(
    () => (journeyLine ? lineJson(journeyLine.coordinates.map(lonLat)) : null),
    [journeyLine],
  );

  const stopsJson = useMemo(
    () =>
      pointsJson(transitStops, (stop) => ({
        at: stop.coordinates,
        properties: {
          id: stop.id,
          nome: stop.name,
          aberta: stop.id === selectedStopId ? 1 : 0,
        },
      })),
    [transitStops, selectedStopId],
  );

  const vehiclesJson = useMemo(
    () =>
      pointsJson(vehicles, (v) => ({
        at: v.coordinates,
        // A bus standing at a stop is drawn fainter: the difference between
        // "moving" and "standing there" is what makes this useful to someone
        // waiting.
        properties: { linha: v.line, parado: v.atStop ? 1 : 0 },
      })),
    [vehicles],
  );

  const camerasJson = useMemo(
    () =>
      pointsJson(cameras, (camera) => ({
        at: camera.coordinates,
        properties: { limite: camera.maxspeed ? String(camera.maxspeed) : '' },
      })),
    [cameras],
  );

  useImperativeHandle(ref, () => ({
    recenter: (coordinates: Coordinates) => {
      cameraRef.current?.flyTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 16,
        duration: 700,
      });
    },
    followAgain: () => {
      setOverviewing(false);
      setFollowNonce((n) => n + 1);
    },
    overview: () => {
      if (!route || route.coordinates.length < 2) {
        return;
      }
      setOverviewing(true);
      const area = boundsOf(route.coordinates.slice(Math.max(0, progressIndex ?? 0)));
      cameraRef.current?.fitBounds([area.west, area.south, area.east, area.north], {
        padding: { top: 200, right: 50, bottom: 200, left: 50 },
        duration: 600,
      });
    },
  }));

  /**
   * Opens the map where the person is.
   *
   * **The camera's `initialViewState` is only read when it is born**, and by
   * then the GPS has not answered — so the app opened in Lisbon and stayed
   * there, even after the position arrived, until someone pressed the centre
   * button. It was not the camera ignoring the position: it was the position
   * arriving too late for a start-up prop that is never read again.
   *
   * **Wait for the map to load, then move the camera.** A move given to a map
   * that is not ready is lost without an error, and the position nearly always
   * arrives before the map finishes loading — so it waits in `openAt` until
   * there is someone to give it to.
   *
   * This was once done by rebuilding the camera with a `key`, like
   * `followNonce`. It gave the right result at the wrong price: unmounting and
   * mounting the camera is native work, and it landed **moments after start-up**
   * — exactly when the person is tapping the search bar and the keyboard has to
   * come up. Moving is much cheaper than rebuilding.
   *
   * No animation on purpose: the camera is in Lisbon and the person may be in
   * São Tomé — watching it cross the Atlantic is not an opening, it is a show.
   *
   * It handles the **first** position that arrives, and only that one. After
   * that the camera belongs to whoever is moving the map.
   */
  const openedOnUser = useRef(false);
  /** Has the map finished loading? Before that, telling it to move is pointless. */
  const mapReady = useRef(false);
  /** Where to open, while waiting for the map to be ready. */
  const openAt = useRef<Coordinates | null>(null);

  const openOn = useCallback((posicao: Coordinates) => {
    cameraRef.current?.flyTo({
      center: [posicao.longitude, posicao.latitude],
      zoom: 15,
      duration: 0,
    });
  }, []);

  useEffect(() => {
    if (openedOnUser.current || !userLocation) {
      return;
    }

    // From here on the opening moment has passed, whether it centred or not.
    // Without this, a search made before the GPS answered had the camera taken
    // out of its hands as soon as the GPS did answer.
    openedOnUser.current = true;
    if (destination || route || following) {
      return;
    }

    if (mapReady.current) {
      openOn(userLocation);
    } else {
      openAt.current = userLocation;
    }
  }, [userLocation, destination, route, following, openOn]);

  /**
   * The map finished loading.
   *
   * It also fires on every style change — entering a stored country, for
   * example. That is why the opening position is used up and cleared: it is
   * only for the first time.
   */
  const handleMapReady = useCallback(() => {
    mapReady.current = true;
    const pendente = openAt.current;
    openAt.current = null;
    if (pendente) {
      openOn(pendente);
    }
  }, [openOn]);

  // Whenever there is a new route, fit all of it on screen.
  useEffect(() => {
    if (!route || route.coordinates.length === 0 || following) {
      return;
    }

    // In one pass: `Math.min(...points)` passes them all as function arguments,
    // and with `overview=full` a long route has tens of thousands of points —
    // enough to blow the stack.
    const area = boundsOf(route.coordinates);

    cameraRef.current?.fitBounds(
      // Ordem exigida pelo MapLibre: oeste, sul, este, norte.
      [area.west, area.south, area.east, area.north],
      {
        // Padding in pixels, so the line is not stuck to the edges or hidden
        // under the search bar and the route panel.
        padding: { top: 160, right: 40, bottom: 260, left: 40 },
        duration: 600,
      },
    );
  }, [route, following]);

  // No route, but a destination: centre on the destination.
  useEffect(() => {
    if (route || !destination) {
      return;
    }

    cameraRef.current?.flyTo({
      center: [destination.longitude, destination.latitude],
      zoom: 16,
      duration: 600,
    });
  }, [destination, route]);

  const handleLongPress = useCallback(
    (event: NativeSyntheticEvent<PressEvent>) => {
      const [longitude, latitude] = event.nativeEvent.lngLat;
      onDropPin({ latitude, longitude });
    },
    [onDropPin],
  );

  const handleRegionDidChange = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { bounds, zoom } = event.nativeEvent;
      const [west, south, east, north] = bounds;
      onViewportChange({ south, west, north, east }, zoom);

      // Zoomed far out, the screen touches several countries at once and the
      // chosen region changed with every drag. Since switching style reloads the
      // whole map, that gave one jump after another. Hence this floor: far out,
      // keep what is there, and the style itself shows the Internet tiles on top.
      if (zoom < OFFLINE_SWITCH_MIN_ZOOM) {
        return;
      }

      // Entering a country whose map is stored, use it. Compared by id so the
      // style only switches when the region really changes — switching style
      // reloads the map, and on every drag that would be unbearable.
      const seguinte = regionForView({ west, south, east, north }, offlineRegions);
      setOfflineRegion((atual) => (atual?.id === seguinte?.id ? atual : seguinte));
    },
    [onViewportChange, offlineRegions],
  );

  /**
   * MapLibre reports here when the tracking mode changes — including when it is
   * the one dropping it, which happens as soon as the person drags the map.
   *
   * **Only the drop is passed on.** Turning it on is always the decision of
   * whoever presses the button; what is used from here is "I stopped
   * following", so the button does not stay lit and lie. Without this, the only
   * way to turn it off was to press it — which turned it on again.
   *
   * Notice the drop through this, not through `onRegionDidChange`'s
   * `userInteraction`: pinching to zoom is also the person's interaction and
   * does **not** drop following. The library is the one that knows the
   * difference.
   */
  const handleTrackChange = useCallback(
    (event: NativeSyntheticEvent<TrackUserLocationChangeEvent>) => {
      if (!event.nativeEvent.trackUserLocation) {
        onFollowUserChange?.(false);
      }
    },
    [onFollowUserChange],
  );

  /**
   * If the stored map does not open, fall back to the Internet tiles.
   *
   * Worth having: the stored map is the newest part and the one with fewest
   * guarantees. Without this fallback a failure gave a blank screen instead of a
   * normal map — and nobody would know why.
   */
  const handleFailure = useCallback(() => {
    // Mark this country as failed and fall back to the Internet tiles. The
    // `setState` updater cannot have side effects: React may run it twice, and
    // then the failure would be recorded twice.
    const falhado = offlineRegion?.id;
    if (falhado) {
      setFailedRegions((atuais) => (atuais.includes(falhado) ? atuais : [...atuais, falhado]));
    }
    setOfflineRegion(null);
  }, [offlineRegion]);

  /**
   * **With a network, the stored map is not used.**
   *
   * Country maps exist for when there is no network — that is why they are
   * downloaded. Using them with a network too swapped the map for one that
   * looks completely different as soon as the country filled the screen, with a
   * big jump in sharpness in the middle of a simple zoom. Not a fault: they are
   * two maps, one drawn from geometry and one made of images, and they will
   * never look alike.
   *
   * So whoever has a network sees the same map from start to end, and the
   * stored file comes in exactly when needed: in airplane mode, in the
   * mountains or without data.
   *
   * **The trade-off, said plainly:** with a network, tiles are requested from
   * OpenStreetMap in areas already stored, which uses data and loads a volunteer
   * service. If that ever matters, the middle ground is to use the stored file
   * on mobile data too and the Internet only on Wi-Fi.
   */
  const semRede = internetReachable === false;

  // The style is only rebuilt when something that defines it changes. Created
  // on every render, the map would reload by itself each time.
  const mapStyle = useMemo(
    () =>
      mapStyleFor(
        theme.dark,
        settings.mapType,
        semRede && offlineRegion && !failedRegions.includes(offlineRegion.id)
          ? offlineRegion
          : null,
        settings.satelliteDetail,
      ),
    [theme.dark, settings.mapType, settings.satelliteDetail, offlineRegion, failedRegions, semRede],
  );

  /**
   * The business pins, the same for every source (the country's business file,
   * the OpenFreeMap tiles, the category buttons).
   *
   * Two layers, as in the maps apps people know. Underneath, a **small dot** in
   * the family colour for every place. On top, the **icon** — a disc in the
   * family colour with a white glyph — with the name under it in that colour.
   * Icons do not overlap: when two collide the map keeps the one that matters
   * more (food and health first, `symbol-sort-key`) and the other stays a dot.
   * Zooming in makes room, and the dots turn into icons by themselves. The name
   * is optional — the icon stays even when its name does not fit.
   */
  const poiLayers = (
    id: string,
    o: {
      icon: unknown;
      colour: unknown;
      priority: unknown;
      labelMinZoom: number;
      sourceLayer?: string;
      minzoom?: number;
      filter?: FilterSpecification;
    },
  ) => {
    const common = {
      ...(o.sourceLayer ? { 'source-layer': o.sourceLayer } : {}),
      ...(o.minzoom !== undefined ? { minzoom: o.minzoom } : {}),
      ...(o.filter ? { filter: o.filter } : {}),
    };
    return [
      <Layer
        key={`${id}-dot`}
        id={`${id}-dot`}
        type="circle"
        {...common}
        paint={{
          'circle-radius': 4,
          'circle-color': o.colour as never,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': theme.poiOutline,
        }}
      />,
      <Layer
        key={`${id}-icon`}
        id={`${id}-icon`}
        type="symbol"
        {...common}
        layout={{
          'icon-image': o.icon as never,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 17, 1] as never,
          'icon-allow-overlap': false,
          'symbol-sort-key': o.priority as never,
          ...(labelsReady
            ? {
                // Charging points in the tiles are named by their Mobi.E code
                // ("ALM-00112"); the icon says enough, and the card shows the brand.
                'text-field': [
                  'step',
                  ['zoom'],
                  '',
                  o.labelMinZoom,
                  ['case', ['==', ['get', 'subclass'], 'charging_station'], '', ['get', 'name']],
                ] as never,
                'text-font': ['Noto Sans Medium'],
                'text-size': 11.5,
                'text-anchor': 'top',
                'text-offset': [0, 1.1],
                'text-max-width': 8,
                'text-optional': true,
              }
            : {}),
        }}
        paint={{
          'text-color': o.colour as never,
          'text-halo-color': theme.surface,
          'text-halo-width': 1.6,
        }}
      />,
    ];
  };

  return (
    <Map
      style={styles.map}
      mapStyle={mapStyle}
      attribution
      logo={false}
      // MapLibre's compass shows by itself as soon as the map is not facing
      // north — and its default place is the top-right corner, right behind the
      // search bar, where only a sliver peeked out.
      //
      // **The bottom-left corner is not free.** It was written here that it
      // was, and it was not — the compass sat under the measuring-tape button,
      // half covered, and since it only shows with the map rotated the overlap
      // went unnoticed by anyone who never rotated the map.
      //
      // The height comes from outside (`compassBottom`): `App.tsx` decides it,
      // where the other floating buttons' measurements live. Spreading that
      // arithmetic over two files was a guarantee that one day they would stop
      // matching — and since the compass only shows with the map rotated, the
      // misalignment would go unnoticed.
      compassPosition={{ bottom: compassBottom, left: 16 }}
      onDidFinishLoadingMap={handleMapReady}
      onDidFailLoadingMap={handleFailure}
      onRegionDidChange={handleRegionDidChange}
      onPress={(event) => {
        const [longitude, latitude] = event.nativeEvent.lngLat;
        onTapEmpty({ latitude, longitude });
      }}
      onLongPress={handleLongPress}
    >
      <Camera
        // Recreating the camera is what ties it to the position again after the
        // person dragged the map. See `followNonce`.
        key={`camera-${followNonce}`}
        ref={cameraRef}
        // 'course' points the map the way one is going, as in Maps navigation.
        // 'default' follows the person without turning the map — what a double
        // tap on the GPS button turns on. With neither, the camera is free.
        trackUserLocation={
          following && !overviewing ? 'course' : followUser && !following ? 'default' : undefined
        }
        onTrackUserLocationChange={handleTrackChange}
        initialViewState={{
          center: userLocation ? [userLocation.longitude, userLocation.latitude] : DEFAULT_CENTER,
          zoom: userLocation ? 15 : DEFAULT_ZOOM,
        }}
      />

      {/* The blue dot only shows with location permission actually granted. */}
      {/*
        The blue dot, drawn by us so the compass cone can go under it, as in
        Google Maps: the cone shows which way the phone points, standing still
        too. While navigating the map itself turns with the heading, so no cone.
      */}
      {userLocation ? (
        <UserLocation>
          {!following ? <HeadingCone key="user-heading-cone" /> : null}
          <Layer
            type="circle"
            key="user-dot-white"
            id="user-dot-white"
            source="mlrn-user-location"
            paint={{
              'circle-radius': 9,
              'circle-color': '#FFFFFF',
              'circle-pitch-alignment': 'map',
            }}
          />
          <Layer
            type="circle"
            key="user-dot-blue"
            id="user-dot-blue"
            source="mlrn-user-location"
            paint={{
              'circle-radius': 6.5,
              'circle-color': '#1A73E8',
              'circle-pitch-alignment': 'map',
            }}
          />
        </UserLocation>
      ) : null}

      {/*
        The stretch between where the person is and where the route really
        starts.

        The routing service only follows roads: at an airport or in the middle of
        a field, it snaps the start to the nearest road, which can be hundreds of
        metres away. Without this, the line seemed to start somewhere else with
        no explanation. Dashed, because that bit is up to whoever walks it — it
        is not a path anyone calculated.
      */}
      {userLocation && route?.startsAt && route.startAwayMeters > 40 ? (
        <GeoJSONSource
          id="route-gap"
          data={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [userLocation.longitude, userLocation.latitude],
                [route.startsAt.longitude, route.startsAt.latitude],
              ],
            },
          }}
        >
          <Layer
            key="route-gap-line"
            id="route-gap-line"
            type="line"
            layout={{ 'line-cap': 'round' }}
            paint={{
              'line-color': theme.textMuted,
              'line-width': 3,
              'line-dasharray': [1, 2],
            }}
          />
        </GeoJSONSource>
      ) : null}

      {/*
        The businesses all go in a single layer, instead of one component per
        pin. With dozens of pins, the difference in smoothness is large.
      */}
      {/*
        The measuring tape.

        The closed shape is only drawn from three points, which is when there is
        an area. The line needs two — and with fewer nothing is drawn, because a
        line without enough points is not valid GeoJSON and takes the whole
        source with it. It already happened with the route.
      */}
      {measureClosed && measurePoints.length >= 3 ? (
        <GeoJSONSource
          id="medida-area"
          data={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  ...measurePoints.map((p) => [p.longitude, p.latitude]),
                  // GeoJSON requires a polygon to close on its starting point.
                  [measurePoints[0].longitude, measurePoints[0].latitude],
                ],
              ],
            },
          }}
        >
          <Layer
            key="medida-area-fill"
            id="medida-area-fill"
            type="fill"
            paint={{ 'fill-color': theme.accent, 'fill-opacity': 0.15 }}
          />
        </GeoJSONSource>
      ) : null}

      {measureLine.length >= 2 ? (
        <GeoJSONSource
          id="medida-linha"
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: measureLine },
          }}
        >
          <Layer
            key="medida-linha-line"
            id="medida-linha-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': theme.accent,
              'line-width': 3,
              'line-dasharray': [2, 1.4],
            }}
          />
        </GeoJSONSource>
      ) : null}

      {/*
        Each segment's length, written halfway along it — as in Google Earth.

        Without this the panel showed the total but not what each piece was
        worth, which is half the point of measuring in parts.
      */}
      {measureSegments.length > 0 && labelsReady ? (
        <GeoJSONSource
          id="medida-troços"
          data={{
            type: 'FeatureCollection',
            features: measureSegments.map(({ de, ate }) => ({
              type: 'Feature',
              properties: { medida: formatDistance(distanceMeters(de, ate)) },
              geometry: {
                type: 'Point',
                coordinates: [(de.longitude + ate.longitude) / 2, (de.latitude + ate.latitude) / 2],
              },
            })),
          }}
        >
          <Layer
            key="medida-troços-label"
            id="medida-troços-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'medida'],
              'text-font': ['Noto Sans Medium'],
              'text-size': 12,
              'text-allow-overlap': true,
            }}
            paint={{
              'text-color': theme.accent,
              'text-halo-color': theme.surface,
              'text-halo-width': 2,
            }}
          />
        </GeoJSONSource>
      ) : null}

      {measurePoints.length > 0 ? (
        <GeoJSONSource
          id="medida-pontos"
          data={{
            type: 'FeatureCollection',
            features: measurePoints.map((p, i) => ({
              type: 'Feature',
              properties: { ordem: String(i + 1) },
              geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
            })),
          }}
        >
          <Layer
            key="medida-pontos-circle"
            id="medida-pontos-circle"
            type="circle"
            paint={{
              'circle-radius': 6,
              'circle-color': theme.surface,
              'circle-stroke-width': 3,
              'circle-stroke-color': theme.accent,
            }}
          />
        </GeoJSONSource>
      ) : null}

      {/*
        Train, metro, light-rail and ferry stations.

        They go before the bus stops so they sit under them: the stops are what
        gets tapped, these are only for reference.
      */}
      {transitStations.length > 0 ? (
        <GeoJSONSource
          id="estacoes"
          data={stationsJson}
        >
          <Layer
            key="estacoes-circle"
            id="estacoes-circle"
            type="circle"
            paint={{
              'circle-radius': 7,
              'circle-color': theme.poi,
              'circle-stroke-width': 2.5,
              'circle-stroke-color': theme.poiOutline,
            }}
          />
          {labelsReady ? (
            <Layer
              key="estacoes-label"
              id="estacoes-label"
              type="symbol"
              minzoom={12}
              layout={{
                'text-field': ['get', 'nome'],
                'text-font': ['Noto Sans Medium'],
                'text-size': 11,
                'text-offset': [0, 1.3],
                'text-anchor': 'top',
                'text-max-width': 9,
                'text-allow-overlap': false,
              }}
              paint={{
                'text-color': theme.text,
                'text-halo-color': theme.surface,
                'text-halo-width': 1.6,
              }}
            />
          ) : null}
        </GeoJSONSource>
      ) : null}

      {/*
        A tapped line's way, under its stops. Straight from stop to stop: the
        stops are a few hundred metres apart, close enough to read as the road.
      */}
      {journeyJson ? (
        <GeoJSONSource id="percurso-linha" data={journeyJson}>
          <Layer
            key="percurso-linha-line"
            id="percurso-linha-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': journeyLine?.colour ?? theme.accent,
              'line-width': 5,
              'line-opacity': 0.85,
            }}
          />
        </GeoJSONSource>
      ) : null}

      {/*
        The transport stops, while their panel is open.

        Each one gets its name next to it, because that is what links the row in
        the list to the point on the map — without a name, six identical points
        say nothing. The open one is bigger and in the highlight colour.
      */}
      {transitStops.length > 0 ? (
        <GeoJSONSource
          id="paragens"
          onPress={(event) => {
            // See the note on the businesses: the tap must not reach the map.
            event.stopPropagation?.();
            // Same as the businesses: the features come in `nativeEvent`.
            const id = event.nativeEvent.features[0]?.properties?.id;
            if (typeof id === 'string') {
              onStopPress?.(id);
            }
          }}
          data={stopsJson}
        >
          {/*
            Small bus symbols, as in the Maps — the big circles covered the
            street. The open stop gets a ring under it and a bigger symbol.
          */}
          <Layer
            key="paragens-aberta"
            id="paragens-aberta"
            type="circle"
            filter={['==', ['get', 'aberta'], 1]}
            paint={{
              'circle-radius': 15,
              'circle-color': theme.accent,
              'circle-opacity': 0.25,
              'circle-stroke-width': 2,
              'circle-stroke-color': theme.accent,
            }}
          />
          <Layer
            key="paragens-icon"
            id="paragens-icon"
            type="symbol"
            layout={{
              'icon-image': 'stop-bus',
              // Zoom on the outside: the spec only allows it at the top.
              'icon-size': [
                'interpolate',
                ['linear'],
                ['zoom'],
                14,
                ['case', ['==', ['get', 'aberta'], 1], 1.3, 0.75],
                17,
                ['case', ['==', ['get', 'aberta'], 1], 1.5, 1.05],
              ],
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
          {/* The names only close in (zoom 17), or for the open stop: at street
              level a dozen names on top of each other said nothing. */}
          {labelsReady ? (
            <>
              <Layer
                key="paragens-label"
                id="paragens-label"
                type="symbol"
                minzoom={17}
                filter={['==', ['get', 'aberta'], 0]}
                layout={{
                  'text-field': ['get', 'nome'],
                  'text-font': ['Noto Sans Medium'],
                  'text-size': 10,
                  'text-offset': [0, 1.1],
                  'text-anchor': 'top',
                  'text-max-width': 9,
                  'text-allow-overlap': false,
                  'text-optional': true,
                }}
                paint={{
                  'text-color': theme.text,
                  'text-halo-color': theme.surface,
                  'text-halo-width': 1.6,
                }}
              />
              <Layer
                key="paragens-label-aberta"
                id="paragens-label-aberta"
                type="symbol"
                filter={['==', ['get', 'aberta'], 1]}
                layout={{
                  'text-field': ['get', 'nome'],
                  'text-font': ['Noto Sans Medium'],
                  'text-size': 10,
                  'text-offset': [0, 1.1],
                  'text-anchor': 'top',
                  'text-max-width': 9,
                  'text-allow-overlap': false,
                  'text-optional': true,
                }}
                paint={{
                  'text-color': theme.text,
                  'text-halo-color': theme.surface,
                  'text-halo-width': 1.6,
                }}
              />
            </>
          ) : null}
        </GeoJSONSource>
      ) : null}

      {/*
        The moving buses, with the line number inside.

        **They go over the stops, on purpose:** the stop is always in the same
        place and the bus is the news. Covering a bus with a stop would cover
        what one came to see.

        They have no arrow for the direction, even though the service sends the
        `bearing`. An arrow would need an image or a character the bundled glyphs
        lack — two Noto Sans blocks, enough for Portuguese and with no symbols.
        Noted for when it is needed.
      */}
      {vehicles.length > 0 ? (
        <GeoJSONSource
          id="autocarros"
          data={vehiclesJson}
        >
          <Layer
            key="autocarros-circle"
            id="autocarros-circle"
            type="circle"
            paint={{
              'circle-radius': 10,
              'circle-color': theme.vehicle,
              'circle-opacity': ['case', ['==', ['get', 'parado'], 1], 0.65, 1],
              'circle-stroke-width': 2,
              'circle-stroke-color': theme.poiOutline,
            }}
          />
          {labelsReady ? (
            <Layer
              key="autocarros-label"
              id="autocarros-label"
              type="symbol"
              layout={{
                'text-field': ['get', 'linha'],
                'text-font': ['Noto Sans Medium'],
                'text-size': 10,
                // Overlapping on purpose: the number has to stay inside the
                // circle even when buses are right next to each other.
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{ 'text-color': theme.onOverlay }}
            />
          ) : null}
        </GeoJSONSource>
      ) : null}

      {/*
        The speed cameras. After the route and before the businesses, so they sit
        over the line and under the pins that get tapped.
      */}
      {cameras.length > 0 ? (
        <GeoJSONSource
          id="cameras"
          data={camerasJson}
        >
          <Layer
            key="cameras-circle"
            id="cameras-circle"
            type="circle"
            paint={{
              'circle-radius': 7,
              'circle-color': theme.danger,
              'circle-stroke-width': 2.5,
              'circle-stroke-color': theme.poiOutline,
            }}
          />
          {labelsReady ? (
            <Layer
              key="cameras-label"
              id="cameras-label"
              type="symbol"
              minzoom={13}
              layout={{
                'text-field': ['get', 'limite'],
                'text-font': ['Noto Sans Medium'],
                'text-size': 11,
                'text-offset': [0, 1.3],
                'text-anchor': 'top',
                'text-allow-overlap': false,
              }}
              paint={{
                'text-color': theme.text,
                'text-halo-color': theme.surface,
                'text-halo-width': 1.5,
              }}
            />
          ) : null}
        </GeoJSONSource>
      ) : null}

      {tilePois ? (
        <VectorSource
          id="ofm-pois"
          url={OPENFREEMAP_TILEJSON}
          attribution={OPENFREEMAP_ATTRIBUTION}
          onPress={(event) => {
            event.stopPropagation?.();
            const feature = event.nativeEvent.features[0];
            const props = (feature?.properties ?? {}) as Record<string, unknown>;
            const geometry = feature?.geometry;
            if (typeof props.name !== 'string' || !geometry || geometry.type !== 'Point') {
              return;
            }
            const [longitude, latitude] = geometry.coordinates as number[];
            const kind =
              typeof props.subclass === 'string' ? props.subclass : String(props.class ?? '');
            onTilePoiPress?.({
              // Tiles carry no OpenStreetMap id; a negative number from the
              // position keeps it apart from real ids and stable between taps.
              id: -Math.abs(Math.round(latitude * 1e5) * 100000 + Math.round(longitude * 1e5)),
              name: props.name,
              address: '',
              coordinates: { latitude, longitude },
              category: categoryLabel({ amenity: kind }),
              kindValue: kind,
            });
          }}
        >
          {poiLayers('ofm-pois', {
            icon: TILE_POI_ICON,
            colour: TILE_POI_COLOUR,
            priority: TILE_POI_PRIORITY,
            labelMinZoom: 16,
            sourceLayer: 'poi',
            minzoom: MAP_PINS_MIN_ZOOM,
            filter: TILE_POI_FILTER,
          })}
        </VectorSource>
      ) : null}

      {places.length > 0 ? (
        <GeoJSONSource
          id="places"
          data={placesJson}
          onPress={(event) => {
            // Without this the tap also reaches the map: with the measuring tape
            // on, tapping a business opened its card **and** left a measuring
            // point on top of the pin.
            event.stopPropagation?.();
            const feature = event.nativeEvent.features[0];
            const placeId = feature?.properties?.placeId;
            if (typeof placeId === 'number') {
              onPlacePress(placeId);
            }
          }}
        >
          {poiLayers('places', {
            icon: ['get', 'icon'],
            colour: ['get', 'cor'],
            priority: ['get', 'prio'],
            labelMinZoom: 15,
          })}
        </GeoJSONSource>
      ) : null}

      {/*
        The routes not chosen, faded and under the chosen one.

        Drawn first on purpose: in MapLibre the order layers are added is the
        order they stack, and the chosen route has to be on top to tell which it
        is.
      */}
      {alternativeRoutes.map((alt, i) =>
        alt.coordinates.length >= 2 ? (
          <GeoJSONSource
            key={`alt-${i}`}
            id={`rota-alternativa-${i}`}
            data={alternativesJson[i]}
          >
            <Layer
              key={`rota-alternativa-${i}-line`}
              id={`rota-alternativa-${i}-line`}
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': theme.textMuted,
                'line-width': 5,
                'line-opacity': 0.4,
              }}
            />
          </GeoJSONSource>
        ) : null,
      )}

      {/*
        The route goes in two separate sources — what is behind and what is left
        — not in one with a filter telling them apart.

        **The reason is a fault already caught:** with both lines in the same
        source, at the start of navigation the first had no points yet, and a
        line without points is not valid GeoJSON. MapLibre threw away the whole
        source and the route **vanished entirely** from the map, with no error
        at all. Hence the two length checks below: a line needs two points to
        exist.
      */}
      {andadoLine.length >= 2 ? (
        <GeoJSONSource
          id="route-done"
          data={doneJson}
        >
          <Layer
            key="route-done-line"
            id="route-done-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': theme.textMuted,
              'line-width': 5,
              'line-opacity': 0.35,
              'line-dasharray': [1, 1.6],
            }}
          />
        </GeoJSONSource>
      ) : null}

      {faltaLine.length >= 2 ? (
        <GeoJSONSource
          id="route"
          data={leftJson}
        >
          <Layer
            key="route-line"
            id="route-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': theme.accent, 'line-width': 5, 'line-opacity': 0.85 }}
          />
        </GeoJSONSource>
      ) : null}

      {/*
        The route's stops, numbered in the order they are passed.
      */}
      {waypoints.length > 0 ? (
        <GeoJSONSource
          id="paragens-percurso"
          data={{
            type: 'FeatureCollection',
            features: waypoints.map((w, i) => ({
              type: 'Feature',
              properties: { ordem: String(i + 1) },
              geometry: { type: 'Point', coordinates: [w.longitude, w.latitude] },
            })),
          }}
        >
          <Layer
            key="paragens-percurso-circle"
            id="paragens-percurso-circle"
            type="circle"
            paint={{
              'circle-radius': 10,
              'circle-color': theme.poi,
              'circle-stroke-width': 2.5,
              'circle-stroke-color': theme.poiOutline,
            }}
          />
          {labelsReady ? (
            <Layer
              key="paragens-percurso-label"
              id="paragens-percurso-label"
              type="symbol"
              layout={{
                'text-field': ['get', 'ordem'],
                'text-font': ['Noto Sans Medium'],
                'text-size': 12,
                'text-allow-overlap': true,
              }}
              paint={{ 'text-color': theme.poiOutline }}
            />
          ) : null}
        </GeoJSONSource>
      ) : null}

      <Images images={POI_IMAGE_SOURCES} />

      {/*
        The pin dropped with a finger. It looks different from the destination,
        to show there is no route drawn yet.
      */}
      {droppedPin ? (
        <Marker id="dropped-pin" lngLat={[droppedPin.longitude, droppedPin.latitude]}>
          <PopIn key={`${droppedPin.latitude},${droppedPin.longitude}`}>
            <View style={[styles.droppedPin, { borderColor: theme.accent }]}>
              <View style={[styles.droppedPinCore, { backgroundColor: theme.accent }]} />
            </View>
          </PopIn>
        </Marker>
      ) : null}

      {/*
        The red teardrop pin, as in the maps everyone knows: the place whose
        card is open, or the destination. It carries the business-kind icon
        inside. The tip of the drop marks the spot — hence the \`anchor\` at the
        bottom.
      */}
      {pinned || destination ? (
        <Marker
          id="destination"
          lngLat={
            pinned
              ? [pinned.coordinates.longitude, pinned.coordinates.latitude]
              : [destination!.longitude, destination!.latitude]
          }
          anchor="bottom"
        >
          <DroppingPin
            key={
              pinned
                ? `${pinned.coordinates.latitude},${pinned.coordinates.longitude}`
                : `${destination!.latitude},${destination!.longitude}`
            }
            shadowColor={theme.pinOutline}
          >
            <View style={styles.pin}>
              <View
                style={[
                  styles.pinDrop,
                  { backgroundColor: theme.pin, borderColor: theme.pinOutline },
                ]}
              />
              <View style={styles.pinGlyph}>
                <MaterialCommunityIcons
                  name={
                    (pinned
                      ? PIN_GLYPH[poiLook(pinned.kindKey, pinned.kindValue).family]
                      : 'circle') as never
                  }
                  size={
                    pinned && poiLook(pinned.kindKey, pinned.kindValue).family !== 'other' ? 16 : 9
                  }
                  color={theme.pinOutline}
                />
              </View>
            </View>
          </DroppingPin>
        </Marker>
      ) : null}
    </Map>
  );
}

/** How far above its spot the red pin starts falling from, in points. */
/** A point as GeoJSON wants it: longitude first. */
function lonLat(p: Coordinates): [number, number] {
  return [p.longitude, p.latitude];
}

/** A line as GeoJSON text, for a `GeoJSONSource` (see the sources' note). */
function lineJson(coordinates: [number, number][]): string {
  return JSON.stringify({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  });
}

/** A list of points as GeoJSON text, each with its properties. */
function pointsJson<T>(
  items: readonly T[],
  describe: (item: T) => {
    at: Coordinates;
    properties: Record<string, string | number>;
    id?: string | number;
  },
): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: items.map((item) => {
      const { at, properties, id } = describe(item);
      return {
        type: 'Feature',
        ...(id !== undefined ? { id } : {}),
        properties,
        geometry: { type: 'Point', coordinates: lonLat(at) },
      };
    }),
  });
}

const PIN_FALL = 26;

/**
 * The red pin falls into place with a little bounce, and its shadow on the
 * ground grows as it lands — as in the maps everyone knows (author's request:
 * "animations on the pin appearing, to look better"). It runs again whenever
 * the pin moves to another place (the caller keys it by the coordinates).
 *
 * The box is taller than the pin by `PIN_FALL`, so the falling pin is never
 * outside its own view (Android may clip a marker's children), and the tip
 * still ends at the bottom, where `anchor="bottom"` puts the spot.
 * Native driver: the map's JavaScript can be busy right then.
 */
function DroppingPin({ children, shadowColor }: { children: ReactNode; shadowColor: string }) {
  const fall = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(fall, {
      toValue: 1,
      friction: 5,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [fall]);
  return (
    <View style={styles.pinBox}>
      <Animated.View
        style={[
          styles.pinShadow,
          {
            backgroundColor: shadowColor,
            opacity: fall.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 0.25],
              extrapolate: 'clamp',
            }),
            transform: [
              { scaleX: fall.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={{
          opacity: fall.interpolate({
            inputRange: [0, 0.3],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
          transform: [
            { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-PIN_FALL, 0] }) },
          ],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** A quick pop for the long-press pin: from small to its size, with a hint of overshoot. */
function PopIn({ children }: { children: ReactNode }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(pop, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.back(2)),
      useNativeDriver: true,
    }).start();
  }, [pop]);
  return (
    <Animated.View style={{ opacity: pop, transform: [{ scale: pop }] }}>{children}</Animated.View>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  // The rotated drop has its tip 38 points from the top; the box ends right
  // after, so \`anchor="bottom"\` puts the tip on the spot.
  pin: {
    width: 34,
    height: 39,
    alignItems: 'center',
  },
  pinBox: {
    width: 34,
    height: 39 + PIN_FALL,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  pinShadow: {
    position: 'absolute',
    bottom: -2,
    width: 14,
    height: 5,
    borderRadius: 7,
  },
  // A square with three rounded corners, rotated 45°: the classic drop.
  pinDrop: {
    position: 'absolute',
    top: 2,
    width: 30,
    height: 30,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 2,
    borderWidth: 2,
    transform: [{ rotate: '45deg' }],
    elevation: 4,
  },
  pinGlyph: {
    position: 'absolute',
    top: 2,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  droppedPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  droppedPinCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
