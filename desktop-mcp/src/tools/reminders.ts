import { execSync } from 'child_process';

function osascript(script: string): string {
  return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
    encoding: 'utf-8', timeout: 15000,
  }).trim();
}

export async function listReminders(args: Record<string, unknown>) {
  const list = args.list as string | undefined;
  const showCompleted = args.showCompleted as boolean || false;

  const target = list ? `list "${list}"` : 'default list';
  const filter = showCompleted ? '' : 'whose completed is false';

  const script = `tell application "Reminders"
    set rems to reminders of ${target} ${filter}
    set output to ""
    repeat with r in rems
      set output to output & "☐ " & (name of r)
      if due date of r is not missing value then
        set output to output & " (due: " & (due date of r as string) & ")"
      end if
      set output to output & linefeed
    end repeat
    return output
  end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result || 'No reminders found.' }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function createReminder(args: Record<string, unknown>) {
  const title = (args.title as string).replace(/"/g, '\\"');
  const list = ((args.list as string) || 'Reminders').replace(/"/g, '\\"');
  const dueDate = args.dueDate as string | undefined;
  const notes = args.notes as string | undefined;

  let props = `{name:"${title}"`;
  if (dueDate) props += `, due date:date "${dueDate}"`;
  if (notes) props += `, body:"${notes.replace(/"/g, '\\"')}"`;
  props += '}';

  const script = `tell application "Reminders"
    tell list "${list}"
      make new reminder with properties ${props}
    end tell
    return "Reminder created: ${title}"
  end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}
