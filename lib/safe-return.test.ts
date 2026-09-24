import test from "node:test";
import assert from "node:assert/strict";

import { safeReturn } from "./safe-return.ts";

test("a plain path on this site is followed", () => {
  assert.equal(safeReturn("/agencies/ram/client-login"), "/agencies/ram/client-login");
  assert.equal(safeReturn("/login"), "/login");
});

test("anything that would leave the site falls back", () => {
  // Each of these is read by a browser as a different website.
  for (const hostile of [
    "//evil.com",
    String.raw`/\evil.com`,
    "https://evil.com",
    "evil.com",
    "javascript:alert(1)",
    "/\u0009/evil.com",
  ]) {
    assert.equal(safeReturn(hostile), "/login", hostile);
  }
});

test("a missing value falls back", () => {
  assert.equal(safeReturn(null), "/login");
  assert.equal(safeReturn(""), "/login");
  assert.equal(safeReturn(undefined, "/dashboard"), "/dashboard");
});
