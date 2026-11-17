/**
 * What OpenStreetMap's API answers when a note is created
 * (`POST /api/0.6/notes.json`): a GeoJSON feature whose `properties.id` is the
 * note's number, the one in `openstreetmap.org/note/<id>`. Only what is read.
 */
export interface OsmNoteResponse {
  type: 'Feature';
  properties: {
    id: number;
    status?: string;
  };
}
