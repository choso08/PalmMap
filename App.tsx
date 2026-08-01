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
import { PlaceSheet } from './src/components/PlaceSheet';
import { RoutePanel } from './src/components/RoutePanel';
import { SearchBar } from './src/components/SearchBar';
import { SettingsSheet } from './src/components/SettingsSheet';
import { StepsList } from './src/components/StepsList';
import {
  MAP_PINS_DEBOUNCE_MS,
  MAP_PINS_MIN_ZOOM,
} from './src/services/config';
import { getCurrentPosition } from './src/services/location';
import { reverseGeocode } from './src/services/nominatim';
import { RouteError, getRoute } from './src/services/osrm';
import { searchInBounds, searchNearby } from './src/services/overpass';
import { configureTileRequests } from './src/services/tiles';
import { SettingsProvider, useSettings, useTheme } from './src/settings';
import type { Theme } from './src/theme';
import type { Bounds, Coordinates, Place, Route } from './src/types/geo';
import type { SearchCategory } from './src/utils/categories';

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
  const { settings } = useSettings();

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
  const [placesError, setPlacesError] = useState<string | null>(null);

  /** Área visível do mapa, atualizada quando o mapa para de se mexer. */
  const viewport = useRef<{ bounds: Bounds; zoom: number } | null>(null);
  const pinsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Identifica o pedido mais recente, para ignorar respostas atrasadas. */
  const latestPlaces = useRef(0);

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
  }, [destination, userLocation, settings.travelMode]);

  /** Procura os negócios da categoria escolhida, à volta de onde a pessoa está. */
  useEffect(() => {
    if (!category) {
      return;
    }

    const center = userLocation ?? null;
    if (!center) {
      setPlacesError('Sem a sua localização não é possível procurar aqui à volta.');
      return;
    }

    const requestId = ++latestPlaces.current;
    setPlacesError(null);

    void (async () => {
      try {
        const found = await searchNearby(category, center);
        if (requestId === latestPlaces.current) {
          setPlaces(found);
          if (found.length === 0) {
            setPlacesError('Não foi encontrado nada desta categoria por perto.');
          }
        }
      } catch (error) {
        if (requestId === latestPlaces.current) {
          setPlaces([]);
          setPlacesError(error instanceof Error ? error.message : 'Não foi possível procurar.');
        }
      }
    })();
  }, [category, userLocation]);

  /**
   * Vai buscar os negócios que estão à vista, quando o mapa para de se mexer.
   *
   * Só corre com o mapa suficientemente aproximado e depois de uma pausa — a
   * Overpass é mantida por voluntários e um pedido por cada arrastar do dedo
   * seria abusivo.
   */
  const handleViewportChange = useCallback(
    (bounds: Bounds, zoom: number) => {
      viewport.current = { bounds, zoom };

      // Com uma categoria ativa, os pinos são os dela — não se mexe.
      if (category) {
        return;
      }

      if (!settings.showPlacesOnMap) {
        setPlaces([]);
        return;
      }

      if (pinsTimer.current) {
        clearTimeout(pinsTimer.current);
      }

      if (zoom < MAP_PINS_MIN_ZOOM) {
        setPlaces([]);
        return;
      }

      pinsTimer.current = setTimeout(() => {
        const requestId = ++latestPlaces.current;

        void (async () => {
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
        })();
      }, MAP_PINS_DEBOUNCE_MS);
    },
    [category, settings.showPlacesOnMap],
  );

  useEffect(() => {
    return () => {
      if (pinsTimer.current) {
        clearTimeout(pinsTimer.current);
      }
    };
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
      />

      <View style={styles.top} pointerEvents="box-none">
        <SearchBar
          onSelect={handleSearchSelect}
          onOpenSettings={() => setSettingsVisible(true)}
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

      {/* A ficha do negócio tem prioridade sobre o painel do percurso. */}
      {selectedPlace ? (
        <View style={styles.bottom}>
          <PlaceSheet
            place={selectedPlace}
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
          />
        </View>
      ) : null}

      {/* Botão de voltar à posição atual, como no Maps. */}
      {userLocation ? (
        <Pressable
          style={[styles.locateButton, selectedPlace || destination ? styles.locateRaised : null]}
          onPress={() => mapRef.current?.recenter(userLocation)}
        >
          <MaterialCommunityIcons name="crosshairs-gps" size={24} color={theme.accent} />
        </Pressable>
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
