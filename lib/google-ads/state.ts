import { createHmac, timingSafeEqual } from "node:crypto";

import { getSupabaseConfig } from "../supabase/env.ts";

/**
 * Signed `state` for the Google Ads OAuth round trip.
 *
 * The callback writes a refresh token onto whichever agency `state` names, and
 * Google hands `state` back through the user's browser, so an unsigned value
 * lets any caller point a legitimately obtained authorization code at another
 * tenant. /api/google-ads/auth already proves the caller may connect an agency
 * before it mints the state, and a signature is what carries that proof to the
 * callback.
 */

/** Ten minutes: long enough to finish Google's consent screen, short enough to not linger. */
const STATE_TTL_MS = 10 * 60 * 1000;

function getSecret(): string {
  // Falls back to the service role key so there is no extra secret to provision;
  // set GOOGLE_ADS_STATE_SECRET to rotate state signing independently.
  return (
    process.env.GOOGLE_ADS_STATE_SECRET?.trim() ||
    getSupabaseConfig("admin").key
  );
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function signAgencyState(agencyId: string): string {
  const payload = `${agencyId}.${Date.now() + STATE_TTL_MS}`;

  return `${payload}.${sign(payload)}`;
}

/**
 * Returns the agency id carried by a valid, unexpired state, otherwise null.
 * Never throws: an unparseable state is simply not a valid one.
 */
export function verifyAgencyState(state: string | null): string | null {
  if (!state) {
    return null;
  }

  const separator = state.lastIndexOf(".");
  if (separator <= 0) {
    return null;
  }

  const payload = state.slice(0, separator);
  const signature = state.slice(separator + 1);
  const expected = sign(payload);

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);

  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null;
  }

  const [agencyId, expiresAt] = payload.split(".");
  if (!agencyId || !expiresAt) {
    return null;
  }

  if (!Number.isFinite(Number(expiresAt)) || Number(expiresAt) < Date.now()) {
    return null;
  }

  return agencyId;
}
