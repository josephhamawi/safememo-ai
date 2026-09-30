/**
 * Supported AI providers for bring-your-own-key.
 *
 * Every key is verified against the live provider before it is stored. The
 * shape check below is a fast fail for typos and paste errors only — it is
 * never the security boundary, because a well-formed string proves nothing.
 */

export type ProviderId = 'anthropic' | 'google' | 'openai';

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  /** Where the user goes to mint a key. Shown in the onboarding UI. */
  consoleUrl: string;
  /** Human-readable hint, e.g. "starts with sk-ant-". */
  formatHint: string;
  /** Cheap shape check. Catches typos; proves nothing about validity. */
  looksWellFormed(key: string): boolean;
  /** Default model used when an agent selects this provider. */
  defaultModel: string;
  /** Whether this provider can also produce embeddings for memory search. */
  supportsEmbeddings: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    formatHint: 'Starts with sk-ant-',
    looksWellFormed: (k) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k),
    defaultModel: 'claude-opus-5',
    supportsEmbeddings: false,
  },
  google: {
    id: 'google',
    label: 'Google (Gemini)',
    consoleUrl: 'https://aistudio.google.com/apikey',
    formatHint: 'Starts with AIza',
    looksWellFormed: (k) => /^AIza[A-Za-z0-9_-]{30,}$/.test(k),
    defaultModel: 'gemini-2.5-flash',
    supportsEmbeddings: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    consoleUrl: 'https://platform.openai.com/api-keys',
    formatHint: 'Starts with sk-',
    looksWellFormed: (k) => /^sk-[A-Za-z0-9_-]{20,}$/.test(k),
    defaultModel: 'gpt-4.1',
    supportsEmbeddings: true,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && value in PROVIDERS;
}

// ---------------------------------------------------------------------------
// Live verification
// ---------------------------------------------------------------------------

export type VerificationResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_key' | 'no_access' | 'rate_limited' | 'unreachable' };

const VERIFY_TIMEOUT_MS = 10_000;

/**
 * Confirm a key works by listing models — the cheapest authenticated call each
 * provider offers, and one that consumes no tokens.
 *
 * The key is passed as an argument and never logged. Callers must not include
 * the returned reason verbatim in a response that also echoes the key.
 */
export async function verifyKey(
  provider: ProviderId,
  apiKey: string,
): Promise<VerificationResult> {
  let url: string;
  let headers: Record<string, string>;

  switch (provider) {
    case 'anthropic':
      url = 'https://api.anthropic.com/v1/models?limit=1';
      headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
      break;
    case 'google':
      // Google takes the key as a query parameter. Encoded so a key containing
      // a reserved character cannot alter the URL structure.
      url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(apiKey)}`;
      headers = {};
      break;
    case 'openai':
      url = 'https://api.openai.com/v1/models';
      headers = { authorization: `Bearer ${apiKey}` };
      break;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch {
    // Network failure, DNS, or timeout. Distinct from a rejected key: the
    // caller may want to let the user retry rather than telling them the key
    // is bad.
    return { ok: false, reason: 'unreachable' };
  }

  if (response.ok) return { ok: true };

  switch (response.status) {
    case 401:
    case 403:
      return { ok: false, reason: 'invalid_key' };
    case 404:
      return { ok: false, reason: 'no_access' };
    case 429:
      return { ok: false, reason: 'rate_limited' };
    default:
      return { ok: false, reason: 'unreachable' };
  }
}

export function verificationMessage(
  provider: ProviderId,
  reason: Exclude<VerificationResult, { ok: true }>['reason'],
): string {
  const label = PROVIDERS[provider].label;
  switch (reason) {
    case 'invalid_key':
      return `${label} rejected this key. Check that you copied it in full and that it has not been revoked.`;
    case 'no_access':
      return `This ${label} key is valid but has no access to the models SafeMemo AI needs.`;
    case 'rate_limited':
      return `${label} is rate-limiting this key right now. Wait a moment and try again.`;
    case 'unreachable':
      return `Could not reach ${label}. Check this server's outbound network access and try again.`;
  }
}
