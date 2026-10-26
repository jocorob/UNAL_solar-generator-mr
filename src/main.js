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
  deviceCount: $('#device-count'), beamLabel: $('#beam-label'), arButton: $('#ar-button'),
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
let loadWatts = 0;
let sunAngle = 11;
let latitude = 4.7;
let activeXRMode = '';

const renderer = new THREE.WebGLRenderer({ canvas: ui.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
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
camera.position.set(0, 0.2, 10.8);
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

// A softly lit tabletop grounds the procedural 3D equipment in a common scene.
const floor = new THREE.Mesh(new THREE.BoxGeometry(80, 0.12, 80), worldMaterial('#bcc5bb', 0.98, 0));
floor.position.set(0, -3.64, -1.3);
floor.receiveShadow = true;
stage.add(floor);
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.7, 0.13, 64), worldMaterial('#aeb9ad', 0.66, 0.1));
plinth.position.set(-1.55, -3.5, 0.1);
stage.add(plinth);
const plinthTop = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.59, 0.025, 64), worldMaterial('#d3d9d0', 0.8, 0));
plinthTop.position.set(-1.55, -3.42, 0.1);
stage.add(plinthTop);

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
generator.position.set(-1.55, 0.40, 0);
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

// Adjustable framed photovoltaic panel, built from individual blue cell meshes and metal busbars.
const panelPivot = new THREE.Group();
panelPivot.position.set(0, -1.91, -0.16);
panelPivot.rotation.x = -Math.PI / 2 + 0.56;
generator.add(panelPivot);
addBox(panelPivot, [2.34, 1.68, 0.13], [0, 0.76, 0], brushedSteel, 0.065);
addBox(panelPivot, [2.12, 1.46, 0.035], [0, 0.76, 0.083], darkSteel, 0.025);
const cellWidth = 0.392;
const cellHeight = 0.316;
const cellGapX = 0.018;
const cellGapY = 0.022;
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 5; col += 1) {
    const x = (col - 2) * (cellWidth + cellGapX);
    const y = 0.76 + (1.5 - row) * (cellHeight + cellGapY);
    addBox(panelPivot, [cellWidth, cellHeight, 0.018], [x, y, 0.112], blueCellMaterials[(row * 2 + col) % blueCellMaterials.length], 0.004);
    // Fine metallic collector fingers catch highlights as the user orbits the model.
    for (const finger of [-1, 0, 1]) {
      addBox(panelPivot, [0.008, cellHeight * 0.88, 0.006], [x + finger * 0.11, y, 0.124], worldMaterial('#a8bac0', 0.25, 0.8), 0.002);
    }
  }
}
// Silver rails and hinges remain visible around the active cell field.
addBox(panelPivot, [2.28, 0.06, 0.08], [0, 1.57, 0.07], brushedSteel, 0.018);
addBox(panelPivot, [2.28, 0.06, 0.08], [0, -0.05, 0.07], brushedSteel, 0.018);
for (const x of [-1.11, 1.11]) addBox(panelPivot, [0.06, 1.58, 0.08], [x, 0.76, 0.07], brushedSteel, 0.018);
for (const x of [-0.91, 0.91]) {
  addCylinder(generator, 0.075, 0.22, [x, -1.88, -0.18], brushedSteel, 'x', 24);
  addCylinder(generator, 0.105, 0.03, [x, -1.88, -0.18], rubber, 'x', 24);
}
const supportStruts = [];
for (const x of [-0.86, 0.86]) {
  const strut = addRod(generator, new THREE.Vector3(x, -1.87, -0.58), new THREE.Vector3(x, -1.4, -0.5), 0.045, brushedSteel);
  supportStruts.push({ mesh: strut, base: new THREE.Vector3(x, -1.87, -0.58), panelPoint: new THREE.Vector3(x, 0.82, 0) });
  addCylinder(generator, 0.08, 0.045, [x, -1.86, -0.58], darkSteel, 'x', 20);
}
let targetPanelTilt = 0.56;
let targetPanelYaw = 0;

function updatePanelMechanics(delta) {
  panelPivot.rotation.x = THREE.MathUtils.damp(panelPivot.rotation.x, -Math.PI / 2 + targetPanelTilt, 2.6, delta);
  panelPivot.rotation.y = THREE.MathUtils.damp(panelPivot.rotation.y, targetPanelYaw, 2.4, delta);
  stage.updateMatrixWorld(true);
  for (const support of supportStruts) {
    const endpoint = panelPivot.localToWorld(support.panelPoint.clone());
    generator.worldToLocal(endpoint);
    const direction = new THREE.Vector3().subVectors(endpoint, support.base);
    support.mesh.position.copy(support.base).add(endpoint).multiplyScalar(0.5);
    support.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    support.mesh.scale.y = direction.length();
  }
}
function getPanelStagePosition() {
  stage.updateMatrixWorld(true);
  const point = panelPivot.localToWorld(new THREE.Vector3(0, 0.76, 0.15));
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
const lamp = makeDeviceBase('lamp', 1.95, -3.03, 0.32);
makeMesh(new THREE.CylinderGeometry(0.15, 0.23, 0.13, 24), worldMaterial('#35453b', 0.3, 0.45), lamp, [0, -0.385, 0], 'lamp');
makeMesh(new THREE.CylinderGeometry(0.045, 0.07, 0.48, 16), worldMaterial('#57685a', 0.35, 0.6), lamp, [0, -0.085, 0], 'lamp');
const lampBulb = makeMesh(new THREE.SphereGeometry(0.22, 24, 18), new THREE.MeshStandardMaterial({ color: '#fff2bb', emissive: '#ffd967', emissiveIntensity: 0.65, roughness: 0.22 }), lamp, [0, 0.29, 0], 'lamp');
lampBulb.scale.set(0.82, 1.18, 0.82);
const lampShade = makeMesh(new THREE.ConeGeometry(0.37, 0.25, 32, 1, true), worldMaterial('#6a7c67', 0.38, 0.25), lamp, [0, 0.43, 0], 'lamp', false);
lampShade.material.side = THREE.DoubleSide;

const laptop = makeDeviceBase('laptop', 3.22, -3.08, 0.32);
makeMesh(new THREE.BoxGeometry(0.9, 0.065, 0.57), worldMaterial('#5b6761', 0.26, 0.72), laptop, [0, -0.39, 0], 'laptop');
makeMesh(new THREE.BoxGeometry(0.77, 0.52, 0.045), worldMaterial('#35443c', 0.27, 0.58), laptop, [0, -0.09, -0.25], 'laptop');
const laptopScreen = makeMesh(new THREE.BoxGeometry(0.68, 0.42, 0.012), new THREE.MeshStandardMaterial({ color: '#86aeaa', emissive: '#8dc6b7', emissiveIntensity: 0.52, roughness: 0.22, metalness: 0.18 }), laptop, [0, -0.085, -0.219], 'laptop');

const phone = makeDeviceBase('phone', 4.55, -2.95, 0.32);
makeMesh(new THREE.BoxGeometry(0.38, 0.67, 0.065), worldMaterial('#28342f', 0.24, 0.55), phone, [0, -0.15, 0], 'phone');
const phoneScreen = makeMesh(new THREE.BoxGeometry(0.32, 0.56, 0.012), new THREE.MeshStandardMaterial({ color: '#78a6a0', emissive: '#6ac3ae', emissiveIntensity: 0.55, roughness: 0.2 }), phone, [0, -0.14, 0.04], 'phone');

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
  const directional = 0.74 + 0.26 * Math.max(0, Math.cos(hourAngle * 0.65));
  solarWatts = Math.round(MAX_SOLAR_WATTS * Math.pow(daylight, 1.25) * directional);
  // The panel physically tracks solar elevation and turns toward the morning/evening sun.
  targetPanelTilt = THREE.MathUtils.clamp(Math.PI / 2 - elevation, 0.16, 1.08);
  targetPanelYaw = -Math.sin(hourAngle) * 0.38;
  const visibleY = 0.15 + Math.max(-0.65, Math.sin(elevation)) * 3.05;
  sunGroup.position.set(-1.55 - Math.sin(hourAngle) * 3.0, visibleY, 2.25 + Math.cos(hourAngle) * 0.45);
  sunGroup.visible = elevation > THREE.MathUtils.degToRad(-8);
  sunCore.material.color.set(solarWatts > 0 ? '#ffe68c' : '#edcba1');
  stage.updateMatrixWorld(true);
  sunLight.position.copy(stage.localToWorld(sunGroup.position.clone()));
  sunLight.target.position.copy(generator.localToWorld(new THREE.Vector3(0, -2.55, 0)));
  sunLight.intensity = solarWatts > 0 ? 1.2 + 1.3 * daylight : 0.35;
  localSunLight.position.copy(sunGroup.position);
  localSunLight.intensity = solarWatts > 0 ? 20 * daylight : 0;
  updateSolarBeam();
  solarBeam.material.opacity = solarWatts > 0 ? 0.18 + 0.58 * daylight : 0.04;
  ui.timeLabel.textContent = formatClock(sunAngle);
  ui.latitudeLabel.textContent = formatLatitude(latitude);
  ui.worldCoordinate.innerHTML = `${formatLatitude(latitude)} &nbsp;·&nbsp; ${formatClock(sunAngle)}`;
  ui.location.textContent = Math.abs(latitude - 4.7) < 0.2 ? 'Bogotá, Colombia' : `Latitud ${formatLatitude(latitude)}`;
  ui.beamLabel.classList.toggle('is-dim', solarWatts <= 0);
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
    notify('Realidad aumentada activa. La estación aparece frente a ti.');
  } else {
    stage.scale.setScalar(0.45);
    stage.position.set(0, 1.65, -2.9);
    notify('Realidad virtual activa. Apunta el control y pulsa para interactuar.');
  }
  document.body.classList.add('xr-active');
  session?.addEventListener('end', restoreDesktopScene, { once: true });
});
function restoreDesktopScene() {
  activeXRMode = '';
  stage.scale.setScalar(1);
  stage.position.set(0, 0, 0);
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
  updateSolarBeam();
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
