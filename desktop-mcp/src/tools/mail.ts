import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Apple Mail integration using the Envelope Index SQLite database directly.
 * This avoids AppleScript automation permission prompts and is much faster.
 * Works because Mail.app stores its metadata in a readable SQLite file.
 */

function findMailDb(): string | null {
  const mailDir = path.join(os.homedir(), 'Library', 'Mail');
  if (!fs.existsSync(mailDir)) return null;

  const versions = fs.readdirSync(mailDir).filter((d) => /^V\d+$/.test(d));
  if (versions.length === 0) return null;

  versions.sort((a, b) => parseInt(b.slice(1)) - parseInt(a.slice(1)));
  const dbPath = path.join(mailDir, versions[0], 'MailData', 'Envelope Index');
  return fs.existsSync(dbPath) ? dbPath : null;
}

/**
 * Load a map of account UUID → email address from macOS Accounts database.
 */
function loadAccountMap(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const dbPath = path.join(os.homedir(), 'Library', 'Accounts', 'Accounts4.sqlite');
    if (!fs.existsSync(dbPath)) return map;
    const output = execSync(`sqlite3 -readonly '${dbPath}'`, {
      input: `SELECT ZIDENTIFIER, ZUSERNAME FROM ZACCOUNT WHERE ZUSERNAME LIKE '%@%';`,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    for (const line of output.split('\n')) {
      const [uuid, email] = line.split('|');
      if (uuid && email) map.set(uuid, email);
    }
  } catch {
    /* ignore */
  }
  return map;
}

/**
 * Extract the account UUID from a Mail mailbox URL like
 * imap://F9B4E7B8-.../INBOX or ews://A51F46CE-.../Inbox
 */
function extractAccountUuid(mailboxUrl: string): string | null {
  const match = mailboxUrl.match(/\/\/([0-9A-F-]+)\//i);
  return match ? match[1] : null;
}

function sqliteQuery(dbPath: string, query: string): string {
  // Pass query via stdin to avoid shell-escaping issues
  return execSync(`sqlite3 -readonly '${dbPath}'`, {
    input: query,
    encoding: 'utf-8',
    timeout: 15000,
    maxBuffer: 5 * 1024 * 1024,
  }).trim();
}

export async function readInbox(args: Record<string, unknown>) {
  const count = Math.min(Number(args.count) || 10, 50);

  const dbPath = findMailDb();
  if (!dbPath) {
    return {
      content: [{ type: 'text', text: 'Mail database not found. Make sure Apple Mail has been set up.' }],
      isError: true,
    };
  }

  try {
    const accountMap = loadAccountMap();
    const query = `SELECT COALESCE(s.subject, '(no subject)') as subj, COALESCE(a.address, '(unknown)') as sender, COALESCE(a.comment, '') as sender_name, datetime(m.date_received, 'unixepoch', 'localtime') as received, COALESCE(sum.summary, '') as preview, mb.url as mailbox_url FROM messages m LEFT JOIN subjects s ON m.subject = s.ROWID LEFT JOIN addresses a ON m.sender = a.ROWID LEFT JOIN summaries sum ON m.summary = sum.ROWID LEFT JOIN mailboxes mb ON m.mailbox = mb.ROWID WHERE m.deleted = 0 ORDER BY m.date_received DESC LIMIT ${count};`;

    const result = sqliteQuery(dbPath, query);
    if (!result) {
      return { content: [{ type: 'text', text: 'No emails found in inbox.' }] };
    }

    const lines = result.split('\n');
    const formatted = lines.map((line, idx) => {
      const parts = line.split('|');
      const [subj, sender, senderName, received, summary, mailboxUrl] = parts;
      const from = senderName ? `${senderName} <${sender}>` : sender;
      const preview = (summary || '').slice(0, 200);
      const uuid = extractAccountUuid(mailboxUrl || '');
      const accountEmail = uuid ? accountMap.get(uuid) : null;
      const accountLine = accountEmail ? `\n   Account: ${accountEmail}` : '';
      return `${idx + 1}. From: ${from}\n   Subject: ${subj}\n   Date: ${received}${accountLine}${preview ? `\n   Preview: ${preview}` : ''}`;
    }).join('\n\n');

    // Show unique accounts at the top
    const uniqueAccounts = new Set<string>();
    for (const line of lines) {
      const uuid = extractAccountUuid(line.split('|')[5] || '');
      const email = uuid ? accountMap.get(uuid) : null;
      if (email) uniqueAccounts.add(email);
    }
    const header = uniqueAccounts.size > 0
      ? `Checking account(s): ${Array.from(uniqueAccounts).join(', ')}\n\n`
      : '';

    return { content: [{ type: 'text', text: header + formatted }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Failed to read Mail database: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
}

export async function searchMail(args: Record<string, unknown>) {
  const searchQuery = (args.query as string).replace(/'/g, "''");
  const count = Math.min(Number(args.count) || 10, 50);

  const dbPath = findMailDb();
  if (!dbPath) {
    return {
      content: [{ type: 'text', text: 'Mail database not found.' }],
      isError: true,
    };
  }

  try {
    const query = `SELECT COALESCE(s.subject, '(no subject)') as subj, COALESCE(a.address, '(unknown)') as sender, COALESCE(a.comment, '') as sender_name, datetime(m.date_received, 'unixepoch', 'localtime') as received FROM messages m LEFT JOIN subjects s ON m.subject = s.ROWID LEFT JOIN addresses a ON m.sender = a.ROWID WHERE m.deleted = 0 AND (s.subject LIKE '%${searchQuery}%' OR a.address LIKE '%${searchQuery}%' OR a.comment LIKE '%${searchQuery}%') ORDER BY m.date_received DESC LIMIT ${count};`;

    const result = sqliteQuery(dbPath, query);
    if (!result) {
      return { content: [{ type: 'text', text: `No emails matching "${args.query}".` }] };
    }

    const lines = result.split('\n');
    const formatted = lines.map((line, idx) => {
      const [subj, sender, senderName, received] = line.split('|');
      const from = senderName ? `${senderName} <${sender}>` : sender;
      return `${idx + 1}. From: ${from}\n   Subject: ${subj}\n   Date: ${received}`;
    }).join('\n\n');

    return { content: [{ type: 'text', text: formatted }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Search failed: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
}

export async function sendMail(args: Record<string, unknown>) {
  // Sending still requires AppleScript since we need to actually dispatch the email
  const to = args.to as string;
  const subject = (args.subject as string).replace(/"/g, '\\"');
  const body = (args.body as string).replace(/"/g, '\\"');

  const script = `tell application "Mail"
    set newMsg to make new outgoing message with properties {subject:"${subject}", content:"${body}", visible:true}
    tell newMsg
      make new to recipient at end of to recipients with properties {address:"${to}"}
    end tell
    send newMsg
  end tell
  return "Email sent to ${to}"`;

  try {
    const result = execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    }).trim();
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Failed to send: ${err instanceof Error ? err.message : String(err)}. You may need to grant Mail automation permission in System Settings > Privacy & Security > Automation.` }],
      isError: true,
    };
  }
}
