import { supabase } from "./supabase/browser.ts";

/**
 * Signing out means signing out of everything, including the local development
 * shortcut. Only one of the four sign-out buttons used to clear that cookie, so
 * it outlived the session it came with.
 */
export async function signOut(): Promise<void> {
  document.cookie = "dev_admin_override=; path=/; max-age=0; SameSite=Lax";
  await supabase.auth.signOut();
}
