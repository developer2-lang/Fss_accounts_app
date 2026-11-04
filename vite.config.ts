import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function isLoopbackAddress(address = ''): boolean {
  return address === '::1'
    || address === '::ffff:127.0.0.1'
    || address === '127.0.0.1'
    || address.startsWith('127.');
}

function payVendorDevProxy(env: Record<string, string>, command: string): Plugin {
  return {
    name: 'fss-pay-vendor-edge-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      if (command !== 'serve') return;
      server.middlewares.use('/api/fss-pay-vendor', async (req, res) => {
        const send = (status: number, error: string) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error }));
        };

        if (req.method !== 'POST') return send(405, 'Use POST for Pay a Vendor operations.');
        const host = String(req.headers.host || '').toLowerCase();
        const hostIsLocal = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
        if (!hostIsLocal || !isLoopbackAddress(req.socket.remoteAddress || '')) {
          return send(403, 'The Pay a Vendor proxy is available only from this development computer.');
        }
        const origin = req.headers.origin;
        if (!origin || new URL(origin).host.toLowerCase() !== host || !['http:', 'https:'].includes(new URL(origin).protocol)) {
          return send(403, 'Cross-origin Pay a Vendor requests are not allowed.');
        }

        const accessToken = env.FSS_EDGE_ACCESS_TOKEN;
        const projectUrl = env.VITE_SUPABASE_2_URL || env.VITE_SUPABASE_URL;
        const anonKey = env.VITE_SUPABASE_2_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
        if (!accessToken || accessToken.length < 32) {
          return send(503, 'FSS_EDGE_ACCESS_TOKEN is missing or too short in the local server environment.');
        }
        if (!projectUrl || !anonKey) return send(503, 'Supabase URL or anon key is missing from the local server environment.');

        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > 1_000_000) return send(413, 'Pay a Vendor request is too large.');
            chunks.push(buffer);
          }
          const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const upstream = await fetch(`${projectUrl.replace(/\/$/, '')}/functions/v1/fss-pay-vendor`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
              'x-fss-dev-access-token': accessToken
            },
            body: JSON.stringify(requestBody)
          });
          const bodyText = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(bodyText || JSON.stringify({ error: 'The Supabase Edge Function returned an empty response.' }));
        } catch (error: any) {
          send(502, `Could not reach the protected Supabase Edge Function: ${error?.message || 'network error'}`);
        }
      });
    }
  };
}

export default defineConfig(({ mode, command }) => {
  // loadEnv is used only by this server-side dev middleware. These values are
  // never copied into the browser bundle; only VITE_ values are client-visible.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), payVendorDevProxy(env, command)],
    server: {
      host: '127.0.0.1',
      port: 5174,
      strictPort: true,
      open: true
    }
  };
});
