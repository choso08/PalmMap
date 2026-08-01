import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { CategoryBar } from './src/components/CategoryBar';
import { MapView } from './src/components/MapView';
import { PlaceSheet } from './src/components/PlaceSheet';
import { RoutePanel } from './src/components/RoutePanel';
import { SearchBar } from './src/components/SearchBar';
import { StepsList } from './src/components/StepsList';
import {
  MAP_PINS_DEBOUNCE_MS,
  MAP_PINS_MIN_ZOOM,
} from './src/services/config';
import { getCurrentPosition } from './src/services/location';
import { RouteError, getRoute } from './src/services/osrm';
import { searchInBounds, searchNearby } from './src/services/overpass';
import { configureTileRequests } from './src/services/tiles';
import { type Theme, useTheme } from './src/theme';
import type { Bounds, Coordinates, Place, Route } from './src/types/geo';
import type { SearchCategory } from './src/utils/categories';

// Identifica-nos junto do OpenStreetMap logo no arranque, antes de qualquer tile.
configureTileRequests();

export default function App() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

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
        const result = await getRoute(userLocation, destination.coordinates);
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
  }, [destination, userLocation]);

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
    [category],
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

  const handleSearchSelect = useCallback((place: Place) => {
    setCategory(null);
    setSelectedPlace(null);
    setDestination(place);
  }, []);

  const handleRouteToSelected = useCallback(() => {
    if (selectedPlace) {
      setDestination(selectedPlace);
      setSelectedPlace(null);
    }
  }, [selectedPlace]);

  const handleClearRoute = useCallback(() => {
    setDestination(null);
    setRoute(null);
    setRouteError(null);
  }, []);

  return (
    <View style={styles.container}>
      <MapView
        userLocation={userLocation}
        destination={destination?.coordinates ?? null}
        route={route}
        places={places}
        onViewportChange={handleViewportChange}
        onPlacePress={handlePlacePress}
      />

      <SafeAreaView style={styles.top} pointerEvents="box-none">
        <SearchBar onSelect={handleSearchSelect} />

        <CategoryBar selected={category} onSelect={setCategory} />

        {locationDenied ? (
          <Text style={styles.notice}>
            Sem acesso ao GPS. Ainda pode ver o mapa e pesquisar moradas.
          </Text>
        ) : null}

        {placesError ? <Text style={styles.notice}>{placesError}</Text> : null}
      </SafeAreaView>

      {/* A ficha do negócio tem prioridade sobre o painel do percurso. */}
      {selectedPlace ? (
        <View style={styles.bottom}>
          <PlaceSheet
            place={selectedPlace}
            onRoute={handleRouteToSelected}
            onClose={() => setSelectedPlace(null)}
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

function makeStyles(theme: Theme) {
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
      paddingTop: 14,
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
  });
}
