/**
 * Weather section — Open-Meteo (free, no API key) + NWS alerts.
 * Location: Dacula, GA 30019 → lat 33.9946, lon -83.9163
 */

const LAT = 33.9946;
const LON = -83.9163;
const LOCATION_LABEL = 'Dacula, GA';

export interface WeatherData {
  location: string;
  current: {
    tempF: number;
    feelsLikeF: number;
    humidity: number;
    windMph: number;
    conditionLabel: string;
  };
  today: {
    highF: number;
    lowF: number;
    precipInches: number;
    conditionLabel: string;
  };
  tomorrow: {
    highF: number;
    lowF: number;
    precipInches: number;
    conditionLabel: string;
  };
  alerts: WeatherAlert[];
}

export interface WeatherAlert {
  event: string;
  headline: string;
  severity: string;
  ends: string | null;
}

/** Map WMO weather interpretation code to a human-readable label. */
function wmoLabel(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 65) return 'Rain';
  if (code <= 75) return 'Snow';
  if (code === 77) return 'Snow grains';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code <= 99) return 'Thunderstorm with hail';
  return 'Unknown';
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  daily: {
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
}

interface NWSAlertFeature {
  properties: {
    event: string;
    headline: string | null;
    severity: string;
    ends: string | null;
    areaDesc: string;
  };
}

interface NWSAlertsResponse {
  features: NWSAlertFeature[];
}

export async function fetchWeather(): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(LAT),
    longitude: String(LON),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'America/New_York',
    forecast_days: '2',
  });

  const [meteoRes, alertsRes] = await Promise.allSettled([
    fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: AbortSignal.timeout(8_000),
    }),
    fetch(
      `https://api.weather.gov/alerts/active?point=${LAT},${LON}`,
      { headers: { 'User-Agent': 'daily-brief/1.0 (aperry@latwoodtech.com)' }, signal: AbortSignal.timeout(8_000) },
    ),
  ]);

  if (meteoRes.status === 'rejected' || !meteoRes.value.ok) {
    throw new Error('Failed to fetch Open-Meteo weather');
  }

  const meteo = (await meteoRes.value.json()) as OpenMeteoResponse;
  const cur = meteo.current;
  const daily = meteo.daily;

  let alerts: WeatherAlert[] = [];
  if (alertsRes.status === 'fulfilled' && alertsRes.value.ok) {
    const nws = (await alertsRes.value.json()) as NWSAlertsResponse;
    alerts = (nws.features ?? [])
      .filter((f) => f.properties.severity !== 'Minor')
      .slice(0, 3)
      .map((f) => ({
        event: f.properties.event,
        headline: f.properties.headline ?? f.properties.event,
        severity: f.properties.severity,
        ends: f.properties.ends,
      }));
  }

  return {
    location: LOCATION_LABEL,
    current: {
      tempF: Math.round(cur.temperature_2m),
      feelsLikeF: Math.round(cur.apparent_temperature),
      humidity: Math.round(cur.relative_humidity_2m),
      windMph: Math.round(cur.wind_speed_10m),
      conditionLabel: wmoLabel(cur.weather_code),
    },
    today: {
      highF: Math.round(daily.temperature_2m_max[0] ?? 0),
      lowF: Math.round(daily.temperature_2m_min[0] ?? 0),
      precipInches: Number((daily.precipitation_sum[0] ?? 0).toFixed(2)),
      conditionLabel: wmoLabel(daily.weather_code[0] ?? 0),
    },
    tomorrow: {
      highF: Math.round(daily.temperature_2m_max[1] ?? 0),
      lowF: Math.round(daily.temperature_2m_min[1] ?? 0),
      precipInches: Number((daily.precipitation_sum[1] ?? 0).toFixed(2)),
      conditionLabel: wmoLabel(daily.weather_code[1] ?? 0),
    },
    alerts,
  };
}
