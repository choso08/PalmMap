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
   * A área que o mapa está a mostrar, para a pesquisa preferir o que está perto.
   *
   * Vem como função e não como valor porque só interessa no momento em que se
   * pesquisa — se fosse um valor, cada arrastar do mapa redesenhava isto tudo.
   */
  getBounds: () => Bounds | null;
  onOpenSettings: () => void;
  /** Sítios guardados, mostrados enquanto não se escreve nada. */
  favourites: Place[];
  /** Últimos destinos, mostrados a seguir aos guardados. */
  recents: Place[];
}

/**
 * Barra de pesquisa de moradas e negócios.
 *
 * Importante: não pesquisa a cada tecla escrita. Espera que a pessoa pare de
 * escrever (SEARCH_DEBOUNCE_MS) ou que carregue em Enter — é uma exigência das
 * regras de utilização do Nominatim, não uma preferência de interface.
 */
export function SearchBar({
  onSelect,
  onOpenSettings,
  favourites,
  recents,
  getBounds,
}: SearchBarProps) {
  const theme = useTheme();
  const strings = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [query, setQuery] = useState('');
  /** Verdadeiro enquanto a caixa está em uso, para mostrar os favoritos. */
  const [focused, setFocused] = useState(false);
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
      const places = await searchPlaces(term, 8, getBounds());
      // Se entretanto já houve outra pesquisa, esta resposta não interessa.
      if (searchId === latestSearch.current) {
        setResults(places);
      }
    } catch {
      if (searchId === latestSearch.current) {
        setError(t().search.failed);
        setResults([]);
      }
    } finally {
      if (searchId === latestSearch.current) {
        setLoading(false);
      }
    }
  }, [getBounds]);

  // O atraso que evita pesquisar a cada tecla escrita.
  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const handleSelect = (place: Place) => {
    setQuery(place.name);
    setResults([]);
    setFocused(false);
    Keyboard.dismiss();
    onSelect(place);
  };

  // Sem nada escrito, a lista mostra os sítios guardados e depois os últimos
  // destinos. É o que dá jeito quando não há rede: ambos estão no telemóvel e a
  // pesquisa não. Um sítio que seja as duas coisas aparece só uma vez, como
  // guardado — que é a marca mais forte das duas.
  const parado = query.trim().length === 0 && focused;
  const sugestoes = parado
    ? [
        ...favourites.map((place) => ({ place, guardado: true })),
        ...recents
          .filter((r) => !favourites.some((f) => isSamePlace(f, r)))
          .map((place) => ({ place, guardado: false })),
      ]
    : results.map((place) => ({ place, guardado: false }));

  const showingSuggestions = parado && sugestoes.length > 0;
  const list = showingSuggestions || !parado ? sugestoes : [];

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <MaterialCommunityIcons name="magnify" size={22} color={theme.textMuted} />

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

        {/* Limpar o que está escrito, quando há alguma coisa. */}
        {query.length > 0 && !loading ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={20} color={theme.textMuted} />
          </Pressable>
        ) : null}

        <Pressable onPress={onOpenSettings} hitSlop={10} style={styles.settingsButton}>
          <MaterialCommunityIcons name="tune-variant" size={20} color={theme.textMuted} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {list.length > 0 ? (
        <FlatList
          style={styles.results}
          data={list}
          keyExtractor={({ place }, i) => `${place.id}-${i}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: { place, guardado } }) => (
            <Pressable style={styles.result} onPress={() => handleSelect(place)}>
              <View style={styles.resultHeader}>
                {parado ? (
                  <MaterialCommunityIcons
                    name={guardado ? 'star' : 'history'}
                    size={15}
                    color={guardado ? theme.poi : theme.textMuted}
                  />
                ) : null}
                <Text style={styles.resultName} numberOfLines={1}>
                  {place.name}
                </Text>
                {/* O tipo de negócio, quando o OpenStreetMap o sabe. */}
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

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    container: {
      // Igual dos dois lados: é o que faz a barra ficar ao meio do ecrã.
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
