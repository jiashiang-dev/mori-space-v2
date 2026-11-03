const desktop = matchMedia("(min-width: 901px)");
const root = document.documentElement;
const home = document.querySelector(".v2-home");
const header = document.querySelector("[data-header]");
const readingMenu = document.querySelector(".mobile-nav");
let menuButton = document.querySelector(".menu-toggle");
const sourceNav = document.querySelector("#primary-navigation") || document.querySelector(".desktop-nav");
const film = document.querySelector("[data-film]");
let active;
let journey;
const referrerURL = value => { try { const url = new URL(value); url.hash = ""; return url.href; } catch { return ""; } };
const journeyKey = "mori-reading-journey";
const returnKey = "mori-reading-return";
const retainedKey = "mori-reading-entry";
const ordinary = event => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
const storage = {
  put(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} },
  get(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } },
  take(key) {
    try {
      const raw = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      return JSON.parse(raw);
    } catch { return null; }
  },
};
function focusTarget(node) {
  if (!node) return;
  if (!node.matches("a, button, [tabindex]")) node.tabIndex = -1;
  node.focus({ preventScroll: true });
}
function sectionTarget(hash) {
  if (!hash) return null;
  let id;
  try { id = decodeURIComponent(hash.slice(1)); } catch { return null; }
  const target = document.getElementById(id);
  return target?.matches("section, footer") ? target.querySelector("h1, h2") || target : target;
}
function dismiss(restore = true) {
  if (!active) return;
  const { dialog, trigger, gutter } = active;
  active = undefined;
  dialog.querySelector("video")?.pause();
  dialog.close();
  root.classList.remove("v2-modal-open");
  root.style.scrollbarGutter = gutter;
  if (trigger === menuButton) {
    menuButton.setAttribute("aria-expanded", "false");
    header?.classList.remove("menu-active");
  }
  if (restore && trigger.getClientRects().length) focusTarget(trigger);
}
function open(dialog, trigger) {
  if (active) dismiss(false);
  const gutter = root.style.scrollbarGutter;
  if (innerWidth > root.clientWidth) root.style.scrollbarGutter = "stable";
  dialog.showModal();
  active = { dialog, trigger, gutter };
  root.classList.add("v2-modal-open");
  dialog.querySelector("[data-dismiss]").focus({ preventScroll: true });
}
function configure(dialog) {
  dialog.querySelector("[data-dismiss]").addEventListener("click", () => dismiss());
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    if (!document.fullscreenElement && !dialog.querySelector("video")?.webkitDisplayingFullscreen) dismiss();
  });
  dialog.addEventListener("close", () => {
    if (active?.dialog === dialog && !dialog.open) dismiss();
  });
  const first = dialog.querySelector("[data-dismiss]");
  const last = () => [...dialog.querySelectorAll("nav a, video, [data-film-fallback] a")]
    .filter(node => node.getClientRects().length).at(-1) || first;
  for (const edge of ["start", "end"]) {
    const guard = document.createElement("span");
    guard.className = "v2-focus-guard";
    guard.tabIndex = 0;
    guard.addEventListener("focus", () => focusTarget(edge === "start" ? last() : first));
    if (edge === "start") dialog.prepend(guard);
    else dialog.append(guard);
  }
}
if (sourceNav && (menuButton || readingMenu) && typeof HTMLDialogElement.prototype.showModal === "function") {
  if (!menuButton) {
    menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "v2-reading-menu-button";
    menuButton.textContent = "Menu";
    readingMenu.before(menuButton);
    readingMenu.hidden = true;
  }
  menuButton.setAttribute("aria-controls", "v2-mobile-dialog");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Open navigation");
  const menu = document.createElement("dialog");
  menu.id = "v2-mobile-dialog";
  menu.className = "v2-modal v2-menu-dialog";
  menu.setAttribute("aria-label", "Main navigation");
  menu.innerHTML = '<header><strong>MORI SPACE</strong><button type="button" data-dismiss autofocus>Close</button></header><nav aria-label="Main navigation"></nav><p>MORI SPACE is an independent interior design studio concept. The work shown explores spatial ideas and is not presented as completed client commissions.</p>';
  const menuNav = menu.querySelector("nav");
  for (const original of sourceNav.querySelectorAll("a")) {
    const link = original.cloneNode(true);
    link.removeAttribute("class");
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    link.append(arrow);
    menuNav.append(link);
  }
  document.body.append(menu);
  configure(menu);
  menuButton.addEventListener("click", () => {
    if (desktop.matches) return;
    open(menu, menuButton);
    menuButton.setAttribute("aria-expanded", "true");
    header?.classList.add("menu-active");
  });
  desktop.addEventListener("change", () => {
    if (desktop.matches && active?.dialog === menu) {
      dismiss(false);
      focusTarget(sourceNav.querySelector("a"));
    }
  });
  header?.addEventListener("mori:close-menu", () => {
    if (active?.dialog === menu) dismiss();
  });
  menuNav.addEventListener("click", event => {
    if (event.target.closest("a") && ordinary(event)) dismiss(false);
  });
}
if (film && typeof HTMLDialogElement.prototype.showModal === "function") {
  configure(film);
  const video = film.querySelector("video");
  const fallback = film.querySelector("[data-film-fallback]");
  video.addEventListener("error", () => { fallback.hidden = false; });
  document.querySelector("[data-watch-film]").addEventListener("click", event => {
    if (!ordinary(event)) return;
    event.preventDefault();
    open(film, event.currentTarget);
    document.dispatchEvent(new Event("mori:film-open"));
    if (!video.getAttribute("src")) video.src = event.currentTarget.href;
    else if (video.readyState) video.currentTime = 0;
    video.play().catch(() => { if (video.error) fallback.hidden = false; });
  });
}
addEventListener("pagehide", () => dismiss(false));

document.addEventListener("click", event => {
  const link = event.target.closest("a[href]");
  if (!link || !ordinary(event) || link.target && link.target !== "_self" || link.hasAttribute("download")) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin) return;
  if (home && link.matches("[data-reading-entry]")) {
    const section = link.closest("section");
    storage.put(journeyKey, {
      from: location.href, to: url.href, section: section.id, entry: link.id,
      width: innerWidth, offset: -section.getBoundingClientRect().top, at: Date.now(),
    });
  }
  if (!home && journey && link.matches(".return-link") && url.hash === "#" + journey.section) {
    storage.put(returnKey, { ...journey, to: url.href, from: location.href, at: Date.now() });
  }
  if (url.pathname === location.pathname && url.search === location.search && url.hash) {
    requestAnimationFrame(() => focusTarget(sectionTarget(url.hash)));
  }
});
addEventListener("pageshow", event => {
  if (event.persisted) return;
  const entryKey = window.navigation?.currentEntry?.key;
  if (performance.getEntriesByType("navigation")[0]?.type !== "navigate") {
    const saved = !home && entryKey && storage.get(retainedKey);
    if (saved && saved.key === entryKey && saved.journey?.to === location.href &&
        Date.now() - saved.journey.at < 1800000) journey = saved.journey;
    return;
  }
  const record = storage.take(home ? returnKey : journeyKey);
  const matches = record && record.to === location.href && referrerURL(record.from) === document.referrer && Date.now() - record.at < 1800000;
  if (!home && matches) {
    journey = record;
    if (entryKey) storage.put(retainedKey, { key: entryKey, journey });
  }
  const section = home && matches && innerWidth === record.width && document.getElementById(record.section);
  const entry = section && document.getElementById(record.entry);
  if (entry && section.contains(entry)) {
    const top = section.getBoundingClientRect().top + scrollY + record.offset;
    scrollTo({ top, behavior: "instant" });
    focusTarget(entry);
  } else {
    focusTarget(sectionTarget(location.hash));
  }
});
