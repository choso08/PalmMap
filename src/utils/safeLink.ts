/**
 * Links that come from OpenStreetMap — anyone can edit them — before they are
 * handed to Android.
 *
 * `Linking.openURL` opens **any** scheme: a `website` tag set to another app's
 * deep link, `file:` or `content:` would open that instead of a page. Only web
 * addresses go out; a bare `www.example.pt` (common in OSM) gets `https://`.
 */
export function webLink(value: string | undefined): string | null {
  const v = (value ?? '').split(';')[0].trim();
  if (!v || /\s/.test(v)) {
    return null;
  }
  if (/^https?:\/\//i.test(v)) {
    return v;
  }
  // No scheme at all and something that looks like a host: a web address.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v) && /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(v)) {
    return `https://${v}`;
  }
  return null;
}

/**
 * A phone number for `tel:`: digits, `+` and spaces only, the first of
 * several. Keeps `*` and `#` (USSD codes) out of the dialer.
 */
export function telLink(value: string | undefined): string | null {
  const v = (value ?? '').split(/[;,]/)[0].replace(/[^\d+]/g, '');
  return /^\+?\d{3,}$/.test(v) ? `tel:${v}` : null;
}

/** A file name from a published manifest: no folders, no `..`. */
export function safeFileName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..');
}
