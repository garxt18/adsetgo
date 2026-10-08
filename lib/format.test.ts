import test from "node:test";
import assert from "node:assert/strict";

import { formatAmounts, formatCurrency, formatNumber } from "./format.ts";

test("money is shown in the account's own currency", () => {
  assert.equal(formatCurrency(1278.76, "GBP"), "£1,279");
  assert.equal(formatCurrency(49.18, "GBP"), "£49.18");
  assert.equal(formatCurrency(1500, "USD"), "$1,500");
  assert.equal(formatCurrency(1500, "EUR"), "€1,500");
});

test("rupees keep Indian grouping; other currencies do not", () => {
  assert.equal(formatCurrency(189449, "INR"), "₹1,89,449");
  assert.equal(formatCurrency(189449, "GBP"), "£189,449");
  assert.equal(formatNumber(111141, "INR"), "1,11,141");
  assert.equal(formatNumber(111141, "GBP"), "111,141");
});

test("with no currency given, figures are in rupees as before", () => {
  assert.equal(formatCurrency(3529), "₹3,529");
  assert.equal(formatNumber(111141), "1,11,141");
});

test("amounts in several currencies are listed side by side, never added", () => {
  assert.equal(formatAmounts([{ value: 3543, currency: "INR" }, { value: 1278.76, currency: "GBP" }]), "₹3,543 · £1,279");
  assert.equal(formatAmounts([]), "—");
});
