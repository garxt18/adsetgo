export type SupabaseClientMode = "public" | "admin";

/**
 * Read a required Supabase setting, failing immediately when it is missing.
 *
 * A placeholder fallback here would let the app boot against an address that
 * does not exist, turning one clear configuration error into DNS timeouts on
 * every request, so an unset variable is treated as fatal.
 */
function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in .env.local (see .env.example).`
    );
  }

  return trimmed;
}

export function getSupabaseConfig(mode: SupabaseClientMode = "public") {
  const url = required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL
  );

  if (mode === "public") {
    return {
      url,
      key: required(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ),
    };
  }

  return {
    url,
    key: required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
  };
}
