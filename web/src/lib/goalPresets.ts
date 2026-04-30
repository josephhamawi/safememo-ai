/**
 * Curated preset auto-pilot goals.
 *
 * Each preset is a realistic template that maps to tools the agent has.
 * Clicking a preset in the UI prefills the create form — the user can
 * still tweak title, schedule, and prompt before submitting.
 *
 * `needsDesktop: true` means the preset relies on the Noomachy macOS
 * desktop app being open (Apple Mail / Notes / Calendar / Reminders / Files).
 */

import type { LucideIcon } from 'lucide-react';
import {
  Mail,
  Calendar,
  CheckSquare,
  FileText,
  Folder,
  Globe,
  HardDrive,
  Newspaper,
  Sparkles,
  Cloud,
} from 'lucide-react';

export interface GoalPreset {
  id: string;
  icon: LucideIcon;
  title: string;
  category: 'mail' | 'calendar' | 'reminders' | 'notes' | 'files' | 'web' | 'system';
  description: string;
  schedule: string;
  prompt: string;
  needsDesktop: boolean;
}

export const GOAL_PRESETS: GoalPreset[] = [
  {
    id: 'morning-email-brief',
    icon: Mail,
    category: 'mail',
    title: 'Morning email brief',
    description: 'Daily summary of your unread inbox — sender, topic, urgency.',
    schedule: 'daily 08:00',
    prompt:
      "Read my Apple Mail inbox using mail_read_inbox. Look at the 30 most recent unread emails. Group them by sender. Write a brief in this exact format:\n\n## Inbox brief — {today's date}\n**Total unread:** N\n\n### Urgent (need a response today)\n- From [sender] — [one-line topic]\n\n### FYI\n- [topic] from [sender]\n\n### Newsletters / promotions\n- count by sender\n\nDo not include full email bodies. If there are no urgent items, say so.",
    needsDesktop: true,
  },
  {
    id: 'meeting-prep',
    icon: Calendar,
    category: 'calendar',
    title: 'Today\'s meeting prep',
    description: "Reads today's calendar and pulls relevant emails for each meeting.",
    schedule: 'daily 07:30',
    prompt:
      "Use calendar_today to read today's events. For each meeting that has external attendees, use mail_search to find emails from or about those attendees in the last 14 days. Then create or update a note titled 'Meetings — {today's date}' via notes_create or notes_update with: meeting time, attendees, and a one-paragraph context brief per meeting. If there are no meetings today, just say so.",
    needsDesktop: true,
  },
  {
    id: 'reminders-triage',
    icon: CheckSquare,
    category: 'reminders',
    title: 'Daily reminders triage',
    description: 'Lists pending reminders, flags overdue, suggests order.',
    schedule: 'daily 08:30',
    prompt:
      "Use reminders_list to get all my open reminders. Sort into three groups: (1) overdue, (2) due today, (3) coming up this week. For each group output the items with their due times. End with a 'Suggested first action' line picking the single most important overdue or due-today item.",
    needsDesktop: true,
  },
  {
    id: 'end-of-day-journal',
    icon: FileText,
    category: 'notes',
    title: 'End-of-day journal',
    description: 'Auto-captures today\'s calendar + reminders into a journal note.',
    schedule: 'daily 18:00',
    prompt:
      "Create or update a note titled 'Journal — {today's date}' (use notes_create or notes_update). Include three sections:\n1) **Today's events** — call calendar_today and list them.\n2) **Completed reminders** — call reminders_list and include any marked completed today.\n3) **Open prompts** — leave these three blank prompts for me to fill in:\n   - What was the most important thing I did today?\n   - What's blocking me right now?\n   - One thing to start tomorrow with.",
    needsDesktop: true,
  },
  {
    id: 'weekly-review',
    icon: Sparkles,
    category: 'notes',
    title: 'Weekly review',
    description: 'Reads your episodic memory and surfaces patterns + next-week priorities.',
    schedule: 'weekly Sun 18:00',
    prompt:
      "Look at my recent episodic memory and any notes you can find from the last 7 days. Surface: (1) the top 3 themes I worked on, (2) any recurring blockers, (3) what I finished vs. deferred. Then propose 3 specific priorities for next week. Save the output as a new note titled 'Weekly review — week of {start of week's date}'.",
    needsDesktop: true,
  },
  {
    id: 'find-duplicate-files',
    icon: Folder,
    category: 'files',
    title: 'Find duplicate files in Downloads',
    description: 'Scans ~/Downloads and reports files that look like duplicates by name + size.',
    schedule: 'weekly Sat 09:00',
    prompt:
      "Use files_list to list everything in ~/Downloads. Group entries by (filename without numeric suffix like ' (1)', ' (2)') AND size in KB. Report any group with 2 or more files as a likely duplicate set, in this format:\n\n- 'invoice.pdf' — 3 copies (450KB each): invoice.pdf, invoice (1).pdf, invoice (2).pdf\n\nDo NOT delete anything. Just report. End with a one-line total: 'Found N likely duplicate sets covering M files'.",
    needsDesktop: true,
  },
  {
    id: 'large-files-check',
    icon: HardDrive,
    category: 'files',
    title: 'Large file scan',
    description: 'Flags files over 500MB in Downloads and Desktop.',
    schedule: 'weekly Mon 09:00',
    prompt:
      "Use files_list on ~/Downloads and ~/Desktop. Report all files larger than 500MB, sorted descending by size. For each: name, size in MB, folder. End with a total in GB. Do not delete anything.",
    needsDesktop: true,
  },
  {
    id: 'stale-downloads',
    icon: Folder,
    category: 'files',
    title: 'Stale Downloads cleanup',
    description: 'Lists Downloads files untouched for 30+ days.',
    schedule: 'weekly Fri 17:00',
    prompt:
      "Use files_list on ~/Downloads. Identify files where the last modification was 30+ days ago. Group by file extension (.pdf, .dmg, .zip, etc.) and list filenames within each group. Suggest which categories are safest to archive (.dmg, .zip from old installs, etc.). Do NOT delete anything.",
    needsDesktop: true,
  },
  {
    id: 'news-digest',
    icon: Newspaper,
    category: 'web',
    title: 'Daily news digest',
    description: "Web-searches a topic you care about and summarizes the top 5 stories.",
    schedule: 'daily 07:00',
    prompt:
      "Use web_search to find the top news from the last 24 hours about: AI agent platforms, autonomous AI, Anthropic, OpenAI. Pick the 5 most consequential stories. For each, give: 1-line headline, 2-3 sentence summary, source URL. End with a one-line meta: 'top theme today is X'. **Edit this prompt** to change the topics.",
    needsDesktop: false,
  },
  {
    id: 'weather-brief',
    icon: Cloud,
    category: 'web',
    title: 'Weather + dress brief',
    description: "Gets the day's weather and tells you what to wear.",
    schedule: 'daily 07:00',
    prompt:
      "Use get_weather for my city (CHANGE THIS LINE: my city is 'London, UK'). Tell me the high, the low, the chance of rain, and one practical recommendation: umbrella, jacket, or just a t-shirt. Keep it under 50 words.",
    needsDesktop: false,
  },
];

export const PRESET_CATEGORIES: { key: GoalPreset['category']; label: string }[] = [
  { key: 'mail', label: 'Mail' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'notes', label: 'Notes' },
  { key: 'files', label: 'Files' },
  { key: 'web', label: 'Web' },
  { key: 'system', label: 'System' },
];
