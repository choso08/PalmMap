/** Open-Meteo's `/v1/forecast` with `timeformat=unixtime` (probed November 2026). */
export interface OpenMeteoForecast {
  hourly?: {
    /** Seconds since 1970, one per hour. */
    time: number[];
    /** Percent; may hold `null` where the model has none. */
    precipitation_probability?: (number | null)[];
    /** Millimetres in that hour. */
    precipitation?: (number | null)[];
  };
}
