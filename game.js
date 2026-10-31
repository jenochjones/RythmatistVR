import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Rithmatist VR — browser WebXR duel, playable on Quest 2+ and on desktop.
// No build step, no server: the whole game is static, so GitHub Pages can host it.
// Two-player duels are peer-to-peer (PeerJS cloud signalling only; game data
// goes directly between the two browsers). Practice mode is fully local.
// ---------------------------------------------------------------------------

const SPAWN_DIST = 15.24; // 50 ft each side of centre = 100 ft apart
const ARENA_RADIUS = 28;
const WIN_SCORE = 2;
const $ = (id) => document.getElementById(id);

const state = {
  mode: 'lobby', // lobby | practice | duel
  playerIndex: 0,
  scores: [0, 0],
  health: [100, 100],
  chalk: [100, 100],
  round: 1,
  roundOver: false,
  roundTimer: 0,
  aiTimer: 6,
  aiWardTimer: 14,
  poseTimer: 0,
  chalklingSeq: 0,
};

const COLORS = [0x4aa8ff, 0xff7a3d]; // you = blue, foe = orange/red
const COLOR_HEX = ['#4aa8ff', '#ff7a3d'];

// ---------------- Scene ----------------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1622);
scene.fog = new THREE.Fog(0x0e1622, 30, 90);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(0, 1.6, 0);
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

// Lights
scene.add(new THREE.HemisphereLight(0xdde8ff, 0x1a1208, 1.1));
const sun = new THREE.DirectionalLight(0xfff2cc, 1.2);
sun.position.set(10, 20, 5);
scene.add(sun);

// Ground: a big chalk-slate arena
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(ARENA_RADIUS + 6, 64),
  new THREE.MeshStandardMaterial({ color: 0x27313f, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Arena ring + centre line + starting circles
function ring(radius, color, opacity = 0.9) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.12, radius, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02;
  return m;
}
scene.add(ring(ARENA_RADIUS, 0xf5f0dc, 0.5));
scene.add(ring(3, COLOR_HEX[0], 0.9)); scene.children.at(-1).position.z = -SPAWN_DIST;
scene.add(ring(3, COLOR_HEX[1], 0.9)); scene.children.at(-1).position.z = SPAWN_DIST;
const centreLine = new THREE.Mesh(
  new THREE.BoxGeometry(2 * ARENA_RADIUS, 0.02, 0.18),
  new THREE.MeshBasicMaterial({ color: 0xf5f0dc })
);
centreLine.position.y = 0.02; scene.add(centreLine);

// Simple standing stones / pillars for atmosphere
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.7, 3 + (i % 3), 8),
    new THREE.MeshStandardMaterial({ color: 0x3a4658, roughness: 1 })
  );
  pillar.position.set(Math.cos(a) * (ARENA_RADIUS + 2), 1.5, Math.sin(a) * (ARENA_RADIUS + 2));
  scene.add(pillar);
}

// Floating instruction board above the centre (visible at spawn, fades in use)
function makeBoard(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(10,14,20,0.85)'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#f5f0dc'; ctx.font = 'bold 44px system-ui'; ctx.textAlign = 'center';
  text.split('\n').forEach((line, i) => ctx.fillText(line, 512, 90 + i * 60));
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 2.5),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
  );
  mesh.position.set(0, 3.4, 0);
  return mesh;
}
const board = makeBoard('Hold a trigger: your controller becomes chalk\nDraw a closed shape to summon a Chalkling');
scene.add(board);

// ---------------- Players / avatars ----------------
let yaw = Math.PI; // player 0 faces +Z, toward the foe
let pitch = 0;
function spawnPos(i) { return new THREE.Vector3(0, 0, i === 0 ? -SPAWN_DIST : SPAWN_DIST); }
function spawnYaw(i) { return i === 0 ? Math.PI : 0; }

function resetRig() {
  const p = spawnPos(state.playerIndex);
  rig.position.copy(p);
  yaw = spawnYaw(state.playerIndex);
  rig.rotation.y = yaw;
  camera.position.set(0, 1.6, 0);
}
resetRig();

// Opponent avatar: robe + head + hands. Hands are scene-level so network
// world positions can be applied directly.
const foeGroup = new THREE.Group();
const foeBody = new THREE.Mesh(
  new THREE.CylinderGeometry(0.32, 0.5, 1.35, 12),
  new THREE.MeshStandardMaterial({ color: COLOR_HEX[1] })
);
foeBody.position.y = 0.85;
const foeHead = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 16, 12),
  new THREE.MeshStandardMaterial({ color: 0xe8c39a })
);
foeHead.position.y = 1.65;
foeGroup.add(foeBody, foeHead);
const foeHands = [0, 1].map(() => {
  const h = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.2, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );
  scene.add(h); return h;
});
foeGroup.position.copy(spawnPos(1));
scene.add(foeGroup);
let foePoseTarget = null;

// ---------------- Hands, chalk & controllers ----------------
const hands = [];
for (let i = 0; i < 2; i++) {
  const grip = renderer.xr.getControllerGrip(i);
  const controller = renderer.xr.getController(i);
  rig.add(grip); rig.add(controller);
  // A plain controller proxy (shown when the trigger is up)
  const ctrlMesh = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.16, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.6 })
  );
  ctrlMesh.add(body);
  // The piece of chalk (shown while the trigger is held)
  const chalkMesh = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0xf5f0dc, roughness: 1 })
  );
  stick.rotation.x = Math.PI / 2; stick.position.z = -0.12;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.018, 0.05, 10),
    new THREE.MeshStandardMaterial({ color: 0xf5f0dc, roughness: 1 })
  );
  tip.rotation.x = -Math.PI / 2; tip.position.z = -0.25;
  chalkMesh.add(stick, tip);
  chalkMesh.visible = false;
  grip.add(ctrlMesh, chalkMesh);
  const hand = {
    index: i, grip, controller, ctrlMesh, chalkMesh,
    drawing: false, stroke: null, held: null,
    lastGripPos: new THREE.Vector3(), gripVel: new THREE.Vector3(),
  };
  controller.addEventListener('selectstart', () => { hand.chalkMesh.visible = true; hand.ctrlMesh.visible = false; startDraw(i); });
  controller.addEventListener('selectend', () => { hand.chalkMesh.visible = false; hand.ctrlMesh.visible = true; endDraw(i); });
  controller.addEventListener('squeezestart', () => tryGrab(i));
  controller.addEventListener('squeezeend', () => releaseGrab(i));
  hands.push(hand);
}

// Desktop fallback hand (mouse ray)
const desktopHand = { drawing: false, stroke: null };

// ---------------- Drawing: chalk ribbons on the ground ----------------
const strokesGroup = new THREE.Group(); scene.add(strokesGroup);
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();

function groundPointFromGrip(hand) {
  const origin = new THREE.Vector3(), dir = new THREE.Vector3();
  hand.grip.getWorldPosition(origin);
  hand.grip.getWorldQuaternion(new THREE.Quaternion());
  const q = new THREE.Quaternion(); hand.grip.getWorldQuaternion(q);
  dir.set(0, 0, -1).applyQuaternion(q);
  if (dir.y > -0.05) return null;
  const t = -origin.y / dir.y;
  const p = origin.clone().add(dir.multiplyScalar(t));
  if (Math.hypot(p.x, p.z) > ARENA_RADIUS) return null;
  p.y = 0.03; return p;
}
function groundPointFromMouse(e) {
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, p)) return null;
  if (Math.hypot(p.x, p.z) > ARENA_RADIUS) return null;
  p.y = 0.03; return p;
}

class Ribbon {
  constructor(color = 0xf5f0dc) {
    this.pts = [];
    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    strokesGroup.add(this.mesh);
  }
  add(p) {
    const last = this.pts[this.pts.length - 1];
    if (last && last.distanceTo(p) < 0.07) return;
    this.pts.push(p.clone());
    this.rebuild();
  }
  rebuild() {
    const pos = [];
    for (let i = 0; i < this.pts.length; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(this.pts.length - 1, i + 1)];
      const d = b.clone().sub(a); d.y = 0;
      if (d.lengthSq() < 1e-6) d.set(1, 0, 0);
      d.normalize();
      const perp = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.055);
      const p = this.pts[i];
      pos.push(p.x - perp.x, 0.03, p.z - perp.z, p.x + perp.x, 0.03, p.z + perp.z);
    }
    const idx = [];
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.geometry.setIndex(idx);
    this.geometry.computeBoundingSphere();
  }
  dispose() { strokesGroup.remove(this.mesh); this.geometry.dispose(); }
  get length() {
    let l = 0;
    for (let i = 1; i < this.pts.length; i++) l += this.pts[i].distanceTo(this.pts[i - 1]);
    return l;
  }
  get centroid() {
    const c = new THREE.Vector3();
    this.pts.forEach((p) => c.add(p));
    return this.pts.length ? c.multiplyScalar(1 / this.pts.length) : c;
  }
  get maxRadius() {
    const c = this.centroid; let m = 0;
    this.pts.forEach((p) => { m = Math.max(m, Math.hypot(p.x - c.x, p.z - c.z)); });
    return m;
  }
  get closed() {
    if (this.pts.length < 10) return false;
    return this.pts[0].distanceTo(this.pts[this.pts.length - 1]) < 0.8 && this.length > 1.2;
  }
}

function startDraw(handIndex) {
  const hand = hands[handIndex];
  if (hand.drawing) return;
  hand.drawing = true;
  hand.stroke = new Ribbon(COLOR_HEX[state.playerIndex]);
}
function endDraw(handIndex) {
  const hand = hands[handIndex];
  if (!hand.drawing || !hand.stroke) return;
  hand.drawing = false;
  classifyStroke(hand.stroke, state.playerIndex, true);
  hand.stroke = null;
}
function startDesktopDraw(e) {
  if (state.mode === 'lobby') return;
  const p = groundPointFromMouse(e);
  if (!p) return;
  desktopHand.drawing = true;
  desktopHand.stroke = new Ribbon(COLOR_HEX[state.playerIndex]);
  desktopHand.stroke.add(p);
}
function endDesktopDraw() {
  if (!desktopHand.drawing || !desktopHand.stroke) return;
  desktopHand.drawing = false;
  classifyStroke(desktopHand.stroke, state.playerIndex, true);
  desktopHand.stroke = null;
}

// ---------------- Game entities ----------------
const chalklings = []; // {id, owner, pts, pos, group, scale, speed, phase, held, thrown, vel, hitCooldown, isRemote}
const wards = [];      // {id, owner, center, radius, health, mesh}
const walls = [];      // {id, owner, a, b, health, mesh}
const dynamicGroup = new THREE.Group(); scene.add(dynamicGroup);

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

function shapeMeshFromPts(pts, color) {
  const c = new THREE.Vector3();
  pts.forEach((p) => c.add(p)); c.multiplyScalar(1 / pts.length);
  const shape = new THREE.Shape();
  pts.forEach((p, i) => {
    const x = p.x - c.x, y = -(p.z - c.z);
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  });
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  mesh.position.y = 0.04;
  return { mesh, centroid: c };
}

function spawnChalkling(owner, pts, id = uid(), broadcast = true) {
  const mine = chalklings.filter((c) => c.owner === owner).length;
  if (mine >= 5) { toast('Too many Chalklings — wait for one to fall.'); return null; }
  const { mesh, centroid } = shapeMeshFromPts(pts, COLORS[owner]);
  const group = new THREE.Group();
  group.add(mesh);
  // Two eyes at the front of the creature
  const r = Math.max(0.25, Math.min(1, pts.length ? 0.4 : 0.4));
  [-0.12, 0.12].forEach((dx) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(dx, 0.14, 0.3); group.add(eye);
  });
  group.position.copy(centroid); group.position.y = 0;
  dynamicGroup.add(group);
  const maxR = Math.max(...pts.map((p) => Math.hypot(p.x - centroid.x, p.z - centroid.z)));
  const scale = THREE.MathUtils.clamp(0.5 + maxR * 0.35, 0.5, 1.25);
  group.scale.setScalar(scale);
  const ent = {
    id, owner, pts, pos: centroid.clone(), group, scale,
    speed: THREE.MathUtils.clamp(1.9 - scale * 0.55, 0.9, 1.7),
    phase: Math.random() * Math.PI * 2, held: false, thrown: false,
    vel: new THREE.Vector3(), hitCooldown: 0, isRemote: false,
  };
  chalklings.push(ent);
  if (broadcast && state.mode === 'duel' && owner === state.playerIndex) send({ t: 'spawn', kind: 'chalkling', id, owner, pts: pts.map((p) => [p.x, p.z]) });
  return ent;
}

function spawnWard(owner, center, radius, id = uid(), broadcast = true) {
  const old = wards.find((w) => w.owner === owner);
  if (old) removeWard(old);
  const g = new THREE.Group();
  const ringMesh = ring(radius, COLORS[owner], 0.95);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshBasicMaterial({ color: COLORS[owner], transparent: true, opacity: 0.12, side: THREE.DoubleSide })
  );
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.025;
  g.add(ringMesh, disc);
  g.position.copy(center); g.position.y = 0;
  dynamicGroup.add(g);
  const ent = { id, owner, center: center.clone(), radius, health: 60, mesh: g };
  wards.push(ent);
  if (broadcast && state.mode === 'duel' && owner === state.playerIndex) send({ t: 'spawn', kind: 'ward', id, owner, center: [center.x, center.z], radius });
  return ent;
}
function removeWard(w) { dynamicGroup.remove(w.mesh); wards.splice(wards.indexOf(w), 1); if (state.mode === 'duel') send({ t: 'remove', kind: 'ward', id: w.id }); }

function spawnWall(owner, a, b, id = uid(), broadcast = true) {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(len, 0.9, 0.16),
    new THREE.MeshStandardMaterial({ color: COLORS[owner], transparent: true, opacity: 0.85 })
  );
  mesh.position.set((a.x + b.x) / 2, 0.45, (a.z + b.z) / 2);
  mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  dynamicGroup.add(mesh);
  const ent = { id, owner, a: a.clone(), b: b.clone(), health: 40, mesh };
  walls.push(ent);
  if (broadcast && state.mode === 'duel' && owner === state.playerIndex) send({ t: 'spawn', kind: 'wall', id, owner, a: [a.x, a.z], b: [b.x, b.z] });
  return ent;
}
function removeWall(w) { dynamicGroup.remove(w.mesh); walls.splice(walls.indexOf(w), 1); if (state.mode === 'duel') send({ t: 'remove', kind: 'wall', id: w.id }); }

function classifyStroke(stroke, owner, broadcast) {
  const cost = Math.min(40, stroke.length * 2);
  const me = owner === state.playerIndex;
  if (me && state.chalk[owner] < cost) {
    toast('Out of chalk — it recharges as you wait.');
    stroke.dispose(); return;
  }
  if (me) state.chalk[owner] = Math.max(0, state.chalk[owner] - cost);

  const pts = stroke.pts;
  const centroid = stroke.centroid;
  const myPos = owner === state.playerIndex ? rig.position : foeGroup.position;

  if (stroke.closed && centroid.distanceTo(myPos) < 5.5 && stroke.maxRadius > 1.7) {
    // A big circle drawn around yourself: a Line of Warding.
    spawnWard(owner, centroid, stroke.maxRadius, uid(), broadcast);
    stroke.dispose();
    toast(owner === state.playerIndex ? 'Line of Warding raised!' : 'Your foe raised a Ward.');
    return;
  }
  if (stroke.closed) {
    // Any other closed shape: a Chalkling, come alive.
    const ent = spawnChalkling(owner, pts, uid(), broadcast);
    if (!ent) { stroke.dispose(); return; }
    stroke.dispose();
    toast(owner === state.playerIndex ? 'A Chalkling stirs and wiggles toward your foe!' : 'A foe Chalkling is on its way!');
    return;
  }
  // Long, fairly straight line: a Line of Forbiddance.
  const a = pts[0], b = pts[pts.length - 1];
  let maxDev = 0;
  pts.forEach((p) => {
    const t = THREE.MathUtils.clamp(((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / Math.max(1e-6, a.distanceToSquared(b)), 0, 1);
    const closest = new THREE.Vector3().lerpVectors(a, b, t);
    maxDev = Math.max(maxDev, p.distanceTo(closest));
  });
  if (stroke.length > 2 && maxDev < 0.6) {
    spawnWall(owner, a, b, uid(), broadcast);
    stroke.dispose();
    toast(owner === state.playerIndex ? 'Line of Forbiddance raised!' : 'Your foe raised a wall.');
    return;
  }
  // Otherwise it is just chalk art. Keep it briefly, then fade it away.
  if (broadcast && state.mode === 'duel' && owner === state.playerIndex) send({ t: 'stroke', pts: pts.map((p) => [p.x, p.z]) });
  setTimeout(() => stroke.dispose(), 45000);
}

// ---------------- Grab & throw ----------------
function nearestChalklingTo(pos, maxDist = 2.0) {
  let best = null, bestD = maxDist;
  chalklings.forEach((c) => {
    if (c.held) return;
    const d = c.pos.distanceTo(pos);
    if (d < bestD) { best = c; bestD = d; }
  });
  return best;
}
function tryGrab(handIndex) {
  const hand = hands[handIndex];
  const pos = new THREE.Vector3(); hand.grip.getWorldPosition(pos);
  const c = nearestChalklingTo(pos);
  if (!c) return;
  c.held = true; c.thrown = false; hand.held = c;
  if (state.mode === 'duel') send({ t: 'held', id: c.id, held: true });
  toast('Grabbed a Chalkling — throw it toward your foe!');
}
function releaseGrab(handIndex) {
  const hand = hands[handIndex];
  if (!hand.held) return;
  const c = hand.held;
  c.held = false; hand.held = null;
  const speed = hand.gripVel.length();
  if (speed > 0.8) {
    c.thrown = true;
    c.vel.copy(hand.gripVel).multiplyScalar(1.4); c.vel.y = Math.max(1, hand.gripVel.y * 1.2);
    c.group.position.y = Math.max(0.3, c.group.position.y);
  }
  if (state.mode === 'duel') send({ t: 'held', id: c.id, held: false, pos: [c.pos.x, c.pos.z] });
}

// ---------------- Combat, rounds & tournament ----------------
function foePos() { return state.mode === 'practice' ? foeGroup.position : (foePoseTarget || foeGroup.position); }

function applyDamage(target, amount, sourceId) {
  if (state.roundOver) return;
  state.health[target] = Math.max(0, state.health[target] - amount);
  if (state.health[target] <= 0) endRound(1 - target);
  updateHUD();
}
function endRound(winner) {
  state.roundOver = true;
  state.scores[winner]++;
  const youWon = winner === state.playerIndex;
  showBanner(youWon ? 'YOU WIN THE ROUND!' : 'FOE WINS THE ROUND!');
  if (state.scores[winner] >= WIN_SCORE) {
    setTimeout(() => showBanner(youWon ? '🏆 YOU WIN THE MATCH!' : '🏆 FOE WINS THE MATCH!'), 2600);
    setTimeout(() => resetMatch(), 6500);
  } else {
    state.round++;
    setTimeout(() => resetRound(), 3600);
  }
  updateHUD();
}
function clearEntities() {
  [...chalklings].forEach((c) => { dynamicGroup.remove(c.group); chalklings.splice(chalklings.indexOf(c), 1); });
  [...wards].forEach((w) => { dynamicGroup.remove(w.mesh); wards.splice(wards.indexOf(w), 1); });
  [...walls].forEach((w) => { dynamicGroup.remove(w.mesh); walls.splice(walls.indexOf(w), 1); });
  hands.forEach((h) => { h.held = null; });
}
function resetRound() {
  clearEntities();
  state.health = [100, 100]; state.chalk = [100, 100];
  state.roundOver = false;
  resetRig(); foeGroup.position.copy(spawnPos(1 - state.playerIndex));
  $('round-label').textContent = `ROUND ${state.round} · FIRST TO ${WIN_SCORE}`;
  showBanner(`ROUND ${state.round}`);
  setTimeout(hideBanner, 1600);
  updateHUD();
}
function resetMatch() {
  state.scores = [0, 0]; state.round = 1;
  resetRound();
}

function distToSegment(p, a, b) {
  const t = THREE.MathUtils.clamp(((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / Math.max(1e-6, a.distanceToSquared(b)), 0, 1);
  const c = new THREE.Vector3().lerpVectors(a, b, t);
  return p.distanceTo(c);
}

function updateChalkling(c, dt, time) {
  if (c.held) return;
  if (c.thrown) {
    c.vel.y -= 9.8 * dt;
    c.group.position.addScaledVector(c.vel, dt);
    c.pos.set(c.group.position.x, 0, c.group.position.z);
    if (c.group.position.y <= 0) {
      c.group.position.y = 0; c.thrown = false;
      c.speed *= 1.4; // a good throw gives it a burst of vigour
      setTimeout(() => { c.speed /= 1.4; }, 2000);
    }
    return;
  }
  const targetIndex = 1 - c.owner;
  const targetPos = targetIndex === state.playerIndex ? rig.position : foePos();
  const toTarget = new THREE.Vector3().subVectors(targetPos, c.pos); toTarget.y = 0;
  const dist = toTarget.length();
  if (dist < 0.001) return;
  const dir = toTarget.clone().normalize();

  // Blocked by a foe wall?
  const foeWalls = walls.filter((w) => w.owner === targetIndex);
  for (const w of foeWalls) {
    if (distToSegment(c.pos, w.a, w.b) < 0.6) {
      w.health -= 18 * dt;
      c.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(time * 10 + c.phase) * 0.2;
      if (w.health <= 0) removeWall(w);
      return;
    }
  }
  // Blocked by a foe ward ring?
  const ward = wards.find((w) => w.owner === targetIndex);
  if (ward) {
    const dWard = c.pos.distanceTo(ward.center);
    if (dWard < ward.radius + 0.4 && dWard > ward.radius - 1.2) {
      ward.health -= 16 * dt;
      c.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(time * 10 + c.phase) * 0.2;
      if (ward.health <= 0) removeWard(ward);
      return;
    }
  }
  // Reached the foe?
  if (dist < 1.3) {
    c.hitCooldown -= dt;
    if (c.hitCooldown <= 0) {
      c.hitCooldown = 0.9;
      if (c.owner === state.playerIndex || state.mode === 'practice') {
        // Local authority for your own Chalklings (and for the AI's, in practice).
        applyDamage(targetIndex, 12);
        if (state.mode === 'duel' && targetIndex !== state.playerIndex) send({ t: 'damage', target: targetIndex, amount: 12 });
      }
      dynamicGroup.remove(c.group); chalklings.splice(chalklings.indexOf(c), 1);
      if (state.mode === 'duel') send({ t: 'remove', kind: 'chalkling', id: c.id });
    }
    return;
  }
  // Wiggle-walk toward the foe.
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const wiggle = Math.sin(time * 7 + c.phase) * 0.35;
  c.pos.addScaledVector(dir, c.speed * dt);
  c.group.position.set(c.pos.x + perp.x * wiggle * 0.35, Math.abs(Math.sin(time * 7 + c.phase)) * 0.06, c.pos.z + perp.z * wiggle * 0.35);
  c.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(time * 7 + c.phase) * 0.25;
  c.group.scale.setScalar(c.scale * (1 + Math.sin(time * 9 + c.phase) * 0.04));
}

// ---------------- HUD ----------------
let toastTimer = null;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
function showBanner(msg) { const b = $('banner'); b.textContent = msg; b.classList.add('show'); }
function hideBanner() { $('banner').classList.remove('show'); }
function updateHUD() {
  const you = state.playerIndex, foe = 1 - you;
  $('hp-you').style.width = `${state.health[you]}%`;
  $('hp-foe').style.width = `${state.health[foe]}%`;
  $('chalk-you').style.width = `${state.chalk[you]}%`;
  $('chalk-foe').style.width = `${state.chalk[foe]}%`;
  $('score-you').textContent = state.scores[you];
  $('score-foe').textContent = state.scores[foe];
  $('foe-label').textContent = state.mode === 'practice' ? 'CHALK AI' : 'OPPONENT';
}
function setStatus(msg) { $('status').textContent = msg; }

// ---------------- Networking (PeerJS, peer-to-peer) ----------------
let peer = null, conn = null;
function send(msg) { if (conn && conn.open) { try { conn.send(msg); } catch (_) { /* peer gone */ } } }
function makeCode() { return `chalk-${Math.floor(1000 + Math.random() * 9000)}`; }
function hostIdFromCode(code) { return `rythmatist-${code.replace(/[^a-z0-9-]/gi, '').toLowerCase()}`; }

function handleMessage(msg) {
  if (!msg || !msg.t) return;
  if (msg.t === 'pose') {
    foePoseTarget = new THREE.Vector3(...msg.p);
    foeHead.quaternion.set(...msg.h);
    msg.c.forEach((c, i) => { if (foeHands[i]) foeHands[i].position.set(...c); });
  } else if (msg.t === 'spawn') {
    const toVec = (a) => new THREE.Vector3(a[0], 0.03, a[1]);
    if (msg.kind === 'chalkling') {
      const ent = spawnChalkling(msg.owner, msg.pts.map(toVec), msg.id, false);
      if (ent) ent.isRemote = true;
    } else if (msg.kind === 'ward') spawnWard(msg.owner, toVec(msg.center), msg.radius, msg.id, false);
    else if (msg.kind === 'wall') spawnWall(msg.owner, toVec(msg.a), toVec(msg.b), msg.id, false);
  } else if (msg.t === 'stroke') {
    const r = new Ribbon(COLOR_HEX[1 - state.playerIndex]);
    msg.pts.forEach((p) => r.add(new THREE.Vector3(p[0], 0.03, p[1])));
    setTimeout(() => r.dispose(), 45000);
  } else if (msg.t === 'chalklingPos') {
    const c = chalklings.find((x) => x.id === msg.id);
    if (c && c.isRemote) c.pos.set(msg.p[0], 0, msg.p[1]);
  } else if (msg.t === 'held') {
    const c = chalklings.find((x) => x.id === msg.id);
    if (c) { c.held = msg.held; if (msg.pos) c.pos.set(msg.pos[0], 0, msg.pos[1]); }
  } else if (msg.t === 'damage') {
    applyDamage(msg.target, msg.amount);
  } else if (msg.t === 'remove') {
    if (msg.kind === 'chalkling') {
      const c = chalklings.find((x) => x.id === msg.id);
      if (c) { dynamicGroup.remove(c.group); chalklings.splice(chalklings.indexOf(c), 1); }
    } else if (msg.kind === 'ward') {
      const w = wards.find((x) => x.id === msg.id);
      if (w) { dynamicGroup.remove(w.mesh); wards.splice(wards.indexOf(w), 1); }
    } else if (msg.kind === 'wall') {
      const w = walls.find((x) => x.id === msg.id);
      if (w) { dynamicGroup.remove(w.mesh); walls.splice(walls.indexOf(w), 1); }
    }
  }
}
function wireConn(c) {
  conn = c;
  conn.on('data', handleMessage);
  conn.on('close', () => { setStatus('Opponent disconnected.'); toast('Opponent disconnected.'); });
}
function startDuel() {
  state.mode = 'duel';
  state.scores = [0, 0]; state.round = 1;
  $('lobby').classList.add('hidden');
  resetRound();
  setStatus('Duel live — draw, defend, and send your Chalklings!');
  toast('Duel live!');
}

// ---------------- Lobby wiring ----------------
$('btn-practice').onclick = () => {
  state.mode = 'practice'; state.playerIndex = 0;
  $('lobby').classList.add('hidden');
  resetRound();
  setStatus('Practice — the Chalk AI will draw against you.');
  toast('Practice mode: draw a closed shape to summon a Chalkling.');
};
$('btn-host').onclick = () => {
  if (typeof Peer === 'undefined') { $('lobby-error').textContent = 'Networking library failed to load — check your connection and reload.'; return; }
  const code = makeCode();
  $('host-code').value = code;
  $('host-box').classList.remove('hidden');
  $('join-box').classList.add('hidden');
  state.playerIndex = 0;
  try {
    peer = new Peer(hostIdFromCode(code));
    peer.on('connection', (c) => { wireConn(c); c.on('open', () => { $('host-status').textContent = 'Opponent connected!'; startDuel(); }); });
    peer.on('error', (e) => { $('lobby-error').textContent = `Could not host: ${e.type || e.message}`; });
  } catch (e) { $('lobby-error').textContent = `Could not host: ${e.message}`; }
};
$('btn-join').onclick = () => {
  $('join-box').classList.remove('hidden');
  $('host-box').classList.add('hidden');
};
$('btn-connect').onclick = () => {
  if (typeof Peer === 'undefined') { $('lobby-error').textContent = 'Networking library failed to load — check your connection and reload.'; return; }
  let code = $('join-code').value.trim().toLowerCase();
  if (!code) { $('lobby-error').textContent = 'Enter the duel code from your host.'; return; }
  if (!code.startsWith('chalk-')) code = `chalk-${code}`;
  state.playerIndex = 1;
  try {
    peer = new Peer();
    peer.on('open', () => {
      const c = peer.connect(hostIdFromCode(code), { reliable: true });
      wireConn(c);
      c.on('open', () => { startDuel(); });
    });
    peer.on('error', (e) => { $('lobby-error').textContent = `Could not connect: ${e.type || e.message}. Is the host waiting?`; });
  } catch (e) { $('lobby-error').textContent = `Could not connect: ${e.message}`; }
};
$('btn-copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('host-code').value); toast('Code copied.'); }
  catch (_) { $('host-code').select(); toast('Code selected — copy it manually.'); }
};
$('btn-vr').onclick = async () => {
  if (state.mode === 'lobby') $('btn-practice').click();
  try {
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'dom-overlay'],
      domOverlay: { root: $('hud') },
    });
    renderer.xr.setSession(session);
    toast('Welcome to the arena. Hold a trigger to draw.');
  } catch (e) {
    toast('VR session could not start. On Quest, use the Meta Quest Browser and allow VR.');
    $('lobby-error').textContent = `VR unavailable: ${e.message}`;
  }
};
$('btn-desktop').onclick = () => {
  if (state.mode === 'lobby') $('btn-practice').click();
  else $('lobby').classList.add('hidden');
};

// Desktop input
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) startDesktopDraw(e); });
window.addEventListener('mousemove', (e) => {
  if (desktopHand.drawing) { const p = groundPointFromMouse(e); if (p) desktopHand.stroke.add(p); }
  if (e.buttons === 2) { yaw -= e.movementX * 0.003; pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.003, -1.2, 1.2); }
});
window.addEventListener('mouseup', endDesktopDraw);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.xr.addEventListener('sessionstart', () => { camera.position.set(0, 0, 0); });
renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, 1.6, 0); });

// ---------------- AI opponent (practice mode) ----------------
function aiTick(dt) {
  if (state.mode !== 'practice' || state.roundOver) return;
  const t = performance.now() / 1000;
  foeGroup.position.set(Math.sin(t * 0.3) * 3, 0, SPAWN_DIST);
  foeGroup.rotation.y = Math.PI; // face the player
  state.aiTimer -= dt; state.aiWardTimer -= dt;
  if (state.aiWardTimer <= 0) {
    state.aiWardTimer = 18 + Math.random() * 8;
    if (!wards.find((w) => w.owner === 1)) {
      const c = foeGroup.position.clone();
      const pts = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push(new THREE.Vector3(c.x + Math.cos(a) * 2.6, 0.03, c.z + Math.sin(a) * 2.6)); }
      spawnWard(1, c, 2.6, uid(), false);
    }
  }
  if (state.aiTimer <= 0) {
    state.aiTimer = 6 + Math.random() * 4;
    if (chalklings.filter((c) => c.owner === 1).length < 3) {
      const base = foeGroup.position.clone(); base.z -= 2.5;
      const pts = [];
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const r = 0.55 + Math.random() * 0.35; pts.push(new THREE.Vector3(base.x + Math.cos(a) * r, 0.03, base.z + Math.sin(a) * r)); }
      spawnChalkling(1, pts, uid(), false);
      toast('The Chalk AI sends a Chalkling!');
    }
  }
}

// ---------------- Main loop ----------------
const clock = new THREE.Clock();
let hudTimer = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  // Chalk recharge
  if (!state.roundOver && state.mode !== 'lobby') {
    state.chalk[state.playerIndex] = Math.min(100, state.chalk[state.playerIndex] + 6 * dt);
  }

  // VR thumbstick locomotion
  const session = renderer.xr.getSession();
  if (session) {
    for (const src of session.inputSources) {
      if (!src.gamepad) continue;
      const axes = src.gamepad.axes;
      const x = axes[2] !== undefined ? axes[2] : axes[0] || 0;
      const y = axes[3] !== undefined ? axes[3] : axes[1] || 0;
      if (Math.abs(x) > 0.15 || Math.abs(y) > 0.15) {
        const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
        const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).negate();
        rig.position.addScaledVector(fwd, -y * 3 * dt).addScaledVector(right, x * 3 * dt);
      }
    }
    // VR drawing: keep extending the stroke from the chalk tip's ground point
    hands.forEach((hand) => {
      if (hand.drawing && hand.stroke) {
        const p = groundPointFromGrip(hand);
        if (p) hand.stroke.add(p);
      }
      // Track grip velocity for throws
      const pos = new THREE.Vector3(); hand.grip.getWorldPosition(pos);
      if (hand.held) {
        hand.held.group.position.copy(pos);
        hand.held.pos.set(pos.x, 0, pos.z);
      }
      hand.gripVel.copy(pos).sub(hand.lastGripPos).divideScalar(Math.max(dt, 0.001));
      hand.lastGripPos.copy(pos);
    });
  }

  // Desktop locomotion
  if (!session && state.mode !== 'lobby') {
    if (keys['q']) yaw += 1.8 * dt;
    if (keys['e']) yaw -= 1.8 * dt;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).negate();
    const speed = 3.5;
    if (keys['w']) rig.position.addScaledVector(fwd, speed * dt);
    if (keys['s']) rig.position.addScaledVector(fwd, -speed * dt);
    if (keys['a']) rig.position.addScaledVector(right, -speed * dt);
    if (keys['d']) rig.position.addScaledVector(right, speed * dt);
    rig.rotation.y = yaw;
    camera.rotation.x = pitch;
  }
  // Stay in the arena
  const rr = Math.hypot(rig.position.x, rig.position.z);
  if (rr > ARENA_RADIUS) { rig.position.x *= ARENA_RADIUS / rr; rig.position.z *= ARENA_RADIUS / rr; }

  aiTick(dt);

  // Chalklings: local ones simulate, remote ones interpolate to network pos
  [...chalklings].forEach((c) => {
    if (c.isRemote) {
      c.group.position.x += (c.pos.x - c.group.position.x) * Math.min(1, dt * 8);
      c.group.position.z += (c.pos.z - c.group.position.z) * Math.min(1, dt * 8);
      c.group.rotation.y += Math.sin(time * 7 + c.phase) * 0.01;
    } else {
      updateChalkling(c, dt, time);
    }
  });

  // Opponent pose interpolation (duel mode)
  if (state.mode === 'duel' && foePoseTarget) {
    foeGroup.position.lerp(foePoseTarget, Math.min(1, dt * 10));
  }

  // Broadcast pose + your Chalklings' positions (duel mode)
  state.poseTimer -= dt;
  if (state.mode === 'duel' && state.poseTimer <= 0) {
    state.poseTimer = 0.1;
    const hp = new THREE.Vector3(), hq = new THREE.Quaternion();
    camera.getWorldQuaternion(hq);
    const cs = hands.map((h) => { h.grip.getWorldPosition(hp); return [hp.x, hp.y, hp.z]; });
    send({ t: 'pose', p: [rig.position.x, rig.position.y, rig.position.z], h: [hq.x, hq.y, hq.z, hq.w], c: cs });
    chalklings.filter((c) => c.owner === state.playerIndex && !c.held).forEach((c) => {
      send({ t: 'chalklingPos', id: c.id, p: [c.pos.x, c.pos.z] });
    });
  }

  hudTimer -= dt;
  if (hudTimer <= 0) { hudTimer = 0.25; updateHUD(); }

  renderer.render(scene, camera);
});

updateHUD();
setStatus('Choose Practice, or Host / Join for a 2-player duel.');
