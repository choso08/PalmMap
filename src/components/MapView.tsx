import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { OSM_STYLE } from '../services/tiles';
import type { Coordinates, Route } from '../types/geo';

interface MapViewProps {
  userLocation: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
}

/** Ponto de partida da câmara quando ainda não se sabe onde a pessoa está. */
const DEFAULT_CENTER: [number, number] = [-9.1393, 38.7223]; // Lisboa
const DEFAULT_ZOOM = 11;

/**
 * Desenha o mapa com os tiles do OpenStreetMap, a posição atual, o destino
 * e a linha do percurso.
 */
export function MapView({ userLocation, destination, route }: MapViewProps) {
  const cameraRef = useRef<CameraRef>(null);

  // Sempre que há um percurso novo, enquadra-o todo no ecrã.
  useEffect(() => {
    if (!route || route.coordinates.length === 0) {
      return;
    }

    const longitudes = route.coordinates.map((point) => point.longitude);
    const latitudes = route.coordinates.map((point) => point.latitude);

    cameraRef.current?.fitBounds(
      // Ordem exigida pelo MapLibre: oeste, sul, este, norte.
      [
        Math.min(...longitudes),
        Math.min(...latitudes),
        Math.max(...longitudes),
        Math.max(...latitudes),
      ],
      {
        // Margem em pixels, para a linha não ficar colada às extremidades nem
        // escondida por baixo da barra de pesquisa e do painel do percurso.
        padding: { top: 120, right: 40, bottom: 240, left: 40 },
        duration: 600,
      },
    );
  }, [route]);

  // Sem percurso, mas com destino: centra no destino.
  useEffect(() => {
    if (route || !destination) {
      return;
    }

    cameraRef.current?.flyTo({
      center: [destination.longitude, destination.latitude],
      zoom: 14,
      duration: 600,
    });
  }, [destination, route]);

  return (
    // A atribuição ao OpenStreetMap fica visível — é exigida pela licença dos dados.
    <Map style={styles.map} mapStyle={OSM_STYLE} attribution logo={false}>
      <Camera
        ref={cameraRef}
        initialViewState={{
          center: userLocation
            ? [userLocation.longitude, userLocation.latitude]
            : DEFAULT_CENTER,
          zoom: userLocation ? 14 : DEFAULT_ZOOM,
        }}
      />

      {/* Só se mostra o ponto azul se houver mesmo permissão de localização. */}
      {userLocation ? <UserLocation /> : null}

      {route && route.coordinates.length > 0 ? (
        <GeoJSONSource
          id="route"
          data={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              // O GeoJSON quer [longitude, latitude], por esta ordem.
              coordinates: route.coordinates.map((point) => [
                point.longitude,
                point.latitude,
              ]),
            },
          }}
        >
          <Layer
            id="route-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#1d4ed8', 'line-width': 5, 'line-opacity': 0.85 }}
          />
        </GeoJSONSource>
      ) : null}

      {destination ? (
        <Marker id="destination" lngLat={[destination.longitude, destination.latitude]}>
          <View style={styles.marker} />
        </Marker>
      ) : null}
    </Map>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  marker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#dc2626',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
});
