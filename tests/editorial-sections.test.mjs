import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const html = read("index.html");
const services = html.match(/<section class="v2-services[^"]*"[\s\S]*?<\/section>/)[0];

test("homepage follows the approved visual section order", () => {
  assert.deepEqual([...html.matchAll(/<section[^>]*\sid="([^"]+)"/g)].map(match => match[1]),
    ["top", "philosophy", "projects", "services", "furniture", "about"]);
  assert.match(html, /assets\/mori-n01-philosophy\.png/);
  assert.match(html, /assets\/mori-n03-furniture\.png/);
  assert.equal((html.match(/href="\.\/projects\/warm-minimal-living-study\/"/g) || []).length, 1);
});

test("Services preserves all five working chapter destinations and excludes imagery", () => {
  const chapterIds = ["interior-renovation", "space-planning", "bespoke-furniture", "residential-interiors", "commercial-spaces"];
  const reading = read("services/index.html");
  assert.deepEqual([...services.matchAll(/href="\.\/services\/#([^"]+)"/g)].map(match => match[1]), chapterIds);
  for (const id of chapterIds) assert.ok(reading.includes('id="' + id + '"'));
  assert.match(services, /href="\.\/services\/"/);
  assert.doesNotMatch(services, /<img\b|<figcaption\b|\bN02\b/);
});

test("Furniture categories and Signature Pieces remain static", () => {
  const furniture = html.match(/<section class="v2-furniture"[\s\S]*?<\/section>/)[0];
  assert.deepEqual([...furniture.matchAll(/href="([^"]+)"/g)].map(match => match[1]), ["#furniture-studies"]);
  assert.equal((furniture.match(/<li>/g) || []).length, 9);
  assert.doesNotMatch(furniture, /Read chapter|View details/);
});
