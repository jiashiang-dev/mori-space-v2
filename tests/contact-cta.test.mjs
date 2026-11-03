import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Closing has approved copy and an inactive contact placeholder", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const closing = html.match(/<footer[^>]*id="contact"[\s\S]*?<\/footer>/)[0];
  assert.match(closing, /<h2 id="contact-title">BEGIN A<br>CONVERSATION\.<\/h2>/);
  assert.match(closing, />Contact MORI<\/p>/);
  assert.match(closing, />hello@moristudio\.example<\/p>/);
  assert.doesNotMatch(html, /mailto:/);
  assert.match(closing, /href="#top"/);
});
