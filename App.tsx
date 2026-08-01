import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { MapView } from './src/components/MapView';
import { RoutePanel } from './src/components/RoutePanel';
import { SearchBar } from './src/components/SearchBar';
import { getCurrentPosition } from './src/services/location';
import { RouteError, getRoute } from './src/services/osrm';
import { configureTileRequests } from './src/services/tiles';
import type { Coordinates, Place, Route } from './src/types/geo';

// Identifica-nos junto do OpenStreetMap logo no arranque, antes de qualquer tile.
configureTileRequests();

export default function App() {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [destination, setDestination] = useState<Place | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

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

  const handleClear = useCallback(() => {
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
      />

      <SafeAreaView style={styles.top} pointerEvents="box-none">
        <SearchBar onSelect={setDestination} />
        {locationDenied ? (
          <Text style={styles.notice}>
            Sem acesso ao GPS. Ainda pode ver o mapa e pesquisar moradas.
          </Text>
        ) : null}
      </SafeAreaView>

      {destination ? (
        <View style={styles.bottom}>
          <RoutePanel
            destination={destination}
            route={route}
            loading={routeLoading}
            error={routeError}
            onClear={handleClear}
          />
        </View>
      ) : null}

      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e5e7eb',
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  notice: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.75)',
    color: '#ffffff',
    fontSize: 13,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
