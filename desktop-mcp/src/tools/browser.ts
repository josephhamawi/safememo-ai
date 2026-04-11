import { execSync } from 'child_process';

export async function openUrl(args: Record<string, unknown>) {
  const url = args.url as string;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { content: [{ type: 'text', text: 'URL must start with http:// or https://' }], isError: true };
  }
  try {
    execSync(`open "${url.replace(/"/g, '\\"')}"`, { timeout: 5000 });
    return { content: [{ type: 'text', text: `Opened in browser: ${url}` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}
