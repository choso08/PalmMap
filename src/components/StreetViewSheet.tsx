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

  const show = (next: StreetPicture) => {
    fade.setValue(0);
    setShown(next);
    preloadAround(next, walking.current);
  };

  // A new picture from outside (another tap on the map) replaces the one shown.
  const [openedWith, setOpenedWith] = useState(picture);
  if (openedWith !== picture) {
    setOpenedWith(picture);
    setShown(picture);
    setUnder(null);
    setFailed(false);
    setLoading(false);
    looking.current = null;
    asking.current += 1;
  }
  useEffect(() => {
    if (picture) {
      fade.setValue(0);
      preloadAround(picture);
    }
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

  const drawn = (p: StreetPicture, top: boolean) => {
    const onLoad = top
      ? () => {
          Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start(() => {
            setUnder(p);
          });
        }
      : undefined;
    const layer = (uri: string, key: string, load?: () => void) =>
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
              onError={i === 1 && top ? () => setFailed(true) : undefined}
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
          onError={top ? () => setFailed(true) : undefined}
        />
      );
    return (
      <Animated.View
        key={p.id}
        style={[StyleSheet.absoluteFill, top ? { opacity: fade } : null]}
      >
        {/* The small version first, then the big one over it. */}
        {top && p.thumbUri ? layer(p.thumbUri, 'thumb') : null}
        <View style={p.spherical ? styles.panoOver : StyleSheet.absoluteFill}>
          {layer(p.uri, 'full', onLoad)}
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
            <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
          </Pressable>
          <View style={styles.headerTexts}>
            <Text style={styles.title}>{s.title}</Text>
            {date ? <Text style={styles.subtitle}>{s.taken(date)}</Text> : null}
          </View>
          {loading ? <ActivityIndicator color="#fff" /> : null}
          {shown?.spherical ? (
            <MaterialCommunityIcons name="panorama-sphere-outline" size={22} color="#fff" />
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
          {shown?.spherical && !under ? <Text style={styles.hint}>{s.dragHint}</Text> : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[styles.step, !shown?.prev && styles.stepOff]}
            disabled={!shown?.prev}
            onPress={() => go('prev')}
            accessibilityLabel={s.back}
          >
            <MaterialCommunityIcons name="chevron-left" size={30} color="#fff" />
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
            <MaterialCommunityIcons name="chevron-right" size={30} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// A picture viewer is dark whatever the theme, as every gallery is: the
// photo's own colours are what matters.
function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: '#000',
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
    title: { color: '#fff', fontSize: 18, fontWeight: '700' },
    subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
    picture: { flex: 1, justifyContent: 'center' },
    panoRow: { flexDirection: 'row' },
    panoOver: { position: 'absolute', top: 0, left: 0 },
    failed: {
      position: 'absolute',
      alignSelf: 'center',
      color: '#fff',
      fontSize: 15,
      paddingHorizontal: 24,
      textAlign: 'center',
    },
    hint: {
      position: 'absolute',
      bottom: 12,
      alignSelf: 'center',
      color: '#fff',
      fontSize: 13,
      backgroundColor: 'rgba(0,0,0,0.5)',
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
    credit: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center' },
  });
}
