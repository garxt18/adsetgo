import test from "node:test";
import assert from "node:assert/strict";

process.env.GOOGLE_ADS_STATE_SECRET ??= "test-secret-for-state-signing";

const { signAgencyState, verifyAgencyState } = await import("./state.ts");

const AGENCY = "32b3e80e-a867-47e0-a800-534d901193ff";
const OTHER = "11111111-2222-3333-4444-555555555555";

test("a state this server signed round-trips to the same agency", () => {
  assert.equal(verifyAgencyState(signAgencyState(AGENCY)), AGENCY);
});

test("a hand-written state is rejected", () => {
  // The pre-fix callback accepted exactly these, which is how one tenant could
  // aim its authorization code at another tenant's agency.
  assert.equal(verifyAgencyState("ram"), null);
  assert.equal(verifyAgencyState(AGENCY), null);
});

test("swapping the agency id invalidates the signature", () => {
  const signed = signAgencyState(AGENCY);
  const tampered = signed.replace(AGENCY, OTHER);

  assert.notEqual(tampered, signed);
  assert.equal(verifyAgencyState(tampered), null);
});

test("an extended expiry invalidates the signature", () => {
  const signed = signAgencyState(AGENCY);
  const [agencyId, expiresAt, signature] = signed.split(".");
  const stretched = `${agencyId}.${Number(expiresAt) + 60_000}.${signature}`;

  assert.equal(verifyAgencyState(stretched), null);
});

test("an expired state is rejected even though it is correctly signed", async () => {
  const signed = signAgencyState(AGENCY);
  const [agencyId, , signature] = signed.split(".");

  // Re-sign with an expiry in the past, the way a stale link would look.
  const { createHmac } = await import("node:crypto");
  const payload = `${agencyId}.${Date.now() - 1000}`;
  const expired = `${payload}.${createHmac("sha256", process.env.GOOGLE_ADS_STATE_SECRET!)
    .update(payload)
    .digest("base64url")}`;

  assert.notEqual(expired, signature);
  assert.equal(verifyAgencyState(expired), null);
});

test("malformed states never throw", () => {
  for (const bad of ["", ".", "..", "a.b", "a.b.c", "....", "x".repeat(500)]) {
    assert.equal(verifyAgencyState(bad), null);
  }

  assert.equal(verifyAgencyState(null), null);
});
