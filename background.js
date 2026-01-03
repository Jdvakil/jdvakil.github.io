
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
scene.fog = new THREE.FogExp2(0x000000, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// --- THE CYBERNETIC SENTINEL ---

// 1. Warp Core Chassis (Mechanical Shell)
const chassisGroup = new THREE.Group();
scene.add(chassisGroup);

const boxes = [];
for (let i = 0; i < 2; i++) {
    const size = 12 + i * 10;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x2997ff,
        wireframe: true,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending
    });
    const box = new THREE.Mesh(geo, mat);
    chassisGroup.add(box);
    boxes.push(box);
}

// 2. Processing Rings (Warp Hub)
const ringGroup = new THREE.Group();
scene.add(ringGroup);

const rings = [];
const ringCount = 3;
for (let i = 0; i < ringCount; i++) {
    const geo = new THREE.TorusGeometry(8 + i * 3, 0.05, 8, 50);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = Math.PI / 2;
    ringGroup.add(ring);
    rings.push({
        mesh: ring,
        pulseSpeed: 0.5 + i * 0.2,
        rotSpeed: (Math.random() - 0.5) * 0.02
    });
}

// 3. The CPU Core (Energy Source)
const cpuGeo = new THREE.BoxGeometry(5, 5, 5);
const cpuMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending
});
const cpu = new THREE.Mesh(cpuGeo, cpuMat);
scene.add(cpu);

// 4. Circuit Flow (Electrons)
const particlesGeometry = new THREE.BufferGeometry();
const particleCount = 2500;
const posArray = new Float32Array(particleCount * 3);
const originalPos = new Float32Array(particleCount * 3);

for (let i = 0; i < particleCount; i++) {
    const gridSize = 3;
    const x = Math.round((Math.random() - 0.5) * 80 / gridSize) * gridSize;
    const y = Math.round((Math.random() - 0.5) * 80 / gridSize) * gridSize;
    const z = Math.round((Math.random() - 0.5) * 50 / gridSize) * gridSize;

    posArray[i * 3] = x;
    posArray[i * 3 + 1] = y;
    posArray[i * 3 + 2] = z;

    originalPos[i * 3] = x;
    originalPos[i * 3 + 1] = y;
    originalPos[i * 3 + 2] = z;
}

particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particleMaterial = new THREE.PointsMaterial({
    size: 0.12, // Balanced size (in-between 0.06 and 0.3)
    color: 0x2997ff,
    transparent: true,
    opacity: 0.4, // even subtler
    blending: THREE.AdditiveBlending,
    depthWrite: false // improved performance
});
const electrons = new THREE.Points(particlesGeometry, particleMaterial);
scene.add(electrons);

camera.position.z = 28;

// Interaction State
let mouseX = 0;
let mouseY = 0;
let scrollY = 0;
let lastScrollY = 0;
let scrollVelocity = 0;

window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
});

// Color Gradients
const palettes = [
    new THREE.Color(0x008080), // Teal (Primary choice)
    new THREE.Color(0x2997ff), // Cyan
    new THREE.Color(0xff00ff), // Magenta (Robotics/Cyberpunk)
    new THREE.Color(0xffaa00), // Gold
    new THREE.Color(0x00ff00)  // Lime
];

// Randomize color order on refresh (Fisher-Yates shuffle)
for (let i = palettes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [palettes[i], palettes[j]] = [palettes[j], palettes[i]];
}

const clock = new THREE.Clock();

function animate() {
    const time = clock.getElapsedTime();

    // Calculate Kinetic Gravity
    const deltaY = scrollY - lastScrollY;
    lastScrollY = scrollY;
    scrollVelocity += deltaY * 0.0005; // Even lower scroll sensitivity (was 0.001)
    scrollVelocity *= 0.94; // Higher friction for mechanical feel

    const globalSpeed = 0.002 + Math.abs(scrollVelocity) * 0.2; // Reduced scroll impact (was * 0.5)

    // 1. ANIMATE CHASSIS
    boxes.forEach((box, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        box.rotation.y += globalSpeed * dir;
        box.rotation.z += globalSpeed * 0.5 * dir;
    });

    // 2. ANIMATE RINGS (Warp Drive)
    rings.forEach((r, i) => {
        r.mesh.rotation.y += (r.rotSpeed * 0.25) + scrollVelocity * 0.2; // Subtler scroll rotation (was * 0.5)
        r.mesh.rotation.x += (r.rotSpeed * 0.25);

        // Pulsate ring opacity
        const pulse = 0.2 + Math.sin(time * r.pulseSpeed) * 0.1;
        r.mesh.material.opacity = pulse + (Math.abs(scrollVelocity) * 2);

        // Expand rings on scroll
        const scale = 1 + (Math.abs(scrollVelocity) * 5);
        r.mesh.scale.set(scale, scale, scale);
    });

    cpu.rotation.x += globalSpeed * 2;
    cpu.rotation.y += globalSpeed * 3;
    const cpuPulse = 1 + Math.sin(time * 5) * 0.05 + Math.abs(scrollVelocity) * 2;
    cpu.scale.set(cpuPulse, cpuPulse, cpuPulse);

    // 3. CIRCUIT PULSE (ELECTRON PATHS)
    const positions = electrons.geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const ox = originalPos[i3];
        const oy = originalPos[i3 + 1];
        const oz = originalPos[i3 + 2];

        // Grid drift
        const wave = Math.sin(time * 0.5 + ox * 0.2) * 0.5;
        positions[i3] = ox + wave;
        positions[i3 + 1] = oy + Math.cos(time * 0.5 + oy * 0.2) * 0.5;

        // Mouse avoidance (magnetic interference)
        const dx = (mouseX * 35) - positions[i3];
        const dy = (mouseY * 25) - positions[i3 + 1];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 12) {
            positions[i3] -= dx * 0.08;
            positions[i3 + 1] -= dy * 0.08;
            positions[i3 + 2] += 1.1; // Balanced pop out (in-between 0.8 and 1.5)
        } else {
            positions[i3 + 2] += (oz - positions[i3 + 2]) * 0.05; // Snap back Z
        }
    }
    electrons.geometry.attributes.position.needsUpdate = true;

    // 4. COLOR LERP
    const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 100);
    const progress = Math.min(Math.max(scrollY / maxScroll, 0), 1);
    const stageFloat = progress * (palettes.length - 1);
    const stageIndex = Math.floor(stageFloat);
    const nextStageIndex = Math.min(stageIndex + 1, palettes.length - 1);
    const alpha = stageFloat - stageIndex;

    const col = new THREE.Color().lerpColors(palettes[stageIndex], palettes[nextStageIndex], alpha);

    // Smoother mesh color update
    boxes.forEach(b => b.material.color.lerp(col, 0.05));
    rings.forEach(r => r.mesh.material.color.lerp(col, 0.05));
    cpuMat.color.copy(col).lerp(new THREE.Color(0xffffff), 0.5);
    particleMaterial.color.lerp(col, 0.05);

    // 5. CAMERA KINETICS
    camera.position.x += (mouseX * 5 - camera.position.x) * 0.05;
    camera.position.y += (mouseY * 4 - camera.position.y) * 0.05;
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
