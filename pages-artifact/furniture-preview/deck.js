
(() => {
  const root = document.querySelector("#furniture-studies[data-mori-furniture-preview] [data-preview-spaces]")?.shadowRoot;
  if (!root) return;
  const layout = root.querySelector("#explore-layout");
  const stage = root.querySelector("#deck-stage");
  const panels = [...stage.querySelectorAll(".room-card")];
  const selectors = [...root.querySelectorAll(".space-button")];
  const previous = root.querySelector("#previous");
  const next = root.querySelector("#next");
  const count = root.querySelector("#space-count");
  const name = root.querySelector("#space-name");
  const detail = root.querySelector("#space-detail");
  const status = root.querySelector("#deck-status");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const desktop = window.matchMedia("(min-width: 768px)");
  const last = panels.length - 1;
  const formatNumber = (value) => String(value).padStart(2, "0");

  let current = 0;
  let loop = root.querySelector('input[name="deck-mode"]:checked').value === "loop";
  let tumble = null;
  let queuedPhotoClicks = 0;
  let touchStart = null;

  function paint(movingPanel = null) {
    for (const [index, panel] of panels.entries()) {
      const relative = index - current;
      const depth = loop ? (relative + panels.length) % panels.length : relative;
      panel.style.setProperty("--depth", movingPanel === panel ? 0 : Math.max(depth, 0));
      panel.dataset.pose = movingPanel === panel ? "moving" : depth < 0 ? "parked" : "stack";
      panel.setAttribute("aria-hidden", String(index !== current));
      selectors[index].setAttribute("aria-pressed", String(index === current));
    }
    previous.setAttribute("aria-disabled", String(!loop && current === 0));
    next.setAttribute("aria-disabled", String(!loop && current === last));
    count.textContent = formatNumber(current + 1) + " / " + formatNumber(panels.length);
    name.textContent = panels[current].dataset.name;
    detail.textContent = panels[current].dataset.detail;
  }

  function stopTumble() {
    queuedPhotoClicks = 0;
    if (!tumble) return;
    tumble.cancel();
    tumble = null;
  }

  function show(target, direction) {
    if (target === current || target < 0 || target > last) return;
    if (tumble) {
      stopTumble();
      paint();
    }
    const movingPanel = panels[direction > 0 ? current : target];
    current = target;
    status.textContent = panels[current].dataset.name + ", space " + (current + 1) + " of " + panels.length + ".";

    if (reducedMotion.matches || !movingPanel.animate) {
      paint();
      return;
    }

    paint(movingPanel);
    const animation = movingPanel.animate([
      { transform: "rotateX(0deg)", opacity: 1, offset: 0, easing: "cubic-bezier(.4,0,.77,.43)" },
      { transform: "rotateX(-86deg)", opacity: .98, offset: .70 },
      { transform: "rotateX(-90deg)", opacity: .83, offset: .82 },
      { transform: "rotateX(-88deg)", opacity: 0, offset: 1 },
    ], {
      duration: 610,
      direction: direction > 0 ? "normal" : "reverse",
      fill: "both",
    });
    tumble = animation;
    animation.onfinish = () => {
      if (tumble !== animation) return;
      const pendingClicks = queuedPhotoClicks;
      stopTumble();
      paint();
      if (pendingClicks > 0 && desktop.matches) {
        queuedPhotoClicks = pendingClicks - 1;
        step(1);
      }
    };
  }

  function step(direction) {
    const candidate = current + direction;
    const target = loop ? (candidate + panels.length) % panels.length : candidate;
    show(target, direction);
  }

  previous.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  stage.addEventListener("click", (event) => {
    const currentPhoto = panels[current].querySelector("img");
    if (!desktop.matches || event.pointerType === "touch" || event.target !== currentPhoto) return;
    if (!loop && current + queuedPhotoClicks >= last) return;
    if (tumble) {
      queuedPhotoClicks += 1;
    } else {
      step(1);
    }
  });
  selectors.forEach((selector, index) => {
    selector.addEventListener("click", () => show(index, Math.sign(index - current)));
  });

  layout.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    switch (event.key) {
      case "ArrowLeft": step(-1); break;
      case "ArrowRight": step(1); break;
      case "Home": show(0, -1); break;
      case "End": show(last, 1); break;
      default: return;
    }
    event.preventDefault();
  });

  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    touchStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  stage.addEventListener("pointerup", (event) => {
    if (touchStart?.id !== event.pointerId) return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      step(dx < 0 ? 1 : -1);
    }
  });
  stage.addEventListener("pointercancel", (event) => {
    if (touchStart?.id === event.pointerId) touchStart = null;
  });

  function applyMode(option, keepTumble = false) {
    const nextLoop = option.value === "loop";
    if (nextLoop === loop) return;
    loop = nextLoop;
    if (!keepTumble) stopTumble();
    paint(tumble?.effect?.target ?? null);
    status.textContent = loop ? "Loop mode." : "Finite mode.";
  }

  const modeControls = root.querySelector(".mode-switch");
  const modeOption = target => target?.closest?.("label")?.querySelector('input[name="deck-mode"]');
  const tapSlop = 10;
  let modeTouch = null;

  modeControls.querySelectorAll('input[name="deck-mode"]').forEach((option) => {
    option.addEventListener("change", () => applyMode(option));
  });
  // A touch tap can have a complete pointer sequence without a synthesized click after a swipe.
  modeControls.addEventListener("pointerdown", event => {
    if (desktop.matches || !event.isTrusted || event.pointerType !== "touch" || !event.isPrimary) return;
    const option = modeOption(event.target);
    modeTouch = option ? { id: event.pointerId, x: event.clientX, y: event.clientY, option } : null;
  });
  modeControls.addEventListener("pointermove", event => {
    if (modeTouch?.id === event.pointerId &&
        Math.hypot(event.clientX - modeTouch.x, event.clientY - modeTouch.y) > tapSlop) {
      modeTouch = null;
    }
  });
  for (const type of ["pointercancel", "lostpointercapture"]) {
    modeControls.addEventListener(type, event => {
      if (modeTouch?.id === event.pointerId) modeTouch = null;
    });
  }
  modeControls.addEventListener("pointerup", event => {
    if (modeTouch?.id !== event.pointerId) return;
    const { x, y, option } = modeTouch;
    modeTouch = null;
    if (!event.isTrusted || Math.hypot(event.clientX - x, event.clientY - y) > tapSlop ||
        modeOption(root.elementFromPoint(event.clientX, event.clientY)) !== option || option.checked) return;

    option.checked = true;
    option.focus({ preventScroll: true });
    applyMode(option, true);
  });
  reducedMotion.addEventListener("change", () => {
    stopTumble();
    paint();
  });

  paint();
  layout.setAttribute("data-ready", "");
  for (const id of ["deck-caption", "space-index", "review-tools"]) {
    root.getElementById(id).hidden = false;
  }
})();

