import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMaterialLibrary } from './atlas.js';
import { createWorldScene } from './worldScene.js';
import './styles.css';

THREE.ColorManagement.enabled = false;

const CITY_NAV_DETAILS = {
  rome: { focus: 'Colosseum', tone: 'marble' },
  athens: { focus: 'Acropolis', tone: 'stone' },
  paris: { focus: 'Eiffel Tower', tone: 'iron' },
  london: { focus: 'Westminster', tone: 'river' },
  munich: { focus: 'Marienplatz', tone: 'copper' },
  berlin: { focus: 'Brandenburg', tone: 'neon' },
  'new-york': { focus: 'Midtown', tone: 'steel' }
};

const app = document.querySelector('#app');
const canvas = document.createElement('canvas');
canvas.className = 'webgl';
app.append(canvas);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec8d3);
scene.fog = new THREE.FogExp2(0xb9d2d5, 0.001);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3200);
camera.position.set(132, 222, 162);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = true;
controls.minDistance = 4;
controls.maxDistance = 2200;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 8, 0);

const hemi = new THREE.HemisphereLight(0xfff0ca, 0x748075, 1.25);
scene.add(hemi);

const ambient = new THREE.AmbientLight(0xffecd0, 0.45);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffc878, 1.6);
sun.position.set(-92, 138, 84);
scene.add(sun);

const fill = new THREE.DirectionalLight(0x8fb9c2, 0.65);
fill.position.set(110, 60, -130);
scene.add(fill);

const materials = createMaterialLibrary(renderer);
const world = createWorldScene(materials);
scene.add(world.group);

const hud = createHud(world.metrics, world.navViews);
setupHudPanel(hud);
const labelLayer = document.createElement('div');
labelLayer.style.position = 'fixed';
labelLayer.style.inset = '0';
labelLayer.style.pointerEvents = 'none';
document.body.append(labelLayer);

const labels = world.labels.map((item) => {
  const element = document.createElement('div');
  element.className = 'label';
  element.textContent = item.name;
  labelLayer.append(element);
  return { ...item, element };
});

let desiredTarget = controls.target.clone();
let desiredPosition = camera.position.clone();
const flight = {
  active: false,
  dragging: false,
  pitch: 0,
  yaw: 0,
  keys: new Set(),
  speed: 62,
  fastSpeed: 160,
  slowSpeed: 24,
  bounds: world.bounds
};
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const clock = new THREE.Clock();
const fpsState = {
  frames: 0,
  last: performance.now(),
  fps: 60
};

window.__ROME_METRICS__ = {
  fps: 0,
  mode: 'orbit',
  camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
  cityCount: world.metrics.cities,
  instanceCount: world.metrics.instances,
  pedestrians: world.metrics.pedestrians,
  cyclists: world.metrics.cyclists,
  trams: world.metrics.trams,
  taxis: world.metrics.taxis,
  buses: world.metrics.buses,
  cabs: world.metrics.cabs,
  connectors: world.metrics.connectors,
  drawCalls: 0,
  triangles: 0,
  reservations: world.metrics.reservations,
  labels: world.labels.length
};

let activeViewId = world.navViews[0]?.id ?? null;
setActiveView(activeViewId);

for (const view of world.navViews) {
  document.querySelector(`[data-view="${view.id}"]`)?.addEventListener('click', () => {
    setActiveView(view.id);
    flyTo(view.position, view.target);
  });
}
document.querySelector('[data-mode="flight"]').addEventListener('click', () => {
  setFlightMode(!flight.active, true);
});

function flyTo(position, target) {
  setFlightMode(false);
  desiredPosition = position.clone();
  desiredTarget = target.clone();
}

function createHud(metrics, navViews) {
  const root = document.createElement('aside');
  root.className = 'hud';
  root.innerHTML = `
    <div class="hud__top">
      <div class="hud__identity">
        <div class="hud__eyebrow">Procedural atlas</div>
        <h1>3D City Atlas</h1>
      </div>
      <button class="hud__toggle" data-hud-toggle type="button" aria-expanded="true" title="Close atlas panel">
        <span aria-hidden="true"></span>
      </button>
    </div>
    <div class="hud__body">
      <p class="hud__summary">Seven handcrafted city centres in one flyable offline WebGL world.</p>
      <div class="metrics">
        <div class="metric"><b data-fps>--</b><span>FPS</span></div>
        <div class="metric"><b>${metrics.instances.toLocaleString()}</b><span>voxels</span></div>
        <div class="metric"><b>${metrics.pedestrians + (metrics.cyclists ?? 0)}</b><span>people</span></div>
        <div class="metric"><b>${metrics.cities}</b><span>cities</span></div>
      </div>
      <ul class="landmarks">
        <li>Colosseum</li>
        <li>Acropolis</li>
        <li>Eiffel Tower</li>
        <li>Big Ben</li>
        <li>Neues Rathaus</li>
        <li>Brandenburg Gate</li>
        <li>TV Tower</li>
        <li>Empire State</li>
        <li>Long Routes</li>
      </ul>
    </div>
  `;
  document.body.append(root);

  const controlsRoot = document.createElement('nav');
  controlsRoot.className = 'city-nav';
  controlsRoot.setAttribute('aria-label', 'City navigation');
  controlsRoot.innerHTML = `
    <div class="city-nav__header">
      <span>Destinations</span>
      <strong>${navViews.length} cities</strong>
    </div>
    <div class="city-nav__rail">
      ${navViews.map((view, index) => {
        const detail = CITY_NAV_DETAILS[view.id] ?? { focus: view.label, tone: 'stone' };
        return `
          <button class="city-card" data-view="${view.id}" data-tone="${detail.tone}" type="button" title="${view.title}">
            <span class="city-card__index">${String(index + 1).padStart(2, '0')}</span>
            <span class="city-card__name">${view.label}</span>
            <span class="city-card__focus">${detail.focus}</span>
          </button>
        `;
      }).join('')}
    </div>
    <button class="flight-toggle" data-mode="flight" type="button" title="Toggle flight controls" aria-pressed="false">
      <span class="flight-toggle__mark">Fly</span>
      <span>Flight</span>
    </button>
  `;
  document.body.append(controlsRoot);

  return {
    fps: root.querySelector('[data-fps]'),
    root,
    nav: controlsRoot,
    toggle: root.querySelector('[data-hud-toggle]')
  };
}

function setupHudPanel(hud) {
  let autoCollapseTimer = window.setTimeout(() => setHudCollapsed(true), 5200);

  const clearAutoCollapse = () => {
    if (!autoCollapseTimer) return;
    window.clearTimeout(autoCollapseTimer);
    autoCollapseTimer = null;
  };

  const setHudCollapsed = (collapsed, fromUser = false) => {
    hud.root.classList.toggle('is-collapsed', collapsed);
    hud.toggle.setAttribute('aria-expanded', String(!collapsed));
    hud.toggle.setAttribute('title', collapsed ? 'Open atlas panel' : 'Close atlas panel');
    if (fromUser) clearAutoCollapse();
  };

  hud.toggle.addEventListener('click', () => {
    setHudCollapsed(!hud.root.classList.contains('is-collapsed'), true);
  });
}

function setActiveView(viewId) {
  activeViewId = viewId;
  document.querySelectorAll('[data-view]').forEach((button) => {
    const isActive = button.getAttribute('data-view') === activeViewId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
    if (isActive) button.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
}

function setFlightMode(enabled, requestLock = false) {
  if (flight.active === enabled) return;

  flight.active = enabled;
  flight.dragging = false;
  controls.enabled = !enabled;
  document.body.classList.toggle('is-flight', enabled);

  const button = document.querySelector('[data-mode="flight"]');
  button.classList.toggle('is-active', enabled);
  button.setAttribute('aria-pressed', String(enabled));

  if (enabled) {
    syncFlightAnglesFromCamera();
    desiredPosition.copy(camera.position);
    desiredTarget.copy(controls.target);
    if (requestLock && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  } else {
    flight.keys.clear();
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).addScaledVector(forward, 34);
    desiredPosition.copy(camera.position);
    desiredTarget.copy(controls.target);
  }
}

function syncFlightAnglesFromCamera() {
  euler.setFromQuaternion(camera.quaternion, 'YXZ');
  flight.pitch = euler.x;
  flight.yaw = euler.y;
}

function updateFlightLook(movementX, movementY) {
  const sensitivity = 0.0024;
  flight.yaw -= movementX * sensitivity;
  flight.pitch -= movementY * sensitivity;
  flight.pitch = Math.max(-1.48, Math.min(1.42, flight.pitch));
  euler.set(flight.pitch, flight.yaw, 0);
  camera.quaternion.setFromEuler(euler);
}

function clampFlightPosition() {
  camera.position.x = Math.max(flight.bounds.minX, Math.min(flight.bounds.maxX, camera.position.x));
  camera.position.z = Math.max(flight.bounds.minZ, Math.min(flight.bounds.maxZ, camera.position.z));
  camera.position.y = Math.max(world.heightAt(camera.position.x, camera.position.z) + 2.2, Math.min(640, camera.position.y));
}

function moveFlight(delta) {
  if (!flight.active) return;

  forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  moveVector.set(0, 0, 0);

  if (flight.keys.has('KeyW') || flight.keys.has('ArrowUp')) moveVector.add(forward);
  if (flight.keys.has('KeyS') || flight.keys.has('ArrowDown')) moveVector.sub(forward);
  if (flight.keys.has('KeyD') || flight.keys.has('ArrowRight')) moveVector.add(right);
  if (flight.keys.has('KeyA') || flight.keys.has('ArrowLeft')) moveVector.sub(right);
  if (flight.keys.has('KeyE') || flight.keys.has('Space')) moveVector.y += 1;
  if (flight.keys.has('KeyQ') || flight.keys.has('ControlLeft') || flight.keys.has('ControlRight')) moveVector.y -= 1;

  if (moveVector.lengthSq() > 0) {
    const speed = flight.keys.has('ShiftLeft') || flight.keys.has('ShiftRight')
      ? flight.fastSpeed
      : flight.keys.has('AltLeft') || flight.keys.has('AltRight')
        ? flight.slowSpeed
        : flight.speed;
    camera.position.addScaledVector(moveVector.normalize(), speed * delta);
    clampFlightPosition();
  }

  controls.target.copy(camera.position).addScaledVector(forward, 34);
  desiredPosition.copy(camera.position);
  desiredTarget.copy(controls.target);
}

function updateLabels() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const cameraPosition = camera.position;
  const hudRect = hud.root.getBoundingClientRect();
  const navRect = hud.nav.getBoundingClientRect();
  const inHudZone = (screenX, screenY) => isInsideRect(screenX, screenY, hudRect, 12);
  const inControlsZone = (screenX, screenY) => isInsideRect(screenX, screenY, navRect, 14);

  for (const label of labels) {
    const pos = label.position.clone().project(camera);
    const screenX = (pos.x * 0.5 + 0.5) * width;
    const screenY = (-pos.y * 0.5 + 0.5) * height;
    const visible =
      pos.z < 1 &&
      screenX > 100 &&
      screenX < width - 100 &&
      screenY > 24 &&
      screenY < height - 24 &&
      !inHudZone(screenX, screenY) &&
      !inControlsZone(screenX, screenY) &&
      cameraPosition.distanceTo(label.position) < 260;
    if (!visible) {
      label.element.style.display = 'none';
      continue;
    }

    label.element.style.display = 'block';
    label.element.style.left = `${screenX}px`;
    label.element.style.top = `${screenY}px`;
  }
}

function isInsideRect(x, y, rect, pad = 0) {
  return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
}

function updateMetrics(now) {
  fpsState.frames += 1;
  const elapsed = now - fpsState.last;
  if (elapsed < 500) return;

  fpsState.fps = Math.round((fpsState.frames * 1000) / elapsed);
  fpsState.frames = 0;
  fpsState.last = now;
  hud.fps.textContent = String(fpsState.fps);

  window.__ROME_METRICS__.fps = fpsState.fps;
  window.__ROME_METRICS__.mode = flight.active ? 'flight' : 'orbit';
  window.__ROME_METRICS__.camera = {
    x: Math.round(camera.position.x * 10) / 10,
    y: Math.round(camera.position.y * 10) / 10,
    z: Math.round(camera.position.z * 10) / 10
  };
  window.__ROME_METRICS__.drawCalls = renderer.info.render.calls;
  window.__ROME_METRICS__.triangles = renderer.info.render.triangles;
}

function animate(now) {
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  if (flight.active) {
    moveFlight(delta);
  } else {
    camera.position.lerp(desiredPosition, 0.018);
    controls.target.lerp(desiredTarget, 0.018);
    controls.update();
  }

  if (materials.water.map) {
    materials.water.map.offset.x = (elapsed * 0.015) % 1;
    materials.water.map.offset.y = (elapsed * 0.008) % 1;
  }

  world.update(elapsed);
  renderer.render(scene, camera);
  updateLabels();
  updateMetrics(now);
}

renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('keydown', (event) => {
  if (!flight.active || event.repeat || isTextInput(event.target)) return;
  flight.keys.add(event.code);
  if (isFlightKey(event.code)) event.preventDefault();
});

window.addEventListener('keyup', (event) => {
  flight.keys.delete(event.code);
});

window.addEventListener('blur', () => {
  flight.keys.clear();
  flight.dragging = false;
});

document.addEventListener('pointerlockchange', () => {
  if (flight.active && document.pointerLockElement !== canvas) {
    flight.dragging = false;
  }
});

canvas.addEventListener('pointerdown', (event) => {
  if (!flight.active) return;
  event.preventDefault();
  flight.dragging = true;
  canvas.setPointerCapture?.(event.pointerId);
});

canvas.addEventListener('pointerup', (event) => {
  flight.dragging = false;
  canvas.releasePointerCapture?.(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!flight.active) return;
  if (document.pointerLockElement !== canvas && !flight.dragging) return;
  updateFlightLook(event.movementX, event.movementY);
});

canvas.addEventListener(
  'wheel',
  (event) => {
    if (!flight.active) return;
    event.preventDefault();
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    camera.position.addScaledVector(forward, -event.deltaY * 0.16);
    clampFlightPosition();
  },
  { passive: false }
);

canvas.addEventListener('contextmenu', (event) => {
  if (flight.active) event.preventDefault();
});

function isFlightKey(code) {
  return [
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyQ',
    'KeyE',
    'Space',
    'ShiftLeft',
    'ShiftRight',
    'AltLeft',
    'AltRight',
    'ControlLeft',
    'ControlRight',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight'
  ].includes(code);
}

function isTextInput(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable;
}
