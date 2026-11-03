import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import viteConfig from "../vite.config.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("poster references use one case-correct, build-managed first-frame image", () => {
  const refs = [
    html.match(/<link rel="preload" as="image" href="([^"]+)"/)[1],
    html.match(/class="hero-image hero-poster"\s+src="([^"]+)"/)[1],
    html.match(/\sposter="([^"]+)"/)[1],
  ];
  assert.deepEqual(refs, Array(3).fill("assets/mori-hero-poster.jpg"));
  assert.ok(readdirSync(new URL("../assets/", import.meta.url)).includes("mori-hero-poster.jpg"));
  const poster = readFileSync(new URL("../" + refs[0], import.meta.url));
  assert.equal(poster.subarray(0, 2).toString("hex"), "ffd8", "real JPEG, not HTML or an LFS pointer");
  assert.deepEqual(poster, readFileSync(new URL("../public/videos/mori-hero-poster.jpg", import.meta.url)), "desktop visual is byte-identical");
});

test("video uses the build base, inline silent attributes and seek-friendly encoding", () => {
  const video = html.match(/<video[\s\S]*?<\/video>/)[0];
  assert.match(video, /data-src="%BASE_URL%videos\/mori-hero-walkthrough\.mp4"/);
  assert.match(video, /\smuted\s/);
  assert.match(video, /\splaysinline\s/);
  assert.match(video, /\swebkit-playsinline\s/);
  assert.doesNotMatch(video, /\s(?:autoplay|controls|loop)(?:\s|=|>)/);
  assert.ok(readdirSync(new URL("../public/videos/", import.meta.url)).includes("mori-hero-walkthrough.mp4"));
  const mp4 = readFileSync(new URL("../public/videos/mori-hero-walkthrough.mp4", import.meta.url));
  assert.equal(mp4.toString("ascii", 4, 8), "ftyp");
  assert.ok(mp4.indexOf("moov") < mp4.indexOf("mdat"), "metadata is before the video for faststart");
  assert.ok(mp4.includes(Buffer.from("avc1")), "H.264 video retained");
});

test("only mobile/tablet media visibility changes; cover and UI stacking remain intact", () => {
  const rules = css.slice(css.indexOf("/* Phones and iPads"), css.indexOf("/* Only these two text nodes"));
  assert.match(rules, /@media \(max-width: 1024px\)/);
  assert.match(rules, /\.video-hero \.hero-video\s*\{\s*opacity: 0/);
  assert.match(rules, /\.video-hero\.hero-media-ready \.hero-video\s*\{\s*opacity: 1/);
  assert.doesNotMatch(rules, /display: none|visibility: hidden|\.hero-title|\.hero-shell|\.hero-bottom/);
  assert.match(css, /\.video-hero \.hero-image,\s*\.hero-video\s*\{[^}]*object-fit: cover/);
  assert.match(css, /\.video-hero \.hero-overlay\s*\{\s*z-index: 1/);
  assert.match(css, /\.video-hero \.hero-shell\s*\{\s*z-index: 2/);
});

test("deferred video resolves inside the GitHub Pages repository instead of the domain root", () => {
  const source = html.match(/\sdata-src="([^"]+)"/)[1];
  const site = new URL("https://jiashiang-dev.github.io/mori-space-v2/");
  const video = new URL(source.replace("%BASE_URL%", viteConfig.base), site);
  assert.equal(video.pathname, site.pathname + "videos/mori-hero-walkthrough.mp4");
  const publicFile = new URL("../public/" + video.pathname.slice(site.pathname.length), import.meta.url);
  assert.equal(readFileSync(publicFile).toString("ascii", 4, 8), "ftyp");
});
