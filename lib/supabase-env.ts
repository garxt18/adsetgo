export type SupabaseClientMode = "public" | "admin";

export function getSupabaseConfig(mode: SupabaseClientMode = "public") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "https://placeholder.supabase.co";
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "placeholder-public-key";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "placeholder-service-role-key";

  if (mode === "public") {
    return { url, key: publicKey };
  }

  return { url, key: serviceRoleKey };
}
