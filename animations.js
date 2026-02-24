gsap.registerPlugin(ScrollTrigger);

// --- 1. EXPLOSIVE REVEAL SEQUENCES ("CRACKED" PHYSICS) ---
function startMainAnimations() {
    // Hero Intro — subtle text + image reveal on first page load
    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    intro
        .from(".bio-card", {
            y: 34,
            opacity: 0,
            duration: 0.82
        })
        .from(".bio-card > *", {
            y: 12,
            opacity: 0,
            duration: 0.5,
            stagger: 0.045,
            ease: "power2.out"
        }, "-=0.45")
        .from(".profile-3d-wrap", {
            y: 26,
            opacity: 0,
            scale: 0.975,
            rotateY: -5,
            duration: 0.9
        }, "-=0.55")
        .from(".social-grid .social-btn", {
            y: 10,
            opacity: 0,
            duration: 0.42,
            stagger: 0.05,
            ease: "power2.out"
        }, "-=0.42");

    // Staggered Bento Cards (Violent pop-in with rotation)
    gsap.utils.toArray(".bento-card").forEach((card, i) => {
        gsap.from(card, {
            scrollTrigger: {
                trigger: card,
                start: "top 90%",
                toggleActions: "play none none reverse"
            },
            y: 80,
            scale: 0.85,
            rotationX: 15,
            rotationY: Array(1, -1)[Math.floor(Math.random() * 2)] * 10, // Random left/right tilt
            opacity: 0,
            duration: 1.2,
            delay: (i % 3) * 0.15, // Stagger in rows
            ease: "back.out(2.5)" // Extreme overshoot "cracked" feel
        });
    });

    // Handle generic .reveal sections
    gsap.utils.toArray(".reveal").forEach((section) => {
        gsap.to(section, {
            scrollTrigger: {
                trigger: section,
                start: "top 85%",
                onEnter: () => section.classList.add('active')
            },
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 1.2,
            ease: "expo.out"
        });
    });

    // Impact Ticker Reveal
    gsap.from(".impact-grid", {
        scrollTrigger: {
            trigger: ".impact-grid",
            start: "top 85%"
        },
        scale: 0.8,
        y: 50,
        opacity: 0,
        duration: 1.5,
        ease: "elastic.out(1, 0.6)"
    });

    // Affiliations Staggered Drop
    gsap.from(".affil-tile", {
        scrollTrigger: {
            trigger: ".affiliation-row",
            start: "top 85%"
        },
        y: -40,
        scale: 0.7,
        opacity: 0,
        duration: 1,
        stagger: 0.1,
        ease: "back.out(3)"
    });

    gsap.to(".affil-tile", {
        y: -8,
        duration: 2.2,
        stagger: {
            each: 0.08,
            from: "center",
            yoyo: true,
            repeat: -1
        },
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut"
    });
}

// Start immediately when DOM is ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(startMainAnimations, 100);
} else {
    window.addEventListener('DOMContentLoaded', startMainAnimations);
}

// --- 2. 3D "LIQUID TILT" HOVER PHYSICS ---
// Global Mouse Tracking for generic lighting
window.addEventListener('mousemove', (e) => {
    document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
    document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
});

// Attach advanced 3D tilt tracking to all cards
document.querySelectorAll('.bento-card, .exp-card, .impact-card, .affil-tile').forEach(card => {

    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Pass normalized local coordinates for edge glows
        card.style.setProperty('--mouse-local-x', `${x}px`);
        card.style.setProperty('--mouse-local-y', `${y}px`);

        // Calculate 3D tilt angles based on mouse position relative to center
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Max rotation degrees
        const tiltX = ((y - centerY) / centerY) * -8; // Pitch
        const tiltY = ((x - centerX) / centerX) * 8;  // Yaw

        // Apply transform via GSAP for buttery smooth interpolation instead of harsh CSS
        gsap.to(card, {
            rotationX: tiltX,
            rotationY: tiltY,
            scale: 1.04,
            transformPerspective: 1000,
            transformOrigin: "center",
            duration: 0.4,
            ease: "power2.out"
        });
    });

    card.addEventListener('mouseleave', () => {
        // Snap back to 0 physically using spring mechanics
        gsap.to(card, {
            rotationX: 0,
            rotationY: 0,
            scale: 1,
            duration: 0.8,
            ease: "elastic.out(1, 0.4)"
        });
    });
});

document.querySelectorAll('.social-btn').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const dx = ((x / rect.width) - 0.5) * 14;
        const dy = ((y / rect.height) - 0.5) * 10;

        gsap.to(btn, {
            x: dx,
            y: dy,
            duration: 0.22,
            ease: "power2.out"
        });
    });

    btn.addEventListener('mouseleave', () => {
        gsap.to(btn, {
            x: 0,
            y: 0,
            duration: 0.4,
            ease: "elastic.out(1, 0.45)"
        });
    });
});

const profileWrap = document.querySelector('.profile-3d-wrap');
const profileImage = document.querySelector('.profile-3d-wrap .profile-img');

if (profileWrap && profileImage) {
    profileWrap.addEventListener('mousemove', (e) => {
        const rect = profileWrap.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        profileWrap.style.setProperty('--mouse-local-x', `${x}px`);
        profileWrap.style.setProperty('--mouse-local-y', `${y}px`);

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const tiltX = ((y - centerY) / centerY) * -10;
        const tiltY = ((x - centerX) / centerX) * 12;

        gsap.to(profileWrap, {
            rotationX: tiltX,
            rotationY: tiltY,
            y: -4,
            scale: 1.02,
            transformPerspective: 1200,
            transformOrigin: 'center',
            duration: 0.28,
            ease: 'power2.out'
        });

        gsap.to(profileImage, {
            x: ((x / rect.width) - 0.5) * 12,
            y: ((y / rect.height) - 0.5) * 10,
            scale: 1.04,
            duration: 0.3,
            ease: 'power2.out'
        });
    });

    profileWrap.addEventListener('mouseleave', () => {
        gsap.to(profileWrap, {
            rotationX: 0,
            rotationY: 0,
            y: 0,
            scale: 1,
            duration: 0.7,
            ease: 'elastic.out(1, 0.45)'
        });

        gsap.to(profileImage, {
            x: 0,
            y: 0,
            scale: 1,
            duration: 0.65,
            ease: 'elastic.out(1, 0.4)'
        });
    });
}

// ============================================================
// SCROLL PROGRESS BAR
// ============================================================
(function () {
    const fill = document.getElementById('scroll-progress-fill');
    if (!fill) return;

    function updateProgress() {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
        fill.style.width = pct + '%';
    }

    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
})();

// ============================================================
// H2 HEADING — INJECT SHIMMER SPANS + SCROLL TRIGGER
// ============================================================
(function () {
    document.querySelectorAll('h2').forEach(function (h2) {
        const span = document.createElement('span');
        span.className = 'h2-shimmer';
        h2.appendChild(span);

        ScrollTrigger.create({
            trigger: h2,
            start: 'top 82%',
            once: true,
            onEnter: function () {
                // Tiny delay so the section reveal plays first
                setTimeout(function () {
                    h2.classList.add('shimmer-animate');
                }, 200);
            }
        });
    });
})();

// ============================================================
// GLASS ORBS — HERO SECTION DECORATION
// ============================================================
(function () {
    const hero = document.querySelector('.hero-block');
    if (!hero) return;

    const orbDefs = [
        {
            size: 280,
            style: 'top:-90px;right:-70px;',
            bg: 'radial-gradient(circle at 34% 30%, rgba(255,255,255,0.10) 0%, rgba(41,151,255,0.05) 40%, transparent 70%)',
            border: 'rgba(255,255,255,0.07)',
            shadow: 'inset 2px 2px 12px rgba(255,255,255,0.08), 0 24px 70px rgba(41,151,255,0.07)'
        },
        {
            size: 160,
            style: 'bottom:-50px;left:-55px;',
            bg: 'radial-gradient(circle at 40% 36%, rgba(255,255,255,0.08) 0%, rgba(120,200,255,0.04) 46%, transparent 70%)',
            border: 'rgba(255,255,255,0.05)',
            shadow: 'inset 1px 1px 6px rgba(255,255,255,0.06), 0 12px 45px rgba(41,151,255,0.05)'
        },
        {
            size: 96,
            style: 'top:42%;right:-22px;',
            bg: 'radial-gradient(circle at 36% 28%, rgba(255,255,255,0.13) 0%, rgba(41,151,255,0.04) 50%, transparent 70%)',
            border: 'rgba(255,255,255,0.09)',
            shadow: 'inset 1px 1px 4px rgba(255,255,255,0.12)'
        }
    ];

    orbDefs.forEach(function (def, i) {
        const el = document.createElement('div');
        el.className = 'glass-orb';
        el.style.cssText = [
            'width:' + def.size + 'px',
            'height:' + def.size + 'px',
            'background:' + def.bg,
            'border:1px solid ' + def.border,
            'box-shadow:' + def.shadow,
            def.style
        ].join(';');
        hero.appendChild(el);

        // Gentle GSAP floating loop — each orb drifts differently
        gsap.to(el, {
            y: gsap.utils.random(-28, 28),
            x: gsap.utils.random(-14, 14),
            rotation: gsap.utils.random(-6, 6),
            duration: gsap.utils.random(9, 15),
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
            delay: i * 1.4
        });
    });
})();

// ============================================================
// BENTO / EXP CARDS — GLASS FLASH ON SCROLL ENTRY
// ============================================================
(function () {
    gsap.utils.toArray('.exp-card').forEach(function (card) {
        ScrollTrigger.create({
            trigger: card,
            start: 'top 88%',
            once: true,
            onEnter: function () {
                card.classList.add('glass-flash');
                setTimeout(function () { card.classList.remove('glass-flash'); }, 800);
            }
        });
    });
})();

// ============================================================
// NAVBAR — scroll class + active link tracking
// ============================================================
(function () {
    var nav = document.querySelector('.apple-nav');
    if (!nav) return;

    // Add .scrolled class after 10px of scroll
    window.addEventListener('scroll', function () {
        nav.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });

    var sections = Array.from(document.querySelectorAll('section[id]'));
    var links = Array.from(nav.querySelectorAll('.nav-link'));

    function setActive() {
        // Pick the section whose top is nearest but above 30% viewport height
        var threshold = window.innerHeight * 0.30;
        var active = null;
        sections.forEach(function (sec) {
            var top = sec.getBoundingClientRect().top;
            if (top <= threshold) active = sec.id;
        });
        links.forEach(function (link) {
            if (link.classList.contains('nav-cta')) {
                link.classList.remove('active');
                return;
            }
            var href = link.getAttribute('href') || '';
            var target = href.startsWith('#') ? href.slice(1) : '';
            var isActive = target === active;
            link.classList.toggle('active', isActive);
        });
    }

    window.addEventListener('scroll', setActive, { passive: true });
    setActive();
})();
