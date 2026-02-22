/* ================================
   ANIMATIONS — Apple HIG Motion
   Liquid physics · Spring easing
   ================================ */

gsap.registerPlugin(ScrollTrigger);

// Respect prefers-reduced-motion (WCAG 2.1 success criterion 2.3.3)
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ================================
// SCROLL PROGRESS INDICATOR
// ================================
function initScrollProgress() {
  const bar = document.querySelector('.scroll-progress');
  if (!bar) return;

  function updateProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const pct = docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0;
    bar.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', Math.round(pct));
  }

  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
}

// ================================
// FLOATING NAV — Scroll behavior
// ================================
function initNav() {
  const nav = document.querySelector('.apple-nav');
  if (!nav) return;

  let lastScrollY = 0;
  let ticking = false;

  // Section IDs mapped to nav link hrefs
  const sections = Array.from(document.querySelectorAll('section[id]'));
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));

  function updateNav() {
    const scrollY = window.scrollY;
    const delta = scrollY - lastScrollY;
    lastScrollY = scrollY;

    // Hide nav when scrolling down quickly past threshold
    if (!prefersReducedMotion) {
      if (scrollY > 200 && delta > 8) {
        nav.classList.add('nav-hidden');
      } else if (delta < -4 || scrollY < 200) {
        nav.classList.remove('nav-hidden');
      }
    }

    // Update active section link (Intersection Observer preferred, but scroll-based fallback)
    const viewportMid = scrollY + window.innerHeight / 3;
    let activeId = null;

    sections.forEach(section => {
      const top = section.offsetTop - 80;
      const bottom = top + section.offsetHeight;
      if (viewportMid >= top && viewportMid < bottom) {
        activeId = section.id;
      }
    });

    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      const id = href ? href.replace('#', '') : '';
      link.classList.toggle('active', id === activeId);
    });

    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateNav);
      ticking = true;
    }
  }, { passive: true });

  // Keyboard-accessible smooth scroll for nav links
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
          target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
      }
    });
  });

  // Handle brand link
  const brand = document.querySelector('.nav-brand');
  if (brand) {
    brand.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  }
}

// ================================
// ENTRANCE ANIMATIONS
// Apple HIG: spring physics
// ================================
function startMainAnimations() {
  if (prefersReducedMotion) {
    // Skip animations — just make everything visible
    document.querySelectorAll('.reveal').forEach(el => el.classList.add('active'));
    return;
  }

  // Hero — liquid entrance
  gsap.from('.hero-block', {
    y: 80,
    scale: 0.94,
    opacity: 0,
    duration: 1.4,
    ease: 'elastic.out(1, 0.55)',
  });

  // Bento cards — staggered spring pop-in
  gsap.utils.toArray('.bento-card').forEach((card, i) => {
    gsap.from(card, {
      scrollTrigger: {
        trigger: card,
        start: 'top 92%',
        toggleActions: 'play none none reverse',
      },
      y: 70,
      scale: 0.88,
      rotationX: 12,
      rotationY: (i % 2 === 0 ? 1 : -1) * 8,
      opacity: 0,
      duration: 1.1,
      delay: (i % 3) * 0.12,
      ease: 'back.out(2.2)',
    });
  });

  // Experience cards — stagger from left
  gsap.utils.toArray('.exp-card').forEach((card, i) => {
    gsap.from(card, {
      scrollTrigger: {
        trigger: card,
        start: 'top 90%',
        toggleActions: 'play none none reverse',
      },
      x: -40,
      opacity: 0,
      duration: 0.9,
      delay: i * 0.1,
      ease: 'power3.out',
    });
  });

  // Reveal sections (generic)
  gsap.utils.toArray('.reveal').forEach((section) => {
    gsap.to(section, {
      scrollTrigger: {
        trigger: section,
        start: 'top 86%',
        onEnter: () => section.classList.add('active'),
      },
      opacity: 1,
      y: 0,
      duration: 1.1,
      ease: 'expo.out',
    });
  });

  // Impact grid — elastic pop
  gsap.from('.impact-grid', {
    scrollTrigger: {
      trigger: '.impact-grid',
      start: 'top 87%',
    },
    scale: 0.82,
    y: 48,
    opacity: 0,
    duration: 1.4,
    ease: 'elastic.out(1, 0.55)',
  });

  // Affiliations — staggered drop from above
  gsap.from('.affil-tile', {
    scrollTrigger: {
      trigger: '.affiliation-row',
      start: 'top 87%',
    },
    y: -44,
    scale: 0.72,
    opacity: 0,
    duration: 0.95,
    stagger: 0.1,
    ease: 'back.out(2.8)',
  });

  // Subtle idle float for affiliation tiles
  gsap.to('.affil-tile', {
    y: -7,
    duration: 2.3,
    stagger: {
      each: 0.09,
      from: 'center',
      yoyo: true,
      repeat: -1,
    },
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}

// ================================
// 3D LIQUID TILT HOVER — Cards
// Spring-physics gyroscopic tilt
// ================================
function init3DTilt() {
  if (prefersReducedMotion) return;

  // Global mouse coordinates for CSS lighting
  window.addEventListener('mousemove', (e) => {
    document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
    document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
  }, { passive: true });

  // 3D tilt on bento, exp, impact, and affil elements
  document.querySelectorAll('.bento-card, .exp-card, .impact-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      card.style.setProperty('--mouse-local-x', `${x}px`);
      card.style.setProperty('--mouse-local-y', `${y}px`);

      const cx = rect.width / 2;
      const cy = rect.height / 2;

      // Apple-style subtle tilt (max ±7°)
      const tiltX = ((y - cy) / cy) * -7;
      const tiltY = ((x - cx) / cx) * 7;

      gsap.to(card, {
        rotationX: tiltX,
        rotationY: tiltY,
        scale: 1.03,
        transformPerspective: 1000,
        transformOrigin: 'center',
        duration: 0.38,
        ease: 'power2.out',
      });
    }, { passive: true });

    card.addEventListener('mouseleave', () => {
      gsap.to(card, {
        rotationX: 0,
        rotationY: 0,
        scale: 1,
        duration: 0.75,
        ease: 'elastic.out(1, 0.42)',
      });
    });
  });

  // Magnetic micro-movement on social buttons
  document.querySelectorAll('.social-btn').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const dx = ((e.clientX - rect.left) / rect.width - 0.5) * 12;
      const dy = ((e.clientY - rect.top) / rect.height - 0.5) * 8;

      gsap.to(btn, {
        x: dx,
        y: dy,
        duration: 0.2,
        ease: 'power2.out',
      });
    }, { passive: true });

    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, {
        x: 0,
        y: 0,
        duration: 0.38,
        ease: 'elastic.out(1, 0.45)',
      });
    });
  });

  // Affiliation tiles — lighter tilt (they're white, so subtle)
  document.querySelectorAll('.affil-tile').forEach(tile => {
    tile.addEventListener('mousemove', (e) => {
      const rect = tile.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const tiltX = ((y - cy) / cy) * -6;
      const tiltY = ((x - cx) / cx) * 6;

      gsap.to(tile, {
        rotationX: tiltX,
        rotationY: tiltY,
        transformPerspective: 800,
        transformOrigin: 'center',
        duration: 0.3,
        ease: 'power2.out',
      });
    }, { passive: true });

    tile.addEventListener('mouseleave', () => {
      gsap.to(tile, {
        rotationX: 0,
        rotationY: 0,
        duration: 0.65,
        ease: 'elastic.out(1, 0.4)',
      });
    });
  });
}

// ================================
// PROFILE IMAGE — Advanced 3D
// Separate card/image tilt layers
// ================================
function initProfileTilt() {
  if (prefersReducedMotion) return;

  const profileWrap = document.querySelector('.profile-3d-wrap');
  const profileImage = document.querySelector('.profile-3d-wrap .profile-img');
  if (!profileWrap || !profileImage) return;

  profileWrap.addEventListener('mousemove', (e) => {
    const rect = profileWrap.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    profileWrap.style.setProperty('--mouse-local-x', `${x}px`);
    profileWrap.style.setProperty('--mouse-local-y', `${y}px`);

    const cx = rect.width / 2;
    const cy = rect.height / 2;

    // Outer wrap tilt
    gsap.to(profileWrap, {
      rotationX: ((y - cy) / cy) * -10,
      rotationY: ((x - cx) / cx) * 12,
      y: -5,
      scale: 1.02,
      transformPerspective: 1200,
      transformOrigin: 'center',
      duration: 0.28,
      ease: 'power2.out',
    });

    // Inner image parallax (different layer)
    gsap.to(profileImage, {
      x: ((x / rect.width) - 0.5) * 14,
      y: ((y / rect.height) - 0.5) * 10,
      scale: 1.04,
      duration: 0.3,
      ease: 'power2.out',
    });
  }, { passive: true });

  profileWrap.addEventListener('mouseleave', () => {
    gsap.to(profileWrap, {
      rotationX: 0,
      rotationY: 0,
      y: 0,
      scale: 1,
      duration: 0.7,
      ease: 'elastic.out(1, 0.45)',
    });

    gsap.to(profileImage, {
      x: 0,
      y: 0,
      scale: 1,
      duration: 0.65,
      ease: 'elastic.out(1, 0.4)',
    });
  });
}

// ================================
// KEYBOARD NAVIGATION SUPPORT
// Tab-accessible card interactions
// ================================
function initKeyboardNav() {
  // Cards should respond to Enter/Space like clicks
  document.querySelectorAll('.bento-card[href], .impact-card[href], .affil-tile[href]').forEach(card => {
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });
}

// ================================
// INITIALIZE ALL MODULES
// ================================
function init() {
  initScrollProgress();
  initNav();
  init3DTilt();
  initProfileTilt();
  initKeyboardNav();
  startMainAnimations();
}

// Wait for DOM
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(init, 80);
} else {
  window.addEventListener('DOMContentLoaded', init);
}
