import * as crypto from 'crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import { Agent, AgentRequest, AgentResponse } from '../types';
import { normalizeMessage, formatResponseForChannel, TelegramRawData } from './normalize';

// ============================================================
// Secrets
// ============================================================

const telegramBotToken = defineSecret('TELEGRAM_BOT_TOKEN');
const telegramWebhookSecret = defineSecret('TELEGRAM_WEBHOOK_SECRET');

// ============================================================
// Helpers
// ============================================================

const db = () => getFirestore();

/**
 * Verify the X-Telegram-Bot-Api-Secret-Token header that Telegram
 * sends when a secret_token was configured on setWebhook.
 */
function verifyTelegramSignature(
  secretTokenHeader: string | undefined,
  expectedSecret: string,
): boolean {
  if (!secretTokenHeader || !expectedSecret) return false;
  return crypto.timingSafeEqual(
    Buffer.from(secretTokenHeader),
    Buffer.from(expectedSecret),
  );
}

/**
 * Resolve a Telegram user ID to a Firebase UID via the /users collection.
 * Returns null when no mapping exists.
 */
async function lookupFirebaseUid(telegramId: number): Promise<string | null> {
  const snap = await db()
    .collection('users')
    .where('telegramId', '==', telegramId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0].id;
}

/**
 * Find the agent configured for a given Telegram chat.
 */
async function findAgentForChat(chatId: number): Promise<Agent | null> {
  const snap = await db()
    .collection('agents')
    .where('channels.telegram.chatId', '==', String(chatId))
    .where('channels.telegram.enabled', '==', true)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Agent;
}

/**
 * Send a message back to Telegram via Bot API.
 */
async function sendTelegramMessage(
  chatId: number,
  text: string,
  replyToMessageId?: number,
): Promise<void> {
  const token = telegramBotToken.value();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
  };
  if (replyToMessageId) {
    body.reply_to_message_id = replyToMessageId;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    logger.error('Telegram sendMessage failed', { status: res.status, body: errBody });
  }
}

/**
 * Stub: route a NormalizedMessage through the agent pipeline.
 * Replace with the real agent router import when available.
 */
async function routeToAgent(request: AgentRequest): Promise<AgentResponse> {
  // TODO: import { routeAgentRequest } from '../agents/router';
  // return routeAgentRequest(request);
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

export const telegramWebhook = onRequest(
  {
    secrets: [telegramBotToken, telegramWebhookSecret],
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
      const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
      if (!verifyTelegramSignature(secretHeader, telegramWebhookSecret.value())) {
        logger.warn('Telegram webhook signature mismatch');
        res.status(403).send('Forbidden');
        return;
      }

      const update = req.body;

      // ---- Extract message or callback_query ----
      const message = update.message ?? update.callback_query?.message;
      const callbackData = update.callback_query?.data as string | undefined;
      const telegramUser = update.message?.from ?? update.callback_query?.from;

      if (!message || !telegramUser) {
        // Nothing actionable (edited_message, channel_post, etc.)
        res.status(200).send('OK');
        return;
      }

      const chatId: number = message.chat.id;
      const telegramUserId: number = telegramUser.id;

      // ---- User lookup ----
      const firebaseUid = await lookupFirebaseUid(telegramUserId);
      if (!firebaseUid) {
        logger.warn('No Firebase user for Telegram ID', { telegramUserId });
        await sendTelegramMessage(chatId, 'You are not registered\\. Please sign up first\\.');
        res.status(200).send('OK');
        return;
      }

      // ---- Agent lookup ----
      const agent = await findAgentForChat(chatId);
      if (!agent) {
        logger.warn('No active agent for Telegram chat', { chatId });
        await sendTelegramMessage(chatId, 'No agent is configured for this chat\\.');
        res.status(200).send('OK');
        return;
      }

      // ---- Build raw data and normalize ----
      const rawData: TelegramRawData = {
        messageId: message.message_id,
        chatId,
        userId: firebaseUid,
        agentId: agent.id,
        text: callbackData ?? message.text ?? message.caption ?? '',
        replyToMessageId: message.reply_to_message?.message_id,
        photos: message.photo,
        document: message.document
          ? {
              fileId: message.document.file_id,
              fileName: message.document.file_name ?? 'file',
              mimeType: message.document.mime_type ?? 'application/octet-stream',
              fileSize: message.document.file_size ?? 0,
            }
          : undefined,
      };

      const normalized = normalizeMessage('telegram', rawData);

      // ---- Forward to agent router ----
      const agentRequest: AgentRequest = {
        message: normalized,
        agent,
        conversationId: `tg_${chatId}`,
        idempotencyKey: `tg_${message.message_id}_${chatId}`,
      };

      const agentResponse = await routeToAgent(agentRequest);

      // ---- Reply to Telegram ----
      const formattedReply = formatResponseForChannel(agentResponse, 'telegram');
      await sendTelegramMessage(chatId, formattedReply, message.message_id);

      // ---- Acknowledge callback_query if present ----
      if (update.callback_query) {
        const token = telegramBotToken.value();
        await fetch(
          `https://api.telegram.org/bot${token}/answerCallbackQuery`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: update.callback_query.id }),
          },
        );
      }

      res.status(200).send('OK');
    } catch (err) {
      logger.error('telegramWebhook error', { error: err });
      res.status(500).send('Internal Server Error');
    }
  },
);
