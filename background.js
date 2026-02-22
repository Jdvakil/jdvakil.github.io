/* ================================
   BACKGROUND — Domain-Warped Aurora
   Apple macOS Tahoe / Vision Pro
   inspired fluid nebula shader.

   Technique: Fractional Brownian Motion
   with iterative domain warping
   (Inigo Quilez technique).

   Color palette: deep midnight space —
   cold indigo, electric teal, violet
   haze. Subtle, never overpowering.
   ================================ */

// ── Canvas setup ──────────────────
const canvas = document.createElement('canvas');
canvas.id = 'bg-canvas';
document.body.appendChild(canvas);

Object.assign(canvas.style, {
  position:      'fixed',
  top:           '0',
  left:          '0',
  width:         '100vw',
  height:        '100vh',
  zIndex:        '-1',
  pointerEvents: 'none',
  opacity:       '1',
  mixBlendMode:  'normal',   // Screen caused harsh blue cast — use normal
});

// ── Three.js renderer ─────────────
const scene    = new THREE.Scene();
const camera   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias:  false,   // FXAA not needed for fullscreen shader
  alpha:      true,
  powerPreference: 'high-performance',
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap for perf

// ── Uniforms ──────────────────────
const uniforms = {
  u_time:           { value: 0.0 },
  u_resolution:     { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  u_mouse:          { value: new THREE.Vector2(0.5, 0.5) },
  u_mouseVelocity:  { value: new THREE.Vector2(0.0, 0.0) },
  u_scrollVelocity: { value: 0.0 },
  u_scrollY:        { value: 0.0 },
};

// ── Full-screen quad ──────────────
const geometry = new THREE.PlaneGeometry(2, 2);

// ────────────────────────────────────────────────────────────────
// VERTEX SHADER — passthrough (effect lives entirely in fragment)
// ────────────────────────────────────────────────────────────────
const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// ────────────────────────────────────────────────────────────────
// FRAGMENT SHADER
// Domain-warped FBM aurora
//
// Technique breakdown:
//   1. Hash → pseudo-random values from 2D positions
//   2. noise() → smooth value noise (bilinear)
//   3. fbm()   → 6-octave fractal brownian motion
//   4. warp()  → iterate: q=fbm(p), r=fbm(p+q), color=fbm(p+r)
//      This creates the organic swirling fluid look.
//   5. Color palette → cosine palette (Inigo Quilez)
//      deep midnight + cold electric aurora
// ────────────────────────────────────────────────────────────────
const fragmentShader = /* glsl */`
precision highp float;

uniform float     u_time;
uniform vec2      u_resolution;
uniform vec2      u_mouse;
uniform vec2      u_mouseVelocity;
uniform float     u_scrollVelocity;
uniform float     u_scrollY;

varying vec2 vUv;

// ── Hash (fast, GPU-friendly) ──────────────────────────────────
float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// ── Smooth value noise (2D) ────────────────────────────────────
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  // Quintic smoothstep (C2 continuity — no derivative discontinuity)
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// ── Fractional Brownian Motion (6 octaves) ─────────────────────
// Layered noise with decreasing amplitude and increasing frequency.
// Produces the characteristic "fractal cloud" look.
float fbm(vec2 p) {
  float value    = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  mat2  rot = mat2(cos(0.5), -sin(0.5), sin(0.5), cos(0.5));

  for (int i = 0; i < 6; i++) {
    value     += amplitude * noise(p * frequency);
    p          = rot * p;           // Rotate domain each octave — breaks axis alignment
    frequency *= 2.1;
    amplitude *= 0.48;
  }
  return value;
}

// ── Cosine Palette (Inigo Quilez) ──────────────────────────────
// palette(t) = a + b * cos(2π * (c * t + d))
// Returns smooth, cyclically varying color from a float 0..1
vec3 palette(float t) {
  // Midnight aurora palette:
  //   a = base color (deep dark blue-grey)
  //   b = amplitude (how much it swings)
  //   c = frequency per channel
  //   d = phase offset per channel
  vec3 a = vec3(0.04, 0.04, 0.08);     // Very dark neutral base
  vec3 b = vec3(0.06, 0.06, 0.12);     // Low amplitude — stays dark
  vec3 c = vec3(1.0,  1.0,  0.85);
  vec3 d = vec3(0.0,  0.15, 0.45);     // Phase: blue shifts to teal
  return a + b * cos(6.28318 * (c * t + d));
}

// ── Electric accent flare ──────────────────────────────────────
// Adds a narrow bright streak — like an aurora ribbon
float ribbon(vec2 p, float offset) {
  float n = fbm(p * 1.2 + vec2(offset, u_time * 0.04));
  return smoothstep(0.62, 0.72, n);
}

// ── Mouse influence field ──────────────────────────────────────
float mouseField(vec2 uv, vec2 mouse) {
  float d = distance(uv, mouse);
  return smoothstep(0.45, 0.0, d) * 0.65;
}

// ══════════════════════════════════════════════════════════════
void main() {
  // Normalized UV, corrected for aspect ratio
  vec2 uv = vUv;
  float aspect = u_resolution.x / u_resolution.y;

  // Slow drift + scroll warp
  float slowTime    = u_time * 0.055;
  float scrollWarp  = u_scrollY * 0.00018 + u_scrollVelocity * 0.4;

  // Primary domain coordinates
  vec2 p = vec2(uv.x * aspect, uv.y) * 2.5;
  p += vec2(slowTime * 0.25, slowTime * 0.15);  // Slow drift
  p.y -= scrollWarp;                             // Scroll distortion

  // Mouse-driven swirl
  vec2 mouseUV = vec2(u_mouse.x * aspect, u_mouse.y);
  vec2 toMouse  = (mouseUV - vec2(uv.x * aspect, uv.y)) * 0.6;
  p += toMouse * mouseField(vec2(uv.x * aspect, uv.y), mouseUV) * 0.35;

  // ── Domain Warp (3-pass) ──────────────────────────────────────
  // Pass 1: q = distort the domain with fbm
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0)),
    fbm(p + vec2(5.2, 1.3))
  );

  // Pass 2: r = distort again using q
  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.7,  9.2) + slowTime * 0.35),
    fbm(p + 4.0 * q + vec2(8.3,  2.8) + slowTime * 0.29)
  );

  // Pass 3: final warp value drives color
  float f = fbm(p + 4.2 * r + slowTime * 0.12);

  // ── Color mapping ─────────────────────────────────────────────
  vec3 col = palette(f + u_time * 0.02);

  // Add aurora ribbons — narrow bright streaks
  float r1 = ribbon(uv + vec2(u_time * 0.018, 0.0), 1.4);
  float r2 = ribbon(uv + vec2(-u_time * 0.012, 0.3), 3.7);
  float r3 = ribbon(uv * 1.3 + vec2(u_time * 0.009, 0.6), 7.1);

  // Ribbon colors (cold aurora hues — electric teal / indigo / violet)
  vec3 teal    = vec3(0.02, 0.14, 0.22);   // Deep electric teal
  vec3 indigo  = vec3(0.04, 0.04, 0.18);   // Cold indigo
  vec3 violet  = vec3(0.08, 0.03, 0.16);   // Soft violet

  col += r1 * teal   * 1.6;
  col += r2 * indigo * 1.2;
  col += r3 * violet * 0.9;

  // Mouse proximity brightens the aurora locally
  float mf = mouseField(vec2(uv.x * aspect, uv.y), mouseUV);
  col += mf * vec3(0.03, 0.06, 0.10) * (0.5 + 0.5 * sin(u_time * 1.5));

  // ── Vignette ─────────────────────────────────────────────────
  // Double radial vignette for depth
  vec2 vigUV  = uv - 0.5;
  float vig   = 1.0 - dot(vigUV, vigUV) * 2.8;
  vig = pow(max(vig, 0.0), 1.4);
  col *= vig;

  // ── Bottom fade ───────────────────────────────────────────────
  // Aurora more prominent at top, fades toward bottom
  float topFade = smoothstep(0.0, 0.55, uv.y);
  col *= mix(0.5, 1.0, topFade);

  // ── Clamp & gamma ─────────────────────────────────────────────
  col = clamp(col, 0.0, 1.0);
  col = pow(col, vec3(0.9));    // Slight gamma lift — pops the blacks

  // Output: fully opaque (canvas is below content)
  gl_FragColor = vec4(col, 1.0);
}
`;

// ── Build material & mesh ─────────
const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  transparent: false,
  depthWrite:  false,
  depthTest:   false,
});

const plane = new THREE.Mesh(geometry, material);
scene.add(plane);
camera.position.z = 1;

// ── Interaction state ─────────────
let scrollY        = 0;
let lastScrollY    = 0;
let scrollVelocity = 0;

let mouseX = 0.5, mouseY = 0.5;
let lastMouseX = 0.5, lastMouseY = 0.5;

// Smooth mouse tracking (lerp toward real position)
let smoothMouseX = 0.5, smoothMouseY = 0.5;

window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX / window.innerWidth;
  mouseY = 1.0 - (e.clientY / window.innerHeight);
}, { passive: true });

window.addEventListener('scroll', () => {
  scrollY = window.scrollY;
}, { passive: true });

// ── Render loop ───────────────────
const clock = new THREE.Clock();
let frameId;

function animate() {
  frameId = requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  // Smooth mouse interpolation (slow lerp = trailing "oil" feel)
  const lerpSpeed = 0.04;
  smoothMouseX += (mouseX - smoothMouseX) * lerpSpeed;
  smoothMouseY += (mouseY - smoothMouseY) * lerpSpeed;

  // Mouse velocity
  const mvx = (smoothMouseX - lastMouseX) * 60;
  const mvy = (smoothMouseY - lastMouseY) * 60;
  lastMouseX = smoothMouseX;
  lastMouseY = smoothMouseY;

  // Scroll velocity with exponential decay
  const deltaY    = scrollY - lastScrollY;
  lastScrollY     = scrollY;
  scrollVelocity += deltaY * 0.006;
  scrollVelocity *= 0.88; // Damping

  // Update uniforms
  uniforms.u_time.value               = time;
  uniforms.u_mouse.value.set(smoothMouseX, smoothMouseY);
  uniforms.u_mouseVelocity.value.set(mvx, mvy);
  uniforms.u_scrollVelocity.value     = scrollVelocity;
  uniforms.u_scrollY.value            = scrollY;

  renderer.render(scene, camera);
}

animate();

// ── Resize handler ────────────────
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
}, { passive: true });

// ── Reduce motion: pause if needed ──
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  cancelAnimationFrame(frameId);
  // Render one static frame
  uniforms.u_time.value = 8.5;   // Mid-animation snapshot
  renderer.render(scene, camera);
}
