import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 228;
const TERRAIN_CELL = 4;
const TILE = 3.8;
const PEDESTRIAN_COUNT = 260;
const BOAT_COUNT = 18;
const CART_COUNT = 18;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'angkorTerrain',
  'angkorJungle',
  'riceGreen',
  'laterite',
  'sandstone',
  'moss',
  'water',
  'cobblestone',
  'limestone',
  'wood',
  'cloth',
  'gold',
  'vegetation',
  'shadow',
  'crowd',
  'skin'
];

const LANDMARKS = [
  ['Angkor Wat', 0, 0, 110, 96],
  ['Outer Moat', 0, 0, 170, 134],
  ['West Causeway', -95, 0, 104, 14],
  ['Angkor Thom', -48, -102, 112, 90],
  ['Bayon', -48, -104, 46, 38],
  ['Baphuon', -74, -82, 38, 32],
  ['Terrace of the Elephants', -10, -76, 58, 18],
  ['Ta Prohm', 72, 74, 58, 44],
  ['Preah Khan', -126, -154, 62, 42],
  ['Ta Keo', 104, 4, 46, 38],
  ['Banteay Kdei', 96, 118, 54, 42],
  ['Srah Srang', 136, 136, 70, 34],
  ['East Baray', 142, -92, 114, 42],
  ['West Baray', -154, 14, 96, 44],
  ['Phnom Bakheng', -124, -36, 48, 42],
  ['Banteay Srei', 150, -176, 44, 34],
  ['Stilt Village', -136, 116, 72, 52]
];

const RESERVOIRS = [
  { name: 'West Baray', x: -154, z: 14, width: 96, depth: 44 },
  { name: 'East Baray', x: 142, z: -92, width: 114, depth: 42 },
  { name: 'Srah Srang', x: 136, z: 136, width: 70, depth: 34 }
];

const CANALS = [
  { x: -34, z: -62, width: 8, depth: 180 },
  { x: 42, z: 54, width: 8, depth: 154 },
  { x: 0, z: -138, width: 216, depth: 8 },
  { x: 88, z: 96, width: 124, depth: 7 },
  { x: -110, z: 68, width: 104, depth: 7 }
];

function createRng(seed = 0x414e474b) {
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

function isInsideRect(x, z, rect, pad = 0) {
  return (
    x >= rect.x - rect.width / 2 - pad &&
    x <= rect.x + rect.width / 2 + pad &&
    z >= rect.z - rect.depth / 2 - pad &&
    z <= rect.z + rect.depth / 2 + pad
  );
}

function isAngkorMoat(x, z, pad = 0) {
  const outer = Math.abs(x) <= 86 + pad && Math.abs(z) <= 68 + pad;
  const inner = Math.abs(x) <= 66 - pad && Math.abs(z) <= 49 - pad;
  return outer && !inner;
}

function isReservoir(x, z, pad = 0) {
  return RESERVOIRS.some((rect) => isInsideRect(x, z, rect, pad));
}

function isCanal(x, z, pad = 0) {
  return CANALS.some((rect) => isInsideRect(x, z, rect, pad));
}

function isWater(x, z, pad = 0) {
  return isAngkorMoat(x, z, pad) || isReservoir(x, z, pad) || isCanal(x, z, pad);
}

function isJungle(x, z) {
  const templeClearing = Math.abs(x) < 82 && Math.abs(z) < 70;
  const thomClearing = x > -112 && x < 18 && z > -146 && z < -62;
  const roadClearing = Math.abs(z) < 12 && x > -154 && x < 82;
  return !templeClearing && !thomClearing && !roadClearing;
}

function isRiceField(x, z) {
  return (x < -88 && z > 64) || (x > 92 && z > 92) || (x > 82 && z < -118);
}

function terrainHeightAt(x, z) {
  const phnom = Math.exp(-(((x + 124) / 52) ** 2 + ((z + 36) / 44) ** 2)) * 7.8;
  const sreiRise = Math.exp(-(((x - 150) / 52) ** 2 + ((z + 176) / 44) ** 2)) * 2.8;
  const watPlatform = Math.exp(-((x / 72) ** 2 + (z / 58) ** 2)) * 0.9;
  const waterCut = isWater(x, z, -0.5) ? 0.55 : 0;
  return Math.max(0.54, 1.05 + phnom + sreiRise + watPlatform - waterCut + Math.sin(x * 0.029 + z * 0.021) * 0.11);
}

export function angkorTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function waterY(x, z) {
  return 0.58 + Math.sin(x * 0.039 + z * 0.043) * 0.035;
}

export function createAngkorScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Angkor voxel material: ${key}`);
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
    const baseOffset = options.baseOffset ?? 0.04;
    const yaw = options.yaw ?? 0;
    const skipWater = options.skipWater ?? true;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    for (let lx = -width / 2 + tile / 2; lx <= width / 2 - tile / 2; lx += tile) {
      for (let lz = -depth / 2 + tile / 2; lz <= depth / 2 - tile / 2; lz += tile) {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        if (skipWater && isWater(wx, wz, -0.7)) continue;
        const base = skipWater ? topY(wx, wz) + baseOffset : waterY(wx, wz) + baseOffset;
        const shade = Math.sin(wx * 0.13 + wz * 0.1) * 0.026 + Math.cos(lz * 0.27) * 0.012;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, base);
      }
    }
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildWaterAndCauseways({ addTop, addTiledRect, addLabel, rng });
  buildAngkorWat({ addTop, addTiledRect, addLabel, rng });
  buildAngkorThom({ addTop, addTiledRect, addLabel, rng });
  buildJungleTemples({ addTop, addTiledRect, addLabel, rng });
  buildVillagesAndFields({ planner, batch, addTop, addTiledRect, addLabel, rng });
  buildJungleDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const boats = buildBoats({ animated, rng });
  const carts = buildCarts({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-angkor-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      angkorWat: new THREE.Vector3(0, 42, 0),
      moat: new THREE.Vector3(-92, 9, 0),
      bayon: new THREE.Vector3(-48, 30, -104),
      taProhm: new THREE.Vector3(72, 20, 74),
      baray: new THREE.Vector3(142, 8, -92),
      village: new THREE.Vector3(-136, 10, 116),
      phnomBakheng: new THREE.Vector3(-124, 28, -36),
      aerial: new THREE.Vector3(0, 8, -12)
    },
    metrics: {
      instances: total,
      pedestrians,
      boats,
      carts,
      reservations: planner.reservations.length,
      monuments: LANDMARKS.length
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
    ['Royal Road', -42, -24, 176, 12],
    ['North Processional Road', -72, -128, 120, 10],
    ['East Temple Road', 84, 68, 10, 132],
    ['Village Road', -122, 88, 96, 10]
  ].forEach(([tag, x, z, width, depth]) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
  });
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isWater(x, z, -0.7)) {
        batch.addTop('water', x, waterY(x, z) - 0.18, z, TERRAIN_CELL * 1.04, 0.18, TERRAIN_CELL * 1.04);
        continue;
      }

      const height = terrainHeightAt(x, z);
      const material = isRiceField(x, z) ? 'riceGreen' : isJungle(x, z) ? 'angkorJungle' : 'angkorTerrain';
      batch.add(material, x, height / 2 - 0.04, z, TERRAIN_CELL * 1.02, height, TERRAIN_CELL * 1.02);
    }
  }
}

function buildWaterAndCauseways({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('water', 0, 0, 172, 136, { skipWater: false, tile: 4, height: 0.15, baseOffset: -0.13 });
  addTiledRect('angkorTerrain', 0, 0, 132, 98, { tile: 4, height: 0.18 });
  addTiledRect('sandstone', -95, 0, 108, 12, { skipWater: false, tile: 4, height: 0.24, baseOffset: 0.18 });
  addTiledRect('sandstone', 0, 0, 108, 10, { tile: 4, height: 0.18 });
  addTiledRect('sandstone', 0, -42, 92, 9, { tile: 4, height: 0.17 });
  addTiledRect('sandstone', 0, 42, 92, 9, { tile: 4, height: 0.17 });
  addNagaRail(addTop, -140, 0, 92, 0);
  addNagaRail(addTop, -12, -42, 82, Math.PI / 2);
  addNagaRail(addTop, -12, 42, 82, Math.PI / 2);

  RESERVOIRS.forEach((reservoir) => {
    addTiledRect('water', reservoir.x, reservoir.z, reservoir.width, reservoir.depth, {
      skipWater: false,
      tile: 4,
      height: 0.15,
      baseOffset: -0.13
    });
    addTiledRect('riceGreen', reservoir.x, reservoir.z, reservoir.width + 12, reservoir.depth + 10, { tile: 4, height: 0.12 });
    addLabel(reservoir.name, reservoir.x, topY(reservoir.x, reservoir.z) + 8, reservoir.z);
  });

  CANALS.forEach((canal) => {
    addTiledRect('water', canal.x, canal.z, canal.width, canal.depth, { skipWater: false, tile: 3.6, height: 0.13, baseOffset: -0.13 });
  });

  for (let i = 0; i < 42; i += 1) {
    const x = 88 + rng() * 92;
    const z = 104 + rng() * 52;
    addTop('riceGreen', x, z, 5.2, 0.12, 2.6, null, 0, topY(x, z) + 0.02);
  }
}

function buildAngkorWat({ addTop, addTiledRect, addLabel, rng }) {
  const base = topY(0, 0);
  addTiledRect('sandstone', 0, 0, 88, 68, { tile: 3.6, height: 0.18 });
  buildWallRing(addTop, 0, 0, 90, 70, 4.2, 6.4, 'sandstone');
  buildWallRing(addTop, 0, 0, 58, 44, 3.8, 7.2, 'sandstone');
  buildWallRing(addTop, 0, 0, 34, 28, 3.4, 8.4, 'sandstone');

  addTop('sandstone', 0, 0, 34, 6, 28, null, 0, base + 7.2);
  addTop('sandstone', 0, 0, 22, 6, 18, null, 0, base + 13.0);
  addTop('moss', 0, -16, 30, 0.45, 1.2, null, 0, base + 11.4);
  addTop('moss', 0, 16, 30, 0.45, 1.2, null, 0, base + 11.4);

  [
    [0, 0, 35],
    [-16, -14, 25],
    [16, -14, 25],
    [-16, 14, 25],
    [16, 14, 25]
  ].forEach(([x, z, height]) => buildLotusTower(addTop, x, z, height, 'sandstone'));

  for (let x = -36; x <= 36; x += 8) {
    addTop('shadow', x, -35.2, 2.4, 2.8, 0.42, null, 0, base + 3.4);
    addTop('shadow', x, 35.2, 2.4, 2.8, 0.42, null, 0, base + 3.4);
  }
  for (let z = -26; z <= 26; z += 8) {
    addTop('shadow', -45.2, z, 0.42, 2.8, 2.4, null, 0, base + 3.4);
    addTop('shadow', 45.2, z, 0.42, 2.8, 2.4, null, 0, base + 3.4);
  }

  for (let i = 0; i < 58; i += 1) {
    addStaticPerson(addTop, -46 + rng() * 92, -42 + rng() * 84, i % 6 === 0 ? 'cloth' : 'crowd', 0.9 + rng() * 0.18);
  }
  addLabel('Angkor Wat', 0, base + 58, 0);
}

function buildWallRing(addTop, x, z, width, depth, wall, height, material) {
  const base = topY(x, z);
  addTop(material, x, z - depth / 2, width, height, wall, null, 0, base);
  addTop(material, x, z + depth / 2, width, height, wall, null, 0, base);
  addTop(material, x - width / 2, z, wall, height, depth, null, 0, base);
  addTop(material, x + width / 2, z, wall, height, depth, null, 0, base);
  addTop('laterite', x, z - depth / 2 - 0.4, width * 0.72, 0.5, 0.7, null, 0, base + height * 0.62);
  addTop('laterite', x, z + depth / 2 + 0.4, width * 0.72, 0.5, 0.7, null, 0, base + height * 0.62);
}

function buildLotusTower(addTop, x, z, height, material) {
  const base = topY(x, z);
  const levels = 8;
  for (let i = 0; i < levels; i += 1) {
    const t = i / levels;
    const s = 8.5 * (1 - t * 0.68);
    addTop(material, x, z, s, height / levels, s, null, 0, base + i * (height / levels));
    if (i % 2 === 0) addTop('moss', x, z + s * 0.48, s * 0.55, 0.5, 0.6, null, 0, base + i * (height / levels) + 0.8);
  }
  addTop('gold', x, z, 2.2, 1.9, 2.2, null, 0, base + height);
}

function addNagaRail(addTop, x, z, length, yaw) {
  const dx = Math.cos(yaw);
  const dz = Math.sin(yaw);
  for (let i = 0; i <= length; i += 8) {
    const px = x + dx * i;
    const pz = z + dz * i;
    addTop('sandstone', px, pz - 5, 2.2, 1.0, 1.6, null, yaw);
    addTop('sandstone', px, pz + 5, 2.2, 1.0, 1.6, null, yaw);
  }
  addTop('gold', x + dx * length, z - 5 + dz * length, 3.0, 2.0, 2.4, null, yaw);
  addTop('gold', x + dx * length, z + 5 + dz * length, 3.0, 2.0, 2.4, null, yaw);
}

function buildAngkorThom({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', -48, -104, 116, 92, { tile: 3.8, height: 0.14 });
  buildWallRing(addTop, -48, -104, 112, 88, 4.4, 8.0, 'laterite');
  buildBayon(addTop, -48, -104, addLabel);
  buildSteppedTemple(addTop, -74, -82, 30, 23, 18, 'Baphuon', addLabel);
  addTiledRect('sandstone', -10, -76, 60, 16, { tile: 3.6, height: 0.18 });
  for (let x = -36; x <= 18; x += 7) addElephantStatue(addTop, x, -67);
  addLabel('Terrace of the Elephants', -10, topY(-10, -76) + 12, -76);

  for (let i = 0; i < 32; i += 1) {
    addStaticPerson(addTop, -92 + rng() * 88, -134 + rng() * 66, i % 5 === 0 ? 'cloth' : 'crowd', 0.92 + rng() * 0.16);
  }
  addLabel('Angkor Thom', -48, topY(-48, -104) + 20, -104);
}

function buildBayon(addTop, x, z, addLabel) {
  const base = topY(x, z);
  addTop('laterite', x, z, 32, 8, 28, null, 0, base);
  addTop('sandstone', x, z, 24, 8, 22, null, 0, base + 7);
  buildFaceTower(addTop, x, z, 24);
  for (let dx = -18; dx <= 18; dx += 18) {
    for (let dz = -14; dz <= 14; dz += 14) {
      if (dx === 0 && dz === 0) continue;
      buildFaceTower(addTop, x + dx, z + dz, 14);
    }
  }
  addLabel('Bayon', x, base + 36, z);
}

function buildFaceTower(addTop, x, z, height) {
  const base = topY(x, z);
  addTop('sandstone', x, z, 7.2, height, 7.2, null, 0, base);
  for (const [fx, fz, sx, sz] of [[0, -3.8, 2.8, 0.45], [0, 3.8, 2.8, 0.45], [-3.8, 0, 0.45, 2.8], [3.8, 0, 0.45, 2.8]]) {
    addTop('limestone', x + fx, z + fz, sx, 5.2, sz, null, 0, base + height * 0.42);
    addTop('shadow', x + fx, z + fz, sx * 0.46, 0.6, sz * 0.46, null, 0, base + height * 0.58);
  }
  addTop('moss', x, z, 4.2, 1.4, 4.2, null, 0, base + height);
}

function addElephantStatue(addTop, x, z) {
  const base = topY(x, z);
  addTop('sandstone', x, z, 2.8, 1.6, 1.5, null, 0, base);
  addTop('sandstone', x + 1.4, z, 0.9, 0.9, 0.9, null, 0, base + 0.8);
  addTop('sandstone', x + 2.0, z, 0.35, 1.3, 0.35, null, 0, base - 0.1);
}

function buildJungleTemples({ addTop, addTiledRect, addLabel, rng }) {
  buildOvergrownTemple(addTop, addTiledRect, 72, 74, 52, 40, 'Ta Prohm', addLabel, rng);
  buildOvergrownTemple(addTop, addTiledRect, -126, -154, 60, 40, 'Preah Khan', addLabel, rng);
  buildSteppedTemple(addTop, 104, 4, 38, 32, 26, 'Ta Keo', addLabel);
  buildOvergrownTemple(addTop, addTiledRect, 96, 118, 52, 38, 'Banteay Kdei', addLabel, rng);
  buildSteppedTemple(addTop, -124, -36, 34, 28, 16, 'Phnom Bakheng', addLabel);
  buildOvergrownTemple(addTop, addTiledRect, 150, -176, 40, 30, 'Banteay Srei', addLabel, rng);
}

function buildSteppedTemple(addTop, x, z, width, depth, height, label, addLabel) {
  const base = topY(x, z);
  const levels = 5;
  for (let i = 0; i < levels; i += 1) {
    const t = i / levels;
    addTop(i % 2 ? 'sandstone' : 'laterite', x, z, width * (1 - t * 0.58), height / levels, depth * (1 - t * 0.58), null, 0, base + i * (height / levels));
  }
  buildLotusTower(addTop, x, z, height * 0.75, 'sandstone');
  addLabel(label, x, base + height + 15, z);
}

function buildOvergrownTemple(addTop, addTiledRect, x, z, width, depth, label, addLabel, rng) {
  const base = topY(x, z);
  addTiledRect('moss', x, z, width + 14, depth + 12, { tile: 4, height: 0.12 });
  buildWallRing(addTop, x, z, width, depth, 3.2, 6.2, 'laterite');
  addTop('sandstone', x, z, width * 0.42, 9.2, depth * 0.38, null, 0, base);
  buildLotusTower(addTop, x, z, 15, 'laterite');
  for (let i = 0; i < 10; i += 1) {
    addTop('laterite', x - width / 2 + rng() * width, z - depth / 2 + rng() * depth, 3 + rng() * 4, 1.0 + rng(), 2 + rng() * 3, null, rng() * Math.PI, base + 0.1);
  }
  for (let i = 0; i < 8; i += 1) addRoot(addTop, x - width / 2 + rng() * width, z - depth / 2 + rng() * depth, rng() * Math.PI);
  for (let i = 0; i < 7; i += 1) addJungleTree(addTop, x - width / 2 - 10 + rng() * (width + 20), z - depth / 2 - 10 + rng() * (depth + 20), 0.9 + rng() * 0.5);
  addLabel(label, x, base + 23, z);
}

function addRoot(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.85, 1.1, 12, null, yaw, base + 1.2);
  addTop('wood', x + Math.cos(yaw) * 3.4, z + Math.sin(yaw) * 3.4, 0.65, 0.9, 8, null, yaw + 0.35, base + 2.1);
  addTop('wood', x - Math.cos(yaw) * 3.1, z - Math.sin(yaw) * 3.1, 0.52, 0.8, 7, null, yaw - 0.42, base + 0.5);
}

function buildVillagesAndFields({ planner, batch, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('riceGreen', -136, 116, 76, 56, { tile: 4, height: 0.13 });
  addLabel('Stilt Village', -136, topY(-136, 116) + 12, 116);
  for (let i = 0; i < 26; i += 1) {
    const x = -170 + rng() * 76;
    const z = 90 + rng() * 60;
    if (!planner.canPlaceRect(x, z, 12, 12)) continue;
    buildStiltHouse(batch, x, z, 8 + rng() * 4, 7 + rng() * 4, 4.5 + rng() * 2, rng() * 0.3 - 0.15);
  }
  for (let i = 0; i < 18; i += 1) addMarketStall(addTop, -154 + rng() * 48, 92 + rng() * 48, rng() * 0.4);

  for (let i = 0; i < 64; i += 1) {
    const x = i % 2 ? -190 + rng() * 74 : 92 + rng() * 94;
    const z = i % 2 ? 80 + rng() * 100 : 94 + rng() * 78;
    addTop('riceGreen', x, z, 6.5, 0.12, 3.2, null, 0, topY(x, z) + 0.02);
  }
}

function buildStiltHouse(batch, x, z, width, depth, height, yaw) {
  const base = topY(x, z);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) batch.addTop('wood', x + sx * width * 0.38, base, z + sz * depth * 0.36, 0.45, 3.1, 0.45, null, yaw);
  }
  batch.addTop('wood', x, base + 3.1, z, width, height, depth, null, yaw);
  batch.addTop('vegetation', x, base + 3.1 + height + 0.1, z, width * 1.12, 1.4, depth * 1.12, null, yaw);
  batch.addTop('shadow', x, base + 4.8, z + depth / 2 + 0.15, width * 0.36, height * 0.34, 0.28, null, yaw);
}

function buildJungleDetails({ planner, addTop, rng }) {
  for (let i = 0; i < 260; i += 1) {
    const x = -206 + rng() * 412;
    const z = -206 + rng() * 412;
    if (isWater(x, z, 4) || planner.hasPoint(x, z, 'landmark')) continue;
    if (isJungle(x, z) || rng() > 0.68) addJungleTree(addTop, x, z, 0.65 + rng() * 0.65);
    else if (rng() > 0.6) addStoneMarker(addTop, x, z, rng() * Math.PI);
  }
  for (let i = 0; i < 46; i += 1) {
    const x = -176 + rng() * 340;
    const z = -176 + rng() * 340;
    if (!isWater(x, z, 8)) addGuardian(addTop, x, z, 0.7 + rng() * 0.4);
  }
}

function addJungleTree(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.9 * scale, 6.4 * scale, 0.9 * scale, null, 0, base);
  addTop('vegetation', x, z, 5.2 * scale, 3.4 * scale, 5.2 * scale, null, 0, base + 5.5 * scale);
  addTop('angkorJungle', x + 1.6 * scale, z - 1.2 * scale, 4.4 * scale, 2.5 * scale, 4.4 * scale, null, 0, base + 7.4 * scale);
}

function addStoneMarker(addTop, x, z, yaw) {
  addTop('laterite', x, z, 2.8, 0.9, 2.0, null, yaw);
  addTop('moss', x, z, 1.8, 0.35, 1.3, null, yaw, topY(x, z) + 0.8);
}

function addGuardian(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('sandstone', x, z, 1.4 * scale, 3.6 * scale, 1.2 * scale, null, 0, base);
  addTop('sandstone', x, z, 1.1 * scale, 1.2 * scale, 1.1 * scale, null, 0, base + 3.4 * scale);
  addTop('moss', x, z - 0.35 * scale, 1.2 * scale, 0.35 * scale, 0.25 * scale, null, 0, base + 2.7 * scale);
}

function addMarketStall(addTop, x, z, yaw = 0) {
  const base = topY(x, z);
  addTop('wood', x, z, 4.2, 1.1, 3.2, null, yaw, base);
  addTop('cloth', x, z, 5.0, 0.35, 4.0, null, yaw, base + 1.35);
  addStaticPerson(addTop, x + 3, z, 'crowd', 0.86);
}

function addStaticPerson(addTop, x, z, body = 'crowd', scale = 1) {
  const base = topY(x, z);
  addTop(body, x, z, 0.52 * scale, 1.05 * scale, 0.42 * scale, null, 0, base + 0.02);
  addTop('skin', x, z, 0.36 * scale, 0.36 * scale, 0.36 * scale, null, 0, base + 1.04 * scale);
}

function buildPedestrians({ animated, rng }) {
  const routes = createPedestrianRoutes();
  const pedestrians = [];
  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    pedestrians.push({
      route,
      distance: rng() * route.length,
      speed: 2.1 + rng() * 3.0,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.92 + rng() * 0.22,
      monk: i % 6 === 0
    });
  }

  const group = new THREE.Group();
  group.name = 'angkor-monks-visitors';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'angkor-pedestrian-body', 0xb96038),
    sash: makeInstancedPart(pedestrians.length, 'angkor-pedestrian-sash', 0xf0dfb2),
    head: makeInstancedPart(pedestrians.length, 'angkor-pedestrian-head', 0xc58a61),
    hair: makeInstancedPart(pedestrians.length, 'angkor-pedestrian-hair', 0x2f241f),
    leftLeg: makeInstancedPart(pedestrians.length, 'angkor-pedestrian-left-leg', 0x44362a),
    rightLeg: makeInstancedPart(pedestrians.length, 'angkor-pedestrian-right-leg', 0x44362a),
    leftArm: makeInstancedPart(pedestrians.length, 'angkor-pedestrian-left-arm', 0xc58a61),
    rightArm: makeInstancedPart(pedestrians.length, 'angkor-pedestrian-right-arm', 0xc58a61)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updatePedestrians(parts, pedestrians, elapsed) });
  updatePedestrians(parts, pedestrians, 0);
  return pedestrians.length;
}

function buildBoats({ animated, rng }) {
  const routes = createBoatRoutes();
  const boats = [];
  for (let i = 0; i < BOAT_COUNT; i += 1) {
    const route = routes[i % routes.length];
    boats.push({ route, distance: rng() * route.length, speed: 2.4 + rng() * 2.2, lane: (rng() - 0.5) * route.width, phase: rng() * Math.PI * 2 });
  }
  const group = new THREE.Group();
  group.name = 'angkor-water-traffic';
  const parts = {
    hull: makeInstancedPart(boats.length, 'angkor-boat-hull', 0x7a4d30),
    canopy: makeInstancedPart(boats.length, 'angkor-boat-canopy', 0xd8c29b),
    wake: makeInstancedPart(boats.length, 'angkor-boat-wake', 0xbbe3e5)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateBoats(parts, boats, elapsed) });
  updateBoats(parts, boats, 0);
  return boats.length;
}

function buildCarts({ animated, rng }) {
  const routes = createCartRoutes();
  const carts = [];
  for (let i = 0; i < CART_COUNT; i += 1) {
    const route = routes[i % routes.length];
    carts.push({ route, distance: rng() * route.length, speed: 2.0 + rng() * 1.6, lane: (rng() - 0.5) * route.width });
  }
  const group = new THREE.Group();
  group.name = 'angkor-ox-carts';
  const parts = {
    cart: makeInstancedPart(carts.length, 'angkor-cart-body', 0x7a4d30),
    ox: makeInstancedPart(carts.length, 'angkor-cart-ox', 0x5a4634),
    wheelA: makeInstancedPart(carts.length, 'angkor-cart-wheel-a', 0x2e2924),
    wheelB: makeInstancedPart(carts.length, 'angkor-cart-wheel-b', 0x2e2924)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateCarts(parts, carts, elapsed) });
  updateCarts(parts, carts, 0);
  return carts.length;
}

function createPedestrianRoutes() {
  return [
    { width: 8, loop: true, points: [[-142, 0], [-84, 0], [-42, 0], [0, 0], [42, 0], [66, 30], [0, 42], [-70, 12]] },
    { width: 7, loop: false, points: [[-92, -138], [-48, -104], [-14, -78], [0, -40], [0, 0], [72, 74], [96, 118]] },
    { width: 7, loop: true, points: [[-126, -154], [-48, -104], [-74, -82], [-112, -82]] },
    { width: 6, loop: false, points: [[-136, 116], [-110, 68], [-42, 42], [42, 54], [136, 136]] },
    { width: 6, loop: true, points: [[104, 4], [72, 74], [96, 118], [136, 136], [122, 48]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createBoatRoutes() {
  return [
    { width: 9, loop: true, points: [[-82, -60], [82, -60], [82, 60], [-82, 60]] },
    { width: 8, loop: true, points: [[96, -92], [142, -112], [188, -92], [142, -72]] },
    { width: 7, loop: true, points: [[104, 136], [136, 120], [168, 136], [136, 152]] },
    { width: 6, loop: false, points: [[42, -18], [42, 54], [88, 96], [136, 136]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createCartRoutes() {
  return [
    { width: 6, loop: true, points: [[-154, 92], [-122, 88], [-84, 52], [-42, 0], [42, 0], [84, 64], [70, 118], [-40, 92]] },
    { width: 6, loop: false, points: [[-170, 120], [-136, 116], [-110, 68], [-48, 0], [0, 0], [80, 22]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
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

function setPart(mesh, index, x, y, z, sx, sy, sz, yaw = 0) {
  position.set(x, y, z);
  quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
  scaleVector.set(sx, sy, sz);
  matrix.compose(position, quaternion, scaleVector);
  mesh.setMatrixAt(index, matrix);
}

function updatePedestrians(parts, pedestrians, elapsed) {
  pedestrians.forEach((person, index) => {
    const sample = sampleRoute(person.route, person.distance + elapsed * person.speed);
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const sideX = sample.tangentZ;
    const sideZ = -sample.tangentX;
    const x = sample.x + sideX * person.lane;
    const z = sample.z + sideZ * person.lane;
    const y = topY(x, z);
    const walk = Math.sin(elapsed * 8 + person.phase) * 0.12;
    const s = person.scale;
    setPart(parts.body, index, x, y + 0.64 * s, z, 0.5 * s, 1.08 * s, 0.38 * s, yaw);
    setPart(parts.sash, index, x, y + 0.92 * s, z - 0.01, person.monk ? 0.56 * s : 0.24 * s, 0.22 * s, 0.42 * s, yaw);
    setPart(parts.head, index, x, y + 1.32 * s, z, 0.34 * s, 0.34 * s, 0.34 * s, yaw);
    setPart(parts.hair, index, x, y + 1.48 * s, z - 0.02, 0.36 * s, 0.12 * s, 0.36 * s, yaw);
    setPart(parts.leftLeg, index, x - 0.12 * s, y + 0.18 * s, z, 0.16 * s, 0.5 * s + walk, 0.16 * s, yaw);
    setPart(parts.rightLeg, index, x + 0.12 * s, y + 0.18 * s, z, 0.16 * s, 0.5 * s - walk, 0.16 * s, yaw);
    setPart(parts.leftArm, index, x - 0.35 * s, y + 0.8 * s, z, 0.13 * s, 0.62 * s - walk, 0.13 * s, yaw);
    setPart(parts.rightArm, index, x + 0.35 * s, y + 0.8 * s, z, 0.13 * s, 0.62 * s + walk, 0.13 * s, yaw);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateBoats(parts, boats, elapsed) {
  boats.forEach((boat, index) => {
    const sample = sampleRoute(boat.route, boat.distance + elapsed * boat.speed);
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const sideX = sample.tangentZ;
    const sideZ = -sample.tangentX;
    const x = sample.x + sideX * boat.lane;
    const z = sample.z + sideZ * boat.lane;
    const y = waterY(x, z) + 0.18 + Math.sin(elapsed * 2 + boat.phase) * 0.06;
    setPart(parts.hull, index, x, y, z, 2.7, 0.45, 6.8, yaw);
    setPart(parts.canopy, index, x, y + 0.82, z, 2.2, 0.5, 2.8, yaw);
    setPart(parts.wake, index, x - sample.tangentX * 4.8, y - 0.08, z - sample.tangentZ * 4.8, 2.0, 0.08, 5.0, yaw);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateCarts(parts, carts, elapsed) {
  carts.forEach((cart, index) => {
    const sample = sampleRoute(cart.route, cart.distance + elapsed * cart.speed);
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const sideX = sample.tangentZ;
    const sideZ = -sample.tangentX;
    const x = sample.x + sideX * cart.lane;
    const z = sample.z + sideZ * cart.lane;
    const y = topY(x, z) + 0.14;
    setPart(parts.cart, index, x, y + 0.55, z, 2.3, 1.1, 3.2, yaw);
    setPart(parts.ox, index, x + sample.tangentX * 2.8, y + 0.58, z + sample.tangentZ * 2.8, 1.4, 1.15, 2.1, yaw);
    setPart(parts.wheelA, index, x - sideX * 1.25, y, z - sideZ * 1.25, 0.5, 0.5, 0.5, yaw);
    setPart(parts.wheelB, index, x + sideX * 1.25, y, z + sideZ * 1.25, 0.5, 0.5, 0.5, yaw);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}
