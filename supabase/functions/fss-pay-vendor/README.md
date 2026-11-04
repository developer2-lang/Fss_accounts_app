# Pay a Vendor Edge Function

The IUOVA app uses a local role selector rather than Supabase Auth. Browser-side PostgREST writes therefore cannot satisfy the table policy's `auth.uid()` check. Vendor payment database operations now go through this function instead.

## Access model for local development

- The browser calls `/api/fss-pay-vendor` on the local Vite server.
- The Vite middleware accepts only loopback requests with a same-origin `Origin` header and keeps `FSS_EDGE_ACCESS_TOKEN` on the server.
- The middleware forwards to this Edge Function with the access token.
- The Edge Function checks the token in constant time and exposes only allowlisted CRUD operations on `fss_form_pay_vendor`.
- `SUPABASE_SERVICE_ROLE_KEY` is read only inside the Edge Function runtime. Supabase injects it there; never put it in an app `.env` or `VITE_*` variable.
- RLS remains enabled. The function uses the privileged client, so it applies an explicit owner scope (`FSS_DEFAULT_CREATED_BY`) itself. If no default owner is configured, it scopes records to `created_by IS NULL` for this development installation.

This proxy is development-only. Do not deploy the Vite server as a public production backend. Production access needs a server-side proxy or an authenticated identity provider.

## Configure and deploy

1. Generate a random token with at least 32 bytes of entropy. Put the same value in the root `.env` as `FSS_EDGE_ACCESS_TOKEN` and in `supabase/.env.pay-vendor.local` as `FSS_EDGE_ACCESS_TOKEN=...`. This local secrets file is git-ignored.
2. Optionally add `FSS_DEFAULT_CREATED_BY=<Auth user UUID>` to `supabase/.env.pay-vendor.local` to scope rows to a dedicated Supabase Auth user. No app login UI is needed.
3. Link the Supabase CLI to the project in this workspace, then set the function secrets and deploy:

   ```powershell
   supabase secrets set --env-file supabase/.env.pay-vendor.local
   supabase functions deploy fss-pay-vendor
   ```

   The function gateway has `verify_jwt = false` because the local IUOVA app has no Supabase user JWT. The handler still rejects every request without the private access token. Do not remove that check or place the token in browser code.

## Operations

POST JSON operations are `select`, `insert`, `update`, and `delete`. The function permits only fields belonging to `fss_form_pay_vendor`, assigns `created_by` from the configured owner scope, and uses a deterministic row UUID for retries of app-originated inserts. No other table is accessed.
