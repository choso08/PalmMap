import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import { getContentUriAsync } from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Network from 'expo-network';
import axios from 'axios';

import { t } from '../i18n';
import { RELEASES_API_URL, REQUEST_TIMEOUT_MS, USER_AGENT } from './config';

/**
 * New versions, without having to go to GitHub by hand.
 *
 * The app asks GitHub whether there is a new version, downloads the APK and
 * hands it to Android's installer. **No key at all**: the repository is
 * public, and the Releases API answers anyone who asks — the same decision
 * that lets the country maps come from an address without authentication.
 *
 * ## What this is not, and it matters to say so
 *
 * **It does not install by itself.** Android does not allow it — installing
 * silently requires being the device-owner app, something for company phones.
 * What is done is everything that can be done: check, download and open the
 * installer with the file already in hand. The person is the one who presses
 * "Install".
 *
 * The first time, Android also asks whether to allow installs coming from
 * PalmMap. It is a per-app permission, given once, and without it the
 * installer closes without saying why — hence the message the panel shows.
 *
 * ## Why the build number is compared and not the version text
 *
 * The version comes from the workflow run number (`7.0.16` is the sixteenth),
 * and that same number goes into Android's `versionCode` and into the
 * Release's tag (`apk-16`). Comparing whole numbers has no special cases;
 * comparing `"7.0.9"` with `"7.0.10"` as text gives the wrong answer.
 */

/**
 * Is the phone on Wi-Fi with real Internet?
 *
 * It is what decides whether the new version downloads on its own. **It is a
 * few dozen megabytes**, and spending them on someone's mobile data without
 * asking is exactly what this project already decided not to do with the
 * country maps.
 *
 * `isInternetReachable` and not `isConnected`: being connected to a Wi-Fi
 * network does not mean reaching the outside. When in doubt the answer is no —
 * whoever really wants it presses the button, and then it is their decision.
 */
export async function onWifi(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.type === Network.NetworkStateType.WIFI && !!state.isInternetReachable;
  } catch {
    return false;
  }
}

/** What there is on the other side, when there is something. */
export interface UpdateInfo {
  /** The build number: 16 in `7.0.16`. This is what is compared. */
  build: number;
  /** The version as it reads: `7.0.16`. */
  version: string;
  /** Where the APK is downloaded from. */
  url: string;
  bytes: number;
  /** What changed, one entry per change, already clean of Markdown. */
  notes: string[];
}

/**
 * The Release's text turned into a plain list of changes.
 *
 * The body is Markdown written for the GitHub page: a "What changed" heading,
 * one `- ` line per commit, then an install section with the size and the
 * SHA-256. A `Text` shows Markdown as it is typed, so the update popup printed
 * a literal "## O que mudou" and a dash. Here only the changes are kept: the
 * section under the first heading that talks about changes (or every bullet,
 * when there is no heading), without markers, bold or code ticks.
 */
export function releaseNotes(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const isHeading = (l: string) => /^\s*#{1,6}\s/.test(l);
  const start = lines.findIndex(
    (l) => isHeading(l) && /mudou|changed|new|novidades/i.test(l),
  );
  let section = lines;
  if (start >= 0) {
    const rest = lines.slice(start + 1);
    const end = rest.findIndex(isHeading);
    section = end >= 0 ? rest.slice(0, end) : rest;
  } else {
    const end = lines.findIndex((l, i) => i > 0 && isHeading(l));
    section = end >= 0 ? lines.slice(0, end) : lines;
  }

  const clean = (l: string) =>
    l
      .replace(/^\s*[-*+]\s+/, '')
      .replace(/\*\*|__|`/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .trim();

  const bullets = section.filter((l) => /^\s*[-*+]\s+\S/.test(l)).map(clean);
  const items = bullets.length > 0 ? bullets : section.filter((l) => !isHeading(l)).map(clean);
  return items.filter((l) => l.length > 0);
}

export class UpdateError extends Error {}

/** The installed version, as it reads. */
export function currentVersion(): string {
  return Application.nativeApplicationVersion ?? '—';
}

/**
 * The installed build number.
 *
 * On Android it is the `versionCode`, which the workflow sets equal to the run
 * number. Returns 0 when it cannot be known — and then nothing is announced,
 * because announcing an update for not knowing the version is worse than
 * staying quiet.
 */
export function currentBuild(): number {
  const raw = Number(Application.nativeBuildVersion);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * Asks GitHub what the latest published version is.
 *
 * Returns `null` when already on the latest — and also when it is not known
 * which version is installed, for the reason given in `currentBuild()`.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const installed = currentBuild();
  if (installed === 0) {
    return null;
  }

  let list: Release[];
  try {
    const response = await axios.get<Release[]>(RELEASES_API_URL, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: {
        // GitHub refuses requests without a User-Agent. `Accept` pins the API
        // version, so a future change of format does not silently break this.
        'User-Agent': USER_AGENT,
        Accept: 'application/vnd.github+json',
      },
    });
    list = Array.isArray(response.data) ? response.data : [];
  } catch {
    throw new UpdateError(t().errors.updateCheckFailed);
  }

  // **Only the APK Releases.** This repository's other tags are the country
  // maps and the timetables — see the note on `RELEASES_API_URL`.
  //
  // The highest number is chosen, not the first in the list: the list comes by
  // date, and a Release fixed by hand may appear out of order.
  let best: UpdateInfo | null = null;
  for (const entry of list) {
    if (entry?.draft || entry?.prerelease) {
      continue;
    }

    // The tag is `apk-16`. The number comes from here, not from the Release's
    // name: the name is text written to be read, the tag is what the build
    // generates.
    const tag = String(entry?.tag_name ?? '');
    if (!/^apk-\d+$/.test(tag)) {
      continue;
    }
    const build = Number(tag.slice(4));
    if (build <= installed || (best && build <= best.build)) {
      continue;
    }

    // A Release without the APK inside is no use — and it happens if a build
    // fails halfway through uploading. Skip to the next.
    const apk = (entry.assets ?? []).find((a) => a?.name?.endsWith('.apk'));
    if (!apk?.browser_download_url) {
      continue;
    }

    best = {
      build,
      version: (entry.name ?? '').replace(/^PalmMap\s+/, '') || `7.0.${build}`,
      url: apk.browser_download_url,
      bytes: apk.size ?? 0,
      notes: releaseNotes(entry.body ?? ''),
    };
  }

  return best;
}

/**
 * Where the APK waits to be installed. The folder name (`atualizacao`,
 * "update") is a runtime name and stays as it is.
 */
const FOLDER = new Directory(Paths.cache, 'atualizacao');

/**
 * Downloads the new version's APK.
 *
 * It goes into the **cache** and not the documents, on purpose: it is a
 * forty-megabyte file that is only used once, and in the cache Android can
 * throw it away by itself if it needs the space. Leaving it in the documents
 * would keep forever the installer of a version already installed.
 *
 * Progress is reported **per whole percentage and not per chunk written** —
 * see the same note in `offlineMap.ts`, which is where that lesson was learnt.
 */
export async function downloadUpdate(
  info: UpdateInfo,
  onProgress?: (fraction: number) => void,
): Promise<File> {
  if (!FOLDER.exists) {
    FOLDER.create({ intermediates: true });
  }

  // Already here from an install that did not finish: hand it over again
  // instead of downloading forty megabytes a second time. Only a complete file
  // ever gets the `.apk` name, so its presence is enough.
  const existing = new File(FOLDER, `PalmMap-${info.build}.apk`);
  if (existing.exists) {
    onProgress?.(1);
    return existing;
  }

  // An installer from a previous version has no business taking up space here,
  // and having two APKs in the folder was an invitation to install the wrong
  // one.
  for (const old of FOLDER.list()) {
    old.delete();
  }

  const partial = new File(FOLDER, `PalmMap-${info.build}.apk.parcial`);
  let lastPercent = -1;

  try {
    const downloaded = await File.downloadFileAsync(info.url, partial, {
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes > 0 ? totalBytes : info.bytes;
        if (total <= 0) {
          return;
        }
        const fraction = Math.min(1, bytesWritten / total);
        const percent = Math.floor(fraction * 100);
        if (percent === lastPercent) {
          return;
        }
        lastPercent = percent;
        onProgress?.(fraction);
      },
    });

    // It only gets its final name at the end. A truncated APK called `.apk`
    // was handed to the installer and gave "there was a problem parsing the
    // package" — an error that has already cost this project time to
    // understand once.
    const destination = new File(FOLDER, `PalmMap-${info.build}.apk`);
    if (destination.exists) {
      destination.delete();
    }
    await downloaded.move(destination);
    return destination;
  } catch (error) {
    if (partial.exists) {
      partial.delete();
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new UpdateError(t().errors.updateDownloadFailed(detail));
  }
}

/**
 * The install that was attempted, kept until the new version is seen running.
 *
 * The installer is another app: opening it succeeds, and how it ends —
 * installed, cancelled, "problem parsing the package", blocked by Play
 * Protect — never comes back to us. So the attempt is written down before
 * opening it, and the next start compares it with the installed build. Equal
 * or higher: it worked, and the note goes. Lower: it did not finish, and the
 * app says so with a button to try again — from the file already downloaded.
 */
const PENDING_INSTALL_KEY = 'palmmap.instalacaoPendente';

async function markInstallAttempt(info: UpdateInfo): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_INSTALL_KEY, JSON.stringify(info));
  } catch {
    // Without the note the only loss is the "did not finish" notice.
  }
}

/** Forget the attempt — it worked, or the person said "not now". */
export async function forgetInstallAttempt(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_INSTALL_KEY);
  } catch {
    // Nothing to do.
  }
}

/** The version whose install was opened and did not finish, if any. */
export async function unfinishedInstall(): Promise<UpdateInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_INSTALL_KEY);
    if (!raw) {
      return null;
    }
    const info = JSON.parse(raw) as UpdateInfo;
    const installed = currentBuild();
    if (!info || typeof info.build !== 'number' || installed === 0 || installed >= info.build) {
      await forgetInstallAttempt();
      return null;
    }
    return { ...info, notes: Array.isArray(info.notes) ? info.notes : [] };
  } catch {
    return null;
  }
}

/**
 * Hands the APK to Android's installer.
 *
 * **It has to be a `content://` address, never `file://`.** Since Android 7,
 * passing a `file://` to another app blows up with `FileUriExposedException` —
 * and the installer is another app. `getContentUriAsync` returns the address
 * through the FileProvider Expo already configures, and flag `1`
 * (`FLAG_GRANT_READ_URI_PERMISSION`) is what gives the installer permission to
 * read a file that is ours. Without it the address exists and does not open.
 *
 * `ACTION_VIEW` with the package type is used, not `INSTALL_PACKAGE`: the
 * latter has been discouraged since Android 10.
 */
export async function installUpdate(file: File, info: UpdateInfo): Promise<void> {
  await markInstallAttempt(info);
  try {
    const address = await getContentUriAsync(file.uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: address,
      type: 'application/vnd.android.package-archive',
      flags: 1,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new UpdateError(t().errors.updateInstallFailed(detail));
  }
}

/**
 * Only the fields that are used, from GitHub's response.
 *
 * The names were read from a real response from this repository, not guessed
 * — the rule this project learnt the hard way with the Carris API. See "Read
 * the service's code instead of guessing the field names", in `CLAUDE.md`.
 */
interface Release {
  tag_name?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name?: string; size?: number; browser_download_url?: string }[];
}
