import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { SupersededError } from '../services/rateLimit';
import { searchPlaces } from '../services/nominatim';
import { TRAVEL_MODES, useT, useTheme, type TravelMode } from '../settings';
import type { Theme } from '../theme';
import type { Bounds, Place } from '../types/geo';

interface Props {
  visible: boolean;
  /** `null` means "my location". */
  origin: Place | null;
  destination: Place | null;
  travelMode: TravelMode;
  favourites: Place[];
  recents: Place[];
  getBounds: () => Bounds | null;
  onClose: () => void;
  onConfirm: (origin: Place | null, destination: Place, mode: TravelMode) => void;
}

type Field = 'from' | 'to';

/** Text without accents and in lower case, for matching saved places. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Plan a route between any two places, as in any maps app.
 *
 * Until now a route always started at the GPS and the only way in was to pick
 * a destination first. This screen lets the start be anywhere — a saved place,
 * an address, "my location" — swaps the two ends, and picks the mode before
 * asking for anything.
 *
 * The search follows Nominatim's rules exactly as the main search bar does:
 * one second after typing stops, from three letters, never per keystroke. The
 * saved places and recent destinations need no request and show at once.
 */
export function DirectionsSheet({
  visible,
  origin: initialOrigin,
  destination: initialDestination,
  travelMode,
  favourites,
  recents,
  getBounds,
  onClose,
  onConfirm,
}: Props) {
  const theme = useTheme();
  const strings = useT();
  const s = strings.directions;
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  const [origin, setOrigin] = useState<Place | null>(initialOrigin);
  const [destination, setDestination] = useState<Place | null>(initialDestination);
  const [mode, setMode] = useState<TravelMode>(travelMode);
  const [field, setField] = useState<Field>(initialDestination ? 'from' : 'to');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  // Each time the screen opens, it starts from what is on the map now.
  useEffect(() => {
    if (visible) {
      setOrigin(initialOrigin);
      setDestination(initialDestination);
      setMode(travelMode);
      setField(initialDestination ? 'from' : 'to');
      setQuery('');
      setResults([]);
      setError(null);
    }
  }, [visible, initialOrigin, initialDestination, travelMode]);

  // The search, one second after typing stops — Nominatim's rule.
  useEffect(() => {
    const term = query.trim();
    const id = ++latest.current;
    if (term.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchPlaces(term, 8, getBounds(), () => id === latest.current)
        .then((found) => {
          if (id === latest.current) {
            setResults(found);
          }
        })
        .catch((e) => {
          if (id === latest.current && !(e instanceof SupersededError)) {
            setError(e instanceof Error ? e.message : strings.search.failed);
          }
        })
        .finally(() => {
          if (id === latest.current) {
            setLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, getBounds, strings.search.failed]);

  // Saved places and recents matching what is typed: no request, at once.
  const saved = useMemo(() => {
    const term = plain(query.trim());
    const seen = new Set<string>();
    return [...favourites, ...recents].filter((p) => {
      const key = `${p.coordinates.latitude.toFixed(5)},${p.coordinates.longitude.toFixed(5)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return term.length === 0 || plain(p.name).includes(term) || plain(p.address).includes(term);
    });
  }, [favourites, recents, query]);

  const choose = (place: Place | null) => {
    if (field === 'from') {
      setOrigin(place);
      setField(destination ? 'from' : 'to');
    } else if (place) {
      setDestination(place);
    }
    setQuery('');
    setResults([]);
  };

  const swap = () => {
    // "My location" cannot be a destination; swapping it there leaves the
    // destination empty for the person to choose.
    const newDestination = origin;
    setOrigin(destination);
    setDestination(newDestination);
    setField(newDestination ? 'from' : 'to');
  };

  type Row = { key: string; place: Place | null; icon: string; title: string; subtitle?: string };
  const rows: Row[] = [
    ...(field === 'from'
      ? [{ key: 'me', place: null, icon: 'crosshairs-gps', title: s.myLocation } as Row]
      : []),
    ...saved.slice(0, 8).map((p, i) => ({
      key: `saved-${i}`,
      place: p,
      icon: favourites.includes(p) ? 'star' : 'history',
      title: p.name,
      subtitle: p.address,
    })),
    ...results.map((p) => ({
      key: `r-${p.id}`,
      place: p,
      icon: 'map-marker-outline',
      title: p.name,
      subtitle: p.address,
    })),
  ];

  const fieldBox = (which: Field) => {
    const active = field === which;
    const value = which === 'from' ? (origin ? origin.name : s.myLocation) : destination?.name ?? '';
    return (
      <Pressable
        style={[styles.field, active && styles.fieldActive]}
        onPress={() => {
          setField(which);
          setQuery('');
        }}
      >
        <MaterialCommunityIcons
          name={which === 'from' ? 'circle-outline' : 'map-marker'}
          size={18}
          color={which === 'from' ? theme.textMuted : theme.accent}
        />
        {active ? (
          <TextInput
            style={styles.input}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={value || (which === 'from' ? s.fromPlaceholder : s.toPlaceholder)}
            placeholderTextColor={theme.placeholder}
            returnKeyType="search"
          />
        ) : (
          <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
            {value || (which === 'from' ? s.fromPlaceholder : s.toPlaceholder)}
          </Text>
        )}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={strings.common.close}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
          </Pressable>
          <Text style={styles.title}>{s.title}</Text>
        </View>

        <View style={styles.fieldsRow}>
          <View style={styles.fields}>
            {fieldBox('from')}
            {fieldBox('to')}
          </View>
          <Pressable onPress={swap} hitSlop={10} accessibilityLabel={s.swap} style={styles.swap}>
            <MaterialCommunityIcons name="swap-vertical" size={24} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.modes}>
          {TRAVEL_MODES.map((m) => {
            const active = m.id === mode;
            return (
              <Pressable
                key={m.id}
                onPress={() => setMode(m.id)}
                style={[styles.mode, active && styles.modeActive]}
                accessibilityLabel={strings.settings.travelModes[m.id]}
              >
                <MaterialCommunityIcons
                  name={m.icon as never}
                  size={20}
                  color={active ? theme.onAccent : theme.text}
                />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[styles.show, !destination && styles.showDisabled]}
          disabled={!destination}
          onPress={() => destination && onConfirm(origin, destination, mode)}
        >
          <Text style={styles.showText}>{destination ? s.show : s.needDestination}</Text>
        </Pressable>

        {loading ? <ActivityIndicator style={styles.spinner} color={theme.accent} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <FlatList
          data={rows}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(r) => r.key}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => choose(item.place)}>
              <MaterialCommunityIcons name={item.icon as never} size={20} color={theme.textMuted} />
              <View style={styles.rowTexts}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
          contentContainerStyle={styles.list}
        />
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.surface,
      paddingTop: insets.top + 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
    },
    fieldsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 8,
    },
    fields: {
      flex: 1,
      gap: 8,
    },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 12,
      paddingHorizontal: 12,
      minHeight: 46,
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    fieldActive: {
      borderColor: theme.accent,
    },
    input: {
      flex: 1,
      fontSize: 16,
      color: theme.text,
      paddingVertical: 8,
    },
    value: {
      flex: 1,
      fontSize: 16,
      color: theme.text,
    },
    placeholder: {
      color: theme.placeholder,
    },
    swap: {
      padding: 6,
    },
    modes: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      marginTop: 12,
    },
    mode: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 9,
      borderRadius: 20,
      backgroundColor: theme.surfaceMuted,
    },
    modeActive: {
      backgroundColor: theme.accent,
    },
    show: {
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 24,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: theme.accent,
    },
    showDisabled: {
      opacity: 0.5,
    },
    showText: {
      color: theme.onAccent,
      fontSize: 16,
      fontWeight: '700',
    },
    spinner: {
      marginTop: 12,
    },
    error: {
      color: theme.danger,
      marginHorizontal: 16,
      marginTop: 10,
    },
    list: {
      paddingBottom: insets.bottom + 24,
      paddingTop: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowTexts: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 15,
      color: theme.text,
    },
    rowSubtitle: {
      fontSize: 13,
      color: theme.textMuted,
      marginTop: 2,
    },
  });
}
