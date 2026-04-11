import { execSync } from 'child_process';

function osascript(script: string): string {
  return execSync(`osascript`, {
    input: script,
    encoding: 'utf-8',
    timeout: 15000,
  }).trim();
}

export async function listNotes(args: Record<string, unknown>) {
  const count = Math.min(Number(args.count) || 20, 100);
  const folder = args.folder as string | undefined;

  const target = folder ? `folder "${folder.replace(/"/g, '\\"')}"` : 'default account';
  const script = `tell application "Notes"
    set noteList to notes of ${target}
    set output to ""
    set i to 0
    repeat with n in noteList
      if i ≥ ${count} then exit repeat
      set output to output & (i + 1) & ". " & (name of n) & " (" & (modification date of n as string) & ")" & linefeed
      set i to i + 1
    end repeat
    return output
  end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result || 'No notes found.' }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function readNote(args: Record<string, unknown>) {
  const name = (args.name as string).replace(/"/g, '\\"');

  const script = `tell application "Notes"
    set matchingNotes to notes whose name is "${name}"
    if (count of matchingNotes) > 0 then
      set n to item 1 of matchingNotes
      return "Title: " & (name of n) & linefeed & "Modified: " & (modification date of n as string) & linefeed & linefeed & (plaintext of n)
    else
      return "Note not found: ${name}"
    end if
  end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function createNote(args: Record<string, unknown>) {
  const title = (args.title as string).replace(/"/g, '\\"');
  const body = (args.body as string).replace(/"/g, '\\"').replace(/\n/g, '<br>');
  const folder = ((args.folder as string) || 'Notes').replace(/"/g, '\\"');

  const script = `tell application "Notes"
    tell folder "${folder}"
      make new note with properties {name:"${title}", body:"<h1>${title}</h1><br>${body}"}
    end tell
    return "Note created: ${title}"
  end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function updateNote(args: Record<string, unknown>) {
  const name = (args.name as string).replace(/"/g, '\\"');
  const body = (args.body as string).replace(/"/g, '\\"').replace(/\n/g, '<br>');
  const append = args.append as boolean;

  const script = `tell application "Notes"
    set matchingNotes to notes whose name is "${name}"
    if (count of matchingNotes) > 0 then
      set n to item 1 of matchingNotes
      ${append
        ? `set body of n to (body of n) & "<br>${body}"`
        : `set body of n to "<h1>${name}</h1><br>${body}"`}
      return "Note updated: ${name}"
    else
      return "Note not found: ${name}"
    end if
  end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function deleteNote(args: Record<string, unknown>) {
  const name = (args.name as string).replace(/"/g, '\\"');

  const script = `tell application "Notes"
    set matchingNotes to notes whose name is "${name}"
    if (count of matchingNotes) > 0 then
      delete item 1 of matchingNotes
      return "Note deleted: ${name}"
    else
      return "Note not found: ${name}"
    end if
  end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function searchNotes(args: Record<string, unknown>) {
  const query = (args.query as string).replace(/"/g, '\\"');
  const count = Math.min(Number(args.count) || 20, 100);

  const script = `tell application "Notes"
    set matchingNotes to notes whose (name contains "${query}") or (plaintext contains "${query}")
    set output to ""
    set i to 0
    repeat with n in matchingNotes
      if i ≥ ${count} then exit repeat
      set output to output & (i + 1) & ". " & (name of n) & linefeed
      set i to i + 1
    end repeat
    if output is "" then return "No notes matching \\"${query}\\""
    return output
  end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

/**
 * Lock a note via UI automation. Apple Notes doesn't expose a lock action
 * through AppleScript (for security), so we use System Events to click the menu.
 * Note: Requires "Accessibility" permission for the calling app.
 */
export async function lockNote(args: Record<string, unknown>) {
  const name = (args.name as string).replace(/"/g, '\\"');

  // First, select the note, then use the menu bar: File > Lock Note
  const script = `tell application "Notes"
    activate
    set matchingNotes to notes whose name is "${name}"
    if (count of matchingNotes) = 0 then
      return "Note not found: ${name}"
    end if
    set n to item 1 of matchingNotes
    show n
  end tell

  delay 0.5

  tell application "System Events"
    tell process "Notes"
      -- File menu > Lock Note
      try
        click menu item "Lock Note" of menu "File" of menu bar 1
        return "Lock dialog opened for: ${name}. You may need to enter your password."
      on error errMsg
        return "Unable to lock note via menu: " & errMsg & ". Note: locking requires a password set in Notes preferences, and accessibility permissions."
      end try
    end tell
  end tell`;

  try {
    const result = osascript(script);
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return {
      content: [{
        type: 'text',
        text: `Failed to lock note: ${err instanceof Error ? err.message : String(err)}. ` +
              `Locking requires: (1) a password set in Notes > Settings > Password, ` +
              `(2) Accessibility permission granted to the Terminal/Noomachy app in System Settings > Privacy & Security > Accessibility.`,
      }],
      isError: true,
    };
  }
}
