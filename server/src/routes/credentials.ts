/**
 * Bring-your-own-key credential endpoints.
 *
 * There is deliberately no endpoint that returns a stored key. Once saved, a
 * key is write-only from the API's perspective: it can be replaced or deleted,
 * never read back. A user who loses their key gets a new one from the
 * provider — that is strictly better than having an endpoint whose whole job
 * is to emit secrets.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import { requireUser } from '../middleware/auth';
import {
  deleteCredential,
  listCredentials,
  saveCredential,
} from '../providers/credentialStore';
import { PROVIDERS, PROVIDER_IDS, isProviderId } from '../providers/registry';

export const credentialsRouter = Router();

/**
 * Tight limit: each attempt makes an outbound call to the provider on the
 * user's behalf, so an unthrottled endpoint is both a credential-stuffing
 * oracle and a way to burn someone else's provider rate limit.
 */
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: { error: 'Too many key attempts. Try again in a few minutes.' },
});

const saveSchema = z.object({
  provider: z.string().refine(isProviderId, 'Unknown provider'),
  apiKey: z.string().min(8).max(512),
  label: z.string().max(80).optional(),
});

/** Provider catalogue for the onboarding UI. Public — no secrets involved. */
credentialsRouter.get('/providers', (_req, res) => {
  res.json({
    providers: PROVIDER_IDS.map((id) => {
      const p = PROVIDERS[id];
      return {
        id: p.id,
        label: p.label,
        consoleUrl: p.consoleUrl,
        formatHint: p.formatHint,
        defaultModel: p.defaultModel,
        supportsEmbeddings: p.supportsEmbeddings,
      };
    }),
  });
});

credentialsRouter.get('/', requireUser, async (req, res, next) => {
  try {
    res.json({ credentials: await listCredentials(req.user!.id) });
  } catch (err) {
    next(err);
  }
});

credentialsRouter.put('/', requireUser, writeLimiter, async (req, res, next) => {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });
    return;
  }

  const { provider, apiKey, label } = parsed.data;

  try {
    const result = await saveCredential({
      userId: req.user!.id,
      provider,
      apiKey,
      label,
    });

    if (!result.ok) {
      // 400 for a shape problem the user can fix by re-pasting; 422 for a key
      // the provider itself rejected.
      res.status(result.reason === 'malformed' ? 400 : 422).json({
        error: result.message,
        reason: result.reason,
      });
      return;
    }

    res
      .status(result.replaced ? 200 : 201)
      .json({ credential: result.credential, replaced: result.replaced });
  } catch (err) {
    next(err);
  }
});

credentialsRouter.delete('/:provider', requireUser, async (req, res, next) => {
  const provider = req.params.provider;
  if (!isProviderId(provider)) {
    res.status(404).json({ error: 'Unknown provider' });
    return;
  }

  try {
    const removed = await deleteCredential(req.user!.id, provider);
    if (!removed) {
      res.status(404).json({ error: 'No credential stored for that provider' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
