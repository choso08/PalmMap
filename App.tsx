import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';

import { CategoryBar } from './src/components/CategoryBar';
import { MapView, type MapViewRef } from './src/components/MapView';
import { NavigationPanel } from './src/components/NavigationPanel';
import { PlaceSheet } from './src/components/PlaceSheet';
import { RoutePanel } from './src/components/RoutePanel';
import { SearchBar } from './src/components/SearchBar';
import { SettingsSheet } from './src/components/SettingsSheet';
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
  KEEP_AWAKE_TAG,
  MAP_PINS_DEBOUNCE_MS,
  MAP_PINS_MIN_ZOOM,
  OFF_ROUTE_METERS,
  OFF_ROUTE_STRIKES,
} from './src/services/config';
import {
  cameraIcon,
  cameraLabel,
  camerasAlongRoute,
  type SpeedCamera,
} from './src/services/cameras';
import { isSamePlace, loadFavourites, saveFavourites } from './src/services/favourites';
import { loadRecents, rememberRecent } from './src/services/recents';
import { getCurrentPosition, watchPosition, watchPositionIdle } from './src/services/location';
import {
  installBundledAssets,
  installedRegions,
  type OfflineRegion,
} from './src/services/offlineMap';
import { reverseGeocode } from './src/services/nominatim';
import { RouteError, getRoute } from './src/services/osrm';
import { searchCategoryInBounds, searchInBounds } from './src/services/overpass';
import { configureTileRequests, setMapCacheSize } from './src/services/tiles';
import type { TransitStop } from './src/services/transit';
import {
  MAP_TYPES,
  SettingsProvider,
  cacheMegabytesFor,
  nextMapType,
  useSettings,
  useTheme,
  type MapType,
} from './src/settings';
import type { Theme } from './src/theme';
import type { Bounds, Coordinates, Place, Route, RouteStep } from './src/types/geo';
import type { SearchCategory } from './src/utils/categories';
import { formatDistance } from './src/utils/format';
import { distanceAlong, locateOnRoute, nearestIndex } from './src/utils/geometry';
import { speak, stopSpeaking } from './src/utils/voice';

// Identifica-nos junto do OpenStreetMap logo no arranque, antes de qualquer tile.
configureTileRequests();

/** As definições têm de envolver tudo, porque o tema sai delas. */
export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <PalmMap />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

function PalmMap() {
  const theme = useTheme();
  // As margens do sistema: barra de estado, câmara ao centro e barra de
  // navegação. No Android é preciso pedi-las — o mapa desenha por baixo delas.
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const { settings, update } = useSettings();

  const mapRef = useRef<MapViewRef>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
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
  /** As paragens que o painel encontrou, para o mapa as marcar. */
  const [transitStops, setTransitStops] = useState<TransitStop[]>([]);
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
  const [route, setRoute] = useState<Route | null>(null);
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

  /** Navegação a decorrer: segue a posição e anuncia as manobras. */
  const [navigating, setNavigating] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [nextStep, setNextStep] = useState<RouteStep | null>(null);
  const [distanceToStep, setDistanceToStep] = useState(0);
  const [remaining, setRemaining] = useState({ meters: 0, seconds: 0 });
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
    setMapTypeLabel(MAP_TYPES.find((t) => t.id === tipo)?.label ?? null);
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

  // Posição atual, pedida uma vez ao arrancar.
  useEffect(() => {
    void (async () => {
      const position = await getCurrentPosition();
      userLocationRef.current = position;
      setUserLocation(position);
      setHasLocation(position !== null);
      setLocationDenied(position === null);
    })();
  }, []);

  // Fora da navegação, continua a seguir a posição devagar, para o ponto azul
  // acompanhar quem anda em vez de ficar preso onde estava ao abrir. Durante a
  // navegação desliga-se, porque aí quem segue o GPS é o motor de navegação e
  // ter os dois ligados era gastar bateria a dobrar.
  useEffect(() => {
    if (navigating) {
      return;
    }

    let stop: (() => void) | null = null;
    let cancelled = false;

    void watchPositionIdle((position) => {
      userLocationRef.current = position;
      setUserLocation(position);
      setHasLocation(true);
      setLocationDenied(false);
    }).then((fn) => {
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
  }, [navigating]);

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
      setRouteError('Sem a sua localização não é possível calcular o percurso.');
      return;
    }

    let cancelled = false;
    setRouteLoading(true);
    setRouteError(null);

    void (async () => {
      try {
        const result = await getRoute(
          origem,
          destination.coordinates,
          settings.travelMode,
          settings.avoidTolls,
        );
        if (!cancelled) {
          setRoute(result);
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
              : 'Não foi possível calcular o percurso.',
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
  }, [destination, hasLocation, settings.travelMode, settings.avoidTolls, navigating]);

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
          setPlacesError('Aproxime o mapa para procurar nesta zona.');
          return;
        }

        setPlacesError(null);
        try {
          const found = await searchCategoryInBounds(chosen, bounds);
          if (requestId === latestPlaces.current) {
            setPlaces(found);
            setPlacesError(
              found.length === 0 ? `Não há ${chosen.label.toLowerCase()} nesta zona.` : null,
            );
          }
        } catch (error) {
          if (requestId === latestPlaces.current) {
            setPlaces([]);
            setPlacesError(
              error instanceof Error ? error.message : 'Não foi possível procurar.',
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
      } catch {
        // Falhar a ir buscar os pinos não é motivo para incomodar a pessoa:
        // o mapa continua a servir. Deixa-se ficar o que já estava.
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

      if (pinsTimer.current) {
        clearTimeout(pinsTimer.current);
      }

      pinsTimer.current = setTimeout(() => {
        void searchPlacesIn(bounds, zoom, category);
      }, MAP_PINS_DEBOUNCE_MS);
    },
    [category, searchPlacesIn],
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

    if (!route || !settings.speedCameraAlerts) {
      setCameras([]);
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
      const stop = await watchPosition((position, accuracyMeters) => {
        setUserLocation(position);

        const { index, offRouteMeters } = locateOnRoute(route.coordinates, position);
        setProgressIndex(index);
        const remainingMeters = distanceAlong(
          route.coordinates,
          index,
          route.coordinates.length - 1,
        );

        // Chegada.
        if (remainingMeters < ARRIVAL_METERS) {
          if (settings.voiceGuidance) {
            speak('Chegou ao destino.');
          }
          setNavigating(false);
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
            speak('A recalcular o percurso.');
          }

          void (async () => {
            try {
              const fresh = await getRoute(
                position,
                destination.coordinates,
                settings.travelMode,
                settings.avoidTolls,
              );
              setRoute(fresh);
              announced.current.clear();
              // Percurso novo, contagem nova: sem isto, a linha aparecia
              // apagada até onde ia o percurso antigo.
              setProgressIndex(0);
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
                const limite = seguinte.maxspeed
                  ? `, limite ${seguinte.maxspeed}`
                  : '';
                speak(
                  `Atenção: ${cameraLabel(seguinte)} a ${formatDistance(ate)}${limite}.`,
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
                  ? `Daqui a ${formatDistance(threshold)}, ${instruction}.`
                  : `${step.instruction}.`,
              );
              break;
            }
          }
        }
      }, settings.batterySaver && slowGps ? BATTERY_SAVER_INTERVAL_MS : 1000);

      if (cancelled) {
        stop();
      } else {
        stopWatching = stop;
      }
    })();

    return () => {
      cancelled = true;
      stopWatching?.();
      stopSpeaking();
    };
  }, [
    navigating,
    route,
    destination,
    stepIndices,
    cameras,
    slowGps,
    settings.voiceGuidance,
    settings.travelMode,
    settings.avoidTolls,
    settings.speedCameraAlerts,
    settings.batterySaver,
  ]);

  /**
   * A área visível, para a pesquisa preferir o que está por perto.
   *
   * Estável de propósito: lê de uma `ref`, por isso nunca muda de identidade. Se
   * fosse criada em cada desenho, a `SearchBar` repetia a pesquisa sem parar.
   */
  const getMapBounds = useCallback(() => viewport.current?.bounds ?? null, []);

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
      name: 'Ponto no mapa',
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
    setDestination(place);
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
    setTransitStops([]);
    setSelectedStopId(null);
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
      setDestination(selectedPlace);
      setSelectedPlace(null);
      // O destino passa a ter marcador próprio, por isso o pino sai.
      setDroppedPin(null);
    }
  }, [selectedPlace]);

  const handleClearRoute = useCallback(() => {
    setDestination(null);
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
        progressIndex={progressIndex}
        cameras={cameras}
        measurePoints={measuring ? measurePoints : []}
        measureClosed={measureMode === 'area'}
        transitStops={transitVisible ? transitStops : []}
        selectedStopId={selectedStopId}
        onStopPress={setSelectedStopId}
        offlineRegions={offlineRegions}
        labelsReady={labelsReady}
      />

      {!navigating ? (
      <View style={styles.top} pointerEvents="box-none">
        <SearchBar
          onSelect={handleSearchSelect}
          onOpenSettings={() => setSettingsVisible(true)}
          favourites={favourites}
          recents={recents}
          getBounds={getMapBounds}
        />

        <CategoryBar selected={category} onSelect={setCategory} />

        {locationDenied ? (
          <Text style={styles.notice}>
            Sem acesso ao GPS. Ainda pode ver o mapa e pesquisar moradas.
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
            Toque sem largar no mapa para marcar um ponto e ir até lá.
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
          <PlaceSheet
            place={lastPlace}
            favourite={isFavourite(lastPlace)}
            onToggleFavourite={() => toggleFavourite(lastPlace)}
            onRoute={handleRouteToSelected}
            onClose={() => {
              setSelectedPlace(null);
              setDroppedPin(null);
            }}
          />
        </Reveal>
      ) : null}

      {lastDestination ? (
        <Reveal
          style={styles.bottom}
          visible={!navigating && !selectedPlace && !!destination}
        >
          <RoutePanel
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
          />
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
          <MeasureSheet
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
            selectedPlace || destination ? styles.layersRaised : null,
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
            selectedPlace || destination ? styles.transitRaised : null,
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
            selectedPlace || destination ? styles.layersRaised : null,
          ]}
          visible={!!mapTypeLabel}
          from={0}
        >
          <Text style={styles.mapTypeLabelText}>{mapTypeLabel}</Text>
        </Reveal>
      ) : null}

      {/*
        Botão de voltar à posição atual.

        Durante a navegação faz falta na mesma: basta arrastar o mapa uma vez
        para ver o que vem a seguir e a câmara larga o carro. Aí o que se quer é
        voltar a prendê-la, não só centrar uma vez — daí serem dois caminhos.
      */}
      {userLocation ? (
        <Pressable
          style={({ pressed }) => [
            styles.locateButton,
            navigating
              ? styles.locateNavigating
              : selectedPlace || destination
                ? styles.locateRaised
                : null,
            pressed && styles.buttonPressed,
          ]}
          onPress={() =>
            navigating
              ? mapRef.current?.followAgain()
              : mapRef.current?.recenter(userLocation)
          }
        >
          <MaterialCommunityIcons
            name="crosshairs-gps"
            size={24}
            color={theme.accent}
          />
        </Pressable>
      ) : null}

      {navigating ? (
        <NavigationPanel
          step={nextStep}
          distanceToStep={distanceToStep}
          remainingMeters={remaining.meters}
          remainingSeconds={remaining.seconds}
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
          onStop={handleStopNavigation}
        />
      ) : null}

      <SettingsSheet
        visible={settingsVisible}
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
          <TransitSheet
            origin={userLocation}
            onClose={() => {
              setTransitVisible(false);
              setTransitStops([]);
              setSelectedStopId(null);
            }}
            onGoToStop={handleGoToStop}
            onStopsChange={setTransitStops}
            onSelectedStopChange={setSelectedStopId}
            selectedStopId={selectedStopId}
          />
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
  });
}
