// Site interactions: theme, navigation, lazy media, portrait swap, and the robot stage boot.

const root = document.documentElement;
const THEME_KEY = 'jdv-theme';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const prefersLight = matchMedia('(prefers-color-scheme: light)');

/* ------------------------------------------------------------------ theme */

const themeButton = document.querySelector('.theme-toggle');
const themeColor = document.querySelector('meta[name="theme-color"]');

function resolvedTheme() {
  return root.dataset.theme || (prefersLight.matches ? 'light' : 'dark');
}

function syncTheme() {
  const theme = resolvedTheme();
  root.dataset.themeResolved = theme;
  if (themeButton) themeButton.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  if (themeColor) themeColor.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#0a0a0b');
}

themeButton?.addEventListener('click', () => {
  root.dataset.theme = resolvedTheme() === 'light' ? 'dark' : 'light';
  try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch { /* private mode */ }
  syncTheme();
});
prefersLight.addEventListener('change', syncTheme);
syncTheme();

/* -------------------------------------------------------------------- nav */

const nav = document.querySelector('[data-nav]');
if (nav) {
  const menuButton = nav.querySelector('.menu-toggle');
  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    menuButton?.setAttribute('aria-expanded', String(open));
    menuButton?.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  menuButton?.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  nav.querySelectorAll('.nav-link').forEach((a) => a.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Highlight the section currently in view.
  const links = new Map([...nav.querySelectorAll('.nav-link[href^="#"]')].map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const link = links.get(entry.target.id);
      if (link) link.classList.toggle('is-active', entry.isIntersecting);
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const el = document.getElementById(id); if (el) spy.observe(el); });
}

/* ------------------------------------------------------------ lazy videos */

// Teaser videos only download and play while on screen.
const videos = document.querySelectorAll('video[data-autoplay]');
if (!reducedMotion && videos.length) {
  const vio = new IntersectionObserver((entries) => {
    for (const { target: v, isIntersecting } of entries) {
      if (isIntersecting) {
        if (v.preload === 'none') v.preload = 'auto';
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }
  }, { threshold: 0.2 });
  videos.forEach((v) => vio.observe(v));
}

/* ---------------------------------------------------------------- authors */

// Long author lists collapse to two lines with a toggle.
document.querySelectorAll('.authors[data-clamp]').forEach((p) => {
  p.classList.add('is-clamped');
  requestAnimationFrame(() => {
    if (p.scrollHeight <= p.clientHeight + 2) { p.classList.remove('is-clamped'); return; }
    const count = p.textContent.split(',').length;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'authors-toggle';
    btn.textContent = `Show all ${count} authors`;
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      const open = p.classList.toggle('is-clamped') === false;
      btn.textContent = open ? 'Show fewer' : `Show all ${count} authors`;
      btn.setAttribute('aria-expanded', String(open));
    });
    p.after(btn);
  });
});

/* --------------------------------------------------------------- portrait */

// Click the portrait to flip through photos (the first one is picked at random inline).
const portrait = document.querySelector('[data-portrait]');
if (portrait) {
  const img = portrait.querySelector('img');
  const count = 5;
  for (let i = 1; i <= count; i++) new Image().src = `media/web/portrait-${i}.webp`;
  portrait.addEventListener('click', () => {
    const next = (Number(portrait.dataset.index || 1) % count) + 1;
    portrait.dataset.index = next;
    portrait.classList.add('is-swapping');
    setTimeout(() => {
      img.src = `media/web/portrait-${next}.webp`;
      img.decode().catch(() => {}).finally(() => portrait.classList.remove('is-swapping'));
    }, 220);
  });
}

/* ------------------------------------------------------------- robot stage */

const stage = document.querySelector('[data-robot-stage]');
if (stage) {
  const boot = () => {
    stage.dataset.state = 'loading';
    import('./fr3-viewer.js')
      .then((m) => m.mountRobotStage(stage))
      .catch((err) => {
        console.error('[fr3] could not load the viewer', err);
        stage.dataset.state = 'error';
      });
  };
  // Start after the page itself has loaded so the sim never competes with first paint.
  const whenIdle = () => ('requestIdleCallback' in window ? requestIdleCallback(boot, { timeout: 1200 }) : setTimeout(boot, 250));
  if (document.readyState === 'complete') whenIdle();
  else window.addEventListener('load', whenIdle, { once: true });
}
