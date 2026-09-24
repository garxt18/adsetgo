import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./env.ts";

const { url: supabaseUrl, key: supabasePublishableKey } =
  getSupabaseConfig("public");

/**
 * Browser Supabase client.
 *
 * This must be the `@supabase/ssr` browser client rather than the plain
 * `createClient`: that one keeps the session in localStorage, which the server
 * cannot read. The middleware and every API route resolve the caller from
 * cookies, so a localStorage-only session means a person signs in successfully
 * and is then bounced straight back to the login page by the middleware, with
 * no error to explain it.
 */
export const supabase = createBrowserClient(supabaseUrl, supabasePublishableKey);
