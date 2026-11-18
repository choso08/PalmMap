import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { SEARCH_DEBOUNCE_MS } from '../services/config';
import { setHomeWork, useHomeWork, type HomeWorkKind } from '../services/homeWork';
import { getBestPosition } from '../services/location';
import { addressAt, searchPlaces } from '../services/nominatim';
import { SupersededError } from '../services/rateLimit';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Bounds, Coordinates, Place } from '../types/geo';
import { useSwipeToClose } from '../useSwipeToClose';

interface Props {
  /** Which one is being set; `null` hides the screen. */
  kind: HomeWorkKind | null;
  favourites: Place[];
  recents: Place[];
  getBounds: () => Bounds | null;
  /** Where the person is now, for "Use current location"; absent without a fix. */
  here: Coordinates | null;
  onClose: () => void;
  /** "Choose on map": the screen closes and the map takes over. */
  onChooseOnMap: (kind: HomeWorkKind) => void;
}

function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Setting Home or Work, as Google Maps does it (author: "setting home is very
 * impractical, copy Google"): a screen of its own with the address search
 * already focused, "Use current location", "Choose on map", and the saved and
 * recent places below. It used to be "tap a place in the list below", which
 * needed the address to be saved somewhere first.
 *
 * The search follows Nominatim's rules as the main bar does: one second after
 * typing stops, from three letters.
 */
export function HomeWorkPicker({
  kind,
  favourites,
  recents,
  getBounds,
  here,
  onClose,
  onChooseOnMap,
}: Props) {
  const theme = useTheme();
  const strings = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const homeWork = useHomeWork();
  const visible = kind !== null;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const latest = useRef(0);

  // A fresh screen each time it opens.
  const [openFor, setOpenFor] = useState<HomeWorkKind | null>(null);
  /**
   * Bumped on opening, closing and choosing: a "current location" lookup that
   * finishes after any of them saves nothing (review, November 2026 — it
   * overwrote a place chosen meanwhile, and closed the next picker).
   */
  const session = useRef(0);
  if (openFor !== kind) {
    session.current += 1;
    setOpenFor(kind);
    setQuery('');
    setResults([]);
    setError(null);
    setLoading(false);
    setLocating(false);
  }

  useEffect(() => {
    const id = ++latest.current;
    const term = query.trim();
    if (term.length < 3) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchPlaces(term, 10, getBounds(), () => id === latest.current)
        .then((found) => {
          if (id === latest.current) {
            setResults(found);
          }
        })
        .catch((err: unknown) => {
          if (id === latest.current && !(err instanceof SupersededError)) {
            setError(err instanceof Error && err.message ? err.message : strings.search.failed);
            setResults([]);
          }
        })
        .finally(() => {
          if (id === latest.current) {
            setLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, getBounds, strings]);

  const choose = (place: Place) => {
    session.current += 1;
    if (kind) {
      setHomeWork(kind, place);
    }
    onClose();
  };

  const useCurrentLocation = () => {
    if (!here || !kind || locating) {
      return;
    }
    const mine = session.current;
    const forKind = kind;
    setLocating(true);
    void (async () => {
      // Where one is **now**: the stored reading only if recent, else a new
      // one — the stored one may be from before the app was in the
      // background, somewhere else (`getBestPosition`).
      const position = await getBestPosition().catch(() => null);
      if (mine !== session.current) {
        return;
      }
      if (!position) {
        setLocating(false);
        setError(strings.errors.locationUnavailable);
        return;
      }
      const found = await addressAt(position).catch(() => null);
      if (mine !== session.current || forKind !== kind) {
        return;
      }
      choose(
        found ?? {
          id: -Date.now(),
          name: strings.saved[forKind],
          address: '',
          coordinates: position,
        },
      );
    })();
  };

  // Typed text first filters what is on the phone, at once.
  const local = useMemo(() => {
    const seen = new Set<string>();
    const all = [...favourites, ...recents].filter((p) => {
      const key = `${p.name}|${p.coordinates.latitude.toFixed(4)}|${p.coordinates.longitude.toFixed(4)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    const q = plain(query.trim());
    return q
      ? all.filter((p) => plain(`${p.name} ${p.address ?? ''}`).includes(q)).slice(0, 5)
      : all.slice(0, 15);
  }, [favourites, recents, query]);

  const rows: { place: Place; icon: string }[] = [
    ...local.map((place) => ({
      place,
      icon: favourites.includes(place) ? 'star' : 'history',
    })),
    ...results.map((place) => ({ place, icon: 'map-marker-outline' })),
  ];

  const swipe = useSwipeToClose(onClose, visible);
  const current = kind ? homeWork[kind] : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Animated.View style={[styles.screen, swipe.sheetStyle]}>
        <View style={styles.header} {...swipe.headerHandlers}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={strings.common.close}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>
            {kind === 'work' ? strings.saved.setWorkTitle : strings.saved.setHomeTitle}
          </Text>
        </View>

        <View style={styles.inputRow}>
          <MaterialCommunityIcons
            name={kind === 'work' ? 'briefcase' : 'home'}
            size={20}
            color={theme.accent}
          />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder={strings.saved.addressPlaceholder}
            placeholderTextColor={theme.textMuted}
            autoFocus
            returnKeyType="search"
          />
          {loading ? <ActivityIndicator size="small" color={theme.accent} /> : null}
          {query.length > 0 && !loading ? (
            <Pressable hitSlop={10} onPress={() => setQuery('')}>
              <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <FlatList
          keyboardShouldPersistTaps="handled"
          data={rows}
          keyExtractor={(r, i) => `${r.place.id}-${i}`}
          ListHeaderComponent={
            <View>
              {here ? (
                <Pressable style={styles.row} onPress={useCurrentLocation} disabled={locating}>
                  <View style={styles.icon}>
                    {locating ? (
                      <ActivityIndicator size="small" color={theme.accent} />
                    ) : (
                      <MaterialCommunityIcons name="crosshairs-gps" size={20} color={theme.accent} />
                    )}
                  </View>
                  <Text style={styles.action}>{strings.saved.useCurrentLocation}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.row} onPress={() => kind && onChooseOnMap(kind)}>
                <View style={styles.icon}>
                  <MaterialCommunityIcons name="map-marker-radius" size={20} color={theme.accent} />
                </View>
                <Text style={styles.action}>{strings.saved.chooseOnMap}</Text>
              </Pressable>
              {current && kind ? (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    setHomeWork(kind, null);
                    onClose();
                  }}
                >
                  <View style={styles.icon}>
                    <MaterialCommunityIcons name="delete-outline" size={20} color={theme.danger} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.action, { color: theme.danger }]}>
                      {kind === 'work' ? strings.saved.removeWork : strings.saved.removeHome}
                    </Text>
                    <Text style={styles.sub} numberOfLines={1}>
                      {current.address ?? current.name}
                    </Text>
                  </View>
                </Pressable>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {!loading && !error && query.trim().length >= 3 && rows.length === 0 ? (
                <Text style={styles.error}>{strings.search.noResults}</Text>
              ) : null}
              <View style={styles.divider} />
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => choose(item.place)}>
              <View style={styles.icon}>
                <MaterialCommunityIcons name={item.icon as never} size={20} color={theme.textMuted} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.place.name}
                </Text>
                {item.place.address ? (
                  <Text style={styles.sub} numberOfLines={1}>
                    {item.place.address}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      </Animated.View>
    </Modal>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
      paddingTop: insets.top,
      paddingBottom: insets.bottom,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    title: { fontSize: 19, fontWeight: '600', color: theme.text },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 14,
      borderRadius: 24,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    input: { flex: 1, fontSize: 16, color: theme.text, paddingVertical: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    icon: { width: 28, alignItems: 'center' },
    rowText: { flex: 1 },
    action: { fontSize: 16, color: theme.accent, fontWeight: '500' },
    name: { fontSize: 16, color: theme.text },
    sub: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
    error: { paddingHorizontal: 16, paddingVertical: 8, color: theme.textMuted },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.border,
      marginVertical: 6,
    },
  });
}
