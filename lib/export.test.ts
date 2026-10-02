import test from "node:test";
import assert from "node:assert/strict";

import { csvCell, fileSlug, toCsv } from "./export.ts";

test("text is quoted and inner quotes are doubled", () => {
  assert.equal(csvCell('Search "Brand"'), '"Search ""Brand"""');
  assert.equal(csvCell("a, b"), '"a, b"');
});

test("a value a spreadsheet would run as a formula is neutralised", () => {
  // CSV injection: opened in Excel or Sheets, these would execute.
  for (const hostile of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1"]) {
    assert.ok(csvCell(hostile).startsWith(`"'`), hostile);
  }
});

test("numbers stay numbers, and missing values are empty", () => {
  assert.equal(csvCell(1279.5), "1279.5");
  assert.equal(csvCell(-3.2), "-3.2");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(Number.NaN), "");
});

test("rows become lines", () => {
  assert.equal(toCsv([["Campaign", "Spend"], ["Brand", 685.04]]), '"Campaign","Spend"\r\n"Brand",685.04');
});

test("file names are tidy", () => {
  assert.equal(fileSlug("Adshot Media"), "adshot-media");
  assert.equal(fileSlug("  Café & Co!  "), "cafe-co");
  assert.equal(fileSlug("!!!"), "report");
});
