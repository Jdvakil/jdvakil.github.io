
const canvas = document.createElement('canvas');
canvas.id = 'bg-canvas';
document.body.appendChild(canvas);

// CSS for the canvas to ensure it stays in background
canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.zIndex = '-1';
canvas.style.pointerEvents = 'none';
canvas.style.opacity = '0.4'; // Subtle fade
canvas.style.mixBlendMode = 'screen'; // Cool blending

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// "Dark Matter" Orb
// Using points for a nebula/star-cluster feel
const geometry = new THREE.IcosahedronGeometry(10, 8); // High detail
const count = geometry.attributes.position.count;
const positions = new Float32Array(count * 3);
const colors = new Float32Array(count * 3);

// Create a noisy, organic shape
const originalPos = geometry.attributes.position.array;
for (let i = 0; i < count; i++) {
    const x = originalPos[i * 3];
    const y = originalPos[i * 3 + 1];
    const z = originalPos[i * 3 + 2];

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Tech-Noir Colors (Blues, Purples, Cyans)
    const color = new THREE.Color();
    color.setHSL(0.6 + Math.random() * 0.2, 0.8, 0.6); // Blue-ish
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
}

const particles = new THREE.BufferGeometry();
particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));

// Glowing Point Material
const material = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
});

const sphere = new THREE.Points(particles, material);
scene.add(sphere);

camera.position.z = 18;

// Mouse Interaction
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;

window.addEventListener('mousemove', (e) => {
    targetX = (e.clientX / window.innerWidth) * 2 - 1;
    targetY = -(e.clientY / window.innerHeight) * 2 + 1;
});

// Scroll Interaction
let scrollY = 0;
window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
});

// Animation Loop
const clock = new THREE.Clock();

function animate() {
    const time = clock.getElapsedTime();

    // Smooth Mouse Follow
    mouseX += (targetX - mouseX) * 0.03;
    mouseY += (targetY - mouseY) * 0.03;

    // Rotate Orb based on Time, Mouse AND Scroll
    // Adding scrollY * 0.001 to rotation for a "spinning on scroll" feel
    const scrollRotation = scrollY * 0.002;

    sphere.rotation.y = time * 0.05 + mouseX * 0.2 + scrollRotation;
    sphere.rotation.z = time * 0.02 + mouseY * 0.2; // Keep z rotation subtle

    // "Breathing" Pulse Effect
    const scale = 1 + Math.sin(time * 0.5) * 0.05;
    sphere.scale.set(scale, scale, scale);

    // Camera Sway + slight lift on scroll
    camera.position.x += (mouseX - camera.position.x) * 0.01;
    camera.position.y += (-mouseY - camera.position.y) * 0.01;
    // camera.position.y -= scrollY * 0.005; // Optional: move camera down as we scroll? Let's stick to rotation for now to avoid clipping.

    camera.lookAt(scene.position);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

animate();

// Resize Handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
