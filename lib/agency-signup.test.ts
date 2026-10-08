import test from "node:test";
import assert from "node:assert/strict";

import { agencySignupOpen, checkAgencySignup } from "./agency-signup.ts";

test("the address comes from the name unless one is given", () => {
  assert.deepEqual(checkAgencySignup({ name: "  Adshot   Media " }), { ok: true, name: "Adshot Media", slug: "adshot-media" });
  assert.deepEqual(checkAgencySignup({ name: "Adshot Media", slug: "Adshot UK!" }), {
    ok: true,
    name: "Adshot Media",
    slug: "adshot-uk",
  });
});

test("names and addresses that cannot be used are refused", () => {
  const refused = (input: { name?: unknown; slug?: unknown }) => {
    const result = checkAgencySignup(input);
    return result.ok ? "" : result.error;
  };

  assert.match(refused({ name: "" }), /name/);
  assert.match(refused({ name: 42 }), /name/);
  assert.match(refused({ name: "x".repeat(81) }), /under 80/);
  assert.match(refused({ name: "Ab", slug: "a!" }), /at least 3/);
  assert.match(refused({ name: "!!!" }), /name|at least 3/);
  // /agencies/new is the admin's own page; an agency there could never be opened.
  assert.match(refused({ name: "New", slug: "new" }), /reserved/);
  assert.match(refused({ name: "Login agency", slug: "LOGIN" }), /reserved/);
});

test("sign-ups are open unless switched off", () => {
  assert.equal(agencySignupOpen({}), true);
  assert.equal(agencySignupOpen({ AGENCY_SIGNUP_CLOSED: "0" }), true);
  assert.equal(agencySignupOpen({ AGENCY_SIGNUP_CLOSED: "1" }), false);
});
