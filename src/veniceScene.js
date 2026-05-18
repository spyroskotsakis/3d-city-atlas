import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 186;
const TERRAIN_CELL = 4;
const TILE = 3.35;
const PEDESTRIAN_COUNT = 210;
const GONDOLA_COUNT = 46;
const BOAT_COUNT = 14;
const PIGEON_COUNT = 90;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'veniceTerrain',
  'veniceGrass',
  'water',
  'cobblestone',
  'limestone',
  'marble',
  'stucco',
  'terracotta',
  'brick',
  'slate',
  'wood',
  'gold',
  'copper',
  'iron',
  'steel',
  'cloth',
  'vegetation',
  'shadow',
  'crowd',
  'skin'
];

const LANDMARKS = [
  ['Piazza San Marco', 62, 58, 72, 46],
  ["St Mark's Basilica", 72, 38, 48, 30],
  ['Campanile di San Marco', 30, 56, 18, 18],
  ["Doge's Palace", 102, 66, 48, 34],
  ['Bridge of Sighs', 126, 48, 26, 16],
  ['Rialto Bridge', -24, -18, 52, 18],
  ['Santa Maria della Salute', -52, 62, 42, 34],
  ['San Giorgio Maggiore', 112, 132, 48, 34],
  ["Ca' d'Oro", -74, -46, 34, 28],
  ['Teatro La Fenice', 0, 48, 38, 30],
  ['Accademia Bridge', -50, 28, 46, 16],
  ['Riva degli Schiavoni', 112, 94, 86, 18]
];

function createRng(seed = 0x56454e49) {
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
  tempColor.setHSL(
    hsl.h,
    Math.max(0, Math.min(1, hsl.s + amount * 0.08)),
    Math.max(0, Math.min(1, hsl.l + amount))
  );
  return tempColor.getHex();
}

function grandCanalCenterZ(x) {
  return 4 + Math.sin((x + 54) * 0.036) * 28 + Math.sin((x - 18) * 0.075) * 8;
}

function grandCanalWidthAt(x) {
  return 22 + Math.sin(x * 0.041 + 1.2) * 4;
}

const NARROW_CANALS = [
  { x: -112, z: -12, width: 7, depth: 124, yaw: -0.16 },
  { x: -82, z: 38, width: 6, depth: 116, yaw: 0.22 },
  { x: -42, z: -58, width: 6, depth: 104, yaw: -0.3 },
  { x: 8, z: -46, width: 6, depth: 102, yaw: 0.24 },
  { x: 42, z: 2, width: 6, depth: 104, yaw: -0.18 },
  { x: 92, z: 10, width: 7, depth: 120, yaw: 0.12 },
  { x: -38, z: 78, width: 118, depth: 6, yaw: 0.1 },
  { x: 72, z: 90, width: 118, depth: 7, yaw: -0.05 },
  { x: -86, z: -86, width: 102, depth: 6, yaw: -0.1 },
  { x: 10, z: -106, width: 112, depth: 6, yaw: 0.08 }
];

function rectDistance(pointX, pointZ, { x, z, width, depth, yaw }) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const dx = pointX - x;
  const dz = pointZ - z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return {
    dx: Math.abs(lx) - width / 2,
    dz: Math.abs(lz) - depth / 2
  };
}

function isInsideRotatedRect(x, z, rect, pad = 0) {
  const d = rectDistance(x, z, rect);
  return d.dx <= pad && d.dz <= pad;
}

function isGrandCanal(x, z, pad = 0) {
  return Math.abs(z - grandCanalCenterZ(x)) <= grandCanalWidthAt(x) / 2 + pad;
}

function isNarrowCanal(x, z, pad = 0) {
  return NARROW_CANALS.some((canal) => isInsideRotatedRect(x, z, canal, pad));
}

function isLandMass(x, z, pad = 0) {
  const main = ((x + 8) / (150 + pad)) ** 2 + ((z + 8) / (122 + pad)) ** 2 < 1;
  const sanMarco = x > 36 - pad && x < 138 + pad && z > 16 - pad && z < 104 + pad;
  const dorsoduro = x > -94 - pad && x < 34 + pad && z > 42 - pad && z < 112 + pad;
  const giudecca = x > -80 - pad && x < 96 + pad && z > 122 - pad && z < 152 + pad;
  const sanGiorgio = x > 82 - pad && x < 150 + pad && z > 116 - pad && z < 156 + pad;
  const outerNorth = x > -152 - pad && x < -104 + pad && z > -148 - pad && z < -104 + pad;
  const outerEast = x > 132 - pad && x < 174 + pad && z > -72 - pad && z < -28 + pad;
  return main || sanMarco || dorsoduro || giudecca || sanGiorgio || outerNorth || outerEast;
}

function isWater(x, z, pad = 0) {
  if (!isLandMass(x, z, pad)) return true;
  return isGrandCanal(x, z, pad) || isNarrowCanal(x, z, pad);
}

function terrainHeightAt(x, z) {
  const sanMarcoRise = Math.exp(-(((x - 68) / 62) ** 2 + ((z - 54) / 48) ** 2)) * 0.52;
  const rialtoRise = Math.exp(-(((x + 26) / 52) ** 2 + ((z + 18) / 38) ** 2)) * 0.34;
  const waterCut = Math.exp(-((z - grandCanalCenterZ(x)) ** 2) / 380) * 0.36;
  return Math.max(0.46, 0.9 + sanMarcoRise + rialtoRise - waterCut + Math.sin(x * 0.023 + z * 0.019) * 0.08);
}

export function veniceTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function waterY(x, z) {
  return 0.58 + Math.sin(x * 0.047 + z * 0.039) * 0.035;
}

export function createVeniceScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Venice voxel material: ${key}`);
  }

  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 6, isRiver: isWater });
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
    const sy = options.height ?? 0.13;
    const baseOffset = options.baseOffset ?? 0.03;
    const yaw = options.yaw ?? 0;
    const skipWater = options.skipWater ?? true;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    for (let lx = -width / 2 + tile / 2; lx <= width / 2 - tile / 2; lx += tile) {
      for (let lz = -depth / 2 + tile / 2; lz <= depth / 2 - tile / 2; lz += tile) {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        if (skipWater && isWater(wx, wz, -0.8)) continue;
        const base = skipWater ? topY(wx, wz) + baseOffset : waterY(wx, wz) + baseOffset;
        const shade = Math.sin(wx * 0.13 + wz * 0.17) * 0.022 + Math.cos(lz * 0.31) * 0.012;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, base);
      }
    }
  };

  reserveLandmarks(planner);
  buildLagoonTerrain(batch);
  buildCanalEdges({ batch, addTop, addTiledRect, addLabel });
  buildPedestrianRoutes({ planner, addTiledRect, addTop });
  buildSanMarco({ addTop, addTiledRect, addLabel, rng });
  buildDogeAndRiva({ addTop, addTiledRect, addLabel, rng });
  buildGrandCanalLandmarks({ addTop, addTiledRect, addLabel, rng });
  buildOuterIslands({ addTop, addTiledRect, addLabel, rng });
  const blocks = buildPalazzoBlocks({ planner, batch, addTop, rng });
  buildStreetDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const gondolas = buildGondolas({ animated, rng });
  const boats = buildBoats({ animated, rng });
  const pigeons = buildPigeons({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-venice-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      sanMarco: new THREE.Vector3(70, 22, 54),
      grandCanal: new THREE.Vector3(-16, 7, grandCanalCenterZ(-16)),
      rialto: new THREE.Vector3(-24, 14, -18),
      lagoon: new THREE.Vector3(108, 8, 126),
      aerial: new THREE.Vector3(24, 8, 12)
    },
    metrics: {
      instances: total,
      pedestrians,
      gondolas,
      boats,
      pigeons,
      reservations: planner.reservations.length,
      monuments: LANDMARKS.length,
      blocks
    },
    update(elapsed) {
      for (const item of animated) item.update(elapsed);
    }
  };
}

function reserveLandmarks(planner) {
  LANDMARKS.forEach(([tag, x, z, width, depth]) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'landmark' });
  });
  [
    ['Rialto Span', -24, -18, 56, 18],
    ['Accademia Span', -50, 28, 52, 16],
    ['Bridge of Sighs Span', 126, 48, 30, 14],
    ['San Marco Footbridge', 92, 92, 34, 12],
    ['Fenice Footbridge', 10, 28, 32, 12],
    ['Ca d Oro Footbridge', -74, -20, 32, 12]
  ].forEach(([tag, x, z, width, depth]) => planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'bridge' }));
}

function buildLagoonTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isWater(x, z, 0.4)) {
        const color = vary('#3f91aa', Math.sin(x * 0.08 + z * 0.06) * 0.035);
        batch.add('water', x, 0.27, z, TERRAIN_CELL * 1.08, 0.24, TERRAIN_CELL * 1.08, color);
        continue;
      }
      const h = terrainHeightAt(x, z);
      const garden =
        (x > -70 && x < -22 && z > 74 && z < 104) ||
        (x > 96 && x < 148 && z > 128 && z < 156) ||
        (x > -148 && x < -112 && z > -146 && z < -112);
      batch.add(garden ? 'veniceGrass' : 'veniceTerrain', x, h / 2 - 0.04, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04);
    }
  }
}

function buildCanalEdges({ batch, addTop, addTiledRect, addLabel }) {
  for (let x = -150; x <= 144; x += 8) {
    const z = grandCanalCenterZ(x);
    const half = grandCanalWidthAt(x) / 2;
    addTop('cobblestone', x, z - half - 3.8, 7.8, 0.14, 2.8, 0x766f64);
    addTop('cobblestone', x, z + half + 3.8, 7.8, 0.14, 2.8, 0x766f64);
    if (x % 24 === 0) {
      addTop('wood', x - 2, z - half - 6.6, 0.8, 4.1, 0.8);
      addTop('wood', x + 2, z + half + 6.6, 0.8, 4.1, 0.8);
    }
  }

  for (const canal of NARROW_CANALS) {
    const cos = Math.cos(canal.yaw);
    const sin = Math.sin(canal.yaw);
    const long = canal.depth > canal.width ? canal.depth : canal.width;
    const step = 10;
    for (let offset = -long / 2; offset <= long / 2; offset += step) {
      const alongX = canal.depth > canal.width ? Math.sin(canal.yaw) * offset : Math.cos(canal.yaw) * offset;
      const alongZ = canal.depth > canal.width ? Math.cos(canal.yaw) * offset : -Math.sin(canal.yaw) * offset;
      const edgeA = {
        x: canal.x + alongX + cos * (canal.width / 2 + 2.2),
        z: canal.z + alongZ - sin * (canal.width / 2 + 2.2)
      };
      const edgeB = {
        x: canal.x + alongX - cos * (canal.width / 2 + 2.2),
        z: canal.z + alongZ + sin * (canal.width / 2 + 2.2)
      };
      if (!isWater(edgeA.x, edgeA.z, -1)) addTop('cobblestone', edgeA.x, edgeA.z, 2.5, 0.12, 6.8, 0x766f64, canal.yaw);
      if (!isWater(edgeB.x, edgeB.z, -1)) addTop('cobblestone', edgeB.x, edgeB.z, 2.5, 0.12, 6.8, 0x766f64, canal.yaw);
    }
  }

  buildBridge(batch, -24, -18, 54, 13, 0, 'Rialto Bridge', addLabel);
  buildBridge(batch, -50, 28, 50, 11, 0.06, 'Accademia Bridge', addLabel);
  buildBridge(batch, 126, 48, 28, 8, 0, 'Bridge of Sighs', addLabel, 4.8);
  buildBridge(batch, 92, 92, 34, 8, -0.05, 'San Marco Footbridge', addLabel);
  buildBridge(batch, 10, 28, 32, 8, 0.18, 'Fenice Footbridge', addLabel);
  buildBridge(batch, -74, -20, 32, 8, -0.08, "Ca' d'Oro Footbridge", addLabel);
  addLabel('Grand Canal', -4, 5, grandCanalCenterZ(-4));
}

function buildBridge(batch, x, z, width, depth, yaw, label, addLabel, lift = 2.2) {
  const base = waterY(x, z) + lift;
  batch.addTop('limestone', x, base, z, width, 0.9, depth, 0xd8cfb7, yaw);
  batch.addTop('marble', x, base + 0.72, z, width * 0.58, 0.8, depth * 0.72, 0xefe3c8, yaw);
  batch.addTop('limestone', x, base + 1.18, z - depth / 2 - 0.5, width, 0.72, 0.6, 0xd8cfb7, yaw);
  batch.addTop('limestone', x, base + 1.18, z + depth / 2 + 0.5, width, 0.72, 0.6, 0xd8cfb7, yaw);
  addLabel(label, x, base + 5, z);
}

function buildPedestrianRoutes({ planner, addTiledRect, addTop }) {
  [
    ['Riva degli Schiavoni', 104, 94, 94, 9, 0],
    ['Mercerie to Rialto', 20, 22, 88, 8, -0.24],
    ['San Marco alleys', 44, 48, 70, 8, 0.15],
    ['Accademia Walk', -34, 44, 82, 8, 0.05],
    ['Dorsoduro quay', -62, 90, 74, 8, -0.12],
    ['Cannaregio walk', -96, -78, 82, 8, 0.12],
    ['Fondamenta north', -12, -122, 104, 8, 0]
  ].forEach(([tag, x, z, width, depth, yaw]) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
    addTiledRect('cobblestone', x, z, width, depth, { color: '#766f64', height: 0.13, tile: 3.3, yaw });
  });

  for (const x of [-120, -90, -60, -30, 0, 30, 60, 90]) {
    addTop('wood', x, grandCanalCenterZ(x) - grandCanalWidthAt(x) / 2 - 8, 0.75, 4.2, 0.75, 0x7a4d30);
    addTop('wood', x + 2.4, grandCanalCenterZ(x) - grandCanalWidthAt(x) / 2 - 8, 0.75, 4.2, 0.75, 0x7a4d30);
  }
}

function buildSanMarco({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', 62, 58, 78, 52, { color: '#81796e', height: 0.14, tile: 3.2 });
  addLabel('Piazza San Marco', 62, topY(62, 58) + 5.2, 58);
  buildBasilica({ addTop, addLabel });
  buildCampanile({ addTop, addLabel });

  for (const side of [-1, 1]) {
    for (let i = -4; i <= 4; i += 1) {
      const x = 62 + i * 7.2;
      const z = 58 + side * 25;
      addTop('limestone', x, z, 5.2, 7.2, 4.8, null);
      addTop('shadow', x, z - side * 2.5, 3.6, 3.4, 0.36, 0x2e2924, 0, topY(x, z) + 1.2);
      addTop('terracotta', x, z, 5.8, 1.5, 5.4, 0xb96038, 0, topY(x, z) + 7.2);
    }
  }

  for (let i = 0; i < 20; i += 1) {
    const x = 22 + (i % 5) * 9;
    const z = 70 + Math.floor(i / 5) * 4.5;
    addTop('wood', x, z, 3.2, 0.8, 2.1);
    addTop('cloth', x, z, 4.0, 0.42, 2.8, 0xf0dfb2, 0, topY(x, z) + 0.85);
  }

  for (let i = 0; i < 54; i += 1) {
    addStaticPerson(addTop, 34 + rng() * 70, 40 + rng() * 42, i % 7 === 0 ? 'shadow' : 'crowd');
  }
}

function buildBasilica({ addTop, addLabel }) {
  const x = 72;
  const z = 38;
  const base = topY(x, z);
  addTop('marble', x, z, 42, 11, 18, 0xefe3c8, 0, base);
  addTop('limestone', x, z + 9.6, 46, 8, 4.2, 0xd8cfb7, 0, base + 2);
  for (let i = -2; i <= 2; i += 1) {
    const dx = x + i * 9;
    addTop('shadow', dx, z + 12, 4.2, 5.5, 0.4, 0x2e2924, 0, base + 3);
    addTop('gold', dx, z + 12.35, 3.8, 2.3, 0.36, 0xd8a334, 0, base + 8.5);
    addTop('limestone', dx, z + 13, 0.6, 9, 0.6, 0xd8cfb7, 0, base + 1.2);
  }
  for (const [dx, dz, size] of [[0, 0, 14], [-15, 0, 10], [15, 0, 10], [-8, -9, 9], [8, -9, 9]]) {
    addDome(addTop, x + dx, z + dz, base + 11, size);
  }
  for (const dx of [-22, 22]) {
    addTop('gold', x + dx, z + 2, 1.0, 9, 1.0, 0xd8a334, 0, base + 11);
  }
  addLabel("St Mark's Basilica", x, base + 28, z);
}

function addDome(addTop, x, z, base, size) {
  addTop('copper', x, z, size, 3.0, size, 0x75a26a, 0, base);
  addTop('copper', x, z, size * 0.72, 3.0, size * 0.72, 0x7eaa75, 0, base + 3);
  addTop('gold', x, z, size * 0.2, 4.2, size * 0.2, 0xd8a334, 0, base + 6);
}

function buildCampanile({ addTop, addLabel }) {
  const x = 30;
  const z = 56;
  const base = topY(x, z);
  addTop('brick', x, z, 9, 52, 9, 0x9f583d, 0, base);
  addTop('limestone', x, z, 10, 6, 10, 0xd8cfb7, 0, base + 52);
  addTop('terracotta', x, z, 11.5, 5.5, 11.5, 0xb96038, 0, base + 58);
  addTop('gold', x, z, 0.9, 6, 0.9, 0xd8a334, 0, base + 64);
  addLabel('Campanile di San Marco', x, base + 72, z);
}

function buildDogeAndRiva({ addTop, addTiledRect, addLabel, rng }) {
  const x = 102;
  const z = 66;
  const base = topY(x, z);
  addTop('limestone', x, z, 42, 10, 22, 0xd8cfb7, 0, base);
  addTop('marble', x, z + 11.3, 44, 7, 4.2, 0xefe3c8, 0, base + 6);
  addTop('terracotta', x, z, 45, 2.6, 24, 0xb96038, 0, base + 10);
  for (let i = -4; i <= 4; i += 1) {
    const wx = x + i * 5;
    addTop('shadow', wx, z + 11.8, 2.2, 3.8, 0.35, 0x2e2924, 0, base + 2);
    addTop('gold', wx, z + 12.1, 1.3, 1.2, 0.35, 0xd8a334, 0, base + 7.3);
  }
  addLabel("Doge's Palace", x, base + 17, z);

  addTiledRect('cobblestone', 112, 94, 96, 18, { color: '#81796e', height: 0.13, tile: 3.3 });
  for (let i = 0; i < 22; i += 1) {
    const px = 70 + i * 4;
    addTop('wood', px, 104, 0.72, 3.8, 0.72);
    if (i % 2 === 0) addStaticPerson(addTop, px + (rng() - 0.5) * 3, 94 + rng() * 6);
  }
  addLabel('Riva degli Schiavoni', 112, topY(112, 94) + 5, 94);
}

function buildGrandCanalLandmarks({ addTop, addTiledRect, addLabel, rng }) {
  buildPalazzo(addTop, -74, -46, 30, 18, 4, 0xd6b890, "Ca' d'Oro", addLabel, true);
  buildSalute({ addTop, addTiledRect, addLabel });
  buildFenice({ addTop, addTiledRect, addLabel, rng });

  for (const [x, z, label] of [
    [-118, -72, 'Cannaregio Market'],
    [-24, -58, 'Grand Canal Palazzos'],
    [24, -72, 'Mercerie alleys'],
    [-68, 86, 'Dorsoduro Quay']
  ]) {
    addTiledRect('cobblestone', x, z, 38, 24, { color: '#766f64', height: 0.13, tile: 3.3 });
    addLabel(label, x, topY(x, z) + 5, z);
  }
}

function buildPalazzo(addTop, x, z, width, depth, floors, color, label, addLabel, ornate = false) {
  const base = topY(x, z);
  const height = floors * 3.2 + 2.4;
  addTop('stucco', x, z, width, height, depth, color, 0, base);
  addTop('terracotta', x, z, width + 1.4, 2.4, depth + 1.4, 0xb96038, 0, base + height);
  for (let i = -Math.floor(width / 5); i <= Math.floor(width / 5); i += 1) {
    const wx = x + i * 4.2;
    addTop('shadow', wx, z + depth / 2 + 0.15, 1.3, 1.8, 0.28, 0x2e2924, 0, base + 3.2);
    addTop('shadow', wx, z + depth / 2 + 0.15, 1.3, 1.8, 0.28, 0x2e2924, 0, base + 6.8);
    if (ornate) addTop('gold', wx, z + depth / 2 + 0.42, 1.1, 0.48, 0.24, 0xd8a334, 0, base + 8.9);
  }
  addTop('iron', x, z + depth / 2 + 0.7, width * 0.62, 0.5, 0.24, 0x4f4a42, 0, base + 4.2);
  if (label) addLabel(label, x, base + height + 5, z);
}

function buildSalute({ addTop, addTiledRect, addLabel }) {
  const x = -52;
  const z = 62;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 46, 36, { color: '#81796e', height: 0.13, tile: 3.3 });
  addTop('marble', x, z, 28, 13, 20, 0xefe3c8, 0, base);
  addDome(addTop, x, z, base + 13, 18);
  for (const sx of [-1, 1]) {
    addTop('limestone', x + sx * 18, z + 5, 5.8, 18, 5.8, 0xd8cfb7, 0, base);
    addTop('copper', x + sx * 18, z + 5, 6.8, 4.8, 6.8, 0x75a26a, 0, base + 18);
  }
  addLabel('Santa Maria della Salute', x, base + 31, z);
}

function buildFenice({ addTop, addTiledRect, addLabel, rng }) {
  const x = 0;
  const z = 48;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 42, 32, { color: '#766f64', height: 0.13, tile: 3.3 });
  addTop('stucco', x, z, 32, 10, 18, 0xd6b890, 0, base);
  addTop('terracotta', x, z, 34, 2.3, 20, 0xb96038, 0, base + 10);
  for (let i = -2; i <= 2; i += 1) {
    addTop('limestone', x + i * 5.4, z + 9.2, 0.65, 9.2, 0.65, 0xd8cfb7, 0, base + 0.8);
  }
  for (let i = 0; i < 16; i += 1) addStaticPerson(addTop, x - 16 + rng() * 32, z + 12 + rng() * 8);
  addLabel('Teatro La Fenice', x, base + 16, z);
}

function buildOuterIslands({ addTop, addTiledRect, addLabel, rng }) {
  const x = 112;
  const z = 132;
  const base = topY(x, z);
  addTiledRect('veniceGrass', x, z, 58, 40, { color: '#6f8f66', height: 0.13, tile: 3.5 });
  addTop('limestone', x, z, 34, 12, 18, 0xd8cfb7, 0, base);
  addTop('terracotta', x, z, 36, 2.5, 20, 0xb96038, 0, base + 12);
  addTop('brick', x + 23, z - 2, 7, 32, 7, 0x9f583d, 0, base);
  addTop('gold', x + 23, z - 2, 0.7, 5, 0.7, 0xd8a334, 0, base + 36);
  addLabel('San Giorgio Maggiore', x, base + 42, z);

  for (const [ix, iz, name] of [[-128, -126, 'Lagoon Island'], [154, -52, 'Outer Lagoon'], [-142, 136, 'Distant Moorings']]) {
    addTiledRect('veniceGrass', ix, iz, 40, 28, { color: '#6f8f66', height: 0.12, tile: 3.6 });
    for (let i = 0; i < 12; i += 1) {
      addTop('stucco', ix - 14 + (i % 4) * 9, iz - 8 + Math.floor(i / 4) * 8, 6, 5 + rng() * 4, 5, 0xd6b890);
      addTop('terracotta', ix - 14 + (i % 4) * 9, iz - 8 + Math.floor(i / 4) * 8, 6.8, 1.5, 5.8, 0xb96038, 0, topY(ix, iz) + 5);
    }
    addLabel(name, ix, topY(ix, iz) + 10, iz);
  }
}

function buildPalazzoBlocks({ planner, batch, addTop, rng }) {
  let placed = 0;
  const xs = [-132, -108, -84, -60, -36, -12, 12, 36, 60, 84, 108, 132];
  const zs = [-132, -108, -84, -60, -36, -12, 12, 36, 64, 90, 116];
  for (const x of xs) {
    for (const z of zs) {
      const width = 11 + Math.floor(rng() * 5) * 2;
      const depth = 9 + Math.floor(rng() * 4) * 2;
      if (!planner.reserveRect(`venice-palazzo-${placed}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
      buildGeneratedPalazzo(batch, addTop, x, z, width, depth, 2 + Math.floor(rng() * 4), rng);
      placed += 1;
    }
  }
  return placed;
}

function buildGeneratedPalazzo(batch, addTop, x, z, width, depth, floors, rng) {
  const color = rng() > 0.62 ? 0xd6b890 : rng() > 0.5 ? 0xc9a67f : 0xe2c9a3;
  buildPalazzo(addTop, x, z, width, depth, floors, color, null, null, rng() > 0.75);
  const base = topY(x, z);
  if (rng() > 0.65) {
    addTop('cloth', x, z + depth / 2 + 1.4, width * 0.5, 0.24, 0.28, rng() > 0.5 ? 0xf0dfb2 : 0xb96038, 0, base + 5.8);
    addTop('iron', x, z + depth / 2 + 1.3, width * 0.68, 0.22, 0.22, 0x4f4a42, 0, base + 5.6);
  }
  if (rng() > 0.78) {
    batch.addTop('vegetation', x + width / 2 - 2, base + 0.3, z + depth / 2 + 1, 1.4, 2.3, 1.4);
  }
}

function buildStreetDetails({ planner, addTop, rng }) {
  const roads = planner.reservations.filter((item) => item.type === 'road');
  for (let i = 0; i < 108; i += 1) {
    const road = roads[i % roads.length];
    const x = road.x1 + rng() * (road.x2 - road.x1);
    const z = road.z1 + rng() * (road.z2 - road.z1);
    if (isWater(x, z, 1.5)) continue;
    if (i % 5 === 0) {
      addTop('gold', x, z, 0.34, 3.2, 0.34);
      addTop('gold', x + 0.45, z, 0.86, 0.38, 0.38, null, 0, topY(x, z) + 3.2);
    } else if (i % 7 === 0) {
      addTop('wood', x, z, 3.2, 0.9, 2.2);
      addTop('cloth', x, z, 3.9, 0.42, 2.8, 0xf0dfb2, 0, topY(x, z) + 0.9);
    } else {
      addTop('vegetation', x, z, 1.2, 2.6, 1.2);
    }
  }
}

function addStaticPerson(addTop, x, z, body = 'crowd', scale = 1) {
  const base = topY(x, z);
  addTop(body, x, z, 0.52 * scale, 1.0 * scale, 0.42 * scale, null, 0, base + 0.02);
  addTop('skin', x, z, 0.36 * scale, 0.36 * scale, 0.36 * scale, null, 0, base + 1.0 * scale);
  addTop('shadow', x, z - 0.04, 0.34 * scale, 0.12 * scale, 0.34 * scale, null, 0, base + 1.32 * scale);
}

function buildPedestrians({ animated, rng }) {
  const routes = createPedestrianRoutes();
  const pedestrians = [];
  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    pedestrians.push({
      route,
      distance: rng() * route.length,
      speed: 2.2 + rng() * 3.2,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 1 + rng() * 0.22
    });
  }
  const group = new THREE.Group();
  group.name = 'venice-street-crowds';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'venice-pedestrian-body', 0x6a5a4c),
    head: makeInstancedPart(pedestrians.length, 'venice-pedestrian-head', 0xd09a6d),
    hair: makeInstancedPart(pedestrians.length, 'venice-pedestrian-hair', 0x4b3428),
    leftLeg: makeInstancedPart(pedestrians.length, 'venice-pedestrian-left-leg', 0x353941),
    rightLeg: makeInstancedPart(pedestrians.length, 'venice-pedestrian-right-leg', 0x353941),
    leftArm: makeInstancedPart(pedestrians.length, 'venice-pedestrian-left-arm', 0xd09a6d),
    rightArm: makeInstancedPart(pedestrians.length, 'venice-pedestrian-right-arm', 0xd09a6d)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updatePedestrians(parts, pedestrians, elapsed) });
  updatePedestrians(parts, pedestrians, 0);
  return pedestrians.length;
}

function buildGondolas({ animated, rng }) {
  const routes = createGondolaRoutes();
  const gondolas = [];
  for (let i = 0; i < GONDOLA_COUNT; i += 1) {
    const route = routes[i % routes.length];
    gondolas.push({
      route,
      distance: rng() * route.length,
      speed: 4.4 + rng() * 2.6,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2
    });
  }
  const group = new THREE.Group();
  group.name = 'venice-gondola-traffic';
  const parts = {
    hull: makeInstancedPart(gondolas.length, 'venice-gondola-hull', 0x111315),
    cabin: makeInstancedPart(gondolas.length, 'venice-gondola-upholstery', 0x7d3041),
    prow: makeInstancedPart(gondolas.length, 'venice-gondola-ferro', 0xd8a334),
    trim: makeInstancedPart(gondolas.length, 'venice-gondola-trim', 0xd8a334),
    gondolier: makeInstancedPart(gondolas.length, 'venice-gondolier-shirt', 0xf0dfb2),
    stripe: makeInstancedPart(gondolas.length, 'venice-gondolier-stripe', 0x2f5f8a),
    head: makeInstancedPart(gondolas.length, 'venice-gondolier-head', 0xd09a6d),
    oar: makeInstancedPart(gondolas.length, 'venice-gondolier-oar', 0x7a4d30)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateGondolas(parts, gondolas, elapsed) });
  updateGondolas(parts, gondolas, 0);
  return gondolas.length;
}

function buildBoats({ animated, rng }) {
  const routes = createBoatRoutes();
  const boats = [];
  for (let i = 0; i < BOAT_COUNT; i += 1) {
    const route = routes[i % routes.length];
    boats.push({ route, distance: rng() * route.length, speed: 6 + rng() * 3, lane: (rng() - 0.5) * route.width });
  }
  const group = new THREE.Group();
  group.name = 'venice-vaporetti-and-boats';
  const parts = {
    body: makeInstancedPart(boats.length, 'venice-boat-body', 0xe8dfc4),
    roof: makeInstancedPart(boats.length, 'venice-boat-roof', 0x5c6268),
    window: makeInstancedPart(boats.length, 'venice-boat-windows', 0x4f91a4),
    wake: makeInstancedPart(boats.length, 'venice-boat-wake', 0xbbe3e5)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateBoats(parts, boats, elapsed) });
  updateBoats(parts, boats, 0);
  return boats.length;
}

function buildPigeons({ animated, rng }) {
  const birds = [];
  for (let i = 0; i < PIGEON_COUNT; i += 1) {
    birds.push({
      x: 30 + rng() * 72,
      z: 38 + rng() * 44,
      radius: 1.5 + rng() * 9,
      height: rng() > 0.7 ? 4 + rng() * 9 : 0.18,
      speed: 0.6 + rng() * 1.4,
      phase: rng() * Math.PI * 2
    });
  }
  const group = new THREE.Group();
  group.name = 'venice-piazza-pigeons';
  const parts = {
    body: makeInstancedPart(birds.length, 'venice-pigeon-body', 0x767b7c),
    wingA: makeInstancedPart(birds.length, 'venice-pigeon-wing-a', 0x5d6365),
    wingB: makeInstancedPart(birds.length, 'venice-pigeon-wing-b', 0x5d6365)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updatePigeons(parts, birds, elapsed) });
  updatePigeons(parts, birds, 0);
  return birds.length;
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

function createPedestrianRoutes() {
  return [
    { width: 5.2, loop: true, points: [[22, 36], [68, 36], [104, 60], [112, 92], [62, 92], [22, 76]] },
    { width: 4.8, loop: false, points: [[-92, -76], [-70, -46], [-24, -18], [12, 16], [62, 58], [110, 94]] },
    { width: 4.8, loop: false, points: [[-62, 90], [-50, 28], [-12, 34], [0, 48], [62, 58]] },
    { width: 4.4, loop: true, points: [[-126, -122], [-88, -84], [-40, -74], [2, -106], [-48, -128]] },
    { width: 4.8, loop: true, points: [[-74, -46], [-34, -36], [-24, -18], [-52, 28], [-74, 0]] },
    { width: 4.8, loop: true, points: [[86, 116], [132, 116], [148, 144], [98, 152]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createGondolaRoutes() {
  const grand = [];
  for (let x = -146; x <= 138; x += 18) grand.push({ x, z: grandCanalCenterZ(x) });
  return [
    { width: 12, loop: true, points: grand },
    { width: 7, loop: true, points: [[-112, -72], [-112, -12], [-102, 44], [-82, 92], [-52, 108]] },
    { width: 6, loop: true, points: [[-42, -100], [-42, -58], [-26, -12], [-10, 32], [0, 72]] },
    { width: 6, loop: true, points: [[42, -50], [42, 2], [54, 42], [72, 90], [100, 96]] },
    { width: 7, loop: true, points: [[92, -46], [92, 10], [100, 54], [92, 90], [126, 104]] },
    { width: 8, loop: true, points: [[-74, 78], [-38, 78], [12, 84], [72, 90], [126, 88]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points }));
}

function createBoatRoutes() {
  const grand = [];
  for (let x = -150; x <= 146; x += 24) grand.push({ x, z: grandCanalCenterZ(x) });
  return [
    { width: 8, loop: true, points: grand },
    { width: 10, loop: true, points: [[-150, 136], [-80, 138], [0, 132], [78, 126], [148, 126], [146, 158], [40, 164], [-90, 158]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points }));
}

function prepareRoute(route) {
  const points = route.loop ? [...route.points, route.points[0]] : route.points;
  const segments = [];
  let length = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segmentLength = Math.hypot(dx, dz);
    if (segmentLength <= 0.001) continue;
    segments.push({ a, b, dx, dz, length: segmentLength, start: length });
    length += segmentLength;
  }
  return { width: route.width, loop: route.loop, points, segments, length };
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
  const invLength = 1 / segment.length;
  return {
    x: segment.a.x + segment.dx * t,
    z: segment.a.z + segment.dz * t,
    tangentX: segment.dx * invLength * direction,
    tangentZ: segment.dz * invLength * direction
  };
}

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scaleVector = new THREE.Vector3();

function updatePedestrians(parts, pedestrians, elapsed) {
  pedestrians.forEach((person, index) => {
    const sample = sampleRoute(person.route, person.distance + elapsed * person.speed);
    const x = sample.x - sample.tangentZ * person.lane;
    const z = sample.z + sample.tangentX * person.lane;
    const y = topY(x, z) + 0.08;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const stride = Math.sin(elapsed * 8 + person.phase) * 0.16;
    const bob = Math.abs(Math.sin(elapsed * 8 + person.phase)) * 0.05;
    const scale = person.scale;
    setPart(parts.body, index, x, y + bob, z, yaw, 0, 1.13, 0, 0.62 * scale, 1.02 * scale, 0.44 * scale);
    setPart(parts.head, index, x, y + bob, z, yaw, 0, 1.88, 0, 0.46 * scale, 0.46 * scale, 0.46 * scale);
    setPart(parts.hair, index, x, y + bob, z, yaw, 0, 2.12, -0.03, 0.44 * scale, 0.13 * scale, 0.44 * scale);
    setPart(parts.leftLeg, index, x, y, z, yaw, -0.15, 0.38, stride, 0.16 * scale, 0.68 * scale, 0.16 * scale);
    setPart(parts.rightLeg, index, x, y, z, yaw, 0.15, 0.38, -stride, 0.16 * scale, 0.68 * scale, 0.16 * scale);
    setPart(parts.leftArm, index, x, y + bob, z, yaw, -0.43, 1.05, -stride * 0.65, 0.14 * scale, 0.64 * scale, 0.14 * scale);
    setPart(parts.rightArm, index, x, y + bob, z, yaw, 0.43, 1.05, stride * 0.65, 0.14 * scale, 0.64 * scale, 0.14 * scale);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateGondolas(parts, gondolas, elapsed) {
  gondolas.forEach((gondola, index) => {
    const sample = sampleRoute(gondola.route, gondola.distance + elapsed * gondola.speed);
    const x = sample.x - sample.tangentZ * gondola.lane;
    const z = sample.z + sample.tangentX * gondola.lane;
    const y = waterY(x, z) + 0.08 + Math.sin(elapsed * 1.4 + gondola.phase) * 0.04;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const row = Math.sin(elapsed * 3.4 + gondola.phase) * 0.5;
    setPart(parts.hull, index, x, y, z, yaw, 0, 0.24, 0, 1.25, 0.38, 6.4);
    setPart(parts.cabin, index, x, y, z, yaw, 0, 0.62, -0.6, 0.92, 0.38, 1.6);
    setPart(parts.prow, index, x, y, z, yaw, 0, 0.76, 3.5, 0.34, 1.5, 0.34);
    setPart(parts.trim, index, x, y, z, yaw, 0, 0.58, 0, 1.34, 0.12, 6.8);
    setPart(parts.gondolier, index, x, y, z, yaw, -0.28, 1.38, -2.6, 0.42, 0.82, 0.34);
    setPart(parts.stripe, index, x, y, z, yaw, -0.28, 1.44, -2.42, 0.46, 0.12, 0.38);
    setPart(parts.head, index, x, y, z, yaw, -0.28, 2.0, -2.58, 0.32, 0.32, 0.32);
    setPart(parts.oar, index, x, y, z, yaw, -1.35, 1.1, -2.0 + row, 0.14, 0.14, 4.6);
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
    const y = waterY(x, z) + 0.08;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 0.42, 0, 2.0, 0.7, 5.2);
    setPart(parts.roof, index, x, y, z, yaw, 0, 1.12, -0.2, 1.8, 0.5, 3.2);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.16, 0.18, 1.86, 0.32, 2.3);
    setPart(parts.wake, index, x, y, z, yaw, 0, 0.05, -3.6, 2.8, 0.05, 2.4);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updatePigeons(parts, birds, elapsed) {
  birds.forEach((bird, index) => {
    const a = elapsed * bird.speed + bird.phase;
    const flying = bird.height > 1;
    const x = bird.x + Math.cos(a) * bird.radius * (flying ? 1 : 0.12);
    const z = bird.z + Math.sin(a * 0.8) * bird.radius * (flying ? 0.8 : 0.1);
    const y = topY(bird.x, bird.z) + bird.height + (flying ? Math.sin(a * 2.2) * 0.6 : 0);
    const yaw = a + Math.PI * 0.5;
    const flap = Math.sin(elapsed * 10 + bird.phase) * (flying ? 0.16 : 0.04);
    setPart(parts.body, index, x, y, z, yaw, 0, 0, 0, 0.36, 0.22, 0.48);
    setPart(parts.wingA, index, x, y, z, yaw, -0.28, flap, 0, 0.36, 0.08, 0.24);
    setPart(parts.wingB, index, x, y, z, yaw, 0.28, -flap, 0, 0.36, 0.08, 0.24);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function setPart(mesh, index, x, y, z, yaw, localX, localY, localZ, sx, sy, sz) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  position.set(
    x + localX * cos + localZ * sin,
    y + localY,
    z - localX * sin + localZ * cos
  );
  quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
  scaleVector.set(sx, sy, sz);
  matrix.compose(position, quaternion, scaleVector);
  mesh.setMatrixAt(index, matrix);
}
