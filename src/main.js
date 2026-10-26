import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import './style.css';

const $ = (selector) => document.querySelector(selector);
const ui = {
  canvas: $('#solar-scene'), world: $('#world'), time: $('#time-slider'), timeLabel: $('#time-label'),
  latitude: $('#latitude-slider'), latitudeLabel: $('#latitude-label'), location: $('#location-label'),
  worldCoordinate: $('#world-coordinate'), capacity: $('#capacity-slider'), capacityLabel: $('#capacity-label'),
  batteryPercent: $('#battery-percent'), batteryFill: $('#battery-fill'), batteryMode: $('#battery-mode'),
  solarPower: $('#solar-power'), loadPower: $('#load-power'), netPower: $('#net-power'),
  powerTrack: $('#power-track-fill'), challengeProgress: $('#challenge-progress'),
  challengeTime: $('#challenge-time'), challengeState: $('#challenge-state'),
  play: $('#play-button'), playIcon: $('#play-icon'), playLabel: $('#play-label'),
  deviceCount: $('#device-count'), beamLabel: $('#beam-label'), panelAngle: $('#panel-angle'), arButton: $('#ar-button'),
  toast: $('#toast'),
};

const MAX_SOLAR_WATTS = 120; // Editable educational scenario; not a verified device specification.
const SIMULATION_SECONDS = 60; // One real second represents one simulated minute.
const CHALLENGE_TARGET = 70;
const deviceInfo = {
  lamp: { watts: 9, label: 'Bombillo LED' },
  phone: { watts: 15, label: 'Celular' },
  laptop: { watts: 65, label: 'Computador' },
};
const devicesOn = new Set(['lamp', 'phone']);
let batteryPercent = 85;
let remainingSeconds = SIMULATION_SECONDS;
let isRunning = false;
let completed = false;
let toastTimer;
let solarWatts = 0;
let solarDaylight = 0;
const sunDirection = new THREE.Vector3(0, 1, 0);
let loadWatts = 0;
let sunAngle = 11;
let latitude = 4.7;
let activeXRMode = '';

const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');

const scene = new THREE.Scene();
const skyColor = new THREE.Color('#d1d8cf');
scene.background = skyColor;
const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
camera.position.set(0, 2.7, 10.8);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.enablePan = false;
orbit.minDistance = 6.5;
orbit.maxDistance = 18;
orbit.minPolarAngle = Math.PI * 0.22;
orbit.maxPolarAngle = Math.PI * 0.78;
orbit.target.set(-0.35, -0.65, 0);

scene.add(new THREE.HemisphereLight(0xf5ffe4, 0x778477, 2.2));
const sunLight = new THREE.DirectionalLight(0xfff1be, 2.5);
sunLight.position.set(-4, 7, 8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 28;
sunLight.shadow.bias = -0.0004;
scene.add(sunLight);
scene.add(sunLight.target);
const fillLight = new THREE.DirectionalLight(0xe5f2ff, 1.1);
fillLight.position.set(5, 1, 5);
scene.add(fillLight);

const stage = new THREE.Group();
scene.add(stage);
const interactiveMeshes = [];
const deviceGroups = {};
const cableLines = {};
const deviceRings = {};
const worldMaterial = (color, roughness = 0.7, metalness = 0.08) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

// A natural clearing forms a finite, gently uneven campsite that remains grounded in AR.
const campEnvironment = new THREE.Group();
stage.add(campEnvironment);
function makeClearingGeometry() {
  const segments = 96;
  const positions = [0, 0, 0];
  const indices = [];
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const radius = 13.5 + 0.75 * Math.sin(3 * a + 0.8) + 0.42 * Math.sin(7 * a - 0.4);
    positions.push(radius * Math.cos(a), 0.035 * Math.sin(4 * a), radius * Math.sin(a));
  }
  for (let i = 0; i < segments; i += 1) indices.push(0, ((i + 1) % segments) + 1, i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
const floor = new THREE.Mesh(makeClearingGeometry(), new THREE.MeshStandardMaterial({ color: '#667b4d', roughness: 0.98, flatShading: true, side: THREE.DoubleSide }));
floor.position.set(0, -3.64, 0);
floor.receiveShadow = true;
campEnvironment.add(floor);

// Delicate orbit markings establish a scale without altering the reference product.
const orbitPoints = [];
for (let i = 0; i <= 140; i += 1) {
  const angle = (i / 140) * Math.PI;
  orbitPoints.push(new THREE.Vector3(-1.55 + Math.cos(angle) * 4.5, 0.25 + Math.sin(angle) * 3.75, -0.7));
}
const orbitArc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPoints), new THREE.LineBasicMaterial({ color: '#9ca99b', transparent: true, opacity: 0.6 }));
stage.add(orbitArc);
for (const x of [-4.75, 1.65]) {
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), new THREE.MeshBasicMaterial({ color: '#708468' }));
  marker.position.set(x, 0.28, -0.68);
  stage.add(marker);
}

// Build the portable power station entirely from real Three.js meshes: no product-image plane.
const generator = new THREE.Group();
generator.position.set(-1.55, 0.32, 0);
generator.scale.setScalar(1.12);
stage.add(generator);
const steel = worldMaterial('#4a4f50', 0.38, 0.72);
const brushedSteel = worldMaterial('#858987', 0.3, 0.82);
const darkSteel = worldMaterial('#303536', 0.4, 0.62);
const rubber = worldMaterial('#25292a', 0.68, 0.18);
const blueCellMaterials = ['#174c82', '#1c568e', '#205b96', '#16497d'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.28, metalness: 0.24, emissive: color, emissiveIntensity: 0.08 }));
function addBox(parent, size, position, material, radius = 0) {
  const geometry = radius ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, Math.min(radius, Math.min(...size) * 0.48)) : new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function addCylinder(parent, radius, length, position, material, axis = 'z', radialSegments = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, radialSegments), material);
  mesh.position.set(...position);
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function addRod(parent, start, end, radius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.76, radius, 1, 12), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  mesh.scale.y = direction.length();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function resizeRod(mesh, start, end) {
  const direction = new THREE.Vector3().subVectors(end, start);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  mesh.scale.y = direction.length();
}
function addTriangle(parent, points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((point) => point.toArray()), 3));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function addQuad(parent, points, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((point) => point.toArray()), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Low-poly spruce trees, grass, tent and fire ring create a small mixed-reality campsite.
let randomSeed = 917;
function random() {
  randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
  return randomSeed / 4294967296;
}
const treeMaterials = ['#315a3d', '#3e6943', '#496f48', '#2b5139'].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, flatShading: true }));
const trunkMaterial = worldMaterial('#705239', 0.98, 0);
function addFirTree(x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.position.set(x, -3.64, z);
  tree.scale.setScalar(scale);
  campEnvironment.add(tree);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.20, 1.45, 7), trunkMaterial);
  trunk.position.y = 0.68;
  trunk.castShadow = true;
  tree.add(trunk);
  for (const tier of [
    { radius: 1.12, height: 2.05, y: 1.45 },
    { radius: 0.91, height: 1.85, y: 2.42 },
    { radius: 0.67, height: 1.58, y: 3.26 },
    { radius: 0.42, height: 1.22, y: 4.00 },
  ]) {
    const foliage = new THREE.Mesh(new THREE.ConeGeometry(tier.radius, tier.height, 7, 1), treeMaterials[Math.floor(random() * treeMaterials.length)]);
    foliage.position.y = tier.y;
    foliage.rotation.y = random() * Math.PI;
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    tree.add(foliage);
  }
  return tree;
}
[
  [-11, -7, 1.05], [-7, -10, 0.92], [-2, -11, 1.08], [3, -11, 1.0], [9, -8, 1.1],
  [11, -2, 0.9], [10, 5, 1.0], [6, 10, 0.9], [0, 11, 1.08], [-6, 9, 0.95], [-11, 4, 1.05],
].forEach(([x, z, size]) => addFirTree(x, z, size));

// Irregular tufts of grass are instanced to keep the scene light on mobile/XR hardware.
const grassGeometry = new THREE.ConeGeometry(0.038, 0.23, 3, 1);
const grassMaterial = new THREE.MeshStandardMaterial({ color: '#8aa05e', roughness: 1, flatShading: true, vertexColors: true });
const grassBlades = new THREE.InstancedMesh(grassGeometry, grassMaterial, 460);
grassBlades.castShadow = false;
grassBlades.receiveShadow = false;
const bladeTransform = new THREE.Object3D();
let bladeIndex = 0;
while (bladeIndex < 460) {
  const x = (random() - 0.5) * 25;
  const z = (random() - 0.5) * 22;
  if (Math.hypot(x, z) > 12.5) continue;
  const nearStation = Math.hypot(x + 1.55, z) < 2.3;
  const nearDevices = [[1.95, 0.32], [3.22, 0.32], [4.55, 0.32]].some(([dx, dz]) => Math.hypot(x - dx, z - dz) < 0.62);
  const nearTent = Math.hypot(x - 5.5, z + 4.5) < 2.1;
  const nearFire = Math.hypot(x - 7.2, z - 2.4) < 1.25;
  if (nearStation || nearDevices || nearTent || nearFire) continue;
  bladeTransform.position.set(x, -3.50 + random() * 0.025, z);
  bladeTransform.rotation.set((random() - 0.5) * 0.16, random() * Math.PI, (random() - 0.5) * 0.16);
  const bladeScale = 0.7 + random() * 1.2;
  bladeTransform.scale.set(bladeScale, bladeScale, bladeScale);
  bladeTransform.updateMatrix();
  grassBlades.setMatrixAt(bladeIndex, bladeTransform.matrix);
  const bladeColor = new THREE.Color().setHSL(0.22 + random() * 0.08, 0.28 + random() * 0.2, 0.36 + random() * 0.18);
  grassBlades.setColorAt(bladeIndex, bladeColor);
  bladeIndex += 1;
}
grassBlades.instanceMatrix.needsUpdate = true;
if (grassBlades.instanceColor) grassBlades.instanceColor.needsUpdate = true;
campEnvironment.add(grassBlades);

// A fabric A-frame tent: triangulated canvas panels, dark entrance, ridge pole and guy lines.
const tent = new THREE.Group();
tent.position.set(5.55, -3.62, -4.55);
campEnvironment.add(tent);
const tentWidth = 3.35;
const tentDepth = 2.45;
const tentHeight = 2.55;
const frontZ = tentDepth / 2;
const backZ = -tentDepth / 2;
const tentOlive = new THREE.MeshStandardMaterial({ color: '#89905f', roughness: 0.96, side: THREE.DoubleSide, flatShading: true });
const tentShade = new THREE.MeshStandardMaterial({ color: '#677148', roughness: 0.98, side: THREE.DoubleSide, flatShading: true });
const tentDoor = new THREE.MeshStandardMaterial({ color: '#29362a', roughness: 1, side: THREE.DoubleSide, flatShading: true });
const halfTent = tentWidth / 2;
addQuad(tent, [new THREE.Vector3(-halfTent, 0, frontZ), new THREE.Vector3(0, tentHeight, frontZ), new THREE.Vector3(0, tentHeight, backZ), new THREE.Vector3(-halfTent, 0, backZ)], tentOlive);
addQuad(tent, [new THREE.Vector3(halfTent, 0, frontZ), new THREE.Vector3(halfTent, 0, backZ), new THREE.Vector3(0, tentHeight, backZ), new THREE.Vector3(0, tentHeight, frontZ)], tentShade);
addTriangle(tent, [new THREE.Vector3(-halfTent, 0, frontZ + 0.012), new THREE.Vector3(halfTent, 0, frontZ + 0.012), new THREE.Vector3(0, tentHeight, frontZ + 0.012)], tentOlive);
addTriangle(tent, [new THREE.Vector3(-halfTent, 0, backZ - 0.012), new THREE.Vector3(0, tentHeight, backZ - 0.012), new THREE.Vector3(halfTent, 0, backZ - 0.012)], tentShade);
addTriangle(tent, [new THREE.Vector3(-0.43, 0.03, frontZ + 0.035), new THREE.Vector3(0.43, 0.03, frontZ + 0.035), new THREE.Vector3(0, 1.42, frontZ + 0.035)], tentDoor);
addBox(tent, [tentWidth, 0.05, tentDepth], [0, 0.015, 0], worldMaterial('#4b523d', 0.9, 0.02), 0.02);
addRod(tent, new THREE.Vector3(0, tentHeight, backZ), new THREE.Vector3(0, tentHeight, frontZ), 0.045, brushedSteel);
const ropeMaterial = new THREE.MeshStandardMaterial({ color: '#d1c5a2', roughness: 0.9 });
for (const side of [-1, 1]) {
  const rope = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * halfTent * 0.72, 1.36, frontZ * 0.76),
    new THREE.Vector3(side * 2.0, 0.45, frontZ + 0.55),
    new THREE.Vector3(side * 2.05, 0.05, frontZ + 0.62),
  ]);
  const guyLine = new THREE.Mesh(new THREE.TubeGeometry(rope, 14, 0.018, 5, false), ropeMaterial);
  tent.add(guyLine);
  addBox(tent, [0.11, 0.10, 0.11], [side * 2.05, 0.05, frontZ + 0.62], darkSteel, 0.025);
}

// A small ring of stones and animated-looking low-poly flames completes the camp clearing.
const fireCenter = new THREE.Vector3(7.2, -3.58, 2.4);
const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#716c5d', roughness: 0.98, flatShading: true });
for (let i = 0; i < 9; i += 1) {
  const a = (i / 9) * Math.PI * 2;
  const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.20 + random() * 0.08, 0), stoneMaterial);
  stone.position.set(fireCenter.x + Math.cos(a) * 0.74, fireCenter.y + 0.12, fireCenter.z + Math.sin(a) * 0.74);
  stone.scale.set(1.25, 0.62, 1);
  stone.castShadow = true;
  campEnvironment.add(stone);
}
for (const [i, color] of ['#ffb32f', '#ff6a25', '#ffe26f'].entries()) {
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.26 - i * 0.035, 0.9 - i * 0.1, 5, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.84 - i * 0.12, depthWrite: false }));
  flame.position.set(fireCenter.x + (i - 1) * 0.11, fireCenter.y + 0.48, fireCenter.z);
  campEnvironment.add(flame);
}
const fireGlow = new THREE.PointLight(0xff8c36, 3, 5, 2);
fireGlow.position.set(fireCenter.x, fireCenter.y + 1.1, fireCenter.z);
campEnvironment.add(fireGlow);

// Reinforced graphite-metal enclosure, matching the hard-edged portable case in the reference.
addBox(generator, [2.56, 1.55, 1.58], [0, -2.67, 0], steel, 0.12);
addBox(generator, [2.42, 0.10, 1.46], [0, -1.91, 0], brushedSteel, 0.045);
addBox(generator, [2.34, 1.34, 0.045], [0, -2.68, 0.806], darkSteel, 0.045);
addBox(generator, [2.30, 0.045, 0.045], [0, -2.02, 0.837], brushedSteel, 0.018);
addBox(generator, [2.30, 0.035, 0.045], [0, -3.34, 0.837], brushedSteel, 0.014);
// Side and back rails give the enclosure real depth and a metallic, extruded structure.
for (const side of [-1, 1]) {
  addBox(generator, [0.065, 1.24, 1.30], [side * 1.286, -2.68, 0], brushedSteel, 0.025);
  addBox(generator, [0.08, 1.08, 0.065], [side * 1.29, -2.7, 0.66], steel, 0.018);
  for (let groove = 0; groove < 4; groove += 1) {
    addBox(generator, [0.018, 0.012, 0.76], [side * 1.331, -2.34 - groove * 0.18, -0.02], darkSteel, 0.004);
  }
}
addBox(generator, [2.36, 1.28, 0.06], [0, -2.68, -0.79], darkSteel, 0.04);
// Rubber corner guards and impact-protected feet.
for (const x of [-1.13, 1.13]) {
  for (const y of [-2.04, -3.29]) {
    for (const z of [-0.62, 0.64]) {
      addBox(generator, [0.34, 0.34, 0.32], [x, y, z], rubber, 0.075);
      addBox(generator, [0.22, 0.055, 0.055], [x, y + (y < -2.6 ? 0.11 : -0.11), z + (z > 0 ? 0.163 : -0.163)], brushedSteel, 0.018);
    }
  }
  for (const z of [-0.5, 0.5]) {
    addCylinder(generator, 0.13, 0.16, [x * 0.78, -3.46, z], rubber, 'y', 20);
  }
}
// Heavy folding carry handle on the left side of the enclosure.
addBox(generator, [0.18, 0.20, 0.25], [-1.38, -2.36, 0.1], rubber, 0.06);
addBox(generator, [0.18, 0.20, 0.25], [-1.38, -3.02, 0.1], rubber, 0.06);
addBox(generator, [0.20, 0.63, 0.20], [-1.57, -2.69, 0.1], darkSteel, 0.075);
addBox(generator, [0.14, 0.48, 0.16], [-1.68, -2.69, 0.1], rubber, 0.06);
addBox(generator, [0.12, 0.38, 0.035], [-1.755, -2.69, 0.1], brushedSteel, 0.014);

// Front LCD: a tiny generated display texture on a physical recessed screen, not a photo of the product.
const displayCanvas = document.createElement('canvas');
displayCanvas.width = 512;
displayCanvas.height = 256;
const displayContext = displayCanvas.getContext('2d');
const displayTexture = new THREE.CanvasTexture(displayCanvas);
displayTexture.colorSpace = THREE.SRGBColorSpace;
let lastDisplayReadout = '';
function drawBatteryDisplay(level = batteryPercent, output = 0) {
  const readout = `${Math.round(level)}-${Math.round(output)}`;
  if (readout === lastDisplayReadout) return;
  lastDisplayReadout = readout;
  const ctx = displayContext;
  const w = displayCanvas.width;
  const h = displayCanvas.height;
  ctx.clearRect(0, 0, w, h);
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#0755a1');
  gradient.addColorStop(1, '#1478c0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#a9d9fa';
  ctx.lineWidth = 9;
  ctx.strokeRect(20, 20, w - 40, h - 40);
  // Battery icon and a clearly legible live percentage.
  ctx.strokeStyle = '#d3efff';
  ctx.lineWidth = 12;
  ctx.strokeRect(55, 70, 82, 118);
  ctx.fillRect(80, 54, 33, 15);
  ctx.fillStyle = '#9fe17a';
  ctx.fillRect(67, 178 - Math.max(0, Math.min(100, level)) * 0.88, 58, Math.max(4, Math.min(88, level * 0.88)));
  ctx.fillStyle = '#e8f7ff';
  ctx.font = '600 44px monospace';
  ctx.fillText('12.6V', 180, 107);
  ctx.font = '600 42px monospace';
  ctx.fillText(`${Math.round(level)}%`, 180, 167);
  ctx.font = '26px sans-serif';
  ctx.fillText('☼', 410, 77);
  ctx.font = '20px monospace';
  ctx.fillText(`${Math.round(output)}W`, 365, 190);
  displayTexture.needsUpdate = true;
}
drawBatteryDisplay();
addBox(generator, [0.87, 0.58, 0.13], [-0.10, -2.43, 0.855], rubber, 0.07);
addBox(generator, [0.75, 0.44, 0.025], [-0.10, -2.43, 0.93], new THREE.MeshBasicMaterial({ map: displayTexture }), 0.025);
// Small status lights to the right of the screen.
for (const [index, color] of ['#e44b41', '#f3ca4f', '#72d34a', '#e34b45'].entries()) {
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.066, 18, 14), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.24 }));
  light.position.set(0.86 + (index % 2) * 0.20, -2.35 - Math.floor(index / 2) * 0.29, 0.92);
  generator.add(light);
  addCylinder(generator, 0.088, 0.035, [light.position.x, light.position.y, 0.885], rubber, 'z', 24);
}
// Rocker switch and outputs on the lower front face.
addBox(generator, [0.31, 0.49, 0.10], [-0.72, -3.11, 0.87], rubber, 0.045);
addBox(generator, [0.205, 0.34, 0.065], [-0.72, -3.11, 0.94], new THREE.MeshStandardMaterial({ color: '#d83b32', roughness: 0.3, metalness: 0.08 }), 0.025);
addBox(generator, [0.14, 0.018, 0.012], [-0.72, -3.02, 0.981], new THREE.MeshBasicMaterial({ color: '#ffe4d8' }), 0.004);
addBox(generator, [0.14, 0.018, 0.012], [-0.72, -3.20, 0.981], new THREE.MeshBasicMaterial({ color: '#ffe4d8' }), 0.004);
for (const x of [-0.20, 0.18]) {
  addBox(generator, [0.31, 0.31, 0.09], [x, -3.12, 0.87], brushedSteel, 0.025);
  addBox(generator, [0.225, 0.20, 0.06], [x, -3.12, 0.93], rubber, 0.015);
  for (const offset of [-0.045, 0.045]) addBox(generator, [0.16, 0.022, 0.014], [x, -3.12 + offset, 0.968], new THREE.MeshBasicMaterial({ color: offset > 0 ? '#258ed1' : '#161c21' }), 0.004);
}
// 12 V socket with a bright metallic collar and deep black receptacle.
addCylinder(generator, 0.19, 0.085, [0.82, -3.11, 0.87], brushedSteel, 'z', 32);
addCylinder(generator, 0.135, 0.03, [0.82, -3.11, 0.927], rubber, 'z', 32);
addCylinder(generator, 0.07, 0.035, [0.82, -3.11, 0.95], worldMaterial('#080b0d', 0.25, 0.2), 'z', 24);
addCylinder(generator, 0.025, 0.02, [0.82, -3.11, 0.973], brushedSteel, 'z', 20);
// Visible fasteners give the front fascia the rugged industrial construction of the reference.
for (const x of [-1.01, 1.04]) {
  for (const y of [-2.12, -3.23]) {
    addCylinder(generator, 0.055, 0.025, [x, y, 0.855], rubber, 'z', 16);
    addBox(generator, [0.06, 0.009, 0.012], [x, y, 0.871], brushedSteel, 0.003);
  }
}

// The panel rotates about ONE real lateral shaft at the rear supports (never around its center).
// Its local +Y points from the rear hinge toward the front edge; only rotation.x is actuated.
const PANEL_MIN_TILT = 0;
const PANEL_MAX_TILT = THREE.MathUtils.degToRad(60);
const panelPivot = new THREE.Group();
panelPivot.position.set(0, -0.63, -0.58);
panelPivot.rotation.set(-Math.PI / 2 + THREE.MathUtils.degToRad(18), 0, 0);
generator.add(panelPivot);
const panelCenterY = -0.66;
addBox(panelPivot, [2.34, 1.32, 0.13], [0, panelCenterY, 0], brushedSteel, 0.065);
addBox(panelPivot, [2.12, 1.12, 0.035], [0, panelCenterY, 0.083], darkSteel, 0.025);
const cellWidth = 0.392;
const cellHeight = 0.265;
const cellGapX = 0.018;
const cellGapY = 0.02;
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 5; col += 1) {
    const x = (col - 2) * (cellWidth + cellGapX);
    const y = panelCenterY + (1.5 - row) * (cellHeight + cellGapY);
    addBox(panelPivot, [cellWidth, cellHeight, 0.018], [x, y, 0.112], blueCellMaterials[(row * 2 + col) % blueCellMaterials.length], 0.004);
    for (const finger of [-1, 0, 1]) {
      addBox(panelPivot, [0.008, cellHeight * 0.88, 0.006], [x + finger * 0.11, y, 0.124], worldMaterial('#a8bac0', 0.25, 0.8), 0.002);
    }
  }
}
// Four frame rails are rigidly attached to the moving panel assembly.
addBox(panelPivot, [2.28, 0.06, 0.08], [0, -0.015, 0.07], brushedSteel, 0.018);
addBox(panelPivot, [2.28, 0.06, 0.08], [0, -1.305, 0.07], brushedSteel, 0.018);
for (const x of [-1.11, 1.11]) addBox(panelPivot, [0.06, 1.30, 0.08], [x, panelCenterY, 0.07], brushedSteel, 0.018);

// Tall rear-side brackets hold the single horizontal hinge shaft above the case.
for (const x of [-0.98, 0.98]) {
  addRod(generator, new THREE.Vector3(x, -1.88, -0.58), new THREE.Vector3(x, -0.63, -0.58), 0.062, brushedSteel);
  addBox(generator, [0.25, 0.17, 0.25], [x, -1.86, -0.58], rubber, 0.035);
  addCylinder(generator, 0.11, 0.035, [x, -0.63, -0.58], darkSteel, 'x', 24);
}
addCylinder(generator, 0.065, 2.14, [0, -0.63, -0.58], brushedSteel, 'x', 28);
for (const x of [-1.13, 1.13]) addCylinder(generator, 0.09, 0.07, [x, -0.63, -0.58], rubber, 'x', 24);

// Visible servo housing and a telescoping pushrod articulate the panel around the rear shaft.
addBox(generator, [0.39, 0.38, 0.34], [-1.18, -1.36, -0.39], darkSteel, 0.055);
addBox(generator, [0.26, 0.23, 0.04], [-1.18, -1.36, -0.205], new THREE.MeshStandardMaterial({ color: '#315d75', roughness: 0.4, metalness: 0.48 }), 0.025);
addCylinder(generator, 0.09, 0.07, [-1.18, -1.18, -0.37], brushedSteel, 'x', 20);
const servoBase = new THREE.Vector3(-1.18, -1.18, -0.34);
const servoPanelPoint = new THREE.Vector3(-0.97, -1.05, -0.065);
const servoRod = addRod(generator, servoBase, new THREE.Vector3(-0.97, -1.15, -0.34), 0.05, brushedSteel);
addCylinder(generator, 0.075, 0.045, [-0.97, -1.15, -0.34], rubber, 'x', 20);
let targetPanelTilt = THREE.MathUtils.degToRad(18);

function updatePanelMechanics(delta) {
  const currentTilt = THREE.MathUtils.clamp(panelPivot.rotation.x + Math.PI / 2, PANEL_MIN_TILT, PANEL_MAX_TILT);
  const nextTilt = THREE.MathUtils.damp(currentTilt, targetPanelTilt, 2.8, delta);
  panelPivot.rotation.set(-Math.PI / 2 + THREE.MathUtils.clamp(nextTilt, PANEL_MIN_TILT, PANEL_MAX_TILT), 0, 0);
  stage.updateMatrixWorld(true);
  const actuatorEnd = panelPivot.localToWorld(servoPanelPoint.clone());
  generator.worldToLocal(actuatorEnd);
  resizeRod(servoRod, servoBase, actuatorEnd);
  ui.panelAngle.textContent = `${Math.round(THREE.MathUtils.radToDeg(panelPivot.rotation.x + Math.PI / 2))}°`;
  updateSolarBeam();
  updateSolarCapture();
}
function getPanelStagePosition() {
  stage.updateMatrixWorld(true);
  const point = panelPivot.localToWorld(new THREE.Vector3(0, panelCenterY, 0.15));
  return stage.worldToLocal(point);
}

const sunGroup = new THREE.Group();
const sunCore = new THREE.Mesh(new THREE.SphereGeometry(0.31, 32, 24), new THREE.MeshBasicMaterial({ color: '#ffe68c' }));
sunGroup.add(sunCore);
const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffe291', transparent: true, opacity: 0.18, depthWrite: false }));
sunGroup.add(sunHalo);
const sunRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: '#fae3a0', transparent: true, opacity: 0.75 }));
sunGroup.add(sunRing);
sunGroup.userData.action = 'sun';
sunGroup.position.set(0, 2.5, 2.5);
stage.add(sunGroup);
interactiveMeshes.push(sunCore, sunHalo, sunRing);
const localSunLight = new THREE.PointLight(0xffdc82, 23, 8, 1.6);
stage.add(localSunLight);

const beamGeometry = new THREE.BufferGeometry().setFromPoints([sunGroup.position, getPanelStagePosition()]);
const solarBeam = new THREE.Line(beamGeometry, new THREE.LineDashedMaterial({ color: '#d0ef83', dashSize: 0.17, gapSize: 0.13, transparent: true, opacity: 0.65, depthWrite: false }));
solarBeam.computeLineDistances();
stage.add(solarBeam);
function updateSolarBeam() {
  solarBeam.geometry.setFromPoints([sunGroup.position.clone(), getPanelStagePosition()]);
  solarBeam.computeLineDistances();
}
function updateSolarCapture() {
  const actualTilt = THREE.MathUtils.clamp(panelPivot.rotation.x + Math.PI / 2, PANEL_MIN_TILT, PANEL_MAX_TILT);
  const panelNormal = new THREE.Vector3(0, Math.cos(actualTilt), Math.sin(actualTilt));
  const incidence = Math.max(0, panelNormal.dot(sunDirection));
  const nextPower = solarDaylight > 0 ? Math.round(MAX_SOLAR_WATTS * Math.pow(incidence, 1.25)) : 0;
  if (nextPower !== solarWatts) {
    solarWatts = nextPower;
    updateTelemetry();
  }
  solarBeam.material.opacity = solarWatts > 0 ? 0.18 + 0.58 * solarDaylight : 0.04;
  ui.beamLabel.classList.toggle('is-dim', solarWatts <= 0);
}

const cableMaterial = new THREE.MeshStandardMaterial({ color: '#27342b', roughness: 0.48, metalness: 0.32, emissive: '#253027', emissiveIntensity: 0.08, transparent: true, opacity: 0.72 });
function makeDeviceBase(id, x, y, z) {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.userData.deviceId = id;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.08, 36), worldMaterial('#aeb8ad', 0.48, 0.32));
  pad.position.set(0, -0.49, 0);
  pad.castShadow = true;
  pad.receiveShadow = true;
  root.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.022, 8, 48), new THREE.MeshBasicMaterial({ color: '#b4dc7a', transparent: true, opacity: 0.7 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.435;
  root.add(ring);
  deviceRings[id] = ring;
  stage.add(root);
  deviceGroups[id] = root;
  return root;
}
function makeMesh(geometry, material, group, position, id, interactive = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.deviceId = id;
  group.add(mesh);
  if (interactive) interactiveMeshes.push(mesh);
  return mesh;
}

// Small, recognizable 3D appliances are connected by simulated leads to the unit's output area.
const lamp = makeDeviceBase('lamp', 1.95, -3.11, 0.32);
makeMesh(new THREE.CylinderGeometry(0.15, 0.23, 0.13, 24), worldMaterial('#35453b', 0.3, 0.45), lamp, [0, -0.385, 0], 'lamp');
makeMesh(new THREE.CylinderGeometry(0.045, 0.07, 0.48, 16), worldMaterial('#57685a', 0.35, 0.6), lamp, [0, -0.085, 0], 'lamp');
const lampBulb = makeMesh(new THREE.SphereGeometry(0.22, 24, 18), new THREE.MeshStandardMaterial({ color: '#fff2bb', emissive: '#ffd967', emissiveIntensity: 0.65, roughness: 0.22 }), lamp, [0, 0.29, 0], 'lamp');
lampBulb.scale.set(0.82, 1.18, 0.82);
const lampShade = makeMesh(new THREE.ConeGeometry(0.37, 0.25, 32, 1, true), worldMaterial('#6a7c67', 0.38, 0.25), lamp, [0, 0.43, 0], 'lamp', false);
lampShade.material.side = THREE.DoubleSide;

const laptop = makeDeviceBase('laptop', 3.22, -3.11, 0.32);
makeMesh(new THREE.BoxGeometry(0.9, 0.065, 0.57), worldMaterial('#5b6761', 0.26, 0.72), laptop, [0, -0.39, 0], 'laptop');
makeMesh(new THREE.BoxGeometry(0.77, 0.52, 0.045), worldMaterial('#35443c', 0.27, 0.58), laptop, [0, -0.09, -0.25], 'laptop');
const laptopScreen = makeMesh(new THREE.BoxGeometry(0.68, 0.42, 0.012), new THREE.MeshStandardMaterial({ color: '#86aeaa', emissive: '#8dc6b7', emissiveIntensity: 0.52, roughness: 0.22, metalness: 0.18 }), laptop, [0, -0.085, -0.219], 'laptop');

const phone = makeDeviceBase('phone', 4.55, -3.11, 0.32);
makeMesh(new THREE.BoxGeometry(0.38, 0.67, 0.065), worldMaterial('#28342f', 0.24, 0.55), phone, [0, -0.12, 0], 'phone');
const phoneScreen = makeMesh(new THREE.BoxGeometry(0.32, 0.56, 0.012), new THREE.MeshStandardMaterial({ color: '#78a6a0', emissive: '#6ac3ae', emissiveIntensity: 0.55, roughness: 0.2 }), phone, [0, -0.11, 0.04], 'phone');

stage.updateMatrixWorld(true);
const socketPosition = (x, y, z) => stage.worldToLocal(generator.localToWorld(new THREE.Vector3(x, y, z)));
const socketAnchors = {
  lamp: socketPosition(0.18, -3.12, 0.99),
  phone: socketPosition(-0.20, -3.12, 0.99),
  laptop: socketPosition(0.82, -3.11, 0.99),
};
for (const id of Object.keys(deviceInfo)) {
  const target = deviceGroups[id].position.clone();
  const start = socketAnchors[id];
  const end = new THREE.Vector3(target.x - 0.12, target.y - 0.34, target.z + 0.04);
  const middle = (start.x + end.x) * 0.5;
  const points = [start, new THREE.Vector3(start.x + 0.34, -2.84, 1.12), new THREE.Vector3(middle, -2.72, 0.92), new THREE.Vector3(end.x - 0.22, -2.95, 0.56), end];
  const curve = new THREE.CatmullRomCurve3(points);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.022, 8, false), cableMaterial.clone());
  cable.castShadow = true;
  stage.add(cable);
  cableLines[id] = cable;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerStart = null;
function toggleDevice(id) {
  if (!deviceInfo[id]) return;
  if (devicesOn.has(id)) devicesOn.delete(id); else devicesOn.add(id);
  updateDevices();
  notify(`${deviceInfo[id].label}: ${devicesOn.has(id) ? 'conectado' : 'desconectado'}`);
}
function handleHit(object) {
  if (!object) return;
  const id = object.userData.deviceId || object.parent?.userData.deviceId;
  if (id && deviceInfo[id]) toggleDevice(id);
  else if (object.userData.action === 'sun' || object.parent?.userData.action === 'sun') {
    ui.time.value = String(Math.min(19, Number(ui.time.value) + 0.5));
    updateSun();
    notify(`Hora simulada: ${ui.timeLabel.textContent}`);
  }
}
ui.canvas.addEventListener('pointerdown', (event) => { pointerStart = { x: event.clientX, y: event.clientY }; });
ui.canvas.addEventListener('pointerup', (event) => {
  if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) { pointerStart = null; return; }
  const rect = ui.canvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  handleHit(raycaster.intersectObjects(interactiveMeshes, false)[0]?.object);
  pointerStart = null;
});

function updateDevices() {
  loadWatts = 0;
  for (const [id, info] of Object.entries(deviceInfo)) {
    const active = devicesOn.has(id);
    if (active) loadWatts += info.watts;
    const button = document.querySelector(`[data-device="${id}"]`);
    button.classList.toggle('is-on', active);
    button.setAttribute('aria-pressed', String(active));
    deviceRings[id].visible = active;
    cableLines[id].visible = active;
    const cableMaterialForId = cableLines[id].material;
    cableMaterialForId.color.set(active ? '#a9d764' : '#27342b');
    cableMaterialForId.emissive.set(active ? '#709d35' : '#253027');
    cableMaterialForId.emissiveIntensity = active ? 0.32 : 0.05;
    cableMaterialForId.opacity = active ? 0.9 : 0.28;
    if (id === 'lamp') lampBulb.material.emissiveIntensity = active ? 1.2 : 0.08;
    if (id === 'laptop') laptopScreen.material.emissiveIntensity = active ? 0.85 : 0.08;
    if (id === 'phone') phoneScreen.material.emissiveIntensity = active ? 0.9 : 0.06;
  }
  ui.deviceCount.textContent = `${String(devicesOn.size).padStart(2, '0')} / 03`;
  updateTelemetry();
}
for (const button of document.querySelectorAll('.device-card')) button.addEventListener('click', () => toggleDevice(button.dataset.device));

function formatClock(value) {
  const hour = Math.floor(value);
  const minute = Math.round((value - hour) * 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function formatLatitude(value) {
  if (Math.abs(value) < 0.05) return '0.0°';
  return `${Math.abs(value).toFixed(1)}° ${value >= 0 ? 'N' : 'S'}`;
}
function updateSun() {
  sunAngle = Number(ui.time.value);
  latitude = Number(ui.latitude.value);
  const latitudeRadians = THREE.MathUtils.degToRad(latitude);
  const hourAngle = THREE.MathUtils.degToRad((sunAngle - 12) * 15);
  // Equinox approximation: a clear educational model, not a local weather forecast.
  const sinElevation = Math.sin(latitudeRadians) * 0 + Math.cos(latitudeRadians) * Math.cos(hourAngle);
  const elevation = Math.asin(THREE.MathUtils.clamp(sinElevation, -1, 1));
  const daylight = Math.max(0, Math.sin(elevation));
  solarDaylight = daylight;
  // A single-axis tracker follows elevation only; its normal is constrained to the rear X-axis hinge.
  targetPanelTilt = THREE.MathUtils.clamp(Math.PI / 2 - elevation, PANEL_MIN_TILT, PANEL_MAX_TILT);
  sunDirection.set(
    -Math.sin(hourAngle) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(hourAngle) * Math.cos(elevation),
  ).normalize();
  stage.updateMatrixWorld(true);
  const solarOrigin = generator.localToWorld(new THREE.Vector3(0, -0.9, 0));
  stage.worldToLocal(solarOrigin);
  sunGroup.position.copy(solarOrigin).addScaledVector(sunDirection, 4.1);
  sunGroup.visible = elevation > THREE.MathUtils.degToRad(-8);
  sunCore.material.color.set(daylight > 0 ? '#ffe68c' : '#edcba1');
  stage.updateMatrixWorld(true);
  sunLight.position.copy(stage.localToWorld(sunGroup.position.clone()));
  sunLight.target.position.copy(generator.localToWorld(new THREE.Vector3(0, -2.55, 0)));
  sunLight.intensity = solarWatts > 0 ? 1.2 + 1.3 * daylight : 0.35;
  localSunLight.position.copy(sunGroup.position);
  localSunLight.intensity = daylight > 0 ? 20 * daylight : 0;
  updateSolarBeam();
  updateSolarCapture();
  ui.timeLabel.textContent = formatClock(sunAngle);
  ui.latitudeLabel.textContent = formatLatitude(latitude);
  ui.worldCoordinate.innerHTML = `${formatLatitude(latitude)} &nbsp;·&nbsp; ${formatClock(sunAngle)}`;
  ui.location.textContent = Math.abs(latitude - 4.7) < 0.2 ? 'Bogotá, Colombia' : `Latitud ${formatLatitude(latitude)}`;
  updateRange(ui.time);
  updateRange(ui.latitude);
  updateTelemetry();
}
function updateRange(input) {
  const percent = ((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min))) * 100;
  input.style.setProperty('--progress', `${percent}%`);
}
ui.time.addEventListener('input', updateSun);
ui.latitude.addEventListener('input', updateSun);
$('#bogota-button').addEventListener('click', () => { ui.latitude.value = '4.7'; ui.time.value = '11'; updateSun(); notify('Ubicación y hora ajustadas a Bogotá.'); });

function updateTelemetry() {
  const capacity = Number(ui.capacity.value);
  const battery = Math.round(batteryPercent);
  const net = Math.round(solarWatts - loadWatts);
  ui.batteryPercent.textContent = battery;
  ui.batteryFill.style.width = `${Math.max(2, Math.min(100, battery))}%`;
  ui.solarPower.innerHTML = `${solarWatts} <small>W</small>`;
  ui.loadPower.innerHTML = `${loadWatts} <small>W</small>`;
  ui.netPower.textContent = `BALANCE ${net >= 0 ? '+' : ''}${net} W`;
  ui.batteryMode.classList.toggle('is-draining', net < 0);
  ui.batteryMode.innerHTML = net > 0 ? 'EN CARGA <span>↑</span>' : net < 0 ? 'EN USO <span>↓</span>' : 'ESTABLE <span>—</span>';
  ui.powerTrack.style.width = `${Math.min(100, (solarWatts / MAX_SOLAR_WATTS) * 100)}%`;
  drawBatteryDisplay(batteryPercent, solarWatts);
  $('#capacity-label').textContent = String(capacity);
}
ui.capacity.addEventListener('input', () => { updateRange(ui.capacity); updateTelemetry(); });

function updateChallengeDisplay() {
  const elapsed = SIMULATION_SECONDS - remainingSeconds;
  ui.challengeProgress.style.width = `${(elapsed / SIMULATION_SECONDS) * 100}%`;
  ui.challengeTime.textContent = `${String(Math.ceil(remainingSeconds)).padStart(2, '0')} MIN RESTANTES`;
  ui.playIcon.textContent = isRunning ? 'Ⅱ' : completed ? '↻' : '▶';
  ui.playLabel.textContent = isRunning ? 'Pausar reto' : completed ? 'Jugar de nuevo' : elapsed > 0 ? 'Continuar reto' : 'Iniciar reto';
  ui.challengeState.textContent = isRunning ? 'EN CURSO' : completed ? (batteryPercent >= CHALLENGE_TARGET ? 'MISIÓN CUMPLIDA' : 'INTENTA DE NUEVO') : elapsed > 0 ? 'PAUSADO' : 'LISTO';
  ui.challengeState.classList.toggle('state-success', completed && batteryPercent >= CHALLENGE_TARGET);
  ui.challengeState.classList.toggle('state-failed', completed && batteryPercent < CHALLENGE_TARGET);
}
function resetChallenge() {
  isRunning = false;
  completed = false;
  remainingSeconds = SIMULATION_SECONDS;
  batteryPercent = 85;
  ui.challengeProgress.style.width = '0%';
  updateChallengeDisplay();
  updateTelemetry();
}
ui.play.addEventListener('click', () => {
  if (completed) resetChallenge();
  isRunning = !isRunning;
  updateChallengeDisplay();
  if (isRunning) notify('¡Reto activo! Un segundo equivale a un minuto simulado.');
});
$('#reset-button').addEventListener('click', resetChallenge);

function notify(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('is-visible'), 2300);
}
$('#help-button').addEventListener('click', () => $('#help-dialog').showModal());

const controllerRays = [];
function setupController(index) {
  const controller = renderer.xr.getController(index);
  controller.addEventListener('select', () => {
    raycaster.setFromXRController(controller);
    const hit = raycaster.intersectObjects(interactiveMeshes, false)[0];
    if (hit) handleHit(hit.object);
  });
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5)]), new THREE.LineBasicMaterial({ color: '#c9f16c', transparent: true, opacity: 0.75 }));
  ray.name = 'controller-ray';
  ray.visible = false;
  controller.add(ray);
  scene.add(controller);
  controllerRays.push(ray);
}
setupController(0);
setupController(1);

const vrButton = XRButton.createButton(renderer, {
  optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'dom-overlay'],
  domOverlay: { root: document.querySelector('#experience') },
});
vrButton.setAttribute('aria-label', 'Entrar en realidad virtual');
$('#vr-button').append(vrButton);

renderer.xr.addEventListener('sessionstart', () => {
  orbit.enabled = false;
  const session = renderer.xr.getSession();
  activeXRMode = session?.environmentBlendMode === 'alpha-blend' ? 'ar' : 'vr';
  controllerRays.forEach((ray) => { ray.visible = activeXRMode === 'vr'; });
  if (activeXRMode === 'ar') {
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    stage.scale.setScalar(0.22);
    stage.position.set(0, 0.80, -1.65);
    campEnvironment.scale.setScalar(1.7);
    campEnvironment.position.y = 2.548;
    notify('Realidad aumentada activa. La estación y el campamento aparecen frente a ti.');
  } else {
    stage.scale.setScalar(0.45);
    stage.position.set(0, 1.65, -2.9);
    campEnvironment.scale.setScalar(1);
    campEnvironment.position.y = 0;
    notify('Realidad virtual activa. Apunta el control y pulsa para interactuar.');
  }
  document.body.classList.add('xr-active');
  session?.addEventListener('end', restoreDesktopScene, { once: true });
});
function restoreDesktopScene() {
  activeXRMode = '';
  stage.scale.setScalar(1);
  stage.position.set(0, 0, 0);
  campEnvironment.scale.setScalar(1);
  campEnvironment.position.set(0, 0, 0);
  scene.background = skyColor;
  renderer.setClearColor(skyColor, 1);
  orbit.enabled = true;
  controllerRays.forEach((ray) => { ray.visible = false; });
  document.body.classList.remove('xr-active');
}

ui.arButton.addEventListener('click', async () => {
  if (!navigator.xr) {
    notify('Este navegador no ofrece WebXR. Prueba Chrome en un dispositivo o visor compatible.');
    return;
  }
  try {
    const supported = await navigator.xr.isSessionSupported('immersive-ar');
    if (!supported) {
      notify('Realidad aumentada no disponible en este dispositivo. VR puede estar disponible desde el botón de la escena.');
      return;
    }
    const session = await navigator.xr.requestSession('immersive-ar', {
      optionalFeatures: ['local-floor', 'dom-overlay', 'hand-tracking'],
      domOverlay: { root: document.querySelector('#experience') },
    });
    await renderer.xr.setSession(session);
  } catch (error) {
    console.warn('No fue posible iniciar immersive-ar:', error);
    notify('No se pudo iniciar MR. Verifica HTTPS, permisos de cámara y compatibilidad del visor.');
  }
});

if (!navigator.xr) {
  $('.xr-status').setAttribute('title', 'WebXR requiere un navegador y un visor compatibles; GitHub Pages ofrece HTTPS.');
}

const clock = new THREE.Clock();
function animate() {
  const delta = Math.min(clock.getDelta(), 0.08);
  orbit.update();
  if (isRunning) {
    remainingSeconds = Math.max(0, remainingSeconds - delta);
    batteryPercent = THREE.MathUtils.clamp(batteryPercent + ((solarWatts - loadWatts) * delta / 60 / Number(ui.capacity.value)) * 100, 0, 100);
    if (remainingSeconds <= 0) {
      isRunning = false;
      completed = true;
      notify(batteryPercent >= CHALLENGE_TARGET ? `¡Misión cumplida! Terminaste con ${Math.round(batteryPercent)}% de batería.` : `Reto terminado: ${Math.round(batteryPercent)}%. Cambia la hora o las cargas e inténtalo de nuevo.`);
    }
    updateChallengeDisplay();
    updateTelemetry();
  }
  if (sunGroup.visible) sunRing.rotation.z += delta * 0.15;
  updatePanelMechanics(delta);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

const resizeObserver = new ResizeObserver(() => {
  const width = ui.world.clientWidth;
  const height = ui.world.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = width / height < 1.15 ? 52 : 43;
  camera.updateProjectionMatrix();
});
resizeObserver.observe(ui.world);

for (const input of [ui.time, ui.latitude, ui.capacity]) updateRange(input);
updateDevices();
updateSun();
updateChallengeDisplay();
