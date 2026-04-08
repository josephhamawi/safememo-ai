import * as crypto from 'crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { Agent, AgentRequest, AgentResponse } from '../types';
import { normalizeMessage, formatResponseForChannel, SlackRawData } from './normalize';

// ============================================================
// Secrets
// ============================================================

const slackSigningSecret = defineSecret('SLACK_SIGNING_SECRET');
const slackBotToken = defineSecret('SLACK_BOT_TOKEN');

// ============================================================
// Helpers
// ============================================================

const db = () => getFirestore();

/**
 * Verify Slack request signature using HMAC-SHA256.
 *
 * Slack sends:
 *   X-Slack-Signature: v0=<hex_hash>
 *   X-Slack-Request-Timestamp: <epoch_seconds>
 *
 * The base string is: v0:<timestamp>:<rawBody>
 */
function verifySlackSignature(
  signingSecret: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  rawBody: string,
): boolean {
  if (!signatureHeader || !timestampHeader) return false;

  // Reject requests older than 5 minutes to prevent replay attacks
  const ts = parseInt(timestampHeader, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) {
    logger.warn('Slack request timestamp too old', { ts, now });
    return false;
  }

  const baseString = `v0:${timestampHeader}:${rawBody}`;
  const expectedSignature =
    'v0=' +
    crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signatureHeader),
  );
}

/**
 * Resolve a Slack user ID to a Firebase UID.
 */
async function lookupFirebaseUid(slackUserId: string): Promise<string | null> {
  const snap = await db()
    .collection('users')
    .where('slackId', '==', slackUserId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].id;
}

/**
 * Find the agent configured for a Slack channel.
 */
async function findAgentForChannel(channelId: string): Promise<Agent | null> {
  const snap = await db()
    .collection('agents')
    .where('channels.slack.channelId', '==', channelId)
    .where('channels.slack.enabled', '==', true)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Agent;
}

/**
 * Post a message via Slack Web API (chat.postMessage).
 */
async function sendSlackMessage(
  channel: string,
  text: string,
  threadTs?: string,
): Promise<void> {
  const token = slackBotToken.value();
  const url = 'https://slack.com/api/chat.postMessage';

  const body: Record<string, unknown> = {
    channel,
    text,
    mrkdwn: true,
  };
  if (threadTs) {
    body.thread_ts = threadTs;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    logger.error('Slack chat.postMessage HTTP error', { status: res.status, body: errBody });
    return;
  }

  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!json.ok) {
    logger.error('Slack chat.postMessage API error', { error: json.error });
  }
}

/**
 * Stub: route through agent pipeline.
 */
async function routeToAgent(request: AgentRequest): Promise<AgentResponse> {
  logger.info('routeToAgent called', { agentId: request.agent.id, messageId: request.message.id });
  return {
    messageId: uuidv4(),
    content: 'Agent response placeholder',
    toolCalls: [],
    memoryUpdates: {
      workingMemoryUpdated: false,
      episodicLogged: false,
      semanticStaged: [],
    },
    tokenUsage: { input: 0, output: 0 },
  };
}

// ============================================================
// Cloud Function
// ============================================================

export const slackWebhook = onRequest(
  {
    secrets: [slackSigningSecret, slackBotToken],
    maxInstances: 20,
    region: 'us-central1',
  },
  async (req, res) => {
    try {
      // ---- Method check ----
      if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
      }

      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      // ---- url_verification challenge ----
      if (payload.type === 'url_verification') {
        res.status(200).json({ challenge: payload.challenge });
        return;
      }

      // ---- Signature verification (skip for url_verification) ----
      const slackSig = req.headers['x-slack-signature'] as string | undefined;
      const slackTs = req.headers['x-slack-request-timestamp'] as string | undefined;

      if (!verifySlackSignature(slackSigningSecret.value(), slackSig, slackTs, rawBody)) {
        logger.warn('Slack webhook signature mismatch');
        res.status(403).send('Forbidden');
        return;
      }

      // ---- event_callback ----
      if (payload.type !== 'event_callback') {
        logger.info('Unhandled Slack event type', { type: payload.type });
        res.status(200).send('OK');
        return;
      }

      const event = payload.event;

      // Only handle message events (not subtypes like message_changed, bot_message, etc.)
      if (event?.type !== 'message' || event.subtype) {
        res.status(200).send('OK');
        return;
      }

      // Ignore bot messages to prevent loops
      if (event.bot_id || event.bot_profile) {
        res.status(200).send('OK');
        return;
      }

      const slackUserId: string = event.user;
      const channelId: string = event.channel;
      const messageTs: string = event.ts;
      const threadTs: string | undefined = event.thread_ts;

      // ---- User lookup ----
      const firebaseUid = await lookupFirebaseUid(slackUserId);
      if (!firebaseUid) {
        logger.warn('No Firebase user for Slack ID', { slackUserId });
        await sendSlackMessage(channelId, 'You are not registered. Please sign up first.', messageTs);
        res.status(200).send('OK');
        return;
      }

      // ---- Agent lookup ----
      const agent = await findAgentForChannel(channelId);
      if (!agent) {
        logger.warn('No active agent for Slack channel', { channelId });
        res.status(200).send('OK');
        return;
      }

      // ---- Build raw data and normalize ----
      const rawData: SlackRawData = {
        ts: messageTs,
        channelId,
        userId: firebaseUid,
        agentId: agent.id,
        text: event.text ?? '',
        threadTs,
        files: event.files?.map((f: any) => ({
          id: f.id,
          name: f.name ?? 'file',
          mimetype: f.mimetype ?? 'application/octet-stream',
          size: f.size ?? 0,
          urlPrivateDownload: f.url_private_download ?? f.url_private ?? '',
        })),
      };

      const normalized = normalizeMessage('slack', rawData);

      // ---- Forward to agent ----
      const agentRequest: AgentRequest = {
        message: normalized,
        agent,
        conversationId: `sl_${channelId}`,
        idempotencyKey: `sl_${messageTs}`,
      };

      const agentResponse = await routeToAgent(agentRequest);

      // ---- Reply via Slack ----
      const formatted = formatResponseForChannel(agentResponse, 'slack');
      // Reply in thread: use threadTs if we're already in one, otherwise start
      // a thread from the original message.
      await sendSlackMessage(channelId, formatted, threadTs ?? messageTs);

      res.status(200).send('OK');
    } catch (err) {
      logger.error('slackWebhook error', { error: err });
      res.status(500).send('Internal Server Error');
    }
  },
);
