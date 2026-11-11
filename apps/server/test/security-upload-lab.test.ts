import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const labScript = path.resolve(here, '../scripts/security-upload-lab.cjs');
const running: ChildProcessWithoutNullStreams[] = [];

async function startLab(mode: 'insecure' | 'secure') {
  const child = spawn(process.execPath, [labScript, `--${mode}`, '--port', '0'], {
    cwd: path.resolve(here, '..'),
    stdio: 'pipe',
  });
  running.push(child);

  const baseUrl = await new Promise<string>((resolve, reject) => {
    let output = '';
    let errors = '';
    const timeout = setTimeout(() => reject(new Error(`靶场启动超时: ${errors || output}`)), 5000);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { errors += chunk; });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`靶场提前退出: ${code} ${errors}`));
    });
  });

  return { child, baseUrl };
}

async function login(baseUrl: string, user: 'alice' | 'bob') {
  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user }),
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<{ token: string }>;
}

async function upload(baseUrl: string, token: string, filename: string, contentType: string, content: string) {
  return fetch(`${baseUrl}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename, contentType, content }),
  });
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((child) => new Promise<void>((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.kill();
    setTimeout(resolve, 1000);
  })));
});

describe('文件上传教学靶场', () => {
  it('不安全模式能复现越权、公开对象和危险文件上传', async () => {
    const { baseUrl } = await startLab('insecure');
    const alice = await login(baseUrl, 'alice');
    const bob = await login(baseUrl, 'bob');
    const uploaded = await upload(baseUrl, alice.token, 'note.txt', 'text/plain', 'hello');
    expect(uploaded.status).toBe(201);
    const file = await uploaded.json() as { id: string; publicUrl: string | null };

    const crossTenant = await fetch(`${baseUrl}/files/${file.id}`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    expect(crossTenant.status).toBe(200);
    expect(await crossTenant.json()).toMatchObject({ owner: 'alice', content: 'hello' });

    const publicObject = await fetch(`${baseUrl}${file.publicUrl}`);
    expect(publicObject.status).toBe(200);
    expect(await publicObject.text()).toBe('hello');

    const dangerous = await upload(baseUrl, alice.token, 'attack.html', 'text/html', '<script>alert(1)</script>');
    expect(dangerous.status).toBe(201);
  });

  it('安全模式阻断越权、公开对象、危险上传和超限内容', async () => {
    const { baseUrl } = await startLab('secure');
    const alice = await login(baseUrl, 'alice');
    const bob = await login(baseUrl, 'bob');
    const uploaded = await upload(baseUrl, alice.token, 'note.txt', 'text/plain', 'hello');
    expect(uploaded.status).toBe(201);
    const file = await uploaded.json() as { id: string };

    const crossTenant = await fetch(`${baseUrl}/files/${file.id}`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    expect(crossTenant.status).toBe(404);

    const publicObject = await fetch(`${baseUrl}/objects/${file.id}`);
    expect(publicObject.status).toBe(403);

    const dangerous = await upload(baseUrl, alice.token, 'attack.html', 'text/html', '<script>alert(1)</script>');
    expect(dangerous.status).toBe(415);

    const oversized = await upload(baseUrl, alice.token, 'large.txt', 'text/plain', 'a'.repeat(300 * 1024));
    expect(oversized.status).toBe(413);

    const ownerDownload = await fetch(`${baseUrl}/files/${file.id}`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    expect(ownerDownload.status).toBe(200);
    expect(ownerDownload.headers.get('content-disposition')).toContain('attachment');
    expect(ownerDownload.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
