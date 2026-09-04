import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type PressEvent,
  type TrackUserLocationChangeEvent,
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

import { type SpeedCamera } from '../services/cameras';
import {
  stationLabel,
  type TransitStation,
  type TransitStop,
} from '../services/transit';
import { regionForView, type OfflineRegion } from '../services/offlineMap';
import type { LiveVehicle } from '../services/vehicles';
import { mapStyleFor } from '../services/tiles';
import { useSettings, useTheme } from '../settings';
import type { Bounds, Coordinates, Place, Route } from '../types/geo';
import { formatDistance } from '../utils/format';
import { boundsOf, distanceMeters } from '../utils/geometry';

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
  /**
   * Chamado num toque simples no mapa, fora de qualquer pino.
   *
   * Leva as coordenadas porque a fita métrica precisa delas — para os outros
   * usos basta saber que houve um toque.
   */
  onTapEmpty: (coordinates: Coordinates) => void;
  /** Pontos da fita métrica, pela ordem em que foram postos. */
  measurePoints?: Coordinates[];
  /** Se a fita está a medir uma forma fechada em vez de uma linha. */
  measureClosed?: boolean;
  /** Os caminhos que não foram escolhidos, desenhados apagados por baixo. */
  alternativeRoutes?: Route[];
  /** Paragens pelo caminho, marcadas ao longo do percurso. */
  waypoints?: Coordinates[];
  /** Durante a navegação o mapa segue a posição e roda no sentido da marcha. */
  following?: boolean;
  /**
   * Fora da navegação: a câmara anda com a pessoa, sem rodar o mapa.
   *
   * É o que se liga com dois toques no botão do GPS. Não roda de propósito — a
   * conduzir, virar o mapa no sentido da marcha ajuda; a pé, a olhar para o
   * telemóvel, um mapa que roda sozinho é só desorientação.
   */
  followUser?: boolean;
  /**
   * Chamado quando o seguimento cai por si.
   *
   * O MapLibre larga-o assim que a pessoa arrasta o mapa — e sem este aviso o
   * botão ficava aceso a dizer que seguia quando já não seguia.
   */
  onFollowUserChange?: (following: boolean) => void;
  /**
   * Até que ponto do percurso já se andou, durante a navegação.
   *
   * O que fica para trás desenha-se apagado, para o que falta se distinguir
   * de relance — a conduzir não há tempo para procurar onde ia a linha.
   */
  progressIndex?: number;
  /**
   * Radares em cima do percurso, para se verem antes de se lá chegar.
   *
   * São só os do percurso: marcar todos os da zona enchia o mapa de pontos que
   * não interessam a quem vai por outro lado.
   */
  cameras?: SpeedCamera[];
  /** Paragens de transporte a marcar no mapa, com o painel aberto. */
  transitStops?: TransitStop[];
  /** A paragem aberta no painel, desenhada em destaque. */
  selectedStopId?: string | null;
  /** Chamado ao tocar num pino de paragem. */
  onStopPress?: (stopId: string) => void;
  /**
   * Estações de comboio, metro, metro de superfície e barco.
   *
   * Destas só se sabe onde ficam — não há horários abertos destes operadores.
   * Aparecem na mesma porque saber que há uma estação ali é metade da questão.
   */
  transitStations?: TransitStation[];
  /**
   * Os autocarros a andar neste momento, com o número da linha.
   *
   * Só chegam aqui os que deram sinal há pouco — o serviço devolve a frota
   * inteira, parada incluída. Ver `src/services/vehicles.ts`.
   */
  vehicles?: LiveVehicle[];
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
  /** Volta a prender a câmara ao carro, durante a navegação. */
  followAgain: () => void;
}

/** Ponto de partida da câmara quando ainda não se sabe onde a pessoa está. */
const DEFAULT_CENTER: [number, number] = [-9.1393, 38.7223]; // Lisboa
const DEFAULT_ZOOM = 11;

/**
 * Abaixo deste zoom já não se muda de país guardado.
 *
 * O 5 é o nível a que se vê meia Europa: mais longe do que isto, nenhum país
 * chega para encher o ecrã, por isso escolher entre eles não muda nada do que se
 * vê — só faz o mapa recarregar, e era isso que dava os saltos.
 */
const OFFLINE_SWITCH_MIN_ZOOM = 5;

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
  followUser,
  onFollowUserChange,
  progressIndex = 0,
  cameras = [],
  measurePoints = [],
  measureClosed = false,
  alternativeRoutes = [],
  waypoints = [],
  transitStops = [],
  selectedStopId = null,
  transitStations = [],
  vehicles = [],
  onStopPress,
  offlineRegions,
  labelsReady,
  ref,
}: MapViewProps) {
  const cameraRef = useRef<CameraRef>(null);
  const theme = useTheme();
  const { settings } = useSettings();

  /** O mapa guardado que cobre a zona que se está a ver, se houver algum. */
  const [offlineRegion, setOfflineRegion] = useState<OfflineRegion | null>(null);
  /**
   * Os mapas guardados que não abriram.
   *
   * Guarda-se **por país**, e não um sim-ou-não para tudo. Antes era um trinco
   * que, uma vez fechado, desligava o offline o resto da sessão: bastava uma
   * falha passageira num país para o mapa de outro — descarregado e perfeito —
   * nunca mais ser usado, o que em modo de avião dá um ecrã vazio sem
   * explicação nenhuma.
   */
  const [failedRegions, setFailedRegions] = useState<string[]>([]);
  /**
   * Muda sempre que se pede para voltar ao carro durante a navegação.
   *
   * Serve de `key` à câmara. Assim que a pessoa arrasta o mapa, o MapLibre
   * larga o seguimento — e voltar a pedi-lo não adianta, porque a propriedade
   * não mudou. Recriar a câmara volta a prendê-la à posição.
   */
  const [followNonce, setFollowNonce] = useState(0);

  /** Quantos pontos do percurso já ficaram para trás. */
  const andado = following ? progressIndex : 0;

  /**
   * Os pontos da fita, já com o regresso ao princípio quando se está a medir uma
   * área. Sem isto, a forma aparecia sombreada com um dos lados por desenhar — e
   * o perímetro que o painel mostra não batia certo com o que se via.
   */
  const measureLine = useMemo(() => {
    const par = (p: Coordinates): [number, number] => [p.longitude, p.latitude];
    const linha = measurePoints.map(par);
    if (measureClosed && measurePoints.length >= 3) {
      linha.push(par(measurePoints[0]));
    }
    return linha;
  }, [measurePoints, measureClosed]);

  /** Os troços a medir, já a contar com o que fecha a forma. */
  const measureSegments = useMemo(() => {
    const pontos =
      measureClosed && measurePoints.length >= 3
        ? [...measurePoints, measurePoints[0]]
        : measurePoints;

    return pontos.slice(1).map((p, i) => ({ de: pontos[i], ate: p }));
  }, [measurePoints, measureClosed]);

  /**
   * As duas metades do percurso, em [longitude, latitude] — que é a ordem que o
   * GeoJSON quer. Sobrepõem-se num ponto, senão ficava uma falha entre elas.
   */
  const { andadoLine, faltaLine } = useMemo(() => {
    const pontos = route?.coordinates ?? [];
    const par = (p: Coordinates): [number, number] => [p.longitude, p.latitude];
    return {
      andadoLine: pontos.slice(0, Math.max(0, andado)).map(par),
      faltaLine: pontos.slice(Math.max(0, andado - 1)).map(par),
    };
  }, [route, andado]);

  useImperativeHandle(ref, () => ({
    recenter: (coordinates: Coordinates) => {
      cameraRef.current?.flyTo({
        center: [coordinates.longitude, coordinates.latitude],
        zoom: 16,
        duration: 700,
      });
    },
    followAgain: () => setFollowNonce((n) => n + 1),
  }));

  /**
   * Abre o mapa onde a pessoa está.
   *
   * **O `initialViewState` da câmara só é lido quando ela nasce**, e nessa altura
   * o GPS ainda não respondeu — por isso a aplicação abria em Lisboa e lá ficava,
   * mesmo depois de a posição chegar, até alguém carregar no botão de centrar.
   * Não era a câmara a ignorar a posição: era a posição a chegar tarde de mais
   * para uma propriedade que é de arranque e não se volta a ler.
   *
   * Refaz-se a câmara, em vez de se lhe pedir para voar até lá. É o mesmo
   * mecanismo do `followNonce`, e por uma razão parecida: a esta altura o mapa
   * ainda está a carregar, e uma ordem de movimento dada a um mapa que ainda não
   * está pronto perde-se sem dar erro. A câmara nova nasce já no sítio certo —
   * que é o caminho por onde a aplicação de qualquer maneira já passa ao abrir.
   *
   * De caminho, resolve o salto: não se vê a câmara atravessar o Atlântico de
   * Lisboa até São Tomé, parece que abriu logo onde devia.
   *
   * Trata da **primeira** posição que chega, e só dessa. A partir daí a câmara é
   * de quem está a mexer no mapa.
   */
  const openedOnUser = useRef(false);
  const [openNonce, setOpenNonce] = useState(0);
  useEffect(() => {
    if (openedOnUser.current || !userLocation) {
      return;
    }

    // A partir daqui o momento da abertura já passou, tenha-se chegado a centrar
    // ou não. Sem isto, uma pesquisa feita antes de o GPS responder via a câmara
    // ser-lhe tirada da mão assim que ele respondesse.
    openedOnUser.current = true;
    if (destination || route || following) {
      return;
    }

    setOpenNonce((n) => n + 1);
  }, [userLocation, destination, route, following]);

  // Sempre que há um percurso novo, enquadra-o todo no ecrã.
  useEffect(() => {
    if (!route || route.coordinates.length === 0 || following) {
      return;
    }

    // Numa passagem só: `Math.min(...pontos)` passa-os todos como argumentos da
    // função, e com `overview=full` um percurso longo traz dezenas de milhares
    // de pontos — o suficiente para rebentar a pilha.
    const area = boundsOf(route.coordinates);

    cameraRef.current?.fitBounds(
      // Ordem exigida pelo MapLibre: oeste, sul, este, norte.
      [area.west, area.south, area.east, area.north],
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

      // Muito afastado, o ecrã toca em vários países ao mesmo tempo e a região
      // escolhida mudava a cada arrastar do dedo. Como trocar de estilo recarrega
      // o mapa inteiro, isso dava um salto atrás do outro. Daí este chão: ao
      // longe fica-se com o que está, e é o próprio estilo que trata de mostrar
      // os tiles da Internet por cima.
      if (zoom < OFFLINE_SWITCH_MIN_ZOOM) {
        return;
      }

      // Ao entrar num país cujo mapa está guardado, passa-se a usá-lo. Compara-se
      // pelo id para o estilo só ser trocado quando muda mesmo de região — trocar
      // de estilo recarrega o mapa, e a cada arrastar do dedo seria insuportável.
      const seguinte = regionForView({ west, south, east, north }, offlineRegions);
      setOfflineRegion((atual) => (atual?.id === seguinte?.id ? atual : seguinte));
    },
    [onViewportChange, offlineRegions],
  );

  /**
   * O MapLibre avisa aqui quando muda o modo de seguimento — incluindo quando é
   * ele a largá-lo, que é o que acontece assim que a pessoa arrasta o mapa.
   *
   * **Só se comunica a queda.** Ligar é sempre decisão de quem carrega no botão;
   * o que se aproveita daqui é o "deixei de seguir", para o botão não ficar aceso
   * a mentir. Sem isto, a única forma de o apagar era carregar nele — o que o
   * ligava outra vez.
   *
   * Reparar em quem larga o seguimento por esta via, e não pelo `userInteraction`
   * do `onRegionDidChange`: aproximar o mapa com dois dedos também é interação da
   * pessoa e **não** desliga o seguimento. Quem sabe a diferença é a biblioteca.
   */
  const handleTrackChange = useCallback(
    (event: NativeSyntheticEvent<TrackUserLocationChangeEvent>) => {
      if (!event.nativeEvent.trackUserLocation) {
        onFollowUserChange?.(false);
      }
    },
    [onFollowUserChange],
  );

  /**
   * Se o mapa guardado não abrir, volta-se aos tiles da Internet.
   *
   * Vale a pena ter isto: o mapa guardado é a parte mais recente e a que menos
   * garantias tem. Sem este recuo, uma falha dava ecrã em branco em vez de um
   * mapa normal — e ninguém perceberia porquê.
   */
  const handleFailure = useCallback(() => {
    // Marca-se este país como falhado e recua-se para os tiles da Internet. O
    // `setState` não pode ter efeitos lá dentro: o React pode correr a função
    // duas vezes, e aí registava a falha a dobrar.
    const falhado = offlineRegion?.id;
    if (falhado) {
      setFailedRegions((atuais) =>
        atuais.includes(falhado) ? atuais : [...atuais, falhado],
      );
    }
    setOfflineRegion(null);
  }, [offlineRegion]);

  // O estilo só se recalcula quando algo que o define muda. Se fosse criado a
  // cada desenho, o mapa recarregava sozinho de cada vez.
  const mapStyle = useMemo(
    () =>
      mapStyleFor(
        theme.dark,
        settings.mapType,
        offlineRegion && failedRegions.includes(offlineRegion.id) ? null : offlineRegion,
        settings.satelliteDetail,
      ),
    [theme.dark, settings.mapType, settings.satelliteDetail, offlineRegion, failedRegions],
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
      onPress={(event) => {
        const [longitude, latitude] = event.nativeEvent.lngLat;
        onTapEmpty({ latitude, longitude });
      }}
      onLongPress={handleLongPress}
    >
      <Camera
        // Recriar a câmara é o que volta a prendê-la à posição depois de a
        // pessoa ter arrastado o mapa, e é também o que a põe onde a pessoa está
        // quando o GPS responde depois de o mapa já ter aberto. Ver `followNonce`
        // e `openNonce`.
        key={`camera-${followNonce}-${openNonce}`}
        ref={cameraRef}
        // 'course' aponta o mapa no sentido em que se segue, como na navegação
        // do Maps. O 'default' acompanha a pessoa sem lhe virar o mapa — é o que
        // se liga com dois toques no botão do GPS. Sem nenhum dos dois, a câmara
        // fica livre.
        trackUserLocation={following ? 'course' : followUser ? 'default' : undefined}
        onTrackUserLocationChange={handleTrackChange}
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
        O troço entre onde a pessoa está e onde o percurso começa mesmo.

        O serviço de percursos só anda por estradas: num aeroporto ou no meio do
        campo, encosta o início à estrada mais próxima, que pode ficar a
        centenas de metros. Sem isto, a linha parecia começar noutro sítio sem
        explicação. A tracejado, porque esse bocado é por conta de quem anda —
        não é um caminho que alguém tenha calculado.
      */}
      {userLocation && route?.startsAt && route.startAwayMeters > 40 ? (
        <GeoJSONSource
          id="route-gap"
          data={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [userLocation.longitude, userLocation.latitude],
                [route.startsAt.longitude, route.startsAt.latitude],
              ],
            },
          }}
        >
          <Layer
            id="route-gap-line"
            type="line"
            layout={{ 'line-cap': 'round' }}
            paint={{
              'line-color': theme.textMuted,
              'line-width': 3,
              'line-dasharray': [1, 2],
            }}
          />
        </GeoJSONSource>
      ) : null}

      {/*
        Os negócios vão todos numa única camada, em vez de um componente por
        pino. Com dezenas de pinos, a diferença de fluidez é grande.
      */}
      {/*
        A fita métrica.

        A forma fechada só se desenha a partir de três pontos, que é quando passa
        a existir área. A linha precisa de dois — e com menos do que isso não se
        desenha nada, porque uma linha sem pontos suficientes não é GeoJSON
        válido e leva a fonte inteira atrás. Já aconteceu com o percurso.
      */}
      {measureClosed && measurePoints.length >= 3 ? (
        <GeoJSONSource
          id="medida-area"
          data={{
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  ...measurePoints.map((p) => [p.longitude, p.latitude]),
                  // O GeoJSON exige que um polígono feche no ponto de partida.
                  [measurePoints[0].longitude, measurePoints[0].latitude],
                ],
              ],
            },
          }}
        >
          <Layer
            id="medida-area-fill"
            type="fill"
            paint={{ 'fill-color': theme.accent, 'fill-opacity': 0.15 }}
          />
        </GeoJSONSource>
      ) : null}

      {measureLine.length >= 2 ? (
        <GeoJSONSource
          id="medida-linha"
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: measureLine },
          }}
        >
          <Layer
            id="medida-linha-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': theme.accent,
              'line-width': 3,
              'line-dasharray': [2, 1.4],
            }}
          />
        </GeoJSONSource>
      ) : null}

      {/*
        A medida de cada troço, escrita a meio dele — como no Google Earth.

        Sem isto via-se o total no painel mas não se sabia quanto valia cada
        bocado, que é metade da utilidade de medir por partes.
      */}
      {measureSegments.length > 0 && labelsReady ? (
        <GeoJSONSource
          id="medida-troços"
          data={{
            type: 'FeatureCollection',
            features: measureSegments.map(({ de, ate }) => ({
              type: 'Feature',
              properties: { medida: formatDistance(distanceMeters(de, ate)) },
              geometry: {
                type: 'Point',
                coordinates: [
                  (de.longitude + ate.longitude) / 2,
                  (de.latitude + ate.latitude) / 2,
                ],
              },
            })),
          }}
        >
          <Layer
            id="medida-troços-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'medida'],
              'text-font': ['Noto Sans Medium'],
              'text-size': 12,
              'text-allow-overlap': true,
            }}
            paint={{
              'text-color': theme.accent,
              'text-halo-color': theme.surface,
              'text-halo-width': 2,
            }}
          />
        </GeoJSONSource>
      ) : null}

      {measurePoints.length > 0 ? (
        <GeoJSONSource
          id="medida-pontos"
          data={{
            type: 'FeatureCollection',
            features: measurePoints.map((p, i) => ({
              type: 'Feature',
              properties: { ordem: String(i + 1) },
              geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
            })),
          }}
        >
          <Layer
            id="medida-pontos-circle"
            type="circle"
            paint={{
              'circle-radius': 6,
              'circle-color': theme.surface,
              'circle-stroke-width': 3,
              'circle-stroke-color': theme.accent,
            }}
          />
        </GeoJSONSource>
      ) : null}

      {/*
        As estações de comboio, metro, metro de superfície e barco.

        Vão antes das paragens de autocarro para ficarem por baixo delas: as
        paragens é que se tocam, estas são só referência.
      */}
      {transitStations.length > 0 ? (
        <GeoJSONSource
          id="estacoes"
          data={{
            type: 'FeatureCollection',
            features: transitStations.map((estacao) => ({
              type: 'Feature',
              properties: {
                nome: estacao.name,
                genero: stationLabel(estacao.kind),
              },
              geometry: {
                type: 'Point',
                coordinates: [estacao.coordinates.longitude, estacao.coordinates.latitude],
              },
            })),
          }}
        >
          <Layer
            id="estacoes-circle"
            type="circle"
            paint={{
              'circle-radius': 7,
              'circle-color': theme.poi,
              'circle-stroke-width': 2.5,
              'circle-stroke-color': theme.poiOutline,
            }}
          />
          {labelsReady ? (
            <Layer
              id="estacoes-label"
              type="symbol"
              minzoom={12}
              layout={{
                'text-field': ['get', 'nome'],
                'text-font': ['Noto Sans Medium'],
                'text-size': 11,
                'text-offset': [0, 1.3],
                'text-anchor': 'top',
                'text-max-width': 9,
                'text-allow-overlap': false,
              }}
              paint={{
                'text-color': theme.text,
                'text-halo-color': theme.surface,
                'text-halo-width': 1.6,
              }}
            />
          ) : null}
        </GeoJSONSource>
      ) : null}

      {/*
        As paragens de transporte, enquanto o painel delas está aberto.

        Cada uma leva o nome ao lado, porque é isso que permite ligar a linha da
        lista ao ponto no mapa — sem nome, seis pontos iguais não dizem nada. A
        que está aberta fica maior e com a cor de destaque.
      */}
      {transitStops.length > 0 ? (
        <GeoJSONSource
          id="paragens"
          onPress={(event) => {
            // Ver a nota nos negócios: o toque não pode subir para o mapa.
            event.stopPropagation?.();
            // Igual ao dos negócios: as funcionalidades vêm em `nativeEvent`.
            const id = event.nativeEvent.features[0]?.properties?.id;
            if (typeof id === 'string') {
              onStopPress?.(id);
            }
          }}
          data={{
            type: 'FeatureCollection',
            features: transitStops.map((stop) => ({
              type: 'Feature',
              properties: {
                id: stop.id,
                nome: stop.name,
                aberta: stop.id === selectedStopId ? 1 : 0,
              },
              geometry: {
                type: 'Point',
                coordinates: [stop.coordinates.longitude, stop.coordinates.latitude],
              },
            })),
          }}
        >
          <Layer
            id="paragens-circle"
            type="circle"
            paint={{
              'circle-radius': ['case', ['==', ['get', 'aberta'], 1], 11, 8],
              'circle-color': [
                'case',
                ['==', ['get', 'aberta'], 1],
                theme.accent,
                theme.destination,
              ],
              'circle-stroke-width': 2.5,
              'circle-stroke-color': theme.poiOutline,
            }}
          />
          {labelsReady ? (
            <Layer
              id="paragens-label"
              type="symbol"
              layout={{
                'text-field': ['get', 'nome'],
                'text-font': ['Noto Sans Medium'],
                'text-size': 11,
                'text-offset': [0, 1.4],
                'text-anchor': 'top',
                'text-max-width': 9,
                'text-allow-overlap': false,
              }}
              paint={{
                'text-color': theme.text,
                'text-halo-color': theme.surface,
                'text-halo-width': 1.6,
              }}
            />
          ) : null}
        </GeoJSONSource>
      ) : null}

      {/*
        Os autocarros a andar, com o número da linha lá dentro.

        **Vão por cima das paragens, e é de propósito:** a paragem está sempre no
        mesmo sítio e o autocarro é que é a novidade. Tapar um autocarro com uma
        paragem seria tapar o que se veio ver.

        Não levam seta a indicar o sentido, apesar de o serviço mandar o
        `bearing`. Uma seta precisava de uma imagem ou de um caractere que os
        glifos incluídos não têm — são dois blocos de Noto Sans, que chegam para
        o português e não trazem símbolos. Fica anotado para quando fizer falta.
      */}
      {vehicles.length > 0 ? (
        <GeoJSONSource
          id="autocarros"
          data={{
            type: 'FeatureCollection',
            features: vehicles.map((v) => ({
              type: 'Feature',
              properties: {
                linha: v.line,
                // Um autocarro parado numa paragem desenha-se mais apagado: a
                // diferença entre "está a andar" e "está ali parado" é o que
                // torna isto útil a quem espera.
                parado: v.atStop ? 1 : 0,
              },
              geometry: {
                type: 'Point',
                coordinates: [v.coordinates.longitude, v.coordinates.latitude],
              },
            })),
          }}
        >
          <Layer
            id="autocarros-circle"
            type="circle"
            paint={{
              'circle-radius': 10,
              'circle-color': theme.vehicle,
              'circle-opacity': ['case', ['==', ['get', 'parado'], 1], 0.65, 1],
              'circle-stroke-width': 2,
              'circle-stroke-color': theme.poiOutline,
            }}
          />
          {labelsReady ? (
            <Layer
              id="autocarros-label"
              type="symbol"
              layout={{
                'text-field': ['get', 'linha'],
                'text-font': ['Noto Sans Medium'],
                'text-size': 10,
                // Sobrepostos de propósito: o número tem de ficar dentro do
                // círculo mesmo quando há autocarros encostados uns aos outros.
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{ 'text-color': theme.onOverlay }}
            />
          ) : null}
        </GeoJSONSource>
      ) : null}

      {/*
        Os radares. Vão depois do percurso e antes dos negócios, para ficarem
        por cima da linha e por baixo dos pinos em que se toca.
      */}
      {cameras.length > 0 ? (
        <GeoJSONSource
          id="cameras"
          data={{
            type: 'FeatureCollection',
            features: cameras.map((camera) => ({
              type: 'Feature',
              properties: { limite: camera.maxspeed ? String(camera.maxspeed) : '' },
              geometry: {
                type: 'Point',
                coordinates: [camera.coordinates.longitude, camera.coordinates.latitude],
              },
            })),
          }}
        >
          <Layer
            id="cameras-circle"
            type="circle"
            paint={{
              'circle-radius': 7,
              'circle-color': theme.danger,
              'circle-stroke-width': 2.5,
              'circle-stroke-color': theme.poiOutline,
            }}
          />
          {labelsReady ? (
            <Layer
              id="cameras-label"
              type="symbol"
              minzoom={13}
              layout={{
                'text-field': ['get', 'limite'],
                'text-font': ['Noto Sans Medium'],
                'text-size': 11,
                'text-offset': [0, 1.3],
                'text-anchor': 'top',
                'text-allow-overlap': false,
              }}
              paint={{
                'text-color': theme.text,
                'text-halo-color': theme.surface,
                'text-halo-width': 1.5,
              }}
            />
          ) : null}
        </GeoJSONSource>
      ) : null}

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
            // Sem isto o toque sobe também para o mapa: com a fita métrica
            // ligada, tocar num negócio abria a ficha **e** deixava lá um ponto
            // de medição por cima do pino.
            event.stopPropagation?.();
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

      {/*
        Os caminhos que não foram escolhidos, apagados e por baixo do escolhido.

        Desenham-se antes de propósito: no MapLibre a ordem em que as camadas
        entram é a ordem em que se sobrepõem, e o caminho escolhido tem de ficar
        por cima para se perceber qual é.
      */}
      {alternativeRoutes.map((alt, i) =>
        alt.coordinates.length >= 2 ? (
          <GeoJSONSource
            key={`alt-${i}`}
            id={`rota-alternativa-${i}`}
            data={{
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: alt.coordinates.map((p) => [p.longitude, p.latitude]),
              },
            }}
          >
            <Layer
              id={`rota-alternativa-${i}-line`}
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': theme.textMuted,
                'line-width': 5,
                'line-opacity': 0.4,
              }}
            />
          </GeoJSONSource>
        ) : null,
      )}

      {/*
        O percurso vai em duas fontes separadas — o que já ficou para trás e o
        que falta — e não numa só com um filtro a distinguir as duas.

        **A razão é uma avaria já apanhada:** com as duas linhas na mesma fonte,
        no arranque da navegação a primeira ainda não tinha ponto nenhum, e uma
        linha sem pontos não é GeoJSON válido. O MapLibre deitava fora a fonte
        inteira e o percurso **desaparecia todo** do mapa, sem dar erro nenhum.
        Daí as duas verificações de comprimento aqui em baixo: uma linha precisa
        de dois pontos para existir.
      */}
      {andadoLine.length >= 2 ? (
        <GeoJSONSource
          id="route-done"
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: andadoLine },
          }}
        >
          <Layer
            id="route-done-line"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': theme.textMuted,
              'line-width': 5,
              'line-opacity': 0.35,
              'line-dasharray': [1, 1.6],
            }}
          />
        </GeoJSONSource>
      ) : null}

      {faltaLine.length >= 2 ? (
        <GeoJSONSource
          id="route"
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: faltaLine },
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
        As paragens do percurso, numeradas pela ordem por que se passa por elas.
      */}
      {waypoints.length > 0 ? (
        <GeoJSONSource
          id="paragens-percurso"
          data={{
            type: 'FeatureCollection',
            features: waypoints.map((w, i) => ({
              type: 'Feature',
              properties: { ordem: String(i + 1) },
              geometry: { type: 'Point', coordinates: [w.longitude, w.latitude] },
            })),
          }}
        >
          <Layer
            id="paragens-percurso-circle"
            type="circle"
            paint={{
              'circle-radius': 10,
              'circle-color': theme.poi,
              'circle-stroke-width': 2.5,
              'circle-stroke-color': theme.poiOutline,
            }}
          />
          {labelsReady ? (
            <Layer
              id="paragens-percurso-label"
              type="symbol"
              layout={{
                'text-field': ['get', 'ordem'],
                'text-font': ['Noto Sans Medium'],
                'text-size': 12,
                'text-allow-overlap': true,
              }}
              paint={{ 'text-color': theme.poiOutline }}
            />
          ) : null}
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
