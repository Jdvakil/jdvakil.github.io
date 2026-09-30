/**
 * Franka FR3 tabletop simulation: MuJoCo physics, a damped-least-squares IK
 * controller, and a small pick-and-place behaviour layer.
 *
 * Pure logic (no DOM, no three.js) so the same file runs headless in Node for tests.
 * Everything is expressed in the MuJoCo world frame: metres, Z up, robot base at the origin.
 *
 * Note on the WASM bindings: typed-array views such as `data.qpos` point into the WASM
 * heap and are detached if the heap grows, so views are re-read every tick, never cached.
 */

const ARM = 7;
const HALF = 0.025;            // block half-extent
const HOVER_Z = 0.17;          // TCP height while following the pointer
const OPEN = 255;              // gripper ctrl (Menagerie Franka Hand: 0 closed .. 255 open)
const CLOSED = 0;
const REST_Q = [0, -0.35, 0, -2.3, 0, 1.95, 0.7854];
const POSTURE_GAIN = [0.5, 0.15, 0.8, 0.15, 0.8, 0.1, 0];

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hypot2 = (x, y) => Math.sqrt(x * x + y * y);

function quatToMat(q, out) {
  const [w, x, y, z] = q;
  out[0] = 1 - 2 * (y * y + z * z); out[1] = 2 * (x * y - w * z); out[2] = 2 * (x * z + w * y);
  out[3] = 2 * (x * y + w * z); out[4] = 1 - 2 * (x * x + z * z); out[5] = 2 * (y * z - w * x);
  out[6] = 2 * (x * z - w * y); out[7] = 2 * (y * z + w * x); out[8] = 1 - 2 * (x * x + y * y);
  return out;
}

/** Cholesky factor L of the SPD matrix A (n x n, row-major). */
function cholFactor(A, n, L) {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      L[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j * n + j];
    }
  }
  return L;
}

/** Solves L L^T x = b given the Cholesky factor from cholFactor. */
function cholSubst(L, b, n, x) {
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * x[k];
    x[i] = s / L[i * n + i];
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

/** Tiny deterministic PRNG so the autopilot is reproducible in tests. */
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class FrankaSim {
  /**
   * @param mj     loaded MuJoCo WASM module
   * @param xml    scene MJCF text
   * @param files  map of relative path -> Uint8Array for every mesh the MJCF references
   */
  constructor(mj, xml, files, { seed = 7 } = {}) {
    this.mj = mj;
    const vfs = new mj.MjVFS();
    for (const [path, bytes] of files) vfs.addBuffer(path, bytes);
    this.model = mj.MjModel.from_xml_string(xml, vfs);
    vfs.delete();
    this.data = new mj.MjData(this.model);
    this.scratch = new mj.MjData(this.model);
    const m = this.model;
    this.jacp = new mj.DoubleBuffer(3 * m.nv);
    this.jacr = new mj.DoubleBuffer(3 * m.nv);
    this.rand = mulberry32(seed);

    const OBJ = mj.mjtObj;
    const id = (type, name) => mj.mj_name2id(m, type.value, name);
    this.timestep = m.opt.timestep;
    this.bodyNames = Array.from({ length: m.nbody }, (_, i) => mj.mj_id2name(m, OBJ.mjOBJ_BODY.value, i) || '');
    this.tcpSite = id(OBJ.mjOBJ_SITE, 'tcp');
    this.robotBodies = new Set(this.bodyNames.map((n, i) => (/^(fr3_|hand|left_finger|right_finger)/.test(n) ? i : -1)).filter((i) => i >= 0));

    const range = m.jnt_range;
    this.qlo = Array.from({ length: ARM }, (_, i) => range[2 * i] + 0.03);
    this.qhi = Array.from({ length: ARM }, (_, i) => range[2 * i + 1] - 0.03);

    const jntQ = m.jnt_qposadr, jntD = m.jnt_dofadr, bodyJnt = m.body_jntadr, mass = m.body_mass;
    this.fingerQ = [jntQ[id(OBJ.mjOBJ_JOINT, 'finger_joint1')], jntQ[id(OBJ.mjOBJ_JOINT, 'finger_joint2')]];
    this.blocks = [];
    for (let i = 0; ; i++) {
      const b = id(OBJ.mjOBJ_BODY, `block_${i}`);
      if (b < 0) break;
      this.blocks.push({ body: b, q: jntQ[bodyJnt[b]], dof: jntD[bodyJnt[b]], mass: mass[b] });
    }

    // Scratch buffers reused every tick (no allocations in the loop).
    this._J = new Float64Array(6 * ARM);
    this._A = new Float64Array(36);
    this._L = new Float64Array(36);
    this._e = new Float64Array(6);
    this._x = new Float64Array(6);
    this._y = new Float64Array(6);
    this._w = new Float64Array(6);
    this._z = new Float64Array(ARM);
    this._dq = new Float64Array(ARM);
    this._rest = Float64Array.from(REST_Q);
    this._R = new Float64Array(9);
    this._Rg = new Float64Array(9);

    this.onTeleport = null;    // viewer hook: (blockIndex) => void
    this.reset();
  }

  /* ------------------------------------------------------------------ state */

  reset() {
    const { mj, model, data } = this;
    mj.mj_resetDataKeyframe(model, data, 0);
    mj.mj_forward(model, data);
    this.simTime = 0;
    this.acc = 0;
    this.frameDt = 0;
    this.qDes = Float64Array.from(REST_Q);
    this.qPrev = Float64Array.from(REST_Q);
    this.grip = OPEN;
    const tcp = this.tcpPos();
    this.cmdPos = tcp.slice();
    this.cmdVel = [0, 0, 0];
    this.cmdYaw = 0;
    this.cmdYawVel = 0;
    this.goalPos = tcp.slice();
    this.goalYaw = 0;
    this.vmax = 0.5;
    this.amax = 2.5;
    this.held = -1;
    this.task = null;
    this.taskName = '';
    this.mode = 'auto';
    this.hover = null;
    this.hoverBlock = -1;
    this.robotGrab = null;
    this.drag = null;
    this.formationIndex = 0;
    this.formation = '';
    this.keepOut = [];
    this.status = 'Ready';
    this.lastEvent = null;
  }

  tcpPos() {
    const p = this.data.site_xpos, s = this.tcpSite * 3;
    return [p[s], p[s + 1], p[s + 2]];
  }

  armQ() {
    return Array.from(this.data.qpos.subarray(0, ARM));
  }

  gripperWidth() {
    const q = this.data.qpos;
    return q[this.fingerQ[0]] + q[this.fingerQ[1]];
  }

  block(i) {
    const q = this.data.qpos, a = this.blocks[i].q;
    return { pos: [q[a], q[a + 1], q[a + 2]], quat: [q[a + 3], q[a + 4], q[a + 5], q[a + 6]] };
  }

  blockSpeed(i) {
    const v = this.data.qvel, a = this.blocks[i].dof;
    return Math.hypot(v[a], v[a + 1], v[a + 2]) + 0.05 * Math.hypot(v[a + 3], v[a + 4], v[a + 5]);
  }

  /* ------------------------------------------------------------- user input */

  /** Pointer is over the table at (x, y); `block` is the block under it or -1. */
  setHover(x, y, block = -1) {
    this.takeControl();
    this.hover = this.clampXY(x, y);
    this.hoverBlock = block;
  }

  clearHover() {
    this.hover = null;
    this.hoverBlock = -1;
  }

  clickBlock(i) {
    this.takeControl();
    if (this.task) return;
    if (this.held === i) return;
    if (this.held >= 0) this.runTask('Stacking', this.placeTask(this.stackTarget(i)));
    else this.runTask('Grasping', this.graspTask(i));
  }

  clickTable(x, y) {
    this.takeControl();
    if (this.task || this.held < 0) return;
    const [cx, cy] = this.clampXY(x, y);
    this.runTask('Placing', this.placeTask({ pos: [cx, cy, HALF], yaw: this.naturalYaw(cx, cy) }));
  }

  /** Grab the robot at a world point; the TCP then follows moveRobotGrab targets. */
  grabRobot(point) {
    this.takeControl();
    this.task = null;
    const tcp = this.cmdPos;
    this.robotGrab = { offset: [tcp[0] - point[0], tcp[1] - point[1], tcp[2] - point[2]], target: tcp.slice() };
  }

  moveRobotGrab(point) {
    if (!this.robotGrab) return;
    const o = this.robotGrab.offset;
    this.robotGrab.target = this.clampWorkspace([point[0] + o[0], point[1] + o[1], point[2] + o[2]]);
  }

  releaseRobot() {
    if (!this.robotGrab) return;
    const t = this.robotGrab.target;
    this.hover = [t[0], t[1]];
    this.robotGrab = null;
  }

  /** Spring-drag a free body (a block) by a point expressed in its local frame. */
  startDrag(body, worldPoint) {
    this.takeControl();
    const d = this.data, R = d.xmat, p = d.xpos, b = body;
    const r = [worldPoint[0] - p[3 * b], worldPoint[1] - p[3 * b + 1], worldPoint[2] - p[3 * b + 2]];
    const local = [0, 1, 2].map((k) => R[9 * b + k] * r[0] + R[9 * b + 3 + k] * r[1] + R[9 * b + 6 + k] * r[2]);
    this.drag = { body, local, target: worldPoint.slice() };
    const i = this.blocks.findIndex((bl) => bl.body === body);
    if (i >= 0 && i === this.held) this.releaseHeld();
  }

  moveDrag(worldPoint) {
    if (this.drag) this.drag.target = [worldPoint[0], worldPoint[1], Math.max(worldPoint[2], HALF * 0.6)];
  }

  endDrag() {
    if (!this.drag) return;
    const d = this.data, b = this.drag.body;
    for (let k = 0; k < 6; k++) d.xfrc_applied[6 * b + k] = 0;
    this.drag = null;
  }

  dragPoint() {
    if (!this.drag) return null;
    const d = this.data, b = this.drag.body, R = d.xmat, p = d.xpos, l = this.drag.local;
    return [0, 1, 2].map((k) => p[3 * b + k] + R[9 * b + 3 * k] * l[0] + R[9 * b + 3 * k + 1] * l[1] + R[9 * b + 3 * k + 2] * l[2]);
  }

  takeControl() {
    if (this.mode === 'auto') {
      this.mode = 'manual';
      this.task = null;
      this.status = this.held >= 0 ? 'Carrying block' : 'Tracking cursor';
    }
  }

  setAuto(on) {
    if (on && this.mode !== 'auto') {
      this.mode = 'auto';
      this.hover = null;
      this.robotGrab = null;
      if (!this.task) this.runTask('Autopilot', this.autopilot());
    } else if (!on && this.mode === 'auto') {
      this.takeControl();
    }
  }

  runTask(name, gen) {
    this.task = gen;
    this.taskName = name;
    this.status = name;
  }

  /* ------------------------------------------------------------------- tick */

  /** Advance the simulation by `dt` seconds of wall time (clamped to stay real-time-ish). */
  tick(dt) {
    const ts = this.timestep;
    this.acc += Math.min(dt, 1 / 20);
    let n = Math.floor(this.acc / ts);
    this.acc -= n * ts;
    if (n > 24) n = 24;
    if (n === 0) return 0;
    this.frameDt = n * ts;

    if (this.mode === 'auto' && !this.task) this.runTask('Autopilot', this.autopilot());
    this.updateBehaviour();
    this.updateCommand(this.frameDt);
    this.qPrev.set(this.qDes);
    this.solveIK(this.cmdPos, this.cmdYaw, this.qDes, 4);

    const { mj, model, data } = this;
    for (let s = 1; s <= n; s++) {
      const ctrl = data.ctrl;
      const a = s / n;
      for (let j = 0; j < ARM; j++) ctrl[j] = this.qPrev[j] + (this.qDes[j] - this.qPrev[j]) * a;
      ctrl[ARM] = this.grip;
      if (this.drag) this.applyDrag();
      mj.mj_step(model, data);
    }
    this.simTime += this.frameDt;
    this.watchHeld();
    return n;
  }

  updateBehaviour() {
    if (this.task) {
      let r;
      try {
        r = this.task.next();
      } catch (err) {
        r = { done: true };
        console.error(err);
      }
      if (r.done) {
        this.task = null;
        this.status = this.mode === 'auto' ? 'Autopilot' : this.held >= 0 ? 'Carrying block' : 'Tracking cursor';
      }
      return;
    }
    if (this.robotGrab) {
      this.status = 'Teleop';
      this.setGoal(this.robotGrab.target, this.cmdYaw, 1.0, 5);
      return;
    }
    if (this.mode === 'manual') this.status = this.drag ? 'Perturbing' : this.held >= 0 ? 'Carrying block' : 'Tracking cursor';
    if (this.mode === 'manual' && this.hover) {
      const [x, y] = this.hover;
      let yaw = this.naturalYaw(x, y);
      if (this.hoverBlock >= 0 && this.held < 0) yaw = this.graspYaw(this.hoverBlock);
      const z = this.held >= 0 ? Math.max(HOVER_Z, this.carryZ()) : HOVER_Z;
      this.setGoal([x, y, z], yaw, 0.9, 4.5);
    }
  }

  setGoal(p, yaw, vmax = 0.5, amax = 2.5) {
    this.goalPos = this.clampWorkspace(p);
    this.goalYaw = this.cmdYaw + wrapPi(yaw - this.cmdYaw);
    this.vmax = vmax;
    this.amax = amax;
  }

  /** Velocity- and acceleration-limited tracking of the goal pose (smooth, no overshoot). */
  updateCommand(dt) {
    const e = [0, 1, 2].map((k) => this.goalPos[k] - this.cmdPos[k]);
    const dist = Math.hypot(e[0], e[1], e[2]);
    const vDes = Math.min(this.vmax, Math.sqrt(2 * this.amax * dist), 6 * dist);
    const maxDv = this.amax * dt;
    const dv = [0, 1, 2].map((k) => (dist > 1e-9 ? (e[k] * vDes) / dist : 0) - this.cmdVel[k]);
    const dvn = Math.hypot(dv[0], dv[1], dv[2]);
    const sc = dvn > maxDv ? maxDv / dvn : 1;
    for (let k = 0; k < 3; k++) {
      this.cmdVel[k] += dv[k] * sc;
      this.cmdPos[k] += this.cmdVel[k] * dt;
    }
    const ey = this.goalYaw - this.cmdYaw;
    const wDes = Math.sign(ey) * Math.min(2.5, Math.sqrt(2 * 10 * Math.abs(ey)), 6 * Math.abs(ey));
    this.cmdYawVel += clamp(wDes - this.cmdYawVel, -10 * dt, 10 * dt);
    this.cmdYaw += this.cmdYawVel * dt;
  }

  cmdSettled(tol) {
    const e = Math.hypot(this.goalPos[0] - this.cmdPos[0], this.goalPos[1] - this.cmdPos[1], this.goalPos[2] - this.cmdPos[2]);
    return e < tol && Math.hypot(...this.cmdVel) < 0.03 && Math.abs(this.goalYaw - this.cmdYaw) < 0.03;
  }

  trackingError() {
    const p = this.tcpPos();
    return Math.hypot(p[0] - this.cmdPos[0], p[1] - this.cmdPos[1], p[2] - this.cmdPos[2]);
  }

  /* --------------------------------------------------------------------- IK */

  /**
   * Damped least squares on the 6-D TCP pose error (gripper pointing down, yaw = `yaw`),
   * plus a null-space pull toward REST_Q. Solves in place into `q` (warm start).
   */
  solveIK(goal, yaw, q, iters) {
    const { mj, model, scratch } = this;
    const nv = model.nv, J = this._J, A = this._A, L = this._L, e = this._e, x = this._x, y = this._y, w = this._w;
    const R = this._R, Rg = this._Rg, z = this._z, dq = this._dq, rest = this._rest;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // Goal rotation columns: x = (c, s, 0), y = (s, -c, 0), z = (0, 0, -1).
    Rg[0] = c; Rg[1] = s; Rg[2] = 0;
    Rg[3] = s; Rg[4] = -c; Rg[5] = 0;
    Rg[6] = 0; Rg[7] = 0; Rg[8] = -1;
    const wr = 0.55, lambda2 = 0.03 * 0.03;
    rest[0] = clamp(Math.atan2(goal[1], goal[0]), this.qlo[0], this.qhi[0]);

    for (let it = 0; it < iters; it++) {
      const sq = scratch.qpos;
      for (let j = 0; j < ARM; j++) sq[j] = q[j];
      mj.mj_kinematics(model, scratch);
      mj.mj_comPos(model, scratch);
      mj.mj_jacSite(model, scratch, this.jacp, this.jacr, this.tcpSite);
      const jp = this.jacp.GetView(), jr = this.jacr.GetView();
      const sp = scratch.site_xpos, sm = scratch.site_xmat, o = this.tcpSite;
      e[0] = goal[0] - sp[3 * o];
      e[1] = goal[1] - sp[3 * o + 1];
      e[2] = goal[2] - sp[3 * o + 2];
      for (let k = 0; k < 9; k++) R[k] = sm[9 * o + k];
      // Rotation error 0.5 * sum_i r_i x g_i over matching columns (world frame).
      let ex = 0, ey = 0, ez = 0;
      for (let i = 0; i < 3; i++) {
        const r0 = R[i], r1 = R[3 + i], r2 = R[6 + i];
        const g0 = Rg[3 * i], g1 = Rg[3 * i + 1], g2 = Rg[3 * i + 2];
        ex += r1 * g2 - r2 * g1;
        ey += r2 * g0 - r0 * g2;
        ez += r0 * g1 - r1 * g0;
      }
      e[3] = 0.5 * ex * wr; e[4] = 0.5 * ey * wr; e[5] = 0.5 * ez * wr;

      for (let r = 0; r < 3; r++) {
        for (let j = 0; j < ARM; j++) {
          J[r * ARM + j] = jp[r * nv + j];
          J[(r + 3) * ARM + j] = jr[r * nv + j] * wr;
        }
      }
      for (let i = 0; i < 6; i++) {
        for (let k = 0; k <= i; k++) {
          let sum = 0;
          for (let j = 0; j < ARM; j++) sum += J[i * ARM + j] * J[k * ARM + j];
          A[i * 6 + k] = A[k * 6 + i] = sum + (i === k ? lambda2 : 0);
        }
      }
      cholFactor(A, 6, L);
      cholSubst(L, e, 6, x);
      // Null-space posture term: z - J^T (A^-1 J z).
      for (let j = 0; j < ARM; j++) z[j] = POSTURE_GAIN[j] * (rest[j] - q[j]);
      for (let i = 0; i < 6; i++) {
        let sum = 0;
        for (let j = 0; j < ARM; j++) sum += J[i * ARM + j] * z[j];
        y[i] = sum;
      }
      cholSubst(L, y, 6, w);
      let maxStep = 0;
      for (let j = 0; j < ARM; j++) {
        let a = 0, b = 0;
        for (let i = 0; i < 6; i++) {
          a += J[i * ARM + j] * x[i];
          b += J[i * ARM + j] * w[i];
        }
        dq[j] = a + 0.3 * (z[j] - b);
        maxStep = Math.max(maxStep, Math.abs(dq[j]));
      }
      const sc = maxStep > 0.3 ? 0.3 / maxStep : 1;
      for (let j = 0; j < ARM; j++) q[j] = clamp(q[j] + dq[j] * sc, this.qlo[j], this.qhi[j]);
    }
    return q;
  }

  /* --------------------------------------------------------------- geometry */

  naturalYaw(x, y) {
    return Math.atan2(y, x);
  }

  /**
   * Gripper yaw that closes the fingers across two opposite faces of block `i`. Prefers the
   * yaw nearest the natural one, but avoids orientations whose wide hand body (it spans
   * about +-0.1 m along the finger axis) would sweep into a neighbouring tower.
   */
  graspYaw(i) {
    const b = this.block(i);
    const R = quatToMat(b.quat, new Float64Array(9));
    let up = 0;
    for (let k = 1; k < 3; k++) if (Math.abs(R[6 + k]) > Math.abs(R[6 + up])) up = k;
    const a = (up + 1) % 3;
    const face = Math.atan2(R[3 + a], R[a]);
    const natural = this.naturalYaw(b.pos[0], b.pos[1]);
    const handBottom = b.pos[2] + 0.037;
    let best = face, bestCost = Infinity;
    for (let k = -4; k <= 4; k++) {
      const cand = face + (k * Math.PI) / 2;
      let cost = Math.abs(wrapPi(cand - natural));
      // Finger (and wide hand) axis in the table plane: y_hand = (sin, -cos).
      const ux = Math.sin(cand), uy = -Math.cos(cand);
      for (let j = 0; j < this.blocks.length; j++) {
        if (j === i || j === this.held) continue;
        const p = this.block(j).pos;
        if (p[2] + HALF < handBottom) continue;
        const dx = p[0] - b.pos[0], dy = p[1] - b.pos[1];
        const along = Math.abs(dx * ux + dy * uy), across = Math.abs(dx * uy - dy * ux);
        if (along < 0.14 && across < 0.06) cost += 10;
      }
      if (cost < bestCost) { bestCost = cost; best = cand; }
    }
    return natural + wrapPi(best - natural);
  }

  clampXY(x, y) {
    let r = hypot2(x, y);
    let ang = Math.atan2(y, x);
    ang = clamp(ang, -2.3, 2.3);
    r = clamp(r, 0.3, 0.76);
    return [r * Math.cos(ang), r * Math.sin(ang)];
  }

  clampWorkspace(p) {
    const [x, y] = this.clampXY(p[0], p[1]);
    const minZ = this.held >= 0 ? HALF + 0.004 : 0.012;
    let z = clamp(p[2], minZ, 0.75);
    // Keep the wrist (0.21 m above the TCP) within reach of the shoulder.
    const wx = x, wy = y, wz = z + 0.21 - 0.333;
    const reach = Math.hypot(wx, wy, wz);
    if (reach > 0.78) {
      const k = 0.78 / reach;
      return [wx * k, wy * k, wz * k - 0.21 + 0.333];
    }
    return [x, y, z];
  }

  /** Lowest safe TCP height for carrying a held block over everything else on the table. */
  carryZ() {
    let top = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      if (i === this.held) continue;
      const p = this.block(i).pos;
      if (hypot2(p[0], p[1]) < 0.9) top = Math.max(top, p[2] + HALF);
    }
    return Math.max(0.16, top + HALF + 0.07);
  }

  isHolding(i) {
    const b = this.block(i).pos, t = this.tcpPos();
    const w = this.gripperWidth();
    return Math.hypot(b[0] - t[0], b[1] - t[1], b[2] - t[2]) < 0.035 && b[2] > HALF + 0.015 && w > 0.035 && w < 0.07;
  }

  releaseHeld() {
    this.held = -1;
    this.grip = OPEN;
  }

  watchHeld() {
    if (this.held < 0 || this.task) return;
    if (!this.isHolding(this.held)) {
      this.lastEvent = { type: 'dropped', block: this.held, t: this.simTime };
      this.releaseHeld();
      if (this.mode === 'manual') this.status = 'Tracking cursor';
    }
  }

  /** Where to put a held block so it lands on top of block `i`. */
  stackTarget(i) {
    const b = this.block(i);
    const yaw = this.graspYaw(i);
    return { pos: [b.pos[0], b.pos[1], b.pos[2] + 2 * HALF], yaw };
  }

  applyDrag() {
    const d = this.data, b = this.drag.body, g = this.dragPoint();
    const tgt = this.drag.target;
    const bi = this.blocks.findIndex((bl) => bl.body === b);
    const m = bi >= 0 ? this.blocks[bi].mass : 1;
    const qv = d.qvel, dof = bi >= 0 ? this.blocks[bi].dof : -1;
    let v = [0, 0, 0];
    if (dof >= 0) {
      const R = d.xmat, p = d.xpos;
      const wl = [qv[dof + 3], qv[dof + 4], qv[dof + 5]];
      const ww = [0, 1, 2].map((k) => R[9 * b + 3 * k] * wl[0] + R[9 * b + 3 * k + 1] * wl[1] + R[9 * b + 3 * k + 2] * wl[2]);
      const r = [g[0] - p[3 * b], g[1] - p[3 * b + 1], g[2] - p[3 * b + 2]];
      v = [qv[dof] + ww[1] * r[2] - ww[2] * r[1], qv[dof + 1] + ww[2] * r[0] - ww[0] * r[2], qv[dof + 2] + ww[0] * r[1] - ww[1] * r[0]];
    }
    const k = m * 900, c = 2 * m * 30 * 0.8;
    let F = [0, 1, 2].map((i) => k * (tgt[i] - g[i]) - c * v[i]);
    F[2] += m * 9.81 * 0.6; // partially cancel gravity so lifting feels light
    const fn = Math.hypot(F[0], F[1], F[2]);
    if (fn > 25) F = F.map((f) => (f * 25) / fn);
    const com = d.xipos;
    const r = [g[0] - com[3 * b], g[1] - com[3 * b + 1], g[2] - com[3 * b + 2]];
    const xf = d.xfrc_applied;
    xf[6 * b] = F[0]; xf[6 * b + 1] = F[1]; xf[6 * b + 2] = F[2];
    // Torque at the COM plus a little angular damping so dragged blocks don't spin forever.
    const w = dof >= 0 ? [qv[dof + 3], qv[dof + 4], qv[dof + 5]] : [0, 0, 0];
    xf[6 * b + 3] = r[1] * F[2] - r[2] * F[1] - 0.002 * w[0];
    xf[6 * b + 4] = r[2] * F[0] - r[0] * F[2] - 0.002 * w[1];
    xf[6 * b + 5] = r[0] * F[1] - r[1] * F[0] - 0.002 * w[2];
  }

  /* -------------------------------------------------------------- behaviours */

  *wait(seconds) {
    let t = 0;
    while (t < seconds) { yield; t += this.frameDt; }
  }

  *moveTo(p, yaw, vmax = 0.45, tol = 0.004, timeout = 4) {
    this.setGoal(p, yaw, vmax, 2.5);
    let t = 0;
    while (t < timeout) {
      yield;
      t += this.frameDt;
      if (this.cmdSettled(tol) && this.trackingError() < Math.max(0.006, tol * 1.5)) return true;
    }
    return false;
  }

  *graspTask(i) {
    this.grip = OPEN;
    let b = this.block(i);
    let yaw = this.graspYaw(i);
    const safeZ = Math.max(this.cmdPos[2], b.pos[2] + 0.12);
    // Rise first if we are low, then travel above the block, then descend.
    if (this.cmdPos[2] < b.pos[2] + 0.08) yield* this.moveTo([this.cmdPos[0], this.cmdPos[1], safeZ], this.cmdYaw, 0.4, 0.01, 2);
    yield* this.moveTo([b.pos[0], b.pos[1], safeZ], yaw, 0.6, 0.01, 4);
    b = this.block(i);
    yaw = this.graspYaw(i);
    const above = b.pos[2] + 0.1;
    yield* this.moveTo([b.pos[0], b.pos[1], above], yaw, 0.35, 0.003, 3);
    yield* this.moveTo([b.pos[0], b.pos[1], b.pos[2] + 0.004], yaw, 0.22, 0.003, 3);
    this.grip = CLOSED;
    yield* this.wait(0.45);
    yield* this.moveTo([b.pos[0], b.pos[1], b.pos[2] + 0.12], yaw, 0.3, 0.01, 3);
    if (this.isHolding(i)) {
      this.held = i;
      this.lastEvent = { type: 'grasped', block: i, t: this.simTime };
      return true;
    }
    this.grip = OPEN;
    this.lastEvent = { type: 'missed', block: i, t: this.simTime };
    yield* this.wait(0.3);
    return false;
  }

  *placeTask(target) {
    const [x, y, z] = target.pos;
    const yaw = target.yaw ?? this.naturalYaw(x, y);
    const carry = Math.max(this.carryZ(), z + 0.1);
    if (this.cmdPos[2] < carry - 0.01) yield* this.moveTo([this.cmdPos[0], this.cmdPos[1], carry], this.cmdYaw, 0.4, 0.01, 2.5);
    yield* this.moveTo([x, y, carry], yaw, 0.55, 0.006, 4);
    yield* this.moveTo([x, y, z + 0.035], yaw, 0.3, 0.003, 3);
    yield* this.moveTo([x, y, z + 0.004], yaw, 0.15, 0.002, 2.5);
    yield* this.wait(0.1);
    const i = this.held;
    this.grip = OPEN;
    this.held = -1;
    yield* this.wait(0.3);
    yield* this.moveTo([x, y, z + 0.1], yaw, 0.35, 0.01, 2);
    if (i >= 0) this.lastEvent = { type: 'placed', block: i, t: this.simTime };
    return true;
  }

  *goHome() {
    this.grip = OPEN;
    yield* this.moveTo([0.42, 0, 0.36], 0, 0.45, 0.01, 4);
  }

  reachable(i) {
    const p = this.block(i).pos;
    const r = hypot2(p[0], p[1]);
    return r > 0.3 && r < 0.76 && Math.abs(Math.atan2(p[1], p[0])) < 2.2 && p[2] < 0.4;
  }

  /**
   * A table spot clear of every block and of `keepOut` (the current formation's slots).
   * The hand is ~0.2 m wide, so towers need generous clearance. Falls back to the
   * roomiest candidate if nothing meets the margin.
   */
  freeSpot() {
    let best = [0.45, 0.3], bestScore = -Infinity;
    for (let tries = 0; tries < 80; tries++) {
      const r = 0.38 + this.rand() * 0.26;
      const a = (this.rand() - 0.5) * 2.4;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      let score = Infinity;
      for (const [kx, ky] of this.keepOut) score = Math.min(score, hypot2(x - kx, y - ky) - 0.17);
      for (let i = 0; i < this.blocks.length; i++) {
        if (i === this.held) continue;
        const p = this.block(i).pos;
        score = Math.min(score, hypot2(p[0] - x, p[1] - y) - 0.11);
      }
      if (score >= 0) return [x, y];
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
    return best;
  }

  /** Put unreachable resting blocks back on the table (viewer animates the pop-in). */
  recoverBlocks() {
    const d = this.data;
    for (let i = 0; i < this.blocks.length; i++) {
      if (i === this.held || this.reachable(i) || this.blockSpeed(i) > 0.02) continue;
      if (this.drag && this.drag.body === this.blocks[i].body) continue;
      const [x, y] = this.freeSpot();
      const a = this.blocks[i].q, v = this.blocks[i].dof;
      const q = d.qpos, qv = d.qvel;
      const yaw = (this.rand() - 0.5) * 1.5;
      q[a] = x; q[a + 1] = y; q[a + 2] = HALF + 0.001;
      q[a + 3] = Math.cos(yaw / 2); q[a + 4] = 0; q[a + 5] = 0; q[a + 6] = Math.sin(yaw / 2);
      for (let k = 0; k < 6; k++) qv[v + k] = 0;
      this.mj.mj_forward(this.model, d);
      this.lastEvent = { type: 'teleport', block: i, t: this.simTime };
      if (this.onTeleport) this.onTeleport(i);
    }
  }

  /* ------------------------------------------------------------- autopilot */

  /**
   * Target arrangements the autopilot cycles through. Each returns slots
   * {block, pos, yaw}, ordered so supporting blocks come before the ones on top.
   */
  makeFormation(kind) {
    const n = this.blocks.length;
    const order = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(this.rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const a = (this.rand() - 0.5) * 0.8;                   // heading of the formation
    const radial = [Math.cos(a), Math.sin(a)], tangent = [-Math.sin(a), Math.cos(a)];
    const at = (r, t, level, block, yaw = a) => ({
      block, yaw,
      pos: [r * radial[0] + t * tangent[0], r * radial[1] + t * tangent[1], HALF + 2 * HALF * level + 0.002],
    });
    if (kind === 'tower') {
      return { name: 'Building a tower', slots: order.map((b, k) => at(0.5, 0, k, b)) };
    }
    if (kind === 'row') {
      // Sorted by colour along a line across the robot's front.
      return { name: 'Sorting by colour', slots: [...Array(n).keys()].map((b) => at(0.5, (b - (n - 1) / 2) * 0.1, 0, b)) };
    }
    if (kind === 'twin') {
      // Two short towers; the wide hand stays perpendicular to the gap between them.
      const slots = [];
      order.forEach((b, k) => slots.push(at(0.5, k % 2 ? 0.12 : -0.12, Math.floor(k / 2), b, a + Math.PI / 2)));
      return { name: 'Twin towers', slots };
    }
    return { name: 'Arranging a grid', slots: order.map((b, k) => at(0.45 + 0.11 * (k >> 1), (k & 1 ? 0.055 : -0.055), 0, b)) };
  }

  atSlot(s) {
    const p = this.block(s.block).pos;
    return s.block !== this.held && hypot2(p[0] - s.pos[0], p[1] - s.pos[1]) < 0.015 && Math.abs(p[2] - s.pos[2]) < 0.012;
  }

  /** A block that must move before slot `s` can be filled, or -1. */
  blockerFor(s) {
    const own = this.block(s.block).pos;
    let top = -1, topZ = -Infinity;
    for (let j = 0; j < this.blocks.length; j++) {
      if (j === s.block || j === this.held) continue;
      const p = this.block(j).pos;
      // Something stacked on the block we want to pick up (take the highest first).
      const onTop = hypot2(p[0] - own[0], p[1] - own[1]) < 0.035 && p[2] > own[2] + 0.03;
      // Something sitting where this block has to go.
      const inTheWay = hypot2(p[0] - s.pos[0], p[1] - s.pos[1]) < 0.075 && p[2] > s.pos[2] - 0.03;
      if ((onTop || inTheWay) && p[2] > topZ) { top = j; topZ = p[2]; }
    }
    return top;
  }

  *relocate(i) {
    if (!(yield* this.graspTask(i))) return false;
    const [x, y] = this.freeSpot();
    yield* this.placeTask({ pos: [x, y, HALF + 0.002], yaw: this.naturalYaw(x, y) });
    return true;
  }

  *autopilot() {
    const kinds = ['tower', 'row', 'twin', 'grid'];
    while (true) {
      this.recoverBlocks();
      if (this.held >= 0) {
        // Finish whatever the user left in the gripper.
        const [x, y] = this.freeSpot();
        yield* this.placeTask({ pos: [x, y, HALF + 0.002], yaw: this.naturalYaw(x, y) });
        continue;
      }
      const f = this.makeFormation(kinds[this.formationIndex++ % kinds.length]);
      this.keepOut = f.slots.map((sl) => [sl.pos[0], sl.pos[1]]);
      this.formation = f.name;
      const failures = new Map();
      let steps = 0;
      while (steps++ < 16) {
        this.recoverBlocks();
        const done = f.slots.filter((sl) => this.atSlot(sl)).length;
        this.status = `${f.name} ${done}/${f.slots.length}`;
        const slot = f.slots.find((sl) => !this.atSlot(sl));
        if (!slot) break;
        const blocker = this.blockerFor(slot);
        const i = blocker >= 0 ? blocker : slot.block;
        if ((failures.get(i) || 0) >= 2 || !this.reachable(i) || this.blockSpeed(i) > 0.05) {
          failures.set(i, (failures.get(i) || 0) + 1);
          if (failures.get(i) > 4) break;
          yield* this.wait(0.3);
          continue;
        }
        if (blocker >= 0) {
          if (!(yield* this.relocate(blocker))) failures.set(i, (failures.get(i) || 0) + 1);
          continue;
        }
        if (!(yield* this.graspTask(i))) { failures.set(i, (failures.get(i) || 0) + 1); continue; }
        yield* this.placeTask({ pos: slot.pos, yaw: slot.yaw });
      }
      const done = f.slots.filter((sl) => this.atSlot(sl)).length;
      this.status = done === f.slots.length ? `${f.name} · done` : f.name;
      if (done === f.slots.length) this.lastEvent = { type: 'formed', block: -1, name: f.name, t: this.simTime };
      yield* this.goHome();
      yield* this.wait(done === f.slots.length ? 1.8 : 0.6);
    }
  }
}
