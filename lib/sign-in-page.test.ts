import test from "node:test";
import assert from "node:assert/strict";

import { signInError, signInPage } from "./sign-in-page.ts";

test("Google sends people back only to a real sign-in screen", () => {
  assert.equal(signInPage("/login"), "/login");
  assert.equal(signInPage("/agencies/adshot-media/login"), "/agencies/adshot-media/login");
  assert.equal(signInPage("/agencies/adshot-media/client-login"), "/agencies/adshot-media/client-login");
  assert.equal(signInPage("/signup"), "/signup");

  for (const elsewhere of [
    null,
    "",
    "https://evil.example/login",
    "//evil.example/login",
    "/dashboard",
    "/agencies/adshot-media/dashboard",
    "/signup/agency",
    "/agencies/../login",
    "/login?next=//evil.example",
  ]) {
    assert.equal(signInPage(elsewhere), "/login", String(elsewhere));
  }
});

test("only known errors are shown", () => {
  assert.match(signInError("not_invited"), /not been invited/);
  assert.equal(signInError("<script>"), "");
  assert.equal(signInError(undefined), "");
  assert.equal(signInError(["not_invited"]), "");
  assert.equal(signInError("toString"), "");
});
