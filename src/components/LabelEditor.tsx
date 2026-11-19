import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import {
  LABEL_COLOURS,
  LABEL_ICONS,
  LABEL_INK,
  LABELS_MAX,
  addLabel,
  editLabel,
  isEmojiIcon,
  labelOf,
  lastGrapheme,
  removeLabel,
  setHomeWork,
  useLabels,
  type HomeWorkKind,
} from '../services/homeWork';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';
import type { Place } from '../types/geo';
import { useSwipeToClose } from '../useSwipeToClose';
import { LabelIcon } from './LabelIcon';

export interface LabelEditorTarget {
  /** The label being changed; absent for a new one. */
  kind?: HomeWorkKind;
  /** For a new label from a place's card: the place it points at already. */
  place?: Place;
}

interface Props {
  target: LabelEditorTarget | null;
  onClose: () => void;
  /** A label still without a place, or "Change place": open the place picker. */
  onPickPlace: (kind: HomeWorkKind) => void;
}

/**
 * A label of one's own, made as the person likes it (author: "if the tag
 * could really be customised", 19 November 2026): the name, a colour, and an
 * icon from the list or any emoji typed. Then its place — already known from
 * a place's card, else picked like Home and Work (`HomeWorkPicker`).
 */
export function LabelEditor({ target, onClose, onPickPlace }: Props) {
  const theme = useTheme();
  const strings = useT();
  const s = strings.labels;
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);
  const list = useLabels();
  const visible = target !== null;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('map-marker');
  const [colour, setColour] = useState<string>(LABEL_COLOURS[0]);
  const [emoji, setEmoji] = useState('');

  // Filled afresh each time it opens.
  const [openFor, setOpenFor] = useState<LabelEditorTarget | null>(null);
  if (openFor !== target) {
    setOpenFor(target);
    const existing = target?.kind ? labelOf(target.kind, list) : null;
    setName(existing?.name ?? '');
    setIcon(existing?.icon ?? 'map-marker');
    setColour(existing?.colour ?? LABEL_COLOURS[list.length % LABEL_COLOURS.length]);
    setEmoji(existing && isEmojiIcon(existing.icon) ? existing.icon : '');
  }

  const existing = target?.kind ? labelOf(target.kind, list) : null;
  const shownIcon = emoji.trim() ? emoji.trim() : icon;
  const canSave = name.trim().length > 0;

  const save = () => {
    if (!target || !canSave) {
      return;
    }
    if (target.kind && existing) {
      editLabel(target.kind, name, shownIcon, colour);
      onClose();
      return;
    }
    const kind = addLabel(name, shownIcon, colour, target.place ?? null);
    if (!kind) {
      Alert.alert(s.full(LABELS_MAX));
      return;
    }
    onClose();
    if (!target.place) {
      onPickPlace(kind);
    }
  };

  const swipe = useSwipeToClose(onClose, visible);

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
          <Text style={styles.title}>{existing ? s.editTitle : s.newTitle}</Text>
          <Pressable
            style={[styles.saveButton, !canSave && styles.off]}
            onPress={save}
            disabled={!canSave}
          >
            <Text style={styles.saveText}>{s.save}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* What it will look like. */}
          <View style={styles.preview}>
            <View style={[styles.previewIcon, { backgroundColor: colour }]}>
              <LabelIcon icon={shownIcon} size={30} colour={LABEL_INK} />
            </View>
            <Text style={styles.previewName} numberOfLines={1}>
              {name.trim() || s.namePlaceholder}
            </Text>
            {existing?.place || target?.place ? (
              <Text style={styles.previewPlace} numberOfLines={1}>
                {(existing?.place ?? target?.place)?.name}
              </Text>
            ) : null}
          </View>

          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={s.namePlaceholder}
            placeholderTextColor={theme.textMuted}
            maxLength={40}
            autoFocus={!existing}
          />

          <Text style={styles.section}>{s.colour}</Text>
          <View style={styles.wrap}>
            {LABEL_COLOURS.map((c) => (
              <Pressable
                key={c}
                style={[styles.colour, { backgroundColor: c }, colour === c && styles.colourOn]}
                onPress={() => setColour(c)}
                accessibilityState={{ selected: colour === c }}
              >
                {colour === c ? <MaterialCommunityIcons name="check" size={18} color={LABEL_INK} /> : null}
              </Pressable>
            ))}
          </View>

          <Text style={styles.section}>{s.icon}</Text>
          <View style={styles.wrap}>
            {LABEL_ICONS.map((i) => {
              const on = !emoji.trim() && icon === i;
              return (
                <Pressable
                  key={i}
                  style={[styles.iconCell, on && { backgroundColor: colour }]}
                  onPress={() => {
                    setIcon(i);
                    setEmoji('');
                  }}
                  accessibilityState={{ selected: on }}
                >
                  <MaterialCommunityIcons name={i as never} size={22} color={on ? LABEL_INK : theme.text} />
                </Pressable>
              );
            })}
          </View>
          <TextInput
            style={[styles.input, styles.emoji]}
            value={emoji}
            onChangeText={(text) => setEmoji(lastGrapheme(text))}
            placeholder={s.emojiPlaceholder}
            placeholderTextColor={theme.textMuted}
          />

          {existing ? (
            <>
              <Pressable
                style={styles.row}
                onPress={() => {
                  if (target?.kind) {
                    onClose();
                    onPickPlace(target.kind);
                  }
                }}
              >
                <MaterialCommunityIcons name="map-marker-radius" size={20} color={theme.accent} />
                <Text style={styles.rowText}>{existing.place ? s.changePlace : s.setPlace}</Text>
              </Pressable>
              {existing.place ? (
                <Pressable
                  style={styles.row}
                  onPress={() => target?.kind && setHomeWork(target.kind, null)}
                >
                  <MaterialCommunityIcons name="map-marker-off-outline" size={20} color={theme.textMuted} />
                  <Text style={styles.rowText}>{s.clearPlace}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.row}
                onPress={() =>
                  Alert.alert(s.deleteTitle(existing.name), undefined, [
                    { text: strings.common.cancel, style: 'cancel' },
                    {
                      text: s.delete,
                      style: 'destructive',
                      onPress: () => {
                        if (target?.kind) {
                          removeLabel(target.kind);
                        }
                        onClose();
                      },
                    },
                  ])
                }
              >
                <MaterialCommunityIcons name="delete-outline" size={20} color={theme.danger} />
                <Text style={[styles.rowText, { color: theme.danger }]}>{s.delete}</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function makeStyles(theme: Theme, insets: EdgeInsets) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background, paddingTop: insets.top + 8 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    title: { flex: 1, fontSize: 20, fontWeight: '700', color: theme.text },
    saveButton: {
      backgroundColor: theme.accent,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 18,
    },
    saveText: { color: theme.onAccent, fontWeight: '700' },
    off: { opacity: 0.4 },
    body: { padding: 16, paddingBottom: insets.bottom + 32, gap: 12 },
    preview: { alignItems: 'center', gap: 6, paddingVertical: 8 },
    previewIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewName: { fontSize: 18, fontWeight: '700', color: theme.text },
    previewPlace: { fontSize: 13, color: theme.textMuted },
    input: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.text,
    },
    emoji: { fontSize: 15 },
    section: {
      marginTop: 8,
      fontSize: 13,
      fontWeight: '700',
      color: theme.textMuted,
      textTransform: 'uppercase',
    },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    colour: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colourOn: { borderWidth: 3, borderColor: theme.text },
    iconCell: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
    rowText: { fontSize: 16, color: theme.text },
  });
}
