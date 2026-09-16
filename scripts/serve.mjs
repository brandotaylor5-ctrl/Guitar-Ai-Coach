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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT ?? 4173);

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

server.listen(PORT, () => {
  console.log(`\n  Guitar AI Coach → http://localhost:${PORT}\n`);
  console.log('  Allow microphone access when prompted, then press Start listening.\n');
});
