import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs the production server exactly like `npm start` does (plain Node, native TS type stripping),
// so syntax that only bundlers understand is caught by the test suite.
describe('production server', () => {
  it('starts with plain Node and answers the local API', async () => {
    const port = 15000 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, [resolve(__dirname, 'index.ts')], {
      env: { ...process.env, PORT: String(port), IBKR_FLEX_TOKEN: '', IBKR_FLEX_QUERY_IDS: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    try {
      await new Promise<void>((ok, fail) => {
        child.stdout.on('data', (d) => String(d).includes('beží') && ok());
        child.on('exit', (code) => fail(new Error(`server exited (${code}): ${stderr}`)));
        setTimeout(() => fail(new Error(`server did not start: ${stderr}`)), 10_000);
      });
      const r = await fetch(`http://localhost:${port}/api/ibkr/status`, { headers: { 'X-Trade-Journal': '1' } });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ configured: false });
    } finally {
      child.kill();
    }
  }, 15_000);
});
