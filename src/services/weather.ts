import axios from 'axios';

import { OPEN_METEO_URL, REQUEST_TIMEOUT_MS, USER_AGENT, WEATHER_CACHE_MS } from './config';
import type { Coordinates } from '../types/geo';
import type { OpenMeteoForecast } from '../types/openMeteo';

/**
 * Rain at the destination around the arrival (author's request, November
 * 2026). One small request to Open-Meteo per destination, kept half an hour
 * per place rounded to two decimals (~1 km) — which is also all the precision
 * that leaves the phone. A failure is silent: no warning, nothing else lost.
 */
export interface RainAt {
  /** The hour it is for, seconds since 1970. */
  hour: number;
  /** Percent, when the model gives it. */
  probability: number | null;
  millimetres: number;
}

/** Worth a warning from here: likely, or clearly wet. */
const LIKELY_PERCENT = 50;
const WET_MM = 0.5;

const cache = new Map<string, { at: number; data: Promise<OpenMeteoForecast> }>();

function forecastFor(place: Coordinates): Promise<OpenMeteoForecast> {
  const lat = place.latitude.toFixed(2);
  const lon = place.longitude.toFixed(2);
  const key = `${lat},${lon}`;
  const known = cache.get(key);
  if (known && Date.now() - known.at < WEATHER_CACHE_MS) {
    return known.data;
  }
  const data = axios
    .get<OpenMeteoForecast>(OPEN_METEO_URL, {
      params: {
        latitude: lat,
        longitude: lon,
        hourly: 'precipitation_probability,precipitation',
        forecast_hours: 48,
        timeformat: 'unixtime',
      },
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT },
    })
    .then((r) => r.data);
  cache.set(key, { at: Date.now(), data });
  data.catch(() => cache.delete(key));
  return data;
}

/** Rain likely at `place` in the hour of `arrival` (seconds), or `null`. */
export async function rainAround(place: Coordinates, arrival: number): Promise<RainAt | null> {
  const f = await forecastFor(place);
  const hours = f.hourly?.time ?? [];
  const i = hours.findIndex((h) => h <= arrival && arrival < h + 3600);
  if (i < 0) {
    return null;
  }
  const probability = f.hourly?.precipitation_probability?.[i] ?? null;
  const millimetres = f.hourly?.precipitation?.[i] ?? 0;
  const likely = (probability ?? 0) >= LIKELY_PERCENT || millimetres >= WET_MM;
  return likely ? { hour: hours[i], probability, millimetres } : null;
}
