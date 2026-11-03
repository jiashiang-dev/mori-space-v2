import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const script = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const source = script.slice(script.indexOf("const setupFooterNavigation ="));

function fixture({ reduced = false, available = true, present = true, ready = true,
  menuOpen = false, inert = false, pointerEvents = "" } = {}) {
  const tweens = [];
  const media = [];
  const events = [];
  const shell = { style: { pointerEvents } };
  const header = {
    inert,
    classList: { contains: name => name === "menu-active" && menuOpen },
    querySelector(selector) { assert.equal(selector, ".nav-shell"); return shell; },
  };
  const footer = {};
  let menuCloses = 0;
  let refreshes = 0;
  const gsap = {
    registerPlugin() {},
    matchMedia() {
      return { add(queries, callback, scope) {
        const item = { queries, scope };
        media.push(item);
        item.cleanup = callback({ conditions: { motion: !reduced, reduced } });
      } };
    },
    fromTo(target, from, to) {
      const tween = { target, from, to, position: 0, progress() { return this.position; } };
      tweens.push(tween);
      return tween;
    },
  };
  const document = {
    readyState: ready ? "complete" : "loading",
    querySelector(selector) {
      assert.ok(["[data-header]", ".site-footer"].includes(selector));
      return present ? { "[data-header]": header, ".site-footer": footer }[selector] : null;
    },
    addEventListener(name, callback, options) { events.push({ name, callback, options }); },
  };
  const window = {
    gsap: available ? gsap : undefined,
    ScrollTrigger: available ? { refresh() { refreshes++; } } : undefined,
  };
  vm.runInNewContext(source, { document, window, setMenu(open) {
    assert.equal(open, false);
    menuOpen = false;
    menuCloses++;
  } });
  const render = (progress) => {
    const tween = tweens.at(-1);
    tween.position = progress;
    tween.to.onUpdate.call(tween);
  };
  return { header, footer, shell, tweens, media, events, render,
    menuCloses: () => menuCloses, refreshes: () => refreshes };
}

test("navbar stays visible until the footer enters and fades across 30% of the viewport", () => {
  const f = fixture();
  assert.equal(f.tweens.length, 1);
  const { target, from, to } = f.tweens[0];
  assert.equal(target, f.header);
  assert.equal(from.autoAlpha, 1);
  assert.equal(from.y, 0);
  assert.equal(to.autoAlpha, 0);
  assert.equal(to.y, -12);
  assert.equal(to.ease, "sine.inOut");
  assert.equal(to.scrollTrigger.id, "mori-footer-navigation");
  assert.equal(to.scrollTrigger.trigger, f.footer);
  assert.equal(to.scrollTrigger.start, "top bottom");
  assert.equal(to.scrollTrigger.end, "clamp(top 70%)", "end stays reachable for a short footer");
  assert.equal(to.scrollTrigger.scrub, 0.65);
  assert.equal(to.scrollTrigger.pin, false);
  assert.equal(to.scrollTrigger.refreshPriority, -4);
  assert.doesNotMatch(source, /display\s*:|setTimeout|setInterval|onEnter:|onLeave:|\.play\(|getAll\(|killAll/);
});

test("pointer and keyboard access follow the rendered fade endpoint in both directions", () => {
  const f = fixture();
  for (const progress of [0, 0.25, 0.9, 0.999]) {
    f.render(progress);
    assert.equal(f.header.inert, false);
    assert.equal(f.shell.style.pointerEvents, "");
  }
  f.render(1);
  assert.equal(f.header.inert, true);
  assert.equal(f.shell.style.pointerEvents, "none");
  for (const progress of [0.99, 0.5, 0]) {
    f.render(progress);
    assert.equal(f.header.inert, false);
    assert.equal(f.shell.style.pointerEvents, "");
  }
  f.render(1);
  assert.equal(f.header.inert, true, "repeated scroll visits remain reversible");
});

test("a mobile menu opened during scrub catch-up cannot trap page scrolling", () => {
  const f = fixture({ menuOpen: true });
  f.render(0.9);
  assert.equal(f.menuCloses(), 0);
  f.render(1);
  assert.equal(f.menuCloses(), 1);
  f.render(1);
  f.render(0);
  assert.equal(f.menuCloses(), 1);
});

test("reduced motion retains a reversible opacity fade without vertical travel or catch-up", () => {
  const f = fixture({ reduced: true });
  assert.equal(f.tweens[0].to.y, 0);
  assert.equal(f.tweens[0].to.autoAlpha, 0);
  assert.equal(f.tweens[0].to.scrollTrigger.scrub, true);
  assert.match(f.media[0].queries.reduced, /prefers-reduced-motion: reduce/);
});

test("media cleanup restores only the original navbar interaction state", () => {
  const f = fixture({ pointerEvents: "auto" });
  f.render(1);
  f.media[0].cleanup();
  assert.equal(f.header.inert, false);
  assert.equal(f.shell.style.pointerEvents, "auto");
  assert.equal(f.media[0].scope, f.header);
  const alreadyInert = fixture({ inert: true, pointerEvents: "none" });
  alreadyInert.render(1);
  alreadyInert.render(0);
  alreadyInert.media[0].cleanup();
  assert.equal(alreadyInert.header.inert, true);
  assert.equal(alreadyInert.shell.style.pointerEvents, "none");
  assert.doesNotMatch(source, /heroVideo|videoPlayhead|setupContactCTA|setupEditorialSections/);
});

test("missing elements or GSAP leave the navigation unchanged; setup waits for DOM readiness", () => {
  for (const options of [{ available: false }, { present: false }]) {
    const f = fixture(options);
    assert.equal(f.tweens.length, 0);
    assert.equal(f.header.inert, false);
    assert.equal(f.refreshes(), 0);
  }
  const f = fixture({ ready: false });
  assert.equal(f.tweens.length, 0);
  assert.equal(f.events[0].name, "DOMContentLoaded");
  assert.equal(f.events[0].options.once, true);
  f.events[0].callback();
  assert.equal(f.tweens.length, 1);
});
