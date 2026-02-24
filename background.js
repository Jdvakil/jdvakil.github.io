
const skyFallback = document.createElement('div');
skyFallback.id = 'sky-fallback';
skyFallback.style.position = 'fixed';
skyFallback.style.top = '0';
skyFallback.style.left = '0';
skyFallback.style.width = '100vw';
skyFallback.style.height = '100vh';
skyFallback.style.zIndex = '0';
skyFallback.style.pointerEvents = 'none';
skyFallback.style.opacity = '0.68';
skyFallback.style.backgroundColor = '#02030b';

const nebulaA = 'radial-gradient(60vw 45vh at 18% 24%, rgba(68, 40, 160, 0.20), rgba(0,0,0,0) 60%)';
const nebulaB = 'radial-gradient(56vw 42vh at 82% 30%, rgba(18, 92, 168, 0.18), rgba(0,0,0,0) 62%)';
const nebulaC = 'radial-gradient(44vw 38vh at 54% 78%, rgba(20, 108, 154, 0.14), rgba(0,0,0,0) 64%)';

const fallbackStars = [];
for (let i = 0; i < 150; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const s = 0.7 + Math.random() * 1.8;
    const a = 0.28 + Math.random() * 0.62;
    fallbackStars.push(`radial-gradient(circle ${s}px at ${x}% ${y}%, rgba(255,255,255,${a}), rgba(255,255,255,0) 70%)`);
}
skyFallback.style.backgroundImage = [nebulaA, nebulaB, nebulaC, ...fallbackStars].join(', ');
document.body.appendChild(skyFallback);

const canvas = document.createElement('canvas');
canvas.id = 'bg-canvas';
document.body.appendChild(canvas);

canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.zIndex = '0';
canvas.style.pointerEvents = 'none';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.z = 380;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
renderer.setClearColor(0x000000, 0);

// ── HELPER: seeded pseudo-random (no import needed) ───────────
function seededRand(seed) {
    let s = seed;
    return function () {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
    };
}

// ═══════════════════════════════════════════════════════════════
// LAYER 1 — Background haze stars (many, small, dimmer)
// ═══════════════════════════════════════════════════════════════
const HAZE_COUNT = 2800;
const hazePos   = new Float32Array(HAZE_COUNT * 3);
const hazeSizes = new Float32Array(HAZE_COUNT);
const r1 = seededRand(42);
for (let i = 0; i < HAZE_COUNT; i++) {
    hazePos[i * 3]     = (r1() - 0.5) * 3200;
    hazePos[i * 3 + 1] = (r1() - 0.5) * 3200;
    hazePos[i * 3 + 2] = (r1() - 0.5) * 1800;
    hazeSizes[i] = r1() * 2.8 + 1.8;
}
const hazeGeo = new THREE.BufferGeometry();
hazeGeo.setAttribute('position', new THREE.BufferAttribute(hazePos, 3));
hazeGeo.setAttribute('size',     new THREE.BufferAttribute(hazeSizes, 1));

// ═══════════════════════════════════════════════════════════════
// LAYER 2 — Mid stars (medium, slight colour variation)
// ═══════════════════════════════════════════════════════════════
const MID_COUNT = 820;
const midPos    = new Float32Array(MID_COUNT * 3);
const midSizes  = new Float32Array(MID_COUNT);
const midColors = new Float32Array(MID_COUNT * 3);
const midOrbitRadius = new Float32Array(MID_COUNT);
const midOrbitAngle  = new Float32Array(MID_COUNT);
const midOrbitSpeed  = new Float32Array(MID_COUNT);
const midOrbitY      = new Float32Array(MID_COUNT);
const midOrbitBob    = new Float32Array(MID_COUNT);
const midOrbitPhase  = new Float32Array(MID_COUNT);
const r2 = seededRand(137);
const MID_ARMS = 4;
for (let i = 0; i < MID_COUNT; i++) {
    const armIndex = i % MID_ARMS;
    const baseArmAngle = (armIndex / MID_ARMS) * Math.PI * 2;
    const radius = Math.pow(r2(), 0.55) * 1250 + 120;
    const spiralTwist = radius * 0.0033;
    const jitter = (r2() - 0.5) * 0.55;
    const angle = baseArmAngle + spiralTwist + jitter;
    const yBase = (r2() - 0.5) * (95 + radius * 0.08);

    midPos[i * 3]     = Math.cos(angle) * radius;
    midPos[i * 3 + 1] = yBase;
    midPos[i * 3 + 2] = Math.sin(angle) * radius;

    midOrbitRadius[i] = radius;
    midOrbitAngle[i]  = angle;
    midOrbitSpeed[i]  = 0.0032 + (1.0 - Math.min(radius / 1400, 1.0)) * 0.0085 + r2() * 0.0018;
    midOrbitY[i]      = yBase;
    midOrbitBob[i]    = 2.0 + r2() * 8.0;
    midOrbitPhase[i]  = r2() * Math.PI * 2;

    midSizes[i] = r2() * 3.8 + 2.8;
    // Warm-to-cool tint: blue giants vs warm yellows
    const t = r2();
    midColors[i * 3]     = t < 0.3 ? 0.72 : (t < 0.65 ? 1.0 : 0.88);
    midColors[i * 3 + 1] = t < 0.3 ? 0.82 : (t < 0.65 ? 0.96 : 0.90);
    midColors[i * 3 + 2] = t < 0.3 ? 1.0  : (t < 0.65 ? 0.82 : 1.0);
}
const midGeo = new THREE.BufferGeometry();
midGeo.setAttribute('position', new THREE.BufferAttribute(midPos, 3));
midGeo.setAttribute('size',     new THREE.BufferAttribute(midSizes, 1));
midGeo.setAttribute('color',    new THREE.BufferAttribute(midColors, 3));
midGeo.getAttribute('position').setUsage(THREE.DynamicDrawUsage);

// ═══════════════════════════════════════════════════════════════
// LAYER 3 — Hero / prominent stars (few, large, glow)
// ═══════════════════════════════════════════════════════════════
const HERO_COUNT = 58;
const heroPos    = new Float32Array(HERO_COUNT * 3);
const heroSizes  = new Float32Array(HERO_COUNT);
const heroColors = new Float32Array(HERO_COUNT * 3);
const heroOrbitRadius = new Float32Array(HERO_COUNT);
const heroOrbitAngle  = new Float32Array(HERO_COUNT);
const heroOrbitSpeed  = new Float32Array(HERO_COUNT);
const heroOrbitY      = new Float32Array(HERO_COUNT);
const heroOrbitBob    = new Float32Array(HERO_COUNT);
const heroOrbitPhase  = new Float32Array(HERO_COUNT);
const r3 = seededRand(9871);
const HERO_ARMS = 4;
for (let i = 0; i < HERO_COUNT; i++) {
    const armIndex = i % HERO_ARMS;
    const baseArmAngle = (armIndex / HERO_ARMS) * Math.PI * 2;
    const radius = Math.pow(r3(), 0.65) * 980 + 220;
    const spiralTwist = radius * 0.0038;
    const jitter = (r3() - 0.5) * 0.42;
    const angle = baseArmAngle + spiralTwist + jitter;
    const yBase = (r3() - 0.5) * (120 + radius * 0.04);

    heroPos[i * 3]     = Math.cos(angle) * radius;
    heroPos[i * 3 + 1] = yBase;
    heroPos[i * 3 + 2] = Math.sin(angle) * radius;

    heroOrbitRadius[i] = radius;
    heroOrbitAngle[i]  = angle;
    heroOrbitSpeed[i]  = 0.0048 + (1.0 - Math.min(radius / 1300, 1.0)) * 0.009 + r3() * 0.002;
    heroOrbitY[i]      = yBase;
    heroOrbitBob[i]    = 6.0 + r3() * 12.0;
    heroOrbitPhase[i]  = r3() * Math.PI * 2;

    heroSizes[i] = r3() * 5.2 + 5.2;
    const t = r3();
    heroColors[i * 3]     = t < 0.4 ? 0.70 : 1.0;
    heroColors[i * 3 + 1] = t < 0.4 ? 0.85 : (t < 0.75 ? 0.95 : 0.88);
    heroColors[i * 3 + 2] = t < 0.4 ? 1.0  : (t < 0.75 ? 0.78 : 1.0);
}
const heroGeo = new THREE.BufferGeometry();
heroGeo.setAttribute('position', new THREE.BufferAttribute(heroPos, 3));
heroGeo.setAttribute('size',     new THREE.BufferAttribute(heroSizes, 1));
heroGeo.setAttribute('color',    new THREE.BufferAttribute(heroColors, 3));
heroGeo.getAttribute('position').setUsage(THREE.DynamicDrawUsage);

// ═══════════════════════════════════════════════════════════════
// SHARED SHADER CHUNKS
// ═══════════════════════════════════════════════════════════════
const VERT_BASE = `
    attribute float size;
    uniform float u_time;
    varying float vAlpha;
    varying vec3 vColor;
    attribute vec3 color;
    void main() {
        float twinkle = 0.55 + 0.45 * sin(u_time * 1.1 + position.x * 0.019 + position.y * 0.013 + position.z * 0.017);
        vAlpha = twinkle;
        vColor = (color.r + color.g + color.b < 0.1) ? vec3(1.0, 0.97, 0.92) : color;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (1700.0 / max(abs(mvPos.z), 10.0));
        gl_Position = projectionMatrix * mvPos;
    }
`;

const FRAG_SOFT = `
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = clamp((1.0 - smoothstep(0.05, 0.5, d)) * vAlpha * 1.4, 0.0, 1.0);
        gl_FragColor = vec4(vColor, a);
    }
`;

// Hero fragment: cross diffraction spike + soft glow
const FRAG_HERO = `
    varying float vAlpha;
    varying vec3 vColor;
    void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;

        // Core glow — edge0 < edge1, always well-defined
        float core = 1.0 - smoothstep(0.0, 0.5, d);
        float spike = 0.0;
        // Horizontal spike
        spike += (1.0 - smoothstep(0.0, 0.08, abs(c.y))) * (1.0 - smoothstep(0.0, 0.5, abs(c.x))) * 0.5;
        // Vertical spike
        spike += (1.0 - smoothstep(0.0, 0.08, abs(c.x))) * (1.0 - smoothstep(0.0, 0.5, abs(c.y))) * 0.5;

        float a = clamp((core * 1.0 + spike * 0.75) * vAlpha * 1.2, 0.0, 1.0);
        gl_FragColor = vec4(vColor + vec3(0.08), a);
    }
`;

const mkMat = (frag) => new THREE.ShaderMaterial({
    uniforms: { u_time: { value: 0.0 } },
    vertexShader: VERT_BASE,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true
});

const hazeMat = mkMat(FRAG_SOFT);
const midMat  = mkMat(FRAG_SOFT);
const heroMat = mkMat(FRAG_HERO);

hazeMat.opacity = 0.9;
midMat.opacity = 1.0;
heroMat.opacity = 1.0;

// Add fallback white color attribute for layers that don't have per-vertex colour
function addWhiteColors(geo, count) {
    const c = new Float32Array(count * 3).fill(1.0);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
addWhiteColors(hazeGeo, HAZE_COUNT);

const hazePoints = new THREE.Points(hazeGeo, hazeMat);
const midPoints  = new THREE.Points(midGeo,  midMat);
const heroPoints = new THREE.Points(heroGeo, heroMat);
scene.add(hazePoints, midPoints, heroPoints);

// ═══════════════════════════════════════════════════════════════
// GALAXY BAND — Milky Way smear across the center
// ═══════════════════════════════════════════════════════════════
const bandMat = new THREE.ShaderMaterial({
    uniforms: { u_time: { value: 0.0 } },
    vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
        varying vec2 vUv;
        uniform float u_time;

        // Simple value noise
        float hash(float n) { return fract(sin(n) * 43758.5453123); }
        float vnoise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            f = f*f*(3.0-2.0*f);
            float a = hash(i.x + i.y*57.0);
            float b = hash(i.x+1.0 + i.y*57.0);
            float c = hash(i.x + (i.y+1.0)*57.0);
            float d = hash(i.x+1.0 + (i.y+1.0)*57.0);
            return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
        }

        void main() {
            vec2 uv = vUv - 0.5;
            // Tilted band
            float angle = 0.42;
            float along = uv.x * cos(angle) + uv.y * sin(angle);
            float across = -uv.x * sin(angle) + uv.y * cos(angle);

            // Soft band falloff — very subtle
            float band = 1.0 - smoothstep(0.0, 0.18, abs(across));

            // Add some clumpiness
            float slow = u_time * 0.008;
            float n = vnoise(vec2(along * 5.0 + slow, across * 12.0 + slow * 0.5));
            float n2 = vnoise(vec2(along * 11.0 - slow * 0.7, across * 22.0));
            float density = band * (0.5 + 0.5 * n) * (0.6 + 0.4 * n2);

            // Colour: slight purple-blue tint
            vec3 col = mix(vec3(0.12, 0.06, 0.22), vec3(0.05, 0.10, 0.30), n);

            float alpha = density * 0.24;
            gl_FragColor = vec4(col, alpha);
        }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
});

const band = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800), bandMat);
band.position.z = -500;
scene.add(band);

// ═══════════════════════════════════════════════════════════════
// NEBULA — gentle dual-cloud colour wash
// ═══════════════════════════════════════════════════════════════
const nebulaMat = new THREE.ShaderMaterial({
    uniforms: { u_time: { value: 0.0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
        varying vec2 vUv;
        uniform float u_time;
        void main() {
            vec2 uv = vUv - 0.5;
            float t = u_time;
            // Cloud A: deep violet
            vec2 ca = uv + vec2(sin(t*0.042)*0.14, cos(t*0.036)*0.10);
            float a1 = 1.0 - smoothstep(0.0, 0.46, length(ca));
            // Cloud B: dusty teal
            vec2 cb = uv - vec2(cos(t*0.031)*0.16, sin(t*0.052)*0.12);
            float a2 = 1.0 - smoothstep(0.0, 0.36, length(cb));

            vec3 colA = vec3(0.18, 0.06, 0.38) * a1;
            vec3 colB = vec3(0.03, 0.16, 0.28) * a2;
            float alpha = clamp((a1 + a2) * 0.145, 0.0, 0.24);
            gl_FragColor = vec4(colA + colB, alpha);
        }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide
});
const nebula = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 32), nebulaMat);
scene.add(nebula);

// ═══════════════════════════════════════════════════════════════
// MOUSE PARALLAX
// ═══════════════════════════════════════════════════════════════
let targetX = 0, targetY = 0;
window.addEventListener('mousemove', (e) => {
    targetX = (e.clientX / window.innerWidth  - 0.5) * 20;
    targetY = (e.clientY / window.innerHeight - 0.5) * 12;
}, { passive: true });

const clock = new THREE.Clock();
const allMats = [hazeMat, midMat, heroMat, bandMat, nebulaMat];
let lastOrbitUpdate = 0;

function animate() {
    const t = clock.getElapsedTime();
    allMats.forEach(m => m.uniforms.u_time.value = t);

    if (t - lastOrbitUpdate >= (1 / 30)) {
        const midPosArray = midGeo.attributes.position.array;
        for (let i = 0; i < MID_COUNT; i++) {
            const theta = midOrbitAngle[i] + t * midOrbitSpeed[i];
            const radius = midOrbitRadius[i];
            midPosArray[i * 3] = Math.cos(theta) * radius;
            midPosArray[i * 3 + 1] = midOrbitY[i] + Math.sin(t * 0.78 + midOrbitPhase[i]) * midOrbitBob[i];
            midPosArray[i * 3 + 2] = Math.sin(theta) * radius;
        }
        midGeo.attributes.position.needsUpdate = true;

        const heroPosArray = heroGeo.attributes.position.array;
        for (let i = 0; i < HERO_COUNT; i++) {
            const theta = heroOrbitAngle[i] + t * heroOrbitSpeed[i];
            const radius = heroOrbitRadius[i];
            heroPosArray[i * 3] = Math.cos(theta) * radius;
            heroPosArray[i * 3 + 1] = heroOrbitY[i] + Math.sin(t * 0.92 + heroOrbitPhase[i]) * heroOrbitBob[i];
            heroPosArray[i * 3 + 2] = Math.sin(theta) * radius;
        }
        heroGeo.attributes.position.needsUpdate = true;
        lastOrbitUpdate = t;
    }

    // Very slow rotation on each layer at slightly different rates for depth parallax
    hazePoints.rotation.y = t * 0.0012;
    hazePoints.rotation.x = t * 0.00045;
    midPoints.rotation.y  = t * 0.0016;
    midPoints.rotation.x  = t * 0.0007;
    heroPoints.rotation.y = t * 0.0011;

    band.rotation.z = 0.42 + t * 0.004;
    nebula.rotation.y = t * 0.006;
    nebula.rotation.x = Math.sin(t * 0.09) * 0.05;
    // Smooth mouse parallax
    camera.position.x += (targetX  - camera.position.x) * 0.025;
    camera.position.y += (-targetY - camera.position.y) * 0.025;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
});
