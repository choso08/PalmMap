import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text } from 'react-native';

import { isEmojiIcon } from '../services/homeWork';

/**
 * A label's icon: one of the font's, or the emoji the person typed.
 */
export function LabelIcon({ icon, size, colour }: { icon: string; size: number; colour: string }) {
  if (isEmojiIcon(icon)) {
    return <Text style={{ fontSize: size * 0.9, lineHeight: size * 1.15 }}>{icon}</Text>;
  }
  return <MaterialCommunityIcons name={icon as never} size={size} color={colour} />;
}
