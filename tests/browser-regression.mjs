import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, resolve, sep } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = "/mori-space-v2/";
const dist = resolve("dist");
const evidence = resolve(".phase1b-fix-qa");
const saveScreenshots = process.argv.includes("--screenshots");
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4" };
const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (!pathname.startsWith(base)) return response.writeHead(404).end();
  const file = resolve(dist, pathname.slice(base.length) + (pathname.endsWith("/") ? "index.html" : ""));
  if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) {
    return response.writeHead(404).end();
  }
  const size = statSync(file).size;
  const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Number(range[2]) : size - 1;
  const headers = { "Content-Type": mime[extname(file)] || "application/octet-stream", "Content-Length": end - start + 1 };
  if (range) headers["Content-Range"] = "bytes " + start + "-" + end + "/" + size;
  response.writeHead(range ? 206 : 200, headers);
  createReadStream(file, { start, end }).pipe(response);
});

const viewports = [[1440, 900], [1440, 768], [1366, 768], [390, 844], [360, 800]];
const services = ["interior-renovation", "space-planning", "bespoke-furniture", "residential-interiors", "commercial-spaces"];
const project = ["design-intent", "spatial-relationships", "material-direction", "furniture-within-space", "design-takeaways"];
const projectPath = "projects/warm-minimal-living-study/";
const geometry = page => page.evaluate(() => {
  const hero = document.querySelector(".video-hero");
  const header = document.querySelector(".site-header");
  const frame = hero.querySelector(".v2-hero-media");
  const video = hero.querySelector("video");
  const shell = hero.querySelector(".hero-shell");
  const title = hero.querySelector("h1");
  const actions = hero.querySelector(".hero-actions");
  const support = hero.querySelector("[data-hero-support]");
  const bounds = node => node.getBoundingClientRect();
  const media = bounds(frame);
  const round = value => Math.round(value * 100) / 100;
  return {
    frame: [round(media.width), round(media.height)], frameTop: round(media.top),
    headerBottom: round(bounds(header).bottom), heroTop: round(bounds(hero).top),
    heroHeight: round(bounds(hero).height), philosophyTop: round(bounds(document.querySelector("#philosophy")).top + scrollY),
    typography: [getComputedStyle(title).fontSize, getComputedStyle(title).fontFamily, getComputedStyle(title).fontWeight],
    shellPadding: getComputedStyle(shell).padding, actionOffset: actions.offsetTop,
    actionBottom: round(bounds(actions).bottom), titleOpacity: +getComputedStyle(title).opacity, supportOpacity: +getComputedStyle(support).opacity,
    overflow: document.documentElement.scrollWidth - innerWidth, fit: getComputedStyle(video).objectFit,
    time: video.currentTime, paused: video.paused, duration: video.duration,
    pin: !!window.ScrollTrigger?.getById("mori-hero-video"), shifts: window.layoutShifts || [],
  };
});
function contrast(foreground, background) {
  const luminance = rgb => rgb.match(/\d+/g).slice(0, 3).map(Number)
    .map(channel => channel / 255)
    .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    .reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const home = "http://127.0.0.1:" + server.address().port + base;
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    args: ["--disable-crash-reporter", "--disable-breakpad"],
  });
  if (saveScreenshots) mkdirSync(evidence, { recursive: true });
  for (const [width, height] of viewports) {
    const page = await browser.newPage({ viewport: { width, height } });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    try {
      await page.addInitScript(() => {
        window.layoutShifts = [];
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.layoutShifts.push({
              value: +entry.value.toFixed(6),
              nodes: entry.sources.map(source => source.node?.className || source.node?.nodeName),
            });
          }
        }).observe({ type: "layout-shift", buffered: true });
      });
      await page.route("**/*.mp4", async route => { await gate; await route.continue(); });
      assert.equal((await page.goto(home, { waitUntil: "domcontentloaded" })).status(), 200);
      await page.evaluate(() => document.fonts.ready);
      const before = await geometry(page);
      if (width <= 640) {
        assert.equal(await page.locator("[data-hero-video]").getAttribute("src"), null);
        assert.equal(before.titleOpacity, 1);
        await page.evaluate(() => scrollTo({ top: 80, behavior: "instant" }));
      }
      release();
      await page.waitForFunction(() => document.querySelector(".hero-media-ready") && window.ScrollTrigger?.getById("mori-hero-video"));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const decoded = await geometry(page);
      assert.equal(before.pin, false);
      assert.deepEqual(decoded.frame, before.frame);
      assert.deepEqual(decoded.typography, before.typography);
      assert.equal(decoded.shellPadding, before.shellPadding);
      assert.equal(decoded.actionOffset, before.actionOffset);
      assert.ok(Math.abs(decoded.philosophyTop - before.philosophyTop) <= 1, JSON.stringify({ before, decoded }));
      assert.equal(decoded.overflow, 0);
      assert.ok(Math.abs(decoded.frame[0] / decoded.frame[1] - 16 / 9) < .001);
      assert.ok(Math.abs(decoded.duration - 12.041667) < .0001);
      assert.match(decoded.typography[1], /Archivo/);
      assert.equal(decoded.typography[2], "800");
      assert.ok(decoded.shifts.every(entry => entry.value < .02), JSON.stringify(decoded.shifts));
      async function seek(fraction) {
        await page.evaluate(fraction => {
          const pin = ScrollTrigger.getById("mori-hero-video");
          window.scrollTo({ top: pin.start + (pin.end - pin.start) * fraction, behavior: "instant" });
        }, fraction);
        await page.waitForFunction(fraction => {
          const v = document.querySelector("video");
          return !v.seeking && Math.abs(v.currentTime - (v.duration - .5 / 24) * fraction) < .15;
        }, fraction);
        return geometry(page);
      }
      const hold = await seek(.4);
      const forward = await seek(.75);
      const reverse = await seek(.4);
      assert.ok(forward.time > hold.time && reverse.time < forward.time);
      assert.ok([hold, forward, reverse].every(state => state.paused && state.overflow === 0));
      assert.ok(hold.frameTop >= hold.headerBottom - 1);
      assert.ok(hold.actionBottom <= height, JSON.stringify(hold));
      assert.ok(hold.titleOpacity > .99 && hold.supportOpacity > .99);
      const initialShifts = hold.shifts;
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(home);
      await page.evaluate(() => document.fonts.ready);
      const reduced = await geometry(page);
      assert.ok(!reduced.pin && reduced.paused && reduced.titleOpacity === 1 && reduced.supportOpacity === 1);
      assert.equal(reduced.overflow, 0);
      const type = await page.evaluate(() => {
        const cta = document.querySelector(".v2-hero-primary");
        const closing = getComputedStyle(document.querySelector("#contact-title"));
        const project = getComputedStyle(document.querySelector("#projects-title"));
        const img = document.querySelector("#projects img");
        const style = getComputedStyle(cta);
        return { projectLines: document.querySelector("#projects-title").getBoundingClientRect().height / parseFloat(project.lineHeight), closing: closing.fontFamily, closingWeight: closing.fontWeight, project: parseFloat(project.fontSize), projectAspect: img.width / img.height, fill: style.backgroundColor, text: style.color };
      });
      assert.match(type.closing, /Archivo/);
      assert.equal(type.closingWeight, "800");
      assert.ok(Math.abs(type.projectAspect - 4 / 3) < .006);
      if (width < 641) {
        assert.equal(type.project, width === 390 ? 46 : 42);
        assert.ok(Math.abs(type.projectLines - 2) < .01);
        assert.equal(type.fill, "rgb(247, 248, 242)");
        type.contrast = contrast(type.fill, type.text);
        assert.ok(type.contrast > 4.5);
        await page.locator(".v2-hero-primary").focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        assert.ok(await page.locator(".v2-hero-primary").evaluate(node =>
          node.matches(":focus-visible") && getComputedStyle(node).outlineColor === "rgb(247, 248, 242)"));
        await page.locator(".v2-hero-primary").blur();
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      }
      if (saveScreenshots) {
        await page.evaluate(async () => {
          for (const img of document.images) img.loading = "eager";
          await Promise.all([...document.images].map(img => img.decode()));
        });
        await page.screenshot({ path: resolve(evidence, "home-" + width + "x" + height + ".png"), fullPage: true });
      }
      console.log(JSON.stringify({ width, height, before, decoded, hold, forward: forward.time, reverse: reverse.time, reduced, type, initialShifts }));
    } finally {
      release();
      await page.close();
    }
  }

  for (const route of ["services/", projectPath]) {
    const direct = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await direct.goto(home + route);
    assert.equal(await direct.evaluate(() => document.activeElement.tagName), "BODY");
    await direct.keyboard.press("Tab");
    assert.equal(await direct.evaluate(() => document.activeElement.textContent.trim()), "Skip to content");
    await direct.keyboard.press("Enter");
    await direct.waitForFunction(() => document.activeElement.tagName === "MAIN");
    await direct.close();
  }
  // Exercise enhanced navigation and overlays independently of the static route checks.
  const interaction = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const menu = interaction.locator(".v2-menu-dialog");
  const menuButton = interaction.locator(".menu-toggle");
  const film = interaction.locator("[data-film]");
  const watch = interaction.locator("[data-watch-film]");
  const focusIs = (locator) => locator.evaluate(node => document.activeElement === node);
  const locked = () => interaction.evaluate(() => getComputedStyle(document.documentElement).overflowY === "hidden");
  await interaction.goto(home);
  await menuButton.focus();
  await interaction.keyboard.press("Enter");
  assert.ok(await menu.isVisible() && await locked());
  assert.equal(await menuButton.getAttribute("aria-expanded"), "true");
  assert.ok(await focusIs(menu.locator("[data-dismiss]")));
  await interaction.keyboard.press("Shift+Tab");
  assert.ok(await focusIs(menu.getByRole("link", { name: "Contact" })));
  await interaction.keyboard.press("Tab");
  assert.ok(await focusIs(menu.locator("[data-dismiss]")));
  const menuY = await interaction.evaluate(() => scrollY);
  await interaction.mouse.wheel(0, 300);
  assert.equal(await interaction.evaluate(() => scrollY), menuY);
  await interaction.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  assert.ok(!(await locked()) && await focusIs(menuButton));
  await menuButton.click();
  await menu.getByRole("link", { name: "Services" }).click();
  assert.equal(interaction.url(), home + "#services");
  await interaction.waitForFunction(() => document.activeElement.id === "services-title");
  assert.ok(!(await locked()));
  await interaction.locator("#entry-space-planning").click();
  await interaction.waitForURL("**/services/#space-planning");
  await interaction.waitForFunction(() => document.activeElement.id === "space-planning");
  const readingToggle = interaction.locator(".v2-reading-menu-button");
  await readingToggle.click();
  await menu.waitFor();
  assert.ok(await locked());
  await interaction.keyboard.press("Escape");
  assert.ok(!(await locked()) && await focusIs(readingToggle));
  await interaction.goBack();
  assert.equal(interaction.url(), home + "#services");
  await interaction.goForward();
  assert.equal(interaction.url(), home + "services/#space-planning");
  await interaction.locator(".return-link").click();
  await interaction.waitForURL(home + "#services");
  await interaction.waitForFunction(() => document.activeElement.id === "entry-space-planning");
  await interaction.goto(home);
  await menuButton.click();
  await interaction.setViewportSize({ width: 1440, height: 900 });
  await menu.waitFor({ state: "hidden" });
  assert.ok(!(await locked()));
  assert.ok(await focusIs(interaction.locator("#primary-navigation a").first()));

  for (const width of [1440, 390, 360]) {
    await interaction.setViewportSize({ width, height: 900 });
    await interaction.goto(home);
    await watch.click();
    await interaction.waitForFunction(() => {
      const v = document.querySelector("[data-film] video");
      return v.currentTime > .1 && !v.paused;
    });
    assert.ok(await film.isVisible() && await locked() && !(await menu.isVisible()));
    const size = await film.locator("video").evaluate(v => {
      const r = v.getBoundingClientRect();
      return [r.width / r.height, v.videoWidth, v.videoHeight, v.duration, v.controls, getComputedStyle(v).objectFit];
    });
    assert.ok(Math.abs(size[0] - 16 / 9) < .001);
    assert.deepEqual(size.slice(1), [1920, 1080, 12.041667, true, "contain"]);
    assert.ok(await focusIs(film.locator("[data-dismiss]")));
    for (const key of ["Shift+Tab", ...Array(12).fill("Tab")]) {
      await interaction.keyboard.press(key);
      assert.ok(await film.evaluate(d => d.contains(document.activeElement)));
    }
    if (width === 1440) await film.locator("[data-dismiss]").click();
    else await interaction.keyboard.press("Escape");
    await film.waitFor({ state: "hidden" });
    assert.ok(await film.locator("video").evaluate(v => v.paused));
    assert.ok(!(await locked()) && await focusIs(watch));
    assert.equal(await interaction.evaluate(() => document.documentElement.scrollWidth), width);
  }
  await interaction.route("**/*.mp4", route => route.abort());
  await interaction.goto(home);
  await watch.click();
  await film.locator("[data-film-fallback]").waitFor();
  await film.locator("[data-dismiss]").click();
  await interaction.unroute("**/*.mp4");
  await interaction.close();

  const live = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await live.goto(home);
  await live.waitForFunction(() => window.ScrollTrigger?.getById("mori-hero-video"));
  await live.evaluate(() => {
    const t = ScrollTrigger.getById("mori-hero-video");
    scrollTo({ top: t.start + .4 * (t.end - t.start), behavior: "instant" });
  });
  await live.waitForFunction(() => Math.abs(document.querySelector("[data-hero-video]").currentTime - 4.8083) < .06);
  const mediaState = () => live.evaluate(() => {
    const v = document.querySelector("[data-hero-video]");
    return { time: v.currentTime, paused: v.paused, scroll: scrollY, history: history.length };
  });
  const origin = await mediaState();
  await live.locator("[data-watch-film]").click();
  await live.waitForFunction(() => document.querySelector("[data-film] video").currentTime > .1);
  await live.keyboard.press("Escape");
  assert.deepEqual(await mediaState(), origin);
  await live.evaluate(() => {
    const t = ScrollTrigger.getById("mori-hero-video");
    scrollTo({ top: t.start + .52 * (t.end - t.start), behavior: "instant" });
  });
  await live.waitForFunction(() => document.querySelector("[data-hero-video]").currentTime > 6);
  await live.close();
  console.log("PASS: native Back/Forward, reading return focus, keyboard menu, resize unlock, film playback and error fallback, and unchanged Hero across film close");

  // Separate cold contexts isolate cache, motion and CDN scenarios.
  async function inspectMedia({ width = 390, height = 844, cacheDisabled = false, scrub = false,
      reduced = false, blocked = false, constrained = false }) {
    const mobile = await browser.newPage({
      viewport: { width, height },
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    const session = await mobile.context().newCDPSession(mobile);
    await session.send("Network.enable");
    await session.send("Network.setCacheDisabled", { cacheDisabled });
    if (constrained) await session.send("Network.emulateNetworkConditions", {
      offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 100000,
    });
    if (blocked) await mobile.route(/cdn\.jsdelivr\.net/, route => route.abort());
    const media = new Map();
    session.on("Network.requestWillBeSent", event => {
      if (event.request.url.endsWith(".mp4")) media.set(event.requestId, {
        method: event.request.method, range: event.request.headers.Range || event.request.headers.range,
        wireBytes: 0, done: false,
      });
    });
    session.on("Network.requestServedFromCache", event => {
      if (media.has(event.requestId)) media.get(event.requestId).cache = true;
    });
    session.on("Network.responseReceived", event => {
      const item = media.get(event.requestId);
      if (item) Object.assign(item, { status: event.response.status,
        contentRange: event.response.headers["Content-Range"] || event.response.headers["content-range"],
        cache: item.cache || event.response.fromDiskCache || false });
    });
    session.on("Network.dataReceived", event => {
      if (media.has(event.requestId)) media.get(event.requestId).wireBytes += event.encodedDataLength;
    });
    session.on("Network.loadingFinished", event => {
      if (media.has(event.requestId)) Object.assign(media.get(event.requestId), { wireBytes: event.encodedDataLength, done: true });
    });
    const snapshot = (keys = new Set()) => [...media].filter(([id]) => !keys.has(id)).map(([, item]) => ({ ...item }));
    try {
      await mobile.goto(home, { waitUntil: "networkidle" });
      assert.equal(media.size, 0);
      assert.equal(await mobile.locator("[data-hero-video]").getAttribute("src"), null);
      assert.ok(await mobile.locator(".hero-poster").evaluate(img => img.complete && img.naturalWidth > 0));
      const staticCopy = () => mobile.locator("[data-hero-title]").evaluate(node => getComputedStyle(node).opacity === "1");
      assert.ok(await staticCopy());
      const cold = snapshot();
      let readyMs = null;
      if (scrub || reduced || blocked) {
        const started = performance.now();
        await mobile.evaluate(() => scrollTo({ top: 80, behavior: "instant" }));
        if (scrub) {
          await mobile.waitForFunction(() => document.querySelector(".hero-media-ready") && window.ScrollTrigger?.getById("mori-hero-video"));
          readyMs = Math.round(performance.now() - started);
          if (!constrained) await mobile.waitForLoadState("networkidle");
        } else {
          await mobile.waitForTimeout(350);
          assert.equal(media.size, 0);
          assert.equal(await mobile.locator("[data-hero-video]").getAttribute("src"), null);
          assert.ok(await staticCopy());
        }
      }
      const beforeFilm = snapshot();
      const prior = new Set(media.keys());
      const opening = performance.now();
      await mobile.locator("[data-watch-film]").click();
      await mobile.waitForFunction(() => document.querySelector("[data-film] video").currentTime > .15);
      const filmStartMs = Math.round(performance.now() - opening);
      if (!constrained) await mobile.waitForLoadState("networkidle");
      else await mobile.waitForTimeout(350);
      const overlay = snapshot(prior);
      await mobile.locator("[data-film] [data-dismiss]").click();
      assert.ok(await mobile.locator("[data-film] video").evaluate(video => video.paused));
      console.log("MEDIA_QA", JSON.stringify({ width, cacheDisabled, scrub, reduced, blocked, constrained,
        cold, beforeFilm, overlay, readyMs, filmStartMs }));
    } finally {
      await mobile.close();
    }
  }
  await inspectMedia({});
  await inspectMedia({ width: 360, height: 800, cacheDisabled: true });
  await inspectMedia({ scrub: true });
  await inspectMedia({ scrub: true, cacheDisabled: true });
  await inspectMedia({ scrub: true, constrained: true });
  await inspectMedia({ reduced: true });
  await inspectMedia({ blocked: true });

  const page = await browser.newPage({ javaScriptEnabled: false, reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  async function visit(url) {
    await page.goto("about:blank");
    assert.equal((await page.goto(url)).status(), 200);
    assert.equal((await page.reload()).status(), 200);
    await page.evaluate(() => document.fonts.ready);
  }
  await visit(home);
  await visit(home);
  const staticNav = page.locator("#primary-navigation");
  assert.ok(await staticNav.isVisible());
  const hashes = ["#top", "#philosophy", "#projects", "#services", "#furniture", "#contact"];
  assert.deepEqual(await staticNav.locator("a").evaluateAll(links => links.map(a => a.hash)), hashes);
  for (const hash of hashes) {
    await staticNav.locator('a[href="' + hash + '"]').click();
    assert.equal(new URL(page.url()).hash, hash);
  }
  const fallbackURL = await page.locator("[data-watch-film]").evaluate(a => a.href);
  assert.equal(fallbackURL, home + "videos/mori-hero-walkthrough.mp4");
  const fallbackResponse = await fetch(fallbackURL, { headers: { Range: "bytes=0-7" } });
  assert.equal(fallbackResponse.status, 206);
  assert.equal(Buffer.from(await fallbackResponse.arrayBuffer()).toString("ascii", 4), "ftyp");
  for (const id of services) {
    await visit(home);
    await page.locator('.v2-service-rail a[href="./services/#' + id + '"]').click();
    assert.equal(page.url(), home + "services/#" + id);
    assert.ok(await page.locator("#" + id).isVisible());
    await page.locator(".return-link").click();
    assert.equal(page.url(), home + "#services");
  }
  await visit(home);
  await page.locator(".v2-project-caption a").click();
  assert.equal(page.url(), home + projectPath);
  for (const id of project) {
    await visit(home + projectPath + "#" + id);
    assert.ok(await page.locator("#" + id).isVisible());
  }
  await page.locator(".return-link").click();
  assert.equal(page.url(), home + "#projects");
  await visit(home + "services/");
  assert.equal(await page.locator("h1").textContent().then(text => text.trim()), "From space to detail.");
  console.log("PASS: all three static routes and refreshes, Services and Project chapters, entry and return links");
} finally {
  await browser?.close();
  server.close();
}
