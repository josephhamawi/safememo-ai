import '../../init';
import * as logger from 'firebase-functions/logger';
import { z } from 'zod';
import type { MCPToolResult } from '../../types';

export const getWeatherSchema = z.object({
  location: z.string().min(1),
  units: z.enum(['metric', 'imperial']).default('metric'),
});

export async function getWeather(
  location: string,
  units: 'metric' | 'imperial' = 'metric',
): Promise<MCPToolResult> {
  const apiKey = process.env.OPENWEATHER_API_KEY?.trim();
  if (!apiKey) {
    return {
      content: [{ type: 'text', text: 'Weather tool not configured: missing OPENWEATHER_API_KEY.' }],
      isError: true,
    };
  }

  try {
    const params = new URLSearchParams({
      q: location,
      appid: apiKey,
      units,
    });
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?${params}`);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        content: [{ type: 'text', text: `Weather lookup failed (${res.status}): ${errText.slice(0, 200)}` }],
        isError: true,
      };
    }

    const data = (await res.json()) as {
      name?: string;
      sys?: { country?: string };
      weather?: Array<{ description?: string; main?: string }>;
      main?: { temp?: number; feels_like?: number; humidity?: number; pressure?: number };
      wind?: { speed?: number; deg?: number };
      visibility?: number;
      clouds?: { all?: number };
    };

    const tempUnit = units === 'metric' ? '°C' : '°F';
    const speedUnit = units === 'metric' ? 'm/s' : 'mph';

    const text = [
      `Weather in ${data.name ?? location}${data.sys?.country ? ', ' + data.sys.country : ''}:`,
      `- Conditions: ${data.weather?.[0]?.description ?? 'unknown'}`,
      `- Temperature: ${data.main?.temp?.toFixed(1) ?? '?'}${tempUnit} (feels like ${data.main?.feels_like?.toFixed(1) ?? '?'}${tempUnit})`,
      `- Humidity: ${data.main?.humidity ?? '?'}%`,
      `- Wind: ${data.wind?.speed ?? '?'} ${speedUnit}`,
      data.clouds?.all !== undefined ? `- Cloud cover: ${data.clouds.all}%` : '',
    ].filter(Boolean).join('\n');

    return { content: [{ type: 'text', text }] };
  } catch (err) {
    logger.error('Weather tool error', err);
    return {
      content: [{ type: 'text', text: `Weather lookup failed: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
}
