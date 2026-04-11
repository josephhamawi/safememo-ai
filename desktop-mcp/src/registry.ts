import * as mail from './tools/mail';
import * as notes from './tools/notes';
import * as calendar from './tools/calendar';
import * as reminders from './tools/reminders';
import * as clipboard from './tools/clipboard';
import * as files from './tools/files';
import * as browser from './tools/browser';
import * as system from './tools/system';

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

const tools: Map<string, RegisteredTool> = new Map();

function register(name: string, description: string, inputSchema: Record<string, unknown>, handler: ToolHandler) {
  tools.set(name, { definition: { name, description, inputSchema }, handler });
}

// -- Mail --
register('mail_read_inbox', 'Read recent emails from Apple Mail inbox', {
  type: 'object',
  properties: {
    count: { type: 'number', description: 'Number of emails to read (default 10, max 50)', default: 10 },
    account: { type: 'string', description: 'Mail account name (optional, reads default)' },
  },
}, mail.readInbox);

register('mail_search', 'Search emails in Apple Mail', {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search query' },
    count: { type: 'number', description: 'Max results (default 10)', default: 10 },
  },
  required: ['query'],
}, mail.searchMail);

register('mail_send', 'Send an email via Apple Mail', {
  type: 'object',
  properties: {
    to: { type: 'string', description: 'Recipient email address' },
    subject: { type: 'string', description: 'Email subject' },
    body: { type: 'string', description: 'Email body (plain text)' },
  },
  required: ['to', 'subject', 'body'],
}, mail.sendMail);

// -- Notes --
register('notes_list', 'List notes from Apple Notes', {
  type: 'object',
  properties: {
    folder: { type: 'string', description: 'Folder name (optional, lists all)' },
    count: { type: 'number', description: 'Max notes to list (default 20)', default: 20 },
  },
}, notes.listNotes);

register('notes_read', 'Read a specific note by name from Apple Notes', {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Note title to read' },
  },
  required: ['name'],
}, notes.readNote);

register('notes_create', 'Create a new note in Apple Notes', {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Note title' },
    body: { type: 'string', description: 'Note content (plain text or HTML)' },
    folder: { type: 'string', description: 'Folder name (default: Notes)', default: 'Notes' },
  },
  required: ['title', 'body'],
}, notes.createNote);

register('notes_update', 'Update or append content to an existing note in Apple Notes', {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Note title to update' },
    body: { type: 'string', description: 'New content' },
    append: { type: 'boolean', description: 'If true, append to existing content; if false, replace', default: false },
  },
  required: ['name', 'body'],
}, notes.updateNote);

register('notes_delete', 'Delete a note from Apple Notes by title', {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Note title to delete' },
  },
  required: ['name'],
}, notes.deleteNote);

register('notes_search', 'Search Apple Notes by title or content', {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search query (matches title or content)' },
    count: { type: 'number', description: 'Max results (default 20)', default: 20 },
  },
  required: ['query'],
}, notes.searchNotes);

register('notes_lock', 'Lock a note in Apple Notes (requires password set in Notes and Accessibility permission)', {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Note title to lock' },
  },
  required: ['name'],
}, notes.lockNote);

// -- Calendar --
register('calendar_today', 'Get today\'s calendar events', {
  type: 'object',
  properties: {
    days: { type: 'number', description: 'Number of days to look ahead (default 1)', default: 1 },
  },
}, calendar.getEvents);

register('calendar_create', 'Create a calendar event', {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Event title' },
    date: { type: 'string', description: 'Date (YYYY-MM-DD)' },
    startTime: { type: 'string', description: 'Start time (HH:MM)' },
    endTime: { type: 'string', description: 'End time (HH:MM)' },
    location: { type: 'string', description: 'Event location (optional)' },
    notes: { type: 'string', description: 'Event notes (optional)' },
  },
  required: ['title', 'date', 'startTime', 'endTime'],
}, calendar.createEvent);

// -- Reminders --
register('reminders_list', 'List reminders from Apple Reminders', {
  type: 'object',
  properties: {
    list: { type: 'string', description: 'Reminders list name (optional)' },
    showCompleted: { type: 'boolean', description: 'Include completed reminders', default: false },
  },
}, reminders.listReminders);

register('reminders_create', 'Create a new reminder', {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Reminder title' },
    dueDate: { type: 'string', description: 'Due date (YYYY-MM-DD, optional)' },
    list: { type: 'string', description: 'Reminders list (default: Reminders)', default: 'Reminders' },
    notes: { type: 'string', description: 'Additional notes (optional)' },
  },
  required: ['title'],
}, reminders.createReminder);

// -- Clipboard --
register('clipboard_read', 'Read current clipboard content', {
  type: 'object', properties: {},
}, clipboard.readClipboard);

register('clipboard_write', 'Write text to clipboard', {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'Text to copy to clipboard' },
  },
  required: ['text'],
}, clipboard.writeClipboard);

// -- Files --
register('files_read', 'Read a local file', {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'File path (absolute or relative to home)' },
  },
  required: ['path'],
}, files.readFile);

register('files_write', 'Write content to a local file', {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'File path' },
    content: { type: 'string', description: 'File content' },
  },
  required: ['path', 'content'],
}, files.writeFile);

register('files_list', 'List files in a directory', {
  type: 'object',
  properties: {
    path: { type: 'string', description: 'Directory path (default: home)', default: '~' },
  },
}, files.listFiles);

// -- Browser --
register('browser_open', 'Open a URL in the default browser', {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'URL to open' },
  },
  required: ['url'],
}, browser.openUrl);

// -- System --
register('system_info', 'Get system information (OS, memory, disk, etc.)', {
  type: 'object', properties: {},
}, system.getSystemInfo);

register('system_notify', 'Show a macOS notification', {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Notification title' },
    message: { type: 'string', description: 'Notification message' },
  },
  required: ['title', 'message'],
}, system.showNotification);

register('system_run', 'Run a shell command (use with caution)', {
  type: 'object',
  properties: {
    command: { type: 'string', description: 'Shell command to execute' },
  },
  required: ['command'],
}, system.runCommand);

// -- Public API --
export function getAllTools(): ToolDefinition[] {
  return Array.from(tools.values()).map(t => t.definition);
}

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) {
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  }
  return tool.handler(args);
}
