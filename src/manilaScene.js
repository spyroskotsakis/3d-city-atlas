import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 340;
const TERRAIN_CELL = 5.8;
const TILE = 3.4;
const PEDESTRIAN_COUNT = 460;
const JEEPNEY_COUNT = 58;
const MOTORBIKE_COUNT = 72;
const TRICYCLE_COUNT = 44;
const TAXI_COUNT = 28;
const BUS_COUNT = 18;
const TRAIN_COUNT = 14;
const BOAT_COUNT = 18;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'manilaTerrain',
  'manilaGrass',
  'manilaBay',
  'jeepneyChrome',
  'water',
  'asphalt',
  'concrete',
  'cobblestone',
  'limestone',
  'brick',
  'slate',
  'glass',
  'steel',
  'gold',
  'wood',
  'cloth',
  'vegetation',
  'shadow',
  'graffiti',
  'neon',
  'neonPink',
  'neonCyan',
  'crowd',
  'skin'
];

const LANDMARK_ZONES = [
  ['Intramuros', -96, -14, 84, 78],
  ['Rizal Park / Luneta', -112, 70, 78, 44],
  ['Binondo / Escolta', -58, -92, 70, 54],
  ['Quiapo', 12, -130, 50, 36],
  ['Makati CBD', 58, 72, 82, 62],
  ['Poblacion', 18, 24, 44, 34],
  ['BGC High Street', 148, 78, 88, 62],
  ['Ortigas Center', 176, 6, 72, 54],
  ['Mandaluyong / San Juan', 94, -42, 68, 44],
  ['Quezon City', 116, -198, 110, 70],
  ['Cubao Expo', 168, -128, 70, 46],
  ['Pasay Bay Area', -168, 188, 100, 62],
  ['Paranaque / Las Pinas', -138, 272, 86, 54],
  ['Marikina River Park', 268, -114, 72, 52],
  ['Caloocan / Navotas / Malabon', -126, -202, 92, 56],
  ['Port and Fish Market', -218, -118, 72, 54]
];

const PEDESTRIAN_ROUTES = [
  [[-124, -42], [-72, -42], [-64, 18], [-116, 24], [-124, -42]],
  [[-86, -112], [-42, -112], [-22, -82], [-62, -66], [-86, -112]],
  [[6, 12], [34, 18], [42, 42], [8, 48], [6, 12]],
  [[104, 48], [184, 48], [188, 108], [112, 108], [104, 48]],
  [[68, -226], [164, -226], [176, -178], [86, -164], [68, -226]],
  [[-210, 160], [-128, 158], [-122, 220], [-200, 224], [-210, 160]]
].map((points) => points.map(([x, z]) => ({ x, z })));

const ROAD_ROUTES = [
  [[-190, -236], [-190, 250], [-126, 278], [-76, 210], [-70, 84], [-38, -54], [-12, -138], [94, -238]],
  [[92, -250], [98, -126], [100, -26], [84, 74], [104, 168], [190, 220]],
  [[-142, -128], [-64, -98], [18, -118], [96, -76], [172, -18], [218, 72]],
  [[-40, 84], [58, 72], [148, 78], [220, 92], [286, -88]]
].map((points) => points.map(([x, z]) => ({ x, z })));

const TRAIN_ROUTES = [
  [[-200, -118], [-94, -82], [-2, -116], [90, -178], [178, -138]],
  [[92, -250], [98, -126], [100, -26], [84, 74], [104, 168]]
].map((points) => points.map(([x, z]) => ({ x, z })));

const BOAT_ROUTES = [
  [[-248, -22], [-204, -32], [-156, -40]],
  [[-42, -25], [-10, -32], [28, -39], [70, -45], [118, -25], [164, -29], [214, -39], [250, -46], [286, -31]],
  [[-286, -220], [-282, -120], [-276, 20], [-270, 150], [-272, 238]]
].map((points) => points.map(([x, z]) => ({ x, z })));

function createRng(seed = 0x4d4e4c41) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vary(hex, amount = 0) {
  tempColor.set(hex);
  const hsl = {};
  tempColor.getHSL(hsl);
  tempColor.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + amount * 0.08)), Math.max(0, Math.min(1, hsl.l + amount)));
  return tempColor.getHex();
}

function bayEdge(z) {
  return -226 - Math.exp(-(((z - 162) / 86) ** 2)) * 34 + Math.sin(z * 0.026) * 10;
}

function pasigCenterZ(x) {
  return -34 + Math.sin((x + 94) * 0.033) * 10 + Math.sin(x * 0.071) * 3;
}

function pasigWidthAt(x) {
  return 22 + Math.sin(x * 0.035 + 1.3) * 3.5;
}

function distanceToSegmentSq(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) {
    const ax = x - a.x;
    const az = z - a.z;
    return ax * ax + az * az;
  }
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
  const px = a.x + dx * t;
  const pz = a.z + dz * t;
  const ox = x - px;
  const oz = z - pz;
  return ox * ox + oz * oz;
}

function distanceToPolylineSq(x, z, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    best = Math.min(best, distanceToSegmentSq(x, z, points[i - 1], points[i]));
  }
  return best;
}

function esteroDistance(x, z) {
  const esteros = [
    [{ x: -92, z: -130 }, { x: -82, z: -54 }, { x: -120, z: 12 }],
    [{ x: -16, z: -146 }, { x: -32, z: -74 }, { x: -6, z: -30 }],
    [{ x: -204, z: -166 }, { x: -214, z: -98 }, { x: -238, z: -40 }],
    [{ x: 234, z: -154 }, { x: 264, z: -112 }, { x: 288, z: -64 }]
  ];
  return Math.sqrt(Math.min(...esteros.map((points) => distanceToPolylineSq(x, z, points))));
}

function isBay(x, z, pad = 0) {
  return x < bayEdge(z) + pad;
}

function isPasig(x, z, pad = 0) {
  return Math.abs(z - pasigCenterZ(x)) <= pasigWidthAt(x) / 2 + pad && x > -260 - pad && x < 294 + pad;
}

function isHistoricCore(x, z, pad = 0) {
  return x > -140 - pad && x < -52 + pad && z > -58 - pad && z < 34 + pad;
}

function isWater(x, z, pad = 0) {
  if (isHistoricCore(x, z, pad)) return false;
  return isBay(x, z, pad) || isPasig(x, z, pad) || esteroDistance(x, z) < 4.4 + pad;
}

function terrainHeightAt(x, z) {
  if (isWater(x, z, 0)) return 0.54 + Math.sin(x * 0.034 + z * 0.021) * 0.035;
  const makati = Math.exp(-(((x - 58) / 82) ** 2 + ((z - 72) / 72) ** 2)) * 0.6;
  const bgc = Math.exp(-(((x - 148) / 88) ** 2 + ((z - 78) / 72) ** 2)) * 0.55;
  const qc = Math.exp(-(((x - 116) / 132) ** 2 + ((z + 198) / 76) ** 2)) * 0.45;
  const riverCut = Math.exp(-((z - pasigCenterZ(x)) ** 2) / 360) * 0.38;
  return Math.max(0.72, 1.05 + makati + bgc + qc - riverCut + Math.sin(x * 0.029 + z * 0.023) * 0.13);
}

export function manilaTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function isParkArea(x, z) {
  return (
    ((x + 112) / 52) ** 2 + ((z - 70) / 25) ** 2 < 1 ||
    ((x - 84) / 34) ** 2 + ((z + 208) / 22) ** 2 < 1 ||
    ((x - 270) / 44) ** 2 + ((z + 114) / 28) ** 2 < 1 ||
    ((x - 116) / 28) ** 2 + ((z - 102) / 18) ** 2 < 1
  );
}

function terrainMaterial(x, z) {
  if (isWater(x, z, 0.5)) return 'manilaBay';
  if (isParkArea(x, z)) return 'manilaGrass';
  return 'manilaTerrain';
}

export function createManilaScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Manila voxel material: ${key}`);
  }

  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 8, isRiver: isWater });
  const labels = [];
  const animated = [];

  const addLabel = (name, x, y, z) => {
    labels.push({ name, position: new THREE.Vector3(x, y, z) });
  };

  const addTop = (kind, x, z, sx, sy, sz, color = null, yaw = 0, base = topY(x, z)) => {
    batch.addTop(kind, x, base, z, sx, sy, sz, color, yaw);
  };

  const addTiledRect = (kind, x, z, width, depth, options = {}) => {
    const tile = options.tile ?? TILE;
    const sy = options.height ?? 0.14;
    const baseOffset = options.baseOffset ?? 0.035;
    const yaw = options.yaw ?? 0;
    const skipWater = options.skipWater ?? true;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    for (let lx = -width / 2 + tile / 2; lx <= width / 2 - tile / 2; lx += tile) {
      for (let lz = -depth / 2 + tile / 2; lz <= depth / 2 - tile / 2; lz += tile) {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        if (skipWater && isWater(wx, wz, -0.8)) continue;
        const shade = Math.sin(wx * 0.17 + wz * 0.09) * 0.024 + Math.cos(lz * 0.39) * 0.014;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, topY(wx, wz) + baseOffset);
      }
    }
  };

  const reserveRoadSegment = (tag, ax, az, bx, bz, width = 8) => {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    planner.reserveRect(tag, x, z, Math.abs(dx) + width + 8, Math.abs(dz) + width + 8, { force: true, type: 'road' });
    addTiledRect('asphalt', x, z, width, length, { color: '#3f4243', height: 0.12, tile: 3.4, yaw, baseOffset: 0.02 });
  };

  reserveLandmarkZones(planner);
  buildTerrain(batch);
  buildWaterways({ addTop, addTiledRect, addLabel });
  buildRoadsAndTransit({ reserveRoadSegment, addTop, addTiledRect, addLabel });
  buildIntramuros({ addTop, addTiledRect, addLabel, rng });
  buildOldManila({ addTop, addTiledRect, addLabel, rng });
  buildBusinessDistricts({ addTop, addTiledRect, addLabel, rng });
  buildNeighborhoods({ addTop, addTiledRect, addLabel, rng });
  const blocks = buildUrbanBlocks({ planner, addTop, rng });
  buildStreetLife({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const jeepneys = buildJeepneys({ animated, rng });
  const motorbikes = buildMotorbikes({ animated, rng });
  const tricycles = buildTricycles({ animated, rng });
  const taxis = buildTaxis({ animated, rng });
  const buses = buildBuses({ animated, rng });
  const trains = buildTrains({ animated, rng });
  const boats = buildBoats({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-manila-metro-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      intramuros: new THREE.Vector3(-96, topY(-96, -14) + 18, -14),
      cathedral: new THREE.Vector3(-82, topY(-82, -18) + 22, -18),
      fortSantiago: new THREE.Vector3(-122, topY(-122, -66) + 16, -66),
      pasig: new THREE.Vector3(-42, topY(-42, pasigCenterZ(-42)) + 8, pasigCenterZ(-42)),
      pasigRiver: new THREE.Vector3(-42, topY(-42, pasigCenterZ(-42)) + 8, pasigCenterZ(-42)),
      rizalPark: new THREE.Vector3(-112, topY(-112, 70) + 8, 70),
      binondo: new THREE.Vector3(-58, topY(-58, -92) + 12, -92),
      quiapo: new THREE.Vector3(12, topY(12, -130) + 12, -130),
      escolta: new THREE.Vector3(-44, topY(-44, -70) + 12, -70),
      makati: new THREE.Vector3(58, topY(58, 72) + 30, 72),
      bgc: new THREE.Vector3(148, topY(148, 78) + 34, 78),
      ortigas: new THREE.Vector3(176, topY(176, 6) + 28, 6),
      quezonCity: new THREE.Vector3(116, topY(116, -198) + 14, -198),
      cubao: new THREE.Vector3(168, topY(168, -128) + 12, -128),
      poblacion: new THREE.Vector3(18, topY(18, 24) + 12, 24),
      bay: new THREE.Vector3(-190, topY(-190, 188) + 9, 188),
      manilaBay: new THREE.Vector3(-190, topY(-190, 188) + 9, 188),
      marikina: new THREE.Vector3(268, topY(268, -114) + 10, -114),
      aerial: new THREE.Vector3(4, topY(4, -24) + 13, -24)
    },
    metrics: {
      instances: total,
      pedestrians,
      taxis: taxis + jeepneys,
      buses,
      cyclists: motorbikes + tricycles,
      trams: trains,
      boats,
      reservations: planner.reservations.length,
      monuments: LANDMARK_ZONES.length,
      blocks
    },
    update(elapsed) {
      for (const item of animated) item.update(elapsed);
    }
  };
}

function reserveLandmarkZones(planner) {
  LANDMARK_ZONES.forEach(([name, x, z, width, depth]) => {
    planner.reserveRect(name, x, z, width, depth, { force: true, type: 'landmark' });
  });
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      const kind = terrainMaterial(x, z);
      const h = terrainHeightAt(x, z);
      const shade = Math.sin(x * 0.058 + z * 0.037) * 0.035 + Math.cos(x * 0.021 - z * 0.045) * 0.02;
      if (kind === 'manilaBay') {
        batch.add(kind, x, 0.18, z, TERRAIN_CELL * 1.05, 0.24, TERRAIN_CELL * 1.05, terrainColor(kind, shade));
      } else {
        batch.add(kind, x, h / 2 - 0.04, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04, terrainColor(kind, shade));
      }
    }
  }
}

function terrainColor(kind, shade) {
  if (kind === 'manilaGrass') return vary(0x4f8750, shade);
  if (kind === 'manilaBay') return vary(0x3f91aa, shade);
  return vary(0xa89a82, shade);
}

function buildWaterways({ addTop, addTiledRect, addLabel }) {
  for (let x = -246; x <= 278; x += 22) {
    const z = pasigCenterZ(x);
    if (isHistoricCore(x, z, 8)) continue;
    addTop('water', x, z, 20, 0.16, pasigWidthAt(x), 0x3f91aa, 0, 0.58);
  }
  for (const [x, z, label] of [
    [-82, -44, 'Jones Bridge'],
    [-22, -38, 'Quezon Bridge'],
    [72, -22, 'Guadalupe Bridge'],
    [164, -12, 'Ortigas Bridge']
  ]) {
    addTop('steel', x, z, 34, 1.0, 5.5, 0x66727a, 0, topY(x, z) + 1.2);
    addTop('asphalt', x, z, 32, 0.18, 3.6, 0x3f4243, 0, topY(x, z) + 2.1);
    addLabel(label, x, topY(x, z) + 6, z);
  }
  addTiledRect('cobblestone', -194, 170, 82, 16, { color: '#77766d', height: 0.12, tile: 3.4 });
  addLabel('Pasig River', -42, topY(-42, pasigCenterZ(-42)) + 7, pasigCenterZ(-42));
  addLabel('Manila Bay Promenade', -190, topY(-190, 188) + 7, 188);
}

function buildRoadsAndTransit({ reserveRoadSegment, addTop, addTiledRect, addLabel }) {
  const roadPolylines = [
    ['Roxas Boulevard', [[-190, -236], [-190, 250]]],
    ['EDSA', [[92, -250], [98, -126], [100, -26], [84, 74], [104, 168]]],
    ['C5 Corridor', [[220, -224], [212, -108], [218, 72], [196, 196]]],
    ['Ayala Avenue', [[-4, 76], [112, 72]]],
    ['BGC High Street', [[104, 96], [192, 96]]],
    ['Quezon Avenue', [[18, -126], [104, -186], [170, -184]]],
    ['Taft / Rizal Avenue', [[-52, 112], [-36, 22], [-28, -104], [-12, -172]]],
    ['Port Road', [[-244, -120], [-154, -104], [-62, -88]]]
  ];
  for (const [name, points] of roadPolylines) {
    for (let i = 1; i < points.length; i += 1) reserveRoadSegment(`${name}-${i}`, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], name.includes('EDSA') ? 12 : 8);
  }

  for (const route of TRAIN_ROUTES) {
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      addTop('steel', (a.x + b.x) / 2, (a.z + b.z) / 2, 2.4, 4.2, length, 0x66727a, yaw);
      if (i % 2 === 0) addTransitStation(addTop, (a.x + b.x) / 2, (a.z + b.z) / 2, yaw);
    }
  }
  addTiledRect('manilaGrass', -112, 70, 72, 34, { color: '#4f8750', height: 0.12, tile: 3.4 });
  addLabel('MRT / LRT Lines', 94, topY(94, -86) + 12, -86);
}

function addTransitStation(addTop, x, z, yaw) {
  addTop('concrete', x, z, 15, 2.2, 5.2, 0x8b8d88, yaw, topY(x, z) + 4.0);
  addTop('steel', x, z, 17, 0.6, 6.4, 0x66727a, yaw, topY(x, z) + 6.1);
}

function buildIntramuros({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', -96, -14, 72, 62, { color: '#77766d', height: 0.13, tile: 3.4 });
  addWallRect(addTop, -96, -14, 76, 66);
  buildGate(addTop, -96, -50, 0);
  buildGate(addTop, -134, -14, Math.PI / 2);
  buildCathedral(addTop, -82, -18);
  buildFortSantiago(addTop, -122, -66);
  buildColonialChurch(addTop, -100, 16, 'San Agustin Church');
  addTop('limestone', -70, 16, 18, 5.4, 12, 0xd8cfb7);
  addTop('brick', -70, 23, 18, 1.1, 3.2, 0xb96038);
  addTop('manilaGrass', -114, 18, 14, 0.12, 12, 0x4f8750);
  for (let i = 0; i < 16; i += 1) {
    const x = -124 + rng() * 56;
    const z = -36 + rng() * 50;
    addTop('crowd', x, z, 0.8, 1.6, 0.8, 0xc57b54);
  }
  addLabel('Intramuros', -96, topY(-96, -14) + 16, -14);
  addLabel('Manila Cathedral', -82, topY(-82, -18) + 25, -18);
  addLabel('Fort Santiago', -122, topY(-122, -66) + 15, -66);
}

function addWallRect(addTop, x, z, width, depth) {
  addTop('limestone', x, z - depth / 2, width, 5.2, 3.0, 0x8b8276);
  addTop('limestone', x, z + depth / 2, width, 5.2, 3.0, 0x8b8276);
  addTop('limestone', x - width / 2, z, 3.0, 5.2, depth, 0x8b8276);
  addTop('limestone', x + width / 2, z, 3.0, 5.2, depth, 0x8b8276);
  for (let i = 0; i < 8; i += 1) {
    addTop('limestone', x - width / 2 + i * (width / 7), z - depth / 2, 4.2, 6.3, 4.2, 0x8b8276);
  }
}

function buildGate(addTop, x, z, yaw) {
  addTop('brick', x, z, 16, 7.2, 6.2, 0x9f583d, yaw);
  addTop('shadow', x, z, 5.2, 4.8, 6.6, 0x2e2924, yaw, topY(x, z) + 0.4);
  addTop('gold', x, z - 3.4, 8, 0.6, 0.4, 0xd8a334, yaw, topY(x, z) + 5.5);
}

function buildCathedral(addTop, x, z) {
  addTop('limestone', x, z, 24, 9.2, 17, 0xd8cfb7);
  addTop('slate', x, z, 25, 1.0, 18, 0x5c6268, 0, topY(x, z) + 9.2);
  addTop('limestone', x - 13, z - 4, 5, 17, 5, 0xd8cfb7);
  addTop('limestone', x + 13, z - 4, 5, 17, 5, 0xd8cfb7);
  addTop('gold', x, z - 9, 12, 1.2, 0.7, 0xd8a334, 0, topY(x, z) + 6.4);
}

function buildFortSantiago(addTop, x, z) {
  addTop('limestone', x, z, 30, 6.6, 20, 0x8b8276);
  addTop('manilaGrass', x + 4, z + 3, 18, 0.16, 10, 0x4f8750, 0, topY(x, z) + 6.8);
  addTop('brick', x - 13, z, 5, 9, 22, 0x9f583d);
  addTop('gold', x + 8, z - 11, 0.6, 8, 0.6, 0xd8a334);
}

function buildColonialChurch(addTop, x, z) {
  addTop('limestone', x, z, 22, 7.0, 13, 0xd8cfb7);
  addTop('brick', x, z, 23, 0.9, 14, 0xb96038, 0, topY(x, z) + 7.0);
  addTop('limestone', x - 10, z - 5, 4, 12, 4, 0xd8cfb7);
}

function buildOldManila({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', -58, -92, 62, 46, { color: '#77766d', height: 0.13, tile: 3.4 });
  buildShopRows({ addTop, x: -58, z: -92, width: 58, rows: 4, material: 'brick', roof: 'gold', rng, lanterns: true });
  buildArtDecoBlock(addTop, -44, -70);
  addTiledRect('asphalt', 12, -130, 44, 30, { color: '#3f4243', height: 0.12, tile: 3.4 });
  buildShopRows({ addTop, x: 12, z: -130, width: 42, rows: 3, material: 'concrete', roof: 'slate', rng, neon: true });
  addTop('limestone', 0, -134, 18, 12, 16, 0xd8cfb7);
  addTop('gold', 0, -134, 20, 1.1, 18, 0xd8a334, 0, topY(0, -134) + 12);
  addLabel('Binondo Food Alleys', -58, topY(-58, -92) + 12, -92);
  addLabel('Escolta Heritage Row', -44, topY(-44, -70) + 14, -70);
  addLabel('Quiapo Market', 12, topY(12, -130) + 12, -130);
}

function buildArtDecoBlock(addTop, x, z) {
  addTop('limestone', x, z, 26, 12, 14, 0xd8cfb7);
  for (let i = 0; i < 4; i += 1) {
    addTop('glass', x - 9 + i * 6, z - 7.2, 2.4, 4.8, 0.5, 0x9cc8c8, 0, topY(x, z) + 4.2);
  }
  addTop('gold', x, z - 7.8, 20, 0.8, 0.6, 0xd8a334, 0, topY(x, z) + 10.2);
}

function buildBusinessDistricts({ addTop, addTiledRect, addLabel, rng }) {
  buildBusinessCore({ addTop, addTiledRect, x: 58, z: 72, label: 'Makati CBD', towers: 12, rng });
  buildBusinessCore({ addTop, addTiledRect, x: 148, z: 78, label: 'BGC High Street', towers: 14, rng, modern: true });
  buildBusinessCore({ addTop, addTiledRect, x: 176, z: 6, label: 'Ortigas Center', towers: 10, rng });
  buildNightlifePocket({ addTop, addTiledRect, addLabel, x: 18, z: 24, label: 'Poblacion Hidden Bars', rng });
  addLabel('Makati CBD', 58, topY(58, 72) + 36, 72);
  addLabel('BGC High Street', 148, topY(148, 78) + 38, 78);
  addLabel('Ortigas Center', 176, topY(176, 6) + 32, 6);
}

function buildBusinessCore({ addTop, addTiledRect, x, z, towers, rng, modern = false }) {
  addTiledRect('concrete', x, z, 76, 54, { color: '#8b8d88', height: 0.14, tile: 3.4 });
  addTiledRect('manilaGrass', x - 22, z + 16, 20, 12, { color: '#4f8750', height: 0.12, tile: 3.4 });
  for (let i = 0; i < towers; i += 1) {
    const tx = x - 30 + (i % 5) * 15 + (rng() - 0.5) * 3;
    const tz = z - 20 + Math.floor(i / 5) * 18 + (rng() - 0.5) * 3;
    const h = modern ? 18 + rng() * 34 : 14 + rng() * 28;
    addTop(i % 3 === 0 ? 'glass' : 'concrete', tx, tz, 8 + rng() * 4, h, 8 + rng() * 4, i % 3 === 0 ? 0x9cc8c8 : 0x8b8d88);
    addTop('steel', tx, tz, 8.8, 0.6, 8.8, 0x66727a, 0, topY(tx, tz) + h);
    if (i % 4 === 0) addTop('neonCyan', tx, tz - 4.8, 4.2, 1.2, 0.35, 0x48d9ff, 0, topY(tx, tz) + h * 0.56);
  }
}

function buildNightlifePocket({ addTop, addTiledRect, addLabel, x, z, label, rng }) {
  addTiledRect('asphalt', x, z, 38, 28, { color: '#34383d', height: 0.12, tile: 3.4 });
  for (let i = 0; i < 12; i += 1) {
    const px = x - 16 + (i % 4) * 10;
    const pz = z - 10 + Math.floor(i / 4) * 9;
    addTop(i % 2 ? 'brick' : 'concrete', px, pz, 7.4, 5 + rng() * 3.2, 6.2, i % 2 ? 0x9f583d : 0x8b8d88);
    addTop(i % 3 === 0 ? 'neonPink' : 'neonCyan', px, pz - 3.3, 4.8, 0.9, 0.35, i % 3 === 0 ? 0xf25fa7 : 0x48d9ff, 0, topY(px, pz) + 3.8);
  }
  addLabel(label, x, topY(x, z) + 12, z);
}

function buildNeighborhoods({ addTop, addTiledRect, addLabel, rng }) {
  buildCampusAndFoodStreet({ addTop, addTiledRect, x: 116, z: -198, rng });
  buildNightlifePocket({ addTop, addTiledRect, addLabel, x: 168, z: -128, label: 'Cubao Expo', rng });
  buildBayArea({ addTop, addTiledRect, addLabel, rng });
  buildLocalDistrict({ addTop, addTiledRect, addLabel, x: 94, z: -42, label: 'Mandaluyong / San Juan Food Streets', rng });
  buildLocalDistrict({ addTop, addTiledRect, addLabel, x: -126, z: -202, label: 'Navotas / Malabon Markets', rng, industrial: true });
  buildLocalDistrict({ addTop, addTiledRect, addLabel, x: -138, z: 272, label: 'Paranaque / Las Pinas', rng });
  buildMarikina({ addTop, addTiledRect, addLabel, rng });
}

function buildCampusAndFoodStreet({ addTop, addTiledRect, x, z, rng }) {
  addTiledRect('manilaGrass', x - 24, z - 8, 50, 34, { color: '#4f8750', height: 0.12, tile: 3.4 });
  addTop('limestone', x - 20, z - 12, 32, 7, 16, 0xd8cfb7);
  addTop('concrete', x + 34, z + 8, 46, 7, 16, 0x8b8d88);
  buildShopRows({ addTop, x: x + 18, z: z + 28, width: 74, rows: 2, material: 'concrete', roof: 'slate', rng, neon: true });
  addTop('graffiti', x + 58, z + 28, 18, 3.4, 0.4, 0xf25fa7, 0, topY(x + 58, z + 28) + 3.2);
}

function buildBayArea({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('concrete', -168, 188, 88, 52, { color: '#8b8d88', height: 0.14, tile: 3.4 });
  addTop('glass', -146, 174, 16, 22, 16, 0x9cc8c8);
  addTop('glass', -182, 182, 14, 19, 14, 0x9cc8c8);
  addTop('limestone', -170, 210, 44, 8, 20, 0xd8cfb7);
  addTop('gold', -170, 210, 46, 0.9, 22, 0xd8a334, 0, topY(-170, 210) + 8);
  for (let i = 0; i < 18; i += 1) {
    addTop('crowd', -210 + rng() * 84, 160 + rng() * 62, 0.8, 1.6, 0.8, 0xc57b54);
  }
  addLabel('Pasay / Bay Area', -168, topY(-168, 188) + 24, 188);
}

function buildLocalDistrict({ addTop, addTiledRect, addLabel, x, z, label, rng, industrial = false }) {
  addTiledRect(industrial ? 'asphalt' : 'concrete', x, z, 62, 38, { color: industrial ? '#34383d' : '#8b8d88', height: 0.13, tile: 3.4 });
  for (let i = 0; i < 15; i += 1) {
    const bx = x - 26 + (i % 5) * 13;
    const bz = z - 14 + Math.floor(i / 5) * 12;
    addTop(industrial && i % 3 === 0 ? 'steel' : 'concrete', bx, bz, 8.5, 4.4 + rng() * 4, 7.4, industrial ? 0x66727a : 0x8b8d88);
    if (i % 4 === 0) addTop('cloth', bx, bz - 4, 5.5, 0.6, 0.35, 0xd94f45, 0, topY(bx, bz) + 3.2);
  }
  addBasketballCourt({ addTop, x: x + 20, z: z + 18 });
  addLabel(label, x, topY(x, z) + 12, z);
}

function buildMarikina({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('manilaGrass', 268, -114, 62, 42, { color: '#4f8750', height: 0.12, tile: 3.4 });
  addTop('water', 268, -132, 68, 0.15, 8, 0x3f91aa, 0, 0.6);
  buildShopRows({ addTop, x: 268, z: -102, width: 58, rows: 2, material: 'concrete', roof: 'gold', rng });
  addTop('gold', 288, -98, 3.2, 5.2, 8, 0xd8a334);
  addLabel('Marikina River Park', 268, topY(268, -114) + 10, -114);
}

function buildShopRows({ addTop, x, z, width, rows, material, roof, rng, lanterns = false, neon = false }) {
  const cols = Math.max(3, Math.floor(width / 11));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const bx = x - width / 2 + 6 + col * (width / cols);
      const bz = z - rows * 4 + row * 9;
      addTop(material, bx, bz, 8.4, 4.2 + rng() * 2.2, 6.4, material === 'brick' ? 0x9f583d : 0x8b8d88);
      addTop(roof, bx, bz, 8.8, 0.65, 6.8, roof === 'gold' ? 0xd8a334 : 0x5c6268, 0, topY(bx, bz) + 4.4);
      if (lanterns && col % 2 === 0) addTop('neonPink', bx, bz - 3.6, 1.2, 1.2, 0.3, 0xf25fa7, 0, topY(bx, bz) + 3.2);
      if (neon && col % 2 === 1) addTop('neonCyan', bx, bz - 3.6, 4.2, 0.8, 0.3, 0x48d9ff, 0, topY(bx, bz) + 3.1);
    }
  }
}

function addBasketballCourt({ addTop, x, z }) {
  addTop('asphalt', x, z, 18, 0.14, 12, 0x3f4243);
  addTop('gold', x - 8, z, 0.4, 4, 0.4, 0xd8a334);
  addTop('gold', x + 8, z, 0.4, 4, 0.4, 0xd8a334);
  addTop('cloth', x, z, 14, 0.18, 0.35, 0xd94f45, 0, topY(x, z) + 0.24);
}

function buildUrbanBlocks({ planner, addTop, rng }) {
  let blocks = 0;
  for (let i = 0; i < 980; i += 1) {
    const x = -310 + rng() * 620;
    const z = -300 + rng() * 620;
    if (isWater(x, z, 5) || planner.hasPoint(x, z)) continue;
    const width = 7 + rng() * 12;
    const depth = 7 + rng() * 12;
    if (!planner.reserveRect(`manila-block-${i}`, x, z, width + 3, depth + 3, { type: 'building' })) continue;
    const height = blockHeightAt(x, z, rng);
    const material = height > 13 ? (rng() > 0.45 ? 'glass' : 'concrete') : rng() > 0.58 ? 'brick' : 'concrete';
    addTop(material, x, z, width, height, depth, material === 'brick' ? 0x9f583d : material === 'glass' ? 0x9cc8c8 : 0x8b8d88);
    addTop(height > 13 ? 'steel' : 'slate', x, z, width + 0.7, 0.5, depth + 0.7, height > 13 ? 0x66727a : 0x5c6268, 0, topY(x, z) + height);
    if (rng() > 0.84) addTop('cloth', x, z - depth / 2 - 0.25, width * 0.65, 0.45, 0.25, rng() > 0.5 ? 0xd94f45 : 0x48d9ff, 0, topY(x, z) + Math.min(5.2, height * 0.7));
    blocks += 1;
  }
  return blocks;
}

function blockHeightAt(x, z, rng) {
  const business = Math.max(
    Math.exp(-(((x - 58) / 84) ** 2 + ((z - 72) / 76) ** 2)),
    Math.exp(-(((x - 148) / 90) ** 2 + ((z - 78) / 72) ** 2)),
    Math.exp(-(((x - 176) / 78) ** 2 + ((z - 6) / 64) ** 2))
  );
  const oldManila = Math.exp(-(((x + 44) / 100) ** 2 + ((z + 94) / 86) ** 2));
  return 4 + rng() * 7 + business * (8 + rng() * 20) + oldManila * (2 + rng() * 4);
}

function buildStreetLife({ planner, addTop, rng }) {
  for (let i = 0; i < 160; i += 1) {
    const route = ROAD_ROUTES[i % ROAD_ROUTES.length];
    const sample = sampleRoute(prepareRoute(route, 7, true), rng() * 900);
    const x = sample.x - sample.tangentZ * (3 + rng() * 8);
    const z = sample.z + sample.tangentX * (3 + rng() * 8);
    if (isWater(x, z, 3) || planner.hasPoint(x, z, 'building')) continue;
    if (i % 4 === 0) {
      addTop('cloth', x, z, 4.8, 2.6, 3.2, i % 8 === 0 ? 0xd94f45 : 0xf0dfb2);
      addTop('gold', x, z - 1.8, 4.5, 0.35, 0.25, 0xd8a334, 0, topY(x, z) + 2.2);
    } else if (i % 4 === 1) {
      addTop('wood', x, z, 3.2, 2.4, 2.4, 0x7a4d30);
      addTop('cloth', x, z - 1.3, 2.6, 0.45, 0.25, 0x48d9ff, 0, topY(x, z) + 1.9);
    } else {
      addTop('vegetation', x, z, 1.4, 3.2 + rng() * 2.2, 1.4, 0x4f8750);
    }
  }
}

function buildPedestrians({ animated, rng }) {
  const routes = PEDESTRIAN_ROUTES.map((route) => prepareRoute(route, 5.6, true));
  const people = [];
  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    people.push({ route, distance: rng() * route.length, speed: 2.4 + rng() * 3.2, lane: (rng() - 0.5) * route.width, phase: rng() * Math.PI * 2, scale: 0.94 + rng() * 0.18 });
  }
  const group = new THREE.Group();
  group.name = 'manila-pedestrians-vendors-nightlife-crowds';
  const parts = {
    body: makeInstancedPart(people.length, 'manila-pedestrian-body', 0x315ca8),
    shirt: makeInstancedPart(people.length, 'manila-pedestrian-shirt', 0xf25fa7),
    head: makeInstancedPart(people.length, 'manila-pedestrian-head', 0xb47a54),
    hair: makeInstancedPart(people.length, 'manila-pedestrian-hair', 0x2e2924),
    leftLeg: makeInstancedPart(people.length, 'manila-pedestrian-left-leg', 0x30333a),
    rightLeg: makeInstancedPart(people.length, 'manila-pedestrian-right-leg', 0x30333a)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updatePeople(parts, people, elapsed); } });
  updatePeople(parts, people, 0);
  return people.length;
}

function buildJeepneys({ animated, rng }) {
  const routes = ROAD_ROUTES.map((route) => prepareRoute(route, 9.5, true));
  const vehicles = [];
  for (let i = 0; i < JEEPNEY_COUNT; i += 1) {
    const route = routes[i % routes.length];
    vehicles.push({ route, distance: rng() * route.length, speed: 6 + rng() * 5.5, lane: (rng() - 0.5) * route.width, color: i % 3 });
  }
  const group = new THREE.Group();
  group.name = 'manila-jeepneys';
  const parts = {
    body: makeInstancedPart(vehicles.length, 'manila-jeepney-body', 0xd8a334),
    cab: makeInstancedPart(vehicles.length, 'manila-jeepney-cab', 0x48d9ff),
    chrome: makeInstancedPart(vehicles.length, 'manila-jeepney-chrome', 0xbfd0d5),
    sign: makeInstancedPart(vehicles.length, 'manila-jeepney-route-sign', 0xf25fa7),
    wheels: makeInstancedPart(vehicles.length, 'manila-jeepney-wheels', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateJeepneys(parts, vehicles, elapsed); } });
  updateJeepneys(parts, vehicles, 0);
  return vehicles.length;
}

function buildMotorbikes({ animated, rng }) {
  const routes = ROAD_ROUTES.map((route) => prepareRoute(route, 7.5, true));
  const bikes = [];
  for (let i = 0; i < MOTORBIKE_COUNT; i += 1) {
    const route = routes[i % routes.length];
    bikes.push({ route, distance: rng() * route.length, speed: 8 + rng() * 7, lane: (rng() - 0.5) * route.width, phase: rng() * Math.PI * 2 });
  }
  const group = new THREE.Group();
  group.name = 'manila-motorcycles-delivery-riders';
  const parts = {
    bike: makeInstancedPart(bikes.length, 'manila-motorbike-frame', 0x2e2924),
    rider: makeInstancedPart(bikes.length, 'manila-motorbike-rider', 0x2b6f8f),
    box: makeInstancedPart(bikes.length, 'manila-motorbike-delivery-box', 0xd94f45),
    helmet: makeInstancedPart(bikes.length, 'manila-motorbike-helmet', 0xe6c663)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateMotorbikes(parts, bikes, elapsed); } });
  updateMotorbikes(parts, bikes, 0);
  return bikes.length;
}

function buildTricycles({ animated, rng }) {
  const routes = ROAD_ROUTES.map((route) => prepareRoute(route, 8.2, true));
  const tricycles = [];
  for (let i = 0; i < TRICYCLE_COUNT; i += 1) {
    const route = routes[i % routes.length];
    tricycles.push({ route, distance: rng() * route.length, speed: 5 + rng() * 4.5, lane: (rng() - 0.5) * route.width });
  }
  const group = new THREE.Group();
  group.name = 'manila-tricycles';
  const parts = {
    bike: makeInstancedPart(tricycles.length, 'manila-tricycle-bike', 0x2e2924),
    sidecar: makeInstancedPart(tricycles.length, 'manila-tricycle-sidecar', 0xe6c663),
    canopy: makeInstancedPart(tricycles.length, 'manila-tricycle-canopy', 0x48d9ff),
    rider: makeInstancedPart(tricycles.length, 'manila-tricycle-rider', 0xb47a54)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateTricycles(parts, tricycles, elapsed); } });
  updateTricycles(parts, tricycles, 0);
  return tricycles.length;
}

function buildTaxis({ animated, rng }) {
  const routes = ROAD_ROUTES.map((route) => prepareRoute(route, 8.5, true));
  const taxis = [];
  for (let i = 0; i < TAXI_COUNT; i += 1) {
    const route = routes[i % routes.length];
    taxis.push({ route, distance: rng() * route.length, speed: 7 + rng() * 5.5, lane: (rng() - 0.5) * route.width });
  }
  const group = new THREE.Group();
  group.name = 'manila-taxis';
  const parts = {
    body: makeInstancedPart(taxis.length, 'manila-taxi-body', 0xf0dfb2),
    roof: makeInstancedPart(taxis.length, 'manila-taxi-roof', 0xd8a334),
    window: makeInstancedPart(taxis.length, 'manila-taxi-window', 0x3f91aa),
    wheels: makeInstancedPart(taxis.length, 'manila-taxi-wheels', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateTaxis(parts, taxis, elapsed); } });
  updateTaxis(parts, taxis, 0);
  return taxis.length;
}

function buildBuses({ animated, rng }) {
  const routes = ROAD_ROUTES.slice(0, 2).map((route) => prepareRoute(route, 6.5, true));
  const buses = [];
  for (let i = 0; i < BUS_COUNT; i += 1) {
    const route = routes[i % routes.length];
    buses.push({ route, distance: rng() * route.length, speed: 5.5 + rng() * 3.5, lane: (rng() - 0.5) * route.width });
  }
  const group = new THREE.Group();
  group.name = 'manila-buses';
  const parts = {
    body: makeInstancedPart(buses.length, 'manila-bus-body', 0xe8e8df),
    stripe: makeInstancedPart(buses.length, 'manila-bus-stripe', 0xd94f45),
    window: makeInstancedPart(buses.length, 'manila-bus-window', 0x3f91aa),
    wheels: makeInstancedPart(buses.length, 'manila-bus-wheels', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateBuses(parts, buses, elapsed); } });
  updateBuses(parts, buses, 0);
  return buses.length;
}

function buildTrains({ animated, rng }) {
  const routes = TRAIN_ROUTES.map((route) => prepareRoute(route, 0, false));
  const trains = [];
  for (let i = 0; i < TRAIN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    trains.push({ route, distance: rng() * route.length, speed: 12 + rng() * 7 });
  }
  const group = new THREE.Group();
  group.name = 'manila-lrt-mrt-trains';
  const parts = {
    body: makeInstancedPart(trains.length, 'manila-train-body', 0xe8e8df),
    stripe: makeInstancedPart(trains.length, 'manila-train-stripe', 0x48d9ff),
    window: makeInstancedPart(trains.length, 'manila-train-window', 0x3f91aa)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateTrains(parts, trains, elapsed); } });
  updateTrains(parts, trains, 0);
  return trains.length;
}

function buildBoats({ animated, rng }) {
  const routes = BOAT_ROUTES.map((route) => prepareRoute(route, 0, false));
  const boats = [];
  for (let i = 0; i < BOAT_COUNT; i += 1) {
    const route = routes[i % routes.length];
    boats.push({ route, distance: rng() * route.length, speed: 3 + rng() * 3, lane: (rng() - 0.5) * 4 });
  }
  const group = new THREE.Group();
  group.name = 'manila-pasig-ferries-and-bay-boats';
  const parts = {
    hull: makeInstancedPart(boats.length, 'manila-boat-hull', 0x7a4d30),
    roof: makeInstancedPart(boats.length, 'manila-boat-roof', 0xf0dfb2),
    wake: makeInstancedPart(boats.length, 'manila-boat-wake', 0x9fd4e4)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateBoats(parts, boats, elapsed); } });
  updateBoats(parts, boats, 0);
  return boats.length;
}

function prepareRoute(points, width, loop) {
  const routePoints = loop ? [...points, points[0]] : points;
  const segments = [];
  let length = 0;
  for (let i = 0; i < routePoints.length - 1; i += 1) {
    const a = routePoints[i];
    const b = routePoints[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segmentLength = Math.hypot(dx, dz);
    if (segmentLength <= 0.001) continue;
    segments.push({ a, b, dx, dz, length: segmentLength, start: length });
    length += segmentLength;
  }
  return { width, loop, points: routePoints, segments, length };
}

function sampleRoute(route, distance) {
  let d = distance;
  let direction = 1;
  if (route.loop) {
    d = ((d % route.length) + route.length) % route.length;
  } else {
    const cycle = route.length * 2;
    d = ((d % cycle) + cycle) % cycle;
    if (d > route.length) {
      d = cycle - d;
      direction = -1;
    }
  }
  const segment = route.segments.find((candidate) => d <= candidate.start + candidate.length) ?? route.segments[route.segments.length - 1];
  const t = Math.max(0, Math.min(1, (d - segment.start) / segment.length));
  const x = segment.a.x + segment.dx * t;
  const z = segment.a.z + segment.dz * t;
  const invLength = 1 / segment.length;
  return { x, z, tangentX: segment.dx * invLength * direction, tangentZ: segment.dz * invLength * direction };
}

function makeInstancedPart(count, name, color) {
  const material = new THREE.MeshBasicMaterial({ color, vertexColors: false, fog: false });
  material.name = name;
  material.toneMapped = false;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
}

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scaleVector = new THREE.Vector3();

function updatePeople(parts, people, elapsed) {
  people.forEach((person, index) => {
    const sample = sampleRoute(person.route, person.distance + elapsed * person.speed);
    const x = sample.x - sample.tangentZ * person.lane;
    const z = sample.z + sample.tangentX * person.lane;
    const y = topY(x, z) + 0.08;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const stride = Math.sin(elapsed * 7.2 + person.phase) * 0.14;
    const bob = Math.abs(Math.sin(elapsed * 5.4 + person.phase)) * 0.05;
    const scale = person.scale;
    setPart(parts.body, index, x, y + bob, z, yaw, 0, 1.08, 0, 0.58 * scale, 0.95 * scale, 0.38 * scale);
    setPart(parts.shirt, index, x, y + bob, z, yaw, 0, 1.28, -0.08, 0.62 * scale, 0.38 * scale, 0.42 * scale);
    setPart(parts.head, index, x, y + bob, z, yaw, 0, 1.78, 0, 0.4 * scale, 0.38 * scale, 0.4 * scale);
    setPart(parts.hair, index, x, y + bob, z, yaw, 0, 1.98, -0.02, 0.42 * scale, 0.14 * scale, 0.42 * scale);
    setPart(parts.leftLeg, index, x, y, z, yaw, -0.14, 0.38, stride, 0.15 * scale, 0.65 * scale, 0.15 * scale);
    setPart(parts.rightLeg, index, x, y, z, yaw, 0.14, 0.38, -stride, 0.15 * scale, 0.65 * scale, 0.15 * scale);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateJeepneys(parts, vehicles, elapsed) {
  vehicles.forEach((vehicle, index) => {
    const sample = sampleRoute(vehicle.route, vehicle.distance + elapsed * vehicle.speed);
    const x = sample.x - sample.tangentZ * vehicle.lane;
    const z = sample.z + sample.tangentX * vehicle.lane;
    const y = topY(x, z) + 0.18;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 1.0, 0, 2.3, 1.25, 4.8);
    setPart(parts.cab, index, x, y, z, yaw, 0, 1.78, -1.2, 2.1, 0.85, 1.7);
    setPart(parts.chrome, index, x, y, z, yaw, 0, 1.72, 1.35, 2.4, 0.26, 1.3);
    setPart(parts.sign, index, x, y, z, yaw, 0, 2.3, -2.2, 1.8, 0.38, 0.24);
    setPart(parts.wheels, index, x, y, z, yaw, 0, 0.38, 0, 2.55, 0.42, 4.4);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateMotorbikes(parts, bikes, elapsed) {
  bikes.forEach((bike, index) => {
    const sample = sampleRoute(bike.route, bike.distance + elapsed * bike.speed);
    const x = sample.x - sample.tangentZ * bike.lane;
    const z = sample.z + sample.tangentX * bike.lane;
    const y = topY(x, z) + 0.14;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.bike, index, x, y, z, yaw, 0, 0.45, 0, 0.62, 0.34, 1.7);
    setPart(parts.rider, index, x, y, z, yaw, 0, 1.08, -0.15, 0.44, 0.85, 0.42);
    setPart(parts.box, index, x, y, z, yaw, 0, 1.02, 0.72, 0.62, 0.56, 0.62);
    setPart(parts.helmet, index, x, y, z, yaw, 0, 1.62, -0.32, 0.38, 0.24, 0.38);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateTricycles(parts, tricycles, elapsed) {
  tricycles.forEach((tricycle, index) => {
    const sample = sampleRoute(tricycle.route, tricycle.distance + elapsed * tricycle.speed);
    const x = sample.x - sample.tangentZ * tricycle.lane;
    const z = sample.z + sample.tangentX * tricycle.lane;
    const y = topY(x, z) + 0.14;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.bike, index, x, y, z, yaw, -0.3, 0.46, 0, 0.58, 0.34, 1.65);
    setPart(parts.sidecar, index, x, y, z, yaw, 0.58, 0.58, 0.08, 0.88, 0.64, 1.22);
    setPart(parts.canopy, index, x, y, z, yaw, 0.58, 1.18, 0.08, 0.98, 0.24, 1.3);
    setPart(parts.rider, index, x, y, z, yaw, -0.3, 1.08, -0.22, 0.4, 0.8, 0.4);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateTaxis(parts, taxis, elapsed) {
  taxis.forEach((taxi, index) => {
    const sample = sampleRoute(taxi.route, taxi.distance + elapsed * taxi.speed);
    const x = sample.x - sample.tangentZ * taxi.lane;
    const z = sample.z + sample.tangentX * taxi.lane;
    const y = topY(x, z) + 0.16;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 0.72, 0, 1.65, 0.72, 3.1);
    setPart(parts.roof, index, x, y, z, yaw, 0, 1.18, -0.2, 1.35, 0.48, 1.55);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.22, -0.5, 1.72, 0.42, 1.5);
    setPart(parts.wheels, index, x, y, z, yaw, 0, 0.28, 0, 1.78, 0.32, 2.9);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateBuses(parts, buses, elapsed) {
  buses.forEach((bus, index) => {
    const sample = sampleRoute(bus.route, bus.distance + elapsed * bus.speed);
    const x = sample.x - sample.tangentZ * bus.lane;
    const z = sample.z + sample.tangentX * bus.lane;
    const y = topY(x, z) + 0.2;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 1.0, 0, 2.2, 1.3, 5.4);
    setPart(parts.stripe, index, x, y, z, yaw, 0, 1.42, -0.2, 2.3, 0.28, 5.0);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.7, -0.45, 2.35, 0.42, 3.6);
    setPart(parts.wheels, index, x, y, z, yaw, 0, 0.38, 0, 2.35, 0.38, 5.0);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateTrains(parts, trains, elapsed) {
  trains.forEach((train, index) => {
    const sample = sampleRoute(train.route, train.distance + elapsed * train.speed);
    const x = sample.x;
    const z = sample.z;
    const y = topY(x, z) + 5.4;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 1.1, 0, 2.8, 1.6, 11);
    setPart(parts.stripe, index, x, y, z, yaw, 0, 1.6, -0.1, 2.95, 0.28, 10.4);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.8, -0.5, 3.0, 0.45, 6.0);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateBoats(parts, boats, elapsed) {
  boats.forEach((boat, index) => {
    const sample = sampleRoute(boat.route, boat.distance + elapsed * boat.speed);
    const x = sample.x - sample.tangentZ * boat.lane;
    const z = sample.z + sample.tangentX * boat.lane;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.hull, index, x, 0.72, z, yaw, 0, 0.35, 0, 2.1, 0.7, 6.2);
    setPart(parts.roof, index, x, 0.72, z, yaw, 0, 1.0, -0.3, 1.8, 0.48, 3.8);
    setPart(parts.wake, index, x, 0.72, z, yaw, 0, 0.08, 3.8, 1.6, 0.08, 2.6);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function setPart(mesh, index, x, y, z, yaw, localX, localY, localZ, sx, sy, sz) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  position.set(x + localX * cos + localZ * sin, y + localY, z - localX * sin + localZ * cos);
  quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
  scaleVector.set(sx, sy, sz);
  matrix.compose(position, quaternion, scaleVector);
  mesh.setMatrixAt(index, matrix);
}
