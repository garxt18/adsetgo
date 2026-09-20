import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./supabase-env.ts";

const { url: supabaseUrl, key: supabasePublishableKey } =
  getSupabaseConfig("public");

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
