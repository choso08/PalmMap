import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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
import { searchPlaces } from '../services/nominatim';
import { useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Place } from '../types/geo';

interface SearchBarProps {
  onSelect: (place: Place) => void;
  onOpenSettings: () => void;
}

/**
 * Barra de pesquisa de moradas e negócios.
 *
 * Importante: não pesquisa a cada tecla escrita. Espera que a pessoa pare de
 * escrever (SEARCH_DEBOUNCE_MS) ou que carregue em Enter — é uma exigência das
 * regras de utilização do Nominatim, não uma preferência de interface.
 */
export function SearchBar({ onSelect, onOpenSettings }: SearchBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [query, setQuery] = useState('');
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
      const places = await searchPlaces(term);
      // Se entretanto já houve outra pesquisa, esta resposta não interessa.
      if (searchId === latestSearch.current) {
        setResults(places);
      }
    } catch {
      if (searchId === latestSearch.current) {
        setError('Não foi possível pesquisar. Verifique a ligação à Internet.');
        setResults([]);
      }
    } finally {
      if (searchId === latestSearch.current) {
        setLoading(false);
      }
    }
  }, []);

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
    Keyboard.dismiss();
    onSelect(place);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <MaterialCommunityIcons name="magnify" size={22} color={theme.textMuted} />

        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Pesquisar aqui"
          placeholderTextColor={theme.placeholder}
          returnKeyType="search"
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

      {results.length > 0 ? (
        <FlatList
          style={styles.results}
          data={results}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.result} onPress={() => handleSelect(item)}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultName} numberOfLines={1}>
                  {item.name}
                </Text>
                {/* O tipo de negócio, quando o OpenStreetMap o sabe. */}
                {item.category ? <Text style={styles.resultCategory}>{item.category}</Text> : null}
              </View>
              <Text style={styles.resultAddress} numberOfLines={1}>
                {item.address}
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
