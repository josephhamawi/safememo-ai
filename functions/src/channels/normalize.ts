import { Timestamp } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import {
  NormalizedMessage,
  ChannelSource,
  Attachment,
  AgentResponse,
} from '../types';

// ============================================================
// Raw payload shapes from each channel
// ============================================================

export interface TelegramRawData {
  messageId: number;
  chatId: number;
  userId: string; // Firebase UID after lookup
  agentId: string;
  text: string;
  replyToMessageId?: number;
  photos?: Array<{
    fileId: string;
    fileUniqueId: string;
    fileSize: number;
    width: number;
    height: number;
  }>;
  document?: {
    fileId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  };
}

export interface DiscordRawData {
  messageId: string;
  channelId: string;
  guildId?: string;
  userId: string; // Firebase UID after lookup
  agentId: string;
  content: string;
  referencedMessageId?: string;
  attachments?: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
    url: string;
  }>;
}

export interface SlackRawData {
  ts: string;
  channelId: string;
  userId: string; // Firebase UID after lookup
  agentId: string;
  text: string;
  threadTs?: string;
  files?: Array<{
    id: string;
    name: string;
    mimetype: string;
    size: number;
    urlPrivateDownload: string;
  }>;
}

type RawDataMap = {
  telegram: TelegramRawData;
  discord: DiscordRawData;
  slack: SlackRawData;
};

// ============================================================
// Attachment extraction per channel
// ============================================================

function extractTelegramAttachments(data: TelegramRawData): Attachment[] {
  const attachments: Attachment[] = [];

  if (data.photos && data.photos.length > 0) {
    // Telegram sends multiple sizes; pick the largest
    const largest = data.photos[data.photos.length - 1];
    attachments.push({
      id: largest.fileUniqueId,
      type: 'image',
      url: `telegram://file/${largest.fileId}`,
      mimeType: 'image/jpeg',
      size: largest.fileSize,
      name: `photo_${largest.fileUniqueId}.jpg`,
    });
  }

  if (data.document) {
    const mimeType = data.document.mimeType || 'application/octet-stream';
    const type = mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('audio/')
        ? 'audio'
        : mimeType.startsWith('video/')
          ? 'video'
          : 'file';

    attachments.push({
      id: data.document.fileId,
      type,
      url: `telegram://file/${data.document.fileId}`,
      mimeType,
      size: data.document.fileSize,
      name: data.document.fileName,
    });
  }

  return attachments;
}

function extractDiscordAttachments(data: DiscordRawData): Attachment[] {
  if (!data.attachments) return [];

  return data.attachments.map((a) => {
    const mimeType = a.contentType || 'application/octet-stream';
    const type = mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('audio/')
        ? 'audio'
        : mimeType.startsWith('video/')
          ? 'video'
          : 'file';

    return {
      id: a.id,
      type,
      url: a.url,
      mimeType,
      size: a.size,
      name: a.filename,
    } as Attachment;
  });
}

function extractSlackAttachments(data: SlackRawData): Attachment[] {
  if (!data.files) return [];

  return data.files.map((f) => {
    const mimeType = f.mimetype || 'application/octet-stream';
    const type = mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('audio/')
        ? 'audio'
        : mimeType.startsWith('video/')
          ? 'video'
          : 'file';

    return {
      id: f.id,
      type,
      url: f.urlPrivateDownload,
      mimeType,
      size: f.size,
      name: f.name,
    } as Attachment;
  });
}

// ============================================================
// normalizeMessage  - factory function
// ============================================================

export function normalizeMessage<S extends keyof RawDataMap>(
  source: S,
  rawData: RawDataMap[S],
): NormalizedMessage {
  switch (source) {
    case 'telegram': {
      const d = rawData as TelegramRawData;
      return {
        id: uuidv4(),
        source: 'telegram' as ChannelSource,
        userId: d.userId,
        agentId: d.agentId,
        content: d.text || '',
        attachments: extractTelegramAttachments(d),
        timestamp: Timestamp.now(),
        replyTo: d.replyToMessageId?.toString(),
        metadata: {
          telegramMessageId: d.messageId,
          telegramChatId: d.chatId,
        },
      };
    }

    case 'discord': {
      const d = rawData as DiscordRawData;
      return {
        id: uuidv4(),
        source: 'discord' as ChannelSource,
        userId: d.userId,
        agentId: d.agentId,
        content: d.content || '',
        attachments: extractDiscordAttachments(d),
        timestamp: Timestamp.now(),
        replyTo: d.referencedMessageId,
        metadata: {
          discordMessageId: d.messageId,
          discordChannelId: d.channelId,
          discordGuildId: d.guildId,
        },
      };
    }

    case 'slack': {
      const d = rawData as SlackRawData;
      return {
        id: uuidv4(),
        source: 'slack' as ChannelSource,
        userId: d.userId,
        agentId: d.agentId,
        content: d.text || '',
        attachments: extractSlackAttachments(d),
        timestamp: Timestamp.now(),
        replyTo: d.threadTs,
        metadata: {
          slackTs: d.ts,
          slackChannelId: d.channelId,
        },
      };
    }

    default:
      throw new Error(`Unsupported channel source: ${source as string}`);
  }
}

// ============================================================
// formatResponseForChannel  - adapt agent reply for each channel
// ============================================================

/**
 * Convert the generic markdown from AgentResponse.content into the
 * dialect understood by the target channel.
 */
export function formatResponseForChannel(
  response: AgentResponse,
  channel: ChannelSource,
): string {
  const text = response.content;

  switch (channel) {
    case 'telegram':
      return formatForTelegram(text);
    case 'discord':
      return formatForDiscord(text);
    case 'slack':
      return formatForSlack(text);
    default:
      return text;
  }
}

// ------ Telegram (MarkdownV2) ------

function formatForTelegram(md: string): string {
  // Telegram MarkdownV2 requires escaping certain characters outside
  // of code spans / blocks. We do a best-effort transformation:
  //  - Convert **bold** to *bold*
  //  - Keep `code` as-is
  //  - Keep ```code blocks``` as-is
  //  - Escape special chars: _ [ ] ( ) ~ > # + - = | { } . !

  let result = md;

  // Bold: **text** -> *text*
  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // Escape characters that Telegram requires escaped in MarkdownV2,
  // but skip anything inside backtick spans to avoid breaking code.
  const parts = result.split(/(```[\s\S]*?```|`[^`]+`)/g);
  result = parts
    .map((part, i) => {
      // Odd indices are code spans / blocks - leave untouched
      if (i % 2 === 1) return part;
      return part.replace(/([_\[\]()~>#+\-=|{}.!])/g, '\\$1');
    })
    .join('');

  return result;
}

// ------ Discord (standard markdown) ------

function formatForDiscord(md: string): string {
  // Discord supports standard markdown natively.
  // Truncate to Discord's 2000-char message limit.
  if (md.length > 2000) {
    return md.slice(0, 1997) + '...';
  }
  return md;
}

// ------ Slack (mrkdwn) ------

function formatForSlack(md: string): string {
  let result = md;

  // Bold: **text** or __text__ -> *text*
  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');
  result = result.replace(/__(.+?)__/g, '*$1*');

  // Italic: *text* (single) -> _text_  (but not inside bold)
  // We do a simple pass after bold conversion
  result = result.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '_$1_');

  // Strikethrough: ~~text~~ -> ~text~
  result = result.replace(/~~(.+?)~~/g, '~$1~');

  // Links: [text](url) -> <url|text>
  result = result.replace(/\[(.+?)\]\((.+?)\)/g, '<$2|$1>');

  return result;
}
