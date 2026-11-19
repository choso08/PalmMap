import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { perfEntries, watchPerf, type PerfEntry } from '../services/perfLog';
import { useT, useTheme } from '../settings';
import type { Theme } from '../theme';

/**
 * The performance log (`perfLog.ts`), newest first, for a screenshot: what
 * blocked the app and for how long. In memory only; empty after a restart.
 */
export function PerfCard({ visible }: { visible: boolean }) {
  const theme = useTheme();
  const s = useT().settings;
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [entries, setEntries] = useState<PerfEntry[]>([]);
  useEffect(() => {
    if (!visible) {
      return;
    }
    setEntries(perfEntries());
    return watchPerf(() => setEntries(perfEntries()));
  }, [visible]);

  if (entries.length === 0) {
    return null;
  }
  const time = (at: number) => {
    const d = new Date(at);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{s.perfTitle}</Text>
      {[...entries].reverse().slice(0, 25).map((e, i) => (
        <Text key={`${e.at}-${i}`} style={[styles.line, (e.ms ?? 0) >= 1000 && styles.bad]}>
          {time(e.at)}  {e.label}{e.ms != null ? `  ${e.ms} ms` : ''}
        </Text>
      ))}
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: { marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: theme.surfaceMuted },
    title: { fontSize: 13, fontWeight: '700', color: theme.textMuted, marginBottom: 4 },
    line: { fontSize: 11, color: theme.text, fontFamily: 'monospace' },
    bad: { color: theme.danger, fontWeight: '700' },
  });
}
