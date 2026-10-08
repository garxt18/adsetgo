import test from "node:test";
import assert from "node:assert/strict";

import { signInAllowed } from "./sign-in-methods.ts";

const at = (method: string) => [{ method, timestamp: 1 }];

test("agencies and clients get in with Google only", () => {
  for (const role of ["agency_admin", "client"] as const) {
    assert.equal(signInAllowed(role, at("oauth"), false), true);
    assert.equal(signInAllowed(role, ["oauth"], false), true); // the RFC 8176 form
    assert.equal(signInAllowed(role, at("password"), false), false);
    assert.equal(signInAllowed(role, at("recovery"), false), false);
    assert.equal(signInAllowed(role, at("otp"), false), false);
    assert.equal(signInAllowed(role, undefined, false), false);
  }
});

test("the platform admin keeps the password backup", () => {
  assert.equal(signInAllowed("master_admin", at("password"), false), true);
  assert.equal(signInAllowed("master_admin", at("oauth"), false), true);
});

test("one-time links work in local development only", () => {
  assert.equal(signInAllowed("client", at("otp"), true), true);
  assert.equal(signInAllowed("agency_admin", at("magiclink"), true), true);
  assert.equal(signInAllowed("client", at("password"), true), false);
});

test("an account with no role gets nothing it could not get anyway", () => {
  assert.equal(signInAllowed(null, at("password"), false), false);
  assert.equal(signInAllowed(null, at("oauth"), false), true); // still has no profile, so no data
});
