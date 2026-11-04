import type { IncomingMessage, ServerResponse } from 'node:http';

export default function handler(_request: IncomingMessage, response: ServerResponse): void {
  response.statusCode = 410;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify({
    error: 'Pay a Vendor is disabled in production until Supabase Auth and server-side role authorization are implemented.'
  }));
}
