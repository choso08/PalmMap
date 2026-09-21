/**
 * Os textos em português de Portugal. **É esta a tabela de origem.**
 *
 * O `en.ts` está tipado contra este ficheiro, por isso uma chave que se
 * acrescente aqui e se esqueça lá é um erro de compilação. Ao mexer, mexer nos
 * dois.
 *
 * ## Porque é que há funções e não só texto
 *
 * Onde entra um número ou um nome, a chave é uma função. Não é enfeite: em
 * português diz-se "Vire à esquerda **para** a Rua Augusta" e em inglês "Turn
 * left **onto** Rua Augusta". Se as frases fossem montadas por fora com pedaços
 * traduzidos, uma das línguas ficava com a gramática da outra. Assim cada
 * língua constrói as suas frases inteiras.
 */

export const pt = {
  /** Nomes das próprias línguas, para o ecrã de definições. */
  languages: {
    auto: 'Automático',
    pt: 'Português',
    en: 'Inglês',
  },

  /**
   * Unidades e forma de escrever números.
   *
   * O separador decimal é o que mais se nota: em português escreve-se 12,4 km e
   * em inglês 12.4 km. Trocar isto sozinho é o género de pormenor que faz uma
   * aplicação parecer mal traduzida.
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

  search: {
    placeholder: 'Pesquisar aqui',
    failed: 'Não foi possível pesquisar. Verifique a ligação à Internet.',
    noResults: 'Sem resultados.',
    saved: 'Guardados',
    recents: 'Últimos destinos',
    mapPoint: 'Ponto no mapa',
  },

  /** Os botões das categorias, e o nome do que se encontra em cada pino. */
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

  /** O que cada etiqueta do OpenStreetMap quer dizer, para a ficha do sítio. */
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
    route: 'Traçar percurso',
    addWaypoint: 'Passar por aqui a caminho',
    save: 'Guardar',
    unsave: 'Guardado',
    call: 'Telefonar',
    website: 'Sítio na Internet',
    openNow: 'Aberto',
    closedNow: 'Fechado',
  },

  route: {
    calculating: 'A calcular o percurso…',
    start: 'Iniciar navegação',
    steps: 'Ver instruções',
    duration: 'tempo estimado',
    distance: 'distância',
    best: 'melhor',
    option: (n: number) => `Opção ${n}`,
    startsAway: (distance: string) =>
      `O percurso começa a ${distance} de si, na estrada mais próxima. Esse bocado é a tracejado no mapa e fica por sua conta.`,
    tollsNotAvoided:
      'Não foi possível evitar as portagens: o serviço público de percursos não tem essa opção. Este caminho pode passar por autoestradas pagas.',
    noDirectTransit:
      'Nenhuma linha faz este caminho sem mudanças. Por agora só se procuram ligações diretas: autocarros da Carris Metropolitana, e comboio, metro ou barco de operadores cujo horário esteja descarregado nas definições.',
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
    arrived: 'Chegou ao destino.',
    speedLimit: (kmh: number) => `${kmh}`,
    /** A unidade por baixo do número do velocímetro. */
    speedUnit: 'km/h',
  },

  transit: {
    title: 'Transportes perto de si',
    subtitle: 'Carris Metropolitana · área de Lisboa',
    searching: 'A procurar paragens…',
    loadingTimes: 'A ver as horas…',
    timesFailed: 'Não foi possível obter as horas de passagem.',
    stopsFailed: 'Não foi possível obter as paragens. Verifique a ligação.',
    noneSoon: 'Sem passagens nas próximas duas horas.',
    goToStop: 'Ir até à paragem',
    stationsNearby: 'Estações perto',
    noPosition:
      'Sem a sua localização não há como saber que paragens ficam perto. Autorize o acesso ao GPS nas definições do telemóvel.',
    outsideArea:
      'Não há horários para esta zona. Só a Área Metropolitana de Lisboa tem os dados abertos — no resto do país cada operador guarda os seus.',
    noScheduleHere:
      'Não há horário descarregado para esta estação. Nas definições, em "Horários", pode descarregar o do operador — são ficheiros pequenos e depois funcionam sem rede.',
    scheduleOnly:
      'Horário publicado pelo operador, sem tempo real: se estiver atrasado, isto não sabe.',
    now: 'agora',
    inMinutes: (n: number) => `${n} min`,
    /** Os meios com que uma paragem liga a outra rede. */
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
    accuracy:
      'A precisão é a do mapa e a do dedo: serve para ter uma ideia, não para marcar uma estrema.',
  },

  offline: {
    loading: 'A obter a lista de mapas…',
    empty: 'Ainda não há mapas publicados. Corra o workflow "Gerar mapa offline" no GitHub.',
    searchIn: (n: number) => `Procurar entre ${n} países`,
    noMatch: 'Nenhum país com esse nome.',
    outdated: 'desatualizado',
    bundled: 'vem com a aplicação',
  },

  schedules: {
    loading: 'A obter a lista de horários…',
    empty: 'Ainda não há horários publicados. Corra o workflow "Gerar horários" no GitHub.',
    stationCount: (n: number) => `${n} estações`,
    expired: 'fora de prazo, descarregue outra vez',
    until: (date: string) => `até ${date}`,
    note:
      'Estes operadores só publicam o horário, não o tempo real: as horas são as previstas, e um atraso não aparece aqui. Depois de descarregados funcionam sem rede. Os autocarros da Carris Metropolitana não precisam disto — esses têm tempo real.',
    /** `20261005` fica "5 de outubro". */
    date: (day: number, month: number) => {
      const meses = [
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
      const nome = meses[month - 1];
      return nome ? `${day} de ${nome}` : '';
    },
  },

  settings: {
    title: 'Definições',

    updateTitle: 'Há uma versão nova',
    updateNow: 'Atualizar agora',
    updateLater: 'Agora não',
    updates: 'Atualizações',
    updatesHint: 'Procura e instala versões novas, sem ir ao GitHub.',
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
    updateManualNote: 'O "Instalar" final é seu — o Android não deixa nenhuma aplicação instalar-se em silêncio.',
    whatsNew: 'O que mudou',

    language: 'Língua',

    appearance: 'Aspeto',
    appearanceModes: {
      system: 'Automático',
      light: 'Claro',
      dark: 'Escuro',
    },

    travelMode: 'Meio de transporte',
    travelModeNote: 'Também se troca no painel do percurso. De bicicleta conta-se com 12,5 km/h de média.',
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
    },

    timeAdjustment: 'Tempo estimado',
    timeAdjustmentHint: 'Se as estradas da sua zona forem mais lentas do que o mapa julga.',
    timeAdjustmentNote: 'A aplicação aprende o seu ritmo ao navegar; isto só vale enquanto não o tiver medido.',
    paceNote: (list: string) => `Ritmo aprendido: ${list}.`,
    forgetPace: 'Esquecer o ritmo aprendido',
    timeAdjustments: {
      none: 'Normal',
      slow: '+25%',
      slower: '+50%',
      slowest: '+100%',
    },

    satelliteDetail: 'Detalhe do satélite',
    satelliteDetails: {
      normal: 'Normal',
      alta: 'Alta',
    },
    satelliteNormalHint: 'Sentinel-2, do Copernicus: o mundo todo, a dez metros por pixel.',
    satelliteHighHint: 'Ortofotos do Estado por cima: vê-se casa a casa, mas só em Portugal e com muitos mais dados.',

    map: 'Mapa',
    showPlaces: 'Mostrar negócios no mapa',
    showPlacesHint: 'Marca sozinho os negócios da zona que está a ver.',
    showVehicles: 'Autocarros a andar',
    showVehiclesHint: 'Onde estão os autocarros da Carris Metropolitana, ao vivo. Só com o mapa aproximado.',
    showVehiclesCost: 'Gasta bastantes dados: são 1,1 MB de vinte em vinte segundos.',

    cache: 'Mapa guardado',
    cacheHint: 'As zonas por onde passa ficam guardadas e voltam a aparecer sem rede.',
    cacheOffHint: 'Desligado: sem rede o mapa não aparece.',
    cacheFullHint: 'Quando enche, esquece primeiro o que há mais tempo não vê.',
    cacheSizes: {
      off: 'Nada',
      small: '100 MB',
      medium: '250 MB',
      large: '500 MB',
      huge: '1 GB',
    },
    clearCache: 'Apagar o mapa guardado',
    clearingCache: 'A apagar…',
    clearCacheFailed: 'Não foi possível apagar',
    cacheClearedTitle: 'Mapa guardado apagado',
    cacheClearedBody: 'As zonas voltam a ser obtidas quando houver rede.',
    tryAgain: 'Tente novamente.',

    offlineMaps: 'Mapas de países',
    offlineMapsHint: 'Guarda o país inteiro. Funciona sem rede, a qualquer zoom.',
    offlineMapsNote: 'Descarregue por Wi-Fi: os países maiores têm centenas de megabytes.',

    schedules: 'Horários',
    schedulesHint: 'Comboio, metro e barco. Guardados no telemóvel, funcionam sem rede.',

    navigation: 'Navegação',
    voice: 'Ler as instruções em voz alta',
    voiceHint: 'Anuncia as manobras à medida que se aproximam.',
    cameras: 'Avisar de radares',
    aboutText: 'Só serviços abertos e gratuitos, sem Google e sem chaves de API. O mapa é do OpenStreetMap.',
    camerasHint: 'Os que estão marcados no OpenStreetMap: fixos, de semáforo e velocidade média. Os móveis não existem em mapa nenhum — é uma ajuda, não é uma garantia.',
    tolls: 'Evitar portagens',
    tollsHint: 'Pede um caminho sem portagens. O servidor pode não ter a opção, e o preço não existe em fonte aberta.',
    batterySaver: 'Poupar bateria a navegar',
    batterySaverHint: 'Longe da manobra lê o GPS a cada quatro segundos. A precisão nunca desce.',
    speed: 'Mostrar a velocidade',
    speedHint: 'A velocidade do GPS, enquanto navega. Não gasta bateria a mais.',
    speedNote: 'Fica uns km/h abaixo do velocímetro do carro, que é o que manda, e desaparece em túneis.',

    recents: 'Últimos destinos',
    forgetRecents: 'Esquecer os últimos destinos',

    about: 'Acerca',
    credits: {
      osm: 'dados do mapa, pesquisa e tiles',
      carto: 'tiles do mapa em modo escuro',
      overpass: 'negócios e pontos de interesse',
      osrm: 'cálculo dos percursos',
      routing: 'Como se calculam os percursos.',
    },
  },

  errors: {
    noRoute: 'Não foi encontrado nenhum percurso entre estes pontos.',
    routeFailed: 'Não foi possível contactar o serviço de percursos.',
    routeGeneric: 'Não foi possível calcular o percurso.',
    noLocationForRoute: 'Sem a sua localização não é possível calcular o percurso.',
    locationDenied: 'Sem acesso ao GPS. Ainda pode ver o mapa e pesquisar moradas.',
    locationUnavailable:
      'Ainda não foi possível apanhar sinal de GPS. Dentro de casa costuma demorar.',
    updateCheckFailed: 'Não foi possível saber se há versão nova. Verifique a ligação.',
    updateDownloadFailed: (detail: string) =>
      `Não foi possível descarregar a atualização. ${detail}`.trim(),
    updateInstallFailed: (detail: string) =>
      `Não foi possível abrir o instalador. ${detail}`.trim(),
    placesFailed: 'Não foi possível procurar locais. Tente daqui a pouco.',
    placesBusy: 'O serviço está cheio neste momento. Tente daqui a pouco.',
    searchFailed: 'Não foi possível procurar.',
    zoomIn: 'Aproxime o mapa para procurar nesta zona.',
    noneOfCategory: (category: string) => `Não há ${category.toLowerCase()} nesta zona.`,
    schedulesFailed: 'Não foi possível obter os horários. Verifique a ligação.',
    scheduleListFailed:
      'Não foi possível obter a lista de horários. Verifique a ligação à Internet.',
    scheduleDownloadFailed: (operator: string, detail: string) =>
      `Não foi possível descarregar os horários de ${operator}. ${detail}`.trim(),
    mapListFailed: 'Não foi possível obter a lista de mapas. Verifique a ligação à Internet.',
    mapDownloadFailed: (region: string, detail: string) =>
      `Não foi possível descarregar o mapa de ${region}. ${detail}`.trim(),
    bundledAssetFailed: 'Não foi possível ler um ficheiro incluído na aplicação.',
    noTransitStops:
      'Não há paragens a pé de distância de um dos pontos, ou está fora da área da Carris Metropolitana.',
  },

  /**
   * As atribuições que aparecem no mapa.
   *
   * **São exigidas por licença, não são cortesia.** Os nomes das entidades não
   * se traduzem; a parte descritiva sim. Para o Sentinel-2 usa-se, em inglês, a
   * frase oficial que a EOX pede — traduzi-la seria pior do que copiá-la.
   */
  attributions: {
    sentinel:
      'Sentinel-2 cloudless por EOX IT Services GmbH (contém dados Copernicus Sentinel modificados 2024)',
    orthophotos: 'Ortofotos © Direção-Geral do Território',
  },

  hints: {
    longPress: 'Toque sem largar no mapa para marcar um ponto e ir até lá.',
  },

  /** Os tipos de radar, tal como aparecem no aviso. */
  cameras: {
    speed: 'radar de velocidade',
    average: 'controlo de velocidade média',
    trafficSignals: 'radar de semáforo',
    traffic: 'controlo de trânsito',
  },

  /**
   * As manobras da navegação.
   *
   * A gramática vive aqui e não em `maneuvers.ts` de propósito: em português
   * diz-se "Vire à esquerda **para** a Rua Augusta" e em inglês "Turn left
   * **onto** Rua Augusta". O ficheiro decide **que** manobra é; a língua decide
   * como se diz.
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
