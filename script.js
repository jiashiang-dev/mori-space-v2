const header = document.querySelector("[data-header]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const hero = document.querySelector(".video-hero");
const heroStage = hero?.closest?.(".v2-hero-stage");
const mobileScrub = () => window.innerWidth <= 640;
const canScrub = () => !reduceMotion.matches && !skipVideoMotion && window.gsap && window.ScrollTrigger;
const heroVideo = document.querySelector("[data-hero-video]");
const heroTitle = document.querySelector("[data-hero-title]");
const heroSupport = document.querySelector("[data-hero-support]");

// The poster stays underneath the video. Only phone/tablet CSS uses this flag;
// desktop rendering and the existing video playhead/ScrollTrigger are unchanged.
const updateHeroMediaReady = () => {
  if (!hero || !heroVideo) return;
  if (heroVideo.hidden || heroVideo.error || heroVideo.readyState === 0) {
    hero.classList.remove("hero-media-ready");
  } else if (heroVideo.readyState >= 2 && heroVideo.videoWidth > 0) {
    hero.classList.add("hero-media-ready");
  }
  // A seek can briefly return to HAVE_METADATA (1). Keep the last painted
  // frame then, instead of flashing the opening poster during reverse scrub.
};

let heroVideoTween;
let heroTypography;
let seekFrame = 0;
let targetVideoTime = 0;
let lastVideoTime = 0;
let videoReady = false;
let skipVideoMotion = false;
const videoPlayhead = { progress: 0 };

const resetHeroTypography = () => {
  hero?.classList.add("hero-type-static");
  heroTypography?.kill();
  heroTypography = undefined;
  [heroTitle, heroSupport].forEach((element) => {
    element?.style.removeProperty("opacity");
    element?.style.removeProperty("transform");
  });
};

const setupHeroTypography = (gsap) => {
  if (!heroTitle || !heroSupport) return;
  hero.classList.remove("hero-type-static");
  gsap.set(heroTitle, { opacity: 0, y: 20 });
  gsap.set(heroSupport, { opacity: 0, y: 12 });
  // Normalized 0–1 scroll sequence, never played by the animation clock.
  // Title enters 0–22%; support 8–31%; both hold 31–50%.
  // Support exits 50–76%, then title exits 62–100% as we enter the interior.
  heroTypography = gsap.timeline({ paused: true, defaults: { ease: "sine.inOut" } })
    .fromTo(heroTitle, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.22 }, 0)
    .fromTo(heroSupport, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.23 }, 0.08)
    .to(heroSupport, { opacity: 0, y: -12, duration: 0.26 }, 0.50)
    .to(heroTitle, { opacity: 0, y: -20, duration: 0.38 }, 0.62);
};

// One seek in flight at a time. New scroll input replaces the pending target,
// so rapid direction changes never build up an outdated queue of video frames.
const filmIsOpen = () => !!document.querySelector("[data-film][open]");
document.addEventListener("mori:film-open", () => {
  heroVideoTween?.scrollTrigger?.getTween?.()?.pause();
  if (heroVideo) targetVideoTime = heroVideo.currentTime;
});
const requestVideoSeek = () => {
  if (filmIsOpen() || seekFrame || !videoReady || !heroVideo || heroVideo.hidden ||
      reduceMotion.matches || skipVideoMotion || document.hidden) return;
  seekFrame = requestAnimationFrame(() => {
    seekFrame = 0;
    if (filmIsOpen() || heroVideo.seeking) return;
    const target = Math.max(0, Math.min(lastVideoTime, targetVideoTime));
    if (Math.abs(heroVideo.currentTime - target) < 1 / 120) return;
    try {
      heroVideo.currentTime = target;
    } catch {
      // A not-yet-available media range will be retried on loadeddata/canplay.
    }
  });
};

const teardownVideoScroll = () => {
  resetHeroTypography();
  heroVideoTween?.scrollTrigger?.kill(true);
  heroVideoTween?.kill();
  heroVideoTween = undefined;
  cancelAnimationFrame(seekFrame);
  seekFrame = 0;
  heroVideo?.pause();
};

const setupVideoScroll = () => {
  teardownVideoScroll();
  if (!hero || !heroVideo || !videoReady || skipVideoMotion ||
      reduceMotion.matches || !window.gsap || !window.ScrollTrigger) {
    heroStage?.classList.add("hero-static");
    return;
  }
  heroStage?.classList.remove("hero-static");
  heroStage?.classList.add("hero-pin-ready");

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  videoPlayhead.progress = 0;
  setupHeroTypography(gsap);
  heroVideoTween = gsap.to(videoPlayhead, {
    progress: 1,
    ease: "none",
    onUpdate: () => {
      heroTypography?.progress(videoPlayhead.progress);
      targetVideoTime = videoPlayhead.progress * lastVideoTime;
      requestVideoSeek();
    },
    scrollTrigger: {
      id: "mori-hero-video",
      trigger: heroStage || hero,
      start: () => "top " + (header?.getBoundingClientRect?.().height ?? 0) + "px",
      end: () => "+=" + Math.round(window.innerHeight * (window.innerWidth <= 640 ? 6 : 8)),
      pin: heroStage ? hero : true,
      pinSpacing: !heroStage,
      scrub: 0.65,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  });
  ScrollTrigger.refresh();
  heroTypography?.progress(heroVideoTween.progress());
  targetVideoTime = heroVideoTween.progress() * lastVideoTime;
  requestVideoSeek();
};

const useStaticHero = () => {
  heroStage?.classList.add("hero-static");
  teardownVideoScroll();
  if (heroVideo) heroVideo.hidden = true;
  updateHeroMediaReady();
};

const loadHeroVideo = () => {
  if (!heroVideo || !canScrub()) {
    useStaticHero();
    return;
  }
  heroVideo.hidden = false;
  // No play(), autoplay or loop: the video clock is driven only by scroll.
  if (!heroVideo.getAttribute("src")) {
    heroVideo.preload = "auto";
    heroVideo.src = heroVideo.dataset.src;
    heroVideo.load();
  } else if (videoReady) {
    setupVideoScroll();
  }
};

const prepareHeroVideo = () => {
  if (!canScrub()) {
    useStaticHero();
  } else if (!mobileScrub() || heroVideo?.getAttribute("src")) {
    loadHeroVideo();
  } else {
    heroStage?.classList.remove("hero-static");
  }
};

const loadMobileHeroOnScroll = () => {
  if (!mobileScrub() || !canScrub() || filmIsOpen() || heroVideo.getAttribute("src") ||
      window.scrollY <= 0 || !heroStage) return;
  // A deep link or a return below the Hero does not start a background download.
  const bounds = heroStage.getBoundingClientRect();
  if (bounds.top > 64 || bounds.bottom <= window.innerHeight) return;
  loadHeroVideo();
};

if (heroVideo) {
  window.addEventListener("scroll", loadMobileHeroOnScroll, { passive: true });
  window.addEventListener("resize", () => {
    if (!mobileScrub() && !heroVideo.getAttribute("src")) prepareHeroVideo();
  });
  heroVideo.muted = true;
  heroVideo.defaultMuted = true;
  heroVideo.pause();

  heroVideo.addEventListener("loadedmetadata", () => {
    if (!Number.isFinite(heroVideo.duration) || heroVideo.duration <= 0) {
      useStaticHero();
      return;
    }
    const fps = Number(heroVideo.dataset.fps) || 24;
    // Stop inside the final decoded frame, not beyond the media endpoint.
    lastVideoTime = Math.max(0, heroVideo.duration - 0.5 / fps);
    if (!mobileScrub() || heroVideo.readyState >= 2) {
      videoReady = true;
      setupVideoScroll();
    }
  });
  heroVideo.addEventListener("loadeddata", () => {
    if (!videoReady && Number.isFinite(heroVideo.duration) && heroVideo.duration > 0 && canScrub()) {
      videoReady = true;
      setupVideoScroll();
    }
  });
  heroVideo.addEventListener("seeked", requestVideoSeek);
  heroVideo.addEventListener("loadeddata", requestVideoSeek);
  heroVideo.addEventListener("canplay", requestVideoSeek);
  heroVideo.addEventListener("error", useStaticHero);
  // HAVE_CURRENT_DATA (2) means a frame can be rendered; metadata alone does not.
  // Waiting/stalling with an existing frame keeps that frame, rather than flashing.
  ["loadeddata", "canplay", "seeked", "waiting", "stalled", "emptied"].forEach((event) => {
    heroVideo.addEventListener(event, updateHeroMediaReady);
  });
  updateHeroMediaReady();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) heroVideo.pause();
    else requestVideoSeek();
  });

  // Wait for the existing deferred GSAP/ScrollTrigger scripts before setup.
  if (document.readyState !== "complete") {
    document.addEventListener("DOMContentLoaded", prepareHeroVideo, { once: true });
  } else {
    prepareHeroVideo();
  }
}

reduceMotion.addEventListener("change", () => {
  if (reduceMotion.matches) useStaticHero();
  else prepareHeroVideo();
});

document.fonts?.ready.then(() => window.ScrollTrigger?.refresh());

const skipLink = document.querySelector(".skip-link");
const mainContent = document.querySelector("#main-content");

const updateHeader = () => {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 32);
};

const setMenu = (isOpen) => {
  if (!isOpen && header?.classList.contains("menu-active")) header.dispatchEvent(new Event("mori:close-menu"));
};

skipLink?.addEventListener("click", (event) => {
  event.preventDefault();
  skipVideoMotion = true;
  useStaticHero();
  requestAnimationFrame(() => {
    mainContent?.focus({ preventScroll: true });
    mainContent?.scrollIntoView({ block: "start", behavior: "instant" });
  });
});

window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

const projectCards = document.querySelectorAll(".selected-card");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

projectCards.forEach((card) => {
  let pointerFrame;

  const resetProjectImage = () => {
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    card.style.setProperty("--project-image-x", "0px");
    card.style.setProperty("--project-image-y", "0px");
  };

  card.addEventListener("pointermove", (event) => {
    if (!finePointer.matches || reduceMotion.matches) return;
    const bounds = card.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;

    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = requestAnimationFrame(() => {
      card.style.setProperty("--project-image-x", `${(x * 9).toFixed(2)}px`);
      card.style.setProperty("--project-image-y", `${(y * 7).toFixed(2)}px`);
    });
  });

  card.addEventListener("pointerleave", resetProjectImage);
  card.addEventListener("focusout", (event) => {
    if (!card.contains(event.relatedTarget)) resetProjectImage();
  });
});

const revealItems = document.querySelectorAll(".reveal");

document.querySelectorAll("[data-stagger]").forEach((group) => {
  group.querySelectorAll(".reveal").forEach((item, index) => {
    item.style.setProperty("--reveal-delay", `${Math.min(index * 80, 320)}ms`);
  });
});

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -7%", threshold: 0.08 },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

const year = document.querySelector("[data-year]");
if (year) year.textContent = new Date().getFullYear();

// Footer-owned navigation fade; no changes to the header's design or other timelines.
const setupFooterNavigation = () => {
  const navHeader = document.querySelector("[data-header]");
  const footer = document.querySelector(".site-footer");
  if (!navHeader || !footer || !window.gsap?.matchMedia || !window.ScrollTrigger) return;
  const navShell = navHeader.querySelector(".nav-shell");
  if (!navShell) return;

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);
  const footerMedia = gsap.matchMedia();
  const originalInert = navHeader.inert;
  const originalPointerEvents = navShell.style.pointerEvents;

  footerMedia.add({
    motion: "(prefers-reduced-motion: no-preference)",
    reduced: "(prefers-reduced-motion: reduce)",
  }, (context) => {
    let interactionHidden = false;
    gsap.fromTo(navHeader, { autoAlpha: 1, y: 0 }, {
      // autoAlpha animates opacity; visibility changes only at fully transparent.
      autoAlpha: 0,
      y: context.conditions.reduced ? 0 : -12,
      ease: "sine.inOut",
      onUpdate() {
        // Follow the rendered tween, not the ahead-of-scrub scroll position.
        const hidden = this.progress() === 1;
        if (hidden === interactionHidden) return;
        interactionHidden = hidden;
        navHeader.inert = originalInert || hidden;
        navShell.style.pointerEvents = hidden ? "none" : originalPointerEvents;
        // A menu opened during scrub catch-up must not leave scrolling locked.
        if (hidden && navHeader.classList.contains("menu-active")) setMenu(false);
      },
      scrollTrigger: {
        id: "mori-footer-navigation",
        trigger: footer,
        start: "top bottom",
        end: "clamp(top 70%)",
        pin: false,
        scrub: context.conditions.reduced ? true : 0.65,
        invalidateOnRefresh: true,
        refreshPriority: -4,
      },
    });

    // matchMedia reverts only this tween's styles when the preference changes.
    return () => {
      navHeader.inert = originalInert;
      navShell.style.pointerEvents = originalPointerEvents;
    };
  }, navHeader);

  ScrollTrigger.refresh();
};

if (document.readyState !== "complete") {
  document.addEventListener("DOMContentLoaded", setupFooterNavigation, { once: true });
} else {
  setupFooterNavigation();
}

