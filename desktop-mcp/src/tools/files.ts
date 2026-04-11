import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function resolvePath(p: string): string {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  if (path.isAbsolute(p)) return p;
  return path.join(os.homedir(), p);
}

export async function readFile(args: Record<string, unknown>) {
  const filePath = resolvePath(args.path as string);
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 1024 * 1024) {
      return { content: [{ type: 'text', text: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max 1MB.` }], isError: true };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content: [{ type: 'text', text: `File: ${filePath}\nSize: ${stat.size} bytes\n\n${content}` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function writeFile(args: Record<string, unknown>) {
  const filePath = resolvePath(args.path as string);
  const content = args.content as string;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { content: [{ type: 'text', text: `Written ${content.length} chars to ${filePath}` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed to write: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function listFiles(args: Record<string, unknown>) {
  const dirPath = resolvePath((args.path as string) || '~');
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const lines = entries.slice(0, 100).map(e => {
      const icon = e.isDirectory() ? '📁' : '📄';
      try {
        const stat = fs.statSync(path.join(dirPath, e.name));
        const size = e.isFile() ? ` (${(stat.size / 1024).toFixed(1)}KB)` : '';
        return `${icon} ${e.name}${size}`;
      } catch {
        return `${icon} ${e.name}`;
      }
    });
    return { content: [{ type: 'text', text: `${dirPath}/\n\n${lines.join('\n')}` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed to list: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}
