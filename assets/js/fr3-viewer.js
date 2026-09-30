/**
 * Interactive Franka FR3 stage for the homepage hero.
 *
 * Physics and control live in fr3-sim.js (MuJoCo WASM); this module loads the assets,
 * renders the robot with three.js, and turns pointer input into robot commands:
 *   hover  -> the gripper follows the pointer over the table
 *   click  -> grasp a block / place the held block
 *   drag   -> throw a block, pull the robot's hand around, or orbit the camera
 * After a few idle seconds the robot goes back to stacking blocks on its own.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FrankaSim } from './fr3-sim.js';

const MUJOCO_VERSION = '3.14.0';
const MUJOCO_CDN = `https://cdn.jsdelivr.net/npm/@mujoco/mujoco@${MUJOCO_VERSION}/`;
const WASM_BYTES = 10313475; // uncompressed mujoco.wasm, only used for the progress bar
// SHA-384 of the official @mujoco/mujoco 3.14.0 mujoco.wasm. The binary is checked before it
// is compiled, so a tampered download is rejected (mujoco.js itself is pinned in the import map).
const WASM_SHA384 = 'yUuo1e5vsKVdwGK/50EAcmLctW+k7cc1irF9hGZ4/wkx0INyHkL7ipP3vqg09Pg1';
const GLB_BYTES = 930364;
const MESHES = ['link0', 'link1', 'link2', 'link3', 'link4', 'link5', 'link6', 'link7', 'hand', 'finger'].map((n) => `meshes/${n}.stl`);
const ASSET_BASE = new URL('../fr3/', import.meta.url);
const IDLE_MS = 6000; // hand control back to the autopilot after this long
const HOME_VIEW = { az: 0.62, el: 0.3 };
const BLOCK_COLORS = [0xff5a1f, 0xe8b53a, 0x3f6fd8, 0x26282c];
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Visitors can only drive the robot on a large screen with a mouse or trackpad. Phones and
// tablets get a hands-off autopilot demo so scrolling past it never grabs a block by accident.
const INTERACTIVE = matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)');

// MuJoCo is Z-up; three.js is Y-up. All MuJoCo-space objects live under a group rotated
// -90 deg about X, so (x, y, z)_mj -> (x, z, -y)_three.
const toThree = (p, out = new THREE.Vector3()) => out.set(p[0], p[2], -p[1]);
const toMj = (v) => [v.x, -v.z, v.y];

async function verifySha384(bytes, expected) {
  if (!crypto.subtle) throw new Error('crypto.subtle unavailable (needs HTTPS)');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-384', bytes));
  let bin = '';
  for (const b of digest) bin += String.fromCharCode(b);
  if (btoa(bin) !== expected) throw new Error('mujoco.wasm failed its integrity check');
}

async function fetchBytes(url, onChunk) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!onChunk || !res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    onChunk(value.length);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

function robotMaterials() {
  const physical = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.28, ...extra });
  const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...extra });
  return {
    white: physical(0xf3f3f1),
    off_white: physical(0xe4e8ea),
    black: standard(0x1d1e21, { roughness: 0.46, metalness: 0.2 }),
    gray: standard(0x9a9da2, { roughness: 0.3, metalness: 0.7 }),
    red: standard(0xd8341c, { roughness: 0.35 }),
    button_green: standard(0x2f9e44, { emissive: 0x2f9e44, emissiveIntensity: 0.35 }),
    button_red: standard(0xc92a2a, { emissive: 0xc92a2a, emissiveIntensity: 0.35 }),
    button_blue: standard(0x1c7ed6, { emissive: 0x1c7ed6, emissiveIntensity: 0.35 }),
  };
}

const GRID_VERT = /* glsl */ `
  varying vec2 vXY;
  void main() {
    vXY = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Engineering-paper floor: 5 cm minor / 25 cm major lines, the robot's 855 mm reach
// circle, all fading out radially so the stage melts into the page.
const GRID_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  uniform float uAlpha;
  varying vec2 vXY;
  float line(vec2 p, float spacing, float width) {
    vec2 q = p / spacing;
    vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
    return 1.0 - min(min(g.x, g.y) / width, 1.0);
  }
  float ring(float d, float r, float width) {
    return 1.0 - min(abs(d - r) / (fwidth(d) * width), 1.0);
  }
  void main() {
    float fade = 1.0 - smoothstep(0.35, 1.35, length(vXY - vec2(0.3, 0.0)));
    float minor = line(vXY, 0.05, 0.9) * 0.28;
    float major = line(vXY, 0.25, 1.1) * 0.7;
    float d = length(vXY);
    float reach = ring(d, 0.855, 1.2);
    float dash = step(0.55, fract(atan(vXY.y, vXY.x) * 72.0 / 6.2831853));
    float a = max(minor, major) * uAlpha * fade;
    vec3 col = uColor;
    float ra = reach * dash * fade * fade * 0.4;
    col = mix(col, uAccent, ra / max(a + ra, 1e-4));
    gl_FragColor = vec4(col, clamp(a + ra, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export class RobotStage {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.hero = root.closest('[data-robot-hero]') || root;
    this.hud = {
      status: root.querySelector('[data-hud="status"]'),
      mode: root.querySelector('[data-hud="mode"]'),
      rate: root.querySelector('[data-hud="rate"]'),
      grip: root.querySelector('[data-hud="grip"]'),
      joints: root.querySelector('[data-hud="joints"]'),
      progress: root.querySelector('[data-hud="progress"]'),
    };
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.press = null;
    this.lastUser = -Infinity;
    this.running = false;
    this.visible = true;
    this.cam = { ...HOME_VIEW, dist: 3.1, target: [0.27, 0.0, 0.35], vaz: 0, vel: 0 };
    this.setInteractive(INTERACTIVE.matches);
    INTERACTIVE.addEventListener('change', (e) => this.setInteractive(e.matches));
    this.intro = 0;
  }

  setInteractive(on) {
    this.interactive = on;
    this.root.dataset.interactive = String(on);
    if (!on && this.sim) {
      this.cancelPress();
      this.sim.clearHover();
      if (!REDUCED_MOTION) this.sim.setAuto(true);
    }
  }

  setState(state) {
    this.root.dataset.state = state;
  }

  setProgress(f) {
    this.root.style.setProperty('--progress', f.toFixed(3));
    if (this.hud.progress) this.hud.progress.textContent = `${Math.round(f * 100)}%`;
  }

  async load() {
    this.setState('loading');
    let got = 0;
    const onChunk = (n) => { got += n; this.setProgress(Math.min(0.97, got / (WASM_BYTES + GLB_BYTES))); };
    const [mjModule, wasm, glb, xml, meshes] = await Promise.all([
      import(`${MUJOCO_CDN}mujoco.js`),
      fetchBytes(`${MUJOCO_CDN}mujoco.wasm`, onChunk),
      fetchBytes(new URL('fr3.glb', ASSET_BASE), onChunk),
      fetch(new URL('scene.xml', ASSET_BASE)).then((r) => r.text()),
      Promise.all(MESHES.map((m) => fetchBytes(new URL(m, ASSET_BASE)))),
    ]);
    await verifySha384(wasm, WASM_SHA384);
    const mj = await mjModule.default({ wasmBinary: wasm });
    this.sim = new FrankaSim(mj, xml, new Map(MESHES.map((m, i) => [m, meshes[i]])));
    this.sim.onTeleport = (i) => { this.blockMeshes[i].userData.pop = 0; };
    if (REDUCED_MOTION) this.sim.setAuto(false);
    else if (!this.interactive) this.sim.setAuto(true);
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(glb.buffer, '');
    this.buildScene(gltf.scene);
    this.bindInput();
    this.bindLifecycle();
    this.setProgress(1);
    this.setState('ready');
  }

  /* ------------------------------------------------------------------ scene */

  buildScene(glbScene) {
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.75 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.85;
    pmrem.dispose();
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(25, 1, 0.05, 30);

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(1.1, 2.2, 1.3);
    key.target.position.set(0.35, 0, -0.05);
    key.castShadow = true;
    key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -0.9, right: 0.9, top: 0.9, bottom: -0.9, near: 0.5, far: 5 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.015;
    key.shadow.radius = 5;
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9);
    rim.position.set(-1.6, 1.4, -1.4);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x303236, 0.35));

    const world = new THREE.Group();
    world.rotation.x = -Math.PI / 2;
    scene.add(world);
    this.world = world;

    // Floor: a shadow catcher plus the grid overlay.
    this.shadowMat = new THREE.ShadowMaterial({ opacity: 0.3, depthWrite: false });
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), this.shadowMat);
    shadowPlane.receiveShadow = true;
    world.add(shadowPlane);
    this.gridMat = new THREE.ShaderMaterial({
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uAccent: { value: new THREE.Color(1, 0.35, 0.12) }, uAlpha: { value: 0.12 } },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), this.gridMat);
    grid.position.z = 0.0005;
    grid.renderOrder = -1;
    world.add(grid);

    // Robot bodies from the GLB (node names are "<body>__<material>").
    const mats = robotMaterials();
    const sim = this.sim;
    this.bodyGroups = new Map();
    const groupFor = (b) => {
      if (!this.bodyGroups.has(b)) {
        const g = new THREE.Group();
        g.userData.body = b;
        world.add(g);
        this.bodyGroups.set(b, g);
      }
      return this.bodyGroups.get(b);
    };
    glbScene.updateMatrixWorld(true);
    const meshes = [];
    glbScene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const mesh of meshes) {
      const [bodyName, matName] = mesh.name.split('__');
      const b = sim.bodyNames.indexOf(bodyName);
      if (b < 0) continue;
      mesh.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.material = mats[matName] || mats.white;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      groupFor(b).add(mesh);
    }

    // Invisible collision proxies (MuJoCo's own convex meshes) for cheap robot picking.
    const m = sim.model;
    const gType = m.geom_type, gBody = m.geom_bodyid, gData = m.geom_dataid, gPos = m.geom_pos, gQuat = m.geom_quat;
    const vAdr = m.mesh_vertadr, vNum = m.mesh_vertnum, fAdr = m.mesh_faceadr, fNum = m.mesh_facenum;
    const MESH = sim.mj.mjtGeom.mjGEOM_MESH.value;
    this.proxies = [];
    for (let g = 0; g < m.ngeom; g++) {
      const b = gBody[g];
      if (gType[g] !== MESH || !sim.robotBodies.has(b)) continue;
      const id = gData[g];
      const verts = m.mesh_vert.slice(3 * vAdr[id], 3 * (vAdr[id] + vNum[id]));
      const faces = m.mesh_face.slice(3 * fAdr[id], 3 * (fAdr[id] + fNum[id]));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(Array.from(faces));
      geo.computeBoundingSphere();
      const proxy = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      proxy.visible = false;
      proxy.position.set(gPos[3 * g], gPos[3 * g + 1], gPos[3 * g + 2]);
      proxy.quaternion.set(gQuat[4 * g + 1], gQuat[4 * g + 2], gQuat[4 * g + 3], gQuat[4 * g]);
      proxy.userData.body = b;
      groupFor(b).add(proxy);
      this.proxies.push(proxy);
    }

    // Blocks.
    const blockGeo = new RoundedBoxGeometry(0.05, 0.05, 0.05, 4, 0.0045);
    this.blockMeshes = sim.blocks.map((blk, i) => {
      const mat = new THREE.MeshPhysicalMaterial({ color: BLOCK_COLORS[i % BLOCK_COLORS.length], roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 });
      const mesh = new THREE.Mesh(blockGeo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { block: i, body: blk.body, pop: 1, hover: 0 };
      groupFor(blk.body).add(mesh);
      return mesh;
    });

    this.buildMarkers();
    this.applyTheme();
    this.resize();
  }

  buildMarkers() {
    const accent = new THREE.Color(1, 0.35, 0.12);
    const w = this.world;
    const flat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 64), flat(accent, 0.9));
    this.ringDot = new THREE.Mesh(new THREE.CircleGeometry(0.006, 24), flat(accent, 0.9));
    this.ring.renderOrder = this.ringDot.renderOrder = 2;
    w.add(this.ring, this.ringDot);

    const stemGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.stem = new THREE.Line(stemGeo, new THREE.LineDashedMaterial({ color: accent, dashSize: 0.012, gapSize: 0.01, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }));
    this.stem.frustumCulled = false;
    w.add(this.stem);

    // Setpoint frame (RViz colours): where the controller is steering the TCP.
    this.triad = new THREE.Group();
    const axis = (color, rot) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.05, 8), flat(color, 0.95));
      mesh.geometry.translate(0, 0.025, 0);
      mesh.rotation.set(...rot);
      mesh.renderOrder = 3;
      this.triad.add(mesh);
    };
    axis(0xff4040, [0, 0, -Math.PI / 2]);
    axis(0x33d17a, [0, 0, 0]);
    axis(0x3b82f6, [Math.PI / 2, 0, 0]);
    w.add(this.triad);

    const springGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.spring = new THREE.Line(springGeo, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }));
    this.spring.renderOrder = 4;
    this.spring.visible = false;
    this.spring.frustumCulled = false;
    w.add(this.spring);
    this.markerAlpha = 0;
  }

  applyTheme() {
    const cs = getComputedStyle(document.documentElement);
    const get = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
    const gridRGB = get('--stage-grid', '255 255 255').split(/[\s,]+/).map(Number);
    this.gridMat.uniforms.uColor.value.setRGB(gridRGB[0] / 255, gridRGB[1] / 255, gridRGB[2] / 255, THREE.SRGBColorSpace);
    this.gridMat.uniforms.uAlpha.value = parseFloat(get('--stage-grid-alpha', '0.12'));
    this.shadowMat.opacity = parseFloat(get('--stage-shadow', '0.3'));
    const accent = new THREE.Color(get('--accent', '#ff5a1f'));
    this.gridMat.uniforms.uAccent.value.copy(accent);
    for (const mesh of [this.ring, this.ringDot, this.stem, this.spring]) mesh.material.color.copy(accent);
    this.blockMeshes[0].material.color.copy(accent);
  }

  resize() {
    const r = this.root.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Shift the principal point so the robot sits clear of the hero copy and HUD (set from CSS).
    const css = getComputedStyle(this.root);
    const shift = parseFloat(css.getPropertyValue('--stage-shift')) || 0;
    const lift = parseFloat(css.getPropertyValue('--stage-lift')) || 0;
    this.camera.setViewOffset(w, h, -shift * w, lift * h, w, h);
    // Pull back on narrow/portrait stages so the whole workspace stays in frame; CSS can
    // zoom in on small stages that don't need room for the HUD.
    const aspect = w / h;
    const zoom = parseFloat(css.getPropertyValue('--stage-zoom')) || 1;
    this.cam.fit = zoom * (aspect < 1.1 ? 1 + (1.1 - aspect) * 0.9 : 1);
    this.camera.updateProjectionMatrix();
    this.size = { w, h };
  }

  /* ------------------------------------------------------------------ input */

  bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', () => this.cancelPress());
    c.addEventListener('lostpointercapture', () => this.cancelPress());
    this.hero.addEventListener('pointermove', (e) => this.onMove(e));
    this.hero.addEventListener('pointerleave', () => { if (this.interactive) { this.sim.clearHover(); this.hoverHit(null); } });
    c.addEventListener('dblclick', () => { if (this.interactive) this.resetView(); });
    this.root.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.action === 'reset') {
          this.sim.reset();
          this.resetView();
          if (REDUCED_MOTION) this.sim.setAuto(false);
        }
      });
    });
    c.addEventListener('keydown', (e) => {
      if (this.interactive && (e.key === 'r' || e.key === 'R')) { this.sim.reset(); this.resetView(); }
    });
  }

  setRay(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return r;
  }

  /** Ray hit on the table plane (MuJoCo z = h), or null if looking up. */
  tablePoint(h = 0) {
    const { origin, direction } = this.raycaster.ray;
    if (direction.y > -1e-4) return null;
    const t = (h - origin.y) / direction.y;
    return toMj(origin.clone().addScaledVector(direction, t));
  }

  pick(withRobot) {
    const hits = this.raycaster.intersectObjects(withRobot ? [...this.blockMeshes, ...this.proxies] : this.blockMeshes, false);
    if (!hits.length) return null;
    const h = hits[0];
    const block = h.object.userData.block;
    return { kind: block !== undefined ? 'block' : 'robot', block: block ?? -1, body: h.object.userData.body, point: toMj(h.point), threePoint: h.point.clone() };
  }

  onDown(e) {
    if (!this.interactive || e.button !== 0) return;
    this.userActive();
    this.setRay(e);
    const hit = this.pick(true);
    this.press = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, hit, moved: false, id: e.pointerId, type: e.pointerType };
    this.canvas.setPointerCapture(e.pointerId);
    this.cam.vaz = this.cam.vel = 0;
  }

  onMove(e) {
    if (!this.interactive) return;
    this.userActive();
    const p = this.press;
    if (p && e.pointerId === p.id) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!p.moved && Math.hypot(dx, dy) > 6) this.beginDrag(p);
      if (p.moved) this.updateDrag(e, p);
      p.lx = e.clientX;
      p.ly = e.clientY;
      return;
    }
    if (e.pointerType === 'touch') return;
    this.setRay(e);
    const hit = this.pick(false);
    const robot = !hit && e.target === this.canvas ? this.pick(true) : null;
    this.hoverHit(hit || robot);
    const pt = hit ? hit.point : this.tablePoint(0);
    if (pt) this.sim.setHover(pt[0], pt[1], hit ? hit.block : -1);
  }

  hoverHit(hit) {
    for (const mesh of this.blockMeshes) mesh.userData.hover = hit && hit.block === mesh.userData.block ? 1 : 0;
    this.canvas.style.cursor = hit ? 'grab' : 'crosshair';
  }

  beginDrag(p) {
    p.moved = true;
    const hit = p.hit;
    if (hit && (hit.kind === 'block' || hit.kind === 'robot')) {
      const normal = new THREE.Vector3();
      this.camera.getWorldDirection(normal);
      p.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.threePoint);
      if (hit.kind === 'block') this.sim.startDrag(hit.body, hit.point);
      else this.sim.grabRobot(hit.point);
      this.canvas.style.cursor = 'grabbing';
      p.mode = hit.kind;
    } else {
      p.mode = 'orbit';
      this.canvas.style.cursor = 'grabbing';
    }
  }

  updateDrag(e, p) {
    if (p.mode === 'orbit') {
      const dx = e.clientX - p.lx, dy = e.clientY - p.ly;
      const now = performance.now(), dt = Math.max(1 / 240, (now - (p.lt || now - 16)) / 1000);
      p.lt = now;
      this.cam.az -= dx * 0.0055;
      this.cam.el += dy * 0.004;
      this.cam.vaz = THREE.MathUtils.clamp((-dx * 0.0055) / dt, -3, 3);
      this.cam.vel = THREE.MathUtils.clamp((dy * 0.004) / dt, -2, 2);
      return;
    }
    this.setRay(e);
    const v = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(p.plane, v)) return;
    const t = toMj(v);
    t[0] = THREE.MathUtils.clamp(t[0], -0.6, 1.1);
    t[1] = THREE.MathUtils.clamp(t[1], -0.95, 0.95);
    t[2] = THREE.MathUtils.clamp(t[2], 0.0, 0.8);
    if (p.mode === 'block') this.sim.moveDrag(t);
    else this.sim.moveRobotGrab(t);
  }

  onUp(e) {
    const p = this.press;
    if (!p || e.pointerId !== p.id) return;
    this.press = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (!p.moved) {
      this.setRay(e);
      if (p.hit && p.hit.kind === 'block') this.sim.clickBlock(p.hit.block);
      else if (!p.hit) {
        const pt = this.tablePoint(0);
        if (pt) {
          this.sim.clickTable(pt[0], pt[1]);
        }
      }
    } else if (p.mode === 'block') this.sim.endDrag();
    else if (p.mode === 'robot') this.sim.releaseRobot();
    this.canvas.style.cursor = 'crosshair';
  }

  cancelPress() {
    const p = this.press;
    if (!p) return;
    this.press = null;
    if (p.mode === 'block') this.sim.endDrag();
    else if (p.mode === 'robot') this.sim.releaseRobot();
  }

  userActive() {
    this.lastUser = performance.now();
  }


  resetView() {
    Object.assign(this.cam, { ...HOME_VIEW, vaz: 0, vel: 0 });
  }

  /* -------------------------------------------------------------- lifecycle */

  bindLifecycle() {
    new ResizeObserver(() => this.resize()).observe(this.root);
    new IntersectionObserver(([entry]) => { this.visible = entry.isIntersecting; this.kick(); }, { threshold: 0.01 }).observe(this.root);
    document.addEventListener('visibilitychange', () => this.kick());
    new MutationObserver(() => this.applyTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
  }

  start() {
    this.last = performance.now();
    this.rate = { sim: 0, wall: 0, value: 1 };
    this.hudTimer = 0;
    this.frameTimes = [];
    this.kick();
  }

  kick() {
    const should = this.visible && !document.hidden;
    if (should && !this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    } else if (!should) {
      this.running = false;
    }
  }

  frame(now) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    const sim = this.sim;
    if (!REDUCED_MOTION && sim.mode === 'manual' && !sim.task && !this.press && now - this.lastUser > IDLE_MS) sim.setAuto(true);
    const t0 = sim.simTime;
    sim.tick(dt);
    this.rate.sim += sim.simTime - t0;
    this.rate.wall += dt;
    if (this.rate.wall > 1) { this.rate.value = this.rate.sim / this.rate.wall; this.rate.sim = this.rate.wall = 0; }

    this.syncBodies(dt);
    this.updateMarkers(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.adapt(dt);

    this.hudTimer += dt;
    if (this.hudTimer > 0.1) { this.hudTimer = 0; this.updateHud(); }
  }

  syncBodies(dt) {
    const d = this.sim.data;
    const xpos = d.xpos, xquat = d.xquat;
    for (const [b, g] of this.bodyGroups) {
      g.position.set(xpos[3 * b], xpos[3 * b + 1], xpos[3 * b + 2]);
      g.quaternion.set(xquat[4 * b + 1], xquat[4 * b + 2], xquat[4 * b + 3], xquat[4 * b]);
    }
    for (const mesh of this.blockMeshes) {
      const u = mesh.userData;
      if (u.pop < 1) {
        u.pop = Math.min(1, u.pop + dt / 0.45);
        const t = u.pop - 1;
        mesh.scale.setScalar(Math.max(0.001, 1 + 2.7 * t * t * t + 1.7 * t * t));
      }
      const target = u.hover ? 0.22 : 0;
      mesh.material.emissiveIntensity += (target - mesh.material.emissiveIntensity) * Math.min(1, dt * 12);
      mesh.material.emissive.copy(mesh.material.color);
    }
  }

  updateMarkers(dt) {
    const sim = this.sim;
    const active = sim.mode === 'manual' || sim.task !== null;
    this.markerAlpha += ((active ? 1 : 0) - this.markerAlpha) * Math.min(1, dt * 6);
    const a = this.markerAlpha;
    const g = sim.goalPos, c = sim.cmdPos;
    this.ring.position.set(g[0], g[1], 0.0012);
    this.ringDot.position.copy(this.ring.position);
    const stem = this.stem.geometry.attributes.position;
    stem.setXYZ(0, c[0], c[1], 0.0012);
    stem.setXYZ(1, c[0], c[1], c[2]);
    stem.needsUpdate = true;
    this.stem.computeLineDistances();
    this.triad.position.set(c[0], c[1], c[2]);
    // Setpoint frame: x = (cos, sin, 0), y = (sin, -cos, 0), z = down.
    this.triad.rotation.set(Math.PI, 0, -sim.cmdYaw);
    this.ring.material.opacity = 0.85 * a;
    this.ringDot.material.opacity = 0.85 * a;
    this.stem.material.opacity = 0.55 * a;
    this.triad.children.forEach((m) => { m.material.opacity = 0.9 * a; });
    this.ring.visible = this.ringDot.visible = this.stem.visible = this.triad.visible = a > 0.01;

    const dp = sim.dragPoint();
    this.spring.visible = !!dp;
    if (dp) {
      const pos = this.spring.geometry.attributes.position;
      pos.setXYZ(0, dp[0], dp[1], dp[2]);
      const t = sim.drag.target;
      pos.setXYZ(1, t[0], t[1], t[2]);
      pos.needsUpdate = true;
    }
  }

  updateCamera(dt) {
    const cam = this.cam;
    if (!this.press) {
      cam.az += cam.vaz * dt;
      cam.el += cam.vel * dt;
      const k = Math.exp(-dt / 0.12);
      cam.vaz *= k;
      cam.vel *= k;
      // Drift back to the hero framing once the visitor has left the robot alone.
      if (performance.now() - this.lastUser > IDLE_MS) {
        const r = 1 - Math.exp(-dt / 1.6);
        cam.az += (HOME_VIEW.az - cam.az) * r;
        cam.el += (HOME_VIEW.el - cam.el) * r;
      }
    }
    cam.az = THREE.MathUtils.clamp(cam.az, -1.0, 1.9);
    cam.el = THREE.MathUtils.clamp(cam.el, 0.1, 1.05);
    this.intro = Math.min(1, this.intro + dt / 1.6);
    const ease = 1 - Math.pow(1 - this.intro, 3);
    const dist = cam.dist * (cam.fit || 1) * (1.18 - 0.18 * ease);
    const az = cam.az + (1 - ease) * 0.35;
    const t = cam.target;
    const p = [t[0] + dist * Math.cos(cam.el) * Math.cos(az), t[1] + dist * Math.cos(cam.el) * Math.sin(az), t[2] + dist * Math.sin(cam.el)];
    toThree(p, this.camera.position);
    this.camera.lookAt(toThree(t));
  }

  /** Drop the pixel ratio if the device can't keep up. */
  adapt(dt) {
    const f = this.frameTimes;
    f.push(dt);
    if (f.length < 90) return;
    const avg = f.reduce((s, v) => s + v, 0) / f.length;
    f.length = 0;
    const pr = this.renderer.getPixelRatio();
    if (avg > 1 / 40 && pr > 1) {
      this.renderer.setPixelRatio(Math.max(1, pr - 0.5));
      this.resize();
    }
  }

  updateHud() {
    const sim = this.sim, hud = this.hud;
    if (hud.mode) hud.mode.textContent = sim.mode === 'auto' ? 'Autopilot' : 'Manual';
    if (hud.status) hud.status.textContent = sim.status;
    if (hud.rate) hud.rate.textContent = `${Math.round(1 / sim.timestep)} Hz · ${this.rate.value.toFixed(2)}× RT`;
    if (hud.grip) hud.grip.textContent = `${(sim.gripperWidth() * 1000).toFixed(0).padStart(2, '0')} mm`;
    if (hud.joints) {
      if (!hud.joints.children.length) {
        hud.joints.innerHTML = Array.from({ length: 7 }, (_, i) => `<li><span>J${i + 1}</span><b><i></i></b><em></em></li>`).join('');
      }
      const q = sim.armQ();
      [...hud.joints.children].forEach((li, i) => {
        const lo = sim.qlo[i], hi = sim.qhi[i];
        li.children[1].firstChild.style.setProperty('--v', ((q[i] - lo) / (hi - lo)).toFixed(3));
        const deg = Math.round((q[i] * 180) / Math.PI);
        li.children[2].textContent = `${deg < 0 ? '−' : '+'}${String(Math.abs(deg)).padStart(3, '0')}°`;
      });
    }
    this.root.dataset.mode = sim.mode;
  }
}

export async function mountRobotStage(root) {
  const stage = new RobotStage(root);
  window.fr3 = stage; // handy for poking at the sim from the console
  try {
    await stage.load();
    stage.start();
  } catch (err) {
    console.error('[fr3] failed to start the simulation', err);
    stage.setState('error');
  }
  return stage;
}
