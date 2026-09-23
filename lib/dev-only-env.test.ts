import test from "node:test";
import assert from "node:assert/strict";

import { devOnlyEnvError } from "./dev-only-env.ts";

const DEV_VARS = {
  DEV_ADMIN_EMAIL: "you@example.com",
  DEV_ADMIN_PASSWORD: "localpass",
  NEXT_PUBLIC_DEV_ADMIN_EMAIL: "you@example.com",
  NEXT_PUBLIC_DEV_ADMIN_PASSWORD: "localpass",
};

test("a local build with the dev shortcut configured is allowed", () => {
  assert.equal(devOnlyEnvError({ ...DEV_VARS }), null);
});

test("a deployment build carrying the dev shortcut is refused", () => {
  const vercel = devOnlyEnvError({ ...DEV_VARS, VERCEL: "1" });
  assert.match(vercel ?? "", /Refusing to build/);
  assert.match(vercel ?? "", /NEXT_PUBLIC_DEV_ADMIN_PASSWORD/);

  assert.match(devOnlyEnvError({ ...DEV_VARS, CI: "true" }) ?? "", /Refusing to build/);
});

test("a single leftover variable is enough to refuse", () => {
  const error = devOnlyEnvError({
    VERCEL: "1",
    NEXT_PUBLIC_DEV_ADMIN_PASSWORD: "localpass",
  });

  assert.match(error ?? "", /NEXT_PUBLIC_DEV_ADMIN_PASSWORD/);
  assert.doesNotMatch(error ?? "", /DEV_ADMIN_EMAIL/);
});

test("a clean deployment build is allowed", () => {
  assert.equal(devOnlyEnvError({ VERCEL: "1" }), null);
  assert.equal(devOnlyEnvError({ CI: "true" }), null);
});

test("blank values are not treated as set", () => {
  assert.equal(
    devOnlyEnvError({ VERCEL: "1", DEV_ADMIN_PASSWORD: "   " }),
    null
  );
});
