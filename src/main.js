import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import productImageUrl from '../image.png';
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
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');

const scene = new THREE.Scene();
const skyColor = new THREE.Color('#d1d8cf');
scene.background = skyColor;
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(0, 0.15, 15.7);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.dampingFactor = 0.06;
orbit.enablePan = false;
orbit.minDistance = 11;
orbit.maxDistance = 23;
orbit.minPolarAngle = Math.PI * 0.27;
orbit.maxPolarAngle = Math.PI * 0.72;
orbit.target.set(-0.45, -0.05, 0);

scene.add(new THREE.HemisphereLight(0xf5ffe4, 0x778477, 2.2));
const sunLight = new THREE.DirectionalLight(0xfff1be, 2.5);
sunLight.position.set(-4, 7, 8);
scene.add(sunLight);
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

// A softly lit tabletop keeps the original product photo front and center.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), worldMaterial('#bcc5bb', 0.98, 0));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, -3.58, -1.3);
stage.add(floor);
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.15, 0.13, 80), worldMaterial('#aeb9ad', 0.66, 0.1));
plinth.position.set(-1.55, -3.5, 0.1);
stage.add(plinth);
const plinthTop = new THREE.Mesh(new THREE.CylinderGeometry(2.94, 3.0, 0.025, 80), worldMaterial('#d3d9d0', 0.8, 0));
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

const productTexture = new THREE.TextureLoader().load(productImageUrl);
productTexture.colorSpace = THREE.SRGBColorSpace;
productTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
const product = new THREE.Mesh(new THREE.PlaneGeometry(6.18, 6.43), new THREE.MeshBasicMaterial({ map: productTexture, toneMapped: false }));
product.position.set(-1.55, -0.15, 0.24);
stage.add(product);

const panelTarget = new THREE.Vector3(-1.76, 1.48, 0.5);
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

const beamGeometry = new THREE.BufferGeometry().setFromPoints([sunGroup.position, panelTarget]);
const solarBeam = new THREE.Line(beamGeometry, new THREE.LineDashedMaterial({ color: '#d0ef83', dashSize: 0.17, gapSize: 0.13, transparent: true, opacity: 0.65, depthWrite: false }));
solarBeam.computeLineDistances();
stage.add(solarBeam);

const cableMaterial = new THREE.LineBasicMaterial({ color: '#27342b', transparent: true, opacity: 0.72 });
const cableGlowMaterial = new THREE.LineBasicMaterial({ color: '#b4df6d', transparent: true, opacity: 0.8 });
function makeDeviceBase(id, x, y, z) {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  root.userData.deviceId = id;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.025, 8, 48), new THREE.MeshBasicMaterial({ color: '#b4dc7a', transparent: true, opacity: 0.7 }));
  ring.position.y = -0.55;
  root.add(ring);
  deviceRings[id] = ring;
  stage.add(root);
  deviceGroups[id] = root;
  return root;
}
function makeMesh(geometry, material, group, position, id, interactive = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.userData.deviceId = id;
  group.add(mesh);
  if (interactive) interactiveMeshes.push(mesh);
  return mesh;
}

// Small, recognizable 3D appliances are connected by simulated leads to the unit's output area.
const lamp = makeDeviceBase('lamp', 3.55, 1.55, 0.3);
makeMesh(new THREE.CylinderGeometry(0.15, 0.23, 0.13, 24), worldMaterial('#35453b', 0.3, 0.45), lamp, [0, -0.32, 0], 'lamp');
makeMesh(new THREE.CylinderGeometry(0.045, 0.07, 0.48, 16), worldMaterial('#57685a', 0.35, 0.6), lamp, [0, -0.05, 0], 'lamp');
const lampBulb = makeMesh(new THREE.SphereGeometry(0.22, 24, 18), new THREE.MeshStandardMaterial({ color: '#fff2bb', emissive: '#ffd967', emissiveIntensity: 0.65, roughness: 0.22 }), lamp, [0, 0.29, 0], 'lamp');
lampBulb.scale.set(0.82, 1.18, 0.82);
const lampShade = makeMesh(new THREE.ConeGeometry(0.37, 0.25, 32, 1, true), worldMaterial('#6a7c67', 0.38, 0.25), lamp, [0, 0.43, 0], 'lamp', false);
lampShade.material.side = THREE.DoubleSide;

const laptop = makeDeviceBase('laptop', 3.65, -0.1, 0.3);
makeMesh(new THREE.BoxGeometry(0.9, 0.065, 0.57), worldMaterial('#5b6761', 0.26, 0.72), laptop, [0, -0.26, 0], 'laptop');
makeMesh(new THREE.BoxGeometry(0.77, 0.52, 0.045), worldMaterial('#35443c', 0.27, 0.58), laptop, [0, 0.04, -0.25], 'laptop');
const laptopScreen = makeMesh(new THREE.BoxGeometry(0.68, 0.42, 0.012), new THREE.MeshStandardMaterial({ color: '#86aeaa', emissive: '#8dc6b7', emissiveIntensity: 0.52, roughness: 0.22, metalness: 0.18 }), laptop, [0, 0.045, -0.219], 'laptop');

const phone = makeDeviceBase('phone', 3.6, -1.75, 0.3);
makeMesh(new THREE.BoxGeometry(0.38, 0.67, 0.065), worldMaterial('#28342f', 0.24, 0.55), phone, [0, -0.15, 0], 'phone');
const phoneScreen = makeMesh(new THREE.BoxGeometry(0.32, 0.56, 0.012), new THREE.MeshStandardMaterial({ color: '#78a6a0', emissive: '#6ac3ae', emissiveIntensity: 0.55, roughness: 0.2 }), phone, [0, -0.14, 0.04], 'phone');

const socketAnchors = {
  lamp: new THREE.Vector3(-0.93, -1.62, 0.4),
  phone: new THREE.Vector3(-0.7, -1.79, 0.42),
  laptop: new THREE.Vector3(-1.12, -1.77, 0.42),
};
for (const id of Object.keys(deviceInfo)) {
  const target = deviceGroups[id].position.clone();
  const start = socketAnchors[id];
  const points = [start, new THREE.Vector3(start.x + 0.55, start.y - 0.23, 0.34), new THREE.Vector3(target.x - 0.85, target.y - 0.55, 0.28), new THREE.Vector3(target.x - 0.25, target.y - 0.52, 0.3)];
  const curve = new THREE.CatmullRomCurve3(points);
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(32)), cableMaterial.clone());
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
  const visibleY = 0.15 + Math.max(-0.65, Math.sin(elevation)) * 3.05;
  sunGroup.position.set(-1.55 - Math.sin(hourAngle) * 3.65, visibleY, 2.25 + Math.cos(hourAngle) * 0.45);
  sunGroup.visible = elevation > THREE.MathUtils.degToRad(-8);
  sunCore.material.color.set(solarWatts > 0 ? '#ffe68c' : '#edcba1');
  localSunLight.position.copy(sunGroup.position);
  localSunLight.intensity = solarWatts > 0 ? 20 * daylight : 0;
  const pts = [sunGroup.position.clone(), panelTarget.clone()];
  solarBeam.geometry.dispose();
  solarBeam.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  solarBeam.computeLineDistances();
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
    stage.scale.setScalar(0.17);
    stage.position.set(0, 0.58, -1.65);
    notify('Realidad aumentada activa. La estación aparece frente a ti.');
  } else {
    stage.scale.setScalar(0.57);
    stage.position.set(0, 0, -3.65);
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
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

const resizeObserver = new ResizeObserver(() => {
  const width = ui.world.clientWidth;
  const height = ui.world.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
resizeObserver.observe(ui.world);

for (const input of [ui.time, ui.latitude, ui.capacity]) updateRange(input);
updateDevices();
updateSun();
updateChallengeDisplay();
