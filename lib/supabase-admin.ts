import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./supabase-env.ts";

const { url: supabaseUrl, key: supabaseServiceKey } =
  getSupabaseConfig("admin");

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
