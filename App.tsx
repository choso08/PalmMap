import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';

import { CategoryBar } from './src/components/CategoryBar';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { SpeedBadge } from './src/components/SpeedBadge';
import { UpdateSplash } from './src/components/UpdateSplash';
import { checkForUpdate, onWifi, type UpdateInfo } from './src/services/update';
import { guarded, installCrashHandler } from './src/services/crash';

/** Quando se procurou versão nova pela última vez. Ver o efeito que o usa. */
const UPDATE_CHECK_KEY = 'palmmap.ultimaProcuraDeVersao';

/**
 * A versão que se mandou embora, para o aviso não voltar a aparecer.
 *
 * Guarda-se o **número** da compilação adiada e não um sim-ou-não: assim o aviso
 * cala-se para aquela versão e volta a falar quando sair a seguinte, que é o
 * comportamento que se quer. Um aviso que reaparece a cada arranque deixa de ser
 * lido ao fim de dois dias — é a mesma lição dos avisos de radar.
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
  MAP_PINS_DEBOUNCE_MS,
  VEHICLES_MIN_ZOOM,
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
import { reverseGeocode } from './src/services/nominatim';
import { RouteError, getRoutes } from './src/services/osrm';
import {
  cachedInBounds,
  searchCategoryInBounds,
  searchInBounds,
} from './src/services/overpass';
import { planScheduledTrips } from './src/services/schedules';
import { liveVehicles, type LiveVehicle } from './src/services/vehicles';
import { configureTileRequests, setMapCacheSize } from './src/services/tiles';
import {
  nearbyStations,
  nearbyStops,
  planBusTrips,
  type TransitTrip,
  type TransitStation,
  type TransitStop,
} from './src/services/transit';
import {
  MAP_TYPES,
  SettingsProvider,
  cacheMegabytesFor,
  nextMapType,
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
import { speak, stopSpeaking } from './src/utils/voice';

// **Antes de tudo o resto.** Um erro que aconteça a carregar os módulos abaixo
// já tem quem o escreva — e é precisamente aí que um erro não tem mais nenhuma
// forma de se dar a conhecer. Ver `src/services/crash.ts`.
installCrashHandler();

// Identifica-nos junto do OpenStreetMap logo no arranque, antes de qualquer tile.
configureTileRequests();

/** As definições têm de envolver tudo, porque o tema sai delas. */
export default function App() {
  return (
    <SafeAreaProvider>
      {/*
        Por fora de tudo: um erro a desenhar o ecrã passa a ficar à vista em vez
        de fechar a aplicação sem explicação nenhuma. Ver `ErrorBoundary`.
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
  // As margens do sistema: barra de estado, câmara ao centro e barra de
  // navegação. No Android é preciso pedi-las — o mapa desenha por baixo delas.
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const { settings, update } = useSettings();
  const { learnPace } = useLearnedPace();

  const mapRef = useRef<MapViewRef>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  /**
   * A versão nova, quando há.
   *
   * Vive aqui e não dentro das definições porque marca o botão das definições
   * com um ponto — quem não abrir as definições tem de ver na mesma que há
   * novidade.
   */
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  /**
   * Se a versão nova se pode descarregar sozinha: só em Wi-Fi.
   *
   * Lê-se **uma vez, ao procurar**, e não a cada desenho: mudar de rede a meio
   * de uma descarga não a deve mandar recomeçar nem parar.
   */
  const [updateOnWifi, setUpdateOnWifi] = useState(false);
  /** A versão que já se mandou embora. 0 quando ainda não se mandou nenhuma. */
  const [updateDismissed, setUpdateDismissed] = useState(0);
  /** Painel das paragens e horas de passagem. */
  const [transitVisible, setTransitVisible] = useState(false);
  /**
   * Fita métrica: quando está ligada, cada toque no mapa põe um ponto em vez de
   * mostrar a dica. É a única coisa que muda o que um toque faz, por isso vale a
   * pena que se note bem que está ligada.
   */
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<Coordinates[]>([]);
  /**
   * Medir ao longo de uma linha ou medir uma forma fechada.
   *
   * São duas coisas diferentes: o caminho de casa ao trabalho não se fecha, e
   * fechá-lo sozinho dava um número errado a quem só queria a distância.
   */
  const [measureMode, setMeasureMode] = useState<MeasureMode>('linha');
  /**
   * As paragens perto de si, no mapa dos transportes.
   *
   * Vivem aqui e não no painel porque os pinos têm de aparecer no mapa **só por
   * se estar no mapa dos transportes** — sem ser preciso abrir o painel das
   * horas para os ver.
   */
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
  const [transitLoading, setTransitLoading] = useState(false);
  const [transitError, setTransitError] = useState<string | null>(null);
  /** Fora da Área Metropolitana de Lisboa, onde não há dados abertos. */
  const [transitOutside, setTransitOutside] = useState(false);
  /**
   * Estações de comboio, metro, metro de superfície e barco perto de si.
   *
   * Destas só se sabe onde ficam. Aparecem na mesma porque saber que há uma
   * estação de comboio ali é metade da questão — e é o primeiro passo para um
   * dia haver horários também.
   */
  const [transitStations, setTransitStations] = useState<TransitStation[]>([]);

  /**
   * Os autocarros a andar, e se o zoom já dá para os mostrar.
   *
   * O zoom vive numa `ref` (o `viewport`), que um efeito não pode observar. Por
   * isso guarda-se aqui só o **booleano** de estar acima do limite: muda duas
   * vezes numa sessão em vez de a cada arrastar do dedo.
   */
  const [vehicles, setVehicles] = useState<LiveVehicle[]>([]);
  const [vehicleZoomOk, setVehicleZoomOk] = useState(false);
  /**
   * O meio do mapa, em texto e arredondado a três casas — uns cem metros.
   *
   * Pela mesma razão do booleano acima: o `viewport` é uma `ref` e um efeito não
   * a consegue observar. É isto que faz as paragens e as estações seguirem o
   * mapa em vez do GPS.
   */
  const [mapCentre, setMapCentre] = useState<string | null>(null);
  /** A paragem aberta. Vive aqui porque se abre da lista **ou** do mapa. */
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  /**
   * A última posição, fora do ciclo de desenho.
   *
   * O percurso lê-a daqui em vez de depender do estado. Se dependesse, cada
   * leitura do GPS — de dez em dez segundos — mandava um pedido novo ao OSRM
   * enquanto houvesse um destino escolhido.
   */
  const userLocationRef = useRef<Coordinates | null>(null);
  /** Passa a verdadeiro na primeira posição. É o que destranca o percurso. */
  const [hasLocation, setHasLocation] = useState(false);

  const [destination, setDestination] = useState<Place | null>(null);
  /**
   * Paragens pelo caminho, pela ordem por que se passa por elas.
   *
   * "Passa pela farmácia e depois vai para casa" — o destino continua a ser o
   * destino, estas são os pontos por onde o percurso tem de ir antes de lá
   * chegar.
   */
  const [waypoints, setWaypoints] = useState<Place[]>([]);
  /**
   * Os caminhos que o serviço devolveu, e qual está escolhido.
   *
   * O OSRM sabe dar dois ou três caminhos diferentes para o mesmo destino. O
   * primeiro é o que ele considera melhor, mas quem conduz é que sabe qual
   * prefere — daí serem todos guardados e desenhados.
   */
  const [routeOptions, setRouteOptions] = useState<Route[]>([]);
  const [routeIndex, setRouteIndex] = useState(0);
  const route = routeOptions[routeIndex] ?? null;
  const setRoute = useCallback((novo: Route | null) => {
    setRouteOptions(novo ? [novo] : []);
    setRouteIndex(0);
  }, []);
  /**
   * Trajetos de autocarro, quando o meio escolhido são os transportes.
   *
   * Ficam à parte do `routeOptions` de propósito: um trajeto de autocarro não é
   * um percurso desenhado no mapa, é uma lista de horas. Misturá-los obrigava
   * tudo o que lê o percurso a saber distinguir os dois.
   */
  const [transitTrips, setTransitTrips] = useState<TransitTrip[] | null>(null);
  const [transitTripIndex, setTransitTripIndex] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [stepsVisible, setStepsVisible] = useState(false);

  const [category, setCategory] = useState<SearchCategory | null>(null);
  /** Negócios da categoria escolhida (botões) ou da área visível do mapa. */
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  /** Ponto largado no mapa com um toque longo, ainda sem percurso traçado. */
  const [droppedPin, setDroppedPin] = useState<Coordinates | null>(null);

  /** Sítios guardados, lidos do telemóvel ao arrancar. */
  const [favourites, setFavourites] = useState<Place[]>([]);
  /** Últimos destinos, para não se ter de escrever a mesma morada outra vez. */
  const [recents, setRecents] = useState<Place[]>([]);

  /** Radares em cima do percurso, pela ordem por que se passa por eles. */
  const [cameras, setCameras] = useState<SpeedCamera[]>([]);
  /** O radar de que se está a avisar neste momento, se houver algum. */
  const [cameraAhead, setCameraAhead] = useState<{
    camera: SpeedCamera;
    meters: number;
  } | null>(null);
  /** Radares já anunciados, para não repetir o mesmo a cada leitura do GPS. */
  const warnedCameras = useRef(new Set<number>());

  /**
   * Verdadeiro quando a manobra seguinte ainda vai longe e se pode ler o GPS
   * menos vezes.
   *
   * Mudar isto volta a subscrever o GPS, por isso não pode andar a saltar: as
   * duas distâncias são de propósito diferentes, para não ficar a ligar e a
   * desligar em cima do limite.
   */
  const [slowGps, setSlowGps] = useState(false);

  /**
   * A câmara anda com a pessoa, fora da navegação. Liga-se com dois toques no
   * botão do GPS e desliga-se ao arrastar o mapa — ver `handleLocatePress`.
   */
  const [followUser, setFollowUser] = useState(false);
  /** Quando foi o último toque no botão do GPS, para reconhecer o toque duplo. */
  const lastLocateTap = useRef(0);

  /** Navegação a decorrer: segue a posição e anuncia as manobras. */
  const [navigating, setNavigating] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [nextStep, setNextStep] = useState<RouteStep | null>(null);
  const [distanceToStep, setDistanceToStep] = useState(0);
  const [remaining, setRemaining] = useState({ meters: 0, seconds: 0 });
  /**
   * A que velocidade se vai, em km/h. `null` enquanto o GPS não a souber dizer.
   *
   * Vem de graça dentro das leituras da navegação, por isso não há aqui
   * subscrição nenhuma a mais — ver `watchPosition`.
   */
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  /**
   * Vai-se a andar depressa o suficiente para isto ser um carro.
   *
   * É o que liga o velocímetro fora da navegação e acelera as leituras do GPS.
   * A pé ou parado fica desligado, e aí o GPS volta ao ritmo lento de sempre —
   * é isso que impede esta funcionalidade de custar bateria a quem não a usa.
   */
  const [drivingGps, setDrivingGps] = useState(false);
  /** Quando se viu velocidade de carro pela última vez. Ver `DRIVING_LINGER_MS`. */
  const lastDrivingAt = useRef(0);
  /**
   * O ritmo desta viagem: quantas vezes mais tempo se está mesmo a levar do que
   * o que o percurso previa. `null` enquanto ainda não se andou o suficiente
   * para ter algum sentido — ver `PACE_MIN_MS`.
   */
  const [livePace, setLivePace] = useState<number | null>(null);
  /**
   * De onde se começou a contar o ritmo: a hora, o que já se tinha andado e o
   * que o percurso previa até ali.
   *
   * Volta a zero a cada recálculo, porque o percurso novo tem outra distância
   * total e as contas de "quanto já andei" deixariam de bater certo.
   */
  const paceStart = useRef<{
    atMs: number;
    coveredMeters: number;
    assumedSeconds: number;
  } | null>(null);
  /**
   * O ritmo medido e o meio de transporte em que foi medido, para ficar
   * guardado quando a viagem terminar.
   *
   * Numa `ref` e com o meio lá dentro de propósito: quem guarda é o efeito que
   * vê a navegação acabar, e esse não pode depender das definições sem voltar a
   * correr a cada mudança delas.
   */
  const paceToLearn = useRef<{ mode: TravelMode; factor: number } | null>(null);
  /** Até que ponto do percurso já se andou. O mapa apaga o que fica para trás. */
  const [progressIndex, setProgressIndex] = useState(0);
  /** Quantas leituras seguidas fora do percurso já se viram. */
  const offRouteStrikes = useRef(0);
  /** Manobras já anunciadas, para não repetir a mesma vezes sem conta. */
  const announced = useRef(new Set<string>());
  const [placesError, setPlacesError] = useState<string | null>(null);

  /**
   * Mostra a dica de como marcar um ponto, durante uns segundos.
   *
   * Aparece só quando a pessoa toca no mapa e não acontece nada — que é
   * precisamente quando faz falta saber que o toque tem de ser longo. Estar
   * sempre no ecrã só tapava o mapa a quem já sabe.
   */
  const [hintVisible, setHintVisible] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * O nome do tipo de mapa, logo depois de se trocar.
   *
   * Com três tipos, o ícone sozinho já não chega para se perceber ao que se vai
   * — sobretudo entre o mapa normal e o dos transportes, que à primeira vista
   * são os dois mapas desenhados.
   */
  const [mapTypeLabel, setMapTypeLabel] = useState<string | null>(null);
  const mapTypeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrarTipoDeMapa = useCallback((tipo: MapType) => {
    // `t()` e não o `strings` do componente: esta função tem a lista de
    // dependências vazia, e com o `strings` ficava presa à língua do arranque —
    // trocar para inglês deixava o aviso a dizer "Transportes" para sempre.
    setMapTypeLabel(t().settings.mapTypes[tipo]);
    if (mapTypeTimer.current) {
      clearTimeout(mapTypeTimer.current);
    }
    mapTypeTimer.current = setTimeout(() => setMapTypeLabel(null), 1800);
  }, []);

  // O contador tem de ser cancelado ao sair, senão mexia no estado depois de a
  // aplicação já ter fechado o ecrã.
  useEffect(
    () => () => {
      if (mapTypeTimer.current) {
        clearTimeout(mapTypeTimer.current);
      }
    },
    [],
  );

  /**
   * As paragens perto, sempre que se está no mapa dos transportes.
   *
   * **Perto do meio do mapa, e não perto do GPS.** Isto esteve preso à posição
   * do telemóvel, e era a mesma avaria que os botões de categoria já tinham
   * tido: arrastar o mapa para outra terra não trazia paragem nenhuma de lá, e
   * quem abrisse o painel sem o GPS ter respondido — dentro de casa, por
   * exemplo — não via nada de todo, nem paragens nem horas de passagem. O que
   * se está a ver é que manda; a posição fica como recurso para quando ainda
   * não houve mapa nenhum.
   *
   * **Depende das coordenadas arredondadas, não do objeto da posição.** O GPS
   * devolve um objeto novo de dez em dez segundos, e depender dele fazia isto
   * correr outra vez a cada leitura — a lista reordenava-se debaixo do dedo e
   * os pinos do mapa eram redesenhados sem nada ter mudado. Arredondado a três
   * casas são uns cem metros, que é a escala a que a resposta muda mesmo.
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
        // As estações vêm ao mesmo tempo que as paragens: são quatro listas
        // curtas e ficam em memória a seguir ao primeiro pedido.
        const [encontradas, estacoes] = await Promise.all([
          nearbyStops({ latitude: lat, longitude: lon }),
          nearbyStations({ latitude: lat, longitude: lon }).catch(() => []),
        ]);
        if (cancelled) {
          return;
        }
        setTransitStations(estacoes);
        // Os três estados repõem-se sempre, e não só quando correm mal: sem
        // isso, abrir o painel fora de Lisboa e depois entrar na área deixava
        // o aviso de "não há horários" por cima de uma lista cheia.
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
   * Os autocarros a andar, no mapa dos transportes.
   *
   * **Três travões, e nenhum é decorativo.** A resposta é a frota inteira, 1,1 MB
   * de cada vez, porque o serviço não tem filtro por área nem por linha. Por isso
   * só se pede quando se está mesmo a olhar para os transportes (`mapType`), com
   * o mapa aproximado ao ponto de os autocarros se distinguirem uns dos outros
   * (`vehicleZoomOk`), e com a definição ligada.
   *
   * Falhar aqui não merece mensagem nenhuma: ficam os autocarros da última vez e
   * a atualização seguinte tenta outra vez. Isto é informação a mais no mapa,
   * não é o mapa.
   */
  useEffect(() => {
    if (settings.mapType !== 'transit' || !settings.showVehicles || !vehicleZoomOk) {
      setVehicles([]);
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
        // Ver acima: sem posições novas, ficam as antigas.
      }
    };

    void carregar();
    const timer = setInterval(() => void carregar(), VEHICLES_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settings.mapType, settings.showVehicles, vehicleZoomOk]);

  /** Área visível do mapa, atualizada quando o mapa para de se mexer. */
  const viewport = useRef<{ bounds: Bounds; zoom: number } | null>(null);
  const pinsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Identifica o pedido mais recente, para ignorar respostas atrasadas. */
  const latestPlaces = useRef(0);
  /** Mapas de países guardados, para o mapa poder funcionar sem rede. */
  const [offlineRegions, setOfflineRegions] = useState<OfflineRegion[]>([]);
  /** Passa a verdadeiro quando os tipos de letra do mapa já estão no sítio. */
  const [labelsReady, setLabelsReady] = useState(false);

  // O tamanho do mapa guardado, sempre que a definição muda.
  useEffect(() => {
    setMapCacheSize(cacheMegabytesFor(settings.cacheSize));
  }, [settings.cacheSize]);

  // Sítios guardados, lidos uma vez ao arrancar.
  useEffect(() => {
    void loadFavourites().then(setFavourites);
    void loadRecents().then(setRecents);
  }, []);

  // O mapa que vem dentro da aplicação e os tipos de letra têm de ser postos na
  // pasta da aplicação antes de o mapa os ir procurar. Só faz alguma coisa no
  // primeiro arranque. Se falhar, perde-se o mapa offline e mais nada, por isso
  // não se interrompe o arranque por causa disso.
  useEffect(() => {
    void installBundledAssets()
      .then(() => setLabelsReady(true))
      .catch(() => undefined)
      .then(() => setOfflineRegions(installedRegions()));
  }, []);

  /**
   * Renova os mapas de países que já têm versão mais recente, ao arrancar.
   *
   * **Só por Wi-Fi.** Um país são centenas de megabytes — Portugal continental
   * são 325 MB — e descarregar isso sozinho pelos dados móveis de alguém era
   * gastar-lhe o plafond sem perguntar. Por Wi-Fi não custa nada e é o que se
   * quer: o mapa vai-se mantendo em dia sem ninguém ter de pensar nisso.
   *
   * Fora do Wi-Fi não acontece nada aqui, e o ecrã dos mapas marca-os como
   * desatualizados para quem os quiser renovar à mão.
   *
   * Em silêncio de ponta a ponta: quem não pediu isto não tem de ver nem um
   * indicador a rodar nem um erro. Ver `refreshOutdatedOnWifi`.
   */
  useEffect(() => {
    void refreshOutdatedOnWifi().then((renovados) => {
      if (renovados > 0) {
        // O mapa em uso pode ter sido substituído por baixo dos pés.
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
   * Procura versão nova ao abrir a aplicação, e em Wi-Fi descarrega-a sozinha.
   *
   * **A data da última procura fica guardada**, e não só em memória: sem isso,
   * abrir e fechar a aplicação seis vezes seguidas valia seis pedidos. A API do
   * GitHub conta 60 por hora **por endereço IP**, partilhados com tudo o que
   * esteja na mesma rede. O travão é de um quarto de hora — ver
   * `UPDATE_CHECK_INTERVAL_MS`.
   *
   * **A descarga automática é só em Wi-Fi**, e isso é uma decisão e não um
   * esquecimento: são dezenas de megabytes, e gastá-los no plafond de alguém sem
   * perguntar é o que já se decidiu não fazer com os mapas dos países. Nos dados
   * móveis o aviso aparece na mesma, com o botão à espera.
   *
   * Falhar aqui não pode dar erro nenhum no ecrã: quem não pediu nada não tem
   * de saber que uma verificação silenciosa não conseguiu chegar à Internet.
   * Quem quiser resposta carrega no botão, nas definições, e aí sim vê o erro.
   */
  useEffect(() => {
    void (async () => {
      try {
        setUpdateDismissed(Number(await AsyncStorage.getItem(UPDATE_DISMISSED_KEY)) || 0);

        const ultima = Number(await AsyncStorage.getItem(UPDATE_CHECK_KEY)) || 0;
        if (Date.now() - ultima < UPDATE_CHECK_INTERVAL_MS) {
          return;
        }
        // Marca-se **antes** de perguntar. Se a rede estiver em baixo, o que não
        // se quer é voltar a tentar a cada arranque durante o dia inteiro.
        await AsyncStorage.setItem(UPDATE_CHECK_KEY, String(Date.now()));

        // A rede lê-se antes da resposta: assim, quando o aviso aparecer, já
        // está decidido se a descarga arranca sozinha ou fica à espera de um
        // toque. Ao contrário, o aviso nascia sem saber e começava a descarregar
        // um instante depois de aparecer, o que se lê como um salto.
        const wifi = await onWifi();
        const encontrada = await checkForUpdate();
        setUpdateOnWifi(wifi);
        setUpdateInfo(encontrada);
      } catch {
        // Em silêncio, de propósito — ver a nota acima.
      }
    })();
  }, []);

  // Posição atual, pedida uma vez ao arrancar.
  useEffect(() => {
    void (async () => {
      // **"Sem posição" não é "sem permissão".** Estas duas coisas andavam
      // juntas: qualquer falta de posição contava como recusa, e a aplicação
      // escondia o aviso certo e o botão do GPS. Mas o GPS falha por muitas
      // razões que não são a pessoa ter dito que não — dentro de casa, sem céu
      // à vista, ou simplesmente por ainda não ter respondido. A recusa
      // pergunta-se a quem sabe.
      const autorizada = await requestPermission();
      setLocationDenied(!autorizada);

      const position = await getCurrentPosition();
      userLocationRef.current = position;
      setUserLocation(position);
      setHasLocation(position !== null);
    })();
  }, []);

  /**
   * Ao voltar do segundo plano, vai buscar a posição outra vez.
   *
   * **Com a aplicação fora do ecrã, o Android corta as leituras de GPS** — é a
   * contrapartida de pedir a permissão só "durante a utilização", e é o que se
   * quer. Mas quem andou entretanto voltava com a posição de onde estava antes,
   * e nada no ecrã dizia que aquilo já não valia.
   *
   * Pede-se uma leitura nova aqui, sem esperar pela do seguimento: essa vem de
   * dez em dez segundos e só depois de a pessoa andar cinquenta metros, o que
   * deixava uma janela larga em que centrar o mapa levava ao sítio errado.
   *
   * Durante a navegação não é preciso: aí lê-se a cada segundo, e o Android
   * retoma isso mal a aplicação volta.
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
   * Fora da navegação, continua a seguir a posição devagar, para o ponto azul
   * acompanhar quem anda em vez de ficar preso onde estava ao abrir. Durante a
   * navegação desliga-se, porque aí quem segue o GPS é o motor de navegação e
   * ter os dois ligados era gastar bateria a dobrar.
   *
   * **A andar de carro, o ritmo sobe.** De dez em dez segundos chega de sobra
   * para um ponto azul, e não chega de todo para um velocímetro: a 90 km/h, dez
   * segundos são duzentos e cinquenta metros, e o número que se lia era o de há
   * um quarteirão. Acima de `DRIVING_SPEED_MS` passa-se a ler de dois em dois
   * segundos, e com `distanceInterval` a zero — senão, quem trava dos 90 para
   * zero não anda os cinquenta metros que destrancariam a leitura seguinte, e o
   * velocímetro ficava preso nos 90 com o carro imóvel.
   */
  useEffect(() => {
    if (navigating) {
      return;
    }

    let stop: (() => void) | null = null;
    let cancelled = false;

    void watchPositionIdle(
      // Pela mesma razão do seguimento da navegação: quem chama isto é o lado
      // nativo, e um erro aqui fechava a aplicação sem deixar rasto.
      guarded((position: Coordinates, speedMs: number | null) => {
        userLocationRef.current = position;
        setUserLocation(position);
        setHasLocation(true);
        setLocationDenied(false);

        // **O número é o do GPS, sem retoque nenhum.** O recetor mede o
        // andamento pelo efeito de Doppler e é ele que sabe; o que a aplicação
        // faz é passar de metros por segundo a km/h. Quando o Android não sabe
        // dizer a velocidade, o velocímetro desaparece — isso não é retocar o
        // número, é não ter número nenhum.
        setSpeedKmh(speedMs === null ? null : Math.round(speedMs * 3.6));

        // **Entra-se depressa e sai-se devagar.** Basta uma leitura acima do
        // limiar para ligar; para desligar é preciso estar devagar há mais de
        // `DRIVING_LINGER_MS`. Sem essa espera, o velocímetro desaparecia em
        // cada semáforo e voltava ao arrancar — e um velocímetro mostra zero
        // quando se pára, não se esconde.
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

  // Calcula o percurso quando há origem e destino.
  useEffect(() => {
    // Durante a navegação a posição muda a cada segundo. Recalcular aqui faria
    // um pedido por segundo ao OSRM — quem recalcula é o motor de navegação,
    // e só quando se sai mesmo do percurso.
    if (navigating) {
      return;
    }

    if (!destination) {
      setRoute(null);
      setRouteError(null);
      return;
    }

    const origem = userLocationRef.current;
    if (!origem) {
      setRoute(null);
      setRouteError(t().errors.noLocationForRoute);
      return;
    }

    let cancelled = false;
    setRouteLoading(true);
    setRouteError(null);

    const perfil = osrmProfile(settings.travelMode);

    // --- Transportes públicos ------------------------------------------------
    //
    // Os transportes não passam pelo OSRM: não há motor de percursos que os
    // saiba calcular a partir de dados abertos. Montam-se de duas fontes, que
    // são bastante diferentes uma da outra:
    //
    // - **Autocarros**, das horas de passagem em tempo real da Carris
    //   Metropolitana. Precisa de rede — ver `planBusTrips`.
    // - **Comboio, metro e barco**, do horário guardado no telemóvel. Não
    //   precisa de rede nenhuma e responde de imediato, mas é o horário e não o
    //   comboio a andar — ver `planScheduledTrips`.
    if (perfil === null) {
      setRouteOptions([]);
      void (async () => {
        // O horário guardado primeiro, e sem esperar por rede: assim há logo
        // alguma coisa no ecrã, mesmo que o serviço dos autocarros esteja em
        // baixo ou não haja ligação nenhuma.
        let doHorario: TransitTrip[] = [];
        try {
          doHorario = planScheduledTrips(origem, destination.coordinates);
        } catch {
          // Um horário estragado não pode impedir os autocarros de aparecer.
        }

        // Chega mais cedo primeiro, venha de onde vier. É a mesma regra dos
        // autocarros entre si: o que interessa é a que horas se lá está.
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
            // A mensagem do erro diz o que falhou mesmo — o serviço a responder
            // com um número, a demorar demais ou a rede em baixo. Antes era
            // sempre "verifique a ligação", que diz o contrário do que se passa
            // a quem tem rede e o mapa a carregar normalmente.
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
        );
        if (!cancelled) {
          setRouteOptions(result);
          setRouteIndex(0);
          // A lista de recentes só se toca quando o percurso sai mesmo: um
          // destino que não deu caminho nenhum não é sítio nenhum.
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
    // A posição entra aqui como `hasLocation` e não como coordenadas: o percurso
    // traça-se quando se escolhe o destino (ou quando chega a primeira posição),
    // e não outra vez a cada passo que se dá. Seguir a pessoa é o trabalho da
    // navegação, que tem o seu próprio recálculo.
  }, [destination, waypoints, hasLocation, settings.travelMode, settings.avoidTolls, navigating]);

  /**
   * Procura negócios para mostrar no mapa.
   *
   * Com uma categoria escolhida, procura-a **na área que se está a ver** — não à
   * volta do GPS. De outra forma, ao olhar para outra zona os resultados
   * apareciam longe dali e parecia que o botão não fazia nada.
   */
  const searchPlacesIn = useCallback(
    async (bounds: Bounds, zoom: number, chosen: SearchCategory | null) => {
      const requestId = ++latestPlaces.current;

      if (chosen) {
        if (zoom < CATEGORY_MIN_ZOOM) {
          setPlaces([]);
          setPlacesError(t().errors.zoomIn);
          return;
        }

        setPlacesError(null);
        try {
          const found = await searchCategoryInBounds(chosen, bounds);
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

      // Sem categoria: os pinos automáticos, que só aparecem bem aproximado.
      if (!settings.showPlacesOnMap || zoom < MAP_PINS_MIN_ZOOM) {
        setPlaces([]);
        return;
      }

      try {
        const found = await searchInBounds(bounds);
        if (requestId === latestPlaces.current) {
          setPlaces(found);
          setPlacesError(null);
        }
      } catch (error) {
        // **Uma falha tem de se ver.** Isto esteve calado de propósito, com o
        // argumento de que o mapa continua a servir — e o resultado foi pior do
        // que o problema: a Overpass recusa de vez em quando, os pinos da zona
        // nova não apareciam, e não havia nada no ecrã que distinguisse "não há
        // negócios aqui" de "o serviço não respondeu". Parecia avaria da
        // aplicação. Os pinos que já lá estavam ficam, que é melhor do que
        // apagar o que se tinha.
        if (requestId === latestPlaces.current) {
          setPlacesError(
            error instanceof Error ? error.message : t().errors.placesFailed,
          );
        }
      }
    },
    [settings.showPlacesOnMap],
  );

  // Ao escolher uma categoria, procura já na zona que está à vista.
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
   * Quando o mapa para de se mexer, atualiza os negócios à vista.
   *
   * Só depois de uma pausa — a Overpass é mantida por voluntários e um pedido
   * por cada arrastar do dedo seria abusivo.
   */
  const handleViewportChange = useCallback(
    (bounds: Bounds, zoom: number) => {
      viewport.current = { bounds, zoom };

      // Só o booleano, e só quando muda de lado: pôr o mesmo valor não redesenha
      // nada, mas vale a pena deixar claro que é com isso que se conta.
      const daParaVer = zoom >= VEHICLES_MIN_ZOOM;
      setVehicleZoomOk((atual) => (atual === daParaVer ? atual : daParaVer));

      // O meio do mapa, arredondado a uns cem metros. É o que diz às paragens e
      // às estações onde procurar — arredondado porque a lista não tem de se
      // reordenar debaixo do dedo a cada pixel que o mapa anda.
      const centro = `${((bounds.south + bounds.north) / 2).toFixed(3)},${(
        (bounds.west + bounds.east) /
        2
      ).toFixed(3)}`;
      setMapCentre((atual) => (atual === centro ? atual : centro));

      if (pinsTimer.current) {
        clearTimeout(pinsTimer.current);
      }

      // **O que já está em memória aparece já, sem esperar.** A espera existe
      // para não atirar um pedido à Overpass a cada arrastar do dedo — e uma
      // resposta guardada não atira pedido nenhum. Andar para trás e para a
      // frente numa zona por onde já se passou deixa de ter um segundo e dois
      // décimos de mapa sem pinos a cada paragem, que era o que mais fazia isto
      // parecer lento. Sem categoria escolhida, porque só os pinos automáticos
      // encaixam na grelha da cache.
      if (!category && settings.showPlacesOnMap && zoom >= MAP_PINS_MIN_ZOOM) {
        const guardados = cachedInBounds(bounds);
        if (guardados) {
          // O contador sobe para que uma resposta que ainda venha a caminho de
          // uma área anterior não venha depois escrever por cima destes.
          latestPlaces.current += 1;
          setPlaces(guardados);
          setPlacesError(null);
          return;
        }
      }

      pinsTimer.current = setTimeout(() => {
        void searchPlacesIn(bounds, zoom, category);
      }, MAP_PINS_DEBOUNCE_MS);
    },
    [category, searchPlacesIn, settings.showPlacesOnMap],
  );

  useEffect(() => {
    return () => {
      if (pinsTimer.current) {
        clearTimeout(pinsTimer.current);
      }
    };
  }, []);

  /**
   * Onde cada manobra fica ao longo da linha do percurso.
   *
   * Calcula-se uma vez por percurso, porque é uma conta pesada e durante a
   * navegação é preciso responder a cada segundo.
   */
  const stepIndices = useMemo(() => {
    if (!route) {
      return [];
    }
    return route.steps.map((step) => nearestIndex(route.coordinates, step.location));
  }, [route]);

  /**
   * Onde ficam as paragens ao longo da linha do percurso.
   *
   * Serve ao recálculo: ao sair do caminho já depois da farmácia, mandar o
   * serviço passar outra vez por ela dava meia-volta. Só entram as que ainda
   * estão à frente.
   */
  const waypointIndices = useMemo(() => {
    if (!route) {
      return [];
    }
    return waypoints.map((w) => nearestIndex(route.coordinates, w.coordinates));
  }, [route, waypoints]);

  /** Impede que se peça um recálculo novo enquanto o anterior não respondeu. */
  const recalculating_ = useRef(false);

  /**
   * Mantém o ecrã aceso enquanto se navega.
   *
   * Sem isto o telemóvel bloqueia ao fim de meio minuto — a pessoa não lhe está
   * a tocar, está a conduzir. É a diferença entre uma aplicação de navegação e
   * um mapa que se vê parado. Fora da navegação não se mexe: deixar o ecrã
   * sempre aceso gastava bateria sem razão nenhuma.
   *
   * A voz continua a falar com o ecrã apagado, mas o mapa deixa de se ver e o
   * Android acaba por travar a atualização da posição — daí não bastar o som.
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
   * Vai buscar os radares que ficam em cima do percurso.
   *
   * Faz-se uma vez por percurso e não durante a condução: é um pedido à
   * Overpass, que é pesada, e os radares não mudam de sítio a meio da viagem.
   *
   * Falhar aqui não pode estragar nada — fica-se sem avisos e navega-se na
   * mesma, que é muito melhor do que não haver percurso.
   */
  useEffect(() => {
    warnedCameras.current.clear();
    setCameraAhead(null);

    // Os índices dos radares são posições na linha do percurso **anterior**.
    // Deixá-los enquanto o pedido novo não chega fazia anunciar radares a
    // distâncias inventadas, medidas contra a linha errada.
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

  /** Segue a posição enquanto a navegação decorre. */
  useEffect(() => {
    if (!navigating || !route || !destination) {
      return;
    }

    let stopWatching: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      // **Embrulhado.** Isto é chamado pelo lado nativo a cada segundo, durante
      // uma viagem inteira: um erro aqui não passa por `try` nenhum nosso nem
      // pelo `ErrorBoundary`, vai direito ao tratador global e, num APK, fecha a
      // aplicação — a meio de uma estrada. Ver `guarded`, em `services/crash.ts`.
      const stop = await watchPosition(
        guarded((position, accuracyMeters, speedMs) => {
          setUserLocation(position);

          // A velocidade sai da mesma leitura, sem custo nenhum, e vai para o
          // ecrã tal como o GPS a deu — ver a nota no seguimento lento.
          setSpeedKmh(speedMs === null ? null : Math.round(speedMs * 3.6));

          const { index, offRouteMeters } = locateOnRoute(route.coordinates, position);
          setProgressIndex(index);
          const remainingMeters = distanceAlong(
            route.coordinates,
            index,
            route.coordinates.length - 1,
          );

          // Chegada.
          if (remainingMeters < ARRIVAL_METERS) {
            // A voz sai **depois** de a navegação fechar, e não antes: sair da
            // navegação desfaz este efeito, e a limpeza dele chama `stopSpeaking`
            // — que calava o "chegou ao destino" a meio da primeira sílaba.
            const dizer = settings.voiceGuidance;
            setNavigating(false);
            if (dizer) {
              setTimeout(() => speak(t().navigation.arrived), 250);
            }
            return;
          }

          // Saiu do percurso? Só se confirma ao fim de algumas leituras seguidas,
          // porque uma isolada pode ser apenas imprecisão do GPS.
          // Só se conta como "fora do percurso" o que a leitura consegue mesmo
          // afirmar. Entre prédios, o GPS dá facilmente cinquenta metros de erro;
          // sem esta margem, estar parado num semáforo bastava para a aplicação
          // julgar que se tinha saído do caminho e recalcular do nada.
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
                // Só as paragens que ainda faltam. As que já ficaram para trás
                // mandariam o percurso dar meia-volta.
                const emFalta = waypoints.filter((_, i) => waypointIndices[i] > index);

                const [fresh] = await getRoutes(
                  position,
                  emFalta.map((w) => w.coordinates),
                  destination.coordinates,
                  osrmProfile(settings.travelMode) ?? 'driving',
                  settings.avoidTolls,
                );
                setRoute(fresh);
                announced.current.clear();
      // Sem isto, voltar a navegar o mesmo percurso não voltava a avisar de
      // nenhum radar por onde já se tinha passado.
      warnedCameras.current.clear();
      setCameraAhead(null);
      // E começava com o GPS ao ritmo lento em que a viagem anterior acabou.
      setSlowGps(false);
                // Percurso novo, contagem nova: sem isto, a linha aparecia
                // apagada até onde ia o percurso antigo.
                setProgressIndex(0);
                // E o ritmo volta a contar do zero, porque o percurso novo tem
                // outra distância total — "quanto já andei" deixava de bater certo.
                // O que já se mediu não se perde: continua no `livePace` até haver
                // medida nova.
                paceStart.current = null;
              } catch {
                // Sem ligação, continua-se com o percurso antigo em vez de ficar sem nada.
              } finally {
                setRecalculating(false);
                recalculating_.current = false;
              }
            })();
            return;
          }

          // A próxima manobra é a primeira que ainda está à frente.
          const ahead = stepIndices.findIndex((stepIndex) => stepIndex > index);
          const step = ahead >= 0 ? route.steps[ahead] : route.steps[route.steps.length - 1];
          const toStep =
            ahead >= 0
              ? distanceAlong(route.coordinates, index, stepIndices[ahead])
              : remainingMeters;

          // --- Radares -------------------------------------------------------
          //
          // O radar seguinte é o primeiro que ainda está à frente na linha. Como a
          // lista já vem ordenada, basta encontrar o primeiro cujo ponto do
          // percurso é maior do que aquele onde se está.
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

          // --- Poupança de bateria -------------------------------------------
          //
          // Numa reta longa não é preciso ler a posição a cada segundo: o que
          // falta continua a acertar e a manobra seguinte está a quilómetros.
          // Perto da manobra volta-se ao ritmo normal, porque é aí que a posição
          // decide se o aviso de virar sai a tempo.
          if (settings.batterySaver) {
            if (toStep > BATTERY_SAVER_MIN_METERS && !slowGps) {
              setSlowGps(true);
            } else if (toStep < BATTERY_SAVER_MIN_METERS * 0.66 && slowGps) {
              setSlowGps(false);
            }
          }

          // --- O ritmo a que se vai mesmo ------------------------------------
          //
          // Compara-se o tempo que o troço já andado levou mesmo com o que o
          // percurso previa para ele. O resultado multiplica o que falta, e é isso
          // que faz a hora de chegada acertar com quem a está a ler. O modelo tem
          // de ser o mesmo que o ecrã usa — daí o `modelSeconds` aqui também,
          // senão de bicicleta media-se contra uma previsão e mostrava-se outra.
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

            // Os dois mínimos são o que impede um semáforo à saída de casa de
            // valer por uma viagem inteira — ver `PACE_MIN_MS`.
            if (elapsedMs >= PACE_MIN_MS && andados >= PACE_MIN_METERS && previstos > 0) {
              const medido = clampPace(elapsedMs / 1000 / previstos, settings.travelMode);
              setLivePace(medido);
              paceToLearn.current = { mode: settings.travelMode, factor: medido };
            }
          }

          setNextStep(step ?? null);
          setDistanceToStep(toStep);
          setRemaining({
            meters: remainingMeters,
            seconds:
              route.distanceMeters > 0
                ? route.durationSeconds * (remainingMeters / route.distanceMeters)
                : 0,
          });

          // Anúncios em voz, uma vez por manobra e por distância. As manobras que
          // não obrigam a decidir nada ficam de fora — ver `worthAnnouncing`.
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

    // **Aqui não se cala a voz nem se apaga o velocímetro**, e isso mudou por
    // uma razão que se ouvia. Esta limpeza corre sempre que o percurso, os
    // radares ou o ritmo do GPS mudam — e não só ao sair da navegação. Com o
    // `stopSpeaking()` aqui dentro, recalcular o percurso dizia "a recalcular o
    // percurso" e cortava-se a si próprio a meio: o percurso novo chegava, o
    // efeito voltava a correr e a limpeza calava a frase. Quem as duas coisas
    // são para fazer é o efeito que vê a navegação acabar, mais abaixo.
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
   * O que há a fazer ao entrar e ao sair da navegação: calar a voz, apagar o
   * velocímetro e guardar o ritmo da viagem.
   *
   * Vive num efeito só seu, e não na limpeza do efeito da navegação, porque
   * aquele volta a correr sempre que o percurso, os radares ou o ritmo do GPS
   * mudam — e aí guardava-se o mesmo ritmo meia dúzia de vezes a meio da viagem,
   * cada uma a puxar o valor guardado mais para o desta.
   */
  useEffect(() => {
    if (navigating) {
      paceStart.current = null;
      paceToLearn.current = null;
      setLivePace(null);
      return;
    }

    // Calar a voz e apagar o velocímetro são coisas de **acabar** a navegação, e
    // vivem aqui por isso: na limpeza do efeito que segue a posição corriam a
    // cada mudança de percurso e cortavam os anúncios a meio.
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
   * A área visível, para a pesquisa preferir o que está por perto.
   *
   * Estável de propósito: lê de uma `ref`, por isso nunca muda de identidade. Se
   * fosse criada em cada desenho, a `SearchBar` repetia a pesquisa sem parar.
   */
  const getMapBounds = useCallback(() => viewport.current?.bounds ?? null, []);

  /**
   * A que altura fica a bússola do mapa, no canto inferior esquerdo.
   *
   * Vive aqui e não no `MapView` porque **o canto é partilhado**: é o da régua,
   * e é tapado pelos painéis de baixo. A bússola tem de seguir as mesmas três
   * alturas que os botões flutuantes, senão fica por baixo de um deles ou atrás
   * de um painel — e como só aparece com o mapa rodado, o desalinho passa
   * despercebido a quem nunca roda o mapa.
   *
   * Os números são os mesmos de `measureRaised`, `locateNavigating` e
   * `measureButton`, por essa ordem.
   */
  const compassBottom =
    selectedPlace || destination || measuring
      ? insets.bottom + 322
      : navigating
        ? // A navegar, este canto tem o velocímetro, que o `NavigationPanel`
          // põe a 130. A bússola vai para cima dele — estavam as duas à mesma
          // altura, e com o mapa a rodar no sentido da marcha a bússola está
          // sempre à vista, por isso ficavam uma em cima da outra a viagem
          // toda. Entre as duas, quem manda no sítio mais baixo é o velocímetro.
          insets.bottom + 192
        : insets.bottom + 90;

  const handleTapEmpty = useCallback((coordinates: Coordinates) => {
    // Com a fita métrica ligada, o toque põe um ponto e mais nada.
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
   * A fita métrica lida de uma `ref` e não do estado.
   *
   * Se `handleTapEmpty` dependesse de `measuring`, mudava de identidade sempre
   * que se ligasse ou desligasse — e o `MapView` voltava a desenhar-se por
   * causa disso.
   */
  const measuringRef = useRef(false);
  measuringRef.current = measuring;

  // Sem isto, sair do ecrã com a dica a contar deixava um temporizador solto.
  useEffect(() => () => {
    if (hintTimer.current) {
      clearTimeout(hintTimer.current);
    }
  }, []);

  const handleStartNavigation = useCallback(() => {
    announced.current.clear();
    offRouteStrikes.current = 0;
    setSelectedPlace(null);
    setStepsVisible(false);
    setProgressIndex(0);

    // Calcula-se já o que falta, com a posição que se tem. Sem isto o painel
    // arrancava a zero e só se corrigia na primeira leitura do GPS — que, com a
    // pessoa parada à espera de arrancar, podia nunca chegar. Era o que fazia
    // aparecer "1 min · 0 m" num percurso de quilómetros.
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

    setNavigating(true);
  }, [route]);

  const handleStopNavigation = useCallback(() => {
    setNavigating(false);
    setNextStep(null);
    setRecalculating(false);
    stopSpeaking();
  }, []);

  /**
   * O botão do GPS: um toque centra uma vez, dois toques põem a câmara a andar
   * com a pessoa.
   *
   * **O toque simples age já, sem esperar para ver se vem outro atrás.** Esperar
   * trezentos milissegundos por um segundo toque que quase nunca vem era pôr a
   * ação mais usada a parecer lenta para servir a menos usada. Assim o segundo
   * toque promove o que o primeiro já fez: o primeiro leva a câmara à posição, o
   * segundo manda-a lá ficar.
   *
   * Com o seguimento ligado, qualquer toque o desliga. O botão está aceso,
   * carrega-se nele e apaga-se — que é o que se espera de um botão aceso, e evita
   * ter de acertar noutro toque duplo para o desfazer.
   */
  const handleLocatePress = useCallback(() => {
    // A navegação tem o seu próprio seguimento, que roda o mapa no sentido da
    // marcha. Aqui o botão serve só para voltar a prender a câmara ao carro
    // depois de se ter arrastado o mapa para espreitar o que vem a seguir.
    if (navigating) {
      mapRef.current?.followAgain();
      return;
    }

    const agora = Date.now();
    const duplo = agora - lastLocateTap.current < DOUBLE_TAP_MS;
    // Zero e não `agora`: senão o terceiro toque de uma série contava como um
    // segundo duplo, e três toques seguidos ligavam e desligavam o seguimento
    // sem que se percebesse porquê.
    lastLocateTap.current = duplo ? 0 : agora;

    if (followUser) {
      setFollowUser(false);
      return;
    }

    if (duplo) {
      setFollowUser(true);
      return;
    }

    // Não se centra no que está em estado: pergunta-se ao serviço, que só
    // devolve a posição guardada se ela ainda for recente e vai buscar uma nova
    // se não for. É isto que evita o mapa ir parar a um sítio onde já se esteve
    // depois de a aplicação ter passado pelo segundo plano — ver
    // `getBestPosition`.
    void (async () => {
      const posicao = await getBestPosition();
      if (!posicao) {
        // Não fazer nada é o pior que este botão podia fazer: quem carrega fica
        // sem saber se a aplicação o ouviu. Dentro de casa o GPS demora mesmo,
        // e dizê-lo evita a pessoa ficar a carregar à espera de nada.
        setPlacesError(t().errors.locationUnavailable);
        return;
      }
      userLocationRef.current = posicao;
      setUserLocation(posicao);
      mapRef.current?.recenter(posicao);
    })();
  }, [navigating, followUser]);

  /**
   * Escolher um destino desliga o seguimento.
   *
   * Com um destino escolhido, o mapa enquadra o percurso todo — e uma câmara
   * presa à pessoa desfazia esse enquadramento à primeira leitura do GPS. Quem
   * escolhe um destino quer ver o caminho, não o seu próprio ponto.
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
   * Toque longo no mapa: larga um pino ali e abre a ficha.
   *
   * A ficha aparece logo, com as coordenadas, e a morada entra depois — assim
   * não se fica à espera do Nominatim para poder traçar o percurso.
   */
  const handleDropPin = useCallback((coordinates: Coordinates) => {
    const fallback: Place = {
      // Identificador negativo para nunca chocar com os do OpenStreetMap.
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
      // Só se substitui se a pessoa ainda estiver a ver este mesmo pino.
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
    // Destino novo, viagem nova: as paragens do percurso anterior não têm nada
    // que ver com este.
    setWaypoints([]);
    setDestination(place);
  }, []);

  /**
   * Acrescenta uma paragem ao percurso que já existe.
   *
   * Vai para o fim da lista, antes do destino: é a ordem natural de quem vai
   * juntando sítios pelo caminho. Reordenar seria mais um ecrã para pouco uso.
   */
  const handleAddWaypoint = useCallback((place: Place) => {
    setWaypoints((atuais) =>
      atuais.some((w) => isSamePlace(w, place)) ? atuais : [...atuais, place],
    );
    setSelectedPlace(null);
    setDroppedPin(null);
  }, []);

  /**
   * Traçar o caminho até uma paragem, a partir do painel dos transportes.
   *
   * O meio de transporte não se mexe aqui de propósito: quem vai apanhar o
   * autocarro costuma ir a pé, mas pode ir de bicicleta ou deixar o carro lá
   * perto. Trocar a definição por baixo do nariz da pessoa era decidir por ela.
   */
  const handleGoToStop = useCallback((stop: TransitStop) => {
    setTransitVisible(false);
    setSelectedStopId(null);
    // Destino novo, viagem nova: as paragens do percurso anterior não têm nada
    // que ver com este.
    setWaypoints([]);
    setSelectedPlace(null);
    setDroppedPin(null);
    setDestination({
      id: -Date.now(),
      name: stop.name,
      address: stop.locality ? `Paragem · ${stop.locality}` : 'Paragem',
      coordinates: stop.coordinates,
      category: 'Paragem',
    });
  }, []);

  const handleRouteToSelected = useCallback(() => {
    if (selectedPlace) {
      // Como na pesquisa: destino novo, viagem nova. Sem isto, o percurso para
      // o sítio novo continuava a ser forçado pela paragem do percurso antigo.
      setWaypoints([]);
      setDestination(selectedPlace);
      setSelectedPlace(null);
      // O destino passa a ter marcador próprio, por isso o pino sai.
      setDroppedPin(null);
    }
  }, [selectedPlace]);

  const handleClearRoute = useCallback(() => {
    setDestination(null);
    setWaypoints([]);
    setRoute(null);
    setRouteError(null);
    setDroppedPin(null);
  }, []);

  // Ver a nota junto aos painéis, mais abaixo.
  const lastPlace = useLastValue(selectedPlace);
  const lastDestination = useLastValue(destination);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        userLocation={userLocation}
        destination={destination?.coordinates ?? null}
        route={route}
        places={places}
        onViewportChange={handleViewportChange}
        onPlacePress={handlePlacePress}
        droppedPin={droppedPin}
        onDropPin={handleDropPin}
        onTapEmpty={handleTapEmpty}
        following={navigating}
        followUser={followUser}
        onFollowUserChange={setFollowUser}
        progressIndex={progressIndex}
        cameras={cameras}
        measurePoints={measuring ? measurePoints : []}
        measureClosed={measureMode === 'area'}
        alternativeRoutes={navigating ? [] : routeOptions.filter((_, i) => i !== routeIndex)}
        waypoints={waypoints.map((w) => w.coordinates)}
        transitStops={
          transitTrips?.[transitTripIndex]
            ? [transitTrips[transitTripIndex].from, transitTrips[transitTripIndex].to]
            : transitStops
        }
        selectedStopId={selectedStopId}
        onStopPress={setSelectedStopId}
        transitStations={transitStations}
        vehicles={vehicles}
        compassBottom={compassBottom}
        offlineRegions={offlineRegions}
        labelsReady={labelsReady}
      />

      {!navigating ? (
      <View style={styles.top} pointerEvents="box-none">
        <SearchBar
          onSelect={handleSearchSelect}
          onOpenSettings={() => setSettingsVisible(true)}
          updateAvailable={updateInfo !== null}
          favourites={favourites}
          recents={recents}
          getBounds={getMapBounds}
        />

        <CategoryBar selected={category} onSelect={setCategory} />

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
        A ficha do negócio tem prioridade sobre o painel do percurso.

        Os dois desenham-se a partir do último valor que tiveram, e não do atual:
        assim que se fecha, o valor passa a nulo, e sem isto não havia nada para
        animar — o painel desaparecia num instante. Quem trata de o tirar do ecrã
        é o `visible`.
      */}
      {lastPlace ? (
        <Reveal style={styles.bottom} visible={!navigating && !!selectedPlace}>
          <DraggableSheet>
            {(drag) => (
              <PlaceSheet
                dragHandlers={drag}
                place={lastPlace}
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
        >
          <DraggableSheet>
            {(drag) => (
              <RoutePanel
                dragHandlers={drag}
                destination={lastDestination}
                route={route}
                loading={routeLoading}
                error={routeError}
                onClear={handleClearRoute}
                onShowSteps={() => setStepsVisible(true)}
                onStart={handleStartNavigation}
                favourite={isFavourite(lastDestination)}
                onToggleFavourite={() => toggleFavourite(lastDestination)}
                avoidTollsWanted={settings.avoidTolls}
                travelMode={settings.travelMode}
                onChangeTravelMode={(mode) => update('travelMode', mode)}
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

      {/*
        A fita métrica. Fica à esquerda de propósito: o lado direito já tem três
        botões empilhados, e este liga um modo em vez de fazer uma coisa — vale a
        pena estar noutro sítio.
      */}
      {!navigating ? (
        <Pressable
          style={({ pressed }) => [
            styles.measureButton,
            measuring ? styles.measureButtonOn : null,
            // **Sobe com qualquer painel de baixo, e não só com o da fita.**
            // Subia só com o dela, e por isso ficava por baixo do painel de um
            // sítio ou de um percurso — a tapar-lhe o texto, como se vê assim
            // que se escolhe um destino. A condição é a mesma dos três botões
            // do outro lado e da bússola: onde há painel, sobem todos.
            selectedPlace || destination || measuring ? styles.measureRaised : null,
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={() => {
            setMeasuring((atual) => !atual);
            setMeasurePoints([]);
          }}
        >
          <MaterialCommunityIcons
            name="ruler"
            size={22}
            color={measuring ? theme.onAccent : theme.accent}
          />
        </Pressable>
      ) : null}

      {measuring ? (
        <Reveal style={styles.bottom}>
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
        Percorre os tipos de mapa: desenhado, satélite e transportes.

        O ícone é o do **seguinte**, não o do atual — é o que se vai buscar ao
        carregar. E aparece o nome durante uns segundos, porque com três já não
        se adivinha ao que se vai.
      */}
      {!navigating ? (
        <Pressable
          style={({ pressed }) => [
            styles.layersButton,
            selectedPlace || destination || measuring ? styles.layersRaised : null,
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={() => {
            const seguinte = nextMapType(settings.mapType);
            update('mapType', seguinte);
            mostrarTipoDeMapa(seguinte);
          }}
        >
          <MaterialCommunityIcons
            name={
              (MAP_TYPES.find((t) => t.id === nextMapType(settings.mapType))?.icon ??
                'map-outline') as never
            }
            size={22}
            color={theme.accent}
          />
        </Pressable>
      ) : null}

      {/*
        As horas de passagem. Só aparece no mapa dos transportes: fora daí seria
        mais um botão a tapar o mapa a quem anda de carro.
      */}
      {!navigating && settings.mapType === 'transit' ? (
        <Pressable
          style={({ pressed }) => [
            styles.transitButton,
            selectedPlace || destination || measuring ? styles.transitRaised : null,
            pressed ? styles.buttonPressed : null,
          ]}
          onPress={() => setTransitVisible(true)}
        >
          <MaterialCommunityIcons name="clock-outline" size={22} color={theme.accent} />
        </Pressable>
      ) : null}

      {!navigating ? (
        <Reveal
          style={[
            styles.mapTypeLabel,
            selectedPlace || destination || measuring
              ? styles.mapTypeLabelRaised
              : null,
          ]}
          visible={!!mapTypeLabel}
          from={0}
        >
          <Text style={styles.mapTypeLabelText}>{mapTypeLabel}</Text>
        </Reveal>
      ) : null}

      {/*
        Botão de voltar à posição atual.

        Um toque centra, dois toques põem a câmara a andar com a pessoa — ver
        `handleLocatePress`. Enquanto está a seguir fica aceso, como o botão da
        fita métrica, porque é um modo em que se entra e não uma ação que se faz.

        Durante a navegação faz falta na mesma: basta arrastar o mapa uma vez
        para ver o que vem a seguir e a câmara larga o carro. Aí o que se quer é
        voltar a prendê-la, não só centrar uma vez — daí serem dois caminhos.

        **O botão não depende de já se saber onde a pessoa está**, e isso já
        esteve ao contrário: aparecia só depois da primeira posição. Bastava o
        GPS não responder — dentro de casa, ou parado, onde o seguimento lento
        pode nunca chegar a dar uma leitura — para não haver botão nenhum, que é
        exatamente quando ele faz mais falta. Sem posição, carregar nele é o que
        manda o GPS procurar. Só desaparece se a permissão tiver sido recusada,
        porque aí não há nada que ele possa fazer.
      */}
      {!locationDenied ? (
        <Pressable
          style={({ pressed }) => [
            styles.locateButton,
            followUser && !navigating ? styles.locateFollowing : null,
            navigating
              ? styles.locateNavigating
              : selectedPlace || destination || measuring
                ? styles.locateRaised
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
        O velocímetro a andar de carro, **sem estar a navegar**.

        Só aparece acima de `DRIVING_SPEED_MS`: parado ou a pé seria um zero
        permanente a ocupar o canto. Fica por cima da bússola, que por sua vez
        está por cima da régua — as três alturas do canto esquerdo estão todas
        aqui e em `compassBottom`, de propósito.

        Durante a navegação quem o desenha é o `NavigationPanel`, que o põe mais
        abaixo porque aí a régua e a bússola não existem.
      */}
      {!navigating && drivingGps && settings.showSpeed ? (
        <SpeedBadge kmh={speedKmh} bottom={compassBottom + 52} />
      ) : null}

      {navigating ? (
        <NavigationPanel
          step={nextStep}
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
        O aviso da versão nova. Aparece por cima de tudo mal a procura responda,
        e só quando aquela versão ainda não foi mandada embora.
      */}
      <UpdateSplash
        info={updateInfo && updateInfo.build > updateDismissed ? updateInfo : null}
        autoDownload={updateOnWifi}
        onDismiss={() => {
          if (!updateInfo) {
            return;
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
        onClose={() => {
          setSettingsVisible(false);
          // Pode ter-se descarregado ou apagado um país lá dentro.
          setOfflineRegions(installedRegions());
        }}
      />

      {/*
        As horas de passagem. Fica montado só enquanto está aberto: quando fecha,
        o contador de trinta em trinta segundos que atualiza os minutos tem de
        parar, e desmontar é a forma mais segura de garantir isso.
      */}
      {transitVisible ? (
        <Reveal style={styles.bottom}>
          <DraggableSheet>
            {(drag) => (
              <TransitSheet
                dragHandlers={drag}
                stops={transitStops}
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
 * Guarda o último valor que não foi nulo.
 *
 * Serve para um painel poder sair do ecrã a desvanecer: no instante em que se
 * fecha, aquilo que ele mostrava deixa de existir, e sem uma cópia não havia
 * nada para desenhar durante a animação de saída.
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
    top: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      // Sem margem lateral aqui de propósito. A barra de pesquisa quer margem
      // dos dois lados; os botões de categoria querem começar alinhados com ela
      // mas poder sair pela direita, para se perceber que há mais para o lado.
      // Cada um trata da sua.
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
    layersButton: {
      position: 'absolute',
      right: 16,
      // Mesmo tamanho e alinhamento do botão de recentrar, mas por cima dele.
      bottom: insets.bottom + 90,
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
    measureButton: {
      position: 'absolute',
      left: 16,
      bottom: insets.bottom + 28,
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
    /**
     * A régua, levantada para cima do painel da fita métrica.
     *
     * Mesma altura a que sobem os botões do outro lado quando há um painel
     * aberto: os quatro têm de ficar alinhados, senão vê-se o degrau.
     */
    measureRaised: {
      bottom: insets.bottom + 260,
    },
    measureButtonOn: {
      backgroundColor: theme.accent,
    },
    transitButton: {
      position: 'absolute',
      right: 16,
      // Por cima do botão dos tipos de mapa, que já está por cima do de centrar.
      bottom: insets.bottom + 152,
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
    mapTypeLabel: {
      position: 'absolute',
      right: 76,
      // À altura do botão dos tipos de mapa, para se ler ao lado do ícone.
      bottom: insets.bottom + 104,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: theme.overlay,
    },
    mapTypeLabelText: {
      color: theme.onOverlay,
      fontSize: 13,
      fontWeight: '600',
    },
    layersRaised: {
      bottom: insets.bottom + 322,
    },
    /**
     * O nome do tipo de mapa acompanha o botão, e não o chão do botão.
     *
     * São os 322 do `layersRaised` mais os mesmos 14 que o separam dele quando
     * não há painel nenhum aberto. Com o `layersRaised` à letra, o texto subia
     * catorze pontos a menos e ficava desalinhado do ícone que explica.
     */
    mapTypeLabelRaised: {
      bottom: insets.bottom + 336,
    },
    transitRaised: {
      // Mesmo afastamento entre os dois botões de quando não há painel aberto.
      bottom: insets.bottom + 384,
    },
    locateButton: {
      position: 'absolute',
      right: 16,
      bottom: insets.bottom + 28,
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
    // Com um painel aberto em baixo, o botão sobe para não ficar tapado.
    /**
     * Resposta ao toque nos botões redondos.
     *
     * Feita à mão de propósito. A onda do Android (`android_ripple`) passa a ser
     * o fundo do botão e apaga o `backgroundColor` — foi assim que os círculos
     * brancos destes dois desapareceram e os ícones ficaram soltos no mapa.
     */
    buttonPressed: {
      transform: [{ scale: 0.92 }],
      opacity: 0.9,
    },
    locateRaised: {
      bottom: insets.bottom + 260,
    },
    /** Acima do painel de navegação, que é mais baixo do que os outros. */
    locateNavigating: {
      bottom: insets.bottom + 130,
    },
    /** Aceso enquanto a câmara anda com a pessoa, como o botão da fita métrica. */
    locateFollowing: {
      backgroundColor: theme.accent,
    },
  });
}
