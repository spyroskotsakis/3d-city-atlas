import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 224;
const TERRAIN_CELL = 4;
const TILE = 3.4;
const PEDESTRIAN_COUNT = 260;
const TAXI_COUNT = 34;
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
  ['Brooklyn Bridge', 74, 142, 46, 28]
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
  const taperNorth = Math.max(0, (Math.abs(z) - 136) * 0.12);
  const taperSouth = z > 118 ? (z - 118) * 0.18 : 0;
  return Math.max(48, 78 - taperNorth - taperSouth + Math.sin(z * 0.033) * 2.8);
}

function westEdge(z) {
  return -islandHalfWidth(z) - 7 + Math.sin(z * 0.047 + 1.1) * 2.3;
}

function eastEdge(z) {
  return islandHalfWidth(z) + 7 + Math.sin(z * 0.041 - 0.7) * 2.2;
}

function isRiver(x, z, pad = 0) {
  return x < westEdge(z) + pad || x > eastEdge(z) - pad;
}

function terrainHeightAt(x, z) {
  const midtown = Math.exp(-((x / 90) ** 2 + ((z + 8) / 94) ** 2)) * 0.9;
  const downtown = Math.exp(-(((x + 18) / 64) ** 2 + ((z - 166) / 52) ** 2)) * 0.7;
  const riverCut = Math.min(Math.abs(x - westEdge(z)), Math.abs(x - eastEdge(z))) < 10 ? 0.22 : 0;
  return Math.max(0.56, 1.0 + midtown + downtown - riverCut + Math.sin(x * 0.031 + z * 0.017) * 0.12);
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
  const blocks = buildSkyscraperBlocks({ planner, batch, addTop, rng });
  buildStreetDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const taxis = buildTaxis({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-new-york-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      empire: new THREE.Vector3(0, 54, 0),
      timesSquare: new THREE.Vector3(-34, 12, -48),
      centralPark: new THREE.Vector3(4, 8, -142),
      downtown: new THREE.Vector3(-18, 42, 170),
      aerial: new THREE.Vector3(0, 12, 0)
    },
    metrics: {
      instances: total,
      pedestrians,
      taxis,
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
    ['Hudson Pier', -82, 36, 28, 18]
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
      const park = x > -60 && x < 62 && z < -130 && z > -188;
      batch.add(park ? 'vegetation' : 'nyTerrain', x, h / 2 - 0.04, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04);
    }
  }

  for (let z = -176; z <= 184; z += 10) {
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

  for (let floor = 1; floor < Math.min(18, Math.floor(height / 3)); floor += 1) {
    if (floor % 2 && height > 20) continue;
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
    { width: 4.0, loop: true, points: [[-66, -84], [-8, -96], [38, -42], [66, 12], [10, 38], [-52, 18]] }
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
