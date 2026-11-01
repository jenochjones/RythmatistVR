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
  aiDefenseTimer: 4,
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

// No circles are shown when the game first starts — no arena ring and no
// starting circles. Circles only appear later, as Lines of Warding you draw.
function ring(radius, color, opacity = 0.9) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.12, radius, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02;
  return m;
}
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
const board = makeBoard('Hold a trigger: your controller becomes chalk\nDraw on the ground, tip within 6 inches\nLift the chalk for 3 seconds to activate');
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
  // The piece of chalk (shown while the trigger is held). It points DOWN
  // from the controller, not forward: the blunt top of the chalk sits
  // against the bottom of the controller and the writing tip sticks out
  // below it, like holding a piece of chalk in your fist to write on
  // the ground. A tip marker tracks exactly where that tip is in the world.
  const chalkMesh = new THREE.Group();
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.22, 10),
    new THREE.MeshStandardMaterial({ color: 0xf5f0dc, roughness: 1 })
  );
  stick.position.y = -0.13;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.018, 0.05, 10),
    new THREE.MeshStandardMaterial({ color: 0xf5f0dc, roughness: 1 })
  );
  tip.rotation.x = Math.PI; tip.position.y = -0.265;
  const tipMarker = new THREE.Object3D();
  tipMarker.position.y = -0.29;
  chalkMesh.add(stick, tip, tipMarker);
  chalkMesh.visible = false;
  grip.add(ctrlMesh, chalkMesh);
  const hand = {
    index: i, grip, controller, ctrlMesh, chalkMesh, tipMarker,
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

const MAX_DRAW_HEIGHT = 0.1524; // 6 inches, in metres
function groundPointFromGrip(hand) {
  // Draw from the chalk tip itself, straight down to the ground — and only
  // when that tip is within 6 inches of the ground. Hold the controller
  // high and nothing is drawn, however hard you hold the trigger.
  if (!hand.tipMarker) return null;
  const tip = new THREE.Vector3();
  hand.tipMarker.getWorldPosition(tip);
  if (tip.y > MAX_DRAW_HEIGHT || tip.y < -0.05) return null;
  if (Math.hypot(tip.x, tip.z) > ARENA_RADIUS) return null;
  return new THREE.Vector3(tip.x, 0.03, tip.z);
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
      const perp = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(0.018); // thin chalk line: ~3.6 cm wide
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

// Drawings do not activate the moment you lift the chalk. They sit as
// plain white chalk until the chalk has been lifted continuously for
// 3 seconds — only then do they come alive (gold, see below). Picking
// the chalk up again before those 3 seconds are up restarts the count,
// so a batch of drawings activates together on the next clean lift.
const ACTIVATION_LIFT_SECONDS = 3;
const pendingStrokes = []; // {stroke, owner, liftedSeconds}
function queueStroke(stroke, owner) {
  if (!stroke || stroke.pts.length < 2) { if (stroke) stroke.dispose(); return; }
  pendingStrokes.push({ stroke, owner, liftedSeconds: 0 });
  toast('Drawing set — keep the chalk lifted for 3 seconds to activate it.');
}
function resetPendingLift() {
  pendingStrokes.forEach((p) => { p.liftedSeconds = 0; });
}
function updatePendingStrokes(dt) {
  const drawingNow = hands.some((h) => h.drawing) || desktopHand.drawing;
  if (drawingNow) { resetPendingLift(); return; }
  // Oldest first, so a tether activates before the defender shape drawn
  // after it, and a Chalkling activates before the centre line drawn
  // through it (which then finds it active and sets its path).
  for (const p of [...pendingStrokes]) {
    p.liftedSeconds += dt;
    if (p.liftedSeconds >= ACTIVATION_LIFT_SECONDS) {
      pendingStrokes.splice(pendingStrokes.indexOf(p), 1);
      classifyStroke(p.stroke, p.owner, true, p.path || null);
    }
  }
}
function clearPendingStrokes() {
  pendingStrokes.forEach((p) => p.stroke.dispose());
  pendingStrokes.length = 0;
}
function startDraw(handIndex) {
  const hand = hands[handIndex];
  if (hand.drawing) return;
  resetPendingLift();
  hand.drawing = true;
  hand.stroke = new Ribbon(COLOR_HEX[state.playerIndex]);
}
function endDraw(handIndex) {
  const hand = hands[handIndex];
  if (!hand.drawing || !hand.stroke) return;
  hand.drawing = false;
  queueStroke(hand.stroke, state.playerIndex);
  hand.stroke = null;
}
function startDesktopDraw(e) {
  if (state.mode === 'lobby') return;
  const p = groundPointFromMouse(e);
  if (!p) return;
  resetPendingLift();
  desktopHand.drawing = true;
  desktopHand.stroke = new Ribbon(COLOR_HEX[state.playerIndex]);
  desktopHand.stroke.add(p);
}
function endDesktopDraw() {
  if (!desktopHand.drawing || !desktopHand.stroke) return;
  desktopHand.drawing = false;
  queueStroke(desktopHand.stroke, state.playerIndex);
  desktopHand.stroke = null;
}

// ---------------- Game entities ----------------
const chalklings = []; // {id, owner, pts, pos, group, scale, speed, dps, budget, path, phase, held, thrown, vel, hitCooldown, isRemote}
const defenses = [];   // {id, owner, pts, centroid, health, maxHealth, circularity, isInitial, group, disc}
const defenders = [];  // {id, owner, pts, pos, homePos, anchor, tetherLength, speed, dps, health, maxHealth, group, tether, phase, isRemote}
const tethers = [];    // {id, owner, anchor, end, length, line, defenderId}
const walls = [];      // {id, owner, a, b, health, mesh}
const dynamicGroup = new THREE.Group(); scene.add(dynamicGroup);

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

// ---------------- Shape geometry: circularity, aspect, complexity ----------------
// All strength in this game comes from the drawing itself, not from a menu:
// a circle is strongest, a straight line is fastest and weakest, and a
// complex shape hits harder and lasts longer than a simple one.
function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return Math.abs(a) / 2;
}
function polygonPerimeter(pts) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) p += pts[i].distanceTo(pts[(i + 1) % pts.length]);
  return p;
}
function circularityOf(pts) {
  const per = polygonPerimeter(pts);
  if (per < 0.01) return 0;
  return THREE.MathUtils.clamp((4 * Math.PI * polygonArea(pts)) / (per * per), 0, 1);
}
function pointInPolygon(pt, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, zi = pts[i].z, xj = pts[j].x, zj = pts[j].z;
    if (((zi > pt.z) !== (zj > pt.z)) && (pt.x < ((xj - xi) * (pt.z - zi)) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
function distToPolygon(pt, pts) {
  let best = Infinity, bestSeg = 0;
  for (let i = 0; i < pts.length; i++) {
    const d = distToSegment(pt, pts[i], pts[(i + 1) % pts.length]);
    if (d < best) { best = d; bestSeg = i; }
  }
  return { dist: best, seg: bestSeg };
}
function pointOnPolygon(pts, segFloat) {
  const n = pts.length;
  let seg = Math.floor(segFloat) % n;
  if (seg < 0) seg += n;
  const f = segFloat - Math.floor(segFloat);
  const a = pts[seg], b = pts[(seg + 1) % n];
  return new THREE.Vector3().lerpVectors(a, b, f);
}
function cornerStrengthAt(pts, vertexIndex) {
  const n = pts.length;
  const prev = pts[(vertexIndex - 1 + n) % n], cur = pts[vertexIndex], next = pts[(vertexIndex + 1) % n];
  const v1 = new THREE.Vector3().subVectors(cur, prev); v1.y = 0;
  const v2 = new THREE.Vector3().subVectors(next, cur); v2.y = 0;
  if (v1.lengthSq() < 1e-6 || v2.lengthSq() < 1e-6) return 0;
  const angle = v1.angleTo(v2);
  return THREE.MathUtils.clamp((angle - 0.35) / 1.2, 0, 1);
}
function shapeStats(pts, isLine) {
  if (isLine) {
    const len = pts.reduce((s, p, i) => s + (i ? p.distanceTo(pts[i - 1]) : 0), 0);
    return { circularity: 0, complexity: 0, aspect: Math.max(1, len / 0.1), length: len, width: 0.1, speed: 3.4, dps: 10, budget: 100 };
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  pts.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
  const w = Math.max(0.1, maxX - minX), h = Math.max(0.1, maxZ - minZ);
  const major = Math.max(w, h), minor = Math.min(w, h);
  const aspect = major / minor;
  const circ = circularityOf(pts);
  let corners = 0;
  for (let i = 0; i < pts.length; i++) if (cornerStrengthAt(pts, i) > 0.4) corners++;
  const complexity = THREE.MathUtils.clamp(corners / 12, 0, 1);
  const speed = THREE.MathUtils.clamp(0.55 + (aspect - 1) * 0.32, 0.55, 3.4);
  const dps = 10 + circ * 70 + complexity * 30;
  const budget = 100 + circ * 700 + complexity * 300;
  return { circularity: circ, complexity, aspect, length: major, width: minor, speed, dps, budget };
}
function statsText(kind, s) {
  return `${kind}: speed ${s.speed.toFixed(1)} m/s, ${s.dps.toFixed(0)} damage/s, lasts ${s.budget.toFixed(0)} damage, circularity ${(s.circularity * 100).toFixed(0)}%, complexity ${(s.complexity * 100).toFixed(0)}%`;
}
function shapesTouch(aPts, bPts, maxGap = 0.5) {
  for (const p of aPts) if (distToPolygon(p, bPts).dist < maxGap) return true;
  for (const p of bPts) if (distToPolygon(p, aPts).dist < maxGap) return true;
  return false;
}
function initialDefenseOf(owner) { return defenses.find((d) => d.owner === owner && d.isInitial); }

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

const GOLD = 0xffd700; // active drawings glow gold, whatever their owner
function goldOutline(pts, centroid, owner) {
  const outlinePts = pts.map((p) => new THREE.Vector3(p.x - centroid.x, 0.06, p.z - centroid.z));
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(outlinePts),
    new THREE.LineBasicMaterial({ color: COLORS[owner] })
  );
}
function addEyes(group) {
  [-0.12, 0.12].forEach((dx) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(dx, 0.14, 0.3); group.add(eye);
  });
}
function spawnChalkling(owner, pts, opts = {}) {
  const id = opts.id || uid(), broadcast = opts.broadcast !== false, isLine = !!opts.isLine;
  const mine = chalklings.filter((c) => c.owner === owner).length;
  if (mine >= 5) { toast('Too many Chalklings — wait for one to fall.'); return null; }
  const stats = opts.stats || shapeStats(pts, isLine);
  const centroid = new THREE.Vector3();
  pts.forEach((p) => centroid.add(p)); centroid.multiplyScalar(1 / pts.length);
  const group = new THREE.Group();
  if (isLine) {
    const linePts = pts.map((p) => new THREE.Vector3(p.x - centroid.x, 0.06, p.z - centroid.z));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: GOLD })));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), new THREE.MeshBasicMaterial({ color: GOLD }));
    head.position.copy(linePts[linePts.length - 1]); group.add(head);
  } else {
    const { mesh } = shapeMeshFromPts(pts, GOLD);
    group.add(mesh, goldOutline(pts, centroid, owner));
    addEyes(group);
  }
  group.position.copy(centroid); group.position.y = 0;
  dynamicGroup.add(group);
  const maxR = Math.max(...pts.map((p) => Math.hypot(p.x - centroid.x, p.z - centroid.z)));
  const scale = THREE.MathUtils.clamp(0.5 + maxR * 0.35, 0.5, 1.25);
  group.scale.setScalar(scale);
  const ent = {
    id, owner, pts, pos: centroid.clone(), group, scale, stats,
    speed: stats.speed, dps: stats.dps, budget: stats.budget, maxBudget: stats.budget,
    path: opts.path || null, pathSeg: 0, pathDist: 0, perimeterT: 0, perimeterDir: 1,
    defenseDamageAccum: 0, defenseDamageTimer: 0, hitCooldown: 0,
    phase: Math.random() * Math.PI * 2, held: false, thrown: false,
    vel: new THREE.Vector3(), isRemote: false,
  };
  chalklings.push(ent);
  if (broadcast && state.mode === 'duel' && owner === state.playerIndex) {
    send({ t: 'spawn', kind: 'chalkling', id, owner, pts: pts.map((p) => [p.x, p.z]), isLine, stats, path: ent.path ? ent.path.map((p) => [p.x, p.z]) : null });
  }
  return ent;
}
function removeChalkling(c, sendMsg = true) {
  dynamicGroup.remove(c.group); chalklings.splice(chalklings.indexOf(c), 1);
  if (sendMsg && state.mode === 'duel') send({ t: 'remove', kind: 'chalkling', id: c.id });
}

function spawnDefensePiece(owner, pts, isInitial, opts = {}) {
  const id = opts.id || uid(), broadcast = opts.broadcast !== false;
  const circ = opts.circularity !== undefined ? opts.circularity : circularityOf(pts);
  const health = opts.health !== undefined ? opts.health : (isInitial ? 300 + circ * 700 : 200 + circ * 600);
  const centroid = new THREE.Vector3();
  pts.forEach((p) => centroid.add(p)); centroid.multiplyScalar(1 / pts.length);
  const { mesh } = shapeMeshFromPts(pts, GOLD);
  mesh.material = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.add(mesh, goldOutline(pts, centroid, owner));
  group.position.copy(centroid); group.position.y = 0;
  dynamicGroup.add(group);
  const ent = { id, owner, pts: pts.map((p) => p.clone()), centroid: centroid.clone(), health, maxHealth: health, circularity: circ, isInitial, group, disc: mesh };
  defenses.push(ent);
  if (broadcast && state.mode === 'duel' && owner === state.playerIndex) {
    send({ t: 'spawn', kind: 'defense', id, owner, pts: pts.map((p) => [p.x, p.z]), isInitial, health, circularity: circ });
  }
  return ent;
}
function removeDefensePiece(d, sendMsg = true) {
  dynamicGroup.remove(d.group); defenses.splice(defenses.indexOf(d), 1);
  if (sendMsg && state.mode === 'duel') send({ t: 'remove', kind: 'defense', id: d.id });
  if (d.isInitial) {
    // The initial defense anchors everything attached to it.
    [...defenses].filter((x) => x.owner === d.owner && !x.isInitial).forEach((x) => removeDefensePiece(x, sendMsg));
    [...defenders].filter((x) => x.owner === d.owner).forEach((x) => removeDefender(x, sendMsg));
    [...tethers].filter((x) => x.owner === d.owner).forEach((x) => removeTether(x, sendMsg));
  }
}

function spawnTether(owner, anchor, end, opts = {}) {
  const id = opts.id || uid(), broadcast = opts.broadcast !== false;
  const geo = new THREE.BufferGeometry().setFromPoints([anchor.clone(), end.clone()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9 }));
  line.position.y = 0.05;
  dynamicGroup.add(line);
  const ent = { id, owner, anchor: anchor.clone(), end: end.clone(), length: anchor.distanceTo(end), line, defenderId: null };
  tethers.push(ent);
  if (broadcast && state.mode === 'duel' && owner === state.playerIndex) {
    send({ t: 'spawn', kind: 'tether', id, owner, anchor: [anchor.x, anchor.z], end: [end.x, end.z] });
  }
  return ent;
}
function removeTether(t, sendMsg = true) {
  dynamicGroup.remove(t.line); tethers.splice(tethers.indexOf(t), 1);
  if (sendMsg && state.mode === 'duel') send({ t: 'remove', kind: 'tether', id: t.id });
}
function updateTetherLine(t, defenderPos) {
  const geo = new THREE.BufferGeometry().setFromPoints([t.anchor.clone(), defenderPos.clone()]);
  t.line.geometry.dispose(); t.line.geometry = geo;
}

function spawnDefender(owner, pts, tether, opts = {}) {
  const id = opts.id || uid(), broadcast = opts.broadcast !== false;
  const stats = opts.stats || shapeStats(pts, false);
  const centroid = new THREE.Vector3();
  pts.forEach((p) => centroid.add(p)); centroid.multiplyScalar(1 / pts.length);
  const { mesh } = shapeMeshFromPts(pts, GOLD);
  const group = new THREE.Group();
  group.add(mesh, goldOutline(pts, centroid, owner));
  addEyes(group);
  group.position.copy(centroid); group.position.y = 0;
  dynamicGroup.add(group);
  const maxR = Math.max(...pts.map((p) => Math.hypot(p.x - centroid.x, p.z - centroid.z)));
  const scale = THREE.MathUtils.clamp(0.5 + maxR * 0.35, 0.5, 1.25);
  group.scale.setScalar(scale);
  const health = 100 + stats.circularity * 400 + stats.complexity * 200;
  const ent = {
    id, owner, pts, pos: centroid.clone(), homePos: centroid.clone(),
    anchor: tether.anchor.clone(), tetherLength: tether.length, tetherId: tether.id,
    speed: stats.speed, dps: stats.dps, health, maxHealth: health, stats,
    group, scale, phase: Math.random() * Math.PI * 2, isRemote: false, damageAccum: 0, damageTimer: 0,
  };
  defenders.push(ent);
  tether.defenderId = id;
  if (broadcast && state.mode === 'duel' && owner === state.playerIndex) {
    send({ t: 'spawn', kind: 'defender', id, owner, pts: pts.map((p) => [p.x, p.z]), anchor: [tether.anchor.x, tether.anchor.z], tetherLength: tether.length, stats });
  }
  return ent;
}
function removeDefender(d, sendMsg = true) {
  dynamicGroup.remove(d.group); defenders.splice(defenders.indexOf(d), 1);
  const t = tethers.find((x) => x.id === d.tetherId);
  if (t) t.defenderId = null;
  if (sendMsg && state.mode === 'duel') send({ t: 'remove', kind: 'defender', id: d.id });
}

function spawnWall(owner, a, b, id = uid(), broadcast = true) {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(len, 0.9, 0.16),
    new THREE.MeshStandardMaterial({ color: GOLD, emissive: 0xffaa00, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 })
  );
  mesh.position.set((a.x + b.x) / 2, 0.45, (a.z + b.z) / 2);
  mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  dynamicGroup.add(mesh);
  const ent = { id, owner, a: a.clone(), b: b.clone(), health: 200, mesh };
  walls.push(ent);
  if (broadcast && state.mode === 'duel' && owner === state.playerIndex) send({ t: 'spawn', kind: 'wall', id, owner, a: [a.x, a.z], b: [b.x, b.z] });
  return ent;
}
function removeWall(w) { dynamicGroup.remove(w.mesh); walls.splice(walls.indexOf(w), 1); if (state.mode === 'duel') send({ t: 'remove', kind: 'wall', id: w.id }); }

function makeScaledPath(linePts, spawnPos, targetPos) {
  const start = linePts[0], end = linePts[linePts.length - 1];
  const lineDist = start.distanceTo(end);
  if (lineDist < 0.5) return null;
  const scale = spawnPos.distanceTo(targetPos) / lineDist;
  return linePts.map((p) => new THREE.Vector3().subVectors(p, start).multiplyScalar(scale));
}
function tryAssignPath(owner, linePts) {
  // A centre line drawn down a Chalkling: the Chalkling follows that line,
  // scaled up so it fits between the two players.
  const targetPos = owner === state.playerIndex ? foePos() : rig.position;
  for (const c of chalklings) {
    if (c.owner !== owner || c.isLine) continue;
    const start = linePts[0];
    if (pointInPolygon(start, c.pts) || distToPolygon(start, c.pts).dist < 0.5) {
      const path = makeScaledPath(linePts, c.pos, targetPos);
      if (!path) return false;
      c.path = path; c.pathSeg = 0; c.pathDist = 0; c.spawnPos = c.pos.clone();
      if (state.mode === 'duel' && owner === state.playerIndex) send({ t: 'path', id: c.id, path: path.map((p) => [p.x, p.z]) });
      toast('Centre line set — that Chalkling will follow it.');
      return true;
    }
  }
  for (const p of pendingStrokes) {
    if (p.owner !== owner || !p.stroke.closed) continue;
    const start = linePts[0];
    if (pointInPolygon(start, p.stroke.pts) || distToPolygon(start, p.stroke.pts).dist < 0.5) {
      const spawnPos = p.stroke.centroid;
      const path = makeScaledPath(linePts, spawnPos, targetPos);
      if (!path) return false;
      p.path = path;
      toast('Centre line set — that Chalkling will follow it once it activates.');
      return true;
    }
  }
  return false;
}
function classifyStroke(stroke, owner, broadcast, presetPath = null) {
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
  const foeP = owner === state.playerIndex ? foePos() : rig.position;

  if (stroke.closed) {
    // 1) The first defense: a closed shape drawn all the way around yourself.
    if (!initialDefenseOf(owner) && pointInPolygon(myPos, pts)) {
      const ent = spawnDefensePiece(owner, pts, true, { broadcast });
      stroke.dispose();
      toast(owner === state.playerIndex ? `Initial defense raised! ${statsText('Defense', { ...shapeStats(pts, false), dps: 0, budget: ent.maxHealth })} — health ${ent.maxHealth.toFixed(0)}.` : 'Your foe raised an initial defense.');
      return;
    }
    // 2) A shape at the end of a tether: a tethered defender.
    const tether = tethers.find((t) => t.owner === owner && !t.defenderId && (centroid.distanceTo(t.end) < 1.2 || distToPolygon(t.end, pts).dist < 0.5));
    if (tether) {
      const ent = spawnDefender(owner, pts, tether, { broadcast });
      stroke.dispose();
      toast(owner === state.playerIndex ? `Tethered defender raised! It can roam ${tether.length.toFixed(1)} m from your defense. ${statsText('Defender', ent.stats)}` : 'Your foe raised a tethered defender.');
      return;
    }
    // 3) A shape attached to an existing defense: a defense extension.
    const attached = defenses.find((d) => d.owner === owner && shapesTouch(pts, d.pts));
    if (attached) {
      const ent = spawnDefensePiece(owner, pts, false, { broadcast });
      stroke.dispose();
      toast(owner === state.playerIndex ? `Defense extended! Health ${ent.maxHealth.toFixed(0)} (circularity ${(ent.circularity * 100).toFixed(0)}%).` : 'Your foe extended a defense.');
      return;
    }
    // 4) Anything closed and not attached is a Chalkling.
    const ent = spawnChalkling(owner, pts, { broadcast, path: presetPath });
    if (!ent) { stroke.dispose(); return; }
    stroke.dispose();
    toast(owner === state.playerIndex ? `A Chalkling stirs! ${statsText('Chalkling', ent.stats)}` : 'A foe Chalkling is on its way!');
    return;
  }
  // Lines, in order: centre line, tether, straight dart, wall.
  const a = pts[0], b = pts[pts.length - 1];
  let maxDev = 0;
  pts.forEach((p) => {
    const t = THREE.MathUtils.clamp(((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / Math.max(1e-6, a.distanceToSquared(b)), 0, 1);
    const closest = new THREE.Vector3().lerpVectors(a, b, t);
    maxDev = Math.max(maxDev, p.distanceTo(closest));
  });
  if (tryAssignPath(owner, pts)) { stroke.dispose(); return; }
  const initial = initialDefenseOf(owner);
  if (initial && (distToPolygon(a, initial.pts).dist < 0.6 || pointInPolygon(a, initial.pts))) {
    // A string/chain from your initial defense: a tether. Draw a closed
    // shape near its far end next and it becomes a tethered defender.
    let anchor = initial.pts[0], best = Infinity;
    initial.pts.forEach((p) => { const d = p.distanceTo(a); if (d < best) { best = d; anchor = p; } });
    spawnTether(owner, anchor, b, { broadcast });
    stroke.dispose();
    toast(owner === state.playerIndex ? 'Tether drawn — now draw a closed shape near its far end to make a defender.' : 'Your foe drew a tether.');
    return;
  }
  const dir = new THREE.Vector3().subVectors(b, a); dir.y = 0;
  const dirLen = dir.length();
  if (dirLen > 0.01) {
    dir.normalize();
    const toFoe = new THREE.Vector3().subVectors(foeP, a); toFoe.y = 0; toFoe.normalize();
    if (stroke.length > 1 && maxDev < 0.6 && dir.dot(toFoe) > 0.6) {
      // A straight line pointed at the foe: a fast, very weak dart Chalkling.
      const ent = spawnChalkling(owner, pts, { broadcast, isLine: true });
      if (!ent) { stroke.dispose(); return; }
      stroke.dispose();
      toast(owner === state.playerIndex ? `Straight dart sent! ${statsText('Dart', ent.stats)} — 100 hits to break a perfect circle.` : 'A foe dart is racing at you!');
      return;
    }
  }
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
  [...defenses].forEach((d) => { dynamicGroup.remove(d.group); defenses.splice(defenses.indexOf(d), 1); });
  [...defenders].forEach((d) => { dynamicGroup.remove(d.group); defenders.splice(defenders.indexOf(d), 1); });
  [...tethers].forEach((t) => { dynamicGroup.remove(t.line); tethers.splice(tethers.indexOf(t), 1); });
  [...walls].forEach((w) => { dynamicGroup.remove(w.mesh); walls.splice(walls.indexOf(w), 1); });
  clearPendingStrokes();
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

function damageDefensePiece(c, d, dmg, dt) {
  d.health -= dmg;
  if (d.disc && d.disc.material) d.disc.material.opacity = Math.max(0.02, 0.18 * Math.max(0, d.health) / d.maxHealth);
  c.budget -= dmg;
  c.defenseDamageAccum += dmg; c.defenseDamageTimer += dt;
  if (state.mode === 'duel' && c.owner === state.playerIndex && c.defenseDamageTimer >= 0.5) {
    send({ t: 'defenseDamage', id: d.id, amount: c.defenseDamageAccum });
    c.defenseDamageAccum = 0; c.defenseDamageTimer = 0;
  }
  if (c.budget <= 0) { removeChalkling(c, true); return 'gone'; }
  if (d.health <= 0) { removeDefensePiece(d, true); return 'broken'; }
  return 'attacking';
}
function updateChalkling(c, dt, time) {
  if (c.held) return;
  if (c.thrown) {
    c.vel.y -= 9.8 * dt;
    c.group.position.addScaledVector(c.vel, dt);
    c.pos.set(c.group.position.x, 0, c.group.position.z);
    if (c.group.position.y <= 0) {
      c.group.position.y = 0; c.thrown = false;
      c.speed *= 1.4;
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
  for (const w of walls.filter((x) => x.owner === targetIndex)) {
    if (distToSegment(c.pos, w.a, w.b) < 0.6) {
      w.health -= c.dps * dt; c.budget -= c.dps * dt;
      c.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(time * 10 + c.phase) * 0.2;
      if (c.budget <= 0) { removeChalkling(c, true); return; }
      if (w.health <= 0) removeWall(w);
      return;
    }
  }
  // Blocked by a foe defense piece? Meander along its perimeter, erasing it.
  // A perfect circle has no corners, so the Chalkling just keeps doing
  // slight damage all the way around; a corner or dip takes extra damage.
  for (const d of defenses.filter((x) => x.owner === targetIndex)) {
    const near = distToPolygon(c.pos, d.pts);
    if (near.dist < 0.6 || pointInPolygon(c.pos, d.pts)) {
      if (c.perimeterT === undefined || c.attackingDefense !== d.id) { c.perimeterT = near.seg; c.attackingDefense = d.id; }
      const vertex = Math.round(c.perimeterT) % d.pts.length;
      const corner = cornerStrengthAt(d.pts, vertex);
      const mult = corner > 0.4 ? 1.5 : 1.0;
      const dmg = c.dps * mult * dt;
      const result = damageDefensePiece(c, d, dmg, dt);
      if (result !== 'attacking') return;
      // Walk along the perimeter.
      const segLen = d.pts[c.perimeterT % d.pts.length].distanceTo(d.pts[(c.perimeterT + 1) % d.pts.length]) || 1;
      c.perimeterT = (c.perimeterT + (c.speed * 0.5 * dt) / segLen) % d.pts.length;
      const onPer = pointOnPolygon(d.pts, c.perimeterT);
      c.pos.set(onPer.x, 0, onPer.z);
      c.group.position.set(onPer.x, Math.abs(Math.sin(time * 7 + c.phase)) * 0.06, onPer.z);
      c.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(time * 7 + c.phase) * 0.25;
      return;
    }
  }
  c.attackingDefense = null;
  // Blocked by a foe tethered defender? Fight it.
  for (const def of defenders.filter((x) => x.owner === targetIndex)) {
    if (def.pos.distanceTo(c.pos) < 1.5) {
      def.health -= c.dps * 0.5 * dt;
      c.defenderDamageAccum = (c.defenderDamageAccum || 0) + c.dps * 0.5 * dt;
      c.defenderDamageTimer = (c.defenderDamageTimer || 0) + dt;
      if (state.mode === 'duel' && c.owner === state.playerIndex && c.defenderDamageTimer >= 0.5) {
        send({ t: 'defenderDamage', id: def.id, amount: c.defenderDamageAccum });
        c.defenderDamageAccum = 0; c.defenderDamageTimer = 0;
      }
      if (def.health <= 0) removeDefender(def, true);
      c.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(time * 10 + c.phase) * 0.2;
      return;
    }
  }
  // Reached the foe? Hit once a second, degrading as it deals damage.
  if (dist < 1.3) {
    c.hitCooldown -= dt;
    if (c.hitCooldown <= 0) {
      c.hitCooldown = 1.0;
      if (c.owner === state.playerIndex || state.mode === 'practice') {
        applyDamage(targetIndex, c.dps);
        if (state.mode === 'duel' && targetIndex !== state.playerIndex) send({ t: 'damage', target: targetIndex, amount: c.dps });
      }
      c.budget -= c.dps;
      if (c.budget <= 0) removeChalkling(c, true);
    }
    return;
  }
  // Centre-line path: follow the scaled line, then fall back to meandering.
  if (c.path && c.path.length > 1) {
    if (!c.spawnPos) c.spawnPos = c.pos.clone();
    let remaining = c.speed * dt;
    while (remaining > 0 && c.pathSeg < c.path.length - 1) {
      const a = c.path[c.pathSeg], b = c.path[c.pathSeg + 1];
      const segLen = a.distanceTo(b) || 0.001;
      const avail = segLen - c.pathDist;
      if (remaining < avail) { c.pathDist += remaining; remaining = 0; }
      else { remaining -= avail; c.pathSeg++; c.pathDist = 0; }
    }
    if (c.pathSeg >= c.path.length - 1) {
      c.path = null;
    } else {
      const a = c.path[c.pathSeg], b = c.path[c.pathSeg + 1];
      const off = new THREE.Vector3().lerpVectors(a, b, c.pathDist / (a.distanceTo(b) || 0.001));
      c.pos.set(c.spawnPos.x + off.x, 0, c.spawnPos.z + off.z);
      if (Math.hypot(c.pos.x, c.pos.z) > ARENA_RADIUS) { c.pos.x *= ARENA_RADIUS / Math.hypot(c.pos.x, c.pos.z); c.pos.z *= ARENA_RADIUS / Math.hypot(c.pos.x, c.pos.z); }
      c.group.position.set(c.pos.x, Math.abs(Math.sin(time * 7 + c.phase)) * 0.06, c.pos.z);
      c.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(time * 7 + c.phase) * 0.25;
      return;
    }
  }
  // No centre line: meander generally toward the foe.
  const perp = new THREE.Vector3(-dir.z, 0, dir.x);
  const wiggle = Math.sin(time * 7 + c.phase) * 0.35;
  const meander = Math.sin(time * 0.8 + c.phase) * 0.35;
  c.pos.addScaledVector(dir, c.speed * dt);
  c.pos.addScaledVector(perp, meander * c.speed * dt * 0.5);
  c.group.position.set(c.pos.x + perp.x * wiggle * 0.35, Math.abs(Math.sin(time * 7 + c.phase)) * 0.06, c.pos.z + perp.z * wiggle * 0.35);
  c.group.rotation.y = Math.atan2(dir.x, dir.z) + Math.sin(time * 7 + c.phase) * 0.25;
  c.group.scale.setScalar(c.scale * (1 + Math.sin(time * 9 + c.phase) * 0.04));
}
function updateDefender(d, dt, time) {
  if (d.isRemote) return;
  const enemies = chalklings.filter((c) => c.owner !== d.owner && !c.held);
  let target = null, best = Infinity;
  enemies.forEach((c) => { const dist = c.pos.distanceTo(d.pos); if (dist < best) { best = dist; target = c; } });
  let moveTarget = d.homePos, attacking = false;
  if (target && target.pos.distanceTo(d.anchor) <= d.tetherLength + 1.5) {
    moveTarget = target.pos;
    if (best < 1.5) attacking = true;
  }
  const toMove = new THREE.Vector3().subVectors(moveTarget, d.pos); toMove.y = 0;
  const moveDist = toMove.length();
  if (moveDist > 0.1) {
    toMove.normalize();
    d.pos.addScaledVector(toMove, Math.min(moveDist, d.speed * dt));
    // Cannot move further than the tether allows.
    const fromAnchor = new THREE.Vector3().subVectors(d.pos, d.anchor); fromAnchor.y = 0;
    if (fromAnchor.length() > d.tetherLength) d.pos.copy(d.anchor).addScaledVector(fromAnchor.normalize(), d.tetherLength);
    d.group.rotation.y = Math.atan2(toMove.x, toMove.z);
  }
  d.group.position.set(d.pos.x, Math.abs(Math.sin(time * 7 + d.phase)) * 0.06, d.pos.z);
  const t = tethers.find((x) => x.id === d.tetherId);
  if (t) updateTetherLine(t, d.pos);
  if (attacking && target) {
    const dmg = d.dps * dt;
    target.budget -= dmg;
    d.damageAccum += dmg; d.damageTimer += dt;
    if (state.mode === 'duel' && d.damageTimer >= 0.5) {
      send({ t: 'chalklingDamage', id: target.id, amount: d.damageAccum });
      d.damageAccum = 0; d.damageTimer = 0;
    }
    if (target.budget <= 0) removeChalkling(target, true);
  }
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
      const path = msg.path ? msg.path.map((p) => new THREE.Vector3(p[0], 0, p[1])) : null;
      const ent = spawnChalkling(msg.owner, msg.pts.map(toVec), { id: msg.id, broadcast: false, isLine: msg.isLine, stats: msg.stats, path });
      if (ent) { ent.isRemote = true; if (path) ent.spawnPos = ent.pos.clone(); }
    } else if (msg.kind === 'defense') {
      spawnDefensePiece(msg.owner, msg.pts.map(toVec), msg.isInitial, { id: msg.id, broadcast: false, health: msg.health, circularity: msg.circularity });
    } else if (msg.kind === 'tether') {
      spawnTether(msg.owner, toVec(msg.anchor), toVec(msg.end), { id: msg.id, broadcast: false });
    } else if (msg.kind === 'defender') {
      const fakeTether = { anchor: toVec(msg.anchor), length: msg.tetherLength, id: `remote-${msg.id}` };
      const ent = spawnDefender(msg.owner, msg.pts.map(toVec), fakeTether, { id: msg.id, broadcast: false, stats: msg.stats });
      if (ent) { ent.isRemote = true; ent.tetherId = fakeTether.id; }
      // The real tether line arrives separately; keep this defender's chain
      // in sync by pointing it at the matching tether when it arrives.
      const real = tethers.find((t) => t.owner === msg.owner && !t.defenderId && t.anchor.distanceTo(toVec(msg.anchor)) < 0.5);
      if (real && ent) { ent.tetherId = real.id; real.defenderId = ent.id; }
    } else if (msg.kind === 'wall') spawnWall(msg.owner, toVec(msg.a), toVec(msg.b), msg.id, false);
  } else if (msg.t === 'path') {
    const c = chalklings.find((x) => x.id === msg.id);
    if (c) { c.path = msg.path.map((p) => new THREE.Vector3(p[0], 0, p[1])); c.pathSeg = 0; c.pathDist = 0; c.spawnPos = c.pos.clone(); }
  } else if (msg.t === 'defenseDamage') {
    const d = defenses.find((x) => x.id === msg.id);
    if (d) {
      d.health -= msg.amount;
      if (d.disc && d.disc.material) d.disc.material.opacity = Math.max(0.02, 0.18 * Math.max(0, d.health) / d.maxHealth);
    }
  } else if (msg.t === 'chalklingDamage') {
    const c = chalklings.find((x) => x.id === msg.id);
    if (c) { c.budget -= msg.amount; if (c.budget <= 0) removeChalkling(c, false); }
  } else if (msg.t === 'defenderDamage') {
    const d = defenders.find((x) => x.id === msg.id);
    if (d) { d.health -= msg.amount; if (d.health <= 0) removeDefender(d, false); }
  } else if (msg.t === 'defenderPos') {
    const d = defenders.find((x) => x.id === msg.id);
    if (d && d.isRemote) d.pos.set(msg.p[0], 0, msg.p[1]);
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
      if (c) removeChalkling(c, false);
    } else if (msg.kind === 'defense') {
      const d = defenses.find((x) => x.id === msg.id);
      if (d) removeDefensePiece(d, false);
    } else if (msg.kind === 'defender') {
      const d = defenders.find((x) => x.id === msg.id);
      if (d) removeDefender(d, false);
    } else if (msg.kind === 'tether') {
      const t = tethers.find((x) => x.id === msg.id);
      if (t) removeTether(t, false);
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
  updateVRBar();
  resetRound();
  setStatus('Duel live — draw, defend, and send your Chalklings!');
  toast('Duel live!');
}

// ---------------- VR entry (persistent, not just in the lobby) ----------------
// The original bug: the only Enter VR button lived inside #lobby, so once a
// game started and the lobby hid, the game stayed 2D with no way into VR.
// These helpers drive both the lobby button and the always-visible corner
// bar, and retry the session without the DOM overlay if that option fails.
let xrSession = null;
function updateVRBar() {
  const bar = $('vr-bar');
  if (!bar) return;
  const lobbyHidden = $('lobby').classList.contains('hidden');
  bar.classList.toggle('hidden', !lobbyHidden);
  const inXR = !!renderer.xr.getSession();
  const enter = $('btn-vr-float'), exit = $('btn-exit-vr');
  if (enter) enter.classList.toggle('hidden', inXR);
  if (exit) exit.classList.toggle('hidden', !inXR);
}
function setVRStatus(msg) {
  const el = $('vr-status');
  if (el) el.textContent = msg || '';
}
async function enterVR() {
  if (renderer.xr.getSession()) return;
  // Still a real user gesture at this point: no await happens before this.
  if (state.mode === 'lobby') $('btn-practice').click();
  updateVRBar();
  if (!navigator.xr) {
    setVRStatus('VR is not available in this browser. Open this page in the Meta Quest Browser on a Quest headset.');
    toast('VR is not available in this browser.');
    return;
  }
  setVRStatus('Starting VR…');
  const attempts = [
    { optionalFeatures: ['local-floor', 'bounded-floor', 'dom-overlay'], domOverlay: { root: $('hud') } },
    { optionalFeatures: ['local-floor', 'bounded-floor'] },
    {},
  ];
  let lastErr = null;
  for (const opts of attempts) {
    try {
      const session = await navigator.xr.requestSession('immersive-vr', opts);
      await renderer.xr.setSession(session);
      xrSession = session;
      setVRStatus('');
      toast('Welcome to the arena. Hold a trigger to draw.');
      updateVRBar();
      return;
    } catch (e) { lastErr = e; }
  }
  const reason = lastErr && lastErr.message ? lastErr.message : 'unknown error';
  setVRStatus(`VR could not start (${reason}). On Quest, use the Meta Quest Browser over HTTPS and allow VR.`);
  toast('VR session could not start — see the message by the Enter VR button.');
  const le = $('lobby-error');
  if (le) le.textContent = `VR unavailable: ${reason}`;
}
async function exitVR() {
  const s = renderer.xr.getSession();
  if (s) { try { await s.end(); } catch (_) { /* already ended */ } }
}
if (navigator.xr && navigator.xr.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) {
      setVRStatus('Immersive VR is not supported on this device/browser — use the Meta Quest Browser on a Quest headset.');
      const b1 = $('btn-vr'), b2 = $('btn-vr-float');
      if (b1) { b1.disabled = true; b1.textContent = 'VR not available here'; }
      if (b2) { b2.disabled = true; b2.textContent = 'VR not available here'; }
    }
  }).catch(() => { /* leave the button enabled; enterVR reports the error */ });
}

// ---------------- Lobby wiring ----------------
$('btn-practice').onclick = () => {
  state.mode = 'practice'; state.playerIndex = 0;
  $('lobby').classList.add('hidden');
  updateVRBar();
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
$('btn-vr').onclick = enterVR;
const floatBtn = $('btn-vr-float');
if (floatBtn) floatBtn.onclick = enterVR;
const exitBtn = $('btn-exit-vr');
if (exitBtn) exitBtn.onclick = exitVR;
$('btn-desktop').onclick = () => {
  if (state.mode === 'lobby') $('btn-practice').click();
  else { $('lobby').classList.add('hidden'); updateVRBar(); }
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
renderer.xr.addEventListener('sessionstart', () => { camera.position.set(0, 0, 0); updateVRBar(); });
renderer.xr.addEventListener('sessionend', () => {
  camera.position.set(0, 1.6, 0);
  xrSession = null;
  setVRStatus('Exited VR — tap Enter VR to go back in.');
  updateVRBar();
});
updateVRBar();

// ---------------- AI opponent (practice mode) ----------------
function aiTick(dt) {
  if (state.mode !== 'practice' || state.roundOver) return;
  const t = performance.now() / 1000;
  foeGroup.position.set(Math.sin(t * 0.3) * 3, 0, SPAWN_DIST);
  foeGroup.rotation.y = Math.PI; // face the player
  state.aiTimer -= dt;
  if (state.aiDefenseTimer === undefined) state.aiDefenseTimer = 4;
  state.aiDefenseTimer -= dt;
  if (state.aiDefenseTimer <= 0) {
    state.aiDefenseTimer = 18 + Math.random() * 8;
    if (!initialDefenseOf(1)) {
      const c = foeGroup.position.clone();
      const pts = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push(new THREE.Vector3(c.x + Math.cos(a) * 2.6, 0.03, c.z + Math.sin(a) * 2.6)); }
      spawnDefensePiece(1, pts, true, { broadcast: false });
      toast('The Chalk AI raises a near-perfect circular defense.');
    }
  }
  if (state.aiTimer <= 0) {
    state.aiTimer = 6 + Math.random() * 4;
    if (chalklings.filter((c) => c.owner === 1).length < 3) {
      const base = foeGroup.position.clone(); base.z -= 2.5;
      const pts = [];
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const r = 0.55 + Math.random() * 0.35; pts.push(new THREE.Vector3(base.x + Math.cos(a) * r, 0.03, base.z + Math.sin(a) * r)); }
      spawnChalkling(1, pts, { broadcast: false });
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
  updatePendingStrokes(dt);

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
  // Tethered defenders: local ones hunt, remote ones interpolate, and
  // every tether chain is redrawn to its defender's current position.
  [...defenders].forEach((d) => {
    if (d.isRemote) {
      d.group.position.x += (d.pos.x - d.group.position.x) * Math.min(1, dt * 8);
      d.group.position.z += (d.pos.z - d.group.position.z) * Math.min(1, dt * 8);
    } else {
      updateDefender(d, dt, time);
    }
    const t = tethers.find((x) => x.id === d.tetherId);
    if (t) updateTetherLine(t, d.group.position);
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
    defenders.filter((d) => d.owner === state.playerIndex).forEach((d) => {
      send({ t: 'defenderPos', id: d.id, p: [d.pos.x, d.pos.z] });
    });
  }

  hudTimer -= dt;
  if (hudTimer <= 0) { hudTimer = 0.25; updateHUD(); }

  renderer.render(scene, camera);
});

updateHUD();
setStatus('Choose Practice, or Host / Join for a 2-player duel.');
