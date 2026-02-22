// Apple-style background: pure CSS radial gradients driven by CSS variables.
// This script only updates --mouse-x / --mouse-y on <html> so the CSS
// ambient spotlight follows the cursor with a smooth lag (no canvas, no WebGL).

(function () {
  const root = document.documentElement;

  let tx = 50, ty = 50;   // target (real mouse, 0–100)
  let cx = 50, cy = 50;   // current (smoothed)

  const LERP = 0.05; // lower = more lag (oil-on-water feel)

  document.addEventListener('mousemove', (e) => {
    tx = (e.clientX / window.innerWidth)  * 100;
    ty = (e.clientY / window.innerHeight) * 100;
  }, { passive: true });

  function tick() {
    cx += (tx - cx) * LERP;
    cy += (ty - cy) * LERP;
    root.style.setProperty('--mouse-x', cx.toFixed(2) + '%');
    root.style.setProperty('--mouse-y', cy.toFixed(2) + '%');
    requestAnimationFrame(tick);
  }

  // Respect prefers-reduced-motion — skip animation, leave defaults
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    tick();
  }
}());
