import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type PressEvent,
  UserLocation,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import { type NativeSyntheticEvent, StyleSheet, View } from 'react-native';

import { regionAt, type OfflineRegion } from '../services/offlineMap';
import { mapStyleFor } from '../services/tiles';
import { useSettings, useTheme } from '../settings';
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
  /** Pino largado com um toque longo, à espera de virar destino. */
  droppedPin: Coordinates | null;
  /** Chamado num toque longo em qualquer ponto do mapa. */
  onDropPin: (coordinates: Coordinates) => void;
  /** Chamado num toque simples no mapa, fora de qualquer pino. */
  onTapEmpty: () => void;
  /** Durante a navegação o mapa segue a posição e roda no sentido da marcha. */
  following?: boolean;
  /** Mapas de países guardados no telemóvel, para usar sem rede. */
  offlineRegions: OfflineRegion[];
  /**
   * Se os tipos de letra já estão instalados.
   *
   * Sem eles, uma camada de texto não desenha nada e não dá erro — foi assim que
   * uma tentativa anterior de escrever os nomes falhou sem se perceber porquê.
   */
  labelsReady: boolean;
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
  droppedPin,
  onDropPin,
  onTapEmpty,
  following,
  offlineRegions,
  labelsReady,
  ref,
}: MapViewProps) {
  const cameraRef = useRef<CameraRef>(null);
  const theme = useTheme();
  const { settings } = useSettings();

  /** O mapa guardado que cobre a zona que se está a ver, se houver algum. */
  const [offlineRegion, setOfflineRegion] = useState<OfflineRegion | null>(null);
  /** Liga-se quando um mapa guardado não abre, para não se insistir nele. */
  const [offlineFailed, setOfflineFailed] = useState(false);

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
    if (!route || route.coordinates.length === 0 || following) {
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
  }, [route, following]);

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

  const handleLongPress = useCallback(
    (event: NativeSyntheticEvent<PressEvent>) => {
      const [longitude, latitude] = event.nativeEvent.lngLat;
      onDropPin({ latitude, longitude });
    },
    [onDropPin],
  );

  const handleRegionDidChange = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { bounds, zoom } = event.nativeEvent;
      const [west, south, east, north] = bounds;
      onViewportChange({ south, west, north, east }, zoom);

      // Ao entrar num país cujo mapa está guardado, passa-se a usá-lo. Compara-se
      // pelo id para o estilo só ser trocado quando muda mesmo de região — trocar
      // de estilo recarrega o mapa, e a cada arrastar do dedo seria insuportável.
      const seguinte = regionAt((west + east) / 2, (south + north) / 2, offlineRegions);
      setOfflineRegion((atual) => (atual?.id === seguinte?.id ? atual : seguinte));
    },
    [onViewportChange, offlineRegions],
  );

  /**
   * Se o mapa guardado não abrir, volta-se aos tiles da Internet.
   *
   * Vale a pena ter isto: o mapa guardado é a parte mais recente e a que menos
   * garantias tem. Sem este recuo, uma falha dava ecrã em branco em vez de um
   * mapa normal — e ninguém perceberia porquê.
   */
  const handleFailure = useCallback(() => {
    setOfflineRegion((atual) => {
      if (atual) {
        setOfflineFailed(true);
      }
      return null;
    });
  }, []);

  // O estilo só se recalcula quando algo que o define muda. Se fosse criado a
  // cada desenho, o mapa recarregava sozinho de cada vez.
  const mapStyle = useMemo(
    () =>
      mapStyleFor(
        theme.dark,
        settings.mapType === 'satellite',
        offlineFailed ? null : offlineRegion,
        settings.satelliteDetail,
      ),
    [theme.dark, settings.mapType, settings.satelliteDetail, offlineRegion, offlineFailed],
  );

  return (
    <Map
      style={styles.map}
      mapStyle={mapStyle}
      attribution
      logo={false}
      // A bússola do MapLibre aparece sozinha assim que o mapa deixa de estar
      // virado a norte — e o sítio de origem dela é o canto superior direito,
      // mesmo por trás da barra de pesquisa, onde só se via um bocado a espreitar.
      // Passa para o canto inferior esquerdo, que está livre, e continua a servir
      // para tocar e voltar a norte.
      compassPosition={{ bottom: 24, left: 16 }}
      onDidFailLoadingMap={handleFailure}
      onRegionDidChange={handleRegionDidChange}
      onPress={onTapEmpty}
      onLongPress={handleLongPress}
    >
      <Camera
        ref={cameraRef}
        // 'course' aponta o mapa no sentido em que se segue, como na navegação
        // do Maps. Fora da navegação, a câmara fica livre.
        trackUserLocation={following ? 'course' : undefined}
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

          {/*
            O nome ao lado do pino. Faz falta em três sítios: no tema escuro,
            onde o mapa por baixo quase não se lê; na imagem de satélite, que não
            traz letra nenhuma; e no mapa guardado. Os tipos de letra vão dentro
            da aplicação, por isso isto também funciona sem rede.

            `text-optional` deixa o pino ficar mesmo quando não há espaço para o
            nome — mais vale saber que ali há alguma coisa do que perder o pino.
          */}
          {labelsReady ? (
            <Layer
              id="places-label"
              type="symbol"
              minzoom={15}
              layout={{
                'text-field': ['get', 'name'],
                'text-font': ['Noto Sans Medium'],
                'text-size': 12,
                'text-anchor': 'top',
                'text-offset': [0, 0.9],
                'text-max-width': 9,
                'text-optional': true,
              }}
              paint={{
                'text-color': theme.text,
                'text-halo-color': theme.surface,
                'text-halo-width': 1.8,
              }}
            />
          ) : null}
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

      {/*
        O pino largado com o dedo. Fica com um aspeto diferente do destino,
        para se perceber que ainda não há percurso traçado.
      */}
      {droppedPin ? (
        <Marker id="dropped-pin" lngLat={[droppedPin.longitude, droppedPin.latitude]}>
          <View style={[styles.droppedPin, { borderColor: theme.accent }]}>
            <View style={[styles.droppedPinCore, { backgroundColor: theme.accent }]} />
          </View>
        </Marker>
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
  droppedPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  droppedPinCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
