import { execSync } from 'child_process';

function osascript(script: string): string {
  return execSync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, {
    encoding: 'utf-8', timeout: 15000,
  }).trim();
}

export async function getEvents(args: Record<string, unknown>) {
  const days = Math.min(Number(args.days) || 1, 30);

  const script = `set today to current date
set endDate to today + (${days} * days)
tell application "Calendar"
  set output to ""
  repeat with cal in calendars
    set evts to (every event of cal whose start date ≥ today and start date ≤ endDate)
    repeat with e in evts
      set output to output & "📅 " & (summary of e) & linefeed & "   " & (start date of e as string) & " → " & (end date of e as string) & linefeed
      if location of e is not missing value and location of e is not "" then
        set output to output & "   📍 " & (location of e) & linefeed
      end if
      set output to output & linefeed
    end repeat
  end repeat
  return output
end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result || `No events in the next ${days} day(s).` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function createEvent(args: Record<string, unknown>) {
  const title = (args.title as string).replace(/"/g, '\\"');
  const date = args.date as string;
  const startTime = args.startTime as string;
  const endTime = args.endTime as string;
  const location = args.location ? (args.location as string).replace(/"/g, '\\"') : '';
  const notes = args.notes ? (args.notes as string).replace(/"/g, '\\"') : '';

  const script = `tell application "Calendar"
  tell calendar 1
    set startDate to date "${date} ${startTime}"
    set endDate to date "${date} ${endTime}"
    set newEvent to make new event with properties {summary:"${title}", start date:startDate, end date:endDate${location ? `, location:"${location}"` : ''}${notes ? `, description:"${notes}"` : ''}}
  end tell
  return "Event created: ${title} on ${date} ${startTime}-${endTime}"
end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}
