import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 234;
const TERRAIN_CELL = 4;
const TILE = 3.7;
const PEDESTRIAN_COUNT = 280;
const TRAFFIC_COUNT = 34;
const LLAMA_COUNT = 28;
const BOAT_COUNT = 14;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'peruTerrain',
  'andesGrass',
  'cloudForest',
  'adobe',
  'volcanicStone',
  'water',
  'sand',
  'asphalt',
  'cobblestone',
  'limestone',
  'stucco',
  'terracotta',
  'brick',
  'wood',
  'cloth',
  'gold',
  'vegetation',
  'shadow',
  'crowd',
  'skin'
];

const LANDMARKS = [
  ['Machu Picchu', -42, -62, 88, 66],
  ['Huayna Picchu', -18, -104, 38, 34],
  ['Cusco Plaza', 12, 40, 72, 56],
  ['Cusco Cathedral', 6, 28, 34, 28],
  ['Sacsayhuaman', -46, 2, 74, 34],
  ['Sacred Valley', -108, -24, 92, 34],
  ['Ollantaytambo', -132, -48, 48, 36],
  ['Lake Titicaca', 126, 130, 86, 58],
  ['Arequipa', -78, 142, 72, 48],
  ['Lima Coast', -178, -74, 86, 58],
  ['Nazca Desert', -166, 34, 74, 52],
  ['Colca Canyon', -152, 124, 78, 38],
  ['Amazon Basin', 154, -16, 88, 74],
  ['Rainbow Mountain', 118, -142, 56, 38],
  ['Andean Village', 58, 72, 58, 42]
];

const WATER_RECTS = [
  { name: 'Lake Titicaca', x: 126, z: 130, width: 86, depth: 58 },
  { name: 'Urubamba River A', x: -100, z: -34, width: 114, depth: 10 },
  { name: 'Urubamba River B', x: -56, z: -78, width: 90, depth: 9 },
  { name: 'Amazon River', x: 154, z: -14, width: 88, depth: 24 },
  { name: 'Colca River', x: -152, z: 124, width: 78, depth: 8 }
];

function createRng(seed = 0x50455255) {
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

function coastX(z) {
  return -190 + Math.sin(z * 0.036 + 0.4) * 8 + Math.sin(z * 0.081) * 4;
}

function isInsideRect(x, z, rect, pad = 0) {
  return (
    x >= rect.x - rect.width / 2 - pad &&
    x <= rect.x + rect.width / 2 + pad &&
    z >= rect.z - rect.depth / 2 - pad &&
    z <= rect.z + rect.depth / 2 + pad
  );
}

function isPacific(x, z, pad = 0) {
  return x <= coastX(z) + pad;
}

function isWaterRect(x, z, pad = 0) {
  return WATER_RECTS.some((rect) => isInsideRect(x, z, rect, pad));
}

function isWater(x, z, pad = 0) {
  return isPacific(x, z, pad) || isWaterRect(x, z, pad);
}

function isCloudForest(x, z) {
  return x > -104 && x < 32 && z < -50 && z > -142;
}

function isAmazon(x, z) {
  return x > 108 && z > -74 && z < 38;
}

function isDesert(x, z) {
  return x < -126 && z > -10 && z < 62;
}

function terrainHeightAt(x, z) {
  const machuRidge = Math.exp(-(((x + 42) / 50) ** 2 + ((z + 62) / 34) ** 2)) * 31;
  const huayna = Math.exp(-(((x + 18) / 24) ** 2 + ((z + 104) / 24) ** 2)) * 26;
  const cuscoBasin = Math.exp(-(((x - 8) / 76) ** 2 + ((z - 36) / 64) ** 2)) * 8;
  const sacsay = Math.exp(-(((x + 46) / 58) ** 2 + ((z - 2) / 34) ** 2)) * 12;
  const andes = Math.exp(-(((x - 26) / 156) ** 2 + ((z + 34) / 126) ** 2)) * 10;
  const colca = x < -112 && z > 96 ? Math.max(0, (z - 96) * 0.08) : 0;
  const rainbow = Math.exp(-(((x - 118) / 40) ** 2 + ((z + 142) / 30) ** 2)) * 15;
  const coastCliff = Math.max(0, x - coastX(z)) < 18 ? 3.4 : 0;
  const waterCut = isWater(x, z, -0.6) ? 0.58 : 0;
  return Math.max(
    0.52,
    1.0 + machuRidge + huayna + cuscoBasin + sacsay + andes + colca + rainbow + coastCliff - waterCut +
      Math.sin(x * 0.031 + z * 0.023) * 0.16
  );
}

export function peruTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function waterY(x, z) {
  return 0.58 + Math.sin(x * 0.041 + z * 0.043) * 0.035;
}

export function createPeruScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Peru voxel material: ${key}`);
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
        const shade = Math.sin(wx * 0.13 + wz * 0.1) * 0.026 + Math.cos(lz * 0.28) * 0.014;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, base);
      }
    }
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildMachuPicchu({ addTop, addTiledRect, addLabel, rng });
  buildCusco({ addTop, addTiledRect, addLabel, rng });
  buildSacredValley({ addTop, addTiledRect, addLabel, rng });
  buildRegions({ addTop, addTiledRect, addLabel, rng });
  const blocks = buildVillages({ planner, batch, addTop, rng });
  buildDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const traffic = buildTraffic({ animated, rng });
  const llamas = buildLlamas({ animated, rng });
  const boats = buildBoats({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-peru-cusco-machu-picchu-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      machu: new THREE.Vector3(-42, topY(-42, -62) + 18, -62),
      cusco: new THREE.Vector3(12, topY(12, 40) + 12, 40),
      sacsayhuaman: new THREE.Vector3(-46, topY(-46, 2) + 15, 2),
      sacredValley: new THREE.Vector3(-108, topY(-108, -24) + 10, -24),
      titicaca: new THREE.Vector3(126, 9, 130),
      lima: new THREE.Vector3(-178, 12, -74),
      amazon: new THREE.Vector3(154, 12, -16),
      rainbow: new THREE.Vector3(118, topY(118, -142) + 14, -142),
      aerial: new THREE.Vector3(-20, 22, -4)
    },
    metrics: {
      instances: total,
      pedestrians,
      buses: traffic.buses,
      cyclists: traffic.mototaxis,
      boats,
      carts: llamas,
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
    ['Sacred Valley Rail', -94, -36, 126, 8],
    ['Cusco Road', 0, 34, 132, 8],
    ['Machu Trail', -56, -52, 8, 82],
    ['Coastal Avenue', -172, -74, 58, 8],
    ['Andean Road', 34, 74, 112, 8],
    ['Lake Path', 126, 96, 84, 8]
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

      const h = terrainHeightAt(x, z);
      const material = isAmazon(x, z) || isCloudForest(x, z)
        ? 'cloudForest'
        : isDesert(x, z)
          ? 'sand'
          : h > 18
            ? 'andesGrass'
            : 'peruTerrain';
      batch.add(material, x, h / 2 - 0.04, z, TERRAIN_CELL * 1.02, h, TERRAIN_CELL * 1.02);
    }
  }
}

function buildMachuPicchu({ addTop, addTiledRect, addLabel, rng }) {
  const x = -42;
  const z = -62;
  const base = topY(x, z);
  addTiledRect('andesGrass', x, z, 78, 54, { tile: 3.6, height: 0.14, color: '#6f8550' });

  for (let i = 0; i < 12; i += 1) {
    const tz = z - 24 + i * 4.1;
    const width = 58 - Math.abs(i - 5.5) * 3.2;
    addTop('andesGrass', x - 12, tz, width, 0.6, 2.4, 0x6f8550, 0, base + i * 0.72);
    addTop('volcanicStone', x - 12, tz + 1.35, width, 0.75, 0.6, 0x8a8175, 0, base + i * 0.72);
  }

  const structures = [
    [-34, -66, 14, 7, 9],
    [-50, -55, 12, 6, 8],
    [-20, -54, 11, 6, 7],
    [-58, -76, 10, 5, 7],
    [-34, -42, 13, 5, 8],
    [-8, -72, 10, 6, 7]
  ];
  for (const [sx, sz, w, h, d] of structures) {
    addTop('volcanicStone', sx, sz, w, h, d, 0x8b8276);
    addTop('peruTerrain', sx, sz, w + 0.8, 0.65, d + 0.8, 0x83735e, 0, topY(sx, sz) + h);
  }

  addTiledRect('cobblestone', -32, -58, 34, 24, { tile: 3.1, height: 0.13, color: '#77766d' });
  addTop('limestone', -24, -47, 6, 6, 5, null);
  addTop('gold', -24, -47, 1.0, 4.2, 1.0, 0xf0d45c);

  for (let i = 0; i < 42; i += 1) {
    const px = -62 + rng() * 58;
    const pz = -82 + rng() * 48;
    addTop('crowd', px, pz, 0.46, 0.96, 0.46);
    addTop('skin', px, pz, 0.32, 0.32, 0.32, null, 0, topY(px, pz) + 0.94);
  }

  addLabel('Machu Picchu', x, base + 24, z);
  addLabel('Huayna Picchu', -18, topY(-18, -104) + 18, -104);
}

function buildCusco({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', 12, 40, 74, 58, { tile: 3.5, height: 0.13, color: '#77766d' });
  addTiledRect('peruTerrain', 12, 40, 38, 28, { tile: 3.5, height: 0.15, color: '#9b8159' });

  const plazaBuildings = [
    [6, 28, 26, 13, 14, 'Cusco Cathedral'],
    [32, 44, 22, 8, 12, 'Colonial Arcade'],
    [-14, 54, 24, 7, 12, 'Market Arcade'],
    [-16, 24, 18, 7, 10, 'Inca Wall']
  ];
  for (const [x, z, w, h, d, label] of plazaBuildings) {
    addTop(label === 'Inca Wall' ? 'volcanicStone' : 'stucco', x, z, w, h, d, label === 'Inca Wall' ? 0x746f67 : 0xd8c29b);
    addTop('terracotta', x, z, w + 1.2, 1.0, d + 1.2, null, 0, topY(x, z) + h);
  }

  for (let i = 0; i < 14; i += 1) {
    addTop('volcanicStone', -28 + i * 2.1, 18, 1.6, 3.4, 1.2, 0x746f67);
  }

  for (let i = 0; i < 26; i += 1) {
    const x = -12 + (i % 7) * 7.5;
    const z = 62 + Math.floor(i / 7) * 7.2;
    addTop('adobe', x, z, 4.8, 4.2 + rng() * 2.6, 4.6, 0xb9875a);
    addTop('terracotta', x, z, 5.4, 0.6, 5.2, null, 0, topY(x, z) + 4.6);
  }

  buildMarket(addTop, rng, 20, 54, 20, 12);
  addLabel('Cusco Plaza', 12, topY(12, 40) + 14, 40);
  addLabel('Cusco Cathedral', 6, topY(6, 28) + 20, 28);
}

function buildSacredValley({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('water', -100, -34, 116, 10, { tile: 3.4, height: 0.14, skipWater: false, baseOffset: 0 });
  addTiledRect('cobblestone', -94, -42, 126, 6, { tile: 3.2, height: 0.12, color: '#77766d' });
  addTiledRect('cobblestone', -56, -52, 8, 82, { tile: 3.2, height: 0.12, color: '#77766d' });

  for (let i = 0; i < 12; i += 1) {
    addTop('andesGrass', -138 + i * 7.2, -22 + i * 1.4, 24 + i * 2, 0.55, 2.4, 0x6f8550, 0.18);
    addTop('volcanicStone', -138 + i * 7.2, -20 + i * 1.4, 24 + i * 2, 0.6, 0.5, 0x8a8175, 0.18);
  }

  for (let i = 0; i < 18; i += 1) {
    const x = -154 + (i % 6) * 7.2;
    const z = -58 + Math.floor(i / 6) * 9.2;
    addTop('volcanicStone', x, z, 5.2, 4.4, 4.6, 0x8b8276);
    addTop('terracotta', x, z, 5.8, 0.6, 5.2, null, 0, topY(x, z) + 4.4);
  }
  addLabel('Sacred Valley', -108, topY(-108, -24) + 12, -24);
  addLabel('Ollantaytambo', -132, topY(-132, -48) + 14, -48);

  for (let i = 0; i < 18; i += 1) {
    addTop('steel', -142 + i * 5.6, -42, 2.4, 0.18, 0.34, 0x3d4143, 0, topY(-142 + i * 5.6, -42) + 0.3);
  }
}

function buildRegions({ addTop, addTiledRect, addLabel, rng }) {
  buildSacsayhuaman(addTop, addTiledRect, addLabel);
  buildLakeTiticaca(addTop, addTiledRect, addLabel, rng);
  buildArequipa(addTop, addTiledRect, addLabel);
  buildLimaAndNazca(addTop, addTiledRect, addLabel);
  buildColca(addTop, addTiledRect, addLabel);
  buildAmazon(addTop, addTiledRect, addLabel, rng);
  buildRainbowMountain(addTop, addLabel);
}

function buildSacsayhuaman(addTop, addTiledRect, addLabel) {
  addTiledRect('andesGrass', -46, 2, 76, 34, { tile: 3.6, height: 0.14, color: '#6f8550' });
  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 11; i += 1) {
      const x = -78 + i * 6.4 + (row % 2 ? 3.2 : 0);
      const z = -8 + row * 8 + (i % 2 ? 1.8 : -1.8);
      addTop('volcanicStone', x, z, 6.0, 3.4, 2.8, 0x81796f, 0.18);
    }
  }
  addLabel('Sacsayhuaman', -46, topY(-46, 2) + 17, 2);
}

function buildLakeTiticaca(addTop, addTiledRect, addLabel, rng) {
  addTiledRect('water', 126, 130, 88, 60, { tile: 3.6, height: 0.14, skipWater: false, baseOffset: 0 });
  for (let i = 0; i < 7; i += 1) {
    const x = 96 + (i % 4) * 17;
    const z = 116 + Math.floor(i / 4) * 18;
    addTop('sand', x, z, 12, 0.28, 8, 0xd8bc78, 0, waterY(x, z) + 0.1);
    addTop('wood', x, z, 4.6, 2.4, 3.2, 0x9b7443, 0, waterY(x, z) + 0.35);
  }
  for (let i = 0; i < 24; i += 1) {
    addTop('vegetation', 86 + rng() * 78, 100 + rng() * 54, 0.6, 2.2, 0.6, 0x8d9a46, rng() * 0.3, waterY(126, 130));
  }
  addLabel('Lake Titicaca', 126, waterY(126, 130) + 10, 130);
}

function buildArequipa(addTop, addTiledRect, addLabel) {
  addTiledRect('cobblestone', -78, 142, 74, 48, { tile: 3.5, height: 0.13, color: '#77766d' });
  for (let i = 0; i < 24; i += 1) {
    const x = -110 + (i % 8) * 9;
    const z = 128 + Math.floor(i / 8) * 10;
    addTop('volcanicStone', x, z, 6.5, 6.8, 6, 0xc8c1aa);
    addTop('terracotta', x, z, 7.2, 0.6, 6.6, null, 0, topY(x, z) + 6.8);
  }
  addTop('volcanicStone', -78, 118, 18, 16, 11, 0xc8c1aa);
  addTop('gold', -78, 113, 1.1, 7, 1.1, 0xf0d45c);
  addLabel('Arequipa', -78, topY(-78, 142) + 20, 142);
}

function buildLimaAndNazca(addTop, addTiledRect, addLabel) {
  addTiledRect('sand', -178, -74, 88, 58, { tile: 3.7, height: 0.15, color: '#d7b56f' });
  addTiledRect('asphalt', -172, -74, 58, 7.8, { tile: 3.3, height: 0.12, color: '#34383d' });
  for (let i = 0; i < 18; i += 1) {
    const x = -166 + (i % 6) * 8;
    const z = -98 + Math.floor(i / 6) * 11;
    addTop(i % 3 ? 'stucco' : 'concrete', x, z, 5.8, 8 + (i % 4) * 2.5, 5.5, i % 3 ? 0xd2b78a : null);
  }
  addLabel('Lima Coastal Cliffs', -178, topY(-178, -74) + 18, -74);

  addTiledRect('sand', -166, 34, 76, 52, { tile: 3.7, height: 0.14, color: '#d8bc78' });
  for (let i = 0; i < 9; i += 1) {
    addTop('limestone', -196 + i * 7, 34 + Math.sin(i) * 12, 8, 0.14, 0.8, 0xf2dfb4, 0.35);
  }
  addTop('limestone', -166, 34, 34, 0.14, 0.8, 0xf2dfb4, -0.55);
  addTop('limestone', -166, 34, 0.8, 0.14, 24, 0xf2dfb4, 0);
  addLabel('Nazca Desert Plains', -166, topY(-166, 34) + 9, 34);
}

function buildColca(addTop, addTiledRect, addLabel) {
  addTiledRect('water', -152, 124, 78, 8, { tile: 3.3, height: 0.13, skipWater: false, baseOffset: 0 });
  for (let i = 0; i < 11; i += 1) {
    addTop('volcanicStone', -188 + i * 7.2, 114, 6, 8 + i * 0.8, 3, 0x7f7569);
    addTop('volcanicStone', -188 + i * 7.2, 134, 6, 12 + i * 0.9, 3, 0x7f7569);
  }
  for (let i = 0; i < 5; i += 1) {
    addTop('shadow', -178 + i * 12, 104 + i * 3, 2.8, 0.32, 1.2, 0x2e2924, 0.6, topY(-178 + i * 12, 104 + i * 3) + 14 + i);
  }
  addLabel('Colca Canyon', -152, topY(-152, 124) + 18, 124);
}

function buildAmazon(addTop, addTiledRect, addLabel, rng) {
  addTiledRect('water', 154, -16, 90, 25, { tile: 3.6, height: 0.14, skipWater: false, baseOffset: 0 });
  for (let i = 0; i < 86; i += 1) {
    const x = 112 + rng() * 86;
    const z = -66 + rng() * 88;
    addTop('vegetation', x, z, 2.2 + rng() * 1.2, 5.2 + rng() * 4, 2.2 + rng() * 1.2);
  }
  for (let i = 0; i < 12; i += 1) {
    const x = 126 + (i % 4) * 12;
    const z = 8 + Math.floor(i / 4) * 10;
    addTop('wood', x, z, 5.8, 3.2, 4.6);
    addTop('terracotta', x, z, 6.4, 0.5, 5.2, null, 0, topY(x, z) + 3.2);
    addTop('wood', x, z, 0.5, 2.4, 0.5, null, 0, topY(x, z) - 1.4);
  }
  addLabel('Amazon Basin', 154, topY(154, -16) + 14, -16);
}

function buildRainbowMountain(addTop, addLabel) {
  const colors = [0xb96038, 0xd7b56f, 0x6f8550, 0x9d947b, 0xc8c1aa, 0x7d3041];
  for (let i = 0; i < 14; i += 1) {
    addTop(i % 2 ? 'adobe' : 'peruTerrain', 118, -160 + i * 2.8, 54 - Math.abs(i - 7) * 2.4, 1.2, 2.2, colors[i % colors.length], 0.08, topY(118, -160 + i * 2.8) + i * 0.55);
  }
  addLabel('Rainbow Mountain', 118, topY(118, -142) + 20, -142);
}

function buildVillages({ planner, batch, addTop, rng }) {
  let placed = 0;
  const centers = [
    [58, 72, 8, 5],
    [72, 92, 6, 4],
    [-24, 78, 6, 4],
    [-132, -6, 5, 4]
  ];

  for (const [cx, cz, cols, rows] of centers) {
    for (let ix = 0; ix < cols; ix += 1) {
      for (let iz = 0; iz < rows; iz += 1) {
        const x = cx + (ix - cols / 2) * 8.2 + (rng() - 0.5) * 2;
        const z = cz + (iz - rows / 2) * 8.0 + (rng() - 0.5) * 2;
        if (!planner.reserveRect(`peru-village-${placed}`, x, z, 7, 7, { type: 'building' })) continue;
        const h = 3.4 + rng() * 2.8;
        addTop(rng() > 0.45 ? 'adobe' : 'volcanicStone', x, z, 5.6, h, 5.0, rng() > 0.45 ? 0xb9875a : 0x81796f);
        addTop('terracotta', x, z, 6.2, 0.6, 5.6, null, 0, topY(x, z) + h);
        if (rng() > 0.7) batch.addTop('cloth', x + 2.8, topY(x, z) + 1.8, z, 0.18, 0.9, 2.6, [0xd94f45, 0x2f73c8, 0xf0c84b][placed % 3]);
        placed += 1;
      }
    }
  }

  return placed;
}

function buildDetails({ planner, addTop, rng }) {
  const roads = planner.reservations.filter((item) => item.type === 'road');
  for (let i = 0; i < 150; i += 1) {
    const road = roads[i % roads.length];
    const x = road.x1 + rng() * (road.x2 - road.x1);
    const z = road.z1 + rng() * (road.z2 - road.z1);
    if (isWater(x, z, 1.2)) continue;
    if (i % 6 === 0) {
      addTop('vegetation', x, z, 1.4, 3.8, 1.4);
    } else if (i % 5 === 0) {
      addTop('wood', x, z, 2.5, 1.4, 1.8);
      addTop('cloth', x, z - 1.0, 2.8, 0.3, 0.32, [0xd94f45, 0x2f73c8, 0xf0c84b, 0x7d3041][i % 4], 0, topY(x, z) + 1.4);
    } else {
      addTop('wood', x, z, 0.3, 2.2, 0.3);
      addTop('gold', x, z, 0.62, 0.4, 0.62, 0xf0d45c, 0, topY(x, z) + 2.15);
    }
  }
}

function buildMarket(addTop, rng, centerX, centerZ, width, depth) {
  for (let i = 0; i < 18; i += 1) {
    const x = centerX - width / 2 + rng() * width;
    const z = centerZ - depth / 2 + rng() * depth;
    addTop('wood', x, z, 2.4, 1.2, 1.8);
    addTop('cloth', x, z - 1, 2.7, 0.3, 0.32, [0xd94f45, 0x2f73c8, 0xf0c84b, 0x7d3041][i % 4], 0, topY(x, z) + 1.2);
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
      speed: 2.4 + rng() * 3.8,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.9 + rng() * 0.28,
      shirt: [0xb96038, 0x2f73c8, 0xf0c84b, 0x7d3041, 0xffffff][i % 5]
    });
  }

  const group = new THREE.Group();
  group.name = 'peru-crowds';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'peru-pedestrian-body', 0xb96038, true),
    head: makeInstancedPart(pedestrians.length, 'peru-pedestrian-head', 0xc88d61),
    hat: makeInstancedPart(pedestrians.length, 'peru-pedestrian-hat', 0xf0dfb2),
    hair: makeInstancedPart(pedestrians.length, 'peru-pedestrian-hair', 0x3d2f28),
    leftLeg: makeInstancedPart(pedestrians.length, 'peru-pedestrian-left-leg', 0x2f3642),
    rightLeg: makeInstancedPart(pedestrians.length, 'peru-pedestrian-right-leg', 0x2f3642),
    leftArm: makeInstancedPart(pedestrians.length, 'peru-pedestrian-left-arm', 0xc88d61),
    rightArm: makeInstancedPart(pedestrians.length, 'peru-pedestrian-right-arm', 0xc88d61)
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

function buildTraffic({ animated, rng }) {
  const routes = createTrafficRoutes();
  const vehicles = [];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const route = routes[i % routes.length];
    vehicles.push({
      route,
      distance: rng() * route.length,
      speed: 5.5 + rng() * 4.6,
      lane: (rng() - 0.5) * route.width,
      bus: i % 3 === 0
    });
  }

  const group = new THREE.Group();
  group.name = 'peru-buses-and-mototaxis';
  const parts = {
    body: makeInstancedPart(vehicles.length, 'peru-vehicle-body', 0xf0c234, true),
    roof: makeInstancedPart(vehicles.length, 'peru-vehicle-roof', 0x2f73c8),
    window: makeInstancedPart(vehicles.length, 'peru-vehicle-window', 0x2f5962),
    tireA: makeInstancedPart(vehicles.length, 'peru-vehicle-front-tires', 0x202326),
    tireB: makeInstancedPart(vehicles.length, 'peru-vehicle-rear-tires', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateTraffic(parts, vehicles, elapsed);
    }
  });
  updateTraffic(parts, vehicles, 0);
  return {
    buses: vehicles.filter((vehicle) => vehicle.bus).length,
    mototaxis: vehicles.filter((vehicle) => !vehicle.bus).length
  };
}

function buildLlamas({ animated, rng }) {
  const routes = createLlamaRoutes();
  const llamas = [];
  for (let i = 0; i < LLAMA_COUNT; i += 1) {
    const route = routes[i % routes.length];
    llamas.push({
      route,
      distance: rng() * route.length,
      speed: 1.2 + rng() * 1.8,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2
    });
  }

  const group = new THREE.Group();
  group.name = 'peru-llamas';
  const parts = {
    body: makeInstancedPart(llamas.length, 'peru-llama-body', 0xd8cfb7),
    neck: makeInstancedPart(llamas.length, 'peru-llama-neck', 0xd8cfb7),
    head: makeInstancedPart(llamas.length, 'peru-llama-head', 0xd8cfb7),
    legA: makeInstancedPart(llamas.length, 'peru-llama-legs-a', 0x8f7f68),
    legB: makeInstancedPart(llamas.length, 'peru-llama-legs-b', 0x8f7f68)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateLlamas(parts, llamas, elapsed);
    }
  });
  updateLlamas(parts, llamas, 0);
  return llamas.length;
}

function buildBoats({ animated, rng }) {
  const routes = createBoatRoutes();
  const boats = [];
  for (let i = 0; i < BOAT_COUNT; i += 1) {
    const route = routes[i % routes.length];
    boats.push({
      route,
      distance: rng() * route.length,
      speed: 2.8 + rng() * 2.8,
      lane: (rng() - 0.5) * route.width
    });
  }

  const group = new THREE.Group();
  group.name = 'peru-lake-and-river-boats';
  const parts = {
    hull: makeInstancedPart(boats.length, 'peru-boat-hull', 0x7a4d30),
    cabin: makeInstancedPart(boats.length, 'peru-boat-cabin', 0xf0dfb2),
    sail: makeInstancedPart(boats.length, 'peru-boat-sail', 0xffffff)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateBoats(parts, boats, elapsed);
    }
  });
  updateBoats(parts, boats, 0);
  return boats.length;
}

function makeInstancedPart(count, name, color, vertexColors = false) {
  const material = new THREE.MeshBasicMaterial({ color, vertexColors, fog: false });
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
    { width: 5.2, loop: true, points: [[-12, 20], [34, 20], [34, 60], [-18, 60]] },
    { width: 4.8, loop: false, points: [[-76, -78], [-46, -62], [-20, -50], [10, -72]] },
    { width: 4.8, loop: false, points: [[-132, -44], [-98, -36], [-62, -38], [-42, -62]] },
    { width: 5.0, loop: true, points: [[52, 56], [88, 68], [78, 100], [44, 92]] },
    { width: 5.0, loop: true, points: [[96, 106], [154, 106], [154, 150], [96, 150]] },
    { width: 4.8, loop: true, points: [[-198, -94], [-154, -94], [-154, -56], [-198, -56]] },
    { width: 5.0, loop: true, ellipse: { x: -42, z: -62, rx: 38, rz: 24, segments: 36 } }
  ].map((definition) => {
    const points = definition.ellipse
      ? makeEllipsePoints(definition.ellipse)
      : definition.points.map(([x, z]) => ({ x, z }));
    return prepareRoute({ ...definition, points });
  });
}

function createTrafficRoutes() {
  return [
    { width: 4.0, loop: true, points: [[-72, 34], [72, 34], [72, 82], [-72, 82]] },
    { width: 3.8, loop: true, points: [[-172, -96], [-132, -82], [-132, -54], [-190, -58]] },
    { width: 3.8, loop: true, points: [[-132, -42], [-86, -38], [-48, -58], [-58, -102]] },
    { width: 4.0, loop: true, points: [[94, 92], [164, 96], [164, 150], [94, 150]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createLlamaRoutes() {
  return [
    { width: 5.0, loop: true, points: [[-72, -86], [-44, -72], [-16, -88], [-34, -116]] },
    { width: 5.0, loop: true, points: [[38, 62], [76, 74], [70, 104], [32, 92]] },
    { width: 4.8, loop: false, points: [[-146, -48], [-108, -28], [-70, -42], [-42, -62]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createBoatRoutes() {
  return [
    { width: 7.0, loop: true, points: [[92, 126], [126, 102], [168, 126], [138, 156]] },
    { width: 6.0, loop: true, points: [[120, -16], [154, -28], [196, -14], [152, 4]] },
    { width: 5.0, loop: true, points: [[-220, -88], [-188, -96], [-174, -60], [-218, -56]] }
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
const instanceColor = new THREE.Color();

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

    setPart(parts.body, index, x, y + bob, z, yaw, 0, 1.12, 0, 0.62 * scale, 1.0 * scale, 0.44 * scale);
    if (parts.body.instanceColor) parts.body.setColorAt(index, instanceColor.set(person.shirt));
    setPart(parts.head, index, x, y + bob, z, yaw, 0, 1.86, 0, 0.44 * scale, 0.44 * scale, 0.44 * scale);
    setPart(parts.hat, index, x, y + bob, z, yaw, 0, 2.12, 0, 0.58 * scale, 0.16 * scale, 0.58 * scale);
    setPart(parts.hair, index, x, y + bob, z, yaw, 0, 2.0, -0.08, 0.4 * scale, 0.12 * scale, 0.4 * scale);
    setPart(parts.leftLeg, index, x, y, z, yaw, -0.15, 0.38, stride, 0.16 * scale, 0.66 * scale, 0.16 * scale);
    setPart(parts.rightLeg, index, x, y, z, yaw, 0.15, 0.38, -stride, 0.16 * scale, 0.66 * scale, 0.16 * scale);
    setPart(parts.leftArm, index, x, y + bob, z, yaw, -0.42, 1.05, -stride * 0.6, 0.14 * scale, 0.62 * scale, 0.14 * scale);
    setPart(parts.rightArm, index, x, y + bob, z, yaw, 0.42, 1.05, stride * 0.6, 0.14 * scale, 0.62 * scale, 0.14 * scale);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
}

function updateTraffic(parts, vehicles, elapsed) {
  vehicles.forEach((vehicle, index) => {
    const sample = sampleRoute(vehicle.route, vehicle.distance + elapsed * vehicle.speed);
    const x = sample.x - sample.tangentZ * vehicle.lane;
    const z = sample.z + sample.tangentX * vehicle.lane;
    const y = topY(x, z) + 0.1;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    if (parts.body.instanceColor) parts.body.setColorAt(index, instanceColor.set(vehicle.bus ? 0xd94f45 : 0xf0c84b));
    if (vehicle.bus) {
      setPart(parts.body, index, x, y, z, yaw, 0, 0.85, 0, 2.2, 1.1, 4.4);
      setPart(parts.roof, index, x, y, z, yaw, 0, 1.5, 0, 1.8, 0.34, 3.7);
      setPart(parts.window, index, x, y, z, yaw, 0, 1.35, 0.35, 2.2, 0.38, 2.0);
      setPart(parts.tireA, index, x, y, z, yaw, 0, 0.28, 1.35, 2.3, 0.3, 0.42);
      setPart(parts.tireB, index, x, y, z, yaw, 0, 0.28, -1.35, 2.3, 0.3, 0.42);
    } else {
      setPart(parts.body, index, x, y, z, yaw, 0, 0.58, 0, 1.2, 0.58, 1.9);
      setPart(parts.roof, index, x, y, z, yaw, 0, 1.05, -0.15, 0.8, 0.6, 0.9);
      setPart(parts.window, index, x, y, z, yaw, 0, 1.2, 0.1, 1.1, 0.36, 0.9);
      setPart(parts.tireA, index, x, y, z, yaw, 0, 0.24, 0.82, 1.25, 0.26, 0.24);
      setPart(parts.tireB, index, x, y, z, yaw, 0, 0.24, -0.82, 1.25, 0.26, 0.24);
    }
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
}

function updateLlamas(parts, llamas, elapsed) {
  llamas.forEach((llama, index) => {
    const sample = sampleRoute(llama.route, llama.distance + elapsed * llama.speed);
    const x = sample.x - sample.tangentZ * llama.lane;
    const z = sample.z + sample.tangentX * llama.lane;
    const y = topY(x, z) + 0.08;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const gait = Math.sin(elapsed * 5 + llama.phase) * 0.11;
    setPart(parts.body, index, x, y, z, yaw, 0, 0.78, 0, 1.55, 0.82, 1.05);
    setPart(parts.neck, index, x, y, z, yaw, 0, 1.35, -0.42, 0.34, 1.25, 0.34);
    setPart(parts.head, index, x, y, z, yaw, 0, 2.05, -0.65, 0.52, 0.42, 0.48);
    setPart(parts.legA, index, x, y, z, yaw, -0.42, 0.32, gait, 0.22, 0.62, 0.2);
    setPart(parts.legB, index, x, y, z, yaw, 0.42, 0.32, -gait, 0.22, 0.62, 0.2);
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
    const y = waterY(x, z) + 0.1;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.hull, index, x, y, z, yaw, 0, 0.35, 0, 1.9, 0.52, 4.8);
    setPart(parts.cabin, index, x, y, z, yaw, 0, 0.92, -0.35, 1.1, 0.68, 1.4);
    setPart(parts.sail, index, x, y, z, yaw, 0, 1.55, 0.55, 0.16, 2.2, 1.8);
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
