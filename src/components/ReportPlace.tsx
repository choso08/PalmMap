import { useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createOsmNote, osmNoteUrl } from '../services/osmNotes';
import { useTheme, useT } from '../settings';
import type { Theme } from '../theme';
import type { Place } from '../types/geo';

type Reason = 'gone' | 'renamed' | 'hours' | 'other';
const REASONS: Reason[] = ['gone', 'renamed', 'hours', 'other'];

/**
 * "Report" on a place's card: says what is wrong and sends it to OpenStreetMap
 * as a note at the place (`createOsmNote`), where local mappers fix the map.
 * Nothing leaves the phone until "Send"; a second tap while sending does
 * nothing. The note is written in the app's language with the place's name and
 * kind, so a mapper knows which pin is meant.
 */
export function ReportPlace({ place, onDone }: { place: Place; onDone: () => void }) {
  const theme = useTheme();
  const strings = useT();
  const s = strings.place;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [reason, setReason] = useState<Reason | null>(null);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [noteId, setNoteId] = useState<number | null>(null);
  const busy = useRef(false);

  const canSend = !!reason && (reason !== 'other' || comment.trim().length > 0);

  const send = () => {
    if (!reason || !canSend || busy.current) {
      return;
    }
    busy.current = true;
    setState('sending');
    const text = s.reportNote(s.reportReasons[reason], place.name, place.category ?? '', comment.trim());
    createOsmNote(place.coordinates, text)
      .then((id) => {
        setNoteId(id);
        setState('sent');
      })
      .catch(() => {
        busy.current = false;
        setState('failed');
      });
  };

  if (state === 'sent') {
    return (
      <View style={styles.box}>
        <Text style={styles.sent}>{s.reportSent}</Text>
        <View style={styles.row}>
          {noteId !== null ? (
            <Pressable
              onPress={() => void Linking.openURL(osmNoteUrl(noteId)).catch(() => undefined)}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            >
              <Text style={styles.buttonText}>{s.reportSee}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onDone} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>{strings.common.close}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{s.reportTitle}</Text>
      <View style={styles.chips}>
        {REASONS.map((r) => (
          <Pressable
            key={r}
            onPress={() => setReason(r)}
            style={[styles.chip, reason === r && styles.chipOn]}
          >
            <Text style={[styles.chipText, reason === r && styles.chipTextOn]}>{s.reportReasons[r]}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder={s.reportComment}
        placeholderTextColor={theme.placeholder}
        style={styles.input}
        multiline
        maxLength={500}
      />
      <Text style={styles.hint}>{s.reportPublic}</Text>
      {state === 'failed' ? <Text style={styles.error}>{s.reportFailed}</Text> : null}
      <View style={styles.row}>
        <Pressable onPress={onDone} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{strings.common.cancel}</Text>
        </Pressable>
        <Pressable
          onPress={send}
          disabled={!canSend || state === 'sending'}
          style={({ pressed }) => [
            styles.button,
            styles.primary,
            (!canSend || state === 'sending') && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonText, styles.primaryText]}>
            {state === 'sending' ? s.reportSending : s.reportSend}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    box: {
      marginTop: 12,
      marginHorizontal: 20,
      padding: 14,
      borderRadius: 14,
      backgroundColor: theme.surfaceMuted,
      gap: 10,
    },
    title: { fontSize: 15, fontWeight: '700', color: theme.text },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    chipOn: { backgroundColor: theme.accent, borderColor: theme.accent },
    chipText: { fontSize: 13, fontWeight: '600', color: theme.text },
    chipTextOn: { color: theme.onAccent },
    input: {
      minHeight: 44,
      maxHeight: 110,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: theme.text,
      textAlignVertical: 'top',
    },
    hint: { fontSize: 12, color: theme.textMuted },
    error: { fontSize: 13, color: theme.danger, fontWeight: '600' },
    sent: { fontSize: 15, fontWeight: '700', color: theme.open },
    row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    button: {
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    primary: { backgroundColor: theme.accent, borderColor: theme.accent },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.7 },
    buttonText: { fontSize: 14, fontWeight: '600', color: theme.accent },
    primaryText: { color: theme.onAccent },
  });
}
