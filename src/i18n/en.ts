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
    metresSpoken: 'metres',
    kilometresSpoken: 'kilometres',
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

  tabs: {
    explore: 'Explore',
    go: 'Go',
    saved: 'Saved',
    settings: 'Settings',
  },
  layers: {
    open: 'Map layers',
    mapType: 'Map type',
    details: 'Map details',
    tools: 'Tools',
    measure: 'Measure distance or area',
  },
  saved: {
    title: 'Saved',
    favourites: 'Saved places',
    recents: 'Recent',
    empty: 'No saved places yet.',
  },
  directions: {
    title: 'Directions',
    open: 'Directions',
    from: 'From',
    to: 'To',
    myLocation: 'My location',
    fromPlaceholder: 'Where from?',
    toPlaceholder: 'Where to?',
    swap: 'Swap start and destination',
    show: 'Show route',
    needDestination: 'Choose a destination.',
    fromLabel: (name: string) => `From: ${name}`,
  },
  search: {
    placeholder: 'Search here',
    failed: 'Search failed.',
    failedStatus: (status: number) =>
      `The search service refused (answer ${status}). Try again shortly.`,
    failedTimeout: 'The search service took too long to answer.',
    failedOther: 'The search service sent an answer that made no sense.',
    noResults: 'No results.',
    saved: 'Saved',
    recents: 'Recent destinations',
    mapPoint: 'Point on the map',
    voice: 'Search by voice',
    voicePrompt: 'Say where you want to go',
    voiceUnavailable: 'This phone has no speech recognition.',
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
    route: 'Directions',
    addWaypoint: 'Add stop',
    save: 'Save',
    unsave: 'Saved',
    call: 'Call',
    website: 'Website',
    share: 'Share',
    openNow: 'Open',
    closedNow: 'Closed',
    open24h: 'Open 24 hours',
    closesSoon: 'Closes soon',
    closesAt: (time: string) => `Closes ${time}`,
    opensAt: (time: string) => `Opens ${time}`,
    opensTomorrow: (time: string) => `Opens tomorrow ${time}`,
    opensOn: (day: string, time: string) => `Opens ${day} ${time}`,
    closedAllDay: 'Closed',
    weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    weekdaysShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },

  route: {
    calculating: 'Working out the route…',
    start: 'Start',
    steps: 'Steps',
    duration: 'estimated time',
    distance: 'distance',
    best: 'best',
    fastest: 'Fastest',
    via: (roads: string) => `via ${roads}`,
    option: (n: number) => `Option ${n}`,
    startsAway: (distance: string) => `The route starts ${distance} away, on the nearest road.`,
    tollsNotAvoided: 'Tolls could not be avoided.',
    noDirectTransit: 'No direct connection.',
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
    overLimitVoice: (limit: number) => `Speed limit ${limit}.`,
    then: 'Then',
    cameraAt: (label: string, distance: string) => `${label} in ${distance}`,
    recenter: 'Re-centre',
    overview: 'Route overview',
    arrived: "You've arrived.",
    recalculatingVoice: 'Recalculating the route.',
    inDistance: (distance: string, instruction: string) => `In ${distance}, ${instruction}.`,
    cameraAhead: (label: string, distance: string) => `Heads up: ${label} in ${distance}.`,
    cameraAheadLimit: (label: string, distance: string, limit: number) =>
      `Heads up: ${label} in ${distance}, limit ${limit}.`,
    serviceTitle: 'PalmMap navigating',
    serviceBody: 'Following the route, even with the screen off.',
    speedLimit: (kmh: number) => `${kmh}`,
    speedUnit: 'km/h',
  },

  transit: {
    title: 'Transport near you',
    subtitle: 'Carris Metropolitana · Lisbon area',
    searching: 'Looking for stops…',
    loadingTimes: 'Checking times…',
    timesFailed: "Couldn't get the departure times.",
    stopsFailed: 'Could not get the stops.',
    noneSoon: 'Nothing in the next 2 h.',
    goToStop: 'Walk to the stop',
    stationsNearby: 'Stations nearby',
    noPosition: 'No GPS access.',
    outsideArea: 'No timetables for this area.',
    noScheduleHere: 'No timetable downloaded. Get it in Settings → Timetables.',
    scheduleOnly: 'Scheduled times, not live.',
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
  },

  offline: {
    loading: 'Getting the list of maps…',
    empty: 'No maps yet.',
    searchIn: (n: number) => `Search among ${n} countries`,
    noMatch: 'No country by that name.',
    outdated: 'out of date',
    bundled: 'included with the app',
  },

  schedules: {
    loading: 'Getting the list of timetables…',
    empty: 'No timetables yet.',
    stationCount: (n: number) => (n === 1 ? '1 station' : `${n} stations`),
    expired: 'out of date, download again',
    until: (date: string) => `until ${date}`,
    note: 'Scheduled times: delays do not show.',
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
    searchPlaceholder: 'Search settings',
    searchNothing: 'No setting by that name.',
    title: 'Settings',

    installUnfinished: 'The install did not finish',
    updateTitle: 'A new version is out',
    updateNow: 'Update now',
    updateLater: 'Not now',
    updates: 'Updates',
    currentVersion: (version: string) => `You're on version ${version}`,
    checkUpdates: 'Check now',
    checking: 'Checking…',
    upToDate: "You're on the latest version.",
    updateAvailable: (version: string) => `Version ${version} is out`,
    updateSize: (size: string) => `${size} to download`,
    downloadUpdate: 'Download and install',
    downloadingUpdate: 'Downloading…',
    installUpdate: 'Install now',
    updateReady: 'Downloaded. Ready to install.',
    whatsNew: "What's changed",
    moreChanges: (n: number) => (n === 1 ? 'And one more change' : `And ${n} more changes`),

    language: 'Language',

    appearance: 'Appearance',
    appearanceModes: {
      system: 'Automatic',
      light: 'Light',
      dark: 'Dark',
    },

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
    paceNote: (list: string) => `Learned pace: ${list}.`,
    forgetPace: 'Forget the learned pace',
    timeAdjustments: {
      none: 'Normal',
      slow: '+25%',
      slower: '+50%',
      slowest: '+100%',
    },

    satelliteDetail: 'Satellite detail',
    satelliteDetails: {
      normal: 'Normal',
      alta: 'High',
    },
    satelliteHighHint: 'House by house, Portugal only. Uses more data.',

    map: 'Map',
    showPlaces: 'Show businesses on the map',
    showVehicles: 'Buses on the move',
    showVehiclesCost: 'Uses about 1.1 MB every 20 s.',

    cache: 'Saved map',
    cacheOffHint: 'Without network, the map will not show.',
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
    cacheClearedBody: 'It is fetched again when online.',
    tryAgain: 'Try again.',

    offlineMaps: 'Country maps',
    offlineMapsNote: 'The largest are hundreds of MB: use Wi-Fi.',

    schedules: 'Timetables',

    lastCrash: 'The app closed by itself',
    lastCrashForget: 'Clear',
    navigation: 'Navigation',
    voice: 'Read directions aloud',
    voiceRegionHint: 'No voice installed for this region: add one in Android, under Text-to-speech.',
    cameras: 'Warn about speed cameras',
    speedLimit: 'Warn when over the speed limit',
    aboutText: 'Only open, free services. Map by OpenStreetMap.',
    camerasHint: 'Only those mapped in OpenStreetMap; mobile ones never show.',
    tolls: 'Avoid tolls',
    tollsHint: 'Not always possible.',
    batterySaver: 'Save battery while navigating',
    batterySaverHint: 'Reads the GPS less often away from turns.',
    speed: 'Show your speed',
    speedNote: 'The car speedometer is the one that counts.',

    recents: 'Recent destinations',
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
    noRoute: 'No route between these points.',
    routeFailed: "Couldn't reach the routing service.",
    routeGeneric: "Couldn't work out the route.",
    noLocationForRoute: 'Without GPS the route cannot be calculated.',
    locationDenied: 'No GPS access.',
    locationUnavailable: 'Waiting for a GPS signal…',
    updateCheckFailed: 'Could not check for updates.',
    updateDownloadFailed: (detail: string) =>
      `Couldn't download the update. ${detail}`.trim(),
    updateInstallFailed: (detail: string) =>
      `Couldn't open the installer. ${detail}`.trim(),
    placesFailed: 'Could not search for places.',
    placesBusy: 'Service busy. Try again shortly.',
    searchFailed: "Couldn't search.",
    zoomIn: 'Zoom in to search here.',
    noneOfCategory: (category: string) => `No ${category.toLowerCase()} in this area.`,
    schedulesFailed: 'Could not get the timetables.',
    transitOffline: 'Cannot reach the bus service.',
    transitTimeout: 'The bus service took too long to answer.',
    transitStatus: (status: number) => `The bus service answered ${status}.`,
    scheduleListFailed: 'Could not get the timetable list.',
    scheduleDownloadFailed: (operator: string, detail: string) =>
      `Couldn't download the ${operator} timetable. ${detail}`.trim(),
    mapListFailed: 'Could not get the map list.',
    mapDownloadFailed: (region: string, detail: string) =>
      `Couldn't download the map of ${region}. ${detail}`.trim(),
    bundledAssetFailed: "Couldn't read a file included with the app.",
    noTransitStops: 'No stops nearby.',
  },

  attributions: {
    // The wording EOX asks for, copied rather than translated.
    sentinel:
      'Sentinel-2 cloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
    orthophotos: 'Aerial imagery © Direção-Geral do Território',
  },

  hints: {
    longPress: 'Press and hold to drop a pin.',
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
    // 1st, 2nd, 3rd, 4th — and the 11th to 13th are "th", which is where a
    // naive rule usually fails.
    roundaboutExit: (exit: number) => {
      const lastTwo = exit % 100;
      const suffix =
        lastTwo >= 11 && lastTwo <= 13
          ? 'th'
          : { 1: 'st', 2: 'nd', 3: 'rd' }[exit % 10] ?? 'th';
      return `At the roundabout, take the ${exit}${suffix} exit`;
    },
    roundabout: 'At the roundabout, carry on',
    roundaboutTurn: (direction: string) => `At the roundabout, turn ${direction}`,
    exitRoundabout: 'Leave the roundabout',
  },
};
