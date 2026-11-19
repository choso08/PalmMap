import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { PHOTO_HEADERS } from '../services/photos';
import { pictureById, preloadAround, type StreetPicture } from '../services/streetView';
import { useLanguage, useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Coordinates } from '../types/geo';

interface Props {
  /** The picture to open with, or null when closed. */
  picture: StreetPicture | null;
  /** Closing: where the last picture shown was, for the map to go there. */
  onClose: (at: Coordinates | null) => void;
}

/**
 * Street view, from Panoramax (`services/streetView.ts`): one picture at a
 * time, with arrows to the one before and after in the same sequence — as
 * walking along the street in Google's.
 *
 * A 360° picture is the whole panorama unrolled (equirectangular): drawn at
 * the screen's height, twice as wide, three copies side by side so turning
 * never meets an end, and turned by dragging sideways. Not
 * the true sphere — that would need a 3-D view, a native library and a full
 * build — but it shows all around, and the middle is where the camera faced.
 * A plain picture is shown whole, and a swipe sideways walks.
 *
 * Fluid, as asked (author, 19 November 2026): the pictures around are
 * preloaded (`preloadAround`), the new one fades in over the old one instead
 * of a black screen and a spinner, the small version shows first, and a 360°
 * picture opens facing where one was looking.
 *
 * The credit the licence asks for (CC BY-SA 4.0, the author's name) is always
 * on screen.
 */
export function StreetViewSheet({ picture, onClose }: Props) {
  const theme = useTheme();
  const strings = useT();
  const s = strings.streetView;
  const language = useLanguage();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  /** The picture being shown (or arriving). */
  const [shown, setShown] = useState<StreetPicture | null>(picture);
  /**
   * The last picture whose image finished drawing: it stays underneath while
   * the next one arrives, so a step never flashes black.
   */
  const [under, setUnder] = useState<StreetPicture | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Whether a 360° picture was turned yet: the hint shows until then. */
  const [turned, setTurned] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const asking = useRef(0);
  const scroller = useRef<ScrollView>(null);
  /** Which way one is looking in a 360° picture, degrees from north. */
  const looking = useRef<number | null>(null);
  /** The direction being walked, to preload ahead. */
  const walking = useRef<'next' | 'prev'>('next');

  // The panorama is drawn three times side by side and kept on the middle copy,
  // so turning round never meets an end.
  const panoHeight = Math.max(200, height - insets.top - insets.bottom - 150);
  const panoWidth = panoHeight * 2;

  /** The scroll offset that puts `heading` in the middle of the screen. */
  const offsetFor = (p: StreetPicture, heading: number | null) => {
    const turn =
      heading === null || p.azimuth === null ? 0 : ((((heading - p.azimuth) % 360) + 540) % 360) - 180;
    return panoWidth + panoWidth * (0.5 + turn / 360) - width / 2;
  };

  /** Images being warmed out of sight (see `preloadAround`), newest last. */
  const [warming, setWarming] = useState<string[]>([]);
  const warmImage = (uri: string) =>
    setWarming((list) => (list.includes(uri) ? list : [...list, uri].slice(-WARM_MAX)));

  const show = (next: StreetPicture) => {
    fade.setValue(0);
    fadedFor.current = null;
    setShown(next);
    preloadAround(next, walking.current, warmImage);
  };

  // A new picture from outside (another tap on the map) replaces the one shown.
  const [openedWith, setOpenedWith] = useState(picture);
  if (openedWith !== picture) {
    setOpenedWith(picture);
    setShown(picture);
    setUnder(null);
    setFailed(false);
    setLoading(false);
    setTurned(false);
    looking.current = null;
    asking.current += 1;
  }
  useEffect(() => {
    if (picture) {
      fade.setValue(0);
      fadedFor.current = null;
      preloadAround(picture, 'next', warmImage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picture, fade]);

  const go = (dir: 'next' | 'prev') => {
    const id = shown?.[dir];
    if (!id || !shown) {
      return;
    }
    walking.current = dir;
    const token = ++asking.current;
    setLoading(true);
    setFailed(false);
    pictureById(id, shown.collection || undefined)
      .then((next) => {
        if (token !== asking.current) {
          return;
        }
        setLoading(false);
        if (next) {
          show(next);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (token === asking.current) {
          setLoading(false);
          setFailed(true);
        }
      });
  };

  // A 360° picture opens facing where one was looking in the last one (as
  // walking in Google's), else where its camera faced.
  useEffect(() => {
    if (shown?.spherical) {
      scroller.current?.scrollTo({ x: startOffset, animated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.id, panoWidth, width]);

  // Worked out once per picture: a prop that changed while turning would
  // throw the view back.
  const startOffset = useMemo(
    () => (shown?.spherical ? offsetFor(shown, looking.current) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown?.id, panoWidth, width],
  );

  const onPanoScroll = (x: number) => {
    if (!shown?.spherical) {
      return;
    }
    const f = (x + width / 2 - panoWidth) / panoWidth;
    if (shown.azimuth !== null) {
      looking.current = (shown.azimuth + (f - 0.5) * 360 + 360) % 360;
    }
  };
  /** Back to the middle copy when a turn ends on one of the side ones. */
  const recentre = (x: number) => {
    if (x < panoWidth * 0.5) {
      scroller.current?.scrollTo({ x: x + panoWidth, animated: false });
    } else if (x > panoWidth * 1.5) {
      scroller.current?.scrollTo({ x: x - panoWidth, animated: false });
    }
  };

  // A plain picture: a swipe sideways walks, as the arrows do.
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_e, g) => {
          if (g.dx < -60) {
            goRef.current('next');
          } else if (g.dx > 60) {
            goRef.current('prev');
          }
        },
      }),
    [],
  );
  const goRef = useRef(go);
  goRef.current = go;

  const date = shown?.takenAt
    ? new Date(shown.takenAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'pt-PT', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  /**
   * The fade starts with whichever image of the new picture arrives first —
   * the 500 px thumbnail usually — so the thumbnail is really seen (it sat
   * inside a view that stayed see-through until the big one loaded). The big
   * one landing is what makes it the picture underneath the next step.
   */
  const fadedFor = useRef<string | null>(null);
  const [fullFor, setFullFor] = useState<string | null>(null);
  const drawn = (p: StreetPicture, top: boolean) => {
    const startFade = () => {
      if (fadedFor.current === p.id) {
        return;
      }
      fadedFor.current = p.id;
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    };
    const fullLoaded = () => {
      startFade();
      setFullFor(p.id);
      setUnder(p);
    };
    const layer = (uri: string, key: string, load?: () => void, error?: () => void) =>
      p.spherical ? (
        <View key={key} style={[styles.panoRow, { width: panoWidth * 3, height: panoHeight }]}>
          {[0, 1, 2].map((i) => (
            <Image
              key={i}
              source={{ uri, headers: PHOTO_HEADERS }}
              style={{ width: panoWidth, height: panoHeight }}
              resizeMode="cover"
              fadeDuration={0}
              onLoad={i === 1 ? load : undefined}
              onError={i === 1 ? error : undefined}
            />
          ))}
        </View>
      ) : (
        <Image
          key={key}
          source={{ uri, headers: PHOTO_HEADERS }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          fadeDuration={0}
          onLoad={load}
          onError={error}
        />
      );
    return (
      <Animated.View
        key={p.id}
        style={[StyleSheet.absoluteFill, top ? { opacity: fade } : null]}
      >
        {/* The small version first, then the big one over it. A thumbnail that
            fails says nothing: the big one may still come. */}
        {top && p.thumbUri ? layer(p.thumbUri, 'thumb', startFade) : null}
        <View style={p.spherical ? styles.panoOver : StyleSheet.absoluteFill}>
          {layer(
            p.uri,
            'full',
            top ? fullLoaded : undefined,
            top ? () => setFailed(true) : undefined,
          )}
        </View>
      </Animated.View>
    );
  };

  const sameKind = under && shown && under.spherical === shown.spherical && under.id !== shown.id;
  const pictures = (
    <>
      {sameKind && under ? drawn(under, false) : null}
      {shown ? drawn(shown, true) : null}
    </>
  );

  return (
    <Modal
      visible={picture !== null}
      animationType="fade"
      onRequestClose={() => onClose(shown?.coordinates ?? null)}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            onPress={() => onClose(shown?.coordinates ?? null)}
            hitSlop={12}
            accessibilityLabel={strings.common.close}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color={VIEWER.ink} />
          </Pressable>
          <View style={styles.headerTexts}>
            <Text style={styles.title}>{s.title}</Text>
            {date ? <Text style={styles.subtitle}>{s.taken(date)}</Text> : null}
          </View>
          {loading || (shown && fullFor !== shown.id && !failed) ? (
            <ActivityIndicator color={VIEWER.ink} />
          ) : null}
          {shown?.spherical ? (
            <MaterialCommunityIcons name="panorama-sphere-outline" size={22} color={VIEWER.ink} />
          ) : null}
        </View>

        <View style={styles.picture}>
          {shown?.spherical ? (
            <ScrollView
              ref={scroller}
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
              decelerationRate="fast"
              scrollEventThrottle={32}
              contentOffset={{ x: startOffset, y: 0 }}
              onScroll={(e) => onPanoScroll(e.nativeEvent.contentOffset.x)}
              onScrollBeginDrag={() => setTurned(true)}
              onScrollEndDrag={(e) => recentre(e.nativeEvent.contentOffset.x)}
              onMomentumScrollEnd={(e) => recentre(e.nativeEvent.contentOffset.x)}
            >
              <View style={{ width: panoWidth * 3, height: panoHeight }}>{pictures}</View>
            </ScrollView>
          ) : (
            <View style={StyleSheet.absoluteFill} {...swipe.panHandlers}>
              {pictures}
            </View>
          )}
          {failed ? <Text style={styles.failed}>{s.failed}</Text> : null}
          {/* The pictures around, loaded out of sight so a step is instant. */}
          <View style={styles.warm} pointerEvents="none">
            {warming.map((uri) => (
              <Image key={uri} source={{ uri, headers: PHOTO_HEADERS }} style={styles.warmImage} fadeDuration={0} />
            ))}
          </View>
          {shown?.spherical && !turned ? <Text style={styles.hint}>{s.dragHint}</Text> : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[styles.step, !shown?.prev && styles.stepOff]}
            disabled={!shown?.prev}
            onPress={() => go('prev')}
            accessibilityLabel={s.back}
          >
            <MaterialCommunityIcons name="chevron-left" size={30} color={theme.onAccent} />
          </Pressable>
          <Text style={styles.credit} numberOfLines={2}>
            {s.credit(shown?.author ?? null)}
          </Text>
          <Pressable
            style={[styles.step, !shown?.next && styles.stepOff]}
            disabled={!shown?.next}
            onPress={() => go('next')}
            accessibilityLabel={s.forward}
          >
            <MaterialCommunityIcons name="chevron-right" size={30} color={theme.onAccent} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * A picture viewer is dark whatever the theme, as every gallery is: the
 * photo's own colours are what matters. These are its only colours not from
 * the theme — the recorded exception, like the map's blue dot.
 */
/** How many images are kept warming out of sight at once. */
const WARM_MAX = 6;

const VIEWER = {
  ground: '#000000',
  ink: '#FFFFFF',
  inkSoft: 'rgba(255,255,255,0.7)',
  pill: 'rgba(0,0,0,0.5)',
};

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: VIEWER.ground,
      paddingTop: insets.top + 8,
      paddingBottom: insets.bottom + 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    headerTexts: { flex: 1 },
    title: { color: VIEWER.ink, fontSize: 18, fontWeight: '700' },
    subtitle: { color: VIEWER.inkSoft, fontSize: 13 },
    picture: { flex: 1, justifyContent: 'center' },
    panoRow: { flexDirection: 'row' },
    warm: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
    warmImage: { width: 1, height: 1 },
    panoOver: { position: 'absolute', top: 0, left: 0 },
    failed: {
      position: 'absolute',
      alignSelf: 'center',
      color: VIEWER.ink,
      fontSize: 15,
      paddingHorizontal: 24,
      textAlign: 'center',
    },
    hint: {
      position: 'absolute',
      bottom: 12,
      alignSelf: 'center',
      color: VIEWER.ink,
      fontSize: 13,
      backgroundColor: VIEWER.pill,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      overflow: 'hidden',
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    step: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepOff: { opacity: 0.3 },
    credit: { flex: 1, color: VIEWER.inkSoft, fontSize: 12, textAlign: 'center' },
  });
}
