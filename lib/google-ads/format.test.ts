import test from "node:test";
import assert from "node:assert/strict";

import { normalizeGoogleAdsCustomerId, parseGoogleAdsCustomerId } from "./format.ts";

test("normalizeGoogleAdsCustomerId removes non-digit characters", () => {
  assert.equal(normalizeGoogleAdsCustomerId("504-444-8248"), "5044448248");
  assert.equal(normalizeGoogleAdsCustomerId("514-845-4497"), "5148454497");
  assert.equal(normalizeGoogleAdsCustomerId("5044448248"), "5044448248");
});

test("normalizeGoogleAdsCustomerId rejects empty values", () => {
  assert.equal(normalizeGoogleAdsCustomerId(""), "");
  assert.equal(normalizeGoogleAdsCustomerId(undefined), "");
});

test("a customer id is stored as ten digits however it was typed", () => {
  assert.equal(parseGoogleAdsCustomerId("358-312-5339"), "3583125339");
  assert.equal(parseGoogleAdsCustomerId(" 358 312 5339 "), "3583125339");
  assert.equal(parseGoogleAdsCustomerId("3583125339"), "3583125339");
});

test("anything that is not ten digits is refused", () => {
  for (const bad of ["", "12345", "358-312-53390", "abc", undefined, null]) {
    assert.equal(parseGoogleAdsCustomerId(bad), null, String(bad));
  }
});
