import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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
import { StepsList } from './src/components/StepsList';
import {
  ANNOUNCE_AT_METERS,
  ARRIVAL_METERS,
  CATEGORY_MIN_ZOOM,
  MAP_PINS_DEBOUNCE_MS,
  MAP_PINS_MIN_ZOOM,
  OFF_ROUTE_METERS,
  OFF_ROUTE_STRIKES,
} from './src/services/config';
import { isSamePlace, loadFavourites, saveFavourites } from './src/services/favourites';
import { getCurrentPosition, watchPosition } from './src/services/location';
import { reverseGeocode } from './src/services/nominatim';
import { RouteError, getRoute } from './src/services/osrm';
import { searchCategoryInBounds, searchInBounds } from './src/services/overpass';
import { configureTileRequests, setMapCacheSize } from './src/services/tiles';
import { SettingsProvider, cacheMegabytesFor, useSettings, useTheme } from './src/settings';
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

  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

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

  /** Navegação a decorrer: segue a posição e anuncia as manobras. */
  const [navigating, setNavigating] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [nextStep, setNextStep] = useState<RouteStep | null>(null);
  const [distanceToStep, setDistanceToStep] = useState(0);
  const [remaining, setRemaining] = useState({ meters: 0, seconds: 0 });
  /** Quantas leituras seguidas fora do percurso já se viram. */
  const offRouteStrikes = useRef(0);
  /** Manobras já anunciadas, para não repetir a mesma vezes sem conta. */
  const announced = useRef(new Set<string>());
  const [placesError, setPlacesError] = useState<string | null>(null);

  /** Área visível do mapa, atualizada quando o mapa para de se mexer. */
  const viewport = useRef<{ bounds: Bounds; zoom: number } | null>(null);
  const pinsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Identifica o pedido mais recente, para ignorar respostas atrasadas. */
  const latestPlaces = useRef(0);

  // O tamanho do mapa guardado, sempre que a definição muda.
  useEffect(() => {
    setMapCacheSize(cacheMegabytesFor(settings.cacheSize));
  }, [settings.cacheSize]);

  // Sítios guardados, lidos uma vez ao arrancar.
  useEffect(() => {
    void loadFavourites().then(setFavourites);
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
      setUserLocation(position);
      setLocationDenied(position === null);
    })();
  }, []);

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

    if (!userLocation) {
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
          userLocation,
          destination.coordinates,
          settings.travelMode,
        );
        if (!cancelled) {
          setRoute(result);
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
  }, [destination, userLocation, settings.travelMode, navigating]);

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

  /** Segue a posição enquanto a navegação decorre. */
  useEffect(() => {
    if (!navigating || !route || !destination) {
      return;
    }

    let stopWatching: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const stop = await watchPosition((position) => {
        setUserLocation(position);

        const { index, offRouteMeters } = locateOnRoute(route.coordinates, position);
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
        if (offRouteMeters > OFF_ROUTE_METERS) {
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
              );
              setRoute(fresh);
              announced.current.clear();
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

        setNextStep(step ?? null);
        setDistanceToStep(toStep);
        setRemaining({
          meters: remainingMeters,
          seconds:
            route.distanceMeters > 0
              ? route.durationSeconds * (remainingMeters / route.distanceMeters)
              : 0,
        });

        // Anúncios em voz, uma vez por manobra e por distância.
        if (settings.voiceGuidance && step) {
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
      });

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
  }, [navigating, route, destination, stepIndices, settings.voiceGuidance, settings.travelMode]);

  const handleStartNavigation = useCallback(() => {
    announced.current.clear();
    offRouteStrikes.current = 0;
    setSelectedPlace(null);
    setStepsVisible(false);
    setNavigating(true);
  }, []);

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
        following={navigating}
      />

      {!navigating ? (
      <View style={styles.top} pointerEvents="box-none">
        <SearchBar
          onSelect={handleSearchSelect}
          onOpenSettings={() => setSettingsVisible(true)}
          favourites={favourites}
        />

        <CategoryBar selected={category} onSelect={setCategory} />

        {locationDenied ? (
          <Text style={styles.notice}>
            Sem acesso ao GPS. Ainda pode ver o mapa e pesquisar moradas.
          </Text>
        ) : null}

        {placesError ? <Text style={styles.notice}>{placesError}</Text> : null}

        {!destination && !selectedPlace && !locationDenied && !placesError ? (
          <Text style={styles.hint}>
            Toque sem largar no mapa para marcar um ponto e ir até lá.
          </Text>
        ) : null}
      </View>
      ) : null}

      {/* A ficha do negócio tem prioridade sobre o painel do percurso. */}
      {navigating ? null : selectedPlace ? (
        <View style={styles.bottom}>
          <PlaceSheet
            place={selectedPlace}
            favourite={isFavourite(selectedPlace)}
            onToggleFavourite={() => toggleFavourite(selectedPlace)}
            onRoute={handleRouteToSelected}
            onClose={() => {
              setSelectedPlace(null);
              setDroppedPin(null);
            }}
          />
        </View>
      ) : destination ? (
        <View style={styles.bottom}>
          <RoutePanel
            destination={destination}
            route={route}
            loading={routeLoading}
            error={routeError}
            onClear={handleClearRoute}
            onShowSteps={() => setStepsVisible(true)}
            onStart={handleStartNavigation}
            favourite={isFavourite(destination)}
            onToggleFavourite={() => toggleFavourite(destination)}
          />
        </View>
      ) : null}

      {/* Trocar entre mapa desenhado e imagem de satélite. */}
      {!navigating ? (
        <Pressable
          style={[styles.layersButton, selectedPlace || destination ? styles.layersRaised : null]}
          onPress={() => update('mapType', settings.mapType === 'map' ? 'satellite' : 'map')}
        >
          <MaterialCommunityIcons
            name={settings.mapType === 'satellite' ? 'map-outline' : 'satellite-variant'}
            size={22}
            color={theme.accent}
          />
        </Pressable>
      ) : null}

      {/* Botão de voltar à posição atual, como no Maps. */}
      {userLocation && !navigating ? (
        <Pressable
          style={[styles.locateButton, selectedPlace || destination ? styles.locateRaised : null]}
          onPress={() => mapRef.current?.recenter(userLocation)}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={24} color={theme.accent} />
        </Pressable>
      ) : null}

      {navigating ? (
        <NavigationPanel
          step={nextStep}
          distanceToStep={distanceToStep}
          remainingMeters={remaining.meters}
          remainingSeconds={remaining.seconds}
          recalculating={recalculating}
          onStop={handleStopNavigation}
        />
      ) : null}

      <SettingsSheet visible={settingsVisible} onClose={() => setSettingsVisible(false)} />

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
      paddingLeft: 14,
      // Abaixo da barra de estado e da câmara, mais uma folga para respirar.
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
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
    layersRaised: {
      bottom: insets.bottom + 322,
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
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
    // Com um painel aberto em baixo, o botão sobe para não ficar tapado.
    locateRaised: {
      bottom: insets.bottom + 260,
    },
  });
}
