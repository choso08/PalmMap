import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { t } from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SEARCH_DEBOUNCE_MS } from '../services/config';
import { isSamePlace } from '../services/favourites';
import { searchPlaces } from '../services/nominatim';
import { useTheme, useT } from '../settings';
import type { Theme } from '../theme';
import type { Bounds, Place } from '../types/geo';

interface SearchBarProps {
  onSelect: (place: Place) => void;
  /**
   * The area the map is showing, so the search prefers what is near.
   *
   * A function rather than a value because it only matters at the moment of
   * searching — as a value, every drag of the map would redraw all of this.
   */
  getBounds: () => Bounds | null;
  onOpenSettings?: () => void;
  /** Opens the Directions screen (start and destination). */
  onOpenDirections?: () => void;
  /**
   * A new version is waiting.
   *
   * Marks the Settings button with a dot. It is the only sign someone who never
   * opens Settings gets to see — and an update nobody sees is no use. A dot,
   * not a number: it is not urgent, just new.
   */
  updateAvailable?: boolean;
  /**
   * Tells the screen the search is open, so it can cover the map behind it —
   * the search takes the whole screen while in use, as people expect from a
   * maps app, instead of a short list over the map.
   */
  onFocusChange?: (focused: boolean) => void;
  /** Saved places, shown while nothing is typed. */
  favourites: Place[];
  /** Recent destinations, shown after the saved ones. */
  recents: Place[];
}

/**
 * The search bar for addresses and businesses.
 *
 * Important: it does not search on every keystroke. It waits for the person to
 * stop typing (SEARCH_DEBOUNCE_MS) or press Enter — a requirement of
 * Nominatim's usage policy, not an interface preference.
 */
export function SearchBar({
  onSelect,
  onOpenSettings,
  onOpenDirections,
  favourites,
  recents,
  getBounds,
  updateAvailable = false,
  onFocusChange,
}: SearchBarProps) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [query, setQuery] = useState('');
  /** True while the box is in use, to show the saved places. */
  const [focused, setFocusedState] = useState(false);
  const setFocused = useCallback(
    (value: boolean) => {
      setFocusedState(value);
      onFocusChange?.(value);
    },
    [onFocusChange],
  );
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Identifica a pesquisa mais recente, para ignorar respostas atrasadas. */
  const latestSearch = useRef(0);

  const runSearch = useCallback(async (term: string) => {
    const searchId = ++latestSearch.current;

    if (term.trim().length < 3) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Twelve, not eight: the search favours what is in view, and with a short
      // list a business in another town was pushed out by local streets and
      // places with a similar name.
      const places = await searchPlaces(
        term,
        12,
        getBounds(),
        // If more was typed meanwhile, this search never goes out.
        () => searchId === latestSearch.current,
      );
      // If another search happened meanwhile, this answer does not matter.
      if (searchId === latestSearch.current) {
        setResults(places);
      }
    } catch (err) {
      if (searchId === latestSearch.current) {
        // The service's message says what failed — network, delay or refusal.
        setError(err instanceof Error && err.message ? err.message : t().search.failed);
        setResults([]);
      }
    } finally {
      if (searchId === latestSearch.current) {
        setLoading(false);
      }
    }
  }, [getBounds]);

  /**
   * The text the bar itself wrote when a result was chosen.
   *
   * Choosing puts the place's name in the box, and that counted as new text: a
   * second later a Nominatim search for that name went out, which nobody asked
   * for, took a place in the queue and made the list reappear under the
   * destination.
   */
  const escolhido = useRef<string | null>(null);

  // The delay that avoids searching on every keystroke.
  useEffect(() => {
    if (query === escolhido.current) {
      return;
    }
    escolhido.current = null;
    const timer = setTimeout(() => {
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const handleSelect = (place: Place) => {
    escolhido.current = place.name;
    // A search still on its way no longer matters.
    latestSearch.current += 1;
    setLoading(false);
    setQuery(place.name);
    setResults([]);
    setFocused(false);
    Keyboard.dismiss();
    onSelect(place);
  };

  // With nothing typed, the list shows saved places and then recent
  // destinations. Handy without a network: both are on the phone and the search
  // is not. A place that is both shows once, as saved — the stronger mark.
  const parado = query.trim().length === 0 && focused;
  const guardadosERecentes = [
    ...favourites.map((place) => ({ place, guardado: true, local: true })),
    ...recents
      .filter((r) => !favourites.some((f) => isSamePlace(f, r)))
      .map((place) => ({ place, guardado: false, local: true })),
  ];

  // **While typing, what is on the phone shows at once.** The Internet search
  // has to wait SEARCH_DEBOUNCE_MS — Nominatim's rule, not to be shortened — but
  // saved places and recent destinations ask nobody for anything. Someone
  // typing "home" or a place they have been, which is most destination
  // searches, gets it from the first letter.
  const termo = normalizar(query.trim());
  const locais =
    termo.length >= 2
      ? guardadosERecentes
          .filter(
            ({ place }) =>
              normalizar(place.name).includes(termo) ||
              normalizar(place.address).includes(termo),
          )
          .slice(0, MAX_LOCAL_MATCHES)
      : [];

  const sugestoes = parado
    ? guardadosERecentes
    : [
        ...locais,
        ...results
          .filter((place) => !locais.some((l) => isSamePlace(l.place, place)))
          .map((place) => ({ place, guardado: false, local: false })),
      ];

  const showingSuggestions = parado && sugestoes.length > 0;
  // Only while the box is in use: once something is chosen, the list has no job.
  const list = focused && (showingSuggestions || !parado) ? sugestoes : [];

  return (
    <View style={[styles.container, focused && styles.containerFocused]}>
      <View style={styles.inputRow}>
        {focused ? (
          <Pressable
            hitSlop={10}
            onPress={() => {
              setFocused(false);
              Keyboard.dismiss();
            }}
            accessibilityLabel={strings.common.close}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text} />
          </Pressable>
        ) : (
          <MaterialCommunityIcons name="magnify" size={22} color={theme.textMuted} />
        )}

        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={strings.search.placeholder}
          placeholderTextColor={theme.placeholder}
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onSubmitEditing={() => void runSearch(query)}
        />

        {loading ? <ActivityIndicator size="small" color={theme.accent} /> : null}

        {/* Clear the text, when there is some. */}
        {query.length > 0 && !loading ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
          </Pressable>
        ) : null}

        {onOpenDirections && !focused ? (
          <Pressable
            onPress={onOpenDirections}
            hitSlop={10}
            style={styles.settingsButton}
            accessibilityLabel={strings.directions.open}
          >
            <MaterialCommunityIcons name="directions" size={22} color={theme.accent} />
          </Pressable>
        ) : null}
        {onOpenSettings && !focused ? (
          <Pressable onPress={onOpenSettings} hitSlop={10} style={styles.settingsButton}>
            <MaterialCommunityIcons name="tune-variant" size={20} color={theme.textMuted} />
            {updateAvailable ? <View style={styles.updateDot} /> : null}
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {list.length > 0 ? (
        <FlatList
          style={[styles.results, focused && styles.resultsFocused]}
          data={list}
          keyExtractor={({ place }, i) => `${place.id}-${i}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: { place, guardado, local } }) => (
            <Pressable style={styles.result} onPress={() => handleSelect(place)}>
              <View style={styles.resultHeader}>
                {local ? (
                  <MaterialCommunityIcons
                    name={guardado ? 'star' : 'history'}
                    size={15}
                    color={guardado ? theme.poi : theme.textMuted}
                  />
                ) : null}
                <Text style={styles.resultName} numberOfLines={1}>
                  {place.name}
                </Text>
                {/* The kind of business, when OpenStreetMap knows it. */}
                {place.category ? (
                  <Text style={styles.resultCategory}>{place.category}</Text>
                ) : null}
              </View>
              <Text style={styles.resultAddress} numberOfLines={1}>
                {place.address}
              </Text>
            </Pressable>
          )}
        />
      ) : null}
    </View>
  );
}

/** How many saved and recent places show above the results while typing. */
const MAX_LOCAL_MATCHES = 4;

/**
 * Minúsculas e sem acentos: "sao tome" tem de encontrar "São Tomé".
 *
 * O `normalize` existe no Hermes, mas confirma-se antes de o usar — sem ele,
 * perde-se só a parte dos acentos.
 */
function normalizar(texto: string): string {
  const baixo = texto.toLowerCase();
  return typeof baixo.normalize === 'function'
    ? baixo.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    : baixo;
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      // Equal on both sides: that is what centres the bar on screen.
      marginHorizontal: 14,
      backgroundColor: theme.surface,
      // Cápsula bem arredondada, como a barra de pesquisa do Maps.
      borderRadius: 28,
      overflow: 'hidden',
      elevation: 6,
      shadowColor: '#000000',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    /**
     * The search open: no pill, no shadow, the whole width and height — the
     * screen behind is covered by `searchBackdrop` in `App.tsx`.
     */
    containerFocused: {
      marginHorizontal: 0,
      borderRadius: 0,
      elevation: 0,
      shadowOpacity: 0,
      flex: 1,
    },
    resultsFocused: {
      maxHeight: undefined,
      flex: 1,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 18,
    },
    input: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 16,
      color: theme.text,
    },
    settingsButton: {
      paddingLeft: 4,
    },
    /** The dot saying a new version is out, on the button's corner. */
    updateDot: {
      position: 'absolute',
      top: -1,
      right: -2,
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: theme.accent,
      // A border in the bar's colour cuts the dot out from the icon beneath.
      borderWidth: 1.5,
      borderColor: theme.surface,
    },
    error: {
      paddingHorizontal: 14,
      paddingBottom: 10,
      color: theme.danger,
      fontSize: 13,
    },
    results: {
      maxHeight: 240,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    result: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    resultName: {
      flexShrink: 1,
      fontSize: 15,
      fontWeight: '600',
      color: theme.text,
    },
    resultCategory: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.accent,
    },
    resultAddress: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 2,
    },
  });
}
