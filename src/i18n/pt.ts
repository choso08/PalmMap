/**
 * The strings in European Portuguese. **This is the source table.**
 *
 * `en.ts` is typed against this file, so a key added here and forgotten there
 * is a compile error. When changing one, change both.
 *
 * The text itself stays in Portuguese — it is what the app shows to Portuguese
 * speakers. Only these comments are in English.
 *
 * ## Why there are functions and not only text
 *
 * Wherever a number or a name goes in, the key is a function. That is not
 * decoration: Portuguese says "Vire à esquerda **para** a Rua Augusta" and
 * English "Turn left **onto** Rua Augusta". If the sentences were assembled
 * outside from translated pieces, one language would end up with the other's
 * grammar. This way each language builds its own whole sentences.
 */

export const pt = {
  /** The languages' own names, for the settings screen. */
  languages: {
    auto: 'Automático',
    pt: 'Português',
    en: 'Inglês',
  },

  /**
   * Units and the way numbers are written.
   *
   * The decimal separator is what shows the most: Portuguese writes 12,4 km and
   * English 12.4 km. Getting this wrong is the kind of detail that makes an app
   * look badly translated.
   */
  units: {
    decimal: ',',
    metres: 'm',
    kilometres: 'km',
    minutes: 'min',
    hours: 'h',
    hectares: 'ha',
    squareMetres: 'm²',
    squareKilometres: 'km²',
    kmh: 'km/h',
    /**
     * The same units spelt out, for the voice.
     *
     * A written "m" reads in an instant; read aloud it comes out as "em". The
     * kind of detail that makes a voice sound like a badly programmed robot.
     */
    metresSpoken: 'metros',
    kilometresSpoken: 'quilómetros',
  },

  common: {
    close: 'Fechar',
    cancel: 'Cancelar',
    clear: 'Limpar',
    undo: 'Anular',
    refresh: 'Atualizar',
    saved: 'guardado',
    failed: 'Não foi possível.',
    listFailed: 'Não foi possível obter a lista.',
  },

  tabs: {
    explore: 'Explorar',
    go: 'Ir',
    saved: 'Guardados',
    settings: 'Definições',
  },
  layers: {
    open: 'Camadas do mapa',
    mapType: 'Tipo de mapa',
    details: 'Detalhes do mapa',
    tools: 'Ferramentas',
    measure: 'Medir distância ou área',
  },
  saved: {
    title: 'Guardados',
    favourites: 'Sítios guardados',
    recents: 'Recentes',
    empty: 'Ainda não guardou nenhum sítio.',
  },
  directions: {
    title: 'Direções',
    open: 'Direções',
    from: 'Origem',
    to: 'Destino',
    myLocation: 'A minha localização',
    fromPlaceholder: 'De onde parte?',
    toPlaceholder: 'Para onde vai?',
    swap: 'Trocar origem e destino',
    show: 'Ver percurso',
    needDestination: 'Escolha um destino.',
    fromLabel: (name: string) => `De: ${name}`,
  },
  search: {
    placeholder: 'Pesquisar aqui',
    failed: 'Não foi possível pesquisar.',
    failedStatus: (status: number) =>
      `O serviço de pesquisa recusou (resposta ${status}). Tente daqui a pouco.`,
    failedTimeout: 'O serviço de pesquisa não respondeu a tempo.',
    failedOther: 'Resposta inválida do serviço de pesquisa.',
    noResults: 'Sem resultados.',
    saved: 'Guardados',
    recents: 'Últimos destinos',
    mapPoint: 'Ponto no mapa',
    linkNotFound: (text: string) => `Não encontrei "${text}".`,
    voice: 'Pesquisar por voz',
    voicePrompt: 'Diga para onde quer ir',
  },

  /** The category buttons, and the name of what is found at each pin. */
  categories: {
    restaurants: 'Restaurantes',
    cafes: 'Cafés',
    pharmacies: 'Farmácias',
    fuel: 'Combustível',
    supermarkets: 'Supermercados',
    atm: 'Multibanco',
    parking: 'Estacionamento',
    health: 'Saúde',
  },

  /** What each OpenStreetMap tag means, for the place card. */
  placeKinds: {
    restaurant: 'Restaurante',
    fast_food: 'Comida rápida',
    cafe: 'Café',
    bar: 'Bar',
    pub: 'Cervejaria',
    pharmacy: 'Farmácia',
    fuel: 'Posto de combustível',
    charging_station: 'Carregamento elétrico',
    bank: 'Banco',
    atm: 'Multibanco',
    hospital: 'Hospital',
    clinic: 'Clínica',
    doctors: 'Consultório',
    dentist: 'Dentista',
    parking: 'Estacionamento',
    post_office: 'Correios',
    supermarket: 'Supermercado',
    convenience: 'Mercearia',
    bakery: 'Padaria',
    butcher: 'Talho',
    clothes: 'Roupa',
    hairdresser: 'Cabeleireiro',
    car_repair: 'Oficina',
    hotel: 'Hotel',
    hostel: 'Hostel',
    guest_house: 'Alojamento',
    museum: 'Museu',
    attraction: 'Ponto de interesse',
    school: 'Escola',
    university: 'Universidade',
  },

  place: {
    route: 'Direções',
    addWaypoint: 'Paragem',
    save: 'Guardar',
    unsave: 'Guardado',
    call: 'Ligar',
    website: 'Sítio',
    share: 'Partilhar',
    openNow: 'Aberto',
    closedNow: 'Fechado',
    open24h: 'Aberto 24 horas',
    closesSoon: 'Fecha em breve',
    closesAt: (time: string) => `Fecha às ${time}`,
    opensAt: (time: string) => `Abre às ${time}`,
    opensTomorrow: (time: string) => `Abre amanhã às ${time}`,
    opensOn: (day: string, time: string) => `Abre ${day} às ${time}`,
    closedAllDay: 'Fechado',
    weekdays: ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'],
    weekdaysShort: ['seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.'],
  },

  route: {
    calculating: 'A calcular o percurso…',
    start: 'Iniciar',
    steps: 'Passos',
    duration: 'tempo estimado',
    distance: 'distância',
    best: 'melhor',
    fastest: 'Mais rápido',
    via: (roads: string) => `por ${roads}`,
    option: (n: number) => `Opção ${n}`,
    startsAway: (distance: string) => `O percurso começa a ${distance}, na estrada mais próxima.`,
    tollsNotAvoided: 'Não foi possível evitar as portagens.',
    noDirectTransit: 'Não há ligação, nem com um transbordo.',
    bikeTypes: { road: 'Estrada', normal: 'Normal', mtb: 'BTT' },
    busStop: 'Paragem',
    changeAt: (stop: string, wait: string) => `muda em ${stop} (espera ${wait})`,
    walkTo: (time: string, stop: string) => `${time} a pé até ${stop}`,
    walkFrom: (time: string, stop: string) => `${time} a pé de ${stop}`,
    stopCount: (n: number) => (n === 1 ? '1 paragem' : `${n} paragens`),
  },

  steps: {
    title: 'Instruções',
    empty: 'Ainda não há instruções para mostrar.',
  },

  navigation: {
    recalculating: 'A recalcular o percurso…',
    following: 'A seguir o percurso…',
    toDestination: 'até ao destino',
    finish: 'Terminar',
    /** Spoken once when going over the road's limit. */
    overLimitVoice: (limit: number) => `Limite de velocidade: ${limit}.`,
    then: 'Depois',
    /** On screen under the manoeuvre: "Radar a 300 m". */
    cameraAt: (label: string, distance: string) => `${label} a ${distance}`,
    recenter: 'Recentrar',
    overview: 'Ver o percurso',
    arrived: 'Chegou ao destino.',
    /**
     * What the voice says, which **is not** what is written on screen.
     *
     * The screen has room for "A recalcular o percurso…", with an ellipsis,
     * because it is a state one sees. Spoken aloud, the ellipsis does not exist
     * and the sentence ends with a full stop.
     */
    recalculatingVoice: 'A recalcular o percurso.',
    /** "In two hundred metres, turn left onto Rua Augusta." */
    inDistance: (distance: string, instruction: string) =>
      `Daqui a ${distance}, ${instruction}.`,
    cameraAhead: (label: string, distance: string) =>
      `Atenção: ${label} a ${distance}.`,
    cameraAheadLimit: (label: string, distance: string, limit: number) =>
      `Atenção: ${label} a ${distance}, limite ${limit}.`,
    /** The notification of the service that keeps navigation alive in the background. */
    serviceTitle: 'PalmMap a navegar',
    serviceBody: 'A seguir o percurso, mesmo com o ecrã apagado.',
    speedLimit: (kmh: number) => `${kmh}`,
    /** The unit under the speedometer's number. */
    speedUnit: 'km/h',
  },

  transit: {
    title: 'Transportes perto de si',
    subtitle: 'Carris Metropolitana · área de Lisboa',
    searching: 'A procurar paragens…',
    loadingTimes: 'A ver as horas…',
    timesFailed: 'Não foi possível obter as horas de passagem.',
    stopsFailed: 'Não foi possível obter as paragens.',
    noneSoon: 'Sem passagens nas próximas 2 h.',
    goToStop: 'Ir até à paragem',
    stationsNearby: 'Estações perto',
    noPosition: 'Sem acesso ao GPS.',
    outsideArea: 'Sem horários para esta zona.',
    noScheduleHere: 'Sem horário descarregado. Descarregue-o em Definições → Horários.',
    scheduleOnly: 'Horário previsto, sem tempo real.',
    now: 'agora',
    inMinutes: (n: number) => `${n} min`,
    /** A line's journey from the stop, tapped in the arrivals list. */
    loadingJourney: 'A ver o percurso…',
    journeyUnavailable: 'Não foi possível ver o percurso desta carreira.',
    getOffHere: 'Sair aqui',
    moreStops: (n: number, minutes: number | null) =>
      `${n === 1 ? '1 paragem' : `${n} paragens`}${minutes !== null ? ` · ${minutes} min` : ''}`,
    /** The modes a stop connects with on another network. */
    kinds: {
      bus: 'Autocarro',
      train: 'Comboio',
      subway: 'Metro',
      light_rail: 'Metro de superfície',
      boat: 'Barco',
    },
  },

  measure: {
    title: 'Fita métrica',
    distance: 'Distância',
    area: 'Área',
    distanceLabel: 'distância',
    perimeterLabel: 'perímetro',
    areaLabel: 'área',
    firstPoint: 'Toque no mapa para pôr o primeiro ponto.',
    secondPoint: 'Toque outra vez para medir até lá.',
    needThird: 'Falta um ponto para fechar a forma.',
    pointCount: (n: number) => (n === 1 ? '1 ponto' : `${n} pontos`),
  },

  offline: {
    loading: 'A obter a lista de mapas…',
    empty: 'Ainda não há mapas.',
    searchIn: (n: number) => `Procurar entre ${n} países`,
    noMatch: 'Nenhum país com esse nome.',
    outdated: 'desatualizado',
    bundled: 'vem com a aplicação',
  },

  schedules: {
    loading: 'A obter a lista de horários…',
    empty: 'Ainda não há horários.',
    stationCount: (n: number) => `${n} estações`,
    expired: 'fora de prazo, descarregue outra vez',
    until: (date: string) => `até ${date}`,
    note: 'Horário previsto: os atrasos não aparecem.',
    /** `20261005` becomes "5 de outubro". */
    date: (day: number, month: number) => {
      const months = [
        'janeiro',
        'fevereiro',
        'março',
        'abril',
        'maio',
        'junho',
        'julho',
        'agosto',
        'setembro',
        'outubro',
        'novembro',
        'dezembro',
      ];
      const name = months[month - 1];
      return name ? `${day} de ${name}` : '';
    },
  },

  settings: {
    searchPlaceholder: 'Procurar nas definições',
    searchNothing: 'Nenhuma definição com esse nome.',
    title: 'Definições',

    updateTitle: 'Há uma versão nova',
    installUnfinished: 'A instalação não terminou',
    updateNow: 'Atualizar agora',
    updateLater: 'Agora não',
    updates: 'Atualizações',
    currentVersion: (version: string) => `Está na versão ${version}`,
    checkUpdates: 'Procurar agora',
    checking: 'A procurar…',
    upToDate: 'Está na versão mais recente.',
    updateAvailable: (version: string) => `A versão ${version} já saiu`,
    updateSize: (size: string) => `${size} a descarregar`,
    downloadUpdate: 'Descarregar e instalar',
    downloadingUpdate: 'A descarregar…',
    installUpdate: 'Instalar agora',
    updateReady: 'Descarregada. Falta instalar.',
    whatsNew: 'O que mudou',
    moreChanges: (n: number) => (n === 1 ? 'E mais uma mudança' : `E mais ${n} mudanças`),

    language: 'Língua',

    appearance: 'Aspeto',
    appearanceModes: {
      system: 'Automático',
      light: 'Claro',
      dark: 'Escuro',
    },

    travelModes: {
      driving: 'Carro',
      walking: 'A pé',
      cycling: 'Bicicleta',
      transit: 'Autocarro',
    },

    mapTypes: {
      map: 'Mapa',
      satellite: 'Satélite',
      transit: 'Transportes',
      satelliteTransit: 'Satélite + bus',
    },

    timeAdjustment: 'Tempo estimado',
    paceNote: (list: string) => `Ritmo aprendido: ${list}.`,
    forgetPace: 'Esquecer o ritmo aprendido',
    paceLearning: 'Aprender o meu ritmo',

    satelliteDetail: 'Detalhe do satélite',
    satelliteDetails: {
      normal: 'Normal',
      alta: 'Alta',
    },
    satelliteHighHint: 'Casa a casa, só em Portugal. Gasta mais dados.',

    map: 'Mapa',
    showPlaces: 'Mostrar negócios no mapa',
    showVehicles: 'Autocarros a andar',
    showVehiclesCost: 'Gasta cerca de 1,1 MB a cada 20 s.',

    tryAgain: 'Tente novamente.',

    offlineMaps: 'Mapas de países',
    feedback: 'Avaliar a aplicação',
    feedbackTitle: 'Avaliação',
    feedbackPlaceholder: 'O que acha? O que falta?',
    feedbackSend: 'Enviar pelo GitHub',
    requestMap: 'Falta um país? Peça-o no GitHub',
    offlineMapsNote: 'Os maiores têm centenas de MB: use Wi-Fi.',

    schedules: 'Horários',

    lastCrash: 'A aplicação fechou-se sozinha',
    lastCrashForget: 'Apagar',
    navigation: 'Navegação',
    voice: 'Ler as instruções em voz alta',
    voiceRegionHint: 'Sem voz de português de Portugal instalada: instale-a no Android, em Texto para voz.',
    cameras: 'Avisar de radares',
    speedLimit: 'Avisar quando passo o limite',
    aboutText: 'Só serviços abertos e gratuitos. Mapa do OpenStreetMap.',
    camerasHint: 'Só os marcados no OpenStreetMap; os móveis não aparecem.',
    tolls: 'Evitar portagens',
    tollsHint: 'Nem sempre é possível.',
    batterySaver: 'Poupar bateria a navegar',
    batterySaverHint: 'Lê o GPS menos vezes longe das manobras.',
    speed: 'Mostrar a velocidade',
    speedNote: 'O velocímetro do carro é que manda.',

    recents: 'Últimos destinos',
    forgetRecents: 'Esquecer os últimos destinos',
    recentsForgotten: 'Últimos destinos esquecidos',

    about: 'Acerca',
    credits: {
      osm: 'dados do mapa, pesquisa e tiles',
      overpass: 'negócios e pontos de interesse',
      osrm: 'cálculo dos percursos',
      routing: 'Como se calculam os percursos.',
    },
  },

  errors: {
    noRoute: 'Não há percurso entre estes pontos.',
    tooFar: {
      driving: 'Demasiado longe para ir de carro.',
      walking: 'Demasiado longe para ir a pé.',
      cycling: 'Demasiado longe para ir de bicicleta.',
    },
    routeFailed: 'Não foi possível contactar o serviço de percursos.',
    routeGeneric: 'Não foi possível calcular o percurso.',
    noLocationForRoute: 'Sem GPS não dá para calcular o percurso.',
    locationDenied: 'Sem acesso ao GPS.',
    locationUnavailable: 'À espera de sinal de GPS…',
    updateCheckFailed: 'Não foi possível procurar versões novas.',
    updateDownloadFailed: (detail: string) =>
      `Não foi possível descarregar a atualização. ${detail}`.trim(),
    updateInstallFailed: (detail: string) =>
      `Não foi possível abrir o instalador. ${detail}`.trim(),
    placesFailed: 'Não foi possível procurar locais.',
    placesBusy: 'Serviço ocupado. Tente daqui a pouco.',
    searchFailed: 'Não foi possível procurar.',
    zoomIn: 'Aproxime o mapa para procurar aqui.',
    noneOfCategory: (category: string) => `Não há ${category.toLowerCase()} nesta zona.`,
    schedulesFailed: 'Não foi possível obter os horários.',
    transitOffline: 'Sem ligação ao serviço dos autocarros.',
    transitTimeout: 'O serviço dos autocarros não respondeu a tempo.',
    transitStatus: (status: number) =>
      `O serviço dos autocarros respondeu ${status}.`,
    scheduleListFailed: 'Não foi possível obter a lista de horários.',
    scheduleDownloadFailed: (operator: string, detail: string) =>
      `Não foi possível descarregar os horários de ${operator}. ${detail}`.trim(),
    mapListFailed: 'Não foi possível obter a lista de mapas.',
    mapDownloadFailed: (region: string, detail: string) =>
      `Não foi possível descarregar o mapa de ${region}. ${detail}`.trim(),
    bundledAssetFailed: 'Não foi possível ler um ficheiro incluído na aplicação.',
    noTransitStops: 'Não há paragens perto.',
  },

  /**
   * The attributions that appear on the map.
   *
   * **They are required by licence, not a courtesy.** The organisations' names
   * are not translated; the descriptive part is. For Sentinel-2 the English
   * version uses the official wording EOX asks for — translating it would be
   * worse than copying it.
   */
  attributions: {
    sentinel:
      'Sentinel-2 cloudless por EOX IT Services GmbH (contém dados Copernicus Sentinel modificados 2025)',
    orthophotos: 'Ortofotos © Direção-Geral do Território',
  },

  hints: {
    longPress: 'Toque sem largar para marcar um ponto.',
  },

  /** The kinds of speed camera, as they appear in the warning. */
  cameras: {
    speed: 'radar de velocidade',
    average: 'controlo de velocidade média',
    trafficSignals: 'radar de semáforo',
    traffic: 'controlo de trânsito',
  },

  /**
   * The navigation manoeuvres.
   *
   * The grammar lives here and not in `maneuvers.ts` on purpose: Portuguese
   * says "Vire à esquerda **para** a Rua Augusta" and English "Turn left
   * **onto** Rua Augusta". That file decides **which** manoeuvre it is; the
   * language decides how it is said.
   */
  maneuvers: {
    directions: {
      left: 'à esquerda',
      right: 'à direita',
      'slight left': 'ligeiramente à esquerda',
      'slight right': 'ligeiramente à direita',
      'sharp left': 'acentuadamente à esquerda',
      'sharp right': 'acentuadamente à direita',
      straight: 'em frente',
      uturn: 'inversão de marcha',
    } as Record<string, string>,
    sides: {
      left: 'esquerda',
      right: 'direita',
      'slight left': 'esquerda',
      'slight right': 'direita',
      'sharp left': 'esquerda',
      'sharp right': 'direita',
    } as Record<string, string>,

    onto: (text: string, street: string) => (street ? `${text} para ${street}` : text),
    departOn: (street: string) => `Siga por ${street}`,
    depart: 'Comece a viagem',
    arriveSide: (side: string) => `Chegou ao destino, à sua ${side}`,
    arrive: 'Chegou ao destino',
    uturn: 'Inverta o sentido de marcha',
    straightOn: 'Siga em frente',
    turn: (direction: string) => `Vire ${direction}`,
    turnPlain: 'Vire',
    continueOn: (street: string) => `Continue por ${street}`,
    continueStraight: 'Continue em frente',
    continueTowards: (direction: string) => `Continue ${direction}`,
    mergeSide: (side: string) => `Junte-se ao trânsito pela ${side}`,
    merge: 'Junte-se ao trânsito',
    onRampSide: (side: string) => `Entre no acesso à ${side}`,
    onRamp: 'Entre no acesso',
    offRampSide: (side: string) => `Saia pela ${side}`,
    offRamp: 'Saia',
    forkSide: (side: string) => `Na bifurcação, mantenha-se pela ${side}`,
    fork: 'Na bifurcação, siga',
    endOfRoadTurn: (direction: string) => `No fim da estrada, vire ${direction}`,
    endOfRoad: 'No fim da estrada, siga',
    roundaboutExit: (exit: number) => `Na rotunda, saia na ${exit}.ª saída`,
    roundabout: 'Na rotunda, siga',
    roundaboutTurn: (direction: string) => `Na rotunda, vire ${direction}`,
    exitRoundabout: 'Saia da rotunda',
  },
};
