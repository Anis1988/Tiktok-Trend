import { spawn } from 'node:child_process';

/** Run a command; reject with the last lines of stderr on failure. */
export function run(cmd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} failed (${code}): ${err.split('\n').slice(-6).join(' ')}`))));
    if (input !== undefined) p.stdin.end(input);
    else p.stdin.end();
  });
}

export async function durationOf(file: string): Promise<number> {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return Number(out.trim()) || 0;
}
