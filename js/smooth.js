/* smooth.js — Lenis-style lerp smooth scrolling, vendored (zero external
   requests). Intercept wheel input, accumulate a target, ease the real scroll
   toward it on rAF via window.scrollTo. The NATIVE scroll position stays
   authoritative, so anchors, keyboard scrolling, scroll-driven reveals, and
   the seg-nav scroll-spy all keep working — this changes feel, not mechanics.

   Not active for reduced-motion users or touch devices (native momentum is
   already good; fighting it feels broken). */

export function initSmoothScroll() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!matchMedia("(pointer: fine)").matches) return; // touch stays native

  // native CSS smooth-behavior would double-ease every programmatic scroll
  document.documentElement.classList.add("smooth-js");

  let target = scrollY;
  let current = scrollY;
  let expected = scrollY; // last position WE wrote — distinguishes our scrolls from external ones
  let raf = null;
  let lastT = 0;

  const maxScroll = () =>
    document.documentElement.scrollHeight - innerHeight;

  const step = (t) => {
    const dt = Math.min(50, t - lastT || 16.7);
    lastT = t;
    // frame-rate-independent exponential ease (≈0.1/frame at 60fps)
    const alpha = 1 - Math.pow(0.0018, dt / 1000);
    current += (target - current) * alpha;
    if (Math.abs(target - current) < 0.4) {
      current = target;
      raf = null;
    } else {
      raf = requestAnimationFrame(step);
    }
    expected = current;
    scrollTo(0, current);
  };

  addEventListener("wheel", (e) => {
    if (e.ctrlKey) return; // pinch-zoom
    // let inner scrollables (e.g. a long paste in the textarea) scroll natively
    for (let el = e.target; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return;
    }
    e.preventDefault();
    const dy = e.deltaMode === 2 ? e.deltaY * innerHeight   // page-mode (older Firefox)
             : e.deltaMode === 1 ? e.deltaY * 16            // line-mode mice
             : e.deltaY;
    target = Math.max(0, Math.min(maxScroll(), target + dy));
    if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(step); }
  }, { passive: false });

  // External scrolls (keyboard, anchor jumps, programmatic) must win over an
  // in-flight lerp. Our own scrollTo differs from `expected` by <1px, so
  // external movement is unambiguous.
  addEventListener("scroll", () => {
    if (raf) {
      if (Math.abs(scrollY - expected) > 1) {
        cancelAnimationFrame(raf);
        raf = null;
        target = current = expected = scrollY;
      }
    } else {
      target = current = expected = scrollY;
    }
  }, { passive: true });
}
