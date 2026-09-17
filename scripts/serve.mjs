/**
 * A static server for the built app. No dependencies, no configuration.
 *
 * Microphone access needs a secure context, and `localhost` counts as one —
 * which is why this exists rather than just opening the file directly. ES
 * modules would be blocked over `file://` in any case.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT ?? 4173);

/**
 * The conversation proxy.
 *
 * The browser owns the tools, because that is where the player's session and
 * library live. The key has to stay here, because a key in a page is a key
 * you have given away. So this relays one Messages API call and nothing else,
 * and the agent loop runs in the page around it.
 *
 * Everything below is optional. Without a key the app is exactly as capable as
 * it was before; only the conversation panel is unavailable.
 */
const MAX_BODY_BYTES = 1_000_000;
const MAX_TOKENS_CEILING = 8192;

let anthropic = null;
let anthropicError = null;

async function getClient() {
  if (anthropic || anthropicError) return anthropic;
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    anthropic = new Anthropic();
    return anthropic;
  } catch (err) {
    anthropicError = err;
    return null;
  }
}

/**
 * An unset ANTHROPIC_API_KEY does not mean there are no credentials — the SDK
 * also picks up an `ant auth login` profile from disk. Checking only the env
 * var would tell people with a working setup that they have none.
 */
function hasCredentials() {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  const home = process.env.HOME ?? homedir();
  return existsSync(join(home, '.config', 'anthropic'));
}

function conversationStatus() {
  if (anthropicError) {
    return { available: false, reason: 'The Anthropic SDK is not installed. Run npm install.' };
  }
  if (!hasCredentials()) {
    return {
      available: false,
      reason: 'No credentials. Set ANTHROPIC_API_KEY, or run `ant auth login`, then restart the server.',
    };
  }
  return { available: true, reason: null };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('That request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

async function handleChat(req, res) {
  const client = await getClient();
  const status = conversationStatus();
  if (!client || !status.available) {
    sendJson(res, 503, { error: status.reason ?? 'The conversation is not available.' });
    return;
  }

  let request;
  try {
    request = JSON.parse(await readBody(req));
  } catch (err) {
    sendJson(res, 400, { error: `Could not read that request: ${err.message}` });
    return;
  }

  if (!Array.isArray(request?.messages) || !Array.isArray(request?.tools)) {
    sendJson(res, 400, { error: 'A chat request needs messages and tools.' });
    return;
  }

  try {
    const message = await client.beta.messages.create({
      model: request.model ?? 'claude-opus-5',
      max_tokens: Math.min(Number(request.max_tokens) || 4096, MAX_TOKENS_CEILING),
      system: request.system,
      messages: request.messages,
      tools: request.tools,
      ...(request.output_config ? { output_config: request.output_config } : {}),
      // If a safety classifier declines a request, the same call is re-run on a
      // fallback model instead of the player just getting nothing back.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    sendJson(res, 200, message);
  } catch (err) {
    // Status is what the page needs to tell the difference between "your key is
    // wrong" and "try again in a minute".
    const status = err?.status ?? 500;
    sendJson(res, status, { error: err?.message ?? 'The model could not be reached.' });
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  // Redirect rather than rewriting: the page's relative URLs resolve against
  // whatever the browser thinks the current directory is, so serving the app
  // at "/" while its files live under "/web/" would break every one of them.
  if (pathname === '/' || pathname === '/index.html' || pathname === '/web' || pathname === '/web/') {
    res.writeHead(302, { location: '/web/index.html' }).end();
    return;
  }

  if (pathname === '/api/status') {
    await getClient();
    sendJson(res, 200, conversationStatus());
    return;
  }

  if (pathname === '/api/chat') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Post a chat request here.' });
      return;
    }
    await handleChat(req, res);
    return;
  }

  // Normalise before joining so that `..` cannot escape the served directory.
  const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'content-type': TYPES[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(await readFile(filePath));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, async () => {
  console.log(`\n  Guitar AI Coach → http://localhost:${PORT}\n`);
  console.log('  Allow microphone access when prompted, then press Start listening.');
  await getClient();
  const status = conversationStatus();
  console.log(status.available
    ? '  Conversation: on (claude-opus-5, with refusal fallbacks enabled).\n'
    : `  Conversation: off — ${status.reason}\n`);
});
