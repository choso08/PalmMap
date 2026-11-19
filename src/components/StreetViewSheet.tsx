import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { PHOTO_HEADERS } from '../services/photos';
import { pictureById, type StreetPicture } from '../services/streetView';
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
 * the screen's height, twice as wide, and turned by dragging sideways. Not
 * the true sphere — that would need a 3-D view, a native library and a full
 * build — but it shows all around, and the middle is where the camera faced.
 * A plain picture is shown whole.
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

  const [shown, setShown] = useState<StreetPicture | null>(picture);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const asking = useRef(0);
  const scroller = useRef<ScrollView>(null);

  // A new picture from outside (another tap on the map) replaces the one shown.
  const [openedWith, setOpenedWith] = useState(picture);
  if (openedWith !== picture) {
    setOpenedWith(picture);
    setShown(picture);
    setFailed(false);
    setLoading(false);
    setImageReady(false);
    asking.current += 1;
  }

  const go = (id: string | null) => {
    if (!id || !shown) {
      return;
    }
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
          setImageReady(false);
          setShown(next);
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

  // The panorama starts facing where the camera faced: its middle.
  const panoHeight = height - insets.top - insets.bottom - 150;
  const panoWidth = panoHeight * 2;
  useEffect(() => {
    if (shown?.spherical) {
      scroller.current?.scrollTo({ x: Math.max(0, (panoWidth - width) / 2), animated: false });
    }
  }, [shown?.id, shown?.spherical, panoWidth, width]);

  const date = shown?.takenAt
    ? new Date(shown.takenAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'pt-PT', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  const image = shown ? (
    <Image
      key={shown.id}
      source={{ uri: shown.uri, headers: PHOTO_HEADERS }}
      style={shown.spherical ? { width: panoWidth, height: panoHeight } : styles.flat}
      resizeMode={shown.spherical ? 'cover' : 'contain'}
      onLoad={() => setImageReady(true)}
      onError={() => setFailed(true)}
    />
  ) : null;

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
              contentOffset={{ x: Math.max(0, (panoWidth - width) / 2), y: 0 }}
            >
              {image}
            </ScrollView>
          ) : (
            image
          )}
          {(loading || (!imageReady && !failed)) ? (
            <ActivityIndicator style={StyleSheet.absoluteFill} color="#fff" size="large" />
          ) : null}
          {failed ? <Text style={styles.failed}>{s.failed}</Text> : null}
          {shown?.spherical && imageReady ? <Text style={styles.hint}>{s.dragHint}</Text> : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[styles.step, !shown?.prev && styles.stepOff]}
            disabled={!shown?.prev || loading}
            onPress={() => go(shown?.prev ?? null)}
            accessibilityLabel={s.back}
          >
            <MaterialCommunityIcons name="chevron-left" size={30} color="#fff" />
          </Pressable>
          <Text style={styles.credit} numberOfLines={2}>
            {s.credit(shown?.author ?? null)}
          </Text>
          <Pressable
            style={[styles.step, !shown?.next && styles.stepOff]}
            disabled={!shown?.next || loading}
            onPress={() => go(shown?.next ?? null)}
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
    flat: { width: '100%', height: '100%' },
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
