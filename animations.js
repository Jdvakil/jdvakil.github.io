
gsap.registerPlugin(ScrollTrigger);

// Hero Reveal
const tl = gsap.timeline();
tl.from(".hero-block", {
    y: 50,
    opacity: 0,
    duration: 1.2,
    ease: "power3.out"
});

// Staggered Card Reveals
gsap.utils.toArray(".bento-card").forEach((card, i) => {
    gsap.from(card, {
        scrollTrigger: {
            trigger: card,
            start: "top 90%",
            toggleActions: "play none none reverse"
        },
        y: 60,
        opacity: 0,
        rotation: 2,
        duration: 0.8,
        delay: i * 0.1, // Cinematic Stagger
        ease: "back.out(1.7)"
    });
});

// Impact Ticker Reveal
gsap.from(".impact-grid", {
    scrollTrigger: {
        trigger: ".impact-grid",
        start: "top 85%"
    },
    scale: 0.9,
    opacity: 0,
    duration: 1,
    ease: "expo.out"
});

// Affiliations Fade In
gsap.from(".affiliation-row", {
    scrollTrigger: {
        trigger: ".affiliation-row",
        start: "top 85%"
    },
    y: 30,
    opacity: 0,
    duration: 1.2,
    ease: "power2.out"
});

// "Pompous" Tilt Effect for Cards on Hover
// Simple JS tilt logic for high performance
document.querySelectorAll('.bento-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
    });
});
