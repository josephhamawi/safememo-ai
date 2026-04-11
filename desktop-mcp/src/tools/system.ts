import { execSync } from 'child_process';
import * as os from 'os';

export async function getSystemInfo() {
  const info = {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpus: os.cpus().length,
    memory: `${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB total, ${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)} GB free`,
    uptime: `${(os.uptime() / 3600).toFixed(1)} hours`,
    user: os.userInfo().username,
    homeDir: os.homedir(),
  };

  let disk = '';
  try {
    disk = execSync("df -h / | tail -1 | awk '{print $2 \" total, \" $3 \" used, \" $4 \" free\"}'", { encoding: 'utf-8' }).trim();
  } catch { /* ignore */ }

  const lines = Object.entries(info).map(([k, v]) => `${k}: ${v}`);
  if (disk) lines.push(`disk: ${disk}`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function showNotification(args: Record<string, unknown>) {
  const title = (args.title as string).replace(/"/g, '\\"');
  const message = (args.message as string).replace(/"/g, '\\"');

  try {
    execSync(`osascript -e 'display notification "${message}" with title "${title}"'`, { timeout: 5000 });
    return { content: [{ type: 'text', text: `Notification shown: ${title}` }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
}

export async function runCommand(args: Record<string, unknown>) {
  const command = args.command as string;

  // Basic safety: block destructive commands
  const blocked = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'fork bomb'];
  if (blocked.some(b => command.includes(b))) {
    return { content: [{ type: 'text', text: 'Blocked: potentially destructive command.' }], isError: true };
  }

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return { content: [{ type: 'text', text: output.slice(0, 10000) || '(no output)' }] };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return { content: [{ type: 'text', text: `Error: ${e.stderr || e.message || String(err)}` }], isError: true };
  }
}
