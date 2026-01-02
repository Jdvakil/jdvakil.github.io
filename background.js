
const canvas = document.createElement('canvas');
canvas.id = 'bg-canvas';
document.body.appendChild(canvas);

canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.zIndex = '-1';
canvas.style.pointerEvents = 'none';
canvas.style.opacity = '1';
canvas.style.mixBlendMode = 'screen';

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.02); // Distance fog

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// --- UNBOUNDED NEURAL FLOW --- 

// 1. The Particle Field (Stream)
const particlesGeometry = new THREE.BufferGeometry();
const particleCount = 1500; // More particles for a full field
const posArray = new Float32Array(particleCount * 3);
const randomOffsets = new Float32Array(particleCount); // For individual wave offsets

// Spread across a wide area (infinite looping field)
const spreadX = 60;
const spreadY = 40;
const spreadZ = 40;

for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    posArray[i3] = (Math.random() - 0.5) * spreadX;     // X: Wide
    posArray[i3 + 1] = (Math.random() - 0.5) * spreadY;   // Y: High
    posArray[i3 + 2] = (Math.random() - 0.5) * spreadZ;   // Z: Deep

    randomOffsets[i] = Math.random() * Math.PI * 2;
}

particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

const particleMaterial = new THREE.PointsMaterial({
    size: 0.15,
    color: 0x00ffff,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
});

const nodeCloud = new THREE.Points(particlesGeometry, particleMaterial);
scene.add(nodeCloud);

// 2. Dynamic Synapses (Lines)
const maxConnections = 120;
const lineGeo = new THREE.BufferGeometry();
const linePos = new Float32Array(maxConnections * 2 * 3);
lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));

const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.35
});
const connections = new THREE.LineSegments(lineGeo, lineMaterial);
connections.frustumCulled = false;
scene.add(connections);


camera.position.z = 25;

// Inputs
let mouseX = 0;
let mouseY = 0;
let scrollY = 0;
// Target positions for smooth camera sway
let targetCamX = 0;
let targetCamY = 0;

// Mouse Plane
const raycaster = new THREE.Raycaster();
const mouseVector = new THREE.Vector2();
const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

window.addEventListener('mousemove', (e) => {
    // Standard normalized coords
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;

    mouseVector.x = mouseX;
    mouseVector.y = mouseY;
});

window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
});

// --- COLOR PALETTES (Flow) ---
const palettes = [
    { particles: new THREE.Color(0x00ffff) }, // Blue/Cyan
    { particles: new THREE.Color(0xffaa00) }, // Gold
    { particles: new THREE.Color(0xe879f9) }, // Purple
    { particles: new THREE.Color(0x34d399) }  // Green
];

const clock = new THREE.Clock();

function animate() {
    const time = clock.getElapsedTime();
    const positions = nodeCloud.geometry.attributes.position.array;

    // 1. FLOW PHYSICS
    // Move all particles to the left (minus X) or rotate?
    // Let's do a gentle "Wind" movement along X (+ drift)

    // speed varies by scroll
    const flowSpeed = 0.05 + (scrollY * 0.0001);

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // --- CONSTANT FLOW ---
        positions[i3] += flowSpeed; // Move Right

        // Sine Wave "Fluid" Motion on Y axis based on Time and X position
        // This creates a "Wavy River" effect
        const wave = Math.sin(time * 0.5 + positions[i3] * 0.2 + randomOffsets[i]) * 0.02;
        positions[i3 + 1] += wave;

        // --- WRAP AROUND (Infinite) ---
        // If particle goes too far right, wrap to left
        if (positions[i3] > spreadX / 2) {
            positions[i3] = -spreadX / 2;
            // Randomize Y/Z slightly on respawn to avoid patterns
            positions[i3 + 1] = (Math.random() - 0.5) * spreadY;
            positions[i3 + 2] = (Math.random() - 0.5) * spreadZ;
        }
    }
    nodeCloud.geometry.attributes.position.needsUpdate = true;

    // 2. COLOR SHIFT
    const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 100);
    const progress = Math.min(Math.max(scrollY / maxScroll, 0), 1);
    const stageFloat = progress * (palettes.length - 1);
    const stageIndex = Math.floor(stageFloat);
    const nextStageIndex = Math.min(stageIndex + 1, palettes.length - 1);
    const alpha = stageFloat - stageIndex;

    particleMaterial.color.lerpColors(palettes[stageIndex].particles, palettes[nextStageIndex].particles, alpha);

    // 3. INTERACTIVE SYNAPSES
    // Raycast to find mouse position in world space
    raycaster.setFromCamera(mouseVector, camera);
    let interactionPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(planeZ, interactionPoint);

    if (!interactionPoint) interactionPoint = new THREE.Vector3(1000, 1000, 1000); // Offscreen

    let connectionCount = 0;

    // Check for connections
    for (let i = 0; i < particleCount; i += 3) { // Skip some for optimization
        if (connectionCount >= maxConnections) break;

        const px = positions[i * 3];
        const py = positions[i * 3 + 1];
        const pz = positions[i * 3 + 2];

        // Distance to interaction point
        const dx = interactionPoint.x - px;
        const dy = interactionPoint.y - py;
        const dz = interactionPoint.z - pz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Connect if close
        if (dist < 5) {
            const lineIndex = connectionCount * 6;
            linePos[lineIndex] = interactionPoint.x;
            linePos[lineIndex + 1] = interactionPoint.y;
            linePos[lineIndex + 2] = interactionPoint.z;

            linePos[lineIndex + 3] = px;
            linePos[lineIndex + 4] = py;
            linePos[lineIndex + 5] = pz;
            connectionCount++;
        }
    }

    // Clear unused lines
    for (let k = connectionCount * 6; k < maxConnections * 6; k++) {
        linePos[k] = 0;
    }
    connections.geometry.attributes.position.needsUpdate = true;

    // 4. CAMERA SWAY (Subtle Parallax)
    // Target position based on mouse
    targetCamX = mouseX * 2;
    targetCamY = mouseY * 2;

    camera.position.x += (targetCamX - camera.position.x) * 0.05;
    camera.position.y += (targetCamY - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
