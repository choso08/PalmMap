import type { pt } from './pt';

/**
 * The English strings.
 *
 * Typed against `pt.ts`, which is the source of truth: a key added there and
 * forgotten here fails the type check. That is deliberate — a missing key would
 * otherwise show a Portuguese sentence in the middle of an English screen, and
 * type checking is the only automated check this project has.
 *
 * Sentences that take a value are functions, so each language builds its own
 * grammar instead of having phrases assembled from translated fragments.
 */
export const en: typeof pt = {
  languages: {
    auto: 'Automatic',
    pt: 'Portuguese',
    en: 'English',
  },

  units: {
    // The one that shows most: 12.4 km here, 12,4 km in Portuguese.
    decimal: '.',
    metres: 'm',
    kilometres: 'km',
    minutes: 'min',
    hours: 'h',
    hectares: 'ha',
    squareMetres: 'm²',
    squareKilometres: 'km²',
    kmh: 'km/h',
  },

  common: {
    close: 'Close',
    cancel: 'Cancel',
    clear: 'Clear',
    undo: 'Undo',
    refresh: 'Refresh',
    saved: 'saved',
    failed: "Couldn't do that.",
    listFailed: "Couldn't get the list.",
  },

  search: {
    placeholder: 'Search here',
    failed: "Couldn't search. Check your Internet connection.",
    noResults: 'No results.',
    saved: 'Saved',
    recents: 'Recent destinations',
    mapPoint: 'Point on the map',
  },

  categories: {
    restaurants: 'Restaurants',
    cafes: 'Cafés',
    pharmacies: 'Pharmacies',
    fuel: 'Fuel',
    supermarkets: 'Supermarkets',
    atm: 'Cash machines',
    parking: 'Parking',
    health: 'Health',
  },

  placeKinds: {
    restaurant: 'Restaurant',
    fast_food: 'Fast food',
    cafe: 'Café',
    bar: 'Bar',
    pub: 'Pub',
    pharmacy: 'Pharmacy',
    fuel: 'Petrol station',
    charging_station: 'Charging point',
    bank: 'Bank',
    atm: 'Cash machine',
    hospital: 'Hospital',
    clinic: 'Clinic',
    doctors: "Doctor's surgery",
    dentist: 'Dentist',
    parking: 'Car park',
    post_office: 'Post office',
    supermarket: 'Supermarket',
    convenience: 'Corner shop',
    bakery: 'Bakery',
    butcher: 'Butcher',
    clothes: 'Clothes',
    hairdresser: 'Hairdresser',
    car_repair: 'Garage',
    hotel: 'Hotel',
    hostel: 'Hostel',
    guest_house: 'Guest house',
    museum: 'Museum',
    attraction: 'Attraction',
    school: 'School',
    university: 'University',
  },

  place: {
    route: 'Get directions',
    addWaypoint: 'Stop here on the way',
    save: 'Save',
    unsave: 'Saved',
    call: 'Call',
    website: 'Website',
    openNow: 'Open',
    closedNow: 'Closed',
  },

  route: {
    calculating: 'Working out the route…',
    start: 'Start navigation',
    steps: 'See directions',
    duration: 'estimated time',
    distance: 'distance',
    best: 'best',
    option: (n: number) => `Option ${n}`,
    startsAway: (distance: string) =>
      `The route starts ${distance} away from you, on the nearest road. That stretch is dashed on the map and is up to you.`,
    tollsNotAvoided:
      "Tolls couldn't be avoided: the public routing service doesn't have that option. This route may use paid motorways.",
    noDirectTransit:
      'No line makes this trip without changes. For now only direct connections are searched: Carris Metropolitana buses, and train, metro or ferry from operators whose timetable you have downloaded in settings.',
    walkTo: (time: string, stop: string) => `${time} walk to ${stop}`,
    walkFrom: (time: string, stop: string) => `${time} walk from ${stop}`,
    stopCount: (n: number) => (n === 1 ? '1 stop' : `${n} stops`),
  },

  steps: {
    title: 'Directions',
    empty: 'No directions to show yet.',
  },

  navigation: {
    recalculating: 'Working out a new route…',
    following: 'Following the route…',
    toDestination: 'to your destination',
    finish: 'Finish',
    arrived: "You've arrived.",
    speedLimit: (kmh: number) => `${kmh}`,
  },

  transit: {
    title: 'Transport near you',
    subtitle: 'Carris Metropolitana · Lisbon area',
    searching: 'Looking for stops…',
    loadingTimes: 'Checking times…',
    timesFailed: "Couldn't get the departure times.",
    stopsFailed: "Couldn't get the stops. Check your connection.",
    noneSoon: 'Nothing due in the next two hours.',
    goToStop: 'Walk to the stop',
    stationsNearby: 'Stations nearby',
    noPosition:
      "Without your location there's no way to tell which stops are near. Allow GPS access in your phone's settings.",
    outsideArea:
      'There are no timetables for this area. Only the Lisbon metropolitan area has open data — elsewhere in Portugal each operator keeps its own.',
    noScheduleHere:
      'No timetable downloaded for this station. In settings, under "Timetables", you can download the operator\'s — the files are small and then work without a connection.',
    scheduleOnly:
      "This is the operator's published timetable, not live data: if it's running late, this won't know.",
    now: 'now',
    inMinutes: (n: number) => `${n} min`,
    kinds: {
      bus: 'Bus',
      train: 'Train',
      subway: 'Metro',
      light_rail: 'Light rail',
      boat: 'Ferry',
    },
  },

  measure: {
    title: 'Measuring tape',
    distance: 'Distance',
    area: 'Area',
    distanceLabel: 'distance',
    perimeterLabel: 'perimeter',
    areaLabel: 'area',
    firstPoint: 'Tap the map to place the first point.',
    secondPoint: 'Tap again to measure up to there.',
    needThird: 'One more point to close the shape.',
    pointCount: (n: number) => (n === 1 ? '1 point' : `${n} points`),
    accuracy:
      "It's only as accurate as the map and your fingertip: good for a rough idea, not for marking a boundary.",
  },

  offline: {
    loading: 'Getting the list of maps…',
    empty: 'No maps published yet. Run the "Gerar mapa offline" workflow on GitHub.',
    searchIn: (n: number) => `Search among ${n} countries`,
    noMatch: 'No country by that name.',
    bundled: 'included with the app',
  },

  schedules: {
    loading: 'Getting the list of timetables…',
    empty: 'No timetables published yet. Run the "Gerar horários" workflow on GitHub.',
    stationCount: (n: number) => (n === 1 ? '1 station' : `${n} stations`),
    expired: 'out of date, download again',
    until: (date: string) => `until ${date}`,
    note:
      "These operators publish only the timetable, not live data: the times are the scheduled ones, and a delay won't show here. Once downloaded they work without a connection. Carris Metropolitana buses don't need this — those have live times.",
    date: (day: number, month: number) => {
      const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];
      const name = months[month - 1];
      return name ? `${day} ${name}` : '';
    },
  },

  settings: {
    title: 'Settings',

    language: 'Language',
    languageHint: "On automatic it follows your phone's language.",

    appearance: 'Appearance',
    appearanceHint: "On automatic it follows your phone's setting.",
    appearanceModes: {
      system: 'Automatic',
      light: 'Light',
      dark: 'Dark',
    },

    travelMode: 'Travel mode',
    travelModeHint: 'How routes are worked out.',
    travelModeNote:
      "Each mode has its own server, so on foot one-way streets are ignored and the time is counted at walking pace. You can also switch it in the route panel, without coming here.",
    travelModes: {
      driving: 'Car',
      walking: 'Walking',
      cycling: 'Cycling',
      transit: 'Bus',
    },

    mapTypes: {
      map: 'Map',
      satellite: 'Satellite',
      transit: 'Transport',
    },

    timeAdjustment: 'Estimated time',
    timeAdjustmentHint: 'If the roads where you are are slower than the map assumes.',
    timeAdjustmentNote:
      'The time comes from the road type and the surface recorded in OpenStreetMap. Where the surface is missing, a paved road is assumed — and on a dirt track the real time can be double.',
    timeAdjustments: {
      none: 'Normal',
      slow: '+25%',
      slower: '+50%',
      slowest: '+100%',
    },

    satelliteDetail: 'Satellite detail',
    satelliteDetailHint: 'How far you can zoom in before the image blurs.',
    satelliteDetails: {
      normal: 'Normal',
      alta: 'High',
    },
    satelliteNormalHint:
      "Sentinel-2, from the European Copernicus programme. It covers the whole world at ten metres per pixel — you get the coastline, the woods and open ground, not individual houses.",
    satelliteHighHint:
      'Adds the official Portuguese aerial photography on top: you can see individual houses, but only in Portugal and it uses far more data.',

    map: 'Map',
    showPlaces: 'Show businesses on the map',
    showPlacesHint:
      "Marks the businesses in the area you're looking at on its own. Turning it off eases the load on a service run by volunteers.",
    showVehicles: 'Buses on the move',
    showVehiclesHint:
      'Shows where Carris Metropolitana buses are right now, on the transport map. Only appears when zoomed in.',
    showVehiclesCost:
      'Uses a fair amount of data: the service can only hand over the whole fleet at once, and that repeats every twenty seconds while you watch.',

    cache: 'Saved map',
    cacheHint: 'The areas you pass through are kept and show up again without a connection.',
    cacheOffHint: "Off: the map is fetched again each time, and won't appear without a connection.",
    cacheFullHint: "When it fills up, it forgets what you haven't seen for longest first.",
    cacheSizes: {
      off: 'None',
      small: '100 MB',
      medium: '250 MB',
      large: '500 MB',
      huge: '1 GB',
    },
    clearCache: 'Delete the saved map',
    clearingCache: 'Deleting…',
    clearCacheFailed: "Couldn't delete",
    cacheClearedTitle: 'Saved map deleted',
    cacheClearedBody: 'The areas will be fetched again when there is a connection.',
    tryAgain: 'Try again.',

    offlineMaps: 'Country maps',
    offlineMapsHint:
      "Saves a whole country at once. Works without a connection at any zoom, even in places you've never been.",
    offlineMapsNote: 'Download over Wi-Fi: the larger countries run to hundreds of megabytes.',

    schedules: 'Timetables',
    schedulesHint:
      'Train, metro and ferry. Kept on your phone, they show up at stations and in public transport trips.',

    navigation: 'Navigation',
    voice: 'Read directions aloud',
    voiceHint:
      "While navigating, it announces each manoeuvre as you approach it, using your phone's voice.",
    cameras: 'Warn about speed cameras',
    camerasNote:
      "It comes from OpenStreetMap, and only picks up what is tagged there. Mobile cameras appear on no map at all — they move every day. This is a help, not a guarantee: the person driving is the one who has to watch the signs.",
    tollsNote:
      "The public routing server may not have this option installed. When it doesn't, you still get a route — and the panel says the tolls couldn't be avoided. There is no open way to know what each toll costs, so the price isn't shown.",
    aboutText:
      'PalmMap uses only open, free services — no Google and no API keys. The map data comes from the people who contribute to OpenStreetMap.',
    camerasHint:
      "Warns about cameras on your route, with the limit where it's tagged. It comes from OpenStreetMap: fixed cameras, red-light cameras and average speed checks. Mobile cameras are on no map at all, and the map isn't complete — this is a help, not a guarantee.",
    tolls: 'Avoid tolls',
    tollsHint:
      "Asks for a route without tolls. There's no open source of toll prices in Portugal, so it can't tell you what each stretch costs.",
    batterySaver: 'Save battery while navigating',
    batterySaverHint:
      'Far from the next manoeuvre it reads the GPS every four seconds instead of every second. Near the manoeuvre it goes back to normal, and the accuracy never drops.',

    recents: 'Recent destinations',
    recentsHint: 'They appear in search before you type, after the saved ones.',
    forgetRecents: 'Forget recent destinations',

    about: 'About',
    credits: {
      osm: 'map data, search and tiles',
      carto: 'map tiles in dark mode',
      overpass: 'businesses and points of interest',
      osrm: 'route calculation',
      routing: 'How routes are calculated.',
    },
  },

  errors: {
    noRoute: 'No route was found between these points.',
    routeFailed: "Couldn't reach the routing service.",
    routeGeneric: "Couldn't work out the route.",
    noLocationForRoute: "Without your location the route can't be worked out.",
    locationDenied: 'No GPS access. You can still see the map and search for addresses.',
    placesFailed: "Couldn't search for places. Try again shortly.",
    placesBusy: 'The service is busy right now. Try again shortly.',
    searchFailed: "Couldn't search.",
    zoomIn: 'Zoom in to search this area.',
    noneOfCategory: (category: string) => `No ${category.toLowerCase()} in this area.`,
    schedulesFailed: "Couldn't get the timetables. Check your connection.",
    scheduleListFailed: "Couldn't get the list of timetables. Check your Internet connection.",
    scheduleDownloadFailed: (operator: string, detail: string) =>
      `Couldn't download the ${operator} timetable. ${detail}`.trim(),
    mapListFailed: "Couldn't get the list of maps. Check your Internet connection.",
    mapDownloadFailed: (region: string, detail: string) =>
      `Couldn't download the map of ${region}. ${detail}`.trim(),
    bundledAssetFailed: "Couldn't read a file included with the app.",
    noTransitStops:
      'There are no stops within walking distance of one of the points, or you are outside the Carris Metropolitana area.',
  },

  attributions: {
    // The wording EOX asks for, copied rather than translated.
    sentinel:
      'Sentinel-2 cloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)',
    orthophotos: 'Aerial imagery © Direção-Geral do Território',
  },

  hints: {
    longPress: 'Press and hold on the map to drop a pin and head there.',
  },

  cameras: {
    speed: 'speed camera',
    average: 'average speed check',
    trafficSignals: 'red-light camera',
    traffic: 'traffic monitoring',
  },

  maneuvers: {
    directions: {
      left: 'left',
      right: 'right',
      'slight left': 'slightly left',
      'slight right': 'slightly right',
      'sharp left': 'sharply left',
      'sharp right': 'sharply right',
      straight: 'straight on',
      uturn: 'around',
    } as Record<string, string>,
    sides: {
      left: 'left',
      right: 'right',
      'slight left': 'left',
      'slight right': 'right',
      'sharp left': 'left',
      'sharp right': 'right',
    } as Record<string, string>,

    onto: (text: string, street: string) => (street ? `${text} onto ${street}` : text),
    departOn: (street: string) => `Head along ${street}`,
    depart: 'Start the trip',
    arriveSide: (side: string) => `You've arrived, on your ${side}`,
    arrive: "You've arrived",
    uturn: 'Make a U-turn',
    straightOn: 'Carry straight on',
    turn: (direction: string) => `Turn ${direction}`,
    turnPlain: 'Turn',
    continueOn: (street: string) => `Continue along ${street}`,
    continueStraight: 'Carry straight on',
    continueTowards: (direction: string) => `Keep ${direction}`,
    mergeSide: (side: string) => `Merge with traffic on the ${side}`,
    merge: 'Merge with traffic',
    onRampSide: (side: string) => `Take the slip road on the ${side}`,
    onRamp: 'Take the slip road',
    offRampSide: (side: string) => `Take the exit on the ${side}`,
    offRamp: 'Take the exit',
    forkSide: (side: string) => `At the fork, keep ${side}`,
    fork: 'At the fork, carry on',
    endOfRoadTurn: (direction: string) => `At the end of the road, turn ${direction}`,
    endOfRoad: 'At the end of the road, carry on',
    // 1st, 2nd, 3rd, 4th — e o 11.º ao 13.º são "th", que é onde uma regra
    // ingénua costuma falhar.
    roundaboutExit: (exit: number) => {
      const resto = exit % 100;
      const sufixo =
        resto >= 11 && resto <= 13
          ? 'th'
          : { 1: 'st', 2: 'nd', 3: 'rd' }[exit % 10] ?? 'th';
      return `At the roundabout, take the ${exit}${sufixo} exit`;
    },
    roundabout: 'At the roundabout, carry on',
    roundaboutTurn: (direction: string) => `At the roundabout, turn ${direction}`,
    exitRoundabout: 'Leave the roundabout',
  },
};
