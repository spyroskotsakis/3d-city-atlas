import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 204;
const TERRAIN_CELL = 4;
const TILE = 3.6;
const PEDESTRIAN_COUNT = 180;
const CYCLIST_COUNT = 28;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'munichTerrain',
  'munichGrass',
  'water',
  'cobblestone',
  'limestone',
  'stucco',
  'terracotta',
  'copper',
  'gold',
  'vegetation',
  'wood',
  'shadow',
  'iron',
  'brick',
  'slate',
  'cloth',
  'marble',
  'crowd',
  'skin'
];

const LANDMARKS = [
  ['Neues Rathaus', 0, -18, 86, 28],
  ['Marienplatz', 0, 8, 66, 44],
  ['Frauenkirche', -42, -26, 42, 34],
  ['St. Peter', 24, 18, 30, 26],
  ['Viktualienmarkt', 34, 52, 52, 38],
  ['Odeonsplatz', -8, -88, 54, 36],
  ['Theatinerkirche', -26, -112, 36, 30],
  ['Residenz', 34, -86, 66, 42],
  ['Hofgarten', 52, -132, 58, 46],
  ['Karlsplatz', -100, -4, 54, 38],
  ['Sendlinger Tor', -70, 76, 34, 30],
  ['Isartor', 76, 32, 34, 28],
  ['Deutsches Museum', 120, 70, 50, 42],
  ['English Garden', 96, -162, 82, 58]
];

function createRng(seed = 0x4d554e49) {
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
  tempColor.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + amount * 0.1)), Math.max(0, Math.min(1, hsl.l + amount)));
  return tempColor.getHex();
}

function isarCenterX(z) {
  return 112 + Math.sin((z - 20) * 0.034) * 8 + Math.sin(z * 0.077 + 1.2) * 3;
}

function isarWidthAt(z) {
  return 22 + Math.sin(z * 0.045) * 4;
}

function isRiver(x, z, pad = 0) {
  const museumIsland =
    x > 104 &&
    x < 136 &&
    z > 46 &&
    z < 92 &&
    Math.abs(x - isarCenterX(z)) < 17;
  if (museumIsland) return false;
  return Math.abs(x - isarCenterX(z)) <= isarWidthAt(z) / 2 + pad;
}

function terrainHeightAt(x, z) {
  const riverCut = Math.exp(-((x - isarCenterX(z)) ** 2) / 420) * 0.85;
  const oldTownRise = Math.exp(-((x / 90) ** 2 + (z / 78) ** 2)) * 1.6;
  const englishGardenSoftness = Math.exp(-(((x - 96) / 72) ** 2 + ((z + 158) / 64) ** 2)) * 0.7;
  const bankRise = Math.exp(-(((x - 84) / 52) ** 2 + ((z - 40) / 80) ** 2)) * 0.8;
  return Math.max(
    0.5,
    1.05 + oldTownRise + bankRise - riverCut - englishGardenSoftness + Math.sin(x * 0.027 + z * 0.021) * 0.18
  );
}

export function munichTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

export function createMunichScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Munich voxel material: ${key}`);
  }

  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 10, isRiver });
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
    const sy = options.height ?? 0.16;
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
        const shade = Math.sin(wx * 0.16 + wz * 0.13) * 0.024 + Math.cos(lz * 0.38) * 0.012;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, topY(wx, wz) + baseOffset);
      }
    }
  };

  const reserveRoad = (tag, x, z, width, depth, yaw = 0) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
    addTiledRect('cobblestone', x, z, width, depth, { color: '#777065', height: 0.12, tile: 3.6, yaw, baseOffset: 0.02 });
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildIsar({ batch, addTop, addTiledRect, addLabel });
  buildStreets({ reserveRoad, addTiledRect, addTop });
  buildMarienplatz({ batch, addTop, addTiledRect, addLabel, rng });
  buildFrauenkirche({ addTop, addTiledRect, addLabel });
  buildStPeter({ addTop, addTiledRect, addLabel });
  buildViktualienmarkt({ addTop, addTiledRect, addLabel, rng });
  buildOdeonsplatz({ batch, addTop, addTiledRect, addLabel });
  buildResidenzAndHofgarten({ batch, addTop, addTiledRect, addLabel });
  buildKarlsplatz({ addTop, addTiledRect, addLabel });
  buildCityGates({ addTop, addTiledRect, addLabel });
  buildDeutschesMuseum({ addTop, addTiledRect, addLabel });
  buildEnglishGarden({ addTop, addTiledRect, addLabel, rng });
  const blocks = buildOldTownBlocks({ planner, batch, addTop, rng });
  buildStreetDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const cyclists = buildCyclists({ animated, rng });
  const trams = buildTrams({ animated });

  const { group, total } = batch.build();
  group.name = 'procedural-munich-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      marienplatz: new THREE.Vector3(0, 18, 8),
      rathaus: new THREE.Vector3(0, 24, -18),
      isar: new THREE.Vector3(112, 9, 34),
      englishGarden: new THREE.Vector3(96, 10, -162),
      aerial: new THREE.Vector3(0, 8, 0)
    },
    metrics: {
      instances: total,
      pedestrians,
      cyclists,
      trams,
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
    ['Ludwigsbrucke', 105, 50, 42, 16],
    ['Maximiliansbrucke', 108, 18, 42, 16],
    ['Praterinsel Bridge', 112, -18, 42, 14],
    ['English Garden Bridge', 104, -118, 38, 14]
  ].forEach(([tag, x, z, width, depth]) => planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'bridge' }));
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isRiver(x, z, 0.4)) {
        batch.add('water', x, 0.3, z, TERRAIN_CELL * 1.08, 0.24, TERRAIN_CELL * 1.08, vary('#5497aa', Math.sin(z * 0.09) * 0.03));
        continue;
      }

      const h = terrainHeightAt(x, z);
      const park =
        (x > 52 && x < 144 && z < -116) ||
        (x > 20 && x < 84 && z < -146) ||
        (x > 18 && x < 86 && z < -108 && z > -156);
      const bank = Math.abs(x - isarCenterX(z)) < isarWidthAt(z) / 2 + 11;
      const material = park || bank ? 'munichGrass' : 'munichTerrain';
      batch.add(material, x, h / 2 - 0.04, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04, null);
    }
  }
}

function buildIsar({ batch, addTop, addTiledRect, addLabel }) {
  for (let z = -184; z <= 150; z += 12) {
    const x = isarCenterX(z);
    addTop('cobblestone', x - isarWidthAt(z) / 2 - 5, z, 3.4, 0.12, 10, vary('#756c62', 0.01));
    addTop('cobblestone', x + isarWidthAt(z) / 2 + 5, z, 3.4, 0.12, 10, vary('#756c62', -0.01));
    if (z % 24 === 0) {
      addTop('vegetation', x - 20, z, 2, 5, 2, 0x617b44);
      addTop('vegetation', x + 20, z, 2, 5, 2, 0x617b44);
    }
  }

  [
    [105, 50, 'Ludwigsbrucke'],
    [108, 18, 'Maximiliansbrucke'],
    [112, -18, 'Praterinsel Bridge'],
    [104, -118, 'English Garden Bridge']
  ].forEach(([x, z, name]) => {
    addTiledRect('cobblestone', x, z, 46, 12, { color: '#7a7165', height: 0.18, tile: 3.4 });
    batch.addTop('limestone', x, topY(x, z) + 0.4, z - 6.2, 47, 1.0, 0.7);
    batch.addTop('limestone', x, topY(x, z) + 0.4, z + 6.2, 47, 1.0, 0.7);
    addLabel(name, x, topY(x, z) + 4.5, z);
  });

  addLabel('Isar River', 122, 5, 116);
}

function buildStreets({ reserveRoad, addTiledRect, addTop }) {
  reserveRoad('Neuhauser Strasse', -55, 0, 88, 9, 0);
  reserveRoad('Kaufingerstrasse', -8, 0, 88, 9, 0);
  reserveRoad('Maximilianstrasse', 58, 12, 116, 9, -0.04);
  reserveRoad('Ludwigstrasse', -8, -92, 10, 116, 0);
  reserveRoad('Sendlinger Strasse', -42, 46, 84, 8, -0.62);
  reserveRoad('Tal to Isartor', 48, 32, 80, 8, 0.05);
  reserveRoad('Riverfront north path', 90, -92, 8, 112, 0);
  reserveRoad('Riverfront south path', 92, 72, 8, 86, 0);
  reserveRoad('Altstadt ring west', -84, 32, 8, 116, 0);
  reserveRoad('Altstadt ring north', -30, -64, 116, 8, 0);

  for (const railZ of [-1.6, 1.6]) {
    addTop('iron', -50, railZ, 84, 0.14, 0.22, 0x343536);
    addTop('iron', 26, railZ + 8, 94, 0.14, 0.22, 0x343536);
  }
  for (const railX of [-9.6, -6.4]) {
    addTop('iron', railX, -78, 0.22, 0.12, 96, 0x343536);
  }

  addTiledRect('munichGrass', 58, -132, 52, 34, { color: '#6d864f', height: 0.14, tile: 3.6 });
  addTiledRect('munichGrass', 92, -162, 74, 48, { color: '#6b8952', height: 0.14, tile: 3.8 });
}

function buildMarienplatz({ batch, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', 0, 8, 72, 48, { color: '#81786c', height: 0.16, tile: 3.2 });
  addTop('gold', 0, 16, 1.1, 11, 1.1);
  addTop('copper', 0, 16, 4.4, 1.1, 4.4, 0x7aaa6d, 0, topY(0, 16) + 11);
  addTop('marble', 0, 16, 8, 0.5, 8, null, 0, topY(0, 16) + 0.15);
  addLabel('Marienplatz', 0, topY(0, 8) + 5, 8);

  buildNeuesRathaus({ batch, addTop, addLabel, rng });
}

function buildNeuesRathaus({ batch, addTop, addLabel, rng }) {
  const x = 0;
  const z = -20;
  const base = topY(x, z);

  addTop('shadow', x, z + 1, 88, 0.28, 31, 0x25211c, 0, base - 0.02);
  addTop('limestone', x, z, 82, 11, 15, vary('#d8c8a4', 0.02), 0, base);
  addTop('limestone', x, z - 6.2, 86, 5.6, 4.6, vary('#cfbea0', 0.02), 0, base + 10.6);
  addTop('terracotta', x, z - 4, 86, 3.6, 18, 0xb85a34, 0, base + 16);

  for (let bay = -5; bay <= 5; bay += 1) {
    const bx = x + bay * 7.3;
    addTop('shadow', bx, z + 8.1, 3.3, 4.8, 0.36, 0x332d25, 0, base + 2.5);
    addTop('shadow', bx, z - 8.2, 2.5, 3.7, 0.34, 0x332d25, 0, base + 8);
    addTop('limestone', bx, z + 8.6, 0.62, 12, 0.62, vary('#efe1bd', rng() * 0.02), 0, base + 1.2);
    if (bay % 2 === 0) addTop('gold', bx, z + 8.9, 0.7, 0.9, 0.7, 0xd7b253, 0, base + 11.6);
  }

  addTop('limestone', x, z + 2, 17, 38, 17, vary('#d8c8a4', 0.02), 0, base);
  addTop('shadow', x, z + 10.8, 7, 7, 0.42, 0x2b2824, 0, base + 18);
  addTop('gold', x, z + 11.2, 5.4, 5.4, 0.4, 0xe6c663, 0, base + 25.5);
  addTop('limestone', x, z + 2, 11, 12, 11, vary('#d8c8a4', -0.01), 0, base + 38);
  addTop('terracotta', x, z + 2, 13, 4.2, 13, 0xb95836, 0, base + 50);
  addTop('copper', x, z + 2, 6, 9, 6, 0x79a66b, 0, base + 54);
  addTop('gold', x, z + 2, 1.0, 4.8, 1.0, 0xe6c663, 0, base + 65);

  for (const sx of [-1, 1]) {
    for (const ox of [-38, -25, 25, 38]) {
      addTop('limestone', x + ox, z - 5.5, 5.4, 17, 5.4, vary('#d3c3a4', 0.01), 0, base + 1);
      addTop('copper', x + ox, z - 5.5, 5.8, 5, 5.8, 0x78a66b, 0, base + 18);
      addTop('gold', x + ox, z - 5.5, 0.7, 2.6, 0.7, 0xe4c45b, 0, base + 24);
    }
    for (let level = 0; level < 5; level += 1) {
      addTop('limestone', x + sx * (11 + level * 4.8), z + 9.6, 0.52, 7.8 - level * 0.6, 0.52, null, 0, base + 14 + level * 4.5);
    }
  }

  for (let i = 0; i < 42; i += 1) {
    const px = x + (rng() - 0.5) * 54;
    const pz = 4 + (rng() - 0.5) * 26;
    addTop('crowd', px, pz, 0.58, 1.08, 0.58, null);
    addTop('skin', px, pz, 0.38, 0.38, 0.38, null, 0, topY(px, pz) + 1.04);
  }

  addLabel('Neues Rathaus', x, base + 72, z + 2);
}

function buildFrauenkirche({ addTop, addTiledRect, addLabel }) {
  const x = -42;
  const z = -26;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 46, 38, { color: '#786f65', height: 0.12, tile: 3.4 });
  addTop('brick', x, z, 34, 12, 16, 0x9f583d, 0, base);
  addTop('terracotta', x, z, 37, 4, 18, 0xbb5e36, 0, base + 12);
  for (const sx of [-1, 1]) {
    addTop('limestone', x + sx * 18, z - 8, 7, 31, 7, null, 0, base);
    addTop('copper', x + sx * 18, z - 8, 8, 7, 8, 0x78a66b, 0, base + 31);
    addTop('gold', x + sx * 18, z - 8, 0.7, 3.8, 0.7, 0xe6c663, 0, base + 39);
  }
  addLabel('Frauenkirche', x, base + 44, z - 8);
}

function buildStPeter({ addTop, addTiledRect, addLabel }) {
  const x = 24;
  const z = 18;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 34, 30, { color: '#786f65', height: 0.12, tile: 3.4 });
  addTop('limestone', x, z, 23, 8, 13, null, 0, base);
  addTop('terracotta', x, z, 25, 3.4, 15, 0xb95836, 0, base + 8);
  addTop('limestone', x + 12, z - 5, 7, 28, 7, null, 0, base);
  addTop('copper', x + 12, z - 5, 7.5, 6, 7.5, 0x78a66b, 0, base + 28);
  addTop('gold', x + 12, z - 5, 0.7, 5, 0.7, 0xe6c663, 0, base + 36);
  addLabel("St. Peter's Church", x + 10, base + 42, z - 5);
}

function buildViktualienmarkt({ addTop, addTiledRect, addLabel, rng }) {
  const x = 34;
  const z = 52;
  addTiledRect('cobblestone', x, z, 58, 42, { color: '#756f65', height: 0.12, tile: 3.4 });
  for (let i = 0; i < 26; i += 1) {
    const px = x - 24 + (i % 7) * 8;
    const pz = z - 16 + Math.floor(i / 7) * 10;
    addTop('wood', px, pz, 4.8, 1.2, 3.2, null);
    addTop(i % 3 === 0 ? 'cloth' : 'terracotta', px, pz, 5.6, 0.7, 4.0, i % 3 === 0 ? 0xf0dfb2 : 0xb85a34, 0, topY(px, pz) + 1.25);
    if (rng() > 0.42) addTop('vegetation', px + 2.2, pz + 1.7, 1.4, 2.4, 1.4);
  }
  addTop('gold', x, z, 1.2, 9, 1.2);
  addTop('copper', x, z, 5.4, 1.2, 5.4, 0x78a66b, 0, topY(x, z) + 9);
  addLabel('Viktualienmarkt', x, topY(x, z) + 13, z);
}

function buildOdeonsplatz({ batch, addTop, addTiledRect, addLabel }) {
  addTiledRect('cobblestone', -8, -88, 58, 42, { color: '#80776a', height: 0.14, tile: 3.4 });
  buildTheatinerkirche({ addTop, addLabel });
  buildFeldherrnhalle({ batch, addTop, addLabel });
  addLabel('Odeonsplatz', -8, topY(-8, -88) + 5.5, -88);
}

function buildTheatinerkirche({ addTop, addLabel }) {
  const x = -26;
  const z = -112;
  const base = topY(x, z);
  addTop('gold', x, z, 25, 12, 16, 0xd8b158, 0, base);
  addTop('terracotta', x, z, 28, 3.2, 18, 0xbb5e36, 0, base + 12);
  for (const sx of [-1, 1]) {
    addTop('gold', x + sx * 13, z + 5, 6, 23, 6, 0xd8b158, 0, base);
    addTop('copper', x + sx * 13, z + 5, 6.8, 5.4, 6.8, 0x78a66b, 0, base + 23);
    addTop('gold', x + sx * 13, z + 5, 0.7, 3, 0.7, 0xe6c663, 0, base + 30);
  }
  addLabel('Theatinerkirche', x, base + 34, z + 4);
}

function buildFeldherrnhalle({ batch, addTop, addLabel }) {
  const x = -2;
  const z = -72;
  const base = topY(x, z);
  addTop('limestone', x, z, 32, 4, 9, null, 0, base);
  for (const ox of [-10, 0, 10]) {
    batch.addTop('limestone', x + ox, base + 3.8, z + 4.6, 3.4, 7.8, 1.1);
    batch.addTop('shadow', x + ox, base + 3.1, z + 5.2, 5.6, 6.4, 0.5);
  }
  addTop('terracotta', x, z, 34, 3, 11, 0xb85a34, 0, base + 11);
  addLabel('Feldherrnhalle', x, base + 16, z);
}

function buildResidenzAndHofgarten({ batch, addTop, addTiledRect, addLabel }) {
  const x = 34;
  const z = -86;
  const base = topY(x, z);
  addTop('limestone', x, z, 64, 12, 30, null, 0, base);
  addTop('terracotta', x, z, 66, 3.5, 32, 0xb85a34, 0, base + 12);
  for (let i = -3; i <= 3; i += 1) {
    addTop('shadow', x + i * 8, z + 15.5, 3.4, 4.5, 0.34, 0x332d25, 0, base + 5);
  }
  addLabel('Munich Residenz', x, base + 19, z);

  addTiledRect('munichGrass', 52, -132, 60, 48, { color: '#6f8d52', height: 0.14, tile: 3.6 });
  for (let i = -3; i <= 3; i += 1) {
    addTop('vegetation', 52 + i * 8, -132, 2.4, 5.2, 2.4);
    addTop('vegetation', 52, -132 + i * 6, 2.4, 5.2, 2.4);
  }
  batch.addTop('copper', 52, topY(52, -132) + 0.5, -132, 8, 1.3, 8);
  addLabel('Hofgarten', 52, topY(52, -132) + 7, -132);
}

function buildKarlsplatz({ addTop, addTiledRect, addLabel }) {
  const x = -100;
  const z = -4;
  addTiledRect('cobblestone', x, z, 58, 42, { color: '#80776b', height: 0.14, tile: 3.5 });
  addTop('water', x, z, 18, 0.26, 18, 0x62a9b9);
  addTop('marble', x, z, 21, 0.48, 21, null, 0, topY(x, z) + 0.06);
  for (const sx of [-1, 1]) {
    addTop('limestone', x + sx * 18, z + 14, 7, 18, 7);
    addTop('terracotta', x + sx * 18, z + 14, 8, 3, 8, 0xb85a34, 0, topY(x + sx * 18, z + 14) + 18);
  }
  addLabel('Karlsplatz/Stachus', x, topY(x, z) + 7, z);
}

function buildCityGates({ addTop, addTiledRect, addLabel }) {
  [
    ['Sendlinger Tor', -70, 76],
    ['Isartor', 76, 32]
  ].forEach(([name, x, z]) => {
    const base = topY(x, z);
    addTiledRect('cobblestone', x, z, 38, 32, { color: '#786f65', height: 0.12, tile: 3.4 });
    addTop('limestone', x, z, 24, 8, 8, null, 0, base);
    addTop('shadow', x, z + 4.2, 8, 6, 0.5, 0x28231e, 0, base + 1.4);
    for (const sx of [-1, 1]) {
      addTop('limestone', x + sx * 14, z, 7, 18, 7, null, 0, base);
      addTop('terracotta', x + sx * 14, z, 8, 3.2, 8, 0xb85a34, 0, base + 18);
    }
    addLabel(name, x, base + 24, z);
  });
}

function buildDeutschesMuseum({ addTop, addTiledRect, addLabel }) {
  const x = 120;
  const z = 70;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 58, 48, { color: '#787166', height: 0.12, tile: 3.4 });
  addTop('limestone', x, z, 44, 13, 30, null, 0, base);
  addTop('slate', x, z, 46, 3.2, 32, 0x62676a, 0, base + 13);
  addTop('copper', x - 17, z - 10, 9, 5.2, 9, 0x78a66b, 0, base + 16);
  addTop('gold', x - 17, z - 10, 0.7, 2.6, 0.7, 0xe6c663, 0, base + 22);
  addLabel('Deutsches Museum', x, base + 24, z);
}

function buildEnglishGarden({ addTop, addTiledRect, addLabel, rng }) {
  const x = 96;
  const z = -162;
  addTiledRect('munichGrass', x, z, 84, 60, { color: '#68874e', height: 0.14, tile: 3.8 });
  for (let i = 0; i < 62; i += 1) {
    const px = x + (rng() - 0.5) * 76;
    const pz = z + (rng() - 0.5) * 52;
    if (isRiver(px, pz, 2)) continue;
    addTop('vegetation', px, pz, 2.2 + rng() * 1.2, 4.2 + rng() * 3, 2.2 + rng() * 1.2);
  }
  addTop('wood', x + 18, z - 4, 13, 1.2, 8);
  addTop('copper', x + 18, z - 4, 14, 3, 9, 0x78a66b, 0, topY(x + 18, z - 4) + 1.2);
  addLabel('English Garden', x, topY(x, z) + 8, z);
}

function buildOldTownBlocks({ planner, batch, addTop, rng }) {
  let placed = 0;
  const xs = [-142, -118, -92, -62, -36, -10, 18, 46, 74];
  const zs = [-146, -118, -92, -58, -34, -8, 22, 50, 78, 106, 132];

  for (const x of xs) {
    for (const z of zs) {
      const width = 14 + Math.floor(rng() * 4) * 2;
      const depth = 12 + Math.floor(rng() * 4) * 2;
      if (!planner.reserveRect(`munich-block-${placed}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
      buildOldTownBuilding(batch, addTop, x, z, width, depth, 2 + Math.floor(rng() * 3), rng);
      placed += 1;
    }
  }

  for (let i = 0; i < 64; i += 1) {
    const x = -150 + rng() * 260;
    const z = -150 + rng() * 290;
    const width = 10 + Math.floor(rng() * 5) * 2;
    const depth = 10 + Math.floor(rng() * 5) * 2;
    if (!planner.reserveRect(`munich-fill-${i}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
    buildOldTownBuilding(batch, addTop, x, z, width, depth, 2 + Math.floor(rng() * 3), rng);
    placed += 1;
  }

  return placed;
}

function buildOldTownBuilding(batch, addTop, x, z, width, depth, floors, rng) {
  const base = topY(x, z);
  const facade = rng() > 0.55 ? 'stucco' : 'limestone';
  const height = floors * 3.3 + 2.4;
  addTop(facade, x, z, width, height, depth, null, 0, base);
  addTop('terracotta', x, z, width + 1.6, 3.1, depth + 1.6, 0xb85a34, 0, base + height);

  for (let i = -Math.floor(width / 5); i <= Math.floor(width / 5); i += 1) {
    const wx = x + i * 4.2;
    batch.addTop('shadow', wx, base + 3.6, z + depth / 2 + 0.15, 1.3, 2, 0.28);
    if (floors > 2) batch.addTop('shadow', wx, base + 7.1, z + depth / 2 + 0.15, 1.3, 2, 0.28);
  }

  if (rng() > 0.76) {
    addTop('wood', x, z + depth / 2 + 1.3, width * 0.7, 0.9, 1.2, null, 0, base + 2.7);
    addTop('gold', x, z + depth / 2 + 1.95, width * 0.54, 0.5, 0.35, 0xd8a334, 0, base + 3.5);
  }
}

function buildStreetDetails({ planner, addTop, rng }) {
  for (let i = 0; i < 120; i += 1) {
    const road = planner.reservations.filter((item) => item.type === 'road')[i % planner.reservations.filter((item) => item.type === 'road').length];
    const x = road.x1 + rng() * (road.x2 - road.x1);
    const z = road.z1 + rng() * (road.z2 - road.z1);
    if (isRiver(x, z, 2)) continue;
    if (i % 4 === 0) {
      addTop('vegetation', x, z, 1.6, 4.8, 1.6);
    } else {
      addTop('gold', x, z, 0.36, 3.4, 0.36, 0xd8a334);
      addTop('gold', x + 0.55, z, 1.0, 0.42, 0.42, 0xe6c663, 0, topY(x, z) + 3.4);
    }
  }

  [
    [-16, 8, 7],
    [36, 48, 5],
    [-100, -4, 10],
    [52, -132, 7]
  ].forEach(([x, z, radius]) => buildFountain(addTop, x, z, radius));
}

function buildFountain(addTop, x, z, radius) {
  addTop('marble', x, z, radius * 2, 0.48, radius * 2, null, 0, topY(x, z) + 0.1);
  addTop('water', x, z, radius * 1.55, 0.26, radius * 1.55, 0x62a9b9, 0, topY(x, z) + 0.58);
  addTop('gold', x, z, 0.72, 3.8, 0.72, 0xd8a334, 0, topY(x, z) + 0.84);
}

function buildPedestrians({ animated, rng }) {
  const routes = createStreetRoutes();
  const pedestrians = [];
  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    pedestrians.push({
      route,
      distance: rng() * route.length,
      speed: 2.8 + rng() * 3.6,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 1 + rng() * 0.28
    });
  }

  const group = new THREE.Group();
  group.name = 'munich-street-crowds';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'munich-pedestrian-body', 0x486b53),
    head: makeInstancedPart(pedestrians.length, 'munich-pedestrian-head', 0xd09a6d),
    hair: makeInstancedPart(pedestrians.length, 'munich-pedestrian-hair', 0x5a4635),
    leftLeg: makeInstancedPart(pedestrians.length, 'munich-pedestrian-left-leg', 0x33404c),
    rightLeg: makeInstancedPart(pedestrians.length, 'munich-pedestrian-right-leg', 0x33404c),
    leftArm: makeInstancedPart(pedestrians.length, 'munich-pedestrian-left-arm', 0xd09a6d),
    rightArm: makeInstancedPart(pedestrians.length, 'munich-pedestrian-right-arm', 0xd09a6d)
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
      speed: 8 + rng() * 4,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2
    });
  }

  const group = new THREE.Group();
  group.name = 'munich-cyclists';
  const parts = {
    body: makeInstancedPart(cyclists.length, 'munich-cyclist-body', 0x2f6d79),
    head: makeInstancedPart(cyclists.length, 'munich-cyclist-head', 0xd09a6d),
    wheelA: makeInstancedPart(cyclists.length, 'munich-cyclist-front-wheel', 0x24282b),
    wheelB: makeInstancedPart(cyclists.length, 'munich-cyclist-rear-wheel', 0x24282b),
    frame: makeInstancedPart(cyclists.length, 'munich-cyclist-frame', 0xd8a334)
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

function buildTrams({ animated }) {
  const trams = [
    { route: prepareRoute({ width: 1, loop: true, points: [{ x: -96, z: -1 }, { x: -16, z: -1 }, { x: 70, z: 8 }, { x: 102, z: 18 }, { x: 70, z: 8 }, { x: -16, z: -1 }] }), distance: 0, speed: 9.5 },
    { route: prepareRoute({ width: 1, loop: true, points: [{ x: -8, z: -132 }, { x: -8, z: -88 }, { x: -8, z: -24 }, { x: -8, z: 8 }, { x: -8, z: -24 }, { x: -8, z: -88 }] }), distance: 42, speed: 7.8 }
  ];

  const group = new THREE.Group();
  group.name = 'munich-trams';
  const parts = {
    body: makeInstancedPart(trams.length, 'munich-tram-body', 0xe6c663),
    roof: makeInstancedPart(trams.length, 'munich-tram-roof', 0x4f6d4a),
    window: makeInstancedPart(trams.length, 'munich-tram-window-band', 0x3e5f64)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateTrams(parts, trams, elapsed);
    }
  });
  updateTrams(parts, trams, 0);
  return trams.length;
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

function createStreetRoutes() {
  return [
    { width: 6.5, loop: false, points: [[-102, 0], [-48, 0], [0, 4], [72, 14], [112, 18]] },
    { width: 5.5, loop: false, points: [[-8, -132], [-8, -88], [-8, -36], [0, 8], [24, 52]] },
    { width: 5.2, loop: false, points: [[-70, 76], [-36, 48], [0, 8], [76, 32], [116, 50]] },
    { width: 5.2, loop: true, points: [[-34, -20], [30, -20], [30, 34], [-34, 34]] },
    { width: 5.4, loop: true, points: [[-30, -100], [40, -100], [58, -132], [0, -138]] },
    { width: 5.0, loop: true, ellipse: { x: 34, z: 52, rx: 30, rz: 20, segments: 36 } },
    { width: 5.0, loop: true, ellipse: { x: -100, z: -4, rx: 28, rz: 20, segments: 36 } }
  ].map((definition) => {
    const points = definition.ellipse
      ? makeEllipsePoints(definition.ellipse)
      : definition.points.map(([x, z]) => ({ x, z }));
    return prepareRoute({ ...definition, points });
  });
}

function createCyclistRoutes() {
  return [
    { width: 4.5, loop: true, points: [[-92, 8], [-8, 8], [76, 22], [92, 70], [34, 94], [-54, 74]] },
    { width: 4.0, loop: true, points: [[82, -150], [94, -102], [92, -32], [94, 70], [126, 92], [134, -70]] },
    { width: 3.8, loop: true, points: [[-8, -130], [-8, -84], [-2, -22], [16, 14], [58, 12], [18, -52]] }
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
    const wheelSpin = Math.sin(elapsed * 12 + cyclist.phase) * 0.04;
    setPart(parts.body, index, x, y, z, yaw, 0, 1.35, 0, 0.55, 0.72, 0.38);
    setPart(parts.head, index, x, y, z, yaw, 0, 1.92, -0.12, 0.34, 0.34, 0.34);
    setPart(parts.frame, index, x, y, z, yaw, 0, 0.82, 0, 1.65, 0.2, 0.18);
    setPart(parts.wheelA, index, x, y, z, yaw, 0, 0.44, 0.78 + wheelSpin, 0.2, 0.82, 0.82);
    setPart(parts.wheelB, index, x, y, z, yaw, 0, 0.44, -0.78 - wheelSpin, 0.2, 0.82, 0.82);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateTrams(parts, trams, elapsed) {
  trams.forEach((tram, index) => {
    const sample = sampleRoute(tram.route, tram.distance + elapsed * tram.speed);
    const x = sample.x;
    const z = sample.z;
    const y = topY(x, z) + 0.1;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 1.35, 0, 4.6, 2.5, 10.5);
    setPart(parts.roof, index, x, y, z, yaw, 0, 2.85, 0, 4.8, 0.5, 10.8);
    setPart(parts.window, index, x, y, z, yaw, 0, 2.0, -0.03, 4.9, 0.72, 8.6);
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
