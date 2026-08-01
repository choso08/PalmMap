import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  UserLocation,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { type NativeSyntheticEvent, StyleSheet, View } from 'react-native';

import { mapStyleFor } from '../services/tiles';
import { useTheme } from '../settings';
import type { Bounds, Coordinates, Place, Route } from '../types/geo';

interface MapViewProps {
  userLocation: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  /** Negócios a marcar no mapa. */
  places: Place[];
  /** Chamado quando o mapa para de se mexer, com a área visível e o zoom. */
  onViewportChange: (bounds: Bounds, zoom: number) => void;
  /** Chamado ao tocar num pino de negócio. */
  onPlacePress: (placeId: number) => void;
  ref?: Ref<MapViewRef>;
}

export interface MapViewRef {
  /** Leva a câmara de volta à posição atual. */
  recenter: (coordinates: Coordinates) => void;
}

/** Ponto de partida da câmara quando ainda não se sabe onde a pessoa está. */
const DEFAULT_CENTER: [number, number] = [-9.1393, 38.7223]; // Lisboa
const DEFAULT_ZOOM = 11;

/**
 * Desenha o mapa com os tiles do OpenStreetMap, a posição atual, os negócios,
 * o destino e a linha do percurso.
 */
export function MapView({
  userLocation,
  destination,
  route,
  places,
  onViewportChange,
  onPlacePress,
  ref,
}: MapViewProps) {
  const cameraRef = useRef<CameraRef>(null);
  const theme = useTheme();

  useImperativeHandle(ref, () => ({
    recenter: (coordinates: Coordinates) => {
      cameraRef.current?.flyTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 16,
        duration: 700,
      });
    },
  }));

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
        padding: { top: 160, right: 40, bottom: 260, left: 40 },
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
      zoom: 16,
      duration: 600,
    });
  }, [destination, route]);

  const handleRegionDidChange = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { bounds, zoom } = event.nativeEvent;
      const [west, south, east, north] = bounds;
      onViewportChange({ south, west, north, east }, zoom);
    },
    [onViewportChange],
  );

  return (
    <Map
      style={styles.map}
      mapStyle={mapStyleFor(theme.dark)}
      attribution
      logo={false}
      onRegionDidChange={handleRegionDidChange}
    >
      <Camera
        ref={cameraRef}
        initialViewState={{
          center: userLocation
            ? [userLocation.longitude, userLocation.latitude]
            : DEFAULT_CENTER,
          zoom: userLocation ? 15 : DEFAULT_ZOOM,
        }}
      />

      {/* Só se mostra o ponto azul se houver mesmo permissão de localização. */}
      {userLocation ? <UserLocation /> : null}

      {/*
        Os negócios vão todos numa única camada, em vez de um componente por
        pino. Com dezenas de pinos, a diferença de fluidez é grande.
      */}
      {places.length > 0 ? (
        <GeoJSONSource
          id="places"
          data={{
            type: 'FeatureCollection',
            features: places.map((place) => ({
              type: 'Feature',
              id: place.id,
              properties: { placeId: place.id, name: place.name },
              geometry: {
                type: 'Point',
                coordinates: [place.coordinates.longitude, place.coordinates.latitude],
              },
            })),
          }}
          onPress={(event) => {
            const feature = event.nativeEvent.features[0];
            const placeId = feature?.properties?.placeId;
            if (typeof placeId === 'number') {
              onPlacePress(placeId);
            }
          }}
        >
          {/*
            Só um círculo, sem texto. Escrever o nome no mapa exigiria um
            servidor de tipos de letra (glyphs) que este estilo não tem, e os
            nomes já vêm desenhados nos tiles do OpenStreetMap. O nome completo
            aparece ao tocar no pino.
          */}
          <Layer
            id="places-circle"
            type="circle"
            paint={{
              'circle-radius': 7,
              'circle-color': theme.poi,
              'circle-stroke-width': 2,
              'circle-stroke-color': theme.poiOutline,
            }}
          />
        </GeoJSONSource>
      ) : null}

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
            paint={{ 'line-color': theme.accent, 'line-width': 5, 'line-opacity': 0.85 }}
          />
        </GeoJSONSource>
      ) : null}

      {destination ? (
        <Marker id="destination" lngLat={[destination.longitude, destination.latitude]}>
          <View
            style={[
              styles.marker,
              { backgroundColor: theme.destination, borderColor: theme.poiOutline },
            ]}
          />
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
    borderWidth: 3,
  },
});
