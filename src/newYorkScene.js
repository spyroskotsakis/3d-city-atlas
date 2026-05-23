import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher, yawForVector } from './voxelBatcher.js';

const WORLD_BOUNDS = 392;
const TERRAIN_CELL = 6;
const TILE = 3.4;
const PEDESTRIAN_COUNT = 560;
const TAXI_COUNT = 78;
const TRAIN_COUNT = 20;
const FERRY_COUNT = 12;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'nyTerrain',
  'asphalt',
  'concrete',
  'steel',
  'neon',
  'water',
  'glass',
  'brick',
  'limestone',
  'slate',
  'gold',
  'copper',
  'vegetation',
  'wood',
  'shadow',
  'crowd',
  'skin'
];

const LANDMARKS = [
  ['Empire State Building', 0, 0, 40, 34],
  ['Times Square', -34, -48, 48, 34],
  ['Chrysler Building', 46, -18, 30, 30],
  ['Grand Central Terminal', 42, -4, 42, 28],
  ['Rockefeller Center', -12, -76, 44, 34],
  ['One Vanderbilt', 54, -10, 30, 28],
  ['Flatiron Building', -34, 64, 34, 30],
  ['Bryant Park', 18, -34, 44, 28],
  ['Central Park South', 4, -142, 104, 40],
  ['Madison Square Garden', -54, 24, 42, 34],
  ['New York Public Library', 18, -24, 42, 28],
  ['One World Trade Center', -18, 170, 42, 36],
  ['Brooklyn Bridge', 74, 142, 46, 28],
  ['Metropolitan Museum of Art', 56, -214, 48, 28],
  ['Lincoln Center', -60, -214, 46, 30],
  ['Hudson Yards', -70, -82, 54, 42],
  ['High Line', -78, 36, 34, 116],
  ['Washington Square Park', -28, 108, 44, 34],
  ['Chinatown', 32, 136, 48, 34],
  ['Wall Street', -10, 198, 44, 30],
  ['Battery Park', -6, 232, 54, 32],
  ['Statue of Liberty', -122, 304, 38, 38],
  ['Brooklyn Heights', 142, 156, 62, 46],
  ['Williamsburg', 156, 40, 68, 50],
  ['Bushwick Warehouse District', 246, 58, 76, 52],
  ['Prospect Park', 222, 220, 86, 54],
  ['Coney Island', 240, 332, 88, 38],
  ['Long Island City', 142, -104, 60, 46],
  ['Flushing Meadows', 298, -154, 72, 48],
  ['Yankee Stadium', 84, -318, 58, 48],
  ['Bronx Zoo', 160, -302, 76, 48],
  ['Staten Island Ferry', -52, 238, 42, 28],
  ['Jersey City Waterfront', -228, 92, 84, 54]
];

function createRng(seed = 0x4e59434d) {
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

function islandHalfWidth(z) {
  const taperNorth = z < -168 ? (-168 - z) * 0.11 : 0;
  const taperSouth = z > 178 ? (z - 178) * 0.12 : 0;
  return Math.max(42, 78 - taperNorth - taperSouth + Math.sin(z * 0.033) * 2.8);
}

function westEdge(z) {
  return -islandHalfWidth(z) - 7 + Math.sin(z * 0.047 + 1.1) * 2.3;
}

function eastEdge(z) {
  return islandHalfWidth(z) + 7 + Math.sin(z * 0.041 - 0.7) * 2.2;
}

function isEllipseLand(x, z, cx, cz, rx, rz, pad = 0) {
  return ((x - cx) / (rx + pad)) ** 2 + ((z - cz) / (rz + pad)) ** 2 <= 1;
}

function isManhattan(x, z, pad = 0) {
  return z > -270 - pad && z < 246 + pad && x > westEdge(z) - pad && x < eastEdge(z) + pad;
}

function isLand(x, z, pad = 0) {
  if (isManhattan(x, z, pad)) return true;
  if (x > 106 - pad && x < 348 + pad && z > -228 - pad && z < 286 + pad) return true; // Queens and Brooklyn
  if (x > -46 - pad && x < 244 + pad && z > -356 - pad && z < -246 + pad) return true; // Bronx
  if (x < -120 + pad && x > -356 - pad && z > -238 - pad && z < 186 + pad) return true; // New Jersey edge
  if (x > 44 - pad && x < 256 + pad && z > 292 - pad && z < 356 + pad) return true; // Staten Island
  if (isEllipseLand(x, z, -122, 304, 24, 20, pad)) return true; // Liberty Island
  if (isEllipseLand(x, z, -170, 282, 26, 18, pad)) return true; // Ellis Island
  return false;
}

function isRiver(x, z, pad = 0) {
  return !isLand(x, z, pad);
}

function terrainHeightAt(x, z) {
  const midtown = Math.exp(-((x / 90) ** 2 + ((z + 8) / 94) ** 2)) * 0.9;
  const downtown = Math.exp(-(((x + 18) / 64) ** 2 + ((z - 166) / 52) ** 2)) * 0.7;
  const brooklyn = Math.exp(-(((x - 194) / 120) ** 2 + ((z - 126) / 128) ** 2)) * 0.5;
  const queens = Math.exp(-(((x - 226) / 136) ** 2 + ((z + 116) / 118) ** 2)) * 0.42;
  const bronx = Math.exp(-(((x - 102) / 132) ** 2 + ((z + 304) / 62) ** 2)) * 0.56;
  const jersey = Math.exp(-(((x + 230) / 108) ** 2 + ((z - 40) / 132) ** 2)) * 0.34;
  const staten = Math.exp(-(((x - 154) / 92) ** 2 + ((z - 326) / 44) ** 2)) * 0.42;
  const riverCut = Math.min(Math.abs(x - westEdge(z)), Math.abs(x - eastEdge(z))) < 10 ? 0.22 : 0;
  if (isRiver(x, z, 0)) return 0.56 + Math.sin(x * 0.02 + z * 0.03) * 0.04;
  return Math.max(0.56, 1.0 + midtown + downtown + brooklyn + queens + bronx + jersey + staten - riverCut + Math.sin(x * 0.031 + z * 0.017) * 0.12);
}

export function newYorkTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

export function createNewYorkScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing New York voxel material: ${key}`);
  }

  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 8, isRiver });
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
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const xStart = -width / 2 + tile / 2;
    const xEnd = width / 2 - tile / 2;
    const zStart = -depth / 2 + tile / 2;
    const zEnd = depth / 2 - tile / 2;

    for (let lx = xStart; lx <= xEnd; lx += tile) {
      for (let lz = zStart; lz <= zEnd; lz += tile) {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        if (isRiver(wx, wz, -0.6)) continue;
        const shade = Math.sin(wx * 0.19 + wz * 0.12) * 0.026 + Math.cos(lz * 0.43) * 0.012;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, topY(wx, wz) + baseOffset);
      }
    }
  };

  const reserveRoad = (tag, x, z, width, depth, yaw = 0) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
    addTiledRect('asphalt', x, z, width, depth, { color: '#36383a', height: 0.12, tile: 3.4, yaw, baseOffset: 0.02 });
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildGrid({ reserveRoad, addTiledRect, addTop });
  buildEmpireState({ batch, addTop, addTiledRect, addLabel, rng });
  buildTimesSquare({ addTop, addTiledRect, addLabel, rng });
  buildChryslerAndGrandCentral({ addTop, addTiledRect, addLabel });
  buildRockefeller({ addTop, addTiledRect, addLabel });
  buildFlatironAndMadison({ addTop, addTiledRect, addLabel });
  buildCentralParkSouth({ addTop, addTiledRect, addLabel, rng });
  buildDowntownAndBridge({ addTop, addTiledRect, addLabel });
  buildExpandedManhattan({ planner, batch, addTop, addTiledRect, addLabel, rng });
  buildBoroughsAndHarbor({ planner, batch, addTop, addTiledRect, addLabel, rng });
  buildNightlifeDistricts({ planner, addTop, addTiledRect, addLabel, rng });
  const blocks = buildSkyscraperBlocks({ planner, batch, addTop, rng });
  buildStreetDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const taxis = buildTaxis({ animated, rng });
  const trains = buildTrains({ animated, rng });
  const boats = buildFerries({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-new-york-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      empire: new THREE.Vector3(0, 54, 0),
      timesSquare: new THREE.Vector3(-34, 12, -48),
      grandCentral: new THREE.Vector3(42, 20, -4),
      centralPark: new THREE.Vector3(4, 8, -142),
      hudsonYards: new THREE.Vector3(-70, 24, -82),
      highLine: new THREE.Vector3(-78, 10, 36),
      greenwich: new THREE.Vector3(-28, 10, 108),
      downtown: new THREE.Vector3(-18, 42, 170),
      brooklynBridge: new THREE.Vector3(74, 30, 142),
      williamsburg: new THREE.Vector3(156, 16, 40),
      queensMarket: new THREE.Vector3(284, 13, -90),
      yankeeStadium: new THREE.Vector3(84, 18, -318),
      harbor: new THREE.Vector3(-52, 14, 238),
      aerial: new THREE.Vector3(30, 18, 0)
    },
    metrics: {
      instances: total,
      pedestrians,
      taxis,
      trams: trains,
      boats,
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
    ['Queensboro Bridge', 78, -72, 42, 16],
    ['Brooklyn Bridge East', 74, 142, 58, 16],
    ['Hudson Pier', -82, 36, 28, 18],
    ['Williamsburg Bridge', 104, 80, 72, 14],
    ['Manhattan Bridge', 98, 122, 64, 14],
    ['George Washington Bridge', -2, -270, 148, 14],
    ['Verrazzano Bridge', 90, 292, 118, 14]
  ].forEach(([tag, x, z, width, depth]) => planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'bridge' }));
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isRiver(x, z, 0.5)) {
        batch.add('water', x, 0.3, z, TERRAIN_CELL * 1.08, 0.24, TERRAIN_CELL * 1.08, vary('#4b8fa7', Math.sin(z * 0.08) * 0.03));
        continue;
      }
      const h = terrainHeightAt(x, z);
      const park =
        (x > -60 && x < 62 && z < -130 && z > -226) ||
        (x > 174 && x < 266 && z > 184 && z < 260) ||
        (x > 130 && x < 196 && z < -282 && z > -334) ||
        (x > 246 && x < 336 && z < -130 && z > -180);
      batch.add(park ? 'vegetation' : 'nyTerrain', x, h / 2 - 0.04, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04);
    }
  }

  for (let z = -260; z <= 238; z += 14) {
    const west = westEdge(z) + 4;
    const east = eastEdge(z) - 4;
    batch.addTop('concrete', west, topY(west, z) + 0.04, z, 3.4, 0.24, 8.2);
    batch.addTop('concrete', east, topY(east, z) + 0.04, z, 3.4, 0.24, 8.2);
  }
}

function buildGrid({ reserveRoad, addTiledRect, addTop }) {
  for (let x = -66; x <= 66; x += 12) {
    reserveRoad(`Avenue ${x}`, x, 0, 4.6, 330, 0);
  }
  for (let z = -150; z <= 156; z += 12) {
    reserveRoad(`Street ${z}`, 0, z, 148, 4.4, 0);
  }

  reserveRoad('Broadway', -20, -18, 8, 198, -0.34);
  reserveRoad('Fifth Avenue', 0, -8, 5.8, 286, 0);
  reserveRoad('Park Avenue', 42, -24, 6.2, 222, 0);
  reserveRoad('42nd Street', 10, -32, 148, 6.2, 0);

  addTiledRect('vegetation', 4, -150, 108, 44, { color: '#5f7b4c', height: 0.15, tile: 3.6 });
  addTiledRect('vegetation', 20, -34, 40, 24, { color: '#5f7b4c', height: 0.15, tile: 3.6 });

  for (let z = -148; z <= 150; z += 24) {
    addTop('concrete', westEdge(z) + 9, z, 4.0, 0.14, 16);
    addTop('concrete', eastEdge(z) - 9, z, 4.0, 0.14, 16);
  }
}

function buildEmpireState({ batch, addTop, addTiledRect, addLabel, rng }) {
  const x = 0;
  const z = 0;
  const base = topY(x, z);
  addTiledRect('concrete', x, z, 48, 40, { color: '#777b7c', height: 0.16, tile: 3.2 });
  addTop('limestone', x, z, 27, 32, 22, null, 0, base);
  addTop('limestone', x, z, 22, 18, 18, null, 0, base + 32);
  addTop('limestone', x, z, 17, 16, 14, null, 0, base + 50);
  addTop('limestone', x, z, 12, 12, 10, null, 0, base + 66);
  addTop('steel', x, z, 8, 9, 7, 0x6f7578, 0, base + 78);
  addTop('steel', x, z, 4.2, 14, 4.2, 0x687073, 0, base + 87);
  addTop('neon', x, z, 5.2, 2.2, 5.2, 0xf5d65e, 0, base + 92);
  addTop('gold', x, z, 1.0, 8.5, 1.0, 0xf0d45c, 0, base + 101);

  for (let floor = 0; floor < 20; floor += 1) {
    const y = base + 3.2 + floor * 3.4;
    const width = floor < 10 ? 26 : floor < 15 ? 20 : 15;
    for (const side of [-1, 1]) {
      batch.addTop('shadow', x - width / 2 - 0.2, y, z + side * 9.2, 0.28, 1.2, 1.0);
      batch.addTop('shadow', x + width / 2 + 0.2, y, z + side * 9.2, 0.28, 1.2, 1.0);
    }
  }

  for (let i = 0; i < 56; i += 1) {
    const px = x + (rng() - 0.5) * 42;
    const pz = z + (rng() - 0.5) * 34;
    addTop('crowd', px, pz, 0.56, 1.06, 0.56, null);
    addTop('skin', px, pz, 0.36, 0.36, 0.36, null, 0, topY(px, pz) + 1.02);
  }

  addLabel('Empire State Building', x, base + 112, z);
}

function buildTimesSquare({ addTop, addTiledRect, addLabel, rng }) {
  const x = -34;
  const z = -48;
  addTiledRect('asphalt', x, z, 54, 38, { color: '#33363a', height: 0.12, tile: 3.2 });
  for (let i = 0; i < 12; i += 1) {
    const px = x - 22 + (i % 4) * 14;
    const pz = z - 12 + Math.floor(i / 4) * 12;
    const h = 12 + rng() * 24;
    addTop(i % 2 === 0 ? 'glass' : 'steel', px, pz, 8, h, 7, null);
    addTop('neon', px, pz + 3.7, 7.2, 2.4, 0.32, [0xf2d34f, 0xd94f45, 0x4fa6d9, 0xf08bd8][i % 4], 0, topY(px, pz) + h * 0.5);
  }
  addTop('gold', x, z, 2.2, 9, 2.2, 0xf2cc45);
  addLabel('Times Square', x, topY(x, z) + 32, z);
}

function buildChryslerAndGrandCentral({ addTop, addTiledRect, addLabel }) {
  const cx = 46;
  const cz = -18;
  const base = topY(cx, cz);
  addTop('steel', cx, cz, 16, 44, 14, 0x6f777b, 0, base);
  addTop('steel', cx, cz, 12, 16, 10, 0x7d878b, 0, base + 44);
  addTop('slate', cx, cz, 8, 12, 8, 0x657176, 0, base + 60);
  addTop('gold', cx, cz, 0.8, 8, 0.8, 0xf1d15b, 0, base + 74);
  addLabel('Chrysler Building', cx, base + 86, cz);

  const gx = 42;
  const gz = -4;
  const gBase = topY(gx, gz);
  addTiledRect('concrete', gx, gz, 48, 32, { color: '#777b7c', height: 0.14, tile: 3.3 });
  addTop('limestone', gx, gz, 38, 11, 18, null, 0, gBase);
  addTop('slate', gx, gz, 40, 3.2, 20, 0x5f6568, 0, gBase + 11);
  addTop('gold', gx, gz - 9, 8, 1.2, 1.0, 0xd8a334, 0, gBase + 13.5);
  addLabel('Grand Central Terminal', gx, gBase + 18, gz);

  const vx = 54;
  const vz = -10;
  addTop('glass', vx, vz, 12, 62, 11, 0x8bb7c4);
  addTop('neon', vx, vz, 8, 2.5, 8, 0x9ad8ff, 0, topY(vx, vz) + 62);
  addLabel('One Vanderbilt', vx, topY(vx, vz) + 68, vz);
}

function buildRockefeller({ addTop, addTiledRect, addLabel }) {
  const x = -12;
  const z = -76;
  const base = topY(x, z);
  addTiledRect('concrete', x, z, 50, 38, { color: '#777b7c', height: 0.14, tile: 3.4 });
  addTop('limestone', x, z, 18, 42, 15, null, 0, base);
  addTop('limestone', x - 19, z + 5, 10, 24, 11, null);
  addTop('limestone', x + 19, z + 5, 10, 24, 11, null);
  addTop('water', x, z + 14, 16, 0.24, 8, 0x62a9b9);
  addTop('gold', x, z + 12, 1.0, 5, 1.0, 0xd8a334);
  addLabel('Rockefeller Center', x, base + 49, z);
}

function buildFlatironAndMadison({ addTop, addTiledRect, addLabel }) {
  const fx = -34;
  const fz = 64;
  const base = topY(fx, fz);
  addTiledRect('concrete', fx, fz, 40, 34, { color: '#777b7c', height: 0.14, tile: 3.3 });
  addTop('limestone', fx, fz, 11, 32, 28, null, -0.48, base);
  addTop('limestone', fx - 7, fz + 7, 8, 24, 12, null, -0.48);
  addLabel('Flatiron Building', fx, base + 38, fz);

  const mx = -54;
  const mz = 24;
  addTop('concrete', mx, mz, 34, 8, 24, null);
  addTop('slate', mx, mz, 36, 3.0, 26, 0x5d6366, 0, topY(mx, mz) + 8);
  addLabel('Madison Square Garden', mx, topY(mx, mz) + 15, mz);

  const lx = 18;
  const lz = -24;
  addTop('limestone', lx, lz, 34, 10, 18, null);
  addTop('slate', lx, lz, 36, 3, 20, 0x5d6366, 0, topY(lx, lz) + 10);
  addLabel('New York Public Library', lx, topY(lx, lz) + 17, lz);
}

function buildCentralParkSouth({ addTop, addTiledRect, addLabel, rng }) {
  const x = 4;
  const z = -142;
  addTiledRect('vegetation', x, z, 112, 50, { color: '#5f7b4c', height: 0.16, tile: 3.8 });
  for (let i = 0; i < 62; i += 1) {
    const px = x - 52 + rng() * 104;
    const pz = z - 22 + rng() * 44;
    addTop('vegetation', px, pz, 1.8 + rng() * 1.2, 4.2 + rng() * 2.8, 1.8 + rng() * 1.2);
  }
  addTop('water', x - 26, z - 2, 18, 0.25, 9, 0x62a9b9);
  addLabel('Central Park South', x, topY(x, z) + 8, z);
}

function buildDowntownAndBridge({ addTop, addTiledRect, addLabel }) {
  const x = -18;
  const z = 170;
  const base = topY(x, z);
  addTop('glass', x, z, 13, 58, 13, 0x96c0cb, 0, base);
  addTop('steel', x, z, 8, 18, 8, 0x657176, 0, base + 58);
  addTop('gold', x, z, 0.9, 8, 0.9, 0xf1d15b, 0, base + 76);
  addTop('glass', x + 22, z + 8, 11, 34, 11, 0x86b2bf);
  addTop('steel', x - 22, z - 2, 10, 30, 10, 0x697176);
  addLabel('One World Trade Center', x, base + 88, z);

  addTiledRect('concrete', 74, 142, 64, 14, { color: '#777b7c', height: 0.16, tile: 3.2 });
  for (const sx of [-1, 1]) {
    addTop('steel', 74 + sx * 21, 142, 3.0, 23, 3.0, 0x60696d);
    addTop('steel', 74 + sx * 21, 142, 18, 0.7, 0.7, 0x60696d, 0, topY(74 + sx * 21, 142) + 20);
  }
  addLabel('Brooklyn Bridge', 74, topY(74, 142) + 28, 142);
}

function buildExpandedManhattan({ planner, batch, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('vegetation', 4, -184, 108, 74, { color: '#4f7448', height: 0.14, tile: 3.8 });
  addTiledRect('vegetation', 6, -218, 106, 30, { color: '#426f43', height: 0.13, tile: 3.8 });
  for (let i = 0; i < 72; i += 1) {
    addTop('vegetation', -48 + rng() * 104, -224 + rng() * 92, 1.8 + rng() * 1.4, 4 + rng() * 3.6, 1.8 + rng() * 1.3);
  }

  buildCivicBlock(addTop, addTiledRect, 56, -214, 42, 20, 7.4, 'Metropolitan Museum of Art');
  buildCivicBlock(addTop, addTiledRect, -60, -214, 40, 22, 8.2, 'Lincoln Center');
  buildColumbusCircle(addTop, addTiledRect, -34, -132);
  buildHudsonYards(addTop, addTiledRect, addLabel, -70, -82, rng);
  buildHighLine(addTop, addLabel);
  buildVillageAndSoho(addTop, addTiledRect, addLabel, rng);
  buildLowerManhattan(addTop, addTiledRect, addLabel, rng);
  buildStatueAndIslands(addTop, addTiledRect, addLabel);
  buildGeorgeWashingtonBridge(addTop, addLabel);

  for (let x = -60; x <= 64; x += 14) {
    for (let z = -252; z <= 224; z += 18) {
      if (z < -126 && z > -226 && Math.abs(x) < 68) continue;
      if (isRiver(x, z, 2) || planner.hasPoint(x, z)) continue;
      if ((z < -130 && Math.abs(x) < 62) || (z > 206 && Math.abs(x) < 28)) continue;
      if (rng() > 0.36) {
        const width = 7 + rng() * 3.8;
        const depth = 7 + rng() * 3.8;
        if (!planner.reserveRect(`ny-manhattan-exp-${x}-${z}`, x, z, width + 3, depth + 3, { type: 'building' })) continue;
        const highRise = z < -72 ? 16 + rng() * 28 : z > 150 ? 18 + rng() * 30 : 8 + rng() * 16;
        buildTower(batch, addTop, x, z, width, depth, highRise, rng);
      }
    }
  }
}

function buildBoroughsAndHarbor({ planner, batch, addTop, addTiledRect, addLabel, rng }) {
  buildBridge(addTop, 'Queensboro Bridge', 70, -80, 138, -104, 0x66727a);
  buildBridge(addTop, 'Williamsburg Bridge', 64, 64, 156, 40, 0x5c6268);
  buildBridge(addTop, 'Manhattan Bridge', 58, 122, 132, 140, 0x5c6268);
  buildBridge(addTop, 'Verrazzano Bridge', 70, 292, 176, 316, 0x66727a);

  buildBrooklyn({ planner, batch, addTop, addTiledRect, addLabel, rng });
  buildQueens({ planner, batch, addTop, addTiledRect, addLabel, rng });
  buildBronx({ planner, batch, addTop, addTiledRect, addLabel, rng });
  buildJerseyAndStaten({ planner, batch, addTop, addTiledRect, addLabel, rng });
  buildHarborPiers({ addTop, addTiledRect, addLabel, rng });
}

function buildBrooklyn({ planner, batch, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('concrete', 142, 156, 74, 46, { color: '#73716b', height: 0.13, tile: 3.7 });
  addTiledRect('vegetation', 222, 220, 88, 56, { color: '#4c7447', height: 0.14, tile: 3.8 });
  addTiledRect('road', 240, 332, 90, 34, { color: '#5a5750', height: 0.13, tile: 3.8 });
  addTop('water', 242, 350, 86, 0.18, 8, 0x68a9bf);
  buildBoardwalk(addTop, 240, 328, 86, 0);
  addLabel('Brooklyn Heights', 142, topY(142, 156) + 12, 156);
  addLabel('Prospect Park', 222, topY(222, 220) + 11, 220);
  addLabel('Coney Island', 240, topY(240, 332) + 10, 332);

  for (let x = 124; x <= 318; x += 14) {
    for (let z = 6; z <= 256; z += 18) {
      if (planner.hasPoint(x, z) || isRiver(x, z, 2)) continue;
      if (x > 180 && x < 270 && z > 178 && z < 262) continue;
      const width = 7.5 + rng() * 5;
      const depth = 8 + rng() * 5;
      if (!planner.reserveRect(`ny-brooklyn-${x}-${z}`, x, z, width + 3, depth + 3, { type: 'building' })) continue;
      const warehouse = x > 210 && z < 98;
      const height = warehouse ? 7 + rng() * 10 : 6 + rng() * 12;
      buildBoroughBuilding(batch, addTop, x, z, width, depth, height, warehouse ? 'brick' : 'limestone', rng);
      if (warehouse && rng() > 0.52) addMural(addTop, x, z + depth / 2 + 0.18, width * 0.8, 2.4, rng());
    }
  }
}

function buildQueens({ planner, batch, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('concrete', 142, -104, 70, 48, { color: '#73716b', height: 0.13, tile: 3.7 });
  addTiledRect('vegetation', 298, -154, 74, 50, { color: '#4e7548', height: 0.14, tile: 3.8 });
  addTop('steel', 298, -154, 28, 0.8, 28, 0x8b8d88);
  addTop('steel', 298, -154, 2.2, 16, 2.2, 0x8b8d88);
  addTop('neon', 298, -154, 15, 1.2, 15, 0x48d9ff, 0, topY(298, -154) + 8);
  buildStadium(addTop, 250, -196, 36, 28, 'Citi Field');
  buildNightMarket(addTop, addTiledRect, 284, -90, rng);
  addLabel('Long Island City', 142, topY(142, -104) + 22, -104);
  addLabel('Flushing Meadows', 298, topY(298, -154) + 22, -154);

  for (let x = 124; x <= 336; x += 16) {
    for (let z = -214; z <= -18; z += 18) {
      if (planner.hasPoint(x, z) || isRiver(x, z, 2)) continue;
      const width = 8 + rng() * 5;
      const depth = 8 + rng() * 6;
      if (!planner.reserveRect(`ny-queens-${x}-${z}`, x, z, width + 3, depth + 3, { type: 'building' })) continue;
      const height = x < 174 ? 13 + rng() * 28 : 5 + rng() * 13;
      buildBoroughBuilding(batch, addTop, x, z, width, depth, height, x < 174 ? 'glass' : 'brick', rng);
    }
  }
}

function buildBronx({ planner, batch, addTop, addTiledRect, addLabel, rng }) {
  buildStadium(addTop, 84, -318, 44, 34, 'Yankee Stadium');
  addTiledRect('vegetation', 160, -302, 76, 50, { color: '#456f42', height: 0.14, tile: 3.8 });
  addLabel('Yankee Stadium', 84, topY(84, -318) + 18, -318);
  addLabel('Bronx Zoo', 160, topY(160, -302) + 12, -302);
  buildPath(addTop, [[-18, -286], [44, -306], [126, -316], [212, -306]], 7.2, 'asphalt');

  for (let x = -18; x <= 220; x += 16) {
    for (let z = -342; z <= -258; z += 18) {
      if (planner.hasPoint(x, z) || isRiver(x, z, 1)) continue;
      const width = 8 + rng() * 4;
      const depth = 8 + rng() * 5;
      if (!planner.reserveRect(`ny-bronx-${x}-${z}`, x, z, width + 3, depth + 3, { type: 'building' })) continue;
      buildBoroughBuilding(batch, addTop, x, z, width, depth, 8 + rng() * 17, rng() > 0.6 ? 'brick' : 'limestone', rng);
    }
  }
}

function buildJerseyAndStaten({ planner, batch, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('concrete', -228, 92, 96, 56, { color: '#6e746f', height: 0.13, tile: 3.8 });
  addTiledRect('concrete', -52, 238, 48, 30, { color: '#77766d', height: 0.13, tile: 3.6 });
  addTiledRect('vegetation', 142, 324, 94, 46, { color: '#507247', height: 0.14, tile: 3.8 });
  addLabel('Jersey City Waterfront', -228, topY(-228, 92) + 28, 92);
  addLabel('Staten Island Ferry', -52, topY(-52, 238) + 12, 238);

  for (let x = -326; x <= -142; x += 18) {
    for (let z = -184; z <= 152; z += 24) {
      if (planner.hasPoint(x, z) || isRiver(x, z, 2) || rng() < 0.18) continue;
      const width = 8 + rng() * 6;
      const depth = 8 + rng() * 6;
      if (!planner.reserveRect(`ny-jersey-${x}-${z}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
      buildBoroughBuilding(batch, addTop, x, z, width, depth, z > 28 ? 14 + rng() * 26 : 6 + rng() * 12, rng() > 0.55 ? 'glass' : 'brick', rng);
    }
  }

  for (let x = 62; x <= 242; x += 18) {
    for (let z = 306; z <= 350; z += 18) {
      if (planner.hasPoint(x, z) || isRiver(x, z, 2) || rng() < 0.2) continue;
      const width = 8 + rng() * 4;
      const depth = 8 + rng() * 4;
      if (!planner.reserveRect(`ny-staten-${x}-${z}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
      buildBoroughBuilding(batch, addTop, x, z, width, depth, 4 + rng() * 8, rng() > 0.58 ? 'limestone' : 'brick', rng);
    }
  }
}

function buildNightlifeDistricts({ planner, addTop, addTiledRect, addLabel, rng }) {
  [
    ['Lower East Side', 42, 92, 54, 34, 0xf25fa7],
    ['Greenwich Village', -28, 108, 56, 34, 0x48d9ff],
    ['Chelsea Nightlife', -72, -28, 50, 36, 0xa66bff],
    ['Williamsburg', 156, 40, 74, 44, 0x48d9ff],
    ['Bushwick Warehouse District', 246, 58, 84, 50, 0xf25fa7],
    ['Harlem Jazz', 32, -246, 56, 30, 0xd8a334],
    ['Bronx Block Party', 112, -278, 66, 32, 0xf25fa7],
    ['Queens Market', 284, -90, 82, 38, 0x48d9ff]
  ].forEach(([name, x, z, width, depth, color], index) => {
    addTiledRect('asphalt', x, z, width, depth, { color: '#34383d', height: 0.13, tile: 3.5, baseOffset: 0.08 });
    for (let i = 0; i < 8; i += 1) {
      const px = x - width * 0.36 + (i % 4) * (width * 0.24);
      const pz = z - depth * 0.2 + Math.floor(i / 4) * depth * 0.32;
      buildVenue(addTop, px, pz, 8 + rng() * 5, 7 + rng() * 4, 5 + rng() * 8, color, rng());
    }
    for (let i = 0; i < 18; i += 1) {
      addStaticPerson(addTop, x - width * 0.42 + rng() * width * 0.84, z - depth * 0.38 + rng() * depth * 0.76, i % 5 === 0 ? 'cloth' : 'crowd', 0.86 + rng() * 0.18);
    }
    if (index < 5) addLabel(name, x, topY(x, z) + 16, z);
    planner.reserveRect(`ny-nightlife-${name}`, x, z, width, depth, { force: true, type: 'landmark' });
  });
}

function buildHarborPiers({ addTop, addTiledRect, addLabel, rng }) {
  [
    [-92, 36, 0],
    [-104, 118, 0],
    [-58, 238, 0],
    [92, 164, Math.PI / 2],
    [164, 40, Math.PI / 2],
    [-230, 92, 0]
  ].forEach(([x, z, yaw]) => {
    addTiledRect('wood', x, z, 42, 10, { tile: 3.5, height: 0.16, yaw, baseOffset: 0.12 });
    for (let i = -2; i <= 2; i += 1) {
      addTop('wood', x + Math.cos(yaw) * i * 7, z - Math.sin(yaw) * i * 7, 0.5, 2.0, 0.5, null, yaw);
    }
  });
  buildFerryTerminal(addTop, addTiledRect, -52, 238);
  addLabel('New York Harbor', -90, topY(-90, 250) + 14, 250);
  for (let i = 0; i < 16; i += 1) {
    buildSmallBoat(addTop, -148 + rng() * 248, 214 + rng() * 120, rng() * Math.PI);
  }
}

function buildCivicBlock(addTop, addTiledRect, x, z, width, depth, height) {
  const base = topY(x, z);
  addTiledRect('concrete', x, z, width + 10, depth + 8, { color: '#777b7c', height: 0.13, tile: 3.4 });
  addTop('limestone', x, z, width, height, depth, null, 0, base);
  for (let i = -3; i <= 3; i += 1) {
    addTop('limestone', x + i * (width / 8), z - depth * 0.54, 0.8, height * 0.86, 0.8, null, 0, base);
  }
  addTop('slate', x, z, width * 1.04, 1.1, depth * 1.08, null, 0, base + height);
}

function buildColumbusCircle(addTop, addTiledRect, x, z) {
  addTiledRect('concrete', x, z, 32, 30, { color: '#777b7c', height: 0.13, tile: 3.2 });
  addTop('water', x, z, 14, 0.22, 14, 0x62a9b9);
  addTop('gold', x, z, 1.0, 5.2, 1.0, 0xd8a334);
}

function buildHudsonYards(addTop, addTiledRect, addLabel, x, z, rng) {
  addTiledRect('concrete', x, z, 60, 42, { color: '#777b7c', height: 0.14, tile: 3.4 });
  for (let i = 0; i < 8; i += 1) {
    const px = x - 22 + (i % 4) * 14;
    const pz = z - 10 + Math.floor(i / 4) * 20;
    addTop('glass', px, pz, 9, 26 + rng() * 28, 9, 0x9cc8c8);
  }
  for (let ring = 0; ring < 5; ring += 1) {
    addTop('gold', x, z, 22 - ring * 3.2, 0.8, 22 - ring * 3.2, 0xd8a334, ring * 0.28, topY(x, z) + 1 + ring * 1.8);
  }
  addLabel('Hudson Yards', x, topY(x, z) + 42, z);
}

function buildHighLine(addTop, addLabel) {
  const points = [[-78, 72], [-76, 36], [-72, -2], [-70, -40], [-70, -82]];
  buildPath(addTop, points, 4.2, 'steel', 2.8);
  for (const [x, z] of points) {
    addTop('vegetation', x + 2.6, z, 1.8, 1.0, 1.8, null, 0, topY(x, z) + 3.0);
  }
  addLabel('High Line', -78, topY(-78, 36) + 10, 36);
}

function buildVillageAndSoho(addTop, addTiledRect, addLabel, rng) {
  addTiledRect('vegetation', -28, 108, 42, 32, { color: '#4e7448', height: 0.13, tile: 3.7 });
  addTop('water', -28, 108, 12, 0.18, 8, 0x62a9b9);
  for (let i = 0; i < 22; i += 1) {
    const x = -66 + rng() * 100;
    const z = 82 + rng() * 62;
    buildLowRise(addTop, x, z, 6 + rng() * 4, 6 + rng() * 4, 4 + rng() * 8, rng() > 0.45 ? 'brick' : 'limestone');
  }
  addLabel('Washington Square Park', -28, topY(-28, 108) + 10, 108);
  addLabel('Chinatown', 32, topY(32, 136) + 12, 136);
}

function buildLowerManhattan(addTop, addTiledRect, addLabel, rng) {
  addTiledRect('concrete', -10, 198, 50, 32, { color: '#777b7c', height: 0.13, tile: 3.4 });
  buildCivicBlock(addTop, addTiledRect, -10, 198, 28, 16, 9.5);
  addTop('gold', -10, 189, 10, 0.75, 0.55, 0xd8a334, 0, topY(-10, 189) + 9.8);
  addTiledRect('vegetation', -6, 232, 56, 32, { color: '#4f7448', height: 0.13, tile: 3.7 });
  addTop('water', -28, 174, 13, 0.18, 9, 0x1e1f23);
  addTop('water', -8, 174, 13, 0.18, 9, 0x1e1f23);
  for (let i = 0; i < 18; i += 1) {
    buildLowRise(addTop, -54 + rng() * 100, 126 + rng() * 68, 6 + rng() * 4, 6 + rng() * 4, 5 + rng() * 10, rng() > 0.45 ? 'brick' : 'limestone');
  }
  addLabel('Wall Street', -10, topY(-10, 198) + 16, 198);
  addLabel('Battery Park', -6, topY(-6, 232) + 10, 232);
}

function buildStatueAndIslands(addTop, addTiledRect, addLabel) {
  addTiledRect('vegetation', -122, 304, 38, 28, { color: '#527b4b', height: 0.13, tile: 3.5 });
  addTiledRect('vegetation', -170, 282, 42, 24, { color: '#557a4b', height: 0.13, tile: 3.5 });
  const base = topY(-122, 304);
  addTop('limestone', -122, 304, 8, 5.2, 8, null, 0, base);
  addTop('copper', -122, 304, 2.6, 10, 2.0, 0x75a26a, 0, base + 5.2);
  addTop('gold', -122, 304, 0.8, 4.2, 0.8, 0xd8a334, 0, base + 15.0);
  addTop('copper', -121, 302.7, 2.8, 0.7, 0.24, 0x75a26a, -0.2, base + 12.4);
  addLabel('Statue of Liberty', -122, base + 24, 304);
}

function buildGeorgeWashingtonBridge(addTop, addLabel) {
  buildBridge(addTop, 'George Washington Bridge', -80, -270, 76, -270, 0x66727a);
  addLabel('George Washington Bridge', 0, topY(0, -270) + 24, -270);
}

function buildBridge(addTop, name, ax, az, bx, bz, color = 0x66727a) {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  const yaw = yawForVector(dx, dz);
  const steps = Math.max(2, Math.ceil(length / 7));
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const x = ax + dx * t;
    const z = az + dz * t;
    addTop('steel', x, z, length / steps + 0.7, 0.7, 7.4, color, yaw, topY(x, z) + 4.2);
    addTop('asphalt', x, z, length / steps + 0.4, 0.16, 4.6, 0x34383d, yaw, topY(x, z) + 5.0);
    if (i % 3 === 0) {
      addTop('steel', x, z, 0.32, 5.2, 0.32, color, yaw, topY(x, z) + 4.5);
      addTop('steel', x, z, length / steps * 0.86, 0.22, 0.22, color, yaw, topY(x, z) + 8.4);
    }
  }
  for (const t of [0.18, 0.82]) {
    const x = ax + dx * t;
    const z = az + dz * t;
    addTop('steel', x, z, 4.2, 20, 4.2, color, yaw, topY(x, z) + 2.8);
    addTop('steel', x, z, 18, 0.75, 0.75, color, yaw, topY(x, z) + 20.8);
  }
  if (name === 'Queensboro Bridge') addTop('neon', (ax + bx) / 2, (az + bz) / 2, 8, 0.5, 0.5, 0xf0c84b, yaw, topY((ax + bx) / 2, (az + bz) / 2) + 9.4);
}

function buildPath(addTop, points, width, material, lift = 0.1) {
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / 4.2));
    const yaw = yawForVector(dx, dz);
    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      if (isRiver(x, z, -0.8) && lift < 2) continue;
      addTop(material, x, z, length / steps + 0.5, 0.14, width, null, yaw, topY(x, z) + lift);
    }
  }
}

function buildBoroughBuilding(batch, addTop, x, z, width, depth, height, material, rng) {
  const base = topY(x, z);
  addTop(material, x, z, width, height, depth, null, 0, base);
  addTop(rng() > 0.5 ? 'slate' : 'concrete', x, z, width + 0.6, 0.8, depth + 0.6, null, 0, base + height);
  for (let floor = 1; floor < Math.min(10, Math.floor(height / 2.8)); floor += 2) {
    const y = base + floor * 2.6;
    batch.addTop('shadow', x, y, z + depth / 2 + 0.1, Math.max(2, width * 0.58), 0.45, 0.2);
    if (rng() > 0.55) batch.addTop('shadow', x + width / 2 + 0.1, y, z, 0.2, 0.45, Math.max(2, depth * 0.58));
  }
  if (height > 10 && rng() > 0.62) {
    addTop('wood', x + width * 0.18, z - depth * 0.12, 1.7, 2.2, 1.7, null, 0, base + height + 0.8);
    addTop('steel', x + width * 0.18, z - depth * 0.12, 2.0, 0.45, 2.0, 0x66727a, 0, base + height + 2.9);
  }
  if (rng() > 0.68) addTop('steel', x - width / 2 - 0.32, z, 0.24, Math.min(10, height * 0.55), 1.5, 0x34383d, 0, base + 3.2);
}

function buildLowRise(addTop, x, z, width, depth, height, material) {
  const base = topY(x, z);
  addTop(material, x, z, width, height, depth, null, 0, base);
  addTop('shadow', x, z + depth / 2 + 0.1, width * 0.66, 0.55, 0.22, null, 0, base + height * 0.45);
  addTop('slate', x, z, width + 0.5, 0.65, depth + 0.5, null, 0, base + height);
  if (height < 8) addTop('wood', x + width * 0.25, z - depth * 0.15, 1.4, 1.8, 1.4, null, 0, base + height + 0.5);
}

function buildVenue(addTop, x, z, width, depth, height, neonColor) {
  const base = topY(x, z);
  addTop('brick', x, z, width, height, depth, null, 0, base);
  addTop('shadow', x, z - depth / 2 - 0.1, width * 0.62, 1.1, 0.25, null, 0, base + 1.4);
  addTop('neon', x, z - depth / 2 - 0.22, width * 0.78, 0.45, 0.25, neonColor, 0, base + height * 0.68);
  addTop('steel', x - width * 0.32, z + depth * 0.46, 1.8, 1.0, 1.6, 0x202326, 0, base + height + 0.3);
}

function addMural(addTop, x, z, width, height, phase) {
  const color = phase > 0.66 ? 0xf25fa7 : phase > 0.33 ? 0x48d9ff : 0xa66bff;
  addTop('neon', x, z, width, height, 0.18, color, 0, topY(x, z) + 2.8);
}

function buildStadium(addTop, x, z, width, depth) {
  const base = topY(x, z);
  addTop('concrete', x, z, width, 2.2, depth, null, 0, base);
  addTop('vegetation', x, z, width * 0.55, 0.2, depth * 0.45, 0x4f7448, 0, base + 2.2);
  for (const side of [-1, 1]) {
    addTop('steel', x + side * width * 0.36, z, 2.0, 8.0, depth * 0.76, 0x66727a, 0, base + 2.2);
  }
  addTop('neon', x, z - depth * 0.48, width * 0.42, 0.45, 0.25, 0xf0c84b, 0, base + 9.8);
}

function buildNightMarket(addTop, addTiledRect, x, z, rng) {
  addTiledRect('asphalt', x, z, 78, 34, { color: '#35383b', height: 0.12, tile: 3.5 });
  for (let i = 0; i < 22; i += 1) {
    const px = x - 34 + (i % 8) * 9.5;
    const pz = z - 12 + Math.floor(i / 8) * 10;
    buildFoodCart(addTop, px, pz, i % 2 ? 0 : Math.PI, rng());
  }
}

function buildBoardwalk(addTop, x, z, width, yaw) {
  addTop('wood', x, z, width, 0.22, 5.6, null, yaw, topY(x, z) + 0.16);
  for (let i = -4; i <= 4; i += 1) {
    addTop('wood', x + i * (width / 9), z + 3.1, 0.34, 1.2, 0.34, null, yaw, topY(x, z) + 0.2);
  }
}

function buildFerryTerminal(addTop, addTiledRect, x, z) {
  addTiledRect('concrete', x, z, 42, 24, { color: '#777b7c', height: 0.13, tile: 3.5 });
  addTop('limestone', x, z, 28, 5.4, 14, null);
  addTop('slate', x, z, 30, 1.2, 16, null, 0, topY(x, z) + 5.4);
  addTop('gold', x, z - 7.4, 9, 0.6, 0.32, 0xd8a334, 0, topY(x, z) + 6.6);
}

function buildSmallBoat(addTop, x, z, yaw) {
  addTop('wood', x, z, 5.0, 0.45, 1.7, null, yaw, topY(x, z) + 0.2);
  addTop('cloth', x + Math.cos(yaw) * 0.3, z - Math.sin(yaw) * 0.3, 2.2, 1.4, 0.18, null, yaw, topY(x, z) + 0.9);
}

function buildFoodCart(addTop, x, z, yaw, phase = 0) {
  addTop('steel', x, z, 2.6, 1.1, 1.7, 0x8b8d88, yaw);
  addTop('cloth', x, z, 3.0, 0.7, 2.0, phase > 0.5 ? 0xd8a334 : 0xb96038, yaw, topY(x, z) + 1.1);
  addTop('shadow', x + Math.cos(yaw) * 0.9, z - Math.sin(yaw) * 0.9, 0.35, 0.42, 2.0, null, yaw, topY(x, z) + 0.08);
}

function addStaticPerson(addTop, x, z, body = 'crowd', scale = 1) {
  const base = topY(x, z);
  addTop(body, x, z, 0.55 * scale, 1.08 * scale, 0.42 * scale, null, 0, base + 0.02);
  addTop('skin', x, z, 0.36 * scale, 0.36 * scale, 0.36 * scale, null, 0, base + 1.05 * scale);
}

function buildSkyscraperBlocks({ planner, batch, addTop, rng }) {
  let placed = 0;
  const xs = [-66, -54, -42, -30, -18, -6, 6, 18, 30, 42, 54, 66];
  const zs = [-132, -114, -96, -78, -60, -42, -24, -6, 12, 30, 48, 66, 84, 102, 120, 138, 156];

  for (const x of xs) {
    for (const z of zs) {
      const width = 7.2 + rng() * 4.8;
      const depth = 7.2 + rng() * 5.0;
      if (!planner.reserveRect(`ny-block-${placed}`, x, z, width + 3.6, depth + 3.6, { type: 'building' })) continue;
      const midtownBoost = Math.max(0, 1 - Math.hypot(x, z + 12) / 105);
      const downtownBoost = Math.max(0, 1 - Math.hypot(x + 18, z - 156) / 70);
      const height = 9 + rng() * 24 + midtownBoost * (28 + rng() * 34) + downtownBoost * (24 + rng() * 28);
      buildTower(batch, addTop, x, z, width, depth, height, rng);
      placed += 1;
    }
  }

  return placed;
}

function buildTower(batch, addTop, x, z, width, depth, height, rng) {
  const base = topY(x, z);
  const material = rng() > 0.42 ? 'glass' : rng() > 0.45 ? 'limestone' : 'brick';
  addTop(material, x, z, width, height, depth, null, 0, base);
  if (height > 32) {
    addTop(material, x, z, width * 0.75, height * 0.35, depth * 0.75, null, 0, base + height);
  }
  addTop(rng() > 0.5 ? 'slate' : 'concrete', x, z, width + 0.8, 1.0, depth + 0.8, null, 0, base + height + (height > 32 ? height * 0.35 : 0));

  for (let floor = 1; floor < Math.min(18, Math.floor(height / 3)); floor += height > 20 ? 3 : 2) {
    const y = base + floor * 3;
    batch.addTop('shadow', x, y, z + depth / 2 + 0.12, Math.max(2.4, width * 0.68), 0.65, 0.24);
    if (rng() > 0.5) batch.addTop('shadow', x + width / 2 + 0.12, y, z, 0.24, 0.65, Math.max(2.4, depth * 0.68));
  }

  if (rng() > 0.72) {
    addTop('wood', x + width * 0.18, z - depth * 0.12, 2.2, 2.5, 2.2, null, 0, base + height + 1.1);
    addTop('steel', x + width * 0.18, z - depth * 0.12, 2.7, 0.6, 2.7, 0x666b6e, 0, base + height + 3.6);
  }

  if (rng() > 0.78) {
    addTop('steel', x - width / 2 - 0.35, z, 0.28, Math.min(14, height * 0.45), 1.8, 0x3d4143, 0, base + 6);
  }
}

function buildStreetDetails({ planner, addTop, rng }) {
  const roads = planner.reservations.filter((item) => item.type === 'road');
  for (let i = 0; i < 150; i += 1) {
    const road = roads[i % roads.length];
    const x = road.x1 + rng() * (road.x2 - road.x1);
    const z = road.z1 + rng() * (road.z2 - road.z1);
    if (isRiver(x, z, 2)) continue;
    if (i % 6 === 0) {
      addTop('vegetation', x, z, 1.5, 4.6, 1.5);
    } else if (i % 5 === 0) {
      addTop('steel', x, z, 0.42, 2.2, 0.42, 0xaeb3b5);
      addTop('water', x, z, 0.9, 2.8, 0.9, 0xd3dde0, 0, topY(x, z) + 2.2);
    } else {
      addTop('steel', x, z, 0.34, 3.2, 0.34, 0x3d4143);
      addTop('neon', x + 0.42, z, 0.64, 0.42, 0.42, 0xf4ca35, 0, topY(x, z) + 3.1);
    }
  }

  for (let i = 0; i < 26; i += 1) {
    const x = -66 + (i % 8) * 18;
    const z = -110 + Math.floor(i / 8) * 48;
    addTop('steel', x, z, 3.2, 1.0, 2.6, 0x4a4f53);
    addTop('neon', x, z - 1.5, 3.4, 0.35, 0.28, 0x4fa6d9, 0, topY(x, z) + 1.0);
  }
}

function buildPedestrians({ animated, rng }) {
  const routes = createPedestrianRoutes();
  const pedestrians = [];
  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    pedestrians.push({
      route,
      distance: rng() * route.length,
      speed: 3.1 + rng() * 4.4,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 1 + rng() * 0.28
    });
  }

  const group = new THREE.Group();
  group.name = 'new-york-street-crowds';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'ny-pedestrian-body', 0x3f6076),
    head: makeInstancedPart(pedestrians.length, 'ny-pedestrian-head', 0xd09a6d),
    hair: makeInstancedPart(pedestrians.length, 'ny-pedestrian-hair', 0x4b3a2e),
    leftLeg: makeInstancedPart(pedestrians.length, 'ny-pedestrian-left-leg', 0x2f3642),
    rightLeg: makeInstancedPart(pedestrians.length, 'ny-pedestrian-right-leg', 0x2f3642),
    leftArm: makeInstancedPart(pedestrians.length, 'ny-pedestrian-left-arm', 0xd09a6d),
    rightArm: makeInstancedPart(pedestrians.length, 'ny-pedestrian-right-arm', 0xd09a6d)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updatePedestrians(parts, pedestrians, elapsed);
    }
  });
  updatePedestrians(parts, pedestrians, 0);
  return pedestrians.length;
}

function buildTaxis({ animated, rng }) {
  const routes = createTaxiRoutes();
  const taxis = [];
  for (let i = 0; i < TAXI_COUNT; i += 1) {
    const route = routes[i % routes.length];
    taxis.push({
      route,
      distance: rng() * route.length,
      speed: 9 + rng() * 6,
      lane: (rng() - 0.5) * route.width
    });
  }

  const group = new THREE.Group();
  group.name = 'new-york-yellow-taxis';
  const parts = {
    body: makeInstancedPart(taxis.length, 'ny-taxi-body', 0xf0c234),
    roof: makeInstancedPart(taxis.length, 'ny-taxi-roof', 0xf6d658),
    window: makeInstancedPart(taxis.length, 'ny-taxi-windows', 0x2f5962),
    tireA: makeInstancedPart(taxis.length, 'ny-taxi-front-tires', 0x202326),
    tireB: makeInstancedPart(taxis.length, 'ny-taxi-rear-tires', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateTaxis(parts, taxis, elapsed);
    }
  });
  updateTaxis(parts, taxis, 0);
  return taxis.length;
}

function buildTrains({ animated, rng }) {
  const routes = createTrainRoutes();
  const trains = [];
  for (let i = 0; i < TRAIN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    trains.push({
      route,
      distance: rng() * route.length,
      speed: 8.5 + rng() * 4.5,
      lane: (rng() - 0.5) * route.width * 0.18,
      scale: 0.9 + rng() * 0.12
    });
  }

  const group = new THREE.Group();
  group.name = 'new-york-elevated-trains';
  const parts = {
    carA: makeInstancedPart(trains.length, 'ny-train-car-a', 0x8b8d88),
    carB: makeInstancedPart(trains.length, 'ny-train-car-b', 0x8b8d88),
    stripe: makeInstancedPart(trains.length, 'ny-train-stripe', 0x48d9ff),
    window: makeInstancedPart(trains.length, 'ny-train-windows', 0x2f5962),
    track: makeInstancedPart(trains.length, 'ny-train-track-shadow', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({
    object: group,
    update(elapsed) {
      updateTrains(parts, trains, elapsed);
    }
  });
  updateTrains(parts, trains, 0);
  return trains.length;
}

function buildFerries({ animated, rng }) {
  const routes = createFerryRoutes();
  const ferries = [];
  for (let i = 0; i < FERRY_COUNT; i += 1) {
    const route = routes[i % routes.length];
    ferries.push({
      route,
      distance: rng() * route.length,
      speed: 3.4 + rng() * 2.2,
      lane: (rng() - 0.5) * route.width,
      scale: 0.88 + rng() * 0.16
    });
  }

  const group = new THREE.Group();
  group.name = 'new-york-harbor-ferries';
  const parts = {
    hull: makeInstancedPart(ferries.length, 'ny-ferry-hull', 0xf0dfb2),
    deck: makeInstancedPart(ferries.length, 'ny-ferry-deck', 0x8b8d88),
    stripe: makeInstancedPart(ferries.length, 'ny-ferry-stripe', 0xb96038),
    wake: makeInstancedPart(ferries.length, 'ny-ferry-wake', 0xbbe3e5)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({
    object: group,
    update(elapsed) {
      updateFerries(parts, ferries, elapsed);
    }
  });
  updateFerries(parts, ferries, 0);
  return ferries.length;
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
    { width: 5.5, loop: false, points: [[-64, -48], [-34, -48], [0, -32], [42, -32], [72, -32]] },
    { width: 5.0, loop: false, points: [[0, -132], [0, -72], [0, 0], [0, 72], [0, 156]] },
    { width: 5.2, loop: false, points: [[-58, 24], [-34, 24], [0, 0], [48, -6], [72, -18]] },
    { width: 5.0, loop: true, points: [[-48, -60], [-12, -72], [12, -44], [-20, -28]] },
    { width: 5.4, loop: true, points: [[-20, -36], [38, -36], [38, -16], [-20, -16]] },
    { width: 5.0, loop: true, points: [[-62, 48], [-24, 48], [-24, 82], [-62, 82]] },
    { width: 5.4, loop: true, points: [[124, 150], [176, 146], [182, 186], [128, 186]] },
    { width: 5.0, loop: true, points: [[142, 22], [194, 28], [204, 72], [154, 82]] },
    { width: 5.0, loop: true, points: [[232, 38], [278, 42], [282, 78], [238, 84]] },
    { width: 5.2, loop: true, points: [[252, -108], [312, -104], [318, -76], [260, -72]] },
    { width: 5.0, loop: true, points: [[60, -328], [126, -330], [142, -300], [70, -292]] },
    { width: 5.0, loop: true, points: [[-270, 76], [-214, 82], [-206, 128], [-286, 126]] },
    { width: 5.6, loop: true, ellipse: { x: -34, z: -48, rx: 28, rz: 18, segments: 36 } }
  ].map((definition) => {
    const points = definition.ellipse
      ? makeEllipsePoints(definition.ellipse)
      : definition.points.map(([x, z]) => ({ x, z }));
    return prepareRoute({ ...definition, points });
  });
}

function createTaxiRoutes() {
  return [
    { width: 4.0, loop: true, points: [[-64, -32], [72, -32], [72, 48], [-64, 48]] },
    { width: 4.0, loop: true, points: [[-54, -132], [-54, 150], [54, 150], [54, -132]] },
    { width: 4.0, loop: true, points: [[0, -150], [0, 156], [42, 156], [42, -150]] },
    { width: 4.0, loop: true, points: [[-66, -84], [-8, -96], [38, -42], [66, 12], [10, 38], [-52, 18]] },
    { width: 4.0, loop: true, points: [[118, -92], [306, -92], [306, -42], [118, -42]] },
    { width: 4.0, loop: true, points: [[122, 42], [310, 42], [310, 118], [122, 118]] },
    { width: 4.0, loop: true, points: [[54, -310], [210, -310], [210, -274], [54, -274]] },
    { width: 4.0, loop: true, points: [[-318, -36], [-148, -36], [-148, 116], [-318, 116]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createTrainRoutes() {
  return [
    { width: 3.2, loop: true, points: [[118, -112], [220, -112], [326, -96], [324, -34], [206, -30], [118, -52]] },
    { width: 3.2, loop: true, points: [[128, 36], [240, 48], [314, 70], [292, 120], [170, 104], [128, 72]] },
    { width: 3.2, loop: true, points: [[20, -316], [92, -326], [192, -310], [190, -274], [66, -282]] },
    { width: 3.2, loop: false, points: [[-62, -244], [-8, -250], [76, -270], [164, -292]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createFerryRoutes() {
  return [
    { width: 12, loop: true, points: [[-52, 238], [-116, 244], [-170, 282], [-122, 304], [-24, 260]] },
    { width: 14, loop: true, points: [[-92, 36], [-180, 68], [-228, 92], [-146, 124], [-70, 86]] },
    { width: 14, loop: true, points: [[-58, 238], [50, 210], [132, 164], [82, 138], [-34, 176]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function makeEllipsePoints({ x, z, rx, rz, segments }) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({ x: x + Math.cos(angle) * rx, z: z + Math.sin(angle) * rz });
  }
  return points;
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
  const x = segment.a.x + segment.dx * t;
  const z = segment.a.z + segment.dz * t;
  const invLength = 1 / segment.length;
  return {
    x,
    z,
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
    const bob = Math.abs(Math.sin(elapsed * 8 + person.phase)) * 0.06;
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

function updateTaxis(parts, taxis, elapsed) {
  taxis.forEach((taxi, index) => {
    const sample = sampleRoute(taxi.route, taxi.distance + elapsed * taxi.speed);
    const x = sample.x - sample.tangentZ * taxi.lane;
    const z = sample.z + sample.tangentX * taxi.lane;
    const y = topY(x, z) + 0.1;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 0.72, 0, 2.2, 0.8, 4.0);
    setPart(parts.roof, index, x, y, z, yaw, 0, 1.25, -0.25, 1.4, 0.5, 1.8);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.2, 0, 2.25, 0.42, 2.4);
    setPart(parts.tireA, index, x, y, z, yaw, 0, 0.34, 1.25, 2.35, 0.32, 0.42);
    setPart(parts.tireB, index, x, y, z, yaw, 0, 0.34, -1.25, 2.35, 0.32, 0.42);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateTrains(parts, trains, elapsed) {
  trains.forEach((train, index) => {
    const sample = sampleRoute(train.route, train.distance + elapsed * train.speed);
    const x = sample.x - sample.tangentZ * train.lane;
    const z = sample.z + sample.tangentX * train.lane;
    const y = topY(x, z) + 5.6;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const s = train.scale;

    setPart(parts.carA, index, x, y, z, yaw, 0, 0.8, 1.8, 2.4 * s, 1.35 * s, 5.2 * s);
    setPart(parts.carB, index, x, y, z, yaw, 0, 0.8, -3.8, 2.4 * s, 1.35 * s, 5.2 * s);
    setPart(parts.stripe, index, x, y, z, yaw, 1.24, 1.0, -1.0, 0.16 * s, 0.34 * s, 10.2 * s);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.25, -1.0, 2.5 * s, 0.34 * s, 8.4 * s);
    setPart(parts.track, index, x, y, z, yaw, 0, -0.18, -1.0, 3.4 * s, 0.22 * s, 12.0 * s);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateFerries(parts, ferries, elapsed) {
  ferries.forEach((ferry, index) => {
    const sample = sampleRoute(ferry.route, ferry.distance + elapsed * ferry.speed);
    const x = sample.x - sample.tangentZ * ferry.lane;
    const z = sample.z + sample.tangentX * ferry.lane;
    const y = topY(x, z) + 0.24;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const s = ferry.scale;

    setPart(parts.hull, index, x, y, z, yaw, 0, 0.25, 0, 4.2 * s, 0.55 * s, 10.2 * s);
    setPart(parts.deck, index, x, y, z, yaw, 0, 0.95, -0.4, 3.2 * s, 0.85 * s, 6.2 * s);
    setPart(parts.stripe, index, x, y, z, yaw, 0, 1.35, -0.4, 3.4 * s, 0.18 * s, 6.4 * s);
    setPart(parts.wake, index, x, y, z, yaw, 0, 0.02, -6.6, 3.8 * s, 0.14 * s, 4.8 * s);
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
