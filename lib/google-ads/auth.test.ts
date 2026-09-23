import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGoogleAdsCustomerId } from "./format.ts";

test("normalizeGoogleAdsCustomerId removes non-digit characters", () => {
  assert.equal(normalizeGoogleAdsCustomerId("504-444-8248"), "5044448248");
  assert.equal(normalizeGoogleAdsCustomerId("514-845-4497"), "5148454497");
  assert.equal(normalizeGoogleAdsCustomerId("5044448248"), "5044448248");
});

test("normalizeGoogleAdsCustomerId rejects empty values", () => {
  assert.equal(normalizeGoogleAdsCustomerId(""), "");
  assert.equal(normalizeGoogleAdsCustomerId(undefined), "");
});
