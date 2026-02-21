gsap.registerPlugin(ScrollTrigger);

// --- 1. EXPLOSIVE REVEAL SEQUENCES ("CRACKED" PHYSICS) ---
function startMainAnimations() {
    // Hero Explode In
    const tl = gsap.timeline();
    tl.from(".hero-block", {
        y: 100,
        scale: 0.9,
        opacity: 0,
        duration: 1.5,
        ease: "elastic.out(1, 0.5)" // Bouncy, liquid physics
    });

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
