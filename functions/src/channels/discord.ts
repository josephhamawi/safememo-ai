import * as crypto from 'crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { Agent, AgentRequest, AgentResponse } from '../types';
import { normalizeMessage, formatResponseForChannel, DiscordRawData } from './normalize';

// ============================================================
// Secrets
// ============================================================

const discordPublicKey = defineSecret('DISCORD_PUBLIC_KEY');
const discordBotToken = defineSecret('DISCORD_BOT_TOKEN');
const discordApplicationId = defineSecret('DISCORD_APPLICATION_ID');

// ============================================================
// Constants - Discord Interaction Types
// ============================================================

const INTERACTION_PING = 1;
const INTERACTION_APPLICATION_COMMAND = 2;
const INTERACTION_MESSAGE_COMPONENT = 3;

const CALLBACK_PONG = 1;
const CALLBACK_CHANNEL_MESSAGE = 4;
const CALLBACK_DEFERRED_CHANNEL_MESSAGE = 5;

// ============================================================
// Helpers
// ============================================================

const db = () => getFirestore();

/**
 * Verify Discord interaction signature using Ed25519.
 * Discord sends the public key as hex; the signature is in the
 * X-Signature-Ed25519 header and the timestamp + body form the message.
 */
function verifyDiscordSignature(
  publicKeyHex: string,
  signature: string | undefined,
  timestamp: string | undefined,
  rawBody: string,
): boolean {
  if (!signature || !timestamp) return false;

  try {
    const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');
    const message = Buffer.from(timestamp + rawBody);

    return crypto.verify(
      null, // Ed25519 does not use a separate hash algorithm
      message,
      {
        key: crypto.createPublicKey({
          key: Buffer.concat([
            // Ed25519 DER public key prefix
            Buffer.from('302a300506032b6570032100', 'hex'),
            publicKeyBuffer,
          ]),
          format: 'der',
          type: 'spki',
        }),
      },
      signatureBuffer,
    );
  } catch (err) {
    logger.error('Discord signature verification error', { error: err });
    return false;
  }
}

/**
 * Resolve a Discord user ID to a Firebase UID.
 */
async function lookupFirebaseUid(discordId: string): Promise<string | null> {
  const snap = await db()
    .collection('users')
    .where('discordId', '==', discordId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].id;
}

/**
 * Find the agent configured for a Discord channel.
 */
async function findAgentForChannel(channelId: string): Promise<Agent | null> {
  const snap = await db()
    .collection('agents')
    .where('channels.discord.channelId', '==', channelId)
    .where('channels.discord.enabled', '==', true)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Agent;
}

/**
 * Send a follow-up message via Discord REST API.
 */
async function sendDiscordFollowup(
  interactionToken: string,
  content: string,
): Promise<void> {
  const appId = discordApplicationId.value();
  const url = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${discordBotToken.value()}`,
    },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    logger.error('Discord followup failed', { status: res.status, body: errBody });
  }
}

/**
 * Send a regular channel message via Discord REST API.
 */
async function sendDiscordMessage(
  channelId: string,
  content: string,
  messageReference?: string,
): Promise<void> {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

  const body: Record<string, unknown> = { content };
  if (messageReference) {
    body.message_reference = { message_id: messageReference };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${discordBotToken.value()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    logger.error('Discord sendMessage failed', { status: res.status, body: errBody });
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

export const discordWebhook = onRequest(
  {
    secrets: [discordPublicKey, discordBotToken, discordApplicationId],
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

      // ---- Signature verification ----
      const signature = req.headers['x-signature-ed25519'] as string | undefined;
      const timestamp = req.headers['x-signature-timestamp'] as string | undefined;
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      if (!verifyDiscordSignature(discordPublicKey.value(), signature, timestamp, rawBody)) {
        logger.warn('Discord webhook signature mismatch');
        res.status(401).send('Invalid signature');
        return;
      }

      const interaction = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

      // ---- PING (URL verification) ----
      if (interaction.type === INTERACTION_PING) {
        res.status(200).json({ type: CALLBACK_PONG });
        return;
      }

      // ---- Application command or message component ----
      if (
        interaction.type === INTERACTION_APPLICATION_COMMAND ||
        interaction.type === INTERACTION_MESSAGE_COMPONENT
      ) {
        const channelId: string = interaction.channel_id;
        const discordUser = interaction.member?.user ?? interaction.user;

        if (!discordUser) {
          res.status(200).json({
            type: CALLBACK_CHANNEL_MESSAGE,
            data: { content: 'Could not identify user.' },
          });
          return;
        }

        // ---- User lookup ----
        const firebaseUid = await lookupFirebaseUid(discordUser.id);
        if (!firebaseUid) {
          res.status(200).json({
            type: CALLBACK_CHANNEL_MESSAGE,
            data: { content: 'You are not registered. Please sign up first.' },
          });
          return;
        }

        // ---- Agent lookup ----
        const agent = await findAgentForChannel(channelId);
        if (!agent) {
          res.status(200).json({
            type: CALLBACK_CHANNEL_MESSAGE,
            data: { content: 'No agent is configured for this channel.' },
          });
          return;
        }

        // Immediately ACK with deferred response so Discord doesn't time out
        res.status(200).json({ type: CALLBACK_DEFERRED_CHANNEL_MESSAGE });

        // Extract content from the command or component
        const commandContent =
          interaction.data?.options?.[0]?.value ??
          interaction.data?.custom_id ??
          interaction.data?.name ??
          '';

        // ---- Build raw data and normalize ----
        const rawData: DiscordRawData = {
          messageId: interaction.id,
          channelId,
          guildId: interaction.guild_id,
          userId: firebaseUid,
          agentId: agent.id,
          content: commandContent,
          attachments: interaction.data?.resolved?.attachments
            ? Object.values(interaction.data.resolved.attachments as Record<string, any>).map(
                (a: any) => ({
                  id: a.id,
                  filename: a.filename,
                  contentType: a.content_type ?? 'application/octet-stream',
                  size: a.size,
                  url: a.url,
                }),
              )
            : undefined,
        };

        const normalized = normalizeMessage('discord', rawData);

        // ---- Forward to agent ----
        const agentRequest: AgentRequest = {
          message: normalized,
          agent,
          conversationId: `dc_${channelId}`,
          idempotencyKey: `dc_${interaction.id}`,
        };

        const agentResponse = await routeToAgent(agentRequest);

        // ---- Send follow-up ----
        const formatted = formatResponseForChannel(agentResponse, 'discord');
        await sendDiscordFollowup(interaction.token, formatted);
        return;
      }

      // ---- Unhandled interaction type ----
      logger.info('Unhandled Discord interaction type', { type: interaction.type });
      res.status(200).send('OK');
    } catch (err) {
      logger.error('discordWebhook error', { error: err });
      res.status(500).send('Internal Server Error');
    }
  },
);
