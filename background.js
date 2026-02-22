(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // THREE.JS PARTICLE CONSTELLATION BACKGROUND
  //
  // Design: N floating point-lights drifting slowly through 3D
  // space. Nearby particles are connected by faint lines — like
  // constellations or a neural network. Very dark, very subtle —
  // the field recedes behind content rather than competing with it.
  //
  // Effects:
  //   • Slow autonomous camera rotation (scene drift)
  //   • Mouse parallax (scene tilts gently toward cursor)
  //   • Scroll-driven Z fly-through (field zooms as you scroll)
  //   • CSS --mouse-x/y vars kept in sync for body ambient gradient
  // ─────────────────────────────────────────────────────────────

  // ── Renderer ──────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.id = 'bg-canvas';
  document.body.appendChild(canvas);

  const W = window.innerWidth;
  const H = window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias:    false,  // not needed for point/line primitives
    alpha:        true,   // transparent — body CSS gradient shows through
    powerPreference: 'high-performance',
  });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0); // fully transparent clear

  // ── Scene / Camera ────────────────────────────────────────────
  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, W / H, 0.1, 600);
  camera.position.set(0, 0, 42);

  // ── Particles ─────────────────────────────────────────────────
  const N = 200;

  // Two interleaved Float32Arrays — swap trick avoids GC pressure
  const posA = new Float32Array(N * 3); // current positions
  const vel  = new Float32Array(N * 3); // velocities

  // Bounds (half-extents)
  const BX = 52, BY = 32, BZ = 24;

  for (let i = 0; i < N; i++) {
    const i3 = i * 3;
    posA[i3]     = (Math.random() - 0.5) * BX * 2;
    posA[i3 + 1] = (Math.random() - 0.5) * BY * 2;
    posA[i3 + 2] = (Math.random() - 0.5) * BZ * 2;
    vel[i3]      = (Math.random() - 0.5) * 0.013;
    vel[i3 + 1]  = (Math.random() - 0.5) * 0.009;
    vel[i3 + 2]  = (Math.random() - 0.5) * 0.007;
  }

  // ── Point cloud ───────────────────────────────────────────────
  const dotGeo = new THREE.BufferGeometry();
  const dotAttr = new THREE.BufferAttribute(posA, 3);
  dotGeo.setAttribute('position', dotAttr);

  const dotMat = new THREE.PointsMaterial({
    color:           0xc8dcff, // ice-blue tint
    size:            0.45,
    sizeAttenuation: true,     // perspective: closer = larger
    transparent:     true,
    opacity:         0.72,
    blending:        THREE.AdditiveBlending,
    depthWrite:      false,
  });

  scene.add(new THREE.Points(dotGeo, dotMat));

  // ── Line connections ──────────────────────────────────────────
  // Pre-allocate max buffer. Worst case N*(N-1)/2 = 19900 segments.
  // In practice ~800-1200 at threshold=15, which is a nice density.
  const MAX_SEGS   = 2400;
  const lineArr    = new Float32Array(MAX_SEGS * 6); // 6 floats per segment
  const lineGeo    = new THREE.BufferGeometry();
  const lineAttr   = new THREE.BufferAttribute(lineArr, 3);
  lineAttr.setUsage(THREE.DynamicDrawUsage);
  lineGeo.setAttribute('position', lineAttr);
  lineGeo.setDrawRange(0, 0);

  const lineMat = new THREE.LineBasicMaterial({
    color:       0x3070cc,
    transparent: true,
    opacity:     0.22,
    blending:    THREE.AdditiveBlending,
    depthWrite:  false,
  });

  scene.add(new THREE.LineSegments(lineGeo, lineMat));

  const THRESH  = 15;
  const THRESH2 = THRESH * THRESH;

  // ── State ─────────────────────────────────────────────────────
  let autoAngle = 0;       // accumulated rotation (radians)
  let mouseTargX = 0;      // mouse-driven tilt targets (−0.5 … 0.5 → radians)
  let mouseTargY = 0;
  let smoothRotX = 0;      // lerped camera parallax
  let smoothRotY = 0;

  let scrollY = 0;         // for z fly-through
  let baseZ   = 42;        // camera z at rest

  // CSS ambient gradient vars (for body radial-gradient)
  let cssTargX = 50, cssTargY = 50;
  let cssCurrX = 50, cssCurrY = 50;
  const root = document.documentElement;

  // ── Event listeners ───────────────────────────────────────────
  window.addEventListener('mousemove', (e) => {
    mouseTargX = (e.clientY / innerHeight - 0.5) * 0.28;   // tilt up/down
    mouseTargY = (e.clientX / innerWidth  - 0.5) * 0.40;   // tilt left/right
    cssTargX   = (e.clientX / innerWidth)  * 100;
    cssTargY   = (e.clientY / innerHeight) * 100;
  }, { passive: true });

  window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
  }, { passive: true });

  window.addEventListener('resize', () => {
    const W = innerWidth, H = innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  }, { passive: true });

  // ── Render loop ───────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);

    // — Move particles & bounce off bounds —
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      posA[i3]     += vel[i3];
      posA[i3 + 1] += vel[i3 + 1];
      posA[i3 + 2] += vel[i3 + 2];
      if (posA[i3]     >  BX || posA[i3]     < -BX) vel[i3]     *= -1;
      if (posA[i3 + 1] >  BY || posA[i3 + 1] < -BY) vel[i3 + 1] *= -1;
      if (posA[i3 + 2] >  BZ || posA[i3 + 2] < -BZ) vel[i3 + 2] *= -1;
    }
    dotAttr.needsUpdate = true;

    // — Rebuild line segments —
    let segs = 0;
    outer: for (let i = 0; i < N; i++) {
      const ax = posA[i * 3], ay = posA[i * 3 + 1], az = posA[i * 3 + 2];
      for (let j = i + 1; j < N; j++) {
        const dx = ax - posA[j * 3];
        const dy = ay - posA[j * 3 + 1];
        const dz = az - posA[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < THRESH2) {
          const b = segs * 6;
          lineArr[b]     = ax;           lineArr[b + 1] = ay;           lineArr[b + 2] = az;
          lineArr[b + 3] = posA[j * 3]; lineArr[b + 4] = posA[j * 3 + 1]; lineArr[b + 5] = posA[j * 3 + 2];
          segs++;
          if (segs >= MAX_SEGS) break outer;
        }
      }
    }
    lineGeo.setDrawRange(0, segs * 2); // 2 vertices per segment
    lineAttr.needsUpdate = true;

    // — Camera: auto-drift + mouse parallax + scroll Z —
    autoAngle += 0.00035; // slow planetary drift

    smoothRotX += (mouseTargX - smoothRotX) * 0.045;
    smoothRotY += (mouseTargY - smoothRotY) * 0.045;

    scene.rotation.x = smoothRotX;
    scene.rotation.y = autoAngle + smoothRotY;

    // Scroll fly-through: move camera forward as user scrolls
    const targetZ = baseZ - scrollY * 0.012;
    camera.position.z += (targetZ - camera.position.z) * 0.06;

    // — CSS ambient gradient tracking —
    cssCurrX += (cssTargX - cssCurrX) * 0.05;
    cssCurrY += (cssTargY - cssCurrY) * 0.05;
    root.style.setProperty('--mouse-x', cssCurrX.toFixed(1) + '%');
    root.style.setProperty('--mouse-y', cssCurrY.toFixed(1) + '%');

    renderer.render(scene, camera);
  }

  // Honour prefers-reduced-motion — freeze after one static frame
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    renderer.render(scene, camera);
    return;
  }

  animate();
}());
