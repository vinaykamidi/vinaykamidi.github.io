// Robots walking inside the bottom bar, driven by scroll: BOLT (single leg, M.S.) -> Unitree A1 (Ph.D.)
// -> humanoid carrying a fridge (industry), which it sets on a table at the end of the page.
// BOLT and the humanoid are built here from primitives; a1.glb comes from MuJoCo Menagerie (see A1-LICENSE.txt).
// Renders only while something moves. Dev-only URL params: p (fixed progress), ph (gait phase), big (scale), ns (no settle), pal, fridge.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const bar = document.querySelector('.edge--bottom');
const canvas = document.getElementById('bar3d');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
// soft studio reflections: what makes satin/clear-coat shells read as premium
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .55;
// Palettes (?pal=): shell / joint / light / edge / fridge; sm, jm = shell / joint metalness.
const PALETTES = {
  anthracite: { shell: 0x3A3E45, joint: 0x141619, light: 0xF2A65A, edge: 0x08090A, fridge: 0xEDEBE6, sm: .55, jm: .6 },  // dark satin + amber lights
  anthraciteb:{ shell: 0x3A3E45, joint: 0x141619, light: 0x9DB8FF, edge: 0x08090A, fridge: 0xEDEBE6, sm: .55, jm: .6 },  // dark satin + ice-blue lights
  signal:     { shell: 0xE9873F, joint: 0x1A1C20, light: 0xFFFFFF, edge: 0x2A1608, fridge: 0xEDEBE6, sm: .2, jm: .55 },  // safety orange + black
  titanium: { shell: 0x8E949C, joint: 0x1C1F24, light: 0x4365CD, edge: 0x24272D, fridge: 0xEDEBE6, sm: .6, jm: .55 },  // satin titanium + gunmetal + site blue
  midnight: { shell: 0x1D2740, joint: 0x0C1019, light: 0xE9C99A, edge: 0x05070C, fridge: 0xEDEBE6, sm: .35, jm: .6 },  // midnight navy + champagne
  studio:   { shell: 0xE9EBEE, joint: 0x23262C, light: 0x4365CD, edge: 0x30343B, fridge: 0xB8BDC3, sm: .05, jm: .55 }, // pearl white + gunmetal + site blue
  graphite: { shell: 0x2B2D31, joint: 0x111214, light: 0x7FA2FF, edge: 0x050506, fridge: 0xEDEBE6, sm: .45, jm: .6 },  // satin graphite + ice-blue
  cobalt:   { shell: 0x23408F, joint: 0x0E1426, light: 0xF2E6D0, edge: 0x070B18, fridge: 0xEDEBE6, sm: .3, jm: .55 },   // deep cobalt + warm white
};
const PAL = PALETTES[new URLSearchParams(location.search).get('pal')] || PALETTES.signal;
const RUST = PAL.shell, RUST_DARK = PAL.joint;
const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -5000, 5000);
scene.add(new THREE.HemisphereLight(0xfff4ec, 0x8a6a5a, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-1, 2, 3); scene.add(key);
// rim light from behind: bright edge highlights so dark shells keep their detail on any background
const rim = new THREE.DirectionalLight(0xffffff, 2.4); rim.position.set(2, 3, -4); scene.add(rim);

const matLight = new THREE.MeshPhysicalMaterial({ color: RUST, roughness: .42, metalness: PAL.sm, clearcoat: .6, clearcoatRoughness: .3, transparent: true });
const matDark = new THREE.MeshPhysicalMaterial({ color: RUST_DARK, roughness: .38, metalness: PAL.jm, transparent: true });
// Two-tone for the custom-built robots: light shells, dark actuators/joints, plus crisp edge lines.
const matShell = new THREE.MeshPhysicalMaterial({ color: PAL.shell, roughness: .36, metalness: PAL.sm, clearcoat: .8, clearcoatRoughness: .22, transparent: true });
const matJoint = new THREE.MeshPhysicalMaterial({ color: PAL.joint, roughness: .32, metalness: PAL.jm, transparent: true });
const matFace = new THREE.MeshStandardMaterial({ color: PAL.light, emissive: PAL.light, emissiveIntensity: .7, roughness: .2, metalness: .1, transparent: true }); // accent lights
const matEdge = new THREE.LineBasicMaterial({ color: PAL.edge, transparent: true, opacity: .9 });
const matFridge = new THREE.MeshPhysicalMaterial({ color: PAL.fridge, roughness: .3, metalness: PAL === PALETTES.studio ? .7 : .05, clearcoat: .5, transparent: true }); // the Atlas mini-fridge
const matWood = new THREE.MeshPhysicalMaterial({ color: 0x4A3022, roughness: .45, clearcoat: .7, clearcoatRoughness: .25, transparent: true }); // walnut table top
const matTableLeg = matJoint.clone(), matTableEdge = matEdge.clone();   // own materials: the table fades in on its own
const TABLE_MATS = [matWood, matTableLeg, matTableEdge];
const ALL_MATS = [matLight, matDark, matShell, matJoint, matFace, matEdge, matFridge];
const CARRY = new URLSearchParams(location.search).get('fridge') !== '0'; // test hook: ?fridge=0 walks empty-handed
function withEdges(mesh, angle = 28) { mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, angle), matEdge)); return mesh; }

// ---- generic 2-link sagittal IK (MuJoCo frame: x forward, z up, joints about +y)
const rot = (q, [x, z]) => [x * Math.cos(q) + z * Math.sin(q), -x * Math.sin(q) + z * Math.cos(q)];
function fk(q1, q2, v1, v2) { const a = rot(q1, v1), b = rot(q1 + q2, v2); return [a[0] + b[0], a[1] + b[1]]; }
function ik(target, q, v1, v2) { // Newton steps from the previous solution (keeps the knee direction)
  let [q1, q2] = q;
  for (let i = 0; i < 8; i++) {
    const f = fk(q1, q2, v1, v2), e = [target[0] - f[0], target[1] - f[1]], h = 1e-4;
    const f1 = fk(q1 + h, q2, v1, v2), f2 = fk(q1, q2 + h, v1, v2);
    const J = [[(f1[0] - f[0]) / h, (f2[0] - f[0]) / h], [(f1[1] - f[1]) / h, (f2[1] - f[1]) / h]];
    const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]; if (Math.abs(det) < 1e-9) break;
    q1 += (J[1][1] * e[0] - J[0][1] * e[1]) / det; q2 += (-J[1][0] * e[0] + J[0][0] * e[1]) / det;
  }
  q[0] = q1; q[1] = q2; return q;
}
// Foot path relative to the hip, phase u in [0,1): stance (on the ground, sliding back) then swing.
function footPath(u, stride, lift) {
  if (u < .5) return [stride / 2 - stride * (u / .5), 0];
  const s = (u - .5) / .5;
  return [-stride / 2 + stride * (s - Math.sin(2 * Math.PI * s) / (2 * Math.PI)), lift * Math.sin(Math.PI * s)];
}

// ---- BOLT: the 1-DoF closed-chain leg (US 11,883,959 B2; M.S. thesis, Kamidi 2018).
// Geometry from patent Fig. 2A scaled by the 210 mm femur; frame: x forward, y lateral, z up, hip pivot A at origin.
//  Loop 1 (four-bar): driving disk D -> crank pin C -> HFE link -> point B on the femur; femur pivots at A.
//  Loop 2 (parallelogram, thesis Fig. 3.1: th5 = th3, th6 = th2): KFE link runs parallel to the femur, so the
//  tibia keeps a fixed angle relative to the HFE link. One crank turn = one stride (~210 mm x 70 mm foot loop).
const BOLT = { LF: .21, LT: .303, sB: .08, r: .02, D: [-.053, -.078], th0: .502, sG: .06 };
(function () {
  const b = BOLT, E0 = [b.LF * Math.sin(b.th0), -b.LF * Math.cos(b.th0)], B0 = [E0[0] * b.sB / b.LF, E0[1] * b.sB / b.LF];
  const C0 = [b.D[0] + b.r, b.D[1]];
  b.Lh = Math.hypot(B0[0] - C0[0], B0[1] - C0[1]);
  b.off = Math.atan2(-.957, -.294) - Math.atan2(B0[1] - C0[1], B0[0] - C0[0]);
})();
function circleHit(p0, r0, p1, r1, pickX) { // intersection of two circles; pick the one with larger x*pickX
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], d = Math.hypot(dx, dz);
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d), h = Math.sqrt(Math.max(r0 * r0 - a * a, 0));
  const mx = p0[0] + a * dx / d, mz = p0[1] + a * dz / d, px = -dz / d, pz = dx / d;
  const s1 = [mx + h * px, mz + h * pz], s2 = [mx - h * px, mz - h * pz];
  return (s1[0] - s2[0]) * pickX > 0 ? s1 : s2;
}
function boltFK(crank) { // crank angle -> all joint positions (x, z)
  const b = BOLT, C = [b.D[0] + b.r * Math.cos(crank), b.D[1] + b.r * Math.sin(crank)];
  const B = circleHit([0, 0], b.sB, C, b.Lh, 1), n = Math.hypot(B[0], B[1]);
  const E = [B[0] / n * b.LF, B[1] / n * b.LF];
  const tib = Math.atan2(B[1] - C[1], B[0] - C[0]) + b.off, td = [Math.cos(tib), Math.sin(tib)];
  const v = [td[0] * b.sG, td[1] * b.sG]; // knee -> G on the tibia; same vector at the hip end of the parallelogram
  return { C, B, E, tib, K: v, G: [E[0] + v[0], E[1] + v[1]], F: [E[0] + td[0] * b.LT, E[1] + td[1] * b.LT],
           femur: aim(E[0], E[1]) };
}
function plateGeo(len, width, thick, { slot = 0, holes = true } = {}) { // rounded plate along -z from its origin
  const r = width / 2, sh = new THREE.Shape();
  sh.moveTo(0, -r); sh.lineTo(len, -r); sh.absarc(len, 0, r, -Math.PI / 2, Math.PI / 2, false);
  sh.lineTo(0, r); sh.absarc(0, 0, r, Math.PI / 2, 3 * Math.PI / 2, false);
  const hole = (cx, rr) => { const h = new THREE.Path(); h.absarc(cx, 0, rr, 0, 2 * Math.PI, true); sh.holes.push(h); };
  if (holes) { hole(0, r * .4); hole(len, r * .4); }
  if (slot) { const h = new THREE.Path(), a = len * .3, e = a + slot, sr = r * .34;
    h.moveTo(a, -sr); h.lineTo(e, -sr); h.absarc(e, 0, sr, -Math.PI / 2, Math.PI / 2, false);
    h.lineTo(a, sr); h.absarc(a, 0, sr, Math.PI / 2, 3 * Math.PI / 2, false); sh.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: .0015, bevelSize: .0015, bevelSegments: 1, curveSegments: 12 });
  g.translate(0, 0, -thick / 2); g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 2);
  return g;
}
// Rotation about y that points a plate (built along -z) in direction (dx, dz).
const aim = (dx, dz) => Math.atan2(-dx, -dz);
// A link drawn between two (x, z) points at lateral offset y: a unit-length plate, stretched and aimed each frame.
function linkMesh(width, thick, mat) {
  const m = withEdges(new THREE.Mesh(plateGeo(1, width, thick, { holes: false }), mat), 25);
  m.userData.set = (p, q, y) => {
    m.position.set(p[0], y, p[1]);
    m.rotation.set(0, aim(q[0] - p[0], q[1] - p[1]), 0);
    m.scale.set(1, 1, Math.hypot(q[0] - p[0], q[1] - p[1]));
  };
  return m;
}
function buildBolt() {
  const b = BOLT, root = new THREE.Group(), M = (g, m) => new THREE.Mesh(g, m);
  // main body (Fig. 2A outline: ~175 x 140 mm) with the motor/gearbox behind the driving disk
  const body = withEdges(M(new RoundedBoxGeometry(.175, .07, .142, 3, .01), matShell)); body.position.set(-.013, .03, -.03); root.add(body);
  const motor = M(new THREE.CylinderGeometry(.03, .03, .05, 24), matJoint); motor.position.set(b.D[0], .08, b.D[1]); root.add(motor);
  const disk = withEdges(M(new THREE.CylinderGeometry(.04, .04, .012, 28), matShell), 40); disk.position.set(b.D[0], -.01, b.D[1]); root.add(disk);
  const hub = M(new THREE.CylinderGeometry(.012, .012, .02, 16), matJoint); hub.position.set(b.D[0], -.018, b.D[1]); root.add(hub);
  const hipBoss = M(new THREE.CylinderGeometry(.03, .03, .02, 24), matShell); hipBoss.position.set(0, -.012, 0); root.add(hipBoss);
  // moving links
  const femur = withEdges(M(plateGeo(b.LF, .066, .016, { slot: b.LF * .35 }), matShell), 25);
  const tibia = new THREE.Group();
  const tPlate = withEdges(M(plateGeo(b.LT * .55, .056, .016, { slot: b.LT * .15 }), matShell), 25); tPlate.position.z = .02; tibia.add(tPlate);
  const shank = M(new THREE.CylinderGeometry(.015, .015, b.LT * .2, 14), matJoint); shank.rotation.x = Math.PI / 2; shank.position.z = -b.LT * .62; tibia.add(shank);
  const spring = M(new THREE.CylinderGeometry(.02, .02, b.LT * .16, 14), matFace); spring.rotation.x = Math.PI / 2; spring.position.z = -b.LT * .83; tibia.add(spring);
  const tip = M(new THREE.SphereGeometry(.021, 14, 10), matJoint); tip.position.z = -b.LT + .016; tibia.add(tip);
  const hfe = linkMesh(.026, .01, matJoint), kfeCrank = linkMesh(.028, .01, matJoint), kfe = linkMesh(.024, .01, matJoint);
  root.add(femur, tibia, hfe, kfeCrank, kfe);
  return { root, femur, tibia, hfe, kfeCrank, kfe };
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// ---- Custom humanoid: unbranded, designed after current electric humanoids (flat-sided bevelled shells,
// exposed actuator housings, chamfered chest, narrow waist, egg head with a dark face plate).
// Frame: x forward, y left, z up; metres; ~1.7 m tall; thigh and shin 0.42 m.
const SWAP_XYZ = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1); // (x,y,z) <- (z,x,y)
// Tapered limb panel along -z: width wTop -> wBot (in x), thickness t (in y), rounded ends, bevelled.
function limbGeo(len, wTop, wBot, t) {
  const sh = new THREE.Shape(), a = wTop / 2, b = wBot / 2;
  sh.moveTo(0, -a); sh.lineTo(len, -b); sh.quadraticCurveTo(len + b * 1.1, 0, len, b); sh.lineTo(0, a); sh.quadraticCurveTo(-a * 1.1, 0, 0, -a);
  const bev = Math.min(t, wBot) * .18;
  const g = new THREE.ExtrudeGeometry(sh, { depth: t - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -(t - 2 * bev) / 2); g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 2);
  return g;
}
// A front-view profile (points in y,z) extruded to depth d along x, bevelled — for chest and pelvis.
function frontGeo(pts, d, bev) {
  const sh = new THREE.Shape(pts.map(([y, z]) => new THREE.Vector2(y, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3 });
  g.translate(0, 0, -(d - 2 * bev) / 2); g.applyMatrix4(SWAP_XYZ); return g;
}
const actuator = (r, w) => { const g = new THREE.CylinderGeometry(r, r, w, 28); return g; }; // axis along y (lateral)
// Smooth turned shell: profile [[radius, z], ...] (z downward negative), oval section (sx depth, sy width).
function shellGeo(profile, sx = 1, sy = 1) {
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 36);
  g.rotateX(Math.PI / 2);   // lathe axis y -> z
  g.scale(sx, sy, 1); g.computeVertexNormals(); return g;
}
// Heavy under-hand carry: arms long and low, hands at waist height under the fridge's base.
const CARRY_POSE = { ad: -.3, sh: -.25, el: -.45 };   // shoulder adduction (left arm; mirrored on the right), shoulder pitch, elbow
const FRIDGE_Z = .3;                                // fridge centre in the torso frame: its base rests on the forearms
function buildHumanoid() {
  // Industrial humanoid: broad squared shoulders, chunky actuator housings at every joint,
  // thick limbs, boxy chest with a backpack, round lamp head. Proportions read as a robot even at 30 px.
  const M = (g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
  const E = o => withEdges(o, 35);
  const ball = r => new THREE.SphereGeometry(r, 24, 16);
  const box = (x, y, z, r = .02) => new RoundedBoxGeometry(x, y, z, 3, r);
  const drum = (r, w) => new THREE.CylinderGeometry(r, r, w, 28);               // axis along y (lateral)
  const root = new THREE.Group(), pelvis = new THREE.Group(); root.add(pelvis);
  // pelvis block + hip actuator drums
  pelvis.add(E(M(box(.2, .3, .15, .035), matShell, -.01, 0, .0)));
  const torso = new THREE.Group(); torso.position.z = .07; pelvis.add(torso);
  torso.add(M(drum(.085, .2).rotateX(Math.PI / 2), matJoint, 0, 0, .05));             // waist actuator (vertical)
  torso.add(E(M(box(.2, .3, .16, .04), matShell, -.005, 0, .19)));                    // abdomen
  torso.add(E(M(box(.27, .46, .25, .05), matShell, 0, 0, .4)));                        // chest
  torso.add(E(M(box(.12, .32, .26, .03), matJoint, -.17, 0, .37)));                    // backpack (battery)
  torso.add(M(box(.012, .18, .02, .008), matFace, .136, 0, .43));                     // chest light bar
  torso.add(M(drum(.04, .07).rotateX(Math.PI / 2), matJoint, 0, 0, .555));            // neck
  const head = new THREE.Group(); head.position.set(.01, 0, .65); torso.add(head);
  const skull = M(ball(.1), matShell); skull.scale.set(1.02, .9, 1.08); head.add(skull);                       // helmet
  const visorG = new THREE.SphereGeometry(.103, 32, 12, Math.PI - 1.05, 2.1, 1.05, .78).rotateX(Math.PI / 2);   // wrap-around face visor
  const visor = M(visorG, matJoint); visor.scale.set(1.02, .9, 1.08); head.add(visor);
  const band = M(new THREE.TorusGeometry(.104, .006, 6, 40, 1.6), matFace, 0, 0, -.005); band.rotation.z = -.8; band.scale.set(1.02, .9, 1); head.add(band); // light line under the visor
  const arm = side => {
    const sh = new THREE.Group(); sh.position.set(0, side * .29, .45); torso.add(sh);
    sh.add(E(M(box(.13, .1, .13, .035), matShell, 0, side * .01, .015)));              // shoulder pod
    sh.add(M(drum(.055, .11), matJoint, 0, side * .01, 0));
    sh.add(E(M(box(.09, .085, .2, .03), matShell, 0, 0, -.16)));                       // upper arm
    const el = new THREE.Group(); el.position.z = -.29; sh.add(el);
    el.add(M(drum(.048, .1), matJoint));
    el.add(E(M(box(.08, .075, .2, .028), matShell, 0, 0, -.13)));                      // forearm
    el.add(M(box(.07, .05, .07, .02), matJoint, .005, 0, -.27));                        // gripper
    return { sh, el };
  };
  const leg = side => {
    const hip = new THREE.Group(); hip.position.set(0, side * .1, -.05); pelvis.add(hip);
    hip.add(M(drum(.075, .12), matJoint));                                              // hip actuator
    hip.add(E(M(box(.14, .12, .3, .045), matShell, .005, 0, -.2)));                     // thigh
    const kn = new THREE.Group(); kn.position.z = -.42; hip.add(kn);
    kn.add(M(drum(.062, .13), matJoint)); kn.add(M(drum(.03, .135), matFace));           // knee actuator + light
    kn.add(E(M(box(.115, .1, .3, .04), matShell, -.005, 0, -.2)));                      // shin
    const an = new THREE.Group(); an.position.z = -.42; kn.add(an);
    an.add(M(drum(.04, .09), matJoint));
    an.add(E(M(box(.25, .11, .055, .02), matJoint, .05, 0, -.052)));                  // foot
    return { hip, kn, an };
  };
  // mini-fridge held against the chest, squeezed between torso, arms and hands (BD, "Training a Humanoid Robot for Hard Work")
  let fridge = null;
  if (CARRY) {
    const W = .52, D = .5, H = .66;
    fridge = new THREE.Group(); fridge.position.set(.15 + D / 2, 0, FRIDGE_Z); torso.add(fridge);
    fridge.add(withEdges(M(new RoundedBoxGeometry(D, W, H, 3, .022), matFridge)));
    fridge.add(M(new THREE.BoxGeometry(.004, W * .96, .006), matJoint, D / 2 + .001, 0, H * .18));            // door seam (freezer / fridge)
    fridge.add(M(new RoundedBoxGeometry(.018, .016, .16, 2, .006), matJoint, D / 2 + .01, -W * .38, -.02));  // handle
    fridge.add(M(new RoundedBoxGeometry(D * .9, W * .9, .025, 2, .008), matJoint, 0, 0, -H / 2 - .008));     // base/feet
    fridge.userData.H = H; fridge.userData.D = D;
  }
  return { root, pelvis, torso, head, fridge, L: leg(1), R: leg(-1), LA: arm(1), RA: arm(-1) };
}

// ---- Human walking: sagittal joint angles over one stride (0 = heel strike), degrees, after typical
// adult gait data (Winter). hip + = flexion, knee + = flexion, ankle + = dorsiflexion. Toe-off at ~60%.
const GAIT = {
  toeOff: .6,
  hip:   [[0, 30], [.1, 25], [.3, 6], [.5, -10], [.6, -5], [.7, 12], [.85, 28], [1, 30]],
  knee:  [[0, 4], [.15, 18], [.4, 4], [.5, 10], [.6, 38], [.72, 62], [.88, 22], [1, 4]],
  ankle: [[0, 0], [.07, -6], [.25, 5], [.45, 10], [.6, -15], [.66, -12], [.8, 2], [1, 0]]
};
function gaitCurve(keys, u) { // periodic Catmull-Rom through the keys; returns radians
  const n = keys.length - 1; // last key duplicates the first (u = 1)
  let i = 0; while (i < n - 1 && u > keys[i + 1][0]) i++;
  const k = j => keys[((j % n) + n) % n], t0 = keys[i][0], t1 = keys[i + 1][0], t = (u - t0) / (t1 - t0);
  const p0 = k(i - 1)[1], p1 = keys[i][1], p2 = keys[i + 1][1], p3 = k(i + 2)[1];
  const v = .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  return v * Math.PI / 180;
}

// ---- robot rigs
const ROBOTS = {
  custom: {
    build: buildHumanoid, heightPx: 52, stride: .3, lift: 0, yaw: -.62,
    setup(r) {
      // No-slip: body travel per cycle = foot travel during stance / stance fraction (sampled once).
      const a = this.legAt(0), b = this.legAt(GAIT.toeOff);
      this.stride = (a.ankle[0] - b.ankle[0]) / GAIT.toeOff / 2;
    },
    // Sagittal joint angles for one leg at gait phase u (0 = heel strike), and its ankle/heel/toe points.
    legAt(u) {
      let h = gaitCurve(GAIT.hip, u), k = gaitCurve(GAIT.knee, u), d = gaitCurve(GAIT.ankle, u);
      if (CARRY) { const r = Math.PI / 180; h = .72 * h + 4 * r; k = .85 * k + 9 * r; d = .7 * d - 2 * r; } // loaded: short, bent-knee steps
      const q1 = -h, q2 = k, q3 = (h - k) - d;                 // joint rotations (rad)
      const kn = rot(q1, [0, -.42]), sh = rot(q1 + q2, [0, -.42]);
      const ankle = [kn[0] + sh[0], kn[1] + sh[1]], fa = q1 + q2 + q3;
      const heel = rot(fa, [-.07, -.079]), toe = rot(fa, [.17, -.079]);
      return { q1, q2, q3, ankle, heel: [ankle[0] + heel[0], ankle[1] + heel[1]], toe: [ankle[0] + toe[0], ankle[1] + toe[1]] };
    },
    pose(r, phase) {
      const P = r.parts, tw = Math.sin(2 * Math.PI * phase);
      let low = 0;
      [['L', 0], ['R', .5]].forEach(([n, off]) => {
        const u = (phase + off) % 1, g = this.legAt(u);
        P[n].hip.rotation.y = g.q1; P[n].kn.rotation.y = g.q2; P[n].an.rotation.y = g.q3;
        low = Math.min(low, g.heel[1], g.toe[1]);
        // opposite arm swings with this leg; elbow flexes more on the forward swing
        const A = P[n === 'L' ? 'RA' : 'LA'], sw = gaitCurve(GAIT.hip, u) - .1;
        if (CARRY) { A.sh.rotation.set((A === P.LA ? 1 : -1) * CARRY_POSE.ad, CARRY_POSE.sh, 0); A.el.rotation.y = CARRY_POSE.el; } // hands under the fridge
        else { A.sh.rotation.y = .75 * sw; A.el.rotation.y = -.3 - .25 * Math.max(0, sw); }
      });
      // pelvis rises over the stance leg (lowest foot point sits on the ground), twists and sways a little
      if (CARRY) {   // lean back against the load, little twist, more side-to-side and vertical bob
        const bob = Math.cos(4 * Math.PI * phase);
        P.pelvis.rotation.z = .04 * tw; P.torso.rotation.z = -.03 * tw; P.torso.rotation.y = -.07 - .012 * bob;
        P.root.position.y = .026 * tw;
      } else {
        P.pelvis.rotation.z = .07 * tw; P.torso.rotation.z = -.11 * tw; P.torso.rotation.y = .035;
        P.root.position.y = .018 * tw;
      }
      P.root.position.z = -low + .05;                          // hip joints sit .05 below the pelvis origin
      r.levelW = 0; if (r.place > 0) this.placePose(r, r.place);
      const F = P.fridge;                                      // released at s = .5: the fridge stays on the table
      if (F && r.table) {
        if (r.place >= .5) { if (F.parent !== r.table.zup) r.table.zup.add(F); F.position.copy(r.fridgeRest.p); F.quaternion.copy(r.fridgeRest.q); }
        else { if (F.parent !== P.torso) { P.torso.add(F); F.position.copy(r.fridgeHeld); } F.rotation.set(0, -P.torso.rotation.y * r.levelW, 0); } // kept level while lowering
      }
    },
    // Setting the fridge down at the end of the page (s: 0 -> 1). Scrolling back plays it in reverse: it picks it up.
    placePose(r, s) {
      const P = r.parts, ss = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t), L = (a, b, t) => a + (b - a) * t;
      const w = ss(s / .2);                                       // walk -> stand, feet together
      r.levelW = w;
      const sq = ss((s - .2) / .25) * (1 - ss((s - .58) / .22));  // squat down, hold for the release, stand back up
      const a = .42 * sq;
      for (const n of ['L', 'R']) {                               // foot-flat squat: hip a, knee 2a, ankle a
        const J = P[n];
        J.hip.rotation.y = L(J.hip.rotation.y, -a, w); J.kn.rotation.y = L(J.kn.rotation.y, 2 * a, w); J.an.rotation.y = L(J.an.rotation.y, -a, w);
      }
      P.root.position.z = L(P.root.position.z, .84 * Math.cos(a) + .129, w);
      P.root.position.y *= 1 - w; P.pelvis.rotation.z *= 1 - w; P.torso.rotation.z *= 1 - w;
      P.torso.rotation.y = L(P.torso.rotation.y, -.07 + .3 * sq, w); // lean over the table while lowering
      const open = ss((s - .5) / .12), drop = ss((s - .6) / .25);   // after release: hands open out, then arms drop
      for (const [n, side] of [['LA', 1], ['RA', -1]]) {
        const A = P[n];
        A.sh.rotation.set(side * L(L(CARRY_POSE.ad, .3, open), .03, drop), L(CARRY_POSE.sh, .04, drop), 0); // slide the hands out sideways, then drop the arms
        A.el.rotation.y = L(CARRY_POSE.el, -.18, drop);
      }
    },
    // Table sized so the fridge, as held at the bottom of the squat, sits exactly on its top.
    after(r) {
      if (!CARRY) return;
      const P = r.parts, F = P.fridge, zupR = r.model.parent;
      r.fridgeHeld = F.position.clone();
      r.place = .5; this.placePose(r, .5); F.rotation.set(0, -P.torso.rotation.y, 0); r.place = 0;
      r.holder.updateMatrixWorld(true);
      const m = new THREE.Matrix4().copy(zupR.matrixWorld).invert().multiply(F.matrixWorld), sc = new THREE.Vector3();
      r.fridgeRest = { p: new THREE.Vector3(), q: new THREE.Quaternion() }; m.decompose(r.fridgeRest.p, r.fridgeRest.q, sc);
      // level it (the squat leans the torso) and drop it onto the table top
      const e = new THREE.Euler().setFromQuaternion(r.fridgeRest.q, 'ZYX'); r.fridgeRest.q.setFromEuler(new THREE.Euler(0, 0, e.z, 'ZYX'));
      const { H, D } = F.userData, topZ = r.fridgeRest.p.z - H / 2 - .021, fx = r.fridgeRest.p.x;
      const zup = new THREE.Group(); zup.rotation.x = -Math.PI / 2;
      const yaw = new THREE.Group(); yaw.rotation.y = r.holder.children[0].rotation.y; yaw.add(zup);
      const holder = new THREE.Group(); holder.add(yaw); scene.add(holder);
      const x0 = fx - D / 2 + .02, x1 = fx + D / 2 + .16, Y = .34, T = .035, M = (g, mat, x, y, z) => { const o = new THREE.Mesh(g, mat); o.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), matTableEdge)); o.position.set(x, y, z); zup.add(o); };
      M(new RoundedBoxGeometry(x1 - x0, 2 * Y, T, 2, .01), matWood, (x0 + x1) / 2, 0, topZ - T / 2);
      for (const lx of [x0 + .04, x1 - .04]) for (const ly of [-Y + .04, Y - .04]) M(new RoundedBoxGeometry(.035, .035, topZ - T, 2, .008), matTableLeg, lx, ly, (topZ - T) / 2);
      r.table = { holder, zup, reach: x1 * Math.cos(yaw.rotation.y) + Y * Math.abs(Math.sin(yaw.rotation.y)) }; // screen-x extent past the robot, in m
      r.holder.updateMatrixWorld(true); this.pose(r, 0);
    }
  },
  bolt: {
    build: buildBolt, heightPx: 42,
    stride: .2365, lift: 0, // body travel per crank turn = 2 * stride = 0.473 m (no-slip during the stance arc)
    setup() {},
    pose(r, phase) {
      const P = r.parts, k = boltFK(-2 * Math.PI * phase + 4.4); // crank turns so the stance arc pushes backwards
      const Y = -.045;                                             // the moving links sit on the visible side of the body
      P.femur.position.set(0, Y, 0); P.femur.rotation.set(0, k.femur, 0);
      P.tibia.position.set(k.E[0], Y - .014, k.E[1]); P.tibia.rotation.set(0, aim(k.F[0] - k.E[0], k.F[1] - k.E[1]), 0);
      P.hfe.userData.set(k.C, k.B, Y - .03);
      P.kfeCrank.userData.set([0, 0], k.K, Y + .016);
      P.kfe.userData.set(k.K, k.G, Y + .016);
      // foot stays on the ground through stance; the body holds its height during swing
      P.root.position.z = Math.max(.495, -k.F[1]) + .016;
    }
  },
  a1: {
    file: 'bar3d/a1.glb', root: 'trunk', heightPx: 30, stride: .16, lift: .06,
    setup(r) { r.legs = ['FR', 'FL', 'RR', 'RL'].map((n, i) => ({ n, off: (i === 0 || i === 3) ? 0 : .5, q: [.9, -1.8] })); },
    pose(r, phase) { // trot; blends into an MIT-Cheetah-style bound while jumping onto/off the icons
      const z0 = .27, v = [0, -.2], J = r.jump || { w: 0, climb: true }, w = J.w;
      // bound poses (foot relative to hip): climbing = rear legs push back, front legs tuck up;
      // descending = front legs reach forward to land, rear legs tuck
      const BOUND = J.climb ? { F: [.07, -.13], R: [-.13, -.21] } : { F: [.1, -.23], R: [-.03, -.13] };
      r.legs.forEach(L => {
        let [dx, dz] = footPath((phase + L.off) % 1, this.stride, this.lift);
        let t = [dx, -(z0 - .02) + dz];
        if (w > 0) { const b = BOUND[L.n[0]]; t = [t[0] + (b[0] - t[0]) * w, t[1] + (b[1] - t[1]) * w]; }
        ik(t, L.q, v, v);
        r.set(L.n + '_thigh_joint', L.q[0]); r.set(L.n + '_calf_joint', L.q[1]);
      });
      r.rootNode.position.z = z0 + .006 * Math.cos(4 * Math.PI * phase);
      r.rootNode.rotation.y = (J.climb ? -.42 : .32) * w; // pitch: nose up on takeoff, nose down to land
    }
  },
  apollo: {
    file: 'bar3d/apollo.glb', root: 'base_link', heightPx: 42, stride: .34, lift: .07, yaw: -.62, mono: true,
    setup(r) { r.legs = [{ n: 'l', off: 0, q: [-.3, .6] }, { n: 'r', off: .5, q: [-.3, .6] }]; },
    pose(r, phase) { // walk with counter-swinging arms
      const hipZ = .169, ankleZ = .062, legZ = .835, v1 = [-.05, -.425], v2 = [.05, -.425];
      r.legs.forEach(L => {
        const u = (phase + L.off) % 1, [dx, dz] = footPath(u, this.stride, this.lift);
        ik([dx, -legZ + dz], L.q, v1, v2);
        r.set(L.n + '_hip_fe', L.q[0]); r.set(L.n + '_knee_fe', L.q[1]); r.set(L.n + '_ankle_pd', -(L.q[0] + L.q[1]));
        const arm = (L.n === 'l' ? 'r' : 'l');
        r.set(arm + '_shoulder_fe', -.35 * Math.cos(2 * Math.PI * u)); r.set(arm + '_elbow_fe', -.45);
      });
      r.set('l_shoulder_aa', .12); r.set('r_shoulder_aa', -.12);
      r.rootNode.position.z = ankleZ + hipZ + legZ + .012 * Math.cos(4 * Math.PI * phase);
    }
  }
};

async function loadRobot(key) {
  const R = ROBOTS[key];
  if (R.build) {
    const parts = R.build(), r = { parts, model: parts.root, rootNode: parts.root };
    R.setup(r); return place(r, R);
  }
  const [gltf, joints] = await Promise.all([
    new GLTFLoader().loadAsync(R.file),
    fetch(R.file.replace('.glb', '.joints.json')).then(r => r.json())
  ]);
  const model = gltf.scene, nodes = {};
  model.traverse(o => {
    nodes[o.name] = o;
    if (o.isMesh) { o.geometry.computeVertexNormals(); o.material = (!R.mono && /_d$/.test(o.name)) ? matDark : matLight; }
  });
  const r = { model, rootNode: nodes[R.root], joints: {} };
  joints.joints.forEach(j => {
    const node = nodes[j.body]; if (!node) return;
    r.joints[j.name] = { node, base: node.quaternion.clone(), axis: new THREE.Vector3(...j.axis).normalize() };
  });
  const tmp = new THREE.Quaternion();
  r.set = (name, a) => { const J = r.joints[name]; if (J) J.node.quaternion.copy(J.base).multiply(tmp.setFromAxisAngle(J.axis, a)); };
  R.setup(r);
  return place(r, R);
}
function place(r, R) {
  const model = r.model;
  // MuJoCo is z-up; three is y-up. Wrap: holder (screen placement) > yaw (3/4 view) > zup.
  const zup = new THREE.Group(); zup.rotation.x = -Math.PI / 2; zup.add(model);
  const yaw = new THREE.Group(); yaw.rotation.y = R.yaw ?? -.42; yaw.add(zup);
  const holder = new THREE.Group(); holder.add(yaw); scene.add(holder);
  R.pose(r, 0);
  const box = new THREE.Box3().setFromObject(zup), size = box.getSize(new THREE.Vector3());
  // ?big=N enlarges the robots (test hook)
  r.pxPerM = R.heightPx * (+new URLSearchParams(location.search).get('big') || 1) / size.y;
  r.holder = holder; r.halfPx = size.x / 2 * r.pxPerM;
  R.after?.(r);
  return r;
}

// ---- layout + scroll
let hold = null, holdDir = 1, rawAtHold = 0, icons = [], W = 1, H = 1, ground = 0, x = null, phase = 0, facing = 1, raf = null, robots = {};
function layout() {
  W = canvas.clientWidth; H = canvas.clientHeight;
  renderer.setSize(W, H, false);
  camera.left = 0; camera.right = W; camera.top = H; camera.bottom = 0; camera.updateProjectionMatrix();
  ground = parseFloat(getComputedStyle(bar).paddingBottom) + 3; // above the phone home-indicator area
  const cr = canvas.getBoundingClientRect();
  // Use the visible glyph (font-size tall, centred in the link), not the link's taller box.
  icons = [...document.querySelectorAll('.social a')].filter(a => a.getClientRects().length).map(a => {
    const q = a.getBoundingClientRect(), fs = parseFloat(getComputedStyle(a).fontSize);
    const top = (q.top + q.bottom) / 2 - fs / 2;
    return { l: q.left - cr.left, r: q.right - cr.left, need: cr.bottom - top - ground + .5 };
  });
}
// Icons are platforms: while the robot's footprint overlaps an icon it stands on top of it;
// within JUMP px of an icon it is mid-hop (rising/falling on a parabola).
const JUMP = 34;
function lift(x, half) {
  let best = 0;
  for (const i of icons) {
    const d = Math.abs(x - (i.l + i.r) / 2) - ((i.r - i.l) / 2 + half);
    const v = d <= 0 ? i.need : d < JUMP ? i.need * (1 - (d / JUMP) ** 2) : 0;
    if (v > best) best = v;
  }
  return best;
}
const onIcon = (x, half) => icons.some(i => Math.abs(x - (i.l + i.r) / 2) <= (i.r - i.l) / 2 + half);
const atRest = (x, half) => (lift(x, half) === 0 || onIcon(x, half)) && switches().every(s => Math.abs(x - s) > 14); // ground or icon top, not mid-fade
// The A1 -> Apollo change happens just after the icon row, never during a hop.
const switches = () => icons.length
  // BOLT gets the first half of the stretch before the icons; the A1 takes the rest (and the icons)
  ? [Math.max(PAD() + (Math.min(...icons.map(i => i.l)) - 90 - PAD()) / 2, PAD() + 30), Math.min(Math.max(...icons.map(i => i.r)) + 70, W - PAD() - 20)]
  : [W / 3, 2 * W / 3];
const ORDER = ['bolt', 'a1', 'custom'];
const robotIndex = x => { const [s1, s2] = switches(); return x < s1 ? 0 : x < s2 ? 1 : 2; };
const robotAt = x => robots[ORDER[robotIndex(x)]];
const PAD = () => (W < 760 ? 34 : 60);
// The last stretch of scroll (at the bottom of the page) is where the humanoid sets the fridge on the table.
const ZONE = () => (W < 760 ? 46 : 96);               // scroll px (at the end of the page) spent setting the fridge down
const zoneX = () => Math.max(W - PAD() - ZONE(), switches()[1] + 10);
// where the humanoid stops: right in front of the table, which sits at the very end of the bar
const placeX = () => { const h = robots.custom; return h?.table ? Math.max(W - 14 - h.table.reach * h.pxPerM, zoneX()) : zoneX(); };
// humanoid screen x: walks from its switch-in point to placeX while x goes to zoneX (slightly faster than the scroll)
const humX = x => { const s2 = switches()[1], z = zoneX(), p = placeX(); return x <= s2 || z <= s2 ? Math.min(x, p) : s2 + (Math.min(x, z) - s2) * (p - s2) / (z - s2); };
// Pages too short to scroll (e.g. a one-screen landing page) play the walk on a timer instead:
// across in AUTO_MS, a pause, then back the other way (the humanoid picks the fridge up again).
const AUTO_MS = 26000, AUTO_HOLD = 3000, t0 = performance.now();
const isAuto = () => document.documentElement.scrollHeight - innerHeight < 40;
function autoProgress() {
  let u = (performance.now() - t0) % (2 * (AUTO_MS + AUTO_HOLD));
  if (u < AUTO_MS) return u / AUTO_MS; u -= AUTO_MS;
  if (u < AUTO_HOLD) return 1; u -= AUTO_HOLD;
  if (u < AUTO_MS) return 1 - u / AUTO_MS;
  return 0;
}
function progress() {
  const t = new URLSearchParams(location.search).get('p'); if (t !== null) return +t; // test hook
  if (isAuto()) return autoProgress();
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? Math.min(Math.max(scrollY / max, 0), 1) : 0;
}
function frame() {
  raf = null;
  const span = Math.max(W - 2 * PAD(), 1);
  const raw = PAD() + progress() * span;
  // A finished hop may land ahead of the scroll position: hold that spot until the scroll
  // catches up, or until the visitor scrolls back the other way.
  if (hold !== null && ((raw - hold) * holdDir >= 0 || (raw - rawAtHold) * holdDir < -1)) hold = null;
  let target = hold ?? raw;
  // Never come to rest mid-jump. Only once scrolling has stopped: finish the hop in the
  // direction the robot was already travelling (never turn back).
  const auto = isAuto(), idle = !auto && performance.now() - lastScroll > IDLE_MS;
  const hT = robotAt(target)?.halfPx || 10;
  if (idle && hold === null && !new URLSearchParams(location.search).has('ns') && !atRest(target, hT)) {
    let k = 0; while (k < 200 && !atRest(target + facing * k, hT)) k++;   // finish the hop forwards
    hold = target + facing * k; holdDir = facing; rawAtHold = raw; target = hold;
  }
  if (x === null) x = target;
  // Follow the scroll closely (a little smoothing so wheel steps don't look jerky).
  let dx = (target - x) * .35; if (Math.abs(target - x) < .3) dx = target - x;
  x += dx; if (Math.abs(dx) > .05) facing = dx > 0 ? 1 : -1;
  // Which robot is showing, and how far through a fade (24 px wide) at the nearest switch.
  const sw = switches(), idx = robotIndex(x);
  let alpha = 1;
  sw.forEach(sx => { const d = Math.abs(x - sx); if (d < 12) alpha = Math.min(alpha, d / 12); });
  ORDER.forEach((k, n) => {
    const r = robots[k], R = ROBOTS[k]; if (!r) return;
    r.holder.visible = n === idx;
    if (n !== idx) return;
    let xr = x, walked = Math.abs(dx);
    if (r.table) {                                     // stop at the table; the rest of the scroll drives the set-down
      const zx = zoneX(), span = Math.max(W - PAD() - zx, 1);
      xr = humX(x); walked = Math.abs(xr - humX(x - dx));
      r.place = Math.min(Math.max((x - zx) / span, 0), 1);
      if (r.place > 0) facing = 1;
    }
    phase += walked / (2 * R.stride * r.pxPerM); // feet planted: one cycle = 2 strides
    { const t = new URLSearchParams(location.search).get('ph'); if (t !== null) phase = +t; } // test hook
    if (k === 'a1') { // bounding jump: how airborne (0..1) and whether climbing in the travel direction
      let w = 0;
      if (!onIcon(x, r.halfPx)) for (const i of icons) { // airborne only when not standing on an icon
        const d = Math.abs(x - (i.l + i.r) / 2) - ((i.r - i.l) / 2 + r.halfPx);
        if (d > 0 && d < JUMP) w = Math.max(w, Math.sin(Math.PI * d / JUMP));
      }
      r.jump = { w, climb: (lift(x + 1, r.halfPx) - lift(x - 1, r.halfPx)) * facing > 0 };
    }
    R.pose(r, phase % 1);
    const s = r.pxPerM;
    r.holder.scale.set(facing * s, s, s);
    r.holder.position.set(xr, ground + lift(xr, r.halfPx), 0);
  });
  const hum = robots.custom;                           // the table stands at the stopping point whenever the humanoid is showing
  if (hum?.table) {
    const T = hum.table.holder; T.visible = ORDER[idx] === 'custom';
    T.scale.set(hum.pxPerM, hum.pxPerM, hum.pxPerM); T.position.set(placeX(), ground, 0);
    // fade in over the last ~90 px of the walk up to it
    const near = Math.min(Math.max(1 - (placeX() - hum.holder.position.x - 40) / 90, 0), 1);
    TABLE_MATS.forEach(m => { m.opacity = (m === matTableEdge ? .9 : 1) * alpha * near; });
    T.visible = T.visible && near > 0;
  }
  ALL_MATS.forEach(m => { m.opacity = m === matEdge ? .9 * alpha : alpha; });
  renderer.render(scene, camera);
  if (auto || x !== target) raf = requestAnimationFrame(frame);
}
const kick = () => { if (raf === null) raf = requestAnimationFrame(frame); };
const IDLE_MS = 180;
let lastScroll = -1e9, idleTimer = null;
function onScroll() {
  lastScroll = performance.now(); kick();
  clearTimeout(idleTimer); idleTimer = setTimeout(kick, IDLE_MS + 20); // re-check once scrolling stops
}

Promise.all(ORDER.map(loadRobot)).then(list => {
  ORDER.forEach((k, n) => { robots[k] = list[n]; });
  layout(); frame();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { layout(); kick(); });
});
