
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
canvas.style.opacity = '1'; // Full intensity
canvas.style.mixBlendMode = 'screen'; // Additive blend with page

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// --- THE DIGITAL SINGULARITY ---

// 1. The Hyper-Lattice (Outer Structure)
// Massive wireframe sphere surrounding the user
const latticeGeo = new THREE.IcosahedronGeometry(18, 2);
const latticeMat = new THREE.MeshBasicMaterial({
    color: 0x2997ff,
    wireframe: true,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending
});
const lattice = new THREE.Mesh(latticeGeo, latticeMat);
scene.add(lattice);

// 2. The Inner Core (Processing Unit)
// Dense, rapidly spinning core
const coreGeo = new THREE.OctahedronGeometry(6, 4);
const coreMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    wireframe: true,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending
});
const core = new THREE.Mesh(coreGeo, coreMat);
scene.add(core);

// 3. Data Beams (High Speed)
// Animated dashed lines orbiting the core
const beamGroup = new THREE.Group();
scene.add(beamGroup);

const beamCount = 40;
const beamIs = [];

for (let i = 0; i < beamCount; i++) {
    const radius = 8 + Math.random() * 8; // Between Core and Lattice
    const curve = new THREE.EllipseCurve(
        0, 0,            // ax, aY
        radius, radius,  // xRadius, yRadius
        0, 2 * Math.PI,  // aStartAngle, aEndAngle
        false,            // aClockwise
        Math.random() * 360 // aRotation
    );

    const points = curve.getPoints(64);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    // Dashed Material for "Data Packet" look
    const material = new THREE.LineDashedMaterial({
        color: 0xffffff,
        linewidth: 1,
        scale: 1,
        dashSize: 3, // Short bright dash
        gapSize: 20, // Long gap
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });

    const beam = new THREE.Line(geometry, material);
    beam.computeLineDistances(); // Required for dashes

    // Random orientation
    beam.rotation.x = Math.random() * Math.PI;
    beam.rotation.y = Math.random() * Math.PI;

    beamGroup.add(beam);

    // Store for animation
    beamIs.push({
        mesh: beam,
        speed: (Math.random() * 0.5) + 0.2, // Fast rotation
        axis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize()
    });
}

// 4. Volumetric Dust (Atmosphere)
const particlesGeometry = new THREE.BufferGeometry();
const particleCount = 1500;
const posArray = new Float32Array(particleCount * 3);
const originalPos = new Float32Array(particleCount * 3); // Store original for spring back

for (let i = 0; i < particleCount; i++) {
    const x = (Math.random() - 0.5) * 60;
    const y = (Math.random() - 0.5) * 60;
    const z = (Math.random() - 0.5) * 40;

    posArray[i * 3] = x;
    posArray[i * 3 + 1] = y;
    posArray[i * 3 + 2] = z;

    originalPos[i * 3] = x;
    originalPos[i * 3 + 1] = y;
    originalPos[i * 3 + 2] = z;
}

particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particleMaterial = new THREE.PointsMaterial({
    size: 0.15,
    color: 0x2997ff,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending
});
const dust = new THREE.Points(particlesGeometry, particleMaterial);
scene.add(dust);

camera.position.z = 24;

// Interaction State
let mouseX = 0;
let mouseY = 0;
let scrollY = 0;
const raycaster = new THREE.Raycaster();
const mouseVector = new THREE.Vector2();

window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
});

// Color Gradients
const palettes = [
    new THREE.Color(0x2997ff), // Cyan
    new THREE.Color(0xffaa00), // Gold
    new THREE.Color(0xe879f9), // Purple
    new THREE.Color(0x10b981)  // Green
]; // Target colors

const clock = new THREE.Clock();

function animate() {
    const time = clock.getElapsedTime();

    // 1. ROTATE SUPER-STRUCTURES
    lattice.rotation.y = time * 0.05;
    lattice.rotation.x = Math.sin(time * 0.1) * 0.05;

    // Core spins faster
    core.rotation.y = -time * 0.2;
    core.rotation.z = time * 0.1;

    // Pulse on Scroll
    const pulse = 1 + (Math.sin(time * 2) * 0.02) + (scrollY * 0.0001);
    core.scale.set(pulse, pulse, pulse);

    // 2. DATA BEAMS (High Velocity)
    beamIs.forEach(b => {
        b.mesh.rotateOnAxis(b.axis, b.speed * 0.05); // Orbit
        // Animate dashes? LineDashedMaterial doesn't support offset anim easily.
        // Instead we rotate the ring itself quickly.
    });

    // 3. COLOR SHIFT
    const maxScroll = Math.max(document.body.scrollHeight - window.innerHeight, 100);
    const progress = Math.min(Math.max(scrollY / maxScroll, 0), 1);
    const stageFloat = progress * (palettes.length - 1);
    const stageIndex = Math.floor(stageFloat);
    const nextStageIndex = Math.min(stageIndex + 1, palettes.length - 1);
    const alpha = stageFloat - stageIndex;

    const col = new THREE.Color().lerpColors(palettes[stageIndex], palettes[nextStageIndex], alpha);

    latticeMat.color.copy(col);
    // Core is complementary or same? Let's make core brighter white mix
    coreMat.color.copy(col).lerp(new THREE.Color(0xffffff), 0.3);
    particleMaterial.color.copy(col);


    // 4. INTERACTIVE DEFORMATION
    // "Reality Distortion": Mouse position pushes dust away powerfully
    const positions = dust.geometry.attributes.position.array;

    // Project mouse to World Z=0 approx
    const vec = new THREE.Vector3(mouseX, mouseY, 0.5);
    vec.unproject(camera);
    const dir = vec.sub(camera.position).normalize();
    const distance = -camera.position.z / dir.z;
    const mousePos = camera.position.clone().add(dir.multiplyScalar(distance));

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const ox = originalPos[i3];
        const oy = originalPos[i3 + 1];
        const oz = originalPos[i3 + 2];

        let px = positions[i3];
        let py = positions[i3 + 1];
        let pz = positions[i3 + 2];

        // Distortion Force
        const dx = mousePos.x - px;
        const dy = mousePos.y - py;
        const dz = mousePos.z - pz;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < 25) { // Radius 5
            const force = (25 - distSq) * 0.05;
            // Push away
            px -= dx * force;
            py -= dy * force;
            pz -= dz * force;
        }

        // Spring back to original
        px += (ox - px) * 0.05;
        py += (oy - py) * 0.05;
        pz += (oz - pz) * 0.05;

        positions[i3] = px;
        positions[i3 + 1] = py;
        positions[i3 + 2] = pz;
    }
    dust.geometry.attributes.position.needsUpdate = true;

    // 5. CAMERA PARALLAX (Aggressive)
    const targetX = mouseX * 2;
    const targetY = mouseY * 2;

    camera.position.x += (targetX - camera.position.x) * 0.1;
    camera.position.y += (targetY - camera.position.y) * 0.1;
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
