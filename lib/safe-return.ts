/**
 * A same-site path to send someone back to, or the fallback.
 *
 * Accepting any value that "starts with /" is not enough: browsers read `//x`
 * and `/\x` as "go to the site x", so either would turn a back link on our
 * sign-in pages into a redirect to someone else's. Only plain paths on this
 * site are followed.
 */
export function safeReturn(value: string | null | undefined, fallback = "/login"): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
