import AsyncStorage from '@react-native-async-storage/async-storage';
import { reloadAppAsync } from 'expo';
import { Directory, File } from 'expo-file-system';
import { Alert, AppState, BackHandler, Platform } from 'react-native';

import { t } from '../i18n';

/**
 * A copy of what the person made in the app, kept as a file **outside** the
 * app, so it survives uninstalling (author's request, November 2026: "it
 * should keep a file on the phone by itself").
 *
 * Android deletes an app's own folders when it is uninstalled, and a file the
 * app put in Downloads stops being readable by it once reinstalled. What
 * survives both is a folder the person picks once (Android's folder picker,
 * the permission kept with `takePersistableUriPermission`): from then on the
 * copy is written there by itself, when the app goes to the background.
 * After reinstalling, "Restore a copy" opens that file and puts everything
 * back.
 *
 * What goes in: settings, saved places, Home and Work, favourite stops and
 * lines, recents, the parked car, the learnt pace, the trips started and the
 * last view. Not the country maps nor the timetables — big, and downloaded
 * again — nor what only makes sense on that install (a pending update, the
 * last crash).
 *
 * Nothing leaves the phone: the folder is the person's own (it may be one a
 * cloud app syncs, their choice).
 */
const KEPT_KEYS = [
  'palmmap.settings',
  'palmmap.favourites',
  'palmmap.casaTrabalho',
  'palmmap.etiquetas',
  'palmmap.paragensFavoritas',
  'palmmap.linhasFavoritas',
  'palmmap.recents',
  'palmmap.carroEstacionado',
  'palmmap.pace',
  'palmmap.viagensFeitas',
  'palmmap.ultimaVista',
  'palmmap.satelliteAltaPorDefeito',
] as const;

/** The folder chosen for the copy (a `content://` address). Not in the copy. */
const FOLDER_KEY = 'palmmap.pastaCopia';
/** When the copy was last written, for the Settings line. Not in the copy. */
const WRITTEN_KEY = 'palmmap.ultimaCopia';
/** The first-start offer to restore was made. Not in the copy. */
const OFFERED_KEY = 'palmmap.copiaOferecida';

/** The file's name in the chosen folder. */
export const BACKUP_FILE_NAME = 'PalmMap-copia.json';

interface BackupFile {
  app: 'PalmMap';
  version: 1;
  savedAt: number;
  data: Record<string, string>;
}

export interface BackupState {
  /** The chosen folder, or null before one is chosen. */
  folder: string | null;
  /** When the copy was last written (ms), or null. */
  writtenAt: number | null;
  /** The last write failed (the folder was removed, or access lost). */
  failed: boolean;
}

let state: BackupState = { folder: null, writtenAt: null, failed: false };
let loaded = false;
/**
 * A system picker is open. Opening one sends the app to the background, and
 * the copy written then replaced the very file about to be restored with what
 * the app held — the mistake being undone (code review, 19 November 2026).
 */
let picking = false;
const listeners = new Set<(s: BackupState) => void>();

function setState(next: Partial<BackupState>): void {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener(state));
}

/** The copy's state now and at each change. Returns the unsubscribe. */
export function watchBackup(listener: (s: BackupState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

async function load(): Promise<void> {
  if (loaded) {
    return;
  }
  loaded = true;
  const [[, folder], [, written]] = await AsyncStorage.multiGet([FOLDER_KEY, WRITTEN_KEY]);
  setState({ folder, writtenAt: written ? Number(written) : null });
}

/** The copy's content, from what is stored now. */
async function snapshot(): Promise<string> {
  const pairs = await AsyncStorage.multiGet([...KEPT_KEYS]);
  const data: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (value != null) {
      data[key] = value;
    }
  }
  const file: BackupFile = { app: 'PalmMap', version: 1, savedAt: Date.now(), data };
  return JSON.stringify(file);
}

/** A text's size in UTF-8 bytes, as it is written to the file. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function safeDecode(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

/** Whether a file in a picked folder is the copy. */
function isBackupFile(entry: File): boolean {
  // By its name where the provider gives one, else by the decoded address: in
  // a picked folder the address is a `content://` document id
  // ("…/document/primary%3ADocuments%2FPalmMap-copia.json"), and some
  // providers' ids (Downloads' "msf:123") never contain the name — matched by
  // the address alone, a new "PalmMap-copia (1).json" was made at each write.
  const named = (entry as File & { fileName?: string | null }).fileName;
  if (named) {
    return named === BACKUP_FILE_NAME;
  }
  return safeDecode(entry.uri).endsWith(`/${BACKUP_FILE_NAME}`) || entry.name === BACKUP_FILE_NAME;
}

function existingBackupIn(folder: Directory): File | null {
  return folder.list().find((entry): entry is File => entry instanceof File && isBackupFile(entry)) ?? null;
}

function backupFileIn(folder: Directory): File {
  return existingBackupIn(folder) ?? folder.createFile(BACKUP_FILE_NAME, 'application/json');
}

/** Writes the copy now, if a folder was chosen. Never throws. */
export async function writeBackupNow(): Promise<void> {
  try {
    await load();
    if (!state.folder || picking || restoredNow) {
      return;
    }
    const content = await snapshot();
    const file = backupFileIn(new Directory(state.folder));
    // Padded with spaces to the old file's size: a picked folder is written
    // with mode "w", which some Android storage providers do not truncate,
    // and a shorter copy would leave the old one's tail after it. JSON ignores
    // trailing spaces.
    const old = file.exists ? file.size : 0;
    const bytes = utf8Length(content);
    file.write(bytes < old ? content + ' '.repeat(old - bytes) : content);
    const now = Date.now();
    await AsyncStorage.setItem(WRITTEN_KEY, String(now));
    setState({ writtenAt: now, failed: false });
  } catch {
    // The folder was deleted or the access withdrawn: Settings says so, and
    // choosing a folder again fixes it.
    setState({ failed: true });
  }
}

/**
 * Asks for the folder (Android's picker) and keeps it. Returns the copy
 * already there, if any (`found`, with when it was saved), without writing
 * over it; otherwise writes the copy at once. `cancelled` when the person
 * backed out.
 */
export async function chooseBackupFolder(): Promise<
  { outcome: 'written' | 'cancelled' } | { outcome: 'found'; savedAt: number | null }
> {
  let folder: Directory;
  picking = true;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return { outcome: 'cancelled' };
  } finally {
    picking = false;
  }
  try {
    await AsyncStorage.setItem(FOLDER_KEY, folder.uri);
    loaded = true;
    setState({ folder: folder.uri, failed: false });
    // After reinstalling, the old folder holds the only copy of everything:
    // written over at once, it was replaced by the fresh install's nothing.
    const found = existingBackupIn(folder);
    if (found && found.size) {
      let savedAt: number | null = null;
      try {
        savedAt = (JSON.parse(await found.text()) as Partial<BackupFile>).savedAt ?? null;
      } catch {
        savedAt = null;
      }
      return { outcome: 'found', savedAt };
    }
    await writeBackupNow();
    return { outcome: 'written' };
  } catch {
    return { outcome: 'cancelled' };
  }
}

/**
 * "Choose folder" with what follows: a copy already there is restored or
 * replaced, as the person says.
 */
export async function chooseBackupFolderWithNotice(when: (ms: number) => string): Promise<void> {
  const chosen = await chooseBackupFolder();
  if (chosen.outcome !== 'found') {
    return;
  }
  const b = t().backup;
  Alert.alert(b.foundTitle, b.foundBody(chosen.savedAt ? when(chosen.savedAt) : '—'), [
    { text: b.foundReplace, onPress: () => void writeBackupNow() },
    { text: b.foundRestore, onPress: () => void restoreFromFolderWithNotice() },
  ]);
}

/**
 * Puts a copy back: the person picks the file.
 * Returns how it went; on `restored` the app must start again, since every
 * store read its value at start-up.
 */
export async function restoreBackup(): Promise<'restored' | 'cancelled' | 'invalid'> {
  let picked: File;
  picking = true;
  try {
    // Any type: some file managers label a .json as text or as nothing.
    const picked0 = await File.pickFileAsync({ mimeTypes: '*/*' });
    if (picked0.canceled || !picked0.result) {
      return 'cancelled';
    }
    picked = picked0.result;
  } catch {
    return 'cancelled';
  } finally {
    picking = false;
  }
  return restoreFrom(picked);
}

/** Restores the copy in the chosen folder, without a picker. */
async function restoreFromFolder(): Promise<'restored' | 'cancelled' | 'invalid'> {
  await load();
  if (!state.folder) {
    return 'cancelled';
  }
  try {
    const found = existingBackupIn(new Directory(state.folder));
    return found ? restoreFrom(found) : 'invalid';
  } catch {
    return 'invalid';
  }
}

async function restoreFrom(picked: File): Promise<'restored' | 'invalid'> {
  try {
    const parsed = JSON.parse(await picked.text()) as Partial<BackupFile>;
    if (parsed.app !== 'PalmMap' || parsed.version !== 1 || typeof parsed.data !== 'object' || !parsed.data) {
      return 'invalid';
    }
    // Only the keys a copy may carry: a file someone edited cannot write
    // anything else into the app.
    const allowed = new Set<string>(KEPT_KEYS);
    const pairs = Object.entries(parsed.data).filter(
      (entry): entry is [string, string] => allowed.has(entry[0]) && typeof entry[1] === 'string',
    );
    if (pairs.length === 0) {
      return 'invalid';
    }
    await AsyncStorage.multiSet(pairs);
    return 'restored';
  } catch {
    return 'invalid';
  }
}

/**
 * Whether to offer restoring once, at the first start of a fresh install:
 * nothing of ours stored yet, and not offered before.
 */
export async function shouldOfferRestore(): Promise<boolean> {
  try {
    // Anything the person made means this is not a fresh install (or an
    // older version updated): no offer, then or later.
    const pairs = await AsyncStorage.multiGet([
      OFFERED_KEY,
      'palmmap.settings',
      'palmmap.favourites',
      'palmmap.casaTrabalho',
      'palmmap.recents',
      'palmmap.pace',
      'palmmap.viagensFeitas',
    ]);
    const fresh = pairs.every(([, value]) => value == null);
    await AsyncStorage.setItem(OFFERED_KEY, '1');
    return fresh;
  } catch {
    return false;
  }
}

/**
 * Writes the copy each time the app goes to the background — what changed
 * meanwhile is in it, and writing nothing while in use costs nothing.
 * Called once at start-up; returns the unsubscribe.
 */
export function keepBackupUpToDate(): () => void {
  if (Platform.OS !== 'android') {
    return () => undefined;
  }
  void load().catch(() => undefined);
  const subscription = AppState.addEventListener('change', (next) => {
    if (next === 'background') {
      void writeBackupNow();
    }
  });
  return () => subscription.remove();
}

/**
 * "Restore a copy", with what follows said: on success the app starts again,
 * since every store read its value when it started — and, left running, wrote
 * that old value back over the restored one at its next change.
 * `BackHandler.exitApp()` only sent the app to the background with the same
 * JavaScript still running (code review, 19 November 2026); `reloadAppAsync`
 * starts the JavaScript afresh, release builds included.
 */
export async function restoreWithNotice(): Promise<void> {
  tellRestored(await restoreBackup());
}

async function restoreFromFolderWithNotice(): Promise<void> {
  tellRestored(await restoreFromFolder());
}

function tellRestored(outcome: 'restored' | 'cancelled' | 'invalid'): void {
  if (outcome === 'restored') {
    restoredNow = true;
    Alert.alert(t().settings.backupRestore, t().backup.restored, [
      { text: t().backup.ok, onPress: () => void startAgain() },
    ]);
  } else if (outcome === 'invalid') {
    Alert.alert(t().settings.backupRestore, t().backup.invalid);
  }
}

/**
 * Set once a copy has been put back: nothing more is written to the copy's
 * file (the stores still hold the old values until the restart).
 */
let restoredNow = false;

async function startAgain(): Promise<void> {
  try {
    await reloadAppAsync('backup restored');
  } catch {
    // Handled below.
  }
  // Still here: the reload is not available in this build. Closing is the
  // next best thing (the stores write nothing while nobody touches them).
  setTimeout(() => BackHandler.exitApp(), 1500);
}

/** Once, at the first start of a fresh install: offer to restore a copy. */
export async function offerRestoreOnFirstStart(): Promise<void> {
  if (Platform.OS !== 'android' || !(await shouldOfferRestore())) {
    return;
  }
  const b = t().backup;
  Alert.alert(b.offerTitle, b.offerBody, [
    { text: b.offerNo, style: 'cancel' },
    { text: t().settings.backupRestore, onPress: () => void restoreWithNotice() },
  ]);
}
