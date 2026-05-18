import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 214;
const TERRAIN_CELL = 4;
const TILE = 3.6;
const PEDESTRIAN_COUNT = 250;
const CYCLIST_COUNT = 38;
const TAXI_COUNT = 20;

const MATERIAL_KEYS = [
  'berlinTerrain',
  'berlinGrass',
  'water',
  'cobblestone',
  'asphalt',
  'concrete',
  'limestone',
  'brick',
  'slate',
  'glass',
  'steel',
  'gold',
  'vegetation',
  'wood',
  'shadow',
  'neon',
  'neonPink',
  'neonCyan',
  'neonPurple',
  'graffiti',
  'crowd',
  'skin'
];

const LANDMARKS = [
  ['Brandenburg Gate', 0, 0, 60, 36],
  ['Pariser Platz', 0, 18, 70, 38],
  ['Reichstag', -34, -48, 58, 38],
  ['Victory Column', -112, -22, 34, 34],
  ['Museum Island', 60, -20, 62, 34],
  ['Berlin Cathedral', 82, -18, 42, 34],
  ['Alexanderplatz', 124, -12, 58, 42],
  ['Fernsehturm', 138, -20, 28, 28],
  ['Gendarmenmarkt', 30, 52, 50, 38],
  ['Potsdamer Platz', -48, 62, 50, 38],
  ['Checkpoint Charlie', 34, 92, 36, 30],
  ['East Side Gallery', 134, 84, 82, 18],
  ['Oberbaum Bridge', 150, 70, 56, 18],
  ['Tempelhof Field', -18, 164, 112, 58],
  ['Industrial Club Zone', 112, 108, 92, 62]
];

const tempColor = new THREE.Color();

function createRng(seed = 0x4245524c) {
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

function spreeCenterZ(x) {
  return -22 + Math.sin((x + 18) * 0.034) * 10 + Math.sin(x * 0.073 + 0.7) * 4;
}

function spreeWidthAt(x) {
  return 22 + Math.sin(x * 0.042 + 1.4) * 3;
}

function canalCenterZ(x) {
  return 100 + Math.sin((x - 16) * 0.046) * 7;
}

function isMuseumIslandLand(x, z) {
  return x > 45 && x < 76 && z > -38 && z < -2;
}

function isSpree(x, z, pad = 0) {
  if (isMuseumIslandLand(x, z)) return false;
  return Math.abs(z - spreeCenterZ(x)) <= spreeWidthAt(x) / 2 + pad;
}

function isCanal(x, z, pad = 0) {
  if (x < -48 || x > 174) return false;
  return Math.abs(z - canalCenterZ(x)) <= 8 + pad;
}

function isRiver(x, z, pad = 0) {
  return isSpree(x, z, pad) || isCanal(x, z, pad);
}

function terrainHeightAt(x, z) {
  const gateRise = Math.exp(-((x / 110) ** 2 + ((z - 8) / 80) ** 2)) * 0.7;
  const museumRise = Math.exp(-(((x - 72) / 58) ** 2 + ((z + 14) / 46) ** 2)) * 0.8;
  const tempelhofSoft = Math.exp(-(((x + 18) / 120) ** 2 + ((z - 164) / 66) ** 2)) * 0.45;
  const riverCut = Math.exp(-((z - spreeCenterZ(x)) ** 2) / 360) * 0.68;
  const canalCut = Math.exp(-((z - canalCenterZ(x)) ** 2) / 180) * 0.4;
  return Math.max(
    0.48,
    1.03 + gateRise + museumRise - tempelhofSoft - riverCut - canalCut + Math.sin(x * 0.021 + z * 0.027) * 0.14
  );
}

export function berlinTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

export function createBerlinScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Berlin voxel material: ${key}`);
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
        if (isRiver(wx, wz, -0.8)) continue;
        const shade = Math.sin(wx * 0.15 + wz * 0.11) * 0.02 + Math.cos(lz * 0.35) * 0.012;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, topY(wx, wz) + baseOffset);
      }
    }
  };

  const reserveRoad = (tag, x, z, width, depth, yaw = 0, material = 'asphalt') => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
    addTiledRect(material, x, z, width, depth, { color: '#3b3e42', height: 0.12, tile: 3.55, yaw, baseOffset: 0.02 });
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildSpreeCanalsAndRails({ batch, addTop, addTiledRect, addLabel });
  buildStreets({ reserveRoad, addTiledRect, addTop });
  buildBrandenburgGate({ addTop, addTiledRect, addLabel, rng });
  buildCivicWest({ addTop, addTiledRect, addLabel });
  buildMuseumIslandAndCathedral({ batch, addTop, addTiledRect, addLabel });
  buildAlexanderplatzAndTower({ addTop, addTiledRect, addLabel });
  buildSquaresAndLandmarks({ addTop, addTiledRect, addLabel, rng });
  buildEastSideAndClubs({ addTop, addTiledRect, addLabel, rng });
  buildTempelhof({ addTop, addTiledRect, addLabel, rng });
  const blocks = buildUrbanBlocks({ planner, batch, addTop, rng });
  buildStreetDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const cyclists = buildCyclists({ animated, rng });
  const taxis = buildTaxis({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-berlin-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      brandenburg: new THREE.Vector3(0, 22, 0),
      fernsehturm: new THREE.Vector3(138, 74, -20),
      spree: new THREE.Vector3(68, 8, spreeCenterZ(68)),
      clubs: new THREE.Vector3(112, 14, 108),
      aerial: new THREE.Vector3(28, 10, 18)
    },
    metrics: {
      instances: total,
      pedestrians,
      cyclists,
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
    ['Moltkebrucke', -24, -34, 48, 14],
    ['Museum Bridge', 64, -24, 50, 14],
    ['Jannowitz Bridge', 118, -8, 48, 14],
    ['Oberbaum Bridge', 150, 70, 62, 18],
    ['Canal Club Bridge', 112, 100, 48, 14]
  ].forEach(([tag, x, z, width, depth]) => planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'bridge' }));
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isRiver(x, z, 0.35)) {
        batch.add('water', x, 0.28, z, TERRAIN_CELL * 1.08, 0.24, TERRAIN_CELL * 1.08, vary('#4c90a8', Math.sin(x * 0.08) * 0.03));
        continue;
      }

      const h = terrainHeightAt(x, z);
      const park =
        (x > -138 && x < -70 && z > -52 && z < 10) ||
        (x > -80 && x < -18 && z > -74 && z < -36) ||
        (x > -88 && x < 44 && z > 136 && z < 200);
      const bank =
        Math.abs(z - spreeCenterZ(x)) < spreeWidthAt(x) / 2 + 11 ||
        Math.abs(z - canalCenterZ(x)) < 18;
      batch.add(park || bank ? 'berlinGrass' : 'berlinTerrain', x, h / 2 - 0.04, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04);
    }
  }
}

function buildSpreeCanalsAndRails({ batch, addTop, addTiledRect, addLabel }) {
  for (let x = -168; x <= 178; x += 10) {
    const z = spreeCenterZ(x);
    addTop('concrete', x, z - spreeWidthAt(x) / 2 - 4.6, 8.5, 0.14, 2.6);
    addTop('concrete', x, z + spreeWidthAt(x) / 2 + 4.6, 8.5, 0.14, 2.6);
    if (x % 30 === 0) {
      addTop('vegetation', x, z - spreeWidthAt(x) / 2 - 9, 1.7, 4.4, 1.7);
      addTop('vegetation', x, z + spreeWidthAt(x) / 2 + 9, 1.7, 4.4, 1.7);
    }
  }

  for (let x = -38; x <= 168; x += 10) {
    const z = canalCenterZ(x);
    addTop('concrete', x, z - 11.8, 8.5, 0.12, 2.2);
    addTop('concrete', x, z + 11.8, 8.5, 0.12, 2.2);
  }

  [
    [-24, -34, 'Moltkebrucke'],
    [64, -24, 'Museum Island Bridge'],
    [118, -8, 'Jannowitz Bridge'],
    [150, 70, 'Oberbaum Bridge'],
    [112, 100, 'Canal Bridge']
  ].forEach(([x, z, name]) => {
    addTop('concrete', x, z, 54, 0.28, 12, 0x8b8d88, 0, topY(x, z) + 0.12);
    batch.addTop('steel', x, topY(x, z) + 0.5, z - 6.4, 54, 0.9, 0.58);
    batch.addTop('steel', x, topY(x, z) + 0.5, z + 6.4, 54, 0.9, 0.58);
    addLabel(name, x, topY(x, z) + 5, z);
  });

  for (let x = 76; x <= 178; x += 12) {
    const z = 34 + Math.sin(x * 0.035) * 4;
    addTop('concrete', x, z, 5.8, 4.4, 2.0);
    addTop('steel', x, z - 2.3, 6.6, 0.18, 0.24, 0x33383d, 0, topY(x, z) + 4.35);
    addTop('steel', x, z + 2.3, 6.6, 0.18, 0.24, 0x33383d, 0, topY(x, z) + 4.35);
  }
  addLabel('Spree River', 70, 5, spreeCenterZ(70));
  addLabel('S-Bahn Viaduct', 128, 12, 36);
}

function buildStreets({ reserveRoad, addTiledRect, addTop }) {
  reserveRoad('Unter den Linden', 50, -4, 122, 10, 0.04, 'cobblestone');
  reserveRoad('Strasse des 17 Juni', -88, -12, 146, 10, -0.02, 'asphalt');
  reserveRoad('Friedrichstrasse', 30, 32, 9, 170, 0, 'asphalt');
  reserveRoad('Ebertstrasse', -18, 28, 8, 116, 0, 'asphalt');
  reserveRoad('Leipziger Strasse', -16, 62, 112, 8, 0.02, 'asphalt');
  reserveRoad('Potsdamer Strasse', -50, 82, 8, 80, 0.08, 'asphalt');
  reserveRoad('Karl-Marx-Allee', 126, -2, 98, 10, -0.02, 'asphalt');
  reserveRoad('Kurfurstendamm', -130, 18, 100, 9, 0.04, 'asphalt');
  reserveRoad('Spree north path', 50, -42, 150, 7, 0.06, 'cobblestone');
  reserveRoad('Spree south path', 76, 4, 164, 7, 0.04, 'cobblestone');
  reserveRoad('East Side riverfront', 132, 78, 96, 7, -0.12, 'cobblestone');
  reserveRoad('Club corridor', 106, 112, 120, 8, 0.02, 'asphalt');

  addTiledRect('berlinGrass', -108, -22, 74, 42, { color: '#5f774b', height: 0.14, tile: 3.7 });
  addTiledRect('berlinGrass', -36, -54, 52, 28, { color: '#607a4e', height: 0.14, tile: 3.7 });

  for (let i = 0; i < 16; i += 1) {
    addTop('steel', 78 + i * 6, 34 + Math.sin((78 + i * 6) * 0.035) * 4 - 2.2, 4.0, 0.16, 0.26);
    addTop('steel', 78 + i * 6, 34 + Math.sin((78 + i * 6) * 0.035) * 4 + 2.2, 4.0, 0.16, 0.26);
  }
}

function buildBrandenburgGate({ addTop, addTiledRect, addLabel, rng }) {
  const x = 0;
  const z = 0;
  const base = topY(x, z);
  addTiledRect('cobblestone', 0, 12, 78, 48, { color: '#7b766d', height: 0.15, tile: 3.4 });
  addTop('limestone', x, z, 44, 4.0, 9, null, 0, base);
  for (let i = -2.5; i <= 2.5; i += 1) {
    const cx = x + i * 7.3;
    addTop('limestone', cx, z + 1, 2.2, 14.5, 2.2, 0xd8cfb7, 0, base + 2.8);
    addTop('limestone', cx, z + 1, 3.1, 1.0, 3.1, 0xd8cfb7, 0, base + 1.8);
    addTop('limestone', cx, z + 1, 3.1, 0.9, 3.1, 0xd8cfb7, 0, base + 17.2);
  }
  addTop('limestone', x, z + 1, 48, 4.4, 11.5, 0xd8cfb7, 0, base + 18.2);
  addTop('limestone', x, z + 1, 42, 2.0, 8.5, 0xcfc5ad, 0, base + 22.4);
  addTop('gold', x, z + 1, 10, 1.2, 4.4, 0xd8a334, 0, base + 25.1);
  addTop('gold', x, z + 1, 2.0, 4.0, 1.2, 0xd8a334, 0, base + 26.0);
  for (let i = -1.5; i <= 1.5; i += 1) {
    addTop('gold', x + i * 2.2, z + 3.4, 1.3, 2.0, 2.2, 0xd8a334, 0, base + 25.6);
    addTop('gold', x + i * 2.2, z + 5.0, 0.7, 1.1, 0.7, 0xd8a334, 0, base + 27.2);
  }

  for (let i = 0; i < 42; i += 1) {
    const px = x + (rng() - 0.5) * 54;
    const pz = 10 + (rng() - 0.5) * 30;
    addStaticPerson(addTop, px, pz, i % 6 === 0 ? 'shadow' : 'crowd');
  }
  addLabel('Brandenburg Gate', x, base + 33, z + 1);
  addLabel('Pariser Platz', 0, topY(0, 18) + 5, 18);
}

function buildCivicWest({ addTop, addTiledRect, addLabel }) {
  const reichstagX = -34;
  const reichstagZ = -48;
  const base = topY(reichstagX, reichstagZ);
  addTiledRect('cobblestone', reichstagX, reichstagZ, 64, 42, { color: '#7a746a', height: 0.13, tile: 3.4 });
  addTop('limestone', reichstagX, reichstagZ, 48, 12, 22, null, 0, base);
  addTop('glass', reichstagX, reichstagZ, 22, 9, 22, 0x9cc8c8, 0, base + 12);
  addTop('steel', reichstagX, reichstagZ, 24, 1.3, 24, 0x66727a, 0, base + 21);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addTop('limestone', reichstagX + sx * 26, reichstagZ + sz * 13, 7, 18, 7, null, 0, base);
      addTop('slate', reichstagX + sx * 26, reichstagZ + sz * 13, 8, 3, 8, null, 0, base + 18);
    }
  }
  addLabel('Reichstag', reichstagX, base + 27, reichstagZ);

  const columnX = -112;
  const columnZ = -22;
  addTiledRect('asphalt', columnX, columnZ, 40, 40, { color: '#3b3e42', height: 0.12, tile: 3.5 });
  addTop('limestone', columnX, columnZ, 14, 1.0, 14);
  addTop('gold', columnX, columnZ, 3.1, 24, 3.1);
  addTop('gold', columnX, columnZ, 6.5, 3.8, 6.5, 0xd8a334, 0, topY(columnX, columnZ) + 24);
  addTop('gold', columnX, columnZ + 0.6, 1.1, 6, 1.1, 0xd8a334, 0, topY(columnX, columnZ) + 28);
  addLabel('Victory Column', columnX, topY(columnX, columnZ) + 38, columnZ);
}

function buildMuseumIslandAndCathedral({ batch, addTop, addTiledRect, addLabel }) {
  addTiledRect('cobblestone', 60, -20, 66, 38, { color: '#7a746a', height: 0.13, tile: 3.4 });
  addTiledRect('berlinGrass', 60, -18, 28, 30, { color: '#617a4d', height: 0.12, tile: 3.7 });
  for (let i = -3; i <= 3; i += 1) {
    const x = 42 + i * 6;
    batch.addTop('limestone', x, topY(x, -26) + 1.2, -26, 1.3, 8.2, 1.3);
  }
  addTop('limestone', 42, -26, 46, 7, 13);
  addTop('slate', 42, -26, 48, 2.0, 15, null, 0, topY(42, -26) + 7);
  addLabel('Museum Island', 58, topY(58, -20) + 10, -20);

  const x = 82;
  const z = -18;
  const base = topY(x, z);
  addTop('limestone', x, z, 32, 14, 22, null, 0, base);
  addTop('copper', x, z, 18, 10, 18, 0x75a26a, 0, base + 14);
  addTop('gold', x, z, 1.0, 5.5, 1.0, 0xd8a334, 0, base + 24);
  for (const sx of [-1, 1]) {
    addTop('limestone', x + sx * 18, z + 6, 7, 22, 7, null, 0, base);
    addTop('copper', x + sx * 18, z + 6, 7.8, 5.2, 7.8, 0x75a26a, 0, base + 22);
    addTop('gold', x + sx * 18, z + 6, 0.8, 3.2, 0.8, 0xd8a334, 0, base + 28);
  }
  addLabel('Berlin Cathedral', x, base + 34, z);
}

function buildAlexanderplatzAndTower({ addTop, addTiledRect, addLabel }) {
  addTiledRect('concrete', 124, -12, 66, 48, { color: '#888a85', height: 0.14, tile: 3.5 });
  addTop('water', 112, -6, 13, 0.24, 13, 0x4c90a8);
  addTop('gold', 112, -6, 0.9, 7.8, 0.9);
  addTop('concrete', 124, -38, 34, 15, 18);
  addTop('glass', 106, -34, 14, 28, 14, 0x9cc8c8);
  addTop('steel', 126, -36, 12, 22, 12);
  addLabel('Alexanderplatz', 124, topY(124, -12) + 7, -12);

  const towerX = 138;
  const towerZ = -20;
  const base = topY(towerX, towerZ);
  addTop('steel', towerX, towerZ, 1.7, 78, 1.7, null, 0, base);
  addTop('glass', towerX, towerZ, 15, 14, 15, 0x9cc8c8, 0, base + 78);
  addTop('steel', towerX, towerZ, 8, 2.2, 8, null, 0, base + 92);
  addTop('steel', towerX, towerZ, 1.0, 34, 1.0, null, 0, base + 94);
  addTop('neonCyan', towerX, towerZ + 7.8, 9.5, 0.5, 0.5, null, 0, base + 86);
  addLabel('Fernsehturm / TV Tower', towerX, base + 132, towerZ);
}

function buildSquaresAndLandmarks({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', 30, 52, 56, 42, { color: '#7b756a', height: 0.13, tile: 3.4 });
  addTop('limestone', 30, 52, 22, 12, 16);
  addTop('slate', 30, 52, 24, 2.7, 18, null, 0, topY(30, 52) + 12);
  for (const sx of [-1, 1]) {
    addTop('limestone', 30 + sx * 24, 52, 15, 10, 13);
    addTop('copper', 30 + sx * 24, 52, 10, 6, 10, 0x75a26a, 0, topY(30 + sx * 24, 52) + 10);
    addTop('gold', 30 + sx * 24, 52, 0.7, 3.2, 0.7, 0xd8a334, 0, topY(30 + sx * 24, 52) + 16);
  }
  addLabel('Gendarmenmarkt', 30, topY(30, 52) + 20, 52);

  addTiledRect('concrete', -48, 62, 56, 42, { color: '#858884', height: 0.13, tile: 3.5 });
  addTop('glass', -62, 52, 16, 34, 16, 0x9cc8c8);
  addTop('steel', -40, 66, 14, 24, 18, 0x66727a);
  addTop('glass', -24, 56, 12, 20, 12, 0x86b2bf);
  addTop('neon', -48, 82, 18, 1.0, 1.2, null, 0, topY(-48, 82) + 4);
  addLabel('Potsdamer Platz', -48, topY(-48, 62) + 40, 62);

  addTiledRect('asphalt', 34, 92, 40, 32, { color: '#3a3d41', height: 0.12, tile: 3.5 });
  addTop('wood', 34, 92, 8, 4.5, 6);
  addTop('shadow', 34, 95.2, 8.6, 2.2, 0.5, null, 0, topY(34, 92) + 4.5);
  addTop('neon', 34, 88.7, 10, 0.5, 0.5, null, 0, topY(34, 92) + 4.8);
  addLabel('Checkpoint Charlie', 34, topY(34, 92) + 10, 92);

  for (let i = 0; i < 30; i += 1) {
    addStaticPerson(addTop, 24 + (rng() - 0.5) * 40, 52 + (rng() - 0.5) * 28, i % 4 === 0 ? 'shadow' : 'crowd');
  }
}

function buildEastSideAndClubs({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', 134, 84, 90, 18, { color: '#716b64', height: 0.13, tile: 3.4 });
  for (let i = 0; i < 24; i += 1) {
    const x = 92 + i * 3.8;
    const z = 80 + Math.sin(i * 0.7) * 1.8;
    addTop('concrete', x, z, 3.2, 4.4, 0.7);
    addTop(i % 3 === 0 ? 'graffiti' : i % 3 === 1 ? 'neonPink' : 'neonCyan', x, z - 0.45, 2.7, 1.4, 0.4, null, 0, topY(x, z) + 1.4);
  }
  addLabel('East Side Gallery', 134, topY(134, 84) + 8, 84);

  buildClub(addTop, addTiledRect, addLabel, rng, {
    name: 'Berghain-inspired power station',
    x: 108,
    z: 118,
    width: 34,
    depth: 24,
    height: 23,
    facade: 'concrete',
    sign: 'neonPurple'
  });
  buildClub(addTop, addTiledRect, addLabel, rng, {
    name: 'Tresor vault club',
    x: 70,
    z: 104,
    width: 28,
    depth: 20,
    height: 15,
    facade: 'brick',
    sign: 'neonCyan'
  });
  buildClub(addTop, addTiledRect, addLabel, rng, {
    name: 'Sisyphos warehouse yards',
    x: 146,
    z: 118,
    width: 36,
    depth: 22,
    height: 13,
    facade: 'brick',
    sign: 'neonPink'
  });
  buildClub(addTop, addTiledRect, addLabel, rng, {
    name: 'Watergate riverside club',
    x: 152,
    z: 54,
    width: 30,
    depth: 18,
    height: 12,
    facade: 'glass',
    sign: 'neonCyan'
  });

  addTiledRect('asphalt', 100, 138, 72, 24, { color: '#303235', height: 0.11, tile: 3.5 });
  for (let i = 0; i < 14; i += 1) {
    addTop('wood', 70 + i * 4.8, 138 + (i % 2) * 3.5, 3.4, 1.0, 2.5);
    addTop(i % 2 ? 'neon' : 'neonPink', 70 + i * 4.8, 136.6 + (i % 2) * 3.5, 3.2, 0.35, 0.28, null, 0, topY(70 + i * 4.8, 138) + 1.0);
  }
  addLabel('Berlin Nightlife Yards', 112, topY(112, 118) + 30, 118);
}

function buildClub(addTop, addTiledRect, addLabel, rng, { name, x, z, width, depth, height, facade, sign }) {
  const base = topY(x, z);
  addTiledRect('asphalt', x, z, width + 18, depth + 18, { color: '#303236', height: 0.11, tile: 3.5 });
  addTop(facade, x, z, width, height, depth, null, 0, base);
  addTop('steel', x, z, width + 1.4, 1.3, depth + 1.4, null, 0, base + height);
  addTop(sign, x, z + depth / 2 + 0.5, width * 0.48, 1.0, 0.55, null, 0, base + height * 0.58);
  addTop('shadow', x - width / 2 + 4, z + depth / 2 + 0.6, 4.2, 5.6, 0.5, null, 0, base + 1.0);
  for (let i = 0; i < 9; i += 1) {
    addTop('steel', x - width / 2 - 7 + i * 2.0, z + depth / 2 + 5, 0.25, 2.6, 0.25);
  }
  for (let i = 0; i < 18; i += 1) {
    addStaticPerson(addTop, x - width / 2 - 4 + (i % 4) * 2.8, z + depth / 2 + 7 + Math.floor(i / 4) * 2.2, i < 3 ? 'shadow' : 'crowd');
  }
  for (let i = 0; i < 9; i += 1) {
    addStaticPerson(addTop, x + (rng() - 0.5) * (width + 16), z - depth / 2 - 6 + (rng() - 0.5) * 8, i % 3 === 0 ? 'shadow' : 'crowd');
  }
  addLabel(name, x, base + height + 7, z);
}

function buildTempelhof({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('berlinGrass', -18, 164, 118, 62, { color: '#607a4e', height: 0.12, tile: 4 });
  addTop('concrete', -18, 164, 96, 0.14, 5.2, null, 0.05);
  addTop('concrete', -18, 150, 70, 0.12, 3.2, null, -0.04);
  for (let i = 0; i < 34; i += 1) {
    addTop('vegetation', -72 + rng() * 108, 136 + rng() * 56, 1.6 + rng(), 3.8 + rng() * 2.4, 1.6 + rng());
  }
  addLabel('Tempelhof Field', -18, topY(-18, 164) + 7, 164);
}

function buildUrbanBlocks({ planner, batch, addTop, rng }) {
  let placed = 0;
  const xs = [-164, -138, -112, -86, -60, -34, -8, 18, 44, 70, 96, 122, 148, 174];
  const zs = [-150, -122, -94, -66, -38, -10, 18, 46, 74, 102, 130, 158];

  for (const x of xs) {
    for (const z of zs) {
      const width = 12 + Math.floor(rng() * 5) * 2;
      const depth = 10 + Math.floor(rng() * 5) * 2;
      if (!planner.reserveRect(`berlin-block-${placed}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
      buildBerlinBuilding(batch, addTop, x, z, width, depth, rng);
      placed += 1;
    }
  }

  for (let i = 0; i < 52; i += 1) {
    const x = -170 + rng() * 350;
    const z = -150 + rng() * 300;
    const width = 10 + Math.floor(rng() * 5) * 2;
    const depth = 10 + Math.floor(rng() * 5) * 2;
    if (!planner.reserveRect(`berlin-fill-${i}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
    buildBerlinBuilding(batch, addTop, x, z, width, depth, rng);
    placed += 1;
  }

  return placed;
}

function buildBerlinBuilding(batch, addTop, x, z, width, depth, rng) {
  const base = topY(x, z);
  const civic = x > -8 && x < 92 && z < 16;
  const industrial = z > 82 || x > 110;
  const modern = x < -26 && z > 42 ? rng() > 0.55 : rng() > 0.75;
  const ddr = !modern && !civic && rng() > 0.58;
  const material = modern ? 'glass' : industrial ? (rng() > 0.46 ? 'brick' : 'concrete') : ddr ? 'concrete' : rng() > 0.5 ? 'limestone' : 'brick';
  const height = modern ? 18 + rng() * 32 : industrial ? 8 + rng() * 12 : ddr ? 13 + rng() * 12 : 9 + rng() * 10;
  addTop(material, x, z, width, height, depth, null, 0, base);
  addTop(modern || ddr ? 'steel' : 'slate', x, z, width + 1.2, 1.3, depth + 1.2, null, 0, base + height);

  for (let i = -Math.floor(width / 5); i <= Math.floor(width / 5); i += 1) {
    const wx = x + i * 4.2;
    batch.addTop('shadow', wx, base + 3.2, z + depth / 2 + 0.15, 1.2, 1.7, 0.26);
    if (height > 12) batch.addTop('shadow', wx, base + 7.0, z + depth / 2 + 0.15, 1.2, 1.7, 0.26);
    if (height > 19) batch.addTop('shadow', wx, base + 10.8, z + depth / 2 + 0.15, 1.2, 1.7, 0.26);
  }

  if (industrial && rng() > 0.42) {
    addTop('graffiti', x, z + depth / 2 + 0.45, width * 0.72, 2.1, 0.42, null, 0, base + 1.8);
  }
  if (rng() > 0.78) {
    addTop('wood', x, z + depth / 2 + 1.2, width * 0.62, 0.85, 1.1, null, 0, base + 2.6);
    addTop(rng() > 0.5 ? 'neonCyan' : 'neonPink', x, z + depth / 2 + 1.84, width * 0.48, 0.38, 0.32, null, 0, base + 3.25);
  }
}

function buildStreetDetails({ planner, addTop, rng }) {
  const roads = planner.reservations.filter((item) => item.type === 'road');
  for (let i = 0; i < 150; i += 1) {
    const road = roads[i % roads.length];
    const x = road.x1 + rng() * (road.x2 - road.x1);
    const z = road.z1 + rng() * (road.z2 - road.z1);
    if (isRiver(x, z, 2)) continue;
    if (i % 5 === 0) {
      addTop('vegetation', x, z, 1.6, 4.2, 1.6);
    } else if (i % 9 === 0) {
      addTop('steel', x, z, 3.2, 1.0, 2.3);
      addTop('neon', x, z - 1.3, 3.4, 0.32, 0.28, null, 0, topY(x, z) + 1.0);
    } else if (i % 13 === 0) {
      addTop('steel', x, z, 2.4, 1.1, 3.2);
      addTop('neonCyan', x, z + 1.7, 1.4, 1.0, 0.28, null, 0, topY(x, z) + 1.1);
    } else {
      addTop('gold', x, z, 0.34, 3.2, 0.34);
      addTop('gold', x + 0.45, z, 0.86, 0.38, 0.38, null, 0, topY(x, z) + 3.2);
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
      speed: 2.8 + rng() * 4.2,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 1 + rng() * 0.25
    });
  }

  const group = new THREE.Group();
  group.name = 'berlin-street-crowds';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'berlin-pedestrian-body', 0x39465a),
    head: makeInstancedPart(pedestrians.length, 'berlin-pedestrian-head', 0xd09a6d),
    hair: makeInstancedPart(pedestrians.length, 'berlin-pedestrian-hair', 0x332922),
    leftLeg: makeInstancedPart(pedestrians.length, 'berlin-pedestrian-left-leg', 0x252b33),
    rightLeg: makeInstancedPart(pedestrians.length, 'berlin-pedestrian-right-leg', 0x252b33),
    leftArm: makeInstancedPart(pedestrians.length, 'berlin-pedestrian-left-arm', 0xd09a6d),
    rightArm: makeInstancedPart(pedestrians.length, 'berlin-pedestrian-right-arm', 0xd09a6d)
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

function buildCyclists({ animated, rng }) {
  const routes = createCyclistRoutes();
  const cyclists = [];
  for (let i = 0; i < CYCLIST_COUNT; i += 1) {
    const route = routes[i % routes.length];
    cyclists.push({
      route,
      distance: rng() * route.length,
      speed: 8 + rng() * 4.5,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2
    });
  }

  const group = new THREE.Group();
  group.name = 'berlin-cyclists';
  const parts = {
    body: makeInstancedPart(cyclists.length, 'berlin-cyclist-body', 0x2f6d79),
    head: makeInstancedPart(cyclists.length, 'berlin-cyclist-head', 0xd09a6d),
    wheelA: makeInstancedPart(cyclists.length, 'berlin-cyclist-front-wheel', 0x202326),
    wheelB: makeInstancedPart(cyclists.length, 'berlin-cyclist-rear-wheel', 0x202326),
    frame: makeInstancedPart(cyclists.length, 'berlin-cyclist-frame', 0xc9a34f)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateCyclists(parts, cyclists, elapsed);
    }
  });
  updateCyclists(parts, cyclists, 0);
  return cyclists.length;
}

function buildTaxis({ animated, rng }) {
  const routes = createVehicleRoutes();
  const taxis = [];
  for (let i = 0; i < TAXI_COUNT; i += 1) {
    const route = routes[i % routes.length];
    taxis.push({ route, distance: rng() * route.length, speed: 7.5 + rng() * 4.2, lane: (rng() - 0.5) * route.width });
  }

  const group = new THREE.Group();
  group.name = 'berlin-taxis';
  const parts = {
    body: makeInstancedPart(taxis.length, 'berlin-taxi-body', 0xe0d0a2),
    upper: makeInstancedPart(taxis.length, 'berlin-taxi-upper', 0xd4c394),
    window: makeInstancedPart(taxis.length, 'berlin-taxi-windows', 0x4e6b76),
    sign: makeInstancedPart(taxis.length, 'berlin-taxi-signs', 0xf0c84b),
    wheelA: makeInstancedPart(taxis.length, 'berlin-taxi-front-wheels', 0x17191c),
    wheelB: makeInstancedPart(taxis.length, 'berlin-taxi-rear-wheels', 0x17191c)
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
    { width: 5.8, loop: false, points: [[-118, -14], [-52, -10], [0, 4], [62, -4], [124, -12], [150, -4]] },
    { width: 5.4, loop: false, points: [[-34, -48], [-16, -24], [0, 10], [30, 52], [34, 92], [74, 104], [112, 118]] },
    { width: 5.0, loop: false, points: [[-48, 62], [-18, 62], [30, 52], [70, 44], [112, 34], [150, 70]] },
    { width: 5.0, loop: false, points: [[60, -20], [82, -18], [118, -8], [138, -20], [152, 54], [146, 118]] },
    { width: 5.0, loop: true, points: [[-28, 0], [28, 0], [28, 28], [-28, 28]] },
    { width: 5.2, loop: true, points: [[82, 88], [148, 88], [148, 134], [76, 134]] },
    { width: 5.0, loop: true, ellipse: { x: 124, z: -12, rx: 28, rz: 20, segments: 36 } },
    { width: 5.0, loop: true, ellipse: { x: 0, z: 12, rx: 32, rz: 18, segments: 36 } }
  ].map((definition) => {
    const points = definition.ellipse
      ? makeEllipsePoints(definition.ellipse)
      : definition.points.map(([x, z]) => ({ x, z }));
    return prepareRoute({ ...definition, points });
  });
}

function createCyclistRoutes() {
  return [
    { width: 4.5, loop: true, points: [[-132, -18], [-40, -12], [34, -4], [124, -8], [154, 70], [108, 112], [30, 92], [-48, 62]] },
    { width: 4.0, loop: true, points: [[-20, -52], [64, -42], [118, -8], [154, 54], [126, 100], [34, 92], [30, 20]] },
    { width: 4.0, loop: true, points: [[-82, 18], [-18, 28], [30, 52], [74, 104], [112, 138], [0, 164]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createVehicleRoutes() {
  return [
    { width: 4.0, loop: true, points: [[-140, -12], [-64, -12], [0, -4], [62, -4], [126, -2], [150, 70], [112, 100], [34, 92], [-48, 62], [-88, 18]] },
    { width: 4.0, loop: true, points: [[-50, 82], [-48, 62], [-18, 62], [30, 52], [30, -36], [64, -42], [118, -8], [138, 34]] },
    { width: 4.2, loop: true, points: [[-18, 130], [34, 92], [74, 104], [112, 118], [150, 70], [124, -12], [62, -4], [0, 4]] }
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

function updateCyclists(parts, cyclists, elapsed) {
  cyclists.forEach((cyclist, index) => {
    const sample = sampleRoute(cyclist.route, cyclist.distance + elapsed * cyclist.speed);
    const x = sample.x - sample.tangentZ * cyclist.lane;
    const z = sample.z + sample.tangentX * cyclist.lane;
    const y = topY(x, z) + 0.08;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const pedal = Math.sin(elapsed * 12 + cyclist.phase) * 0.18;

    setPart(parts.body, index, x, y, z, yaw, 0, 1.38, 0, 0.58, 0.8, 0.42);
    setPart(parts.head, index, x, y, z, yaw, 0, 2.02, 0.05, 0.4, 0.4, 0.4);
    setPart(parts.wheelA, index, x, y, z, yaw, 0, 0.36, 1.15, 0.22, 0.72, 0.72);
    setPart(parts.wheelB, index, x, y, z, yaw, 0, 0.36, -1.15, 0.22, 0.72, 0.72);
    setPart(parts.frame, index, x, y, z, yaw, 0, 0.78 + pedal * 0.1, 0, 0.16, 0.16, 2.0);
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

    setPart(parts.body, index, x, y, z, yaw, 0, 0.72, 0, 2.25, 0.82, 3.9);
    setPart(parts.upper, index, x, y, z, yaw, 0, 1.22, -0.18, 1.35, 0.52, 1.65);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.25, -0.02, 2.16, 0.38, 2.0);
    setPart(parts.sign, index, x, y, z, yaw, 0, 1.72, -0.18, 0.72, 0.22, 0.36);
    setPart(parts.wheelA, index, x, y, z, yaw, 0, 0.34, 1.18, 2.34, 0.32, 0.42);
    setPart(parts.wheelB, index, x, y, z, yaw, 0, 0.34, -1.18, 2.34, 0.32, 0.42);
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
