import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { t } from '../i18n';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SEARCH_DEBOUNCE_MS } from '../services/config';
import { searchLines, type TransitLineInfo } from '../services/transit';
import { operatorColour, textOn } from '../utils/lineColour';
import { isSamePlace } from '../services/favourites';
import { useHomeWork, useLabels, type HomeWorkKind } from '../services/homeWork';
import { LabelIcon } from './LabelIcon';
import { useParkedCar } from '../services/parkedCar';
import { SwipeToRemove } from './SwipeToRemove';
import { searchPlaces } from '../services/nominatim';
import { mark, since } from '../services/perfLog';
import { listenOnce, voiceAvailable } from '../services/voiceInput';
import { useTheme, useT } from '../settings';
import type { Theme } from '../theme';
import type { Bounds, Place } from '../types/geo';

interface SearchBarProps {
  onSelect: (place: Place) => void;
  /** A transport line chosen from the results ("3601"). */
  onSelectLine?: (line: TransitLineInfo) => void;
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
  /** Forget one recent destination: swiped sideways, or its ✕. */
  onRemoveRecent?: (place: Place) => void;
  /** Saved places, shown while nothing is typed. */
  favourites: Place[];
  /** Recent destinations, shown after the saved ones. */
  recents: Place[];
  /** Each change puts the cursor in the box (the route panel's "Add stop"). */
  focusRequest?: number;
  /** A new number closes the search (Android's back button, from `App`). */
  blurRequest?: number;
  /** The "Car" shortcut of the empty search: walk to the parked car. */
  onGoToCar?: () => void;
  /** Home or Work not set yet, tapped in the empty search: set it. */
  onSetHomeWork?: (kind: HomeWorkKind) => void;
  /** The box's hint instead of the usual one (choosing a stop). */
  placeholder?: string;
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
  onSelectLine,
  onOpenSettings,
  onOpenDirections,
  favourites,
  recents,
  focusRequest,
  blurRequest,
  onGoToCar,
  onSetHomeWork,
  placeholder,
  getBounds,
  updateAvailable = false,
  onFocusChange,
  onRemoveRecent,
}: SearchBarProps) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [query, setQuery] = useState('');

  /** True while the box is in use, to show the saved places. */
  const [focused, setFocusedState] = useState(false);
  const homeWork = useHomeWork();
  const labels = useLabels();
  const parkedCar = useParkedCar();
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
  /** Hidden until known, and for good on a phone without speech recognition. */
  const [hasVoice, setHasVoice] = useState(false);
  useEffect(() => {
    void voiceAvailable().then(setHasVoice);
  }, []);

  /**
   * Transport lines matching the text ("3601", "Cova da Piedade"). No
   * Nominatim here: the list of lines is asked once and filtered on the phone,
   * so it follows every keystroke.
   */
  const [lineResults, setLineResults] = useState<TransitLineInfo[]>([]);
  const inputRef = useRef<TextInput>(null);
  /**
   * "Add stop" in the route panel asks for the box: it is emptied (it still
   * held the destination's name, which came first in the list) and the cursor
   * goes there. Only on a change — not when the bar mounts again after
   * navigating, which would open the search by itself.
   */
  const lastFocusRequest = useRef(focusRequest);
  useEffect(() => {
    if (!focusRequest || focusRequest === lastFocusRequest.current) {
      return;
    }
    lastFocusRequest.current = focusRequest;
    escolhido.current = null;
    setQuery('');
    setResults([]);
    setLineResults([]);
    inputRef.current?.focus();
  }, [focusRequest]);

  const lastBlurRequest = useRef(blurRequest);
  useEffect(() => {
    if (!blurRequest || blurRequest === lastBlurRequest.current) {
      return;
    }
    lastBlurRequest.current = blurRequest;
    setFocused(false);
    Keyboard.dismiss();
  }, [blurRequest, setFocused]);
  useEffect(() => {
    if (!onSelectLine || query === escolhidoLinha.current) {
      setLineResults([]);
      return;
    }
    let cancelled = false;
    searchLines(query)
      .then((found) => {
        if (!cancelled) {
          setLineResults(found);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLineResults([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [query, onSelectLine]);
  const escolhidoLinha = useRef<string | null>(null);

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

  /** Fill the box with what was said, and search straight away, as Enter does. */
  const handleVoice = async () => {
    try {
      const heard = await listenOnce();
      if (heard) {
        setFocused(true);
        setQuery(heard);
        void runSearch(heard);
      }
    } catch {
      // No recogniser on this phone: the microphone goes, and stays gone.
      setHasVoice(false);
    }
  };

  const handleSelectLine = (line: TransitLineInfo) => {
    escolhido.current = line.short;
    escolhidoLinha.current = line.short;
    latestSearch.current += 1;
    setLoading(false);
    setQuery(line.short);
    setResults([]);
    setLineResults([]);
    setFocused(false);
    Keyboard.dismiss();
    onSelectLine?.(line);
  };

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
  const linesShown = focused && !parado ? lineResults : [];

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
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder ?? strings.search.placeholder}
          placeholderTextColor={theme.placeholder}
          returnKeyType="search"
          onFocus={() => {
            mark('search: focus');
            setFocused(true);
          }}
          onSubmitEditing={() => void runSearch(query)}
        />

        {loading ? <ActivityIndicator size="small" color={theme.accent} /> : null}

        {/* Clear the text, when there is some. */}
        {query.length > 0 && !loading ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
          </Pressable>
        ) : null}

        {/* Search by voice, when the box is empty. */}
        {hasVoice && query.length === 0 && !loading ? (
          <Pressable
            onPress={() => void handleVoice()}
            hitSlop={10}
            accessibilityLabel={strings.search.voice}
          >
            <MaterialCommunityIcons name="microphone" size={21} color={theme.textMuted} />
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

      {/*
        The empty search starts with the places one goes to most, as in Maps:
        Home, Work and the parked car, one tap each. Only those set.
      */}
      {parado && (homeWork.home || homeWork.work || onSetHomeWork || labels.some((l) => l.place) || (parkedCar && onGoToCar)) ? (
        <View style={styles.shortcuts}>
          {(['home', 'work'] as const).map((kind) => {
            const place = homeWork[kind];
            // Not set yet: the chip says so and sets it, as Maps' "Home · Set
            // location".
            return place || onSetHomeWork ? (
              <Pressable
                key={kind}
                style={styles.shortcut}
                onPress={() => {
                  if (place) {
                    handleSelect(place);
                  } else {
                    setFocused(false);
                    Keyboard.dismiss();
                    onSetHomeWork?.(kind);
                  }
                }}
                onLongPress={
                  onSetHomeWork
                    ? () => {
                        setFocused(false);
                        Keyboard.dismiss();
                        onSetHomeWork(kind);
                      }
                    : undefined
                }
              >
                <MaterialCommunityIcons
                  name={kind === 'home' ? 'home' : 'briefcase'}
                  size={16}
                  color={theme.accent}
                />
                <Text style={styles.shortcutText}>
                  {place ? strings.saved[kind] : `${strings.saved[kind]} · ${strings.saved.set}`}
                </Text>
              </Pressable>
            ) : null;
          })}
          {/* The person's own labels with a place, in their colour. */}
          {labels
            .filter((l) => l.place)
            .map((l) => (
              <Pressable
                key={l.id}
                style={styles.shortcut}
                onPress={() => l.place && handleSelect(l.place)}
              >
                <LabelIcon icon={l.icon} size={16} colour={l.colour} />
                <Text style={styles.shortcutText}>{l.name}</Text>
              </Pressable>
            ))}
          {parkedCar && onGoToCar ? (
            <Pressable
              style={styles.shortcut}
              onPress={() => {
                setFocused(false);
                Keyboard.dismiss();
                onGoToCar();
              }}
            >
              <MaterialCommunityIcons name="car" size={16} color={theme.accent} />
              <Text style={styles.shortcutText}>{strings.parked.car}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {list.length > 0 || linesShown.length > 0 ? (
        <FlatList
          style={[styles.results, focused && styles.resultsFocused]}
          onLayout={() => since('search: list on screen', 'search: focus')}
          data={list}
          ListHeaderComponent={
            linesShown.length > 0 ? (
              <View>
                {linesShown.map((line) => {
                  const bg = line.colour ?? operatorColour('carris-metropolitana', theme.vehicle);
                  return (
                    <Pressable
                      key={line.id}
                      style={[styles.result, styles.lineResult]}
                      onPress={() => handleSelectLine(line)}
                    >
                      <View style={[styles.lineBadge, { backgroundColor: bg }]}>
                        <MaterialCommunityIcons
                          name="bus"
                          size={13}
                          color={line.textColour ?? textOn(bg)}
                        />
                        <Text style={[styles.lineBadgeText, { color: line.textColour ?? textOn(bg) }]}>
                          {line.short}
                        </Text>
                      </View>
                      <Text style={styles.resultAddress} numberOfLines={2}>
                        {line.long}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null
          }
          keyExtractor={({ place }, i) => `${place.id}-${i}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: { place, guardado, local }, index }) => {
            const row = (
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
              {local && !guardado && onRemoveRecent ? (
                <Pressable
                  style={styles.removeRecent}
                  onPress={() => onRemoveRecent(place)}
                  hitSlop={10}
                  accessibilityLabel={strings.search.removeRecent}
                >
                  <MaterialCommunityIcons name="close" size={16} color={theme.textMuted} />
                </Pressable>
              ) : null}
            </Pressable>
            );
            // Recent destinations go away with a sideways swipe, as in Maps.
            return (
              <FadeIn index={index}>
                {local && !guardado && onRemoveRecent ? (
                  <SwipeToRemove onRemove={() => onRemoveRecent(place)}>{row}</SwipeToRemove>
                ) : (
                  row
                )}
              </FadeIn>
            );
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * A row eases in — a fade and a short rise, one after the other (author,
 * 19 November 2026: the list "appears very bluntly"). Only on mounting: a row
 * already shown does not move again. Native driver, so a busy JavaScript
 * thread does not stutter it.
 */
const FADE_MS = 180;
const FADE_STAGGER_MS = 35;
const FADE_STAGGER_MAX = 8;
function FadeIn({ index, children }: { index: number; children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: FADE_MS,
      delay: Math.min(index, FADE_STAGGER_MAX) * FADE_STAGGER_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, index]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
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
    lineResult: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    lineBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    lineBadgeText: {
      fontSize: 13,
      fontWeight: '800',
    },
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
    shortcuts: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    shortcut: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    shortcutText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500',
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
    removeRecent: {
      position: 'absolute',
      right: 12,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    result: {
      paddingRight: 40,
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
