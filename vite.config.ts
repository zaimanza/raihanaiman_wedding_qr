import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import submit from './api/submit.ts';

function localSubmitApi(): Plugin {
  return {
    name: 'local-wedding-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/api/submit') return next();
        void submit(request, response);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Only the Node development server receives secrets. Vite exposes VITE_* to clients.
  const env = loadEnv(mode, process.cwd(), 'TELEGRAM_');
  for (const name of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']) {
    if (env[name] && !process.env[name]) process.env[name] = env[name];
  }
  return { plugins: [react(), localSubmitApi()] };
});
