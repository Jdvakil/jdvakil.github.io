gsap.registerPlugin(ScrollTrigger);

// 1. System Clock
function updateClock() {
    const clock = document.getElementById('sys-time');
    if (!clock) return;
    const now = new Date();
    clock.innerText = now.toTimeString().split(' ')[0] + " [UTC]";
}
setInterval(updateClock, 1000);
updateClock();

// 2. System Boot Sequence
const bootLines = [
    "UPLINK ESTABLISHED...",
    "KERNEL_OS v12.0 LOADING...",
    "HARDWARE CHECK: LATTICE_CHASSIS [OK]",
    "SYSTEM_DRIVE: KINETIC_HUB [OPTIMIZED]",
    "INITIALIZING_SENTINEL..."
];

const bootScreen = document.getElementById('boot-screen');
let lineIdx = 0;

function typeBootLines() {
    if (lineIdx < bootLines.length) {
        bootScreen.innerText = bootLines[lineIdx];
        lineIdx++;
        setTimeout(typeBootLines, 400);
    } else {
        // Boot Completion
        gsap.to(bootScreen, {
            opacity: 0,
            duration: 1,
            ease: "power2.inOut",
            onComplete: () => {
                bootScreen.style.display = 'none';
                startMainAnimations();
            }
        });
    }
}

// Start Boot
window.addEventListener('load', typeBootLines);

// 3. Main Page Animations
function startMainAnimations() {
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
            delay: i * 0.1,
            ease: "back.out(1.7)"
        });
    });
}

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
