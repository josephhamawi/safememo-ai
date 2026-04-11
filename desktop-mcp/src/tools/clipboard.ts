import { execSync } from 'child_process';

export async function readClipboard() {
  try {
    const content = execSync('pbpaste', { encoding: 'utf-8', timeout: 5000 });
    return { content: [{ type: 'text', text: content || '(clipboard is empty)' }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function writeClipboard(args: Record<string, unknown>) {
  const text = args.text as string;
  try {
    execSync(`echo ${JSON.stringify(text)} | pbcopy`, { timeout: 5000 });
    return { content: [{ type: 'text', text: `Copied to clipboard (${text.length} chars)` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}
