import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApi } from './server/api.ts';

/** Mounts the local IBKR API into the Vite dev server. */
function ibkrApi(): Plugin {
  return {
    name: 'ibkr-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handleApi(req, res).then((handled) => !handled && next()).catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load IBKR_* secrets into the server process only. Vite exposes only VITE_* vars to the browser,
  // so the token never ends up in the client bundle.
  const env = loadEnv(mode, process.cwd(), 'IBKR_');
  for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

  return {
    plugins: [react(), ibkrApi()],
    server: { host: '127.0.0.1' },
    preview: { host: '127.0.0.1' },
    test: { globals: true },
  } as any;
});
