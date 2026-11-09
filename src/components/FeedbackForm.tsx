import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FEEDBACK_URL } from '../services/config';
import { currentVersion } from '../services/update';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

/**
 * Rate the app: stars and a comment.
 *
 * The app has no server of its own, so the form is sent as a pre-filled
 * GitHub issue (with the version), which the person confirms there. Nothing
 * leaves the phone until they do.
 */
export function FeedbackForm() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const s = useT().settings;
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');

  const send = () => {
    const title = `${s.feedbackTitle}: ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`;
    const body = `${text.trim()}\n\n---\nPalmMap ${currentVersion()}`;
    void Linking.openURL(
      `${FEEDBACK_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
    );
  };

  return (
    <View>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setStars(n)} hitSlop={6}>
            <MaterialCommunityIcons
              name={n <= stars ? 'star' : 'star-outline'}
              size={32}
              color={n <= stars ? theme.accent : theme.textMuted}
            />
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={s.feedbackPlaceholder}
        placeholderTextColor={theme.placeholder}
        multiline
      />
      <Pressable
        style={[styles.button, stars === 0 && styles.buttonOff]}
        disabled={stars === 0}
        onPress={send}
      >
        <MaterialCommunityIcons name="send" size={18} color={theme.onAccent} />
        <Text style={styles.buttonText}>{s.feedbackSend}</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    stars: {
      flexDirection: 'row',
      gap: 8,
      marginVertical: 8,
    },
    input: {
      minHeight: 80,
      borderRadius: 12,
      padding: 12,
      backgroundColor: theme.surfaceMuted,
      color: theme.text,
      fontSize: 15,
      textAlignVertical: 'top',
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 10,
      paddingVertical: 11,
      borderRadius: 22,
      backgroundColor: theme.accent,
    },
    buttonOff: {
      opacity: 0.4,
    },
    buttonText: {
      color: theme.onAccent,
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
