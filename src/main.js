import * as THREE from 'three';
import { inject as injectVercelAnalytics } from '@vercel/analytics';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMaterialLibrary } from './atlas.js';
import { createLivePresence } from './livePresence.js';
import { createWorldScene } from './worldScene.js';
import './styles.css';

if (shouldInjectAnalytics()) injectVercelAnalytics();
THREE.ColorManagement.enabled = false;

const PANEL_AUTO_COLLAPSE_MS = 5000;
const LIVE_DISPLAY_NAME_STORAGE_KEY = 'atlas.liveDisplayName';
const LIVE_DISPLAY_NAME_MAX_LENGTH = 24;

let liveDisplayName = readStoredLiveDisplayName();
let liveVisitorsRenderKey = '';
const liveVisitorRows = new Map();

function shouldInjectAnalytics() {
  const hostname = window.location.hostname;
  return hostname !== 'localhost' &&
    hostname !== '127.0.0.1' &&
    hostname !== '0.0.0.0' &&
    !hostname.startsWith('192.168.') &&
    !hostname.startsWith('10.') &&
    !hostname.startsWith('172.16.');
}

function shouldStartLivePresence() {
  const liveFlag = import.meta.env.VITE_LIVE_PRESENCE;
  if (liveFlag === 'false') return false;
  if (liveFlag === 'true') return true;
  return import.meta.env.PROD;
}

function sanitizeLiveDisplayName(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>]/g, '')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim()
    .slice(0, LIVE_DISPLAY_NAME_MAX_LENGTH);
}

function readStoredLiveDisplayName() {
  try {
    return sanitizeLiveDisplayName(window.localStorage?.getItem(LIVE_DISPLAY_NAME_STORAGE_KEY) ?? '');
  } catch {
    return '';
  }
}

function writeStoredLiveDisplayName(value) {
  try {
    const sanitized = sanitizeLiveDisplayName(value);
    if (sanitized) window.localStorage?.setItem(LIVE_DISPLAY_NAME_STORAGE_KEY, sanitized);
    else window.localStorage?.removeItem(LIVE_DISPLAY_NAME_STORAGE_KEY);
  } catch {
    // Storage can be blocked in private or restricted browsing contexts.
  }
}

const CITY_NAV_DETAILS = {
  rome: { focus: 'Colosseum', tone: 'marble' },
  venice: { focus: 'Grand Canal', tone: 'lagoon' },
  athens: { focus: 'Acropolis', tone: 'stone' },
  egypt: { focus: 'Giza Plateau', tone: 'desert' },
  angkor: { focus: 'Angkor Wat', tone: 'jungle' },
  paris: { focus: 'Eiffel Tower', tone: 'iron' },
  barcelona: { focus: 'Sagrada Familia', tone: 'mosaic' },
  london: { focus: 'Westminster', tone: 'river' },
  munich: { focus: 'Marienplatz', tone: 'copper' },
  berlin: { focus: 'Brandenburg', tone: 'neon' },
  vienna: { focus: 'Stephansdom', tone: 'imperial' },
  'new-york': { focus: 'Midtown', tone: 'steel' },
  brazil: { focus: 'Rio de Janeiro', tone: 'tropical' },
  peru: { focus: 'Machu Picchu', tone: 'andes' }
};

const CITY_LANDMARKS = {
  rome: [
    { label: 'Colosseum', targetKey: 'colosseum' },
    { label: 'Forum Romanum', targetKey: 'forum' },
    { label: 'Circus Maximus', targetKey: 'circus' },
    { label: 'Rome Aerial', targetKey: 'aerial' }
  ],
  venice: [
    { label: "St Mark's Square", targetKey: 'sanMarco' },
    { label: 'Grand Canal', targetKey: 'grandCanal' },
    { label: 'Rialto Bridge', targetKey: 'rialto' },
    { label: 'Lagoon Islands', targetKey: 'lagoon' }
  ],
  athens: [
    { label: 'Parthenon', targetKey: 'parthenon' },
    { label: 'Ancient Agora', targetKey: 'agora' },
    { label: 'Syntagma', targetKey: 'syntagma' },
    { label: 'Lycabettus', targetKey: 'lycabettus' }
  ],
  egypt: [
    { label: 'Great Pyramid', targetKey: 'greatPyramid' },
    { label: 'Great Sphinx', targetKey: 'sphinx' },
    { label: 'Nile Docks', targetKey: 'nile' },
    { label: 'Temple Courtyard', targetKey: 'temple' },
    { label: 'Necropolis', targetKey: 'necropolis' }
  ],
  angkor: [
    { label: 'Angkor Wat', targetKey: 'angkorWat' },
    { label: 'Outer Moat', targetKey: 'moat' },
    { label: 'Bayon', targetKey: 'bayon' },
    { label: 'Ta Prohm', targetKey: 'taProhm' },
    { label: 'Barays', targetKey: 'baray' },
    { label: 'Stilt Village', targetKey: 'village' }
  ],
  paris: [
    { label: 'Eiffel Tower', targetKey: 'eiffel' },
    { label: 'Louvre', targetKey: 'louvre' },
    { label: 'Notre-Dame', targetKey: 'notreDame' },
    { label: 'Montmartre', targetKey: 'montmartre' }
  ],
  barcelona: [
    { label: 'Sagrada Familia', targetKey: 'sagrada' },
    { label: 'Park Guell', targetKey: 'parkGuell' },
    { label: 'Passeig de Gracia', targetKey: 'passeig' },
    { label: 'Gothic Quarter', targetKey: 'gothic' },
    { label: 'Waterfront', targetKey: 'waterfront' },
    { label: 'Montjuic', targetKey: 'montjuic' }
  ],
  london: [
    { label: 'Elizabeth Tower', targetKey: 'bigBen' },
    { label: 'Westminster', targetKey: 'westminster' },
    { label: 'Tower Bridge', targetKey: 'towerBridge' },
    { label: 'Thames', targetKey: 'thames' }
  ],
  munich: [
    { label: 'Neues Rathaus', targetKey: 'rathaus' },
    { label: 'Marienplatz', targetKey: 'marienplatz' },
    { label: 'Isar River', targetKey: 'isar' },
    { label: 'English Garden', targetKey: 'englishGarden' }
  ],
  berlin: [
    { label: 'Brandenburg Gate', targetKey: 'brandenburg' },
    { label: 'Reichstag', targetKey: 'reichstag' },
    { label: 'Museum Island', targetKey: 'museumIsland' },
    { label: 'TV Tower', targetKey: 'fernsehturm' },
    { label: 'Potsdamer Platz', targetKey: 'potsdamer' }
  ],
  vienna: [
    { label: 'Stephansdom', targetKey: 'stephansdom' },
    { label: 'Hofburg', targetKey: 'hofburg' },
    { label: 'State Opera', targetKey: 'opera' },
    { label: 'Karlskirche', targetKey: 'karlskirche' },
    { label: 'Belvedere', targetKey: 'belvedere' },
    { label: 'Danube Canal', targetKey: 'danube' },
    { label: 'Night Boats', targetKey: 'nightlife' },
    { label: 'Prater', targetKey: 'prater' },
    { label: 'Schonbrunn', targetKey: 'schonbrunn' },
    { label: 'Vienna Aerial', targetKey: 'aerial' }
  ],
  'new-york': [
    { label: 'Empire State', targetKey: 'empire' },
    { label: 'Times Square', targetKey: 'timesSquare' },
    { label: 'Central Park South', targetKey: 'centralPark' },
    { label: 'Downtown Skyline', targetKey: 'downtown' }
  ],
  brazil: [
    { label: 'Christ the Redeemer', targetKey: 'christ' },
    { label: 'Sugarloaf', targetKey: 'sugarloaf' },
    { label: 'Copacabana', targetKey: 'copacabana' },
    { label: 'Maracana', targetKey: 'maracana' },
    { label: 'Hillside Community', targetKey: 'favela' },
    { label: 'Amazon River', targetKey: 'amazon' },
    { label: 'Iguacu Falls', targetKey: 'iguacu' },
    { label: 'Brazil Aerial', targetKey: 'aerial' }
  ],
  peru: [
    { label: 'Machu Picchu', targetKey: 'machu' },
    { label: 'Cusco', targetKey: 'cusco' },
    { label: 'Sacsayhuaman', targetKey: 'sacsayhuaman' },
    { label: 'Sacred Valley', targetKey: 'sacredValley' },
    { label: 'Lake Titicaca', targetKey: 'titicaca' },
    { label: 'Lima Coast', targetKey: 'lima' },
    { label: 'Amazon Basin', targetKey: 'amazon' },
    { label: 'Rainbow Mountain', targetKey: 'rainbow' },
    { label: 'Peru Aerial', targetKey: 'aerial' }
  ]
};

for (const [cityId, landmarks] of Object.entries(CITY_LANDMARKS)) {
  landmarks.unshift({ label: 'Find Spyros', targetKey: 'spyros' });
}

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

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5200);
camera.position.set(132, 222, 162);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = true;
controls.minDistance = 4;
controls.maxDistance = 3800;
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
setupNavPanel(hud);
setupLivePanel(hud);
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
  lookPointerId: null,
  lookLastX: 0,
  lookLastY: 0,
  pitch: 0,
  yaw: 0,
  keys: new Set(),
  speed: 62,
  fastSpeed: 160,
  slowSpeed: 24,
  bounds: world.bounds,
  mobile: {
    movePointerId: null,
    liftPointerId: null,
    moveCenterX: 0,
    moveCenterY: 0,
    moveRadius: 1,
    moveX: 0,
    moveY: 0,
    lift: 0
  },
  pointerLocked: false
};
const FLIGHT_CITY_SYNC_INSET = 18;
const FLIGHT_CITY_SYNC_DWELL_MS = 550;
const flightCitySync = {
  candidateId: null,
  candidateSince: 0
};
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const clock = new THREE.Clock();
const liveLocalMotion = {
  position: camera.position.clone(),
  quaternion: camera.quaternion.clone(),
  moving: false
};
const fpsState = {
  frames: 0,
  last: performance.now(),
  fps: 60
};

setupMobileFlightControls(hud);

window.__ROME_METRICS__ = {
  fps: 0,
  mode: 'orbit',
  activeCity: null,
  camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
  cityCount: world.metrics.cities,
  instanceCount: world.metrics.instances,
  pedestrians: world.metrics.pedestrians,
  cyclists: world.metrics.cyclists,
  trams: world.metrics.trams,
  taxis: world.metrics.taxis,
  buses: world.metrics.buses,
  cabs: world.metrics.cabs,
  gondolas: world.metrics.gondolas,
  boats: world.metrics.boats,
  carts: world.metrics.carts,
  pigeons: world.metrics.pigeons,
  spyrosTourists: world.metrics.spyrosTourists,
  connectors: world.metrics.connectors,
  live: { status: 'solo', online: 0, remote: 0 },
  drawCalls: 0,
  triangles: 0,
  reservations: world.metrics.reservations,
  labels: world.labels.length
};

let activeViewId = world.navViews[0]?.id ?? null;
setActiveView(activeViewId);

const livePresence = createLivePresence({
  scene,
  camera,
  world,
  getSnapshot: getLivePresenceSnapshot,
  onStateChange: updateLivePresenceUi,
  isReducedMotion: () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
});
livePresence.setDisplayName(liveDisplayName);
if (shouldStartLivePresence()) {
  void livePresence.start();
} else {
  updateLivePresenceUi({
    status: 'solo',
    statusLabel: 'Solo mode',
    onlineCount: 0,
    remoteCount: 0,
    visitorsVisible: true,
    participants: []
  });
}

for (const view of world.navViews) {
  document.querySelector(`[data-view="${view.id}"]`)?.addEventListener('click', () => {
    setActiveView(view.id);
    flyTo(view.position, view.target);
    if (window.innerWidth <= 720) hud.setNavCollapsed?.(true, true);
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
    <div class="hud__live-pill" data-live-pill>Solo mode</div>
    <div class="hud__body">
      <p class="hud__summary">${metrics.cities} handcrafted city centres in one flyable offline WebGL world.</p>
      <dl class="metrics">
        <div class="metric metric--fps">
          <dd data-fps>--</dd>
          <dt>FPS</dt>
        </div>
        <div class="metric metric--blocks" aria-label="${metrics.instances.toLocaleString()} 3D blocks rendered">
          <dd title="${metrics.instances.toLocaleString()} 3D blocks rendered">${metrics.instances.toLocaleString()}</dd>
          <dt>Blocks</dt>
        </div>
        <div class="metric metric--people">
          <dd>${metrics.pedestrians + (metrics.cyclists ?? 0) + (metrics.spyrosTourists ?? 0)}</dd>
          <dt>People</dt>
        </div>
        <div class="metric metric--cities">
          <dd>${metrics.cities}</dd>
          <dt>Cities</dt>
        </div>
        <div class="metric metric--live">
          <dd data-live-count>0</dd>
          <dt>Online</dt>
        </div>
      </dl>
      <section class="live-panel" aria-label="Live visitors">
        <button class="live-panel__toggle" data-live-toggle type="button" aria-expanded="false" aria-controls="live-panel-body" title="Open live visitors">
          <span class="live-panel__dot" data-live-dot aria-hidden="true"></span>
          <span class="live-panel__copy">
            <span data-live-label>Live visitors</span>
            <strong data-live-summary>No visitors online</strong>
          </span>
        </button>
        <div class="live-panel__body" id="live-panel-body" data-live-body hidden>
          <form class="live-name-form" data-live-name-form aria-label="Live visitor profile">
            <div class="live-name-form__id">
              <span>Visitor ID</span>
              <strong id="live-self-id" data-live-self-id>-----</strong>
            </div>
            <label class="sr-only" for="live-display-name">Display name</label>
            <div class="live-name-form__controls">
              <input id="live-display-name" data-live-name-input type="text" maxlength="${LIVE_DISPLAY_NAME_MAX_LENGTH}" autocomplete="nickname" placeholder="Your name" aria-describedby="live-name-help live-self-id">
              <button class="live-panel__action live-name-form__save" data-live-name-save type="submit">Save</button>
            </div>
            <p class="sr-only" id="live-name-help">Optional name shown next to your visitor ID.</p>
          </form>
          <div class="live-panel__actions">
            <button class="live-panel__action" data-live-visibility type="button" aria-pressed="true">Visitors visible</button>
          </div>
          <p class="sr-only" data-live-visitors-meta>No live visitors yet.</p>
          <ul class="live-visitors" data-live-visitors></ul>
        </div>
        <div class="sr-only" data-live-status role="status" aria-live="polite" aria-atomic="true">Solo mode</div>
      </section>
      <section class="landmark-panel" aria-label="Current city landmarks">
        <div class="landmark-panel__title">
          <span data-city-name>City</span>
          <strong data-landmark-count>0 landmarks</strong>
        </div>
        <div class="landmarks" data-landmarks></div>
      </section>
    </div>
  `;
  document.body.append(root);

  const exploreRoot = document.createElement('div');
  exploreRoot.className = 'explore-dock';
  exploreRoot.setAttribute('role', 'group');
  exploreRoot.setAttribute('aria-label', 'Exploration controls');

  const flightRoot = document.createElement('div');
  flightRoot.className = 'flight-dock';
  flightRoot.setAttribute('aria-label', 'Flight controls');
  flightRoot.innerHTML = `
    <button class="flight-toggle" data-mode="flight" type="button" title="Enter flight mode" aria-label="Enter flight mode" aria-pressed="false">
      <span class="flight-toggle__mark" aria-hidden="true">Fly</span>
      <span class="flight-toggle__copy">
        <span class="flight-toggle__label" data-flight-label>Enter flight</span>
        <span class="flight-toggle__hint" data-flight-state>Ready</span>
      </span>
    </button>
  `;
  exploreRoot.append(flightRoot);

  const controlsRoot = document.createElement('nav');
  controlsRoot.className = 'city-nav';
  controlsRoot.setAttribute('aria-label', 'City navigation');
  controlsRoot.innerHTML = `
    <button class="city-nav__toggle" data-nav-toggle type="button" aria-expanded="true" aria-controls="city-nav-body" title="Collapse destinations">
      <span class="city-nav__title">
        <span>Destinations</span>
        <strong data-active-destination>${navViews[0]?.label ?? 'City'}</strong>
      </span>
      <span class="city-nav__count">${navViews.length}</span>
    </button>
    <div class="city-nav__body" id="city-nav-body">
      <div class="city-nav__rail">
        ${navViews.map((view, index) => {
          const detail = CITY_NAV_DETAILS[view.id] ?? { focus: view.label, tone: 'stone' };
          return `
            <button class="city-card" data-view="${view.id}" data-tone="${detail.tone}" type="button" title="${view.title}">
              <span class="city-card__index">${String(index + 1).padStart(2, '0')}</span>
              <span class="city-card__copy">
                <span class="city-card__name">${view.label}</span>
                <span class="city-card__focus">${detail.focus}</span>
              </span>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
  exploreRoot.append(controlsRoot);
  document.body.append(exploreRoot);

  const mobileControls = document.createElement('div');
  mobileControls.className = 'mobile-flight-controls';
  mobileControls.setAttribute('aria-hidden', 'true');
  mobileControls.innerHTML = `
    <div class="mobile-flight-stick" data-mobile-move-stick role="group" tabindex="0" aria-label="Move in flight mode with touch drag or keyboard movement keys">
      <div class="mobile-flight-stick__base" aria-hidden="true">
        <span class="mobile-flight-stick__knob" data-mobile-move-knob></span>
      </div>
    </div>
    <div class="mobile-flight-lift" role="group" aria-label="Altitude in flight mode">
      <button class="mobile-flight-lift__button" data-mobile-lift="up" type="button" aria-label="Ascend">+</button>
      <button class="mobile-flight-lift__button" data-mobile-lift="down" type="button" aria-label="Descend">-</button>
    </div>
  `;
  document.body.append(mobileControls);

  return {
    fps: root.querySelector('[data-fps]'),
    cityName: root.querySelector('[data-city-name]'),
    landmarkCount: root.querySelector('[data-landmark-count]'),
    landmarks: root.querySelector('[data-landmarks]'),
    liveCount: root.querySelector('[data-live-count]'),
    liveDot: root.querySelector('[data-live-dot]'),
    livePill: root.querySelector('[data-live-pill]'),
    liveLabel: root.querySelector('[data-live-label]'),
    liveSummary: root.querySelector('[data-live-summary]'),
    liveStatus: root.querySelector('[data-live-status]'),
    liveToggle: root.querySelector('[data-live-toggle]'),
    liveBody: root.querySelector('[data-live-body]'),
    liveVisitors: root.querySelector('[data-live-visitors]'),
    liveVisitorsMeta: root.querySelector('[data-live-visitors-meta]'),
    liveVisibility: root.querySelector('[data-live-visibility]'),
    liveNameForm: root.querySelector('[data-live-name-form]'),
    liveNameInput: root.querySelector('[data-live-name-input]'),
    liveNameSave: root.querySelector('[data-live-name-save]'),
    liveSelfId: root.querySelector('[data-live-self-id]'),
    root,
    exploreDock: exploreRoot,
    nav: controlsRoot,
    flightDock: flightRoot,
    mobileControls,
    mobileMoveStick: mobileControls.querySelector('[data-mobile-move-stick]'),
    mobileMoveKnob: mobileControls.querySelector('[data-mobile-move-knob]'),
    mobileLiftButtons: mobileControls.querySelectorAll('[data-mobile-lift]'),
    navToggle: controlsRoot.querySelector('[data-nav-toggle]'),
    activeDestination: controlsRoot.querySelector('[data-active-destination]'),
    toggle: root.querySelector('[data-hud-toggle]')
  };
}

function setupHudPanel(hud) {
  let autoCollapseTimer = null;

  const clearAutoCollapse = () => {
    if (!autoCollapseTimer) return;
    window.clearTimeout(autoCollapseTimer);
    autoCollapseTimer = null;
  };

  const scheduleAutoCollapse = () => {
    clearAutoCollapse();
    autoCollapseTimer = window.setTimeout(() => {
      autoCollapseTimer = null;
      if (hud.root.contains(document.activeElement) && document.activeElement !== hud.toggle) {
        scheduleAutoCollapse();
        return;
      }
      setHudCollapsed(true);
    }, PANEL_AUTO_COLLAPSE_MS);
  };

  const setHudCollapsed = (collapsed, fromUser = false) => {
    if (collapsed && hud.root.contains(document.activeElement) && document.activeElement !== hud.toggle) {
      hud.toggle.focus({ preventScroll: true });
    }
    hud.root.classList.toggle('is-collapsed', collapsed);
    hud.toggle.setAttribute('aria-expanded', String(!collapsed));
    hud.toggle.setAttribute('title', collapsed ? 'Open atlas panel' : 'Close atlas panel');
    if (collapsed) clearAutoCollapse();
    else scheduleAutoCollapse();
  };

  hud.setHudCollapsed = setHudCollapsed;
  setHudCollapsed(false);

  hud.toggle.addEventListener('click', () => {
    setHudCollapsed(!hud.root.classList.contains('is-collapsed'), true);
  });
}

function setupNavPanel(hud) {
  if (!hud.nav || !hud.navToggle) return;
  let autoCollapseTimer = null;

  const clearAutoCollapse = () => {
    if (autoCollapseTimer) window.clearTimeout(autoCollapseTimer);
    autoCollapseTimer = null;
  };

  const scheduleAutoCollapse = () => {
    clearAutoCollapse();
    autoCollapseTimer = window.setTimeout(() => {
      autoCollapseTimer = null;
      setNavCollapsed(true);
    }, PANEL_AUTO_COLLAPSE_MS);
  };

  const setNavCollapsed = (collapsed, fromUser = false) => {
    if (collapsed && hud.nav.contains(document.activeElement) && document.activeElement !== hud.navToggle) {
      hud.navToggle.focus({ preventScroll: true });
    }
    hud.nav.classList.toggle('is-collapsed', collapsed);
    hud.navToggle.setAttribute('aria-expanded', String(!collapsed));
    hud.navToggle.setAttribute('title', collapsed ? 'Open destinations' : 'Collapse destinations');
    if (collapsed) clearAutoCollapse();
    else scheduleAutoCollapse();
  };

  let compactLayout = window.innerWidth <= 720;

  hud.setNavCollapsed = setNavCollapsed;
  setNavCollapsed(false);

  hud.navToggle.addEventListener('click', () => {
    setNavCollapsed(!hud.nav.classList.contains('is-collapsed'), true);
  });

  window.addEventListener('resize', () => {
    const nextCompactLayout = window.innerWidth <= 720;
    if (nextCompactLayout === compactLayout) return;
    compactLayout = nextCompactLayout;
    if (compactLayout) setNavCollapsed(true);
  });
}

function setupLivePanel(hud) {
  if (!hud.liveToggle || !hud.liveBody) return;

  if (hud.liveNameInput) hud.liveNameInput.value = liveDisplayName;

  const saveDisplayName = () => {
    liveDisplayName = sanitizeLiveDisplayName(hud.liveNameInput?.value ?? '');
    if (hud.liveNameInput) hud.liveNameInput.value = liveDisplayName;
    writeStoredLiveDisplayName(liveDisplayName);
    livePresence?.setDisplayName(liveDisplayName);
    if (hud.liveStatus) hud.liveStatus.textContent = liveDisplayName
      ? `Display name saved as ${liveDisplayName}.`
      : 'Display name cleared.';
  };

  const setLiveExpanded = (expanded) => {
    if (!expanded && hud.liveBody.contains(document.activeElement)) {
      hud.liveToggle.focus({ preventScroll: true });
    }
    hud.liveBody.hidden = !expanded;
    hud.liveToggle.setAttribute('aria-expanded', String(expanded));
    hud.liveToggle.setAttribute('title', expanded ? 'Close live visitors' : 'Open live visitors');
  };

  hud.setLiveExpanded = setLiveExpanded;
  hud.liveToggle.addEventListener('click', () => {
    setLiveExpanded(hud.liveBody.hidden);
  });
  hud.liveToggle.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    setLiveExpanded(false);
  });
  hud.liveBody.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape') return;
    if (isTextInput(event.target)) {
      event.preventDefault();
      event.target.blur();
      return;
    }
    event.preventDefault();
    setLiveExpanded(false);
  });
  hud.liveNameForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveDisplayName();
  });
  hud.liveNameInput?.addEventListener('change', saveDisplayName);
  hud.liveVisibility?.addEventListener('click', () => {
    const nextVisible = hud.liveVisibility.getAttribute('aria-pressed') !== 'true';
    livePresence?.setVisitorsVisible(nextVisible);
  });
}

function setupMobileFlightControls(hud) {
  if (!hud.mobileControls || !hud.mobileMoveStick || !hud.mobileMoveKnob) return;

  const updateMoveStick = (event) => {
    const rawX = event.clientX - flight.mobile.moveCenterX;
    const rawY = event.clientY - flight.mobile.moveCenterY;
    const maxRadius = flight.mobile.moveRadius;
    const distance = Math.hypot(rawX, rawY);
    const scaleFactor = distance > maxRadius ? maxRadius / distance : 1;
    const dx = rawX * scaleFactor;
    const dy = rawY * scaleFactor;
    const axisX = dx / maxRadius;
    const axisY = -dy / maxRadius;
    const axisLength = Math.hypot(axisX, axisY);

    if (axisLength < 0.12) {
      flight.mobile.moveX = 0;
      flight.mobile.moveY = 0;
    } else {
      const normalizedLength = (axisLength - 0.12) / 0.88;
      const axisScale = Math.min(1, normalizedLength) / axisLength;
      flight.mobile.moveX = axisX * axisScale;
      flight.mobile.moveY = axisY * axisScale;
    }
    hud.mobileMoveKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const beginMove = (event) => {
    if (!flight.active || flight.mobile.movePointerId !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    flight.mobile.movePointerId = event.pointerId;
    const rect = hud.mobileMoveStick.getBoundingClientRect();
    flight.mobile.moveCenterX = rect.left + rect.width * 0.5;
    flight.mobile.moveCenterY = rect.top + rect.height * 0.5;
    flight.mobile.moveRadius = Math.max(26, Math.min(rect.width, rect.height) * 0.34);
    hud.mobileMoveStick.classList.add('is-active');
    capturePointer(hud.mobileMoveStick, event.pointerId);
    updateMoveStick(event);
  };

  const moveStick = (event) => {
    if (event.pointerId !== flight.mobile.movePointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateMoveStick(event);
  };

  const endMove = (event) => {
    if (event.pointerId !== flight.mobile.movePointerId) return;
    event.preventDefault();
    event.stopPropagation();
    releasePointerCapture(hud.mobileMoveStick, event.pointerId);
    resetMobileMoveInput();
  };

  hud.mobileMoveStick.addEventListener('pointerdown', beginMove);
  hud.mobileMoveStick.addEventListener('pointermove', moveStick);
  hud.mobileMoveStick.addEventListener('pointerup', endMove);
  hud.mobileMoveStick.addEventListener('pointercancel', endMove);
  hud.mobileMoveStick.addEventListener('lostpointercapture', endMove);
  hud.mobileMoveStick.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('pointerup', endMove);
  window.addEventListener('pointercancel', endMove);

  hud.mobileLiftButtons.forEach((button) => {
    const direction = button.getAttribute('data-mobile-lift') === 'up' ? 1 : -1;
    let pointerActivated = false;

    const beginLift = (event) => {
      if (!flight.active || flight.mobile.liftPointerId !== null) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      pointerActivated = true;
      flight.mobile.liftPointerId = event.pointerId;
      flight.mobile.lift = direction;
      button.classList.add('is-active');
      capturePointer(button, event.pointerId);
    };

    const endLift = (event) => {
      if (event.pointerId !== flight.mobile.liftPointerId) return;
      event.preventDefault();
      event.stopPropagation();
      releasePointerCapture(button, event.pointerId);
      resetMobileLiftInput();
      pulseMobileLift(direction, button);
      window.setTimeout(() => {
        pointerActivated = false;
      }, 220);
    };

    button.addEventListener('pointerdown', beginLift);
    button.addEventListener('pointerup', endLift);
    button.addEventListener('pointercancel', endLift);
    button.addEventListener('lostpointercapture', endLift);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('pointerup', endLift);
    window.addEventListener('pointercancel', endLift);
    button.addEventListener('keydown', (event) => {
      if (!flight.active || !isActivationKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      flight.mobile.lift = direction;
      button.classList.add('is-active');
    });
    button.addEventListener('keyup', (event) => {
      if (!isActivationKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      resetMobileLiftInput();
    });
    button.addEventListener('blur', resetMobileLiftInput);
    button.addEventListener('click', (event) => {
      if (!flight.active) return;
      if (pointerActivated) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      pulseMobileLift(direction, button);
    });
  });
}

function pulseMobileLift(direction, button) {
  flight.mobile.lift = direction;
  button.classList.add('is-active');
  window.setTimeout(resetMobileLiftInput, 180);
}

function isActivationKey(event) {
  return event.code === 'Space' || event.code === 'Enter';
}

function resetMobileMoveInput() {
  flight.mobile.movePointerId = null;
  flight.mobile.moveX = 0;
  flight.mobile.moveY = 0;
  hud.mobileMoveStick?.classList.remove('is-active');
  if (hud.mobileMoveKnob) hud.mobileMoveKnob.style.transform = 'translate(0, 0)';
}

function resetMobileLiftInput() {
  flight.mobile.liftPointerId = null;
  flight.mobile.lift = 0;
  hud.mobileLiftButtons?.forEach((button) => button.classList.remove('is-active'));
}

function resetMobileFlightInput() {
  resetMobileMoveInput();
  resetMobileLiftInput();
  flight.dragging = false;
  flight.lookPointerId = null;
}

function capturePointer(element, pointerId) {
  try {
    element?.setPointerCapture?.(pointerId);
  } catch {
    // Synthetic events and cancelled native touches may not have an active pointer.
  }
}

function releasePointerCapture(element, pointerId) {
  try {
    element?.releasePointerCapture?.(pointerId);
  } catch {
    // The browser may already have released capture after pointerup/cancel.
  }
}

function setActiveView(viewId, options = {}) {
  const { revealInNav = true, focusButton = false } = options;
  activeViewId = viewId;
  window.__ROME_METRICS__.activeCity = activeViewId;
  const cityView = getCityView(activeViewId);
  if (hud.activeDestination) hud.activeDestination.textContent = cityView?.label ?? 'City';
  document.querySelectorAll('[data-view]').forEach((button) => {
    const isActive = button.getAttribute('data-view') === activeViewId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
    if (isActive && revealInNav) button.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (isActive && focusButton) button.focus({ preventScroll: !revealInNav });
  });
  updateCityLandmarks(activeViewId);
}

function updateCityLandmarks(cityId) {
  if (!hud.landmarks) return;

  const cityView = getCityView(cityId);
  const landmarks = (CITY_LANDMARKS[cityId] ?? []).filter((landmark) => getLandmarkTarget(cityId, landmark.targetKey));
  hud.cityName.textContent = cityView?.label ?? 'City';
  hud.landmarkCount.textContent = `${landmarks.length} landmarks`;
  hud.landmarks.replaceChildren();

  for (const landmark of landmarks) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'landmark-chip';
    button.textContent = landmark.label;
    button.title = `Fly to ${landmark.label}`;
    button.addEventListener('click', () => flyToLandmark(cityId, landmark.targetKey));
    hud.landmarks.append(button);
  }
}

function flyToLandmark(cityId, targetKey) {
  const cityView = getCityView(cityId);
  const target = getLandmarkTarget(cityId, targetKey);
  if (!cityView || !target) return;

  setActiveView(cityId);
  flyTo(landmarkCameraFor(cityView, target, targetKey), target);
}

function getCityView(cityId) {
  return world.cityViews.find((view) => view.id === cityId) ?? world.navViews.find((view) => view.id === cityId);
}

function getLandmarkTarget(cityId, targetKey) {
  return world.focusTargets[`${cityId}:${targetKey}`] ?? null;
}

function getLivePresenceSnapshot() {
  const mode = flight.active ? 'flight' : 'orbit';
  const positionMoved = camera.position.distanceTo(liveLocalMotion.position);
  const rotationDelta = 1 - Math.abs(camera.quaternion.dot(liveLocalMotion.quaternion));
  const hasFlightInput = flight.active && (
    flight.keys.size > 0 ||
    Math.abs(flight.mobile.moveX) > 0.02 ||
    Math.abs(flight.mobile.moveY) > 0.02 ||
    Math.abs(flight.mobile.lift) > 0.02 ||
    flight.dragging
  );
  const moving = hasFlightInput || positionMoved > 0.18 || rotationDelta > 0.00008;
  liveLocalMotion.position.copy(camera.position);
  liveLocalMotion.quaternion.copy(camera.quaternion);

  const located = typeof world.locateCity === 'function'
    ? world.locateCity(camera.position.x, camera.position.z)
    : null;
  const locatedCityId = getFlightLocatedCityId(located);
  const cityId = locatedCityId || activeViewId || 'between';
  const cityView = getCityView(cityId);

  return {
    cityId,
    cityName: cityView?.label ?? 'Across the atlas',
    mode,
    moving,
    userName: liveDisplayName,
    fps: fpsState.fps,
    position: camera.position,
    quaternion: camera.quaternion
  };
}

function updateLivePresenceUi(state) {
  if (!state || !hud.liveToggle) return;

  hud.root.dataset.liveConnection = state.status;
  const onlineText = state.status === 'connected' ? String(state.onlineCount) : '0';
  const remoteText = state.remoteCount === 1 ? '1 visitor nearby' : `${state.remoteCount} visitors nearby`;
  const summary = state.status === 'connected'
    ? `${state.onlineCount} online · ${remoteText}`
    : state.status === 'disconnected'
      ? 'Reconnecting to live visitors'
      : 'Live visitors unavailable';
  const livePill = state.status === 'connected'
    ? `Live world · ${state.onlineCount} online`
    : state.status === 'disconnected'
      ? 'Live paused · reconnecting'
      : 'Solo mode';

  if (hud.liveCount) hud.liveCount.textContent = onlineText;
  if (hud.livePill) hud.livePill.textContent = livePill;
  if (hud.liveLabel) hud.liveLabel.textContent = state.statusLabel ?? 'Solo mode';
  if (hud.liveSummary) hud.liveSummary.textContent = summary;
  if (hud.liveStatus) hud.liveStatus.textContent = summary;
  if (hud.liveDot) hud.liveDot.dataset.status = state.status;
  if (hud.liveSelfId) hud.liveSelfId.textContent = state.identity?.displayId ? `#${state.identity.displayId}` : '-----';
  if (hud.liveVisibility) {
    hud.liveVisibility.setAttribute('aria-pressed', String(state.visitorsVisible));
    hud.liveVisibility.textContent = state.visitorsVisible ? 'Visitors visible' : 'Visitors hidden';
  }
  renderLiveVisitors(state.participants ?? [], state.remoteCount ?? 0);

  window.__ROME_METRICS__.live = {
    status: state.status,
    online: state.onlineCount,
    remote: state.remoteCount,
    visitorId: state.identity?.displayId ?? null
  };
}

function renderLiveVisitors(participants, totalCount = participants.length) {
  if (!hud.liveVisitors) return;
  const visibleCount = Math.min(participants.length, 8);
  const visibleVisitors = participants.slice(0, visibleCount);
  if (hud.liveVisitorsMeta) {
    hud.liveVisitorsMeta.textContent = totalCount > visibleCount
      ? `Showing ${visibleCount} of ${totalCount} live visitors.`
      : totalCount
        ? `${totalCount} live visitor${totalCount === 1 ? '' : 's'} shown.`
        : 'No live visitors yet.';
  }
  const renderKey = JSON.stringify([totalCount, visibleVisitors.map((visitor) => [
    visitor.key,
    visitor.displayId,
    visitor.name,
    visitor.color,
    visitor.mode,
    visitor.cityName
  ])]);
  if (liveVisitorsRenderKey === renderKey) return;

  liveVisitorsRenderKey = renderKey;
  const previousScrollTop = hud.liveVisitors.scrollTop;
  const bottomOffset = hud.liveVisitors.scrollHeight - hud.liveVisitors.scrollTop - hud.liveVisitors.clientHeight;
  const wasPinnedToBottom = bottomOffset < 8;
  const activeElement = document.activeElement;
  const activeRow = activeElement instanceof Element ? activeElement.closest?.('.live-visitor') : null;

  if (!participants.length) {
    liveVisitorRows.clear();
    hud.liveVisitors.replaceChildren(getLiveEmptyRow());
    return;
  }

  const desiredKeys = new Set();
  visibleVisitors.forEach((visitor, index) => {
    const key = visitor.key ?? visitor.displayId ?? `visitor-${index}`;
    desiredKeys.add(key);
    const row = getLiveVisitorRow(key);
    updateLiveVisitorRow(row, visitor);
    const currentAtIndex = hud.liveVisitors.children[index];
    if (currentAtIndex !== row) hud.liveVisitors.insertBefore(row, currentAtIndex ?? null);
  });

  for (const [key, row] of liveVisitorRows) {
    if (desiredKeys.has(key)) continue;
    if (activeRow === row) hud.liveToggle?.focus({ preventScroll: true });
    row.remove();
    liveVisitorRows.delete(key);
  }

  if (wasPinnedToBottom) {
    hud.liveVisitors.scrollTop = hud.liveVisitors.scrollHeight;
  } else {
    hud.liveVisitors.scrollTop = Math.min(previousScrollTop, hud.liveVisitors.scrollHeight);
  }
}

function getLiveEmptyRow() {
  let row = liveVisitorRows.get('__empty__');
  if (!row) {
    row = document.createElement('li');
    row.className = 'live-visitors__empty';
    row.textContent = 'No live visitors yet.';
    liveVisitorRows.set('__empty__', row);
  }
  return row;
}

function getLiveVisitorRow(key) {
  let row = liveVisitorRows.get(key);
  if (row) return row;

  row = document.createElement('li');
  row.className = 'live-visitor';
  row.dataset.liveVisitorKey = key;

  const swatch = document.createElement('span');
  swatch.className = 'live-visitor__swatch';
  swatch.setAttribute('aria-hidden', 'true');

  const copy = document.createElement('span');
  copy.className = 'live-visitor__copy';

  const name = document.createElement('strong');
  const meta = document.createElement('span');
  copy.append(name, meta);
  row.append(swatch, copy);
  liveVisitorRows.set(key, row);
  return row;
}

function updateLiveVisitorRow(row, visitor) {
  const safeColor = /^#[0-9a-f]{6}$/i.test(visitor.color) ? visitor.color : '#f2c46d';
  const nextName = visitor.name ?? (visitor.displayId ? `Visitor #${visitor.displayId}` : 'Visitor');
  const nextMeta = `${visitor.mode === 'flight' ? 'Flying' : 'Exploring'} ${visitor.cityName ?? 'across the atlas'}`;
  const swatch = row.querySelector('.live-visitor__swatch');
  const name = row.querySelector('strong');
  const meta = row.querySelector('.live-visitor__copy span');

  if (swatch?.style.getPropertyValue('--visitor-color') !== safeColor) {
    swatch?.style.setProperty('--visitor-color', safeColor);
  }
  if (name && name.textContent !== nextName) name.textContent = nextName;
  if (meta && meta.textContent !== nextMeta) meta.textContent = nextMeta;
}

function landmarkCameraFor(cityView, target, targetKey = '') {
  const direction = cityView.position.clone().sub(cityView.target);
  if (targetKey === 'spyros') {
    return target
      .clone()
      .add(direction.normalize().multiplyScalar(34))
      .setY(Math.max(target.y + 14, Math.min(120, target.y + 24)));
  }

  const distance = Math.max(82, Math.min(168, direction.length() * 0.72));
  return target
    .clone()
    .add(direction.normalize().multiplyScalar(distance))
    .setY(Math.max(target.y + 42, Math.min(220, target.y + distance * 0.62)));
}

function setFlightMode(enabled, requestLock = false) {
  const changed = flight.active !== enabled;
  flight.active = enabled;
  controls.enabled = !enabled;
  syncFlightModeUi(enabled);
  if (!changed) return;

  flight.dragging = false;
  flight.lookPointerId = null;
  flight.pointerLocked = false;
  resetFlightCitySync();
  if (!enabled) interruptFlightInput();

  if (enabled) {
    syncFlightAnglesFromCamera();
    desiredPosition.copy(camera.position);
    desiredTarget.copy(controls.target);
    if (requestLock && shouldRequestPointerLock() && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  } else {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    controls.target.copy(camera.position).addScaledVector(forward, 34);
    desiredPosition.copy(camera.position);
    desiredTarget.copy(controls.target);
  }
}

function syncFlightModeUi(enabled) {
  document.body.classList.toggle('is-flight', enabled);
  hud.mobileControls?.setAttribute('aria-hidden', String(!enabled));
  const button = document.querySelector('[data-mode="flight"]');
  if (button) {
    button.classList.toggle('is-active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Exit flight mode' : 'Enter flight mode');
    button.setAttribute('title', enabled ? 'Exit flight mode' : 'Enter flight mode');
    const label = button.querySelector('[data-flight-label]');
    if (label) label.textContent = enabled ? 'Exit flight' : 'Enter flight';
    const state = button.querySelector('[data-flight-state]');
    if (state) state.textContent = enabled ? 'Active' : 'Ready';
  }
}

function interruptFlightInput() {
  flight.keys.clear();
  resetMobileFlightInput();
}

function syncFlightAnglesFromCamera() {
  euler.setFromQuaternion(camera.quaternion, 'YXZ');
  flight.pitch = euler.x;
  flight.yaw = euler.y;
}

function shouldRequestPointerLock() {
  const hasFinePointer = window.matchMedia?.('(any-pointer: fine)').matches ?? true;
  const canHover = window.matchMedia?.('(hover: hover)').matches ?? true;
  return hasFinePointer && canHover;
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

function resetFlightCitySync() {
  flightCitySync.candidateId = null;
  flightCitySync.candidateSince = 0;
}

function updateFlightCitySync(now) {
  if (typeof world.locateCity !== 'function') return;

  const timestamp = Number.isFinite(now) ? now : performance.now();
  const located = world.locateCity(camera.position.x, camera.position.z);
  const nextCityId = getFlightLocatedCityId(located);
  if (!nextCityId || nextCityId === activeViewId) {
    resetFlightCitySync();
    return;
  }

  if (flightCitySync.candidateId !== nextCityId) {
    flightCitySync.candidateId = nextCityId;
    flightCitySync.candidateSince = timestamp;
    return;
  }

  if (timestamp - flightCitySync.candidateSince < FLIGHT_CITY_SYNC_DWELL_MS) return;
  setActiveView(nextCityId, { revealInNav: false });
  resetFlightCitySync();
}

function getFlightLocatedCityId(located) {
  if (!located) return null;

  const cityId = located.cityId ?? null;
  if (cityId && getCityView(cityId)) {
    if (cityId === activeViewId || !Number.isFinite(located.signedDistance)) return cityId;
    return located.signedDistance <= -FLIGHT_CITY_SYNC_INSET ? cityId : null;
  }

  return null;
}

function moveFlight(delta) {
  if (!flight.active) return;

  forward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  right.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  moveVector.set(0, 0, 0);

  let forwardAxis = flight.mobile.moveY;
  let strafeAxis = flight.mobile.moveX;
  let liftAxis = flight.mobile.lift;

  if (flight.keys.has('KeyW') || flight.keys.has('ArrowUp')) forwardAxis += 1;
  if (flight.keys.has('KeyS') || flight.keys.has('ArrowDown')) forwardAxis -= 1;
  if (flight.keys.has('KeyD') || flight.keys.has('ArrowRight')) strafeAxis += 1;
  if (flight.keys.has('KeyA') || flight.keys.has('ArrowLeft')) strafeAxis -= 1;
  if (flight.keys.has('KeyE') || flight.keys.has('Space')) liftAxis += 1;
  if (flight.keys.has('KeyQ') || flight.keys.has('ControlLeft') || flight.keys.has('ControlRight')) liftAxis -= 1;

  forwardAxis = clampInputAxis(forwardAxis);
  strafeAxis = clampInputAxis(strafeAxis);
  liftAxis = clampInputAxis(liftAxis);

  if (forwardAxis !== 0) moveVector.addScaledVector(forward, forwardAxis);
  if (strafeAxis !== 0) moveVector.addScaledVector(right, strafeAxis);
  moveVector.y += liftAxis;

  if (moveVector.lengthSq() > 0) {
    const speed = flight.keys.has('ShiftLeft') || flight.keys.has('ShiftRight')
      ? flight.fastSpeed
      : flight.keys.has('AltLeft') || flight.keys.has('AltRight')
        ? flight.slowSpeed
        : flight.speed;
    const inputLength = moveVector.length();
    camera.position.addScaledVector(moveVector.multiplyScalar(1 / inputLength), speed * delta * Math.min(1, inputLength));
    clampFlightPosition();
  }

  controls.target.copy(camera.position).addScaledVector(forward, 34);
  desiredPosition.copy(camera.position);
  desiredTarget.copy(controls.target);
}

function clampInputAxis(value) {
  return Math.max(-1, Math.min(1, value));
}

function updateLabels() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const cameraPosition = camera.position;
  const hudRect = hud.root.getBoundingClientRect();
  const controlsRect = hud.exploreDock.getBoundingClientRect();
  const mobileControlsRect = hud.mobileControls?.getBoundingClientRect();
  const inHudZone = (screenX, screenY) => isInsideRect(screenX, screenY, hudRect, 12);
  const inControlsZone = (screenX, screenY) => isInsideRect(screenX, screenY, controlsRect, 14);
  const inMobileControlsZone = (screenX, screenY) => {
    return flight.active &&
      mobileControlsRect &&
      mobileControlsRect.width > 0 &&
      mobileControlsRect.height > 0 &&
      isInsideRect(screenX, screenY, mobileControlsRect, 14);
  };

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
      !inMobileControlsZone(screenX, screenY) &&
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
  window.__ROME_METRICS__.activeCity = activeViewId;
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
    updateFlightCitySync(now);
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
  livePresence.update(now, delta);
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
  resetMobileFlightInput();
});

window.visualViewport?.addEventListener('resize', () => {
  resetMobileFlightInput();
});

window.addEventListener('keydown', (event) => {
  if (!flight.active || isTextInput(event.target)) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    setFlightMode(false);
    return;
  }

  if (event.repeat) return;
  flight.keys.add(event.code);
  if (isFlightKey(event.code)) event.preventDefault();
});

window.addEventListener('keyup', (event) => {
  flight.keys.delete(event.code);
});

window.addEventListener('blur', () => {
  if (flight.active) setFlightMode(false);
  else interruptFlightInput();
});

window.addEventListener('pagehide', () => {
  if (flight.active) setFlightMode(false);
  else interruptFlightInput();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (flight.active) setFlightMode(false);
    else interruptFlightInput();
  }
});

document.addEventListener('pointerlockchange', () => {
  const hadCanvasLock = flight.pointerLocked;
  const hasCanvasLock = document.pointerLockElement === canvas;
  flight.pointerLocked = hasCanvasLock;
  if (!hasCanvasLock) {
    if (flight.active && hadCanvasLock) {
      setFlightMode(false);
      return;
    }
    flight.dragging = false;
    flight.lookPointerId = null;
  }
});

canvas.addEventListener('pointerdown', (event) => {
  if (!flight.active) return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (flight.lookPointerId !== null) return;
  event.preventDefault();
  flight.dragging = true;
  flight.lookPointerId = event.pointerId;
  flight.lookLastX = event.clientX;
  flight.lookLastY = event.clientY;
  capturePointer(canvas, event.pointerId);
});

function endFlightLook(event) {
  if (event.pointerId !== flight.lookPointerId) return;
  flight.dragging = false;
  flight.lookPointerId = null;
  releasePointerCapture(canvas, event.pointerId);
}

canvas.addEventListener('pointerup', endFlightLook);
canvas.addEventListener('pointercancel', endFlightLook);
canvas.addEventListener('lostpointercapture', endFlightLook);
window.addEventListener('pointerup', endFlightLook);
window.addEventListener('pointercancel', endFlightLook);

canvas.addEventListener('pointermove', (event) => {
  if (!flight.active) return;
  if (document.pointerLockElement !== canvas && event.pointerId !== flight.lookPointerId) return;
  const movementX = document.pointerLockElement === canvas
    ? event.movementX
    : event.clientX - flight.lookLastX;
  const movementY = document.pointerLockElement === canvas
    ? event.movementY
    : event.clientY - flight.lookLastY;
  flight.lookLastX = event.clientX;
  flight.lookLastY = event.clientY;
  updateFlightLook(movementX, movementY);
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
