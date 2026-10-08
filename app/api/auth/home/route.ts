import { NextResponse } from "next/server";

import { requireApiAuth } from "@/lib/api-auth";
import { homeFor } from "@/lib/home";

/**
 * Where the signed-in person belongs.
 *
 * Answered here rather than in the browser because row level security stops a
 * client from reading the `agencies` table, so a page working it out itself
 * could not find a client's agency and sent them back to sign in. The server
 * reads with the service role, and still answers only for the caller's own
 * profile.
 */
export async function GET() {
  const { profile, response: authError } = await requireApiAuth();
  if (authError) return authError;

  const path = await homeFor(profile);
  return NextResponse.json({ path }, { status: path ? 200 : 404 });
}
