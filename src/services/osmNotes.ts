import axios from 'axios';

import type { Coordinates } from '../types/geo';
import type { OsmNoteResponse } from '../types/osmNote';
import { OSM_API_URL, OSM_NOTE_TIMEOUT_MS, USER_AGENT } from './config';

/**
 * Opens a note on OpenStreetMap at a place: "this shop closed", "the name
 * changed". Local mappers read the notes around them, check and fix the map,
 * and the fix reaches the app with the next tiles or country file.
 *
 * **Anonymous on purpose**: OpenStreetMap accepts notes without an account, so
 * nobody needs one and the app holds no credential. The note is public and
 * carries no name — only the text and the point.
 *
 * Only ever sent by a tap on "Send" in the card's report panel: one request per
 * person's decision, nothing automatic, so no queue is needed.
 */
export async function createOsmNote(at: Coordinates, text: string): Promise<number> {
  const response = await axios.post<OsmNoteResponse>(`${OSM_API_URL}/api/0.6/notes.json`, null, {
    params: {
      lat: at.latitude.toFixed(6),
      lon: at.longitude.toFixed(6),
      text,
    },
    headers: { 'User-Agent': USER_AGENT },
    timeout: OSM_NOTE_TIMEOUT_MS,
  });
  const id = response.data?.properties?.id;
  if (typeof id !== 'number') {
    throw new Error('OpenStreetMap did not return a note number');
  }
  return id;
}

/** The note's page, to see who answered and whether it was fixed. */
export function osmNoteUrl(id: number): string {
  return `https://www.openstreetmap.org/note/${id}`;
}
