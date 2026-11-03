import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");

function fixture({ reduced = false, gsapAvailable = true } = {}) {
  const events = new Map();
  const raf = new Map();
  const seeks = [];
  const tweens = [];
  const timelines = [];
  const heroClasses = new Set();
  const hero = { classList: {
    add(name) { heroClasses.add(name); },
    remove(name) { heroClasses.delete(name); },
  } };
  const textElement = () => ({ style: {
    opacity: "", transform: "",
    removeProperty(name) { this[name] = ""; },
  } });
  const title = textElement();
  const support = textElement();
  let frame = 0;
  let currentTime = 0;
  let src = "";
  let loads = 0;
  const motion = { matches: reduced, addEventListener(name, fn) { events.set("motion:" + name, fn); } };
  const video = {
    dataset: { src: "/mori-space-v2/videos/mori-hero-walkthrough.mp4", fps: "24" },
    hidden: false,
    readyState: 0,
    videoWidth: 0,
    error: null,
    duration: 12,
    seeking: false,
    paused: true,
    pause() { this.paused = true; },
    play() { throw new Error("Scroll video must never call play()"); },
    load() { loads++; },
    getAttribute(name) { return name === "src" ? src : null; },
    addEventListener(name, fn) {
      const previous = events.get(name);
      events.set(name, previous ? (...args) => { previous(...args); fn(...args); } : fn);
    },
    get src() { return src; },
    set src(value) { src = value; },
    get currentTime() { return currentTime; },
    set currentTime(value) {
      currentTime = value;
      this.seeking = true;
      seeks.push(value);
    },
  };
  const gsap = {
    registerPlugin() {},
    set(target, values) {
      target.style.opacity = String(values.opacity);
      target.style.transform = `translateY(${values.y}px)`;
    },
    timeline(options) {
      const timeline = {
        options, steps: [], position: 0, killed: false,
        fromTo(target, from, to, at) {
          this.steps.push({ target, from, to, at });
          return this;
        },
        to(target, to, at) {
          this.steps.push({ target, to, at });
          return this;
        },
        progress(value) { this.position = value; return this; },
        kill() { this.killed = true; },
      };
      timelines.push(timeline);
      return timeline;
    },
    to(playhead, options) {
      const tween = {
        playhead, options, killed: false, pinKilled: false,
        kill() { this.killed = true; },
        progress() { return playhead.progress; },
      };
      tween.scrollTrigger = { kill() { tween.pinKilled = true; } };
      tweens.push(tween);
      return tween;
    },
  };
  const win = {
    matchMedia: (query) => query.includes("reduced-motion") ? motion : { matches: false, addEventListener() {} },
    addEventListener() {},
    innerWidth: 1440, innerHeight: 900, scrollY: 0,
    gsap: gsapAvailable ? gsap : undefined,
    ScrollTrigger: gsapAvailable ? { refresh() {} } : undefined,
  };
  const doc = {
    hidden: false, readyState: "complete",
    documentElement: { classList: { remove() {}, add() {} } },
    querySelector(selector) {
      if (selector === "[data-hero-video]") return video;
      if (selector === ".video-hero") return hero;
      if (selector === "[data-hero-title]") return title;
      if (selector === "[data-hero-support]") return support;
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  vm.runInNewContext(source, {
    document: doc, window: win,
    requestAnimationFrame(fn) { raf.set(++frame, fn); return frame; },
    cancelAnimationFrame(id) { raf.delete(id); },
  });
  const flush = () => {
    const pending = [...raf.values()];
    raf.clear();
    pending.forEach(fn => fn());
  };
  const completeSeek = () => {
    video.seeking = false;
    events.get("seeked")();
    flush();
  };
  const progress = (value) => {
    const tween = tweens.at(-1);
    tween.playhead.progress = value;
    tween.options.onUpdate();
    flush();
  };
  return { video, win, motion, events, tweens, timelines, title, support, heroClasses,
    seeks, flush, completeSeek, progress, loads: () => loads };
}

test("starts paused at frame zero and pins only after valid metadata", () => {
  const f = fixture();
  assert.equal(f.video.paused, true);
  assert.equal(f.video.currentTime, 0);
  assert.equal(f.loads(), 1);
  assert.equal(f.video.src, "/mori-space-v2/videos/mori-hero-walkthrough.mp4");
  assert.equal(f.tweens.length, 0);
  f.events.get("loadedmetadata")();
  assert.equal(f.tweens.length, 1);
  const st = f.tweens[0].options.scrollTrigger;
  assert.equal(st.pin, true);
  assert.equal(st.scrub, 0.65);
  assert.equal(st.end(), "+=7200");
  f.win.innerWidth = 390;
  assert.equal(st.end(), "+=5400");
});

test("scrubs forward and backward without playback", () => {
  const f = fixture();
  f.events.get("loadedmetadata")();
  f.flush();
  f.progress(0.5);
  assert.ok(Math.abs(f.video.currentTime - 5.9895833) < 0.001);
  f.completeSeek();
  f.progress(0.25);
  assert.ok(Math.abs(f.video.currentTime - 2.9947917) < 0.001);
  assert.equal(f.video.paused, true);
});

test("coalesces rapid direction changes while a seek is in flight", () => {
  const f = fixture();
  f.events.get("loadedmetadata")();
  f.progress(0.2);
  f.progress(0.8);
  f.progress(0.1);
  assert.equal(f.seeks.length, 1);
  f.completeSeek();
  assert.equal(f.seeks.length, 2);
  assert.ok(Math.abs(f.seeks[1] - 1.1979167) < 0.001);
});

test("clamps the first and last frames within the media duration", () => {
  const f = fixture();
  f.events.get("loadedmetadata")();
  f.progress(1);
  assert.ok(f.video.currentTime < f.video.duration);
  assert.ok(f.video.currentTime > f.video.duration - 1 / 24);
  f.completeSeek();
  f.progress(0);
  assert.equal(f.video.currentTime, 0);
});

test("reduced motion avoids video loading and pinning", () => {
  const f = fixture({ reduced: true });
  assert.equal(f.video.hidden, true);
  assert.equal(f.loads(), 0);
  assert.equal(f.tweens.length, 0);
});

test("media errors remove the pin and preserve a static Hero", () => {
  const f = fixture();
  f.events.get("loadedmetadata")();
  f.events.get("error")();
  assert.equal(f.video.hidden, true);
  assert.equal(f.tweens[0].killed, true);
  assert.equal(f.tweens[0].pinKilled, true);
});

test("invalid metadata or unavailable GSAP never traps page scrolling", () => {
  const invalid = fixture();
  invalid.video.duration = NaN;
  invalid.events.get("loadedmetadata")();
  assert.equal(invalid.tweens.length, 0);
  const unavailable = fixture({ gsapAvailable: false });
  assert.equal(unavailable.loads(), 0);
  assert.equal(unavailable.video.src, "");
  unavailable.events.get("loadedmetadata")();
  assert.equal(unavailable.tweens.length, 0);
  assert.equal(invalid.heroClasses.has("hero-type-static"), true);
  assert.equal(unavailable.heroClasses.has("hero-type-static"), true);
});

test("typography has staggered entrances, a shared hold and support-first exits", () => {
  const f = fixture();
  f.events.get("loadedmetadata")();
  assert.equal(f.tweens.length, 1, "video retains the only ScrollTrigger");
  assert.equal(f.timelines.length, 1);
  const timeline = f.timelines[0];
  assert.equal(f.title.style.opacity, "0");
  assert.equal(f.support.style.opacity, "0");
  assert.equal(timeline.options.paused, true);
  assert.equal(timeline.options.defaults.ease, "sine.inOut");
  assert.equal(timeline.options.scrollTrigger, undefined);
  const [titleIn, supportIn, supportOut, titleOut] = timeline.steps;
  assert.equal(titleIn.target, f.title);
  assert.equal(supportIn.target, f.support);
  assert.equal(supportOut.target, f.support);
  assert.equal(titleOut.target, f.title);
  assert.deepEqual(timeline.steps.map(step => step.at), [0, 0.08, 0.5, 0.62]);
  assert.deepEqual([titleIn.from.opacity, titleIn.from.y, titleIn.to.opacity, titleIn.to.y], [0, 20, 1, 0]);
  assert.deepEqual([supportIn.from.opacity, supportIn.from.y, supportIn.to.opacity, supportIn.to.y], [0, 12, 1, 0]);
  assert.ok(supportIn.at + supportIn.to.duration < supportOut.at, "both texts have a fully-visible hold");
  assert.deepEqual([supportOut.to.opacity, supportOut.to.y, titleOut.to.opacity, titleOut.to.y], [0, -12, 0, -20]);
  assert.equal(titleOut.at + titleOut.to.duration, 1, "normalized sequence spans the entire video scrub");
});

test("paused text timeline follows the exact video progress in both directions", () => {
  const f = fixture();
  f.events.get("loadedmetadata")();
  const timeline = f.timelines[0];
  assert.equal(timeline.position, 0);
  for (const progress of [0.15, 0.4, 0.65, 1, 0.65, 0.4, 0.15, 0]) {
    f.progress(progress);
    assert.equal(timeline.position, progress);
    assert.equal(timeline.options.paused, true);
    f.completeSeek();
  }
});

test("static fallbacks restore text without touching its layout properties", () => {
  const f = fixture();
  f.events.get("loadedmetadata")();
  f.title.style.opacity = "0";
  f.title.style.transform = "translateY(-20px)";
  f.title.style.fontSize = "7rem";
  f.support.style.opacity = "0";
  f.support.style.transform = "translateY(-12px)";
  f.events.get("error")();
  assert.equal(f.timelines[0].killed, true);
  assert.equal(f.heroClasses.has("hero-type-static"), true);
  assert.equal(f.title.style.opacity, "");
  assert.equal(f.title.style.transform, "");
  assert.equal(f.title.style.fontSize, "7rem");
  assert.equal(f.support.style.opacity, "");
  assert.equal(f.support.style.transform, "");
  const reduced = fixture({ reduced: true });
  assert.equal(reduced.timelines.length, 0);
  assert.equal(reduced.heroClasses.has("hero-type-static"), true);
});

test("changing reduced-motion preference tears down and rebuilds the text sequence", () => {
  const f = fixture();
  f.events.get("loadedmetadata")();
  f.progress(0.75);
  f.motion.matches = true;
  f.events.get("motion:change")();
  assert.equal(f.timelines[0].killed, true);
  assert.equal(f.heroClasses.has("hero-type-static"), true);
  f.motion.matches = false;
  f.events.get("motion:change")();
  assert.equal(f.timelines.length, 2);
  assert.equal(f.heroClasses.has("hero-type-static"), false);
});

test("Hero text is not also animated by generic reveal or an automated timer", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<h1 class="hero-title"[^>]*data-hero-title>/);
  assert.match(html, /<div class="v2-hero-support" data-hero-support>/);
  assert.doesNotMatch(source, /setTimeout\s*\(/);
});

test("mobile poster remains the visible layer until a video frame is available", () => {
  const f = fixture();
  assert.equal(f.heroClasses.has("hero-media-ready"), false);
  f.video.readyState = 1;
  f.video.videoWidth = 1920;
  f.events.get("loadedmetadata")();
  assert.equal(f.heroClasses.has("hero-media-ready"), false, "metadata is not a decoded frame");
  f.video.readyState = 2;
  f.events.get("loadeddata")();
  assert.equal(f.heroClasses.has("hero-media-ready"), true);
  f.events.get("stalled")();
  assert.equal(f.heroClasses.has("hero-media-ready"), true, "retain an existing frame while buffering");
  f.video.readyState = 1;
  f.events.get("waiting")();
  assert.equal(f.heroClasses.has("hero-media-ready"), true, "seeking must not flash the first-frame poster");
  f.video.readyState = 0;
  f.events.get("emptied")();
  assert.equal(f.heroClasses.has("hero-media-ready"), false);
});

test("media errors and reduced motion expose the poster without autoplay", () => {
  const f = fixture();
  f.video.readyState = 4;
  f.video.videoWidth = 1920;
  f.events.get("canplay")();
  assert.equal(f.heroClasses.has("hero-media-ready"), true);
  f.video.error = { code: 4 };
  f.events.get("error")();
  assert.equal(f.video.hidden, true);
  assert.equal(f.heroClasses.has("hero-media-ready"), false);
  const reduced = fixture({ reduced: true });
  assert.equal(reduced.video.hidden, true);
  assert.equal(reduced.heroClasses.has("hero-media-ready"), false);
  assert.equal(reduced.loads(), 0);
});
