import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 230;
const TERRAIN_CELL = 5;
const TILE = 4;
const PEDESTRIAN_COUNT = 280;
const FELUCCA_COUNT = 18;
const CARGO_BOAT_COUNT = 10;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'egyptDesert',
  'egyptPlateau',
  'egyptMudbrick',
  'nileGreen',
  'water',
  'sand',
  'limestone',
  'marble',
  'gold',
  'lapis',
  'turquoise',
  'cobblestone',
  'brick',
  'wood',
  'cloth',
  'vegetation',
  'shadow',
  'crowd',
  'skin'
];

const LANDMARKS = [
  ['Great Pyramid of Giza', -48, -36, 82, 82],
  ['Pyramid of Khafre', 12, 18, 68, 68],
  ['Pyramid of Menkaure', -90, 58, 48, 48],
  ['Great Sphinx', 52, 46, 58, 34],
  ['Valley Temple', 84, 54, 44, 34],
  ['Satellite Pyramids', -104, -28, 38, 58],
  ['Mastaba Necropolis', -132, -16, 62, 92],
  ['Causeway', 32, 28, 112, 16],
  ['Temple Courtyard', 58, -104, 70, 62],
  ['Sacred Lake', 78, -142, 44, 28],
  ['Nile Docks', 132, 28, 54, 72],
  ['Mudbrick Village', 94, 122, 76, 66],
  ['Granary Quarter', 136, 118, 40, 52],
  ['Memphis Outpost', 52, -178, 76, 46]
];

function createRng(seed = 0x45475950) {
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

function nileCenterX(z) {
  return 128 + Math.sin(z * 0.028 + 0.4) * 9 + Math.sin(z * 0.061) * 3;
}

function nileWidthAt(z) {
  return 34 + Math.sin(z * 0.037 + 1.2) * 5;
}

function isNile(x, z, pad = 0) {
  return Math.abs(x - nileCenterX(z)) <= nileWidthAt(z) / 2 + pad;
}

const IRRIGATION_CANALS = [
  { z: -148, start: 52, end: 128, width: 5.5 },
  { z: -92, start: 44, end: 132, width: 5.5 },
  { z: -34, start: 34, end: 130, width: 5 },
  { z: 30, start: 42, end: 134, width: 5 },
  { z: 88, start: 54, end: 132, width: 5.5 },
  { z: 146, start: 60, end: 126, width: 4.8 }
];

function isIrrigationCanal(x, z, pad = 0) {
  return IRRIGATION_CANALS.some((canal) => (
    x >= canal.start - pad &&
    x <= canal.end + pad &&
    Math.abs(z - canal.z) <= canal.width / 2 + pad
  ));
}

function isWater(x, z, pad = 0) {
  return isNile(x, z, pad) || isIrrigationCanal(x, z, pad);
}

function isFertile(x, z) {
  const nileDistance = Math.abs(x - nileCenterX(z));
  const nearCanal = IRRIGATION_CANALS.some((canal) => x > 42 && x < canal.end + 18 && Math.abs(z - canal.z) < 19);
  return !isWater(x, z, -0.2) && (nileDistance < 58 || nearCanal);
}

function terrainHeightAt(x, z) {
  const plateau = Math.exp(-(((x + 36) / 112) ** 2 + ((z + 12) / 104) ** 2)) * 2.2;
  const necropolis = Math.exp(-(((x + 116) / 72) ** 2 + ((z - 6) / 102) ** 2)) * 0.95;
  const riverCut = Math.exp(-((x - nileCenterX(z)) ** 2) / 2400) * 0.72;
  const dunes = Math.sin(x * 0.035 + z * 0.018) * 0.18 + Math.cos(z * 0.041 - x * 0.013) * 0.14;
  return Math.max(0.58, 1.18 + plateau + necropolis + dunes - riverCut);
}

export function egyptTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function waterY(x, z) {
  return 0.68 + Math.sin(x * 0.034 + z * 0.05) * 0.035;
}

export function createEgyptScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Egypt voxel material: ${key}`);
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
        if (skipWater && isWater(wx, wz, -0.6)) continue;
        const base = skipWater ? topY(wx, wz) + baseOffset : waterY(wx, wz) + baseOffset;
        const shade = Math.sin(wx * 0.15 + wz * 0.1) * 0.03 + Math.cos(lz * 0.27) * 0.012;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, base);
      }
    }
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildNileCorridor({ addTop, addTiledRect, addLabel, rng });
  buildProcessionalRoads({ addTop, addTiledRect, planner });
  buildPyramidsAndNecropolis({ addTop, addTiledRect, addLabel, rng });
  buildSphinxAndValleyTemple({ addTop, addTiledRect, addLabel, rng });
  buildTempleDistrict({ addTop, addTiledRect, addLabel, rng });
  buildVillagesAndMarkets({ planner, batch, addTop, addTiledRect, addLabel, rng });
  buildStreetDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const boats = buildBoats({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-egypt-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      greatPyramid: new THREE.Vector3(-48, 55, -36),
      sphinx: new THREE.Vector3(52, 18, 46),
      nile: new THREE.Vector3(128, 8, 28),
      temple: new THREE.Vector3(58, 20, -104),
      village: new THREE.Vector3(94, 12, 122),
      necropolis: new THREE.Vector3(-132, 12, -16),
      aerial: new THREE.Vector3(-8, 8, 12)
    },
    metrics: {
      instances: total,
      pedestrians,
      boats,
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
    ['Pyramid Processional Road', 6, 16, 132, 12],
    ['Nile Bank Road', 104, 24, 12, 214],
    ['Village Lanes', 96, 124, 94, 82],
    ['Temple Avenue', 38, -112, 112, 12]
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
      const plateau = Math.exp(-(((x + 34) / 116) ** 2 + ((z + 4) / 106) ** 2));
      const material = isFertile(x, z)
        ? 'nileGreen'
        : plateau > 0.34
          ? 'egyptPlateau'
          : 'egyptDesert';
      batch.add(material, x, height / 2 - 0.04, z, TERRAIN_CELL * 1.02, height, TERRAIN_CELL * 1.02);
    }
  }
}

function buildNileCorridor({ addTop, addTiledRect, addLabel, rng }) {
  for (let z = -210; z <= 210; z += 10) {
    const x = nileCenterX(z);
    const width = nileWidthAt(z);
    addTop('water', x, z, width, 0.2, 9.4, null, 0, waterY(x, z) - 0.18);

    for (const side of [-1, 1]) {
      const bankX = x + side * (width / 2 + 7);
      addTop('nileGreen', bankX, z, 10, 0.22, 9.4);
      if (z % 20 === 0) {
        addPalm(addTop, bankX + side * 5, z + (rng() - 0.5) * 5, 1 + rng() * 0.35);
        addReeds(addTop, bankX - side * 3, z + (rng() - 0.5) * 6);
      }
    }
  }

  for (const canal of IRRIGATION_CANALS) {
    addTiledRect('water', (canal.start + canal.end) / 2, canal.z, canal.end - canal.start, canal.width, {
      skipWater: false,
      tile: 3.2,
      height: 0.16,
      baseOffset: -0.14
    });
    addTiledRect('nileGreen', (canal.start + canal.end) / 2, canal.z - 7, canal.end - canal.start, 4, { tile: 4, height: 0.16 });
    addTiledRect('nileGreen', (canal.start + canal.end) / 2, canal.z + 7, canal.end - canal.start, 4, { tile: 4, height: 0.16 });
  }

  addTiledRect('wood', 126, 28, 32, 82, { yaw: 0.03, tile: 4.5, height: 0.24 });
  addLabel('Nile Docks', 132, topY(132, 28) + 8, 28);
  for (let z = -6; z <= 62; z += 17) {
    addTop('wood', 112, z, 22, 0.28, 4, null, 0.05);
    addTop('wood', 119, z, 1.2, 2.6, 1.2);
  }
}

function buildProcessionalRoads({ addTop, addTiledRect }) {
  addTiledRect('cobblestone', 4, 20, 128, 10, { yaw: 0.14, tile: 4, height: 0.16, color: '#d6bd84' });
  addTiledRect('limestone', 20, -104, 100, 9, { yaw: -0.03, tile: 4, height: 0.14 });
  addTiledRect('cobblestone', 104, 22, 9, 200, { tile: 4, height: 0.15 });

  for (let i = 0; i < 13; i += 1) {
    const t = i / 12;
    const x = -28 + t * 92;
    const z = 20 + Math.sin(t * Math.PI) * 10;
    addSmallSphinx(addTop, x, z - 7, 0.72, 0.14);
    addSmallSphinx(addTop, x, z + 7, 0.72, 0.14);
  }
}

function buildPyramidsAndNecropolis({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('limestone', -48, -36, 104, 104, { tile: 4.5, height: 0.16 });
  buildPyramid(addTop, -48, -36, 70, 54, 'limestone', 'Great Pyramid of Giza', addLabel);
  buildPyramid(addTop, 12, 18, 58, 44, 'limestone', 'Pyramid of Khafre', addLabel);
  buildPyramid(addTop, -90, 58, 38, 28, 'limestone', 'Pyramid of Menkaure', addLabel);

  [
    [-112, -54, 16, 12],
    [-108, -28, 14, 10],
    [-106, -4, 12, 9],
    [-76, 84, 14, 11],
    [-64, 74, 11, 8]
  ].forEach(([x, z, size, height]) => buildPyramid(addTop, x, z, size, height, 'limestone'));

  addLabel('Satellite Pyramids', -108, topY(-108, -28) + 15, -28);

  for (let i = 0; i < 38; i += 1) {
    const x = -168 + rng() * 78;
    const z = -78 + rng() * 138;
    const width = 8 + rng() * 7;
    const depth = 7 + rng() * 8;
    addMastaba(addTop, x, z, width, depth, 2.2 + rng() * 1.8, rng() * 0.3 - 0.15);
  }
  addLabel('Mastaba Necropolis', -132, topY(-132, -16) + 10, -16);

  for (let i = 0; i < 58; i += 1) {
    const x = -78 + rng() * 86;
    const z = -80 + rng() * 92;
    addStaticPerson(addTop, x, z, i % 4 === 0 ? 'cloth' : 'crowd', 0.96 + rng() * 0.18);
  }
}

function buildPyramid(addTop, x, z, size, height, material, label = null, addLabel = null) {
  const base = topY(x, z);
  const levels = Math.max(8, Math.round(height / 2.8));
  const layerHeight = height / levels;

  for (let i = 0; i < levels; i += 1) {
    const t = i / levels;
    const s = size * (1 - t * 0.96);
    addTop(material, x, z, s, layerHeight * 0.96, s, null, 0, base + i * layerHeight);
    if (i % 4 === 0 && s > 8) {
      addTop('marble', x - s / 2 + 0.6, z, 0.8, layerHeight * 0.6, s * 0.86, null, 0, base + i * layerHeight + 0.08);
      addTop('marble', x, z - s / 2 + 0.6, s * 0.86, layerHeight * 0.6, 0.8, null, 0, base + i * layerHeight + 0.08);
    }
  }

  addTop('shadow', x, z - size / 2 - 0.4, 5.8, 3.4, 0.8, null, 0, base + height * 0.16);
  addTop('gold', x, z, 4.2, 2.2, 4.2, null, 0, base + height + 0.15);
  if (label && addLabel) addLabel(label, x, base + height + 12, z);
}

function addMastaba(addTop, x, z, width, depth, height, yaw = 0) {
  const base = topY(x, z);
  addTop('limestone', x, z, width, height, depth, null, yaw, base);
  addTop('sand', x, z, width + 1.4, 0.16, depth + 1.4, null, yaw, base - 0.03);
  addTop('shadow', x, z - depth * 0.45, width * 0.34, height * 0.42, 0.5, null, yaw, base + height * 0.22);
}

function buildSphinxAndValleyTemple({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('sand', 52, 46, 70, 44, { tile: 4, height: 0.15 });
  const base = topY(52, 46);
  addTop('limestone', 48, 48, 30, 5.2, 10, null, 0.04, base);
  addTop('limestone', 36, 48, 14, 2.2, 4.2, null, 0.04, base + 0.3);
  addTop('limestone', 61, 48, 6.2, 8.8, 6.2, null, 0.04, base + 4.8);
  addTop('limestone', 61, 45.5, 7.6, 2.2, 3.4, null, 0.04, base + 12.4);
  addTop('shadow', 61, 42.8, 2.2, 1.1, 0.4, null, 0.04, base + 10.5);
  addTop('lapis', 61, 45.2, 5.6, 0.7, 0.5, null, 0.04, base + 12.2);
  addTop('limestone', 35, 42, 18, 1.3, 2.2, null, 0.04, base + 0.7);
  addTop('limestone', 35, 54, 18, 1.3, 2.2, null, 0.04, base + 0.7);
  addTiledRect('limestone', 52, 46, 74, 4, { yaw: 0, tile: 4, height: 0.9, baseOffset: 0.02 });
  addLabel('Great Sphinx', 52, base + 20, 46);

  buildEgyptianTemple(addTop, addTiledRect, 84, 54, 42, 34, 'Valley Temple', addLabel);
  for (let i = 0; i < 18; i += 1) {
    addStaticPerson(addTop, 70 + rng() * 30, 40 + rng() * 24, i % 3 === 0 ? 'cloth' : 'crowd', 0.94);
  }
}

function buildTempleDistrict({ addTop, addTiledRect, addLabel, rng }) {
  buildEgyptianTemple(addTop, addTiledRect, 58, -104, 72, 58, 'Temple Courtyard', addLabel);
  addTiledRect('nileGreen', 78, -126, 52, 4, { tile: 4, height: 0.15 });
  addTiledRect('nileGreen', 78, -158, 52, 4, { tile: 4, height: 0.15 });
  addTiledRect('nileGreen', 50, -142, 4, 32, { tile: 4, height: 0.15 });
  addTiledRect('nileGreen', 106, -142, 4, 32, { tile: 4, height: 0.15 });
  addTiledRect('water', 78, -142, 42, 24, { skipWater: false, tile: 3.5, height: 0.16, baseOffset: -0.12 });
  addLabel('Sacred Lake', 78, topY(78, -142) + 7, -142);

  for (let x = 26; x <= 90; x += 16) {
    addObelisk(addTop, x, -72, 11);
  }
  for (let i = 0; i < 26; i += 1) {
    addStaticPerson(addTop, 26 + rng() * 70, -130 + rng() * 62, i % 4 === 0 ? 'gold' : 'cloth', 0.94);
  }
}

function buildEgyptianTemple(addTop, addTiledRect, x, z, width, depth, label, addLabel) {
  const base = topY(x, z);
  addTiledRect('limestone', x, z, width, depth, { tile: 4, height: 0.18 });
  addTop('limestone', x - width / 2 + 5, z, 9, 14, depth * 0.9, null, 0, base);
  addTop('limestone', x + width / 2 - 5, z, 9, 14, depth * 0.9, null, 0, base);
  addTop('shadow', x, z - depth / 2 + 3, 10, 7, 1.2, null, 0, base + 2);
  addTop('lapis', x, z - depth / 2 + 1.8, width * 0.7, 0.7, 0.8, null, 0, base + 11.8);
  addTop('gold', x, z - depth / 2 + 0.8, width * 0.62, 0.5, 0.6, null, 0, base + 13.0);

  for (let cx = x - width / 2 + 16; cx <= x + width / 2 - 16; cx += 12) {
    for (let cz = z - depth / 2 + 12; cz <= z + depth / 2 - 8; cz += 14) {
      addColumn(addTop, cx, cz, 7.5, 0.82);
    }
  }

  for (let side of [-1, 1]) {
    addObelisk(addTop, x + side * (width / 2 + 6), z - depth / 2 + 5, 13);
    addStatue(addTop, x + side * (width / 2 - 14), z - depth / 2 - 6, 1.25);
  }
  if (label && addLabel) addLabel(label, x, base + 22, z);
}

function buildVillagesAndMarkets({ planner, batch, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('egyptMudbrick', 94, 122, 82, 70, { tile: 4, height: 0.14 });
  addLabel('Mudbrick Village', 94, topY(94, 122) + 15, 122);

  let built = 0;
  for (let attempts = 0; attempts < 220 && built < 58; attempts += 1) {
    const inVillage = rng() > 0.35;
    const x = inVillage ? 52 + rng() * 80 : 42 + rng() * 92;
    const z = inVillage ? 88 + rng() * 88 : -182 + rng() * 68;
    const width = 8 + Math.floor(rng() * 5) * 2;
    const depth = 8 + Math.floor(rng() * 5) * 2;
    if (!planner.canPlaceRect(x, z, width + 3, depth + 3)) continue;
    planner.reserveRect(`egypt-house-${built}`, x, z, width + 3, depth + 3, { force: true, type: 'building' });
    buildMudbrickHouse(batch, addTop, x, z, width, depth, 3.8 + rng() * 3.2, rng() * 0.4 - 0.2);
    built += 1;
  }

  addLabel('Granary Quarter', 136, topY(136, 118) + 14, 118);
  for (let z = 96; z <= 144; z += 12) {
    buildGranary(addTop, 136, z, 1 + rng() * 0.12);
  }

  addLabel('Memphis Outpost', 52, topY(52, -178) + 16, -178);
  addTiledRect('egyptMudbrick', 52, -178, 76, 46, { tile: 4, height: 0.14 });
  for (let x = 20; x <= 84; x += 16) {
    buildMudbrickHouse(batch, addTop, x, -180 + Math.sin(x) * 8, 11, 10, 5.2, 0.05);
  }

  for (let i = 0; i < 34; i += 1) {
    const x = 66 + rng() * 72;
    const z = 92 + rng() * 78;
    if (i % 4 === 0) addMarketStall(addTop, x, z, rng() * 0.4 - 0.2);
    else addStaticPerson(addTop, x, z, i % 3 === 0 ? 'cloth' : 'crowd', 0.9 + rng() * 0.18);
  }
}

function buildMudbrickHouse(batch, addTop, x, z, width, depth, height, yaw) {
  const base = topY(x, z);
  batch.addTop('egyptMudbrick', x, base, z, width, height, depth, null, yaw);
  batch.addTop('sand', x, base + height + 0.05, z, width * 1.06, 0.35, depth * 1.06, null, yaw);
  batch.addTop('shadow', x, base + height * 0.28, z - depth / 2 - 0.1, width * 0.28, height * 0.38, 0.45, null, yaw);
  if (height > 5) {
    batch.addTop('wood', x + width * 0.22, base + height + 0.36, z, 1.1, 1.7, 1.1, null, yaw);
  }
}

function buildGranary(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('egyptMudbrick', x, z, 8 * scale, 8 * scale, 8 * scale, null, 0, base);
  addTop('sand', x, z, 9 * scale, 0.6 * scale, 9 * scale, null, 0, base + 8 * scale);
  addTop('shadow', x, z - 4 * scale, 2 * scale, 2.4 * scale, 0.5 * scale, null, 0, base + 2 * scale);
}

function buildStreetDetails({ planner, addTop, rng }) {
  for (let i = 0; i < 160; i += 1) {
    const x = -190 + rng() * 360;
    const z = -200 + rng() * 400;
    if (isWater(x, z, 4) || planner.hasPoint(x, z, 'landmark')) continue;

    if (isFertile(x, z) && rng() > 0.45) {
      addPalm(addTop, x, z, 0.8 + rng() * 0.45);
    } else if (rng() > 0.82) {
      addDustMarker(addTop, x, z, 0.6 + rng() * 0.8);
    }
  }

  for (let i = 0; i < 34; i += 1) {
    const x = 58 + rng() * 74;
    const z = 72 + rng() * 116;
    if (rng() > 0.56) addAnimal(addTop, x, z, rng() > 0.5 ? 'cattle' : 'donkey');
    else addFarmer(addTop, x, z);
  }
}

function addPalm(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.9 * scale, 6.6 * scale, 0.9 * scale, null, 0, base);
  for (let i = 0; i < 6; i += 1) {
    const yaw = (i / 6) * Math.PI * 2;
    addTop('vegetation', x + Math.sin(yaw) * 1.8 * scale, z + Math.cos(yaw) * 1.8 * scale, 1.0 * scale, 0.75 * scale, 4.2 * scale, null, yaw, base + 6.2 * scale);
  }
}

function addReeds(addTop, x, z) {
  for (let i = 0; i < 4; i += 1) {
    addTop('vegetation', x + i * 0.55, z + Math.sin(i) * 0.5, 0.35, 2.1 + i * 0.1, 0.35);
    addTop('turquoise', x + i * 0.55, z + Math.sin(i) * 0.5, 0.42, 0.34, 0.42, null, 0, topY(x, z) + 2.1 + i * 0.1);
  }
}

function addColumn(addTop, x, z, height, radius = 0.8) {
  const base = topY(x, z);
  addTop('limestone', x, z, radius * 1.5, height, radius * 1.5, null, 0, base);
  addTop('turquoise', x, z, radius * 2.4, 0.8, radius * 2.4, null, 0, base + height);
  addTop('gold', x, z, radius * 2.0, 0.45, radius * 2.0, null, 0, base + height + 0.78);
}

function addObelisk(addTop, x, z, height) {
  const base = topY(x, z);
  const layers = 5;
  for (let i = 0; i < layers; i += 1) {
    const s = 2.7 - i * 0.25;
    addTop('limestone', x, z, s, height / layers, s, null, 0, base + i * (height / layers));
  }
  addTop('gold', x, z, 1.6, 1.3, 1.6, null, 0, base + height);
}

function addStatue(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('limestone', x, z, 2.4 * scale, 5.2 * scale, 1.7 * scale, null, 0, base);
  addTop('limestone', x, z - 0.1, 1.7 * scale, 1.8 * scale, 1.7 * scale, null, 0, base + 5.2 * scale);
  addTop('lapis', x, z - 0.45 * scale, 2.1 * scale, 0.52 * scale, 0.42 * scale, null, 0, base + 6.6 * scale);
}

function addSmallSphinx(addTop, x, z, scale = 1, yaw = 0) {
  const base = topY(x, z);
  addTop('limestone', x, z, 3.8 * scale, 1.0 * scale, 1.4 * scale, null, yaw, base);
  addTop('limestone', x + 1.4 * scale, z, 1.0 * scale, 1.4 * scale, 1.0 * scale, null, yaw, base + 0.8 * scale);
}

function addMarketStall(addTop, x, z, yaw = 0) {
  const base = topY(x, z);
  addTop('wood', x, z, 4.4, 1.4, 3.4, null, yaw, base);
  addTop('cloth', x, z, 5.2, 0.45, 4.2, null, yaw, base + 1.6);
  addTop('gold', x - 1.1, z, 0.9, 0.55, 0.9, null, yaw, base + 1.42);
  addTop('turquoise', x + 1.1, z, 0.9, 0.55, 0.9, null, yaw, base + 1.42);
}

function addDustMarker(addTop, x, z, scale) {
  addTop('sand', x, z, 2.6 * scale, 0.22 * scale, 2.6 * scale, null, 0, topY(x, z) + 0.02);
}

function addStaticPerson(addTop, x, z, body = 'crowd', scale = 1) {
  const base = topY(x, z);
  addTop(body, x, z, 0.52 * scale, 1.05 * scale, 0.42 * scale, null, 0, base + 0.02);
  addTop('skin', x, z, 0.36 * scale, 0.36 * scale, 0.36 * scale, null, 0, base + 1.04 * scale);
  addTop('shadow', x, z - 0.04, 0.34 * scale, 0.12 * scale, 0.34 * scale, null, 0, base + 1.38 * scale);
}

function addFarmer(addTop, x, z) {
  addStaticPerson(addTop, x, z, 'cloth', 0.92);
  addTop('wood', x + 0.7, z, 0.25, 0.25, 3.2, null, 0.34, topY(x, z) + 0.8);
}

function addAnimal(addTop, x, z, type) {
  const base = topY(x, z);
  const scale = type === 'cattle' ? 1.15 : 0.86;
  addTop(type === 'cattle' ? 'wood' : 'shadow', x, z, 2.4 * scale, 1.2 * scale, 1.0 * scale, null, 0, base);
  addTop(type === 'cattle' ? 'wood' : 'shadow', x + 1.3 * scale, z, 0.8 * scale, 0.9 * scale, 0.8 * scale, null, 0, base + 0.5 * scale);
  for (const dx of [-0.75, 0.75]) {
    for (const dz of [-0.35, 0.35]) addTop('shadow', x + dx * scale, z + dz * scale, 0.25 * scale, 0.75 * scale, 0.25 * scale, null, 0, base - 0.02);
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
      speed: 2 + rng() * 3.4,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.92 + rng() * 0.24,
      role: i % 7
    });
  }

  const group = new THREE.Group();
  group.name = 'egypt-workers-priests-visitors';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'egypt-pedestrian-body', 0xd8c29b),
    sash: makeInstancedPart(pedestrians.length, 'egypt-pedestrian-sash', 0x315ca8),
    head: makeInstancedPart(pedestrians.length, 'egypt-pedestrian-head', 0xc58a61),
    hair: makeInstancedPart(pedestrians.length, 'egypt-pedestrian-hair', 0x2f241f),
    leftLeg: makeInstancedPart(pedestrians.length, 'egypt-pedestrian-left-leg', 0x8c6546),
    rightLeg: makeInstancedPart(pedestrians.length, 'egypt-pedestrian-right-leg', 0x8c6546),
    leftArm: makeInstancedPart(pedestrians.length, 'egypt-pedestrian-left-arm', 0xc58a61),
    rightArm: makeInstancedPart(pedestrians.length, 'egypt-pedestrian-right-arm', 0xc58a61)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updatePedestrians(parts, pedestrians, elapsed) });
  updatePedestrians(parts, pedestrians, 0);
  return pedestrians.length;
}

function buildBoats({ animated, rng }) {
  const feluccas = [];
  const cargos = [];
  const routes = createBoatRoutes();

  for (let i = 0; i < FELUCCA_COUNT; i += 1) {
    const route = routes[i % routes.length];
    feluccas.push({ route, distance: rng() * route.length, speed: 4 + rng() * 2.8, lane: (rng() - 0.5) * route.width, phase: rng() * Math.PI * 2 });
  }
  for (let i = 0; i < CARGO_BOAT_COUNT; i += 1) {
    const route = routes[i % routes.length];
    cargos.push({ route, distance: rng() * route.length, speed: 2.8 + rng() * 2.1, lane: (rng() - 0.5) * route.width });
  }

  const group = new THREE.Group();
  group.name = 'egypt-nile-boats';
  const feluccaParts = {
    hull: makeInstancedPart(feluccas.length, 'egypt-felucca-hull', 0x7a4d30),
    mast: makeInstancedPart(feluccas.length, 'egypt-felucca-mast', 0x7a4d30),
    sail: makeInstancedPart(feluccas.length, 'egypt-felucca-sail', 0xf0dfb2),
    wake: makeInstancedPart(feluccas.length, 'egypt-felucca-wake', 0xbbe3e5)
  };
  const cargoParts = {
    hull: makeInstancedPart(cargos.length, 'egypt-cargo-hull', 0x684529),
    load: makeInstancedPart(cargos.length, 'egypt-cargo-load', 0xcfa760),
    canopy: makeInstancedPart(cargos.length, 'egypt-cargo-canopy', 0xd8c29b),
    wake: makeInstancedPart(cargos.length, 'egypt-cargo-wake', 0xbbe3e5)
  };
  Object.values(feluccaParts).forEach((mesh) => group.add(mesh));
  Object.values(cargoParts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => {
    updateFeluccas(feluccaParts, feluccas, elapsed);
    updateCargoBoats(cargoParts, cargos, elapsed);
  } });
  updateFeluccas(feluccaParts, feluccas, 0);
  updateCargoBoats(cargoParts, cargos, 0);
  return feluccas.length + cargos.length;
}

function createPedestrianRoutes() {
  return [
    { width: 8, loop: true, points: [[-86, -76], [-48, -72], [-4, -10], [18, 20], [-38, 38], [-88, 12]] },
    { width: 7, loop: false, points: [[-60, -26], [4, 20], [52, 46], [84, 54], [112, 28]] },
    { width: 7, loop: true, points: [[24, -130], [58, -140], [98, -130], [94, -82], [48, -76], [20, -98]] },
    { width: 8, loop: true, points: [[62, 90], [126, 94], [142, 132], [104, 168], [58, 146]] },
    { width: 7, loop: false, points: [[104, -166], [102, -82], [104, -8], [112, 70], [104, 160]] },
    { width: 5, loop: true, points: [[-166, -66], [-126, -70], [-98, -28], [-128, 48], [-168, 34]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createBoatRoutes() {
  const main = [];
  for (let z = -214; z <= 214; z += 20) main.push({ x: nileCenterX(z), z });
  const bank = [];
  for (let z = -196; z <= 184; z += 28) bank.push({ x: nileCenterX(z) - 8, z });
  return [
    { width: 14, loop: false, points: main },
    { width: 10, loop: false, points: bank }
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
    const sashColor = person.role === 0 ? 1.2 : 1;

    setPart(parts.body, index, x, y + 0.64 * s, z, 0.48 * s, 1.1 * s, 0.38 * s, yaw);
    setPart(parts.sash, index, x, y + 0.96 * s, z - 0.01, 0.52 * s * sashColor, 0.18 * s, 0.42 * s, yaw);
    setPart(parts.head, index, x, y + 1.34 * s, z, 0.34 * s, 0.34 * s, 0.34 * s, yaw);
    setPart(parts.hair, index, x, y + 1.5 * s, z - 0.02, 0.36 * s, 0.12 * s, 0.36 * s, yaw);
    setPart(parts.leftLeg, index, x - 0.12 * s, y + 0.18 * s, z, 0.16 * s, 0.5 * s + walk, 0.16 * s, yaw);
    setPart(parts.rightLeg, index, x + 0.12 * s, y + 0.18 * s, z, 0.16 * s, 0.5 * s - walk, 0.16 * s, yaw);
    setPart(parts.leftArm, index, x - 0.35 * s, y + 0.8 * s, z, 0.13 * s, 0.62 * s - walk, 0.13 * s, yaw);
    setPart(parts.rightArm, index, x + 0.35 * s, y + 0.8 * s, z, 0.13 * s, 0.62 * s + walk, 0.13 * s, yaw);
  });

  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateFeluccas(parts, boats, elapsed) {
  boats.forEach((boat, index) => {
    const sample = sampleRoute(boat.route, boat.distance + elapsed * boat.speed);
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const sideX = sample.tangentZ;
    const sideZ = -sample.tangentX;
    const x = sample.x + sideX * boat.lane;
    const z = sample.z + sideZ * boat.lane;
    const y = waterY(x, z) + 0.22;
    const bob = Math.sin(elapsed * 2.2 + boat.phase) * 0.08;

    setPart(parts.hull, index, x, y + bob, z, 3.2, 0.55, 8.4, yaw);
    setPart(parts.mast, index, x, y + 2.0 + bob, z, 0.24, 4.1, 0.24, yaw);
    setPart(parts.sail, index, x + sideX * 0.65, y + 2.45 + bob, z + sideZ * 0.65, 0.22, 3.5, 2.5, yaw + 0.12);
    setPart(parts.wake, index, x - sample.tangentX * 5.2, y - 0.08, z - sample.tangentZ * 5.2, 2.2, 0.08, 5.6, yaw);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateCargoBoats(parts, boats, elapsed) {
  boats.forEach((boat, index) => {
    const sample = sampleRoute(boat.route, boat.distance + elapsed * boat.speed);
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const sideX = sample.tangentZ;
    const sideZ = -sample.tangentX;
    const x = sample.x + sideX * boat.lane;
    const z = sample.z + sideZ * boat.lane;
    const y = waterY(x, z) + 0.18;

    setPart(parts.hull, index, x, y, z, 4.4, 0.62, 9.8, yaw);
    setPart(parts.load, index, x, y + 0.62, z - 0.8, 3.2, 0.86, 3.6, yaw);
    setPart(parts.canopy, index, x, y + 1.35, z + 1.9, 3.8, 0.54, 3.2, yaw);
    setPart(parts.wake, index, x - sample.tangentX * 6.2, y - 0.08, z - sample.tangentZ * 6.2, 2.5, 0.08, 6.6, yaw);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}
