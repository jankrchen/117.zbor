/**
 * Production server: serves the built app (dist/) and the local IBKR API.
 * Binds to 127.0.0.1 only, so nothing is reachable from the network.
 *
 *   npm run build && npm start
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { handleApi } from './api.ts';

const PORT = Number(process.env.PORT ?? 5174);
const ROOT = resolve(import.meta.dirname, '..', 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
};

createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    let p = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let file = join(ROOT, p);
    if (!file.startsWith(ROOT)) throw new Error('bad path');
    if (!(await stat(file).catch(() => null))?.isFile()) file = join(ROOT, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', ...SECURITY_HEADERS });
    res.end(body);
  } catch {
    res.writeHead(404, SECURITY_HEADERS);
    res.end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Trade Journal beží na http://localhost:${PORT}`);
  if (!process.env.IBKR_FLEX_TOKEN) console.log('IBKR synchronizácia nie je nastavená (pozri .env.example).');
});
