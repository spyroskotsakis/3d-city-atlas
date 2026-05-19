import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 238;
const TERRAIN_CELL = 4;
const TILE = 3.7;
const PEDESTRIAN_COUNT = 320;
const TRAFFIC_COUNT = 48;
const BOAT_COUNT = 20;
const CABLE_CAR_COUNT = 4;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'brazilTerrain',
  'brazilGrass',
  'tropicalGreen',
  'water',
  'sand',
  'asphalt',
  'cobblestone',
  'concrete',
  'limestone',
  'stucco',
  'brick',
  'terracotta',
  'glass',
  'steel',
  'slate',
  'gold',
  'wood',
  'cloth',
  'ceramic',
  'turquoise',
  'lapis',
  'mosaic',
  'graffiti',
  'vegetation',
  'shadow',
  'crowd',
  'skin'
];

const LANDMARKS = [
  ['Christ the Redeemer', -48, -28, 48, 48],
  ['Corcovado Forest', -58, -46, 74, 64],
  ['Sugarloaf Mountain', 88, 76, 58, 58],
  ['Guanabara Bay', 112, -8, 104, 114],
  ['Copacabana', 24, 126, 114, 28],
  ['Ipanema', -68, 134, 82, 28],
  ['Maracana', -108, -22, 56, 44],
  ['Selaron Steps', -26, 52, 28, 24],
  ['Lapa Arches', -40, 38, 62, 22],
  ['Botanical Garden', -112, 72, 64, 46],
  ['Rodrigo Lagoon', -58, 78, 56, 34],
  ['Hillside Community', -102, -94, 76, 66],
  ['Morro da Providencia', 16, -62, 64, 56],
  ['Sao Paulo', 138, -132, 76, 54],
  ['Brasilia', -152, -134, 76, 52],
  ['Salvador Pelourinho', 148, 108, 58, 42],
  ['Recife and Olinda', 174, 72, 58, 40],
  ['Amazon River', -178, -58, 86, 58],
  ['Pantanal Wetlands', -156, 72, 74, 50],
  ['Iguacu Falls', -180, 154, 72, 50],
  ['Lencois Maranhenses', 156, 24, 70, 48]
];

const WATER_RECTS = [
  { name: 'Rodrigo Lagoon', x: -58, z: 78, width: 54, depth: 30 },
  { name: 'Amazon River', x: -178, z: -58, width: 88, depth: 26 },
  { name: 'Pantanal North', x: -158, z: 62, width: 58, depth: 18 },
  { name: 'Pantanal South', x: -146, z: 88, width: 44, depth: 18 },
  { name: 'Lencois Lagoon A', x: 150, z: 18, width: 22, depth: 10 },
  { name: 'Lencois Lagoon B', x: 172, z: 36, width: 24, depth: 11 },
  { name: 'Iguacu Basin', x: -180, z: 160, width: 62, depth: 16 }
];

function createRng(seed = 0x4252415a) {
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
    Math.max(0, Math.min(1, hsl.s + amount * 0.1)),
    Math.max(0, Math.min(1, hsl.l + amount))
  );
  return tempColor.getHex();
}

function coastZ(x) {
  return 121 + Math.sin((x - 18) * 0.038) * 10 + Math.sin(x * 0.073 + 1.2) * 4;
}

function isInsideRect(x, z, rect, pad = 0) {
  return (
    x >= rect.x - rect.width / 2 - pad &&
    x <= rect.x + rect.width / 2 + pad &&
    z >= rect.z - rect.depth / 2 - pad &&
    z <= rect.z + rect.depth / 2 + pad
  );
}

function isBay(x, z, pad = 0) {
  const nx = (x - 112) / (65 + pad);
  const nz = (z + 10) / (88 + pad);
  const inlet = nx * nx + nz * nz < 1.0 && x > 54 - pad && z < 92 + pad;
  const harbor = x > 62 - pad && x < 178 + pad && z > 20 - pad && z < 94 + pad && Math.sin(z * 0.07) > -0.72;
  return inlet || harbor;
}

function isWaterRect(x, z, pad = 0) {
  return WATER_RECTS.some((rect) => isInsideRect(x, z, rect, pad));
}

function isOcean(x, z, pad = 0) {
  return z >= coastZ(x) - pad;
}

function isWater(x, z, pad = 0) {
  return isOcean(x, z, pad) || isBay(x, z, pad) || isWaterRect(x, z, pad);
}

function isBeach(x, z) {
  return z > coastZ(x) - 16 && z < coastZ(x) - 2 && x > -112 && x < 88 && !isBay(x, z, 2);
}

function isForest(x, z) {
  const tijuca = Math.hypot((x + 86) / 86, (z + 80) / 72) < 1;
  const botanical = x < -78 && z > 42 && z < 110;
  const amazon = x < -138 && z < -26 && z > -96;
  const pantanal = x < -120 && z > 44 && z < 104;
  return tijuca || botanical || amazon || pantanal;
}

function isDunes(x, z) {
  return x > 122 && z > -4 && z < 54;
}

function terrainHeightAt(x, z) {
  const corcovado = Math.exp(-(((x + 48) / 30) ** 2 + ((z + 28) / 32) ** 2)) * 34;
  const sugarloaf = Math.exp(-(((x - 88) / 28) ** 2 + ((z - 76) / 28) ** 2)) * 27;
  const tijuca = Math.exp(-(((x + 92) / 70) ** 2 + ((z + 86) / 62) ** 2)) * 16;
  const coastalHill = Math.exp(-(((x - 26) / 58) ** 2 + ((z + 58) / 50) ** 2)) * 10;
  const iguacuCliff = x < -144 && z > 132 ? Math.max(0, (z - 132) * 0.11) : 0;
  const duneLift = isDunes(x, z) ? Math.sin(x * 0.12 + z * 0.07) * 1.2 + 1.8 : 0;
  const citySlope = Math.max(0, (-z - 8) * 0.009);
  const waterCut = isWater(x, z, -0.6) ? 0.55 : 0;
  const coastDrop = Math.exp(-((z - coastZ(x)) ** 2) / 700) * 0.32;
  return Math.max(
    0.5,
    1.0 + corcovado + sugarloaf + tijuca + coastalHill + iguacuCliff + duneLift + citySlope - waterCut - coastDrop +
      Math.sin(x * 0.028 + z * 0.021) * 0.1
  );
}

export function brazilTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function waterY(x, z) {
  return 0.58 + Math.sin(x * 0.043 + z * 0.037) * 0.035;
}

export function createBrazilScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Brazil voxel material: ${key}`);
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
        const shade = Math.sin(wx * 0.13 + wz * 0.16) * 0.026 + Math.cos(lz * 0.31) * 0.014;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, base);
      }
    }
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildWaterfront({ addTop, addTiledRect, addLabel, rng });
  buildRoadNetwork({ addTop, addTiledRect });
  buildRioLandmarks({ addTop, addTiledRect, addLabel, rng });
  buildFavelaDistricts({ addTop, addTiledRect, addLabel, rng });
  const blocks = buildUrbanBlocks({ planner, batch, addTop, rng });
  buildBrazilRegions({ addTop, addTiledRect, addLabel, rng });
  buildStreetDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const traffic = buildTraffic({ animated, rng });
  const boats = buildBoats({ animated, rng });
  const cableCars = buildCableCars({ animated });

  const { group, total } = batch.build();
  group.name = 'procedural-brazil-rio-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      christ: new THREE.Vector3(-48, topY(-48, -28) + 44, -28),
      sugarloaf: new THREE.Vector3(88, topY(88, 76) + 28, 76),
      copacabana: new THREE.Vector3(24, 10, 126),
      maracana: new THREE.Vector3(-108, 16, -22),
      favela: new THREE.Vector3(-98, topY(-98, -92) + 16, -92),
      amazon: new THREE.Vector3(-178, 12, -58),
      iguacu: new THREE.Vector3(-180, 18, 154),
      aerial: new THREE.Vector3(-8, 18, 28)
    },
    metrics: {
      instances: total,
      pedestrians,
      buses: traffic.buses,
      cyclists: traffic.motorbikes,
      boats,
      trams: cableCars,
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
    ['Avenida Atlantica', 8, 112, 174, 9],
    ['Ipanema Promenade', -72, 118, 84, 8],
    ['Rio Central Axis', -20, 18, 166, 8],
    ['Corcovado Road', -52, -52, 8, 112],
    ['Bay Bridge', 95, 0, 104, 8],
    ['Avenida Paulista', 138, -132, 84, 8],
    ['Brasilia Eixo Monumental', -152, -134, 82, 8]
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
      const material = isBeach(x, z) || isDunes(x, z) ? 'sand' : isForest(x, z) ? 'tropicalGreen' : 'brazilTerrain';
      batch.add(material, x, height / 2 - 0.04, z, TERRAIN_CELL * 1.02, height, TERRAIN_CELL * 1.02);
    }
  }
}

function buildWaterfront({ addTop, addTiledRect, addLabel, rng }) {
  for (let x = -108; x <= 92; x += 6) {
    const z = coastZ(x) - 7;
    addTop('sand', x, z, 6.4, 0.22, 10.2, null, 0, topY(x, z) + 0.02);
    if (x % 24 === 0) addPalm(addTop, x, z - 9 + (rng() - 0.5) * 3, 0.9 + rng() * 0.3);
  }

  addTiledRect('sand', 24, 126, 118, 28, { tile: 3.8, height: 0.18, skipWater: false });
  addTiledRect('sand', -68, 134, 84, 26, { tile: 3.8, height: 0.18, skipWater: false });
  addTiledRect('concrete', 8, 112, 174, 7, { tile: 3.5, height: 0.14, color: '#8b8d88' });
  addTiledRect('concrete', -72, 118, 84, 6, { tile: 3.5, height: 0.14, color: '#8b8d88' });
  addLabel('Copacabana', 24, topY(24, 126) + 8, 126);
  addLabel('Ipanema', -68, topY(-68, 134) + 8, 134);
  addLabel('Guanabara Bay', 112, waterY(112, -8) + 8, -8);

  for (let i = 0; i < 34; i += 1) {
    const x = -92 + rng() * 164;
    const z = coastZ(x) - 10 + rng() * 12;
    addTop(i % 3 === 0 ? 'turquoise' : i % 3 === 1 ? 'ceramic' : 'cloth', x, z, 2.4, 0.16, 1.5, null, rng() * 0.7);
    if (i % 4 === 0) {
      addTop('wood', x + 1.2, z - 0.4, 0.18, 1.3, 0.18);
      addTop('cloth', x + 1.2, z - 0.4, 2.4, 0.18, 2.4, [0xf2d34f, 0x2da6d7, 0xe35d46, 0x58a95b][i % 4], 0, topY(x, z) + 1.25);
    }
  }

  addTiledRect('water', -58, 78, 54, 30, { tile: 3.6, height: 0.16, skipWater: false, baseOffset: 0 });
  addTiledRect('concrete', -58, 78, 62, 38, { tile: 4, height: 0.12, color: '#8b8d88' });
  addLabel('Rodrigo de Freitas Lagoon', -58, topY(-58, 78) + 9, 78);
}

function buildRoadNetwork({ addTiledRect }) {
  addTiledRect('asphalt', -20, 18, 166, 7.8, { tile: 3.5, height: 0.12, color: '#34383d' });
  addTiledRect('asphalt', 8, 112, 174, 7.4, { tile: 3.5, height: 0.12, color: '#34383d' });
  addTiledRect('asphalt', -52, -52, 8, 112, { tile: 3.4, height: 0.12, color: '#34383d', yaw: -0.38 });
  addTiledRect('asphalt', 95, 0, 104, 7.0, { tile: 3.4, height: 0.12, color: '#34383d', yaw: -0.24, skipWater: false, baseOffset: 1.6 });
  addTiledRect('asphalt', 138, -132, 84, 7.8, { tile: 3.4, height: 0.12, color: '#34383d' });
  addTiledRect('asphalt', -152, -134, 82, 7.6, { tile: 3.4, height: 0.12, color: '#34383d' });

  for (let x = -92; x <= 72; x += 24) {
    addTiledRect('cobblestone', x, 32, 5.4, 126, { tile: 3.5, height: 0.12, color: '#77766d' });
  }
  for (let z = -34; z <= 94; z += 24) {
    addTiledRect('cobblestone', -8, z, 142, 5.4, { tile: 3.5, height: 0.12, color: '#77766d' });
  }
}

function buildRioLandmarks({ addTop, addTiledRect, addLabel, rng }) {
  buildChrist(addTop, addTiledRect, addLabel, rng);
  buildSugarloaf(addTop, addTiledRect, addLabel);
  buildMaracana(addTop, addTiledRect, addLabel, rng);
  buildLapaAndSelaron(addTop, addTiledRect, addLabel);
  buildBotanicalGarden(addTop, addTiledRect, addLabel, rng);
}

function buildChrist(addTop, addTiledRect, addLabel, rng) {
  const x = -48;
  const z = -28;
  const base = topY(x, z);
  addTiledRect('concrete', x, z, 24, 20, { tile: 3.4, height: 0.16, color: '#8b8d88' });
  addTop('limestone', x, z, 7.2, 8, 6.2, null, 0, base);
  addTop('limestone', x, z, 4.2, 13, 2.6, null, 0, base + 8);
  addTop('limestone', x, z, 2.4, 9.2, 2.0, null, 0, base + 21);
  addTop('limestone', x, z, 24, 1.3, 1.5, null, 0, base + 23);
  addTop('limestone', x, z - 0.25, 2.6, 2.4, 2.3, null, 0, base + 30.2);
  addTop('gold', x, z + 0.2, 4.2, 0.35, 0.35, 0xf2cf64, 0, base + 33.2);

  for (let i = 0; i < 44; i += 1) {
    const px = x + (rng() - 0.5) * 28;
    const pz = z + 10 + (rng() - 0.5) * 12;
    addTop('crowd', px, pz, 0.5, 0.98, 0.5);
    addTop('skin', px, pz, 0.32, 0.32, 0.32, null, 0, topY(px, pz) + 0.96);
  }
  addLabel('Christ the Redeemer', x, base + 39, z);
}

function buildSugarloaf(addTop, addTiledRect, addLabel) {
  const x = 88;
  const z = 76;
  const base = topY(x, z);
  addTop('concrete', x - 16, z + 12, 16, 4, 12, null, 0, topY(x - 16, z + 12));
  addTop('concrete', x + 17, z - 4, 15, 4, 11, null, 0, topY(x + 17, z - 4));
  addTop('steel', x - 6, z + 4, 48, 0.32, 0.32, 0x3f4648, -0.46, base + 24);
  addTop('steel', x - 6, z + 5.5, 48, 0.32, 0.32, 0x3f4648, -0.46, base + 26);
  addTop('turquoise', x + 3, z + 3, 3.4, 2.1, 2.4, 0x58bfc5, -0.46, base + 20);
  addTiledRect('concrete', 66, 92, 22, 15, { tile: 3.4, height: 0.14, color: '#8b8d88' });
  addLabel('Sugarloaf Mountain', x, base + 33, z);
}

function buildMaracana(addTop, addTiledRect, addLabel, rng) {
  const x = -108;
  const z = -22;
  const base = topY(x, z);
  addTiledRect('concrete', x, z, 62, 48, { tile: 3.4, height: 0.16, color: '#8b8d88' });
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * Math.PI * 2;
    const px = x + Math.cos(a) * 26;
    const pz = z + Math.sin(a) * 19;
    addTop(i % 2 ? 'concrete' : 'limestone', px, pz, 4.2, 8, 3.2, null, a);
  }
  addTop('brazilGrass', x, z, 34, 0.22, 20, 0x5c944f, 0, base + 0.18);
  addTop('gold', x, z, 1.0, 7, 1.0, 0xf0d45c);
  for (let i = 0; i < 32; i += 1) {
    addTop('crowd', x - 24 + rng() * 48, z - 17 + rng() * 34, 0.45, 0.92, 0.45);
  }
  addLabel('Maracana', x, base + 18, z);
}

function buildLapaAndSelaron(addTop, addTiledRect, addLabel) {
  addTiledRect('cobblestone', -34, 44, 78, 26, { tile: 3.3, height: 0.12, color: '#77766d' });
  for (let i = 0; i < 9; i += 1) {
    const x = -66 + i * 7.4;
    addTop('limestone', x, 38, 1.6, 9, 1.4);
    addTop('limestone', x + 3.7, 38, 1.6, 9, 1.4);
    addTop('limestone', x + 1.85, 38, 5.8, 1.3, 1.4, null, 0, topY(x + 1.85, 38) + 8.8);
  }
  addLabel('Lapa Arches', -34, topY(-34, 38) + 14, 38);

  for (let i = 0; i < 16; i += 1) {
    const color = [0xd94f45, 0x2da6d7, 0xf2d34f, 0x58a95b, 0xd46ac4][i % 5];
    addTop(i % 2 ? 'mosaic' : 'ceramic', -25, 52 - i * 1.15, 10 - i * 0.25, 0.32, 1.2, color, 0, topY(-25, 52 - i * 1.15) + i * 0.24);
  }
  addLabel('Selaron Steps', -25, topY(-25, 52) + 9, 52);
}

function buildBotanicalGarden(addTop, addTiledRect, addLabel, rng) {
  addTiledRect('brazilGrass', -112, 72, 66, 48, { tile: 3.7, height: 0.16, color: '#4f7c42' });
  for (let i = 0; i < 44; i += 1) {
    const x = -140 + (i % 8) * 8 + (rng() - 0.5) * 2;
    const z = 54 + Math.floor(i / 8) * 8 + (rng() - 0.5) * 2;
    addPalm(addTop, x, z, 1 + rng() * 0.32);
  }
  addTop('glass', -96, 88, 18, 6, 10, 0x9bd7c7);
  addLabel('Botanical Garden', -112, topY(-112, 72) + 12, 72);
}

function buildFavelaDistricts({ addTop, addTiledRect, addLabel, rng }) {
  buildFavela({
    addTop,
    rng,
    centerX: -104,
    centerZ: -94,
    width: 70,
    depth: 60,
    count: 160,
    label: 'Hillside Community'
  });
  buildFavela({
    addTop,
    rng,
    centerX: 16,
    centerZ: -62,
    width: 56,
    depth: 50,
    count: 110,
    label: 'Morro da Providencia'
  });

  addTiledRect('asphalt', -116, -70, 24, 15, { tile: 3.2, height: 0.12, color: '#3e673e' });
  addTop('limestone', -116, -70, 22, 0.18, 0.45, 0xffffff, 0, topY(-116, -70) + 0.18);
  addTop('limestone', -116, -70, 0.45, 0.18, 13, 0xffffff, 0, topY(-116, -70) + 0.18);
  addLabel('Hillside Community', -102, topY(-102, -94) + 25, -94);
  addLabel('Morro da Providencia', 16, topY(16, -62) + 22, -62);
}

function buildFavela({ addTop, rng, centerX, centerZ, width, depth, count }) {
  const colors = [0xd66b45, 0x4b9ac2, 0xf0c95a, 0x7fb35d, 0xd8a0b7, 0xd9c28a, 0x9b7d5b];
  for (let i = 0; i < count; i += 1) {
    const gx = (i % 16) / 15 - 0.5;
    const gz = Math.floor(i / 16) / Math.max(1, Math.floor(count / 16)) - 0.5;
    const x = centerX + gx * width + (rng() - 0.5) * 4.2;
    const z = centerZ + gz * depth + (rng() - 0.5) * 4.2;
    if (isWater(x, z, 2)) continue;
    const sx = 3.0 + rng() * 2.4;
    const sz = 3.0 + rng() * 2.2;
    const sy = 2.2 + rng() * 4.0;
    const color = colors[i % colors.length];
    const base = topY(x, z);
    addTop(i % 3 ? 'stucco' : 'brick', x, z, sx, sy, sz, color, 0, base);
    addTop('terracotta', x, z, sx + 0.5, 0.5, sz + 0.5, 0xb96038, 0, base + sy);
    if (i % 8 === 0) addTop('water', x + sx * 0.18, z - sz * 0.1, 1.2, 1.1, 1.2, 0x2f5962, 0, base + sy + 0.5);
    if (i % 7 === 0) addTop('cloth', x + sx / 2 + 0.3, z, 0.18, 0.8, 2.8, [0xf0dfb2, 0x2da6d7, 0xe35d46][i % 3], 0, base + 1.2);
  }

  for (let i = 0; i < 12; i += 1) {
    addTop('cobblestone', centerX - width * 0.42 + i * 5.5, centerZ + depth * 0.42 - i * 3.8, 5.0, 0.18, 1.8, null, -0.55);
  }
}

function buildUrbanBlocks({ planner, batch, addTop, rng }) {
  let placed = 0;
  const xs = [-80, -60, -40, -20, 0, 20, 40, 60, 80];
  const zs = [-20, 4, 28, 52, 76, 100];

  for (const x of xs) {
    for (const z of zs) {
      const width = 7 + rng() * 6;
      const depth = 7 + rng() * 6;
      if (!planner.reserveRect(`rio-block-${placed}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
      const beachBoost = z > 70 ? 10 + rng() * 12 : 0;
      const centralBoost = Math.max(0, 1 - Math.hypot(x - 8, z - 22) / 86) * 18;
      const height = 7 + rng() * 15 + beachBoost + centralBoost;
      buildBuilding(batch, addTop, x, z, width, depth, height, rng);
      placed += 1;
    }
  }

  return placed;
}

function buildBuilding(batch, addTop, x, z, width, depth, height, rng) {
  const material = rng() > 0.72 ? 'glass' : rng() > 0.45 ? 'stucco' : 'concrete';
  const base = topY(x, z);
  const color = material === 'stucco' ? vary('#d8bf92', (rng() - 0.5) * 0.22) : null;
  addTop(material, x, z, width, height, depth, color, 0, base);
  addTop(rng() > 0.5 ? 'slate' : 'terracotta', x, z, width + 0.7, 0.8, depth + 0.7, null, 0, base + height);

  for (let floor = 1; floor < Math.min(12, Math.floor(height / 2.8)); floor += 1) {
    const y = base + floor * 2.6;
    batch.addTop('shadow', x, y, z + depth / 2 + 0.12, Math.max(2.2, width * 0.62), 0.55, 0.24);
    if (floor % 2 === 0) batch.addTop('shadow', x + width / 2 + 0.12, y, z, 0.24, 0.55, Math.max(2.2, depth * 0.62));
  }
}

function buildBrazilRegions({ addTop, addTiledRect, addLabel, rng }) {
  buildSaoPaulo(addTop, addTiledRect, addLabel, rng);
  buildBrasilia(addTop, addTiledRect, addLabel);
  buildColonialCoast(addTop, addTiledRect, addLabel, rng);
  buildAmazonPantanalAndFalls(addTop, addTiledRect, addLabel, rng);
  buildLencois(addTop, addTiledRect, addLabel, rng);
}

function buildSaoPaulo(addTop, addTiledRect, addLabel, rng) {
  addTiledRect('asphalt', 138, -132, 86, 8, { tile: 3.4, height: 0.12, color: '#34383d' });
  for (let i = 0; i < 24; i += 1) {
    const x = 106 + (i % 8) * 9.2;
    const z = -154 + Math.floor(i / 8) * 16;
    const h = 12 + rng() * 34;
    addTop(i % 3 === 0 ? 'glass' : 'concrete', x, z, 6.4, h, 6.4, i % 3 === 0 ? 0x8fc3cb : null);
    if (i % 5 === 0) addTop('steel', x, z, 2.4, 2.2, 2.4, 0x687073, 0, topY(x, z) + h);
  }
  addLabel('Sao Paulo Skyline', 138, topY(138, -132) + 42, -132);
}

function buildBrasilia(addTop, addTiledRect, addLabel) {
  addTiledRect('concrete', -152, -134, 86, 30, { tile: 3.5, height: 0.14, color: '#8b8d88' });
  addTop('glass', -152, -134, 4, 24, 4, 0x9cc8c8);
  addTop('glass', -142, -134, 4, 24, 4, 0x9cc8c8);
  addTop('limestone', -166, -126, 14, 3.6, 14, null);
  addTop('limestone', -128, -126, 14, 3.6, 14, null);
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    addTop('limestone', -148 + Math.cos(a) * 20, -154 + Math.sin(a) * 14, 1.3, 9, 1.3, null, a);
  }
  addLabel('Brasilia Civic Core', -152, topY(-152, -134) + 30, -134);
}

function buildColonialCoast(addTop, addTiledRect, addLabel, rng) {
  addTiledRect('cobblestone', 148, 108, 60, 42, { tile: 3.4, height: 0.12, color: '#77766d' });
  for (let i = 0; i < 26; i += 1) {
    const x = 124 + (i % 7) * 7.8;
    const z = 94 + Math.floor(i / 7) * 9.2;
    addTop('stucco', x, z, 5.6, 5.8 + rng() * 2.6, 5.2, [0xe4b45f, 0x6fb0c5, 0xd96b59, 0xf0dfb2][i % 4]);
    addTop('terracotta', x, z, 6.2, 0.6, 5.8, null, 0, topY(x, z) + 6.2);
  }
  addTop('limestone', 150, 92, 12, 13, 8, null);
  addTop('gold', 150, 88, 1.0, 7, 1.0, 0xf0d45c);
  addLabel('Salvador Pelourinho', 148, topY(148, 108) + 18, 108);

  addTiledRect('water', 174, 72, 58, 38, { tile: 3.6, height: 0.14, skipWater: false, baseOffset: 0 });
  for (let i = 0; i < 4; i += 1) {
    addTop('concrete', 154 + i * 12, 72, 10, 0.7, 2.2, null, Math.PI * 0.1, waterY(174, 72) + 0.3);
  }
  addLabel('Recife and Olinda', 174, topY(174, 72) + 13, 72);
}

function buildAmazonPantanalAndFalls(addTop, addTiledRect, addLabel, rng) {
  addTiledRect('water', -178, -58, 90, 28, { tile: 3.6, height: 0.14, skipWater: false, baseOffset: 0 });
  for (let i = 0; i < 70; i += 1) {
    const x = -218 + rng() * 80;
    const z = -94 + rng() * 70;
    addPalm(addTop, x, z, 0.85 + rng() * 0.45);
  }
  for (let i = 0; i < 10; i += 1) {
    const x = -204 + (i % 5) * 10;
    const z = -36 + Math.floor(i / 5) * 9;
    addTop('wood', x, z, 5.8, 3.2, 4.6);
    addTop('terracotta', x, z, 6.4, 0.5, 5.2, null, 0, topY(x, z) + 3.2);
    addTop('wood', x, z, 0.5, 2.4, 0.5, null, 0, topY(x, z) - 1.4);
  }
  addLabel('Amazon River Settlements', -178, topY(-178, -58) + 14, -58);

  addTiledRect('water', -156, 72, 74, 42, { tile: 3.6, height: 0.14, skipWater: false, baseOffset: 0 });
  for (let i = 0; i < 36; i += 1) {
    addPalm(addTop, -188 + rng() * 68, 48 + rng() * 54, 0.75 + rng() * 0.25);
  }
  addLabel('Pantanal Wetlands', -156, topY(-156, 72) + 10, 72);

  addTiledRect('sandstone', -180, 154, 70, 22, { tile: 3.5, height: 0.18, color: '#9b7a4e' });
  for (let i = 0; i < 9; i += 1) {
    addTop('water', -210 + i * 7, 160, 4.8, 9 + (i % 3) * 2.5, 2.2, 0x5db7c9, 0, topY(-210 + i * 7, 160) + 0.8);
  }
  addLabel('Iguacu Falls', -180, topY(-180, 154) + 18, 154);
}

function buildLencois(addTop, addTiledRect, addLabel, rng) {
  addTiledRect('sand', 156, 24, 72, 50, { tile: 3.5, height: 0.16, color: '#d8bc78' });
  for (let i = 0; i < 22; i += 1) {
    const x = 126 + rng() * 62;
    const z = 2 + rng() * 44;
    addTop('sand', x, z, 8 + rng() * 7, 1.2 + rng() * 1.4, 3.4, null, rng() * 1.2, topY(x, z));
  }
  addTiledRect('turquoise', 150, 18, 24, 10, { tile: 3.4, height: 0.12, skipWater: false, baseOffset: 0.02 });
  addTiledRect('turquoise', 172, 36, 26, 11, { tile: 3.4, height: 0.12, skipWater: false, baseOffset: 0.02 });
  addLabel('Lencois Maranhenses', 156, topY(156, 24) + 12, 24);
}

function buildStreetDetails({ planner, addTop, rng }) {
  const roads = planner.reservations.filter((item) => item.type === 'road');
  for (let i = 0; i < 190; i += 1) {
    const road = roads[i % roads.length];
    const x = road.x1 + rng() * (road.x2 - road.x1);
    const z = road.z1 + rng() * (road.z2 - road.z1);
    if (isWater(x, z, 1.6)) continue;
    if (i % 7 === 0) {
      addPalm(addTop, x, z, 0.78 + rng() * 0.22);
    } else if (i % 5 === 0) {
      addTop('wood', x, z, 2.7, 1.5, 2.0, 0x7a4d30);
      addTop('cloth', x, z - 1.2, 2.8, 0.3, 0.32, [0xf2d34f, 0xe35d46, 0x2da6d7][i % 3], 0, topY(x, z) + 1.5);
    } else {
      addTop('steel', x, z, 0.34, 3.2, 0.34, 0x3d4143);
      addTop('gold', x, z, 0.7, 0.45, 0.7, 0xf2cf64, 0, topY(x, z) + 3.1);
    }
  }
}

function addPalm(addTop, x, z, scale = 1) {
  if (isWater(x, z, 1)) return;
  const base = topY(x, z);
  addTop('wood', x, z, 0.65 * scale, 5.2 * scale, 0.65 * scale, 0x7a4d30, 0, base);
  addTop('vegetation', x, z, 4.0 * scale, 1.0 * scale, 1.3 * scale, 0x477a36, Math.PI * 0.16, base + 5.0 * scale);
  addTop('vegetation', x, z, 1.3 * scale, 1.0 * scale, 4.0 * scale, 0x477a36, -Math.PI * 0.16, base + 5.2 * scale);
  addTop('vegetation', x, z, 3.0 * scale, 1.0 * scale, 3.0 * scale, 0x5d8d42, Math.PI * 0.25, base + 5.4 * scale);
}

function buildPedestrians({ animated, rng }) {
  const routes = createPedestrianRoutes();
  const pedestrians = [];
  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    pedestrians.push({
      route,
      distance: rng() * route.length,
      speed: 2.8 + rng() * 4.6,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.92 + rng() * 0.34,
      shirt: [0x2d8f6f, 0xf2c84b, 0x2f73c8, 0xde5947, 0xffffff, 0xa655b0][i % 6]
    });
  }

  const group = new THREE.Group();
  group.name = 'brazil-street-crowds';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'brazil-pedestrian-body', 0x2f73c8, true),
    head: makeInstancedPart(pedestrians.length, 'brazil-pedestrian-head', 0xc88d61),
    hair: makeInstancedPart(pedestrians.length, 'brazil-pedestrian-hair', 0x3d2f28),
    leftLeg: makeInstancedPart(pedestrians.length, 'brazil-pedestrian-left-leg', 0x2f3642),
    rightLeg: makeInstancedPart(pedestrians.length, 'brazil-pedestrian-right-leg', 0x2f3642),
    leftArm: makeInstancedPart(pedestrians.length, 'brazil-pedestrian-left-arm', 0xc88d61),
    rightArm: makeInstancedPart(pedestrians.length, 'brazil-pedestrian-right-arm', 0xc88d61)
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
      speed: 7 + rng() * 6,
      lane: (rng() - 0.5) * route.width,
      bus: i % 4 === 0
    });
  }

  const group = new THREE.Group();
  group.name = 'brazil-buses-and-motorbikes';
  const parts = {
    body: makeInstancedPart(vehicles.length, 'brazil-vehicle-body', 0xf0c234, true),
    roof: makeInstancedPart(vehicles.length, 'brazil-vehicle-roof', 0x2f73c8),
    window: makeInstancedPart(vehicles.length, 'brazil-vehicle-window', 0x2f5962),
    tireA: makeInstancedPart(vehicles.length, 'brazil-vehicle-front-tires', 0x202326),
    tireB: makeInstancedPart(vehicles.length, 'brazil-vehicle-rear-tires', 0x202326)
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
    motorbikes: vehicles.filter((vehicle) => !vehicle.bus).length
  };
}

function buildBoats({ animated, rng }) {
  const routes = createBoatRoutes();
  const boats = [];
  for (let i = 0; i < BOAT_COUNT; i += 1) {
    const route = routes[i % routes.length];
    boats.push({
      route,
      distance: rng() * route.length,
      speed: 4.2 + rng() * 3.6,
      lane: (rng() - 0.5) * route.width
    });
  }

  const group = new THREE.Group();
  group.name = 'brazil-bay-and-river-boats';
  const parts = {
    hull: makeInstancedPart(boats.length, 'brazil-boat-hull', 0x7a4d30),
    cabin: makeInstancedPart(boats.length, 'brazil-boat-cabin', 0xf0dfb2),
    sail: makeInstancedPart(boats.length, 'brazil-boat-sail', 0xffffff)
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

function buildCableCars({ animated }) {
  const cars = [];
  for (let i = 0; i < CABLE_CAR_COUNT; i += 1) {
    cars.push({
      t: i / CABLE_CAR_COUNT,
      speed: 0.025 + (i % 2) * 0.012
    });
  }

  const mesh = makeInstancedPart(cars.length, 'brazil-sugarloaf-cable-cars', 0x58bfc5);
  animated.push({
    object: mesh,
    update(elapsed) {
      updateCableCars(mesh, cars, elapsed);
    }
  });
  updateCableCars(mesh, cars, 0);
  return cars.length;
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
    { width: 5.8, loop: false, points: [[-88, 112], [-40, 112], [24, 112], [84, 112]] },
    { width: 5.4, loop: true, points: [[-46, 32], [-18, 18], [26, 24], [52, 58], [10, 82], [-42, 68]] },
    { width: 4.8, loop: false, points: [[-132, -82], [-104, -94], [-68, -70], [-48, -28]] },
    { width: 4.8, loop: true, points: [[-122, -44], [-92, -28], [-92, 4], [-122, 2]] },
    { width: 5.2, loop: true, points: [[-124, 54], [-92, 54], [-92, 92], [-124, 92]] },
    { width: 5.2, loop: true, points: [[112, -154], [174, -154], [174, -108], [112, -108]] },
    { width: 4.8, loop: false, points: [[-206, -42], [-178, -58], [-142, -48]] },
    { width: 5.0, loop: true, ellipse: { x: 24, z: 126, rx: 54, rz: 14, segments: 36 } }
  ].map((definition) => {
    const points = definition.ellipse
      ? makeEllipsePoints(definition.ellipse)
      : definition.points.map(([x, z]) => ({ x, z }));
    return prepareRoute({ ...definition, points });
  });
}

function createTrafficRoutes() {
  return [
    { width: 4.2, loop: true, points: [[-90, 112], [82, 112], [82, 28], [-80, 28]] },
    { width: 4.0, loop: true, points: [[-86, 18], [92, 18], [92, -8], [-86, -8]] },
    { width: 4.0, loop: true, points: [[-52, -92], [-52, -28], [-26, 24], [42, 24], [74, -4], [28, -64]] },
    { width: 4.0, loop: true, points: [[104, -132], [174, -132], [174, -104], [104, -104]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createBoatRoutes() {
  return [
    { width: 8.0, loop: true, points: [[72, -72], [142, -64], [166, 20], [108, 76], [68, 42]] },
    { width: 7.0, loop: true, points: [[-220, -58], [-178, -66], [-136, -54], [-174, -42]] },
    { width: 6.0, loop: true, points: [[-186, 62], [-148, 70], [-120, 88], [-162, 92]] }
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

    setPart(parts.body, index, x, y + bob, z, yaw, 0, 1.13, 0, 0.62 * scale, 1.02 * scale, 0.44 * scale);
    if (parts.body.instanceColor) parts.body.setColorAt(index, instanceColor.set(person.shirt));
    setPart(parts.head, index, x, y + bob, z, yaw, 0, 1.88, 0, 0.46 * scale, 0.46 * scale, 0.46 * scale);
    setPart(parts.hair, index, x, y + bob, z, yaw, 0, 2.12, -0.03, 0.44 * scale, 0.13 * scale, 0.44 * scale);
    setPart(parts.leftLeg, index, x, y, z, yaw, -0.15, 0.38, stride, 0.16 * scale, 0.68 * scale, 0.16 * scale);
    setPart(parts.rightLeg, index, x, y, z, yaw, 0.15, 0.38, -stride, 0.16 * scale, 0.68 * scale, 0.16 * scale);
    setPart(parts.leftArm, index, x, y + bob, z, yaw, -0.43, 1.05, -stride * 0.65, 0.14 * scale, 0.64 * scale, 0.14 * scale);
    setPart(parts.rightArm, index, x, y + bob, z, yaw, 0.43, 1.05, stride * 0.65, 0.14 * scale, 0.64 * scale, 0.14 * scale);
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
    const color = vehicle.bus ? 0xf2c84b : [0xd94f45, 0x2f73c8, 0x2d8f6f][index % 3];
    if (parts.body.instanceColor) parts.body.setColorAt(index, instanceColor.set(color));
    if (vehicle.bus) {
      setPart(parts.body, index, x, y, z, yaw, 0, 0.9, 0, 2.4, 1.2, 5.2);
      setPart(parts.roof, index, x, y, z, yaw, 0, 1.6, -0.1, 2.0, 0.35, 4.3);
      setPart(parts.window, index, x, y, z, yaw, 0, 1.45, 0.4, 2.45, 0.42, 2.5);
      setPart(parts.tireA, index, x, y, z, yaw, 0, 0.32, 1.65, 2.55, 0.32, 0.44);
      setPart(parts.tireB, index, x, y, z, yaw, 0, 0.32, -1.65, 2.55, 0.32, 0.44);
    } else {
      setPart(parts.body, index, x, y, z, yaw, 0, 0.58, 0, 0.85, 0.42, 1.7);
      setPart(parts.roof, index, x, y, z, yaw, 0, 1.1, -0.16, 0.5, 0.72, 0.5);
      setPart(parts.window, index, x, y, z, yaw, 0, 1.45, -0.2, 0.42, 0.42, 0.42);
      setPart(parts.tireA, index, x, y, z, yaw, 0, 0.26, 0.76, 0.95, 0.28, 0.24);
      setPart(parts.tireB, index, x, y, z, yaw, 0, 0.26, -0.76, 0.95, 0.28, 0.24);
    }
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
}

function updateBoats(parts, boats, elapsed) {
  boats.forEach((boat, index) => {
    const sample = sampleRoute(boat.route, boat.distance + elapsed * boat.speed);
    const x = sample.x - sample.tangentZ * boat.lane;
    const z = sample.z + sample.tangentX * boat.lane;
    const y = waterY(x, z) + 0.1;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.hull, index, x, y, z, yaw, 0, 0.35, 0, 2.0, 0.55, 5.2);
    setPart(parts.cabin, index, x, y, z, yaw, 0, 0.95, -0.45, 1.2, 0.72, 1.6);
    setPart(parts.sail, index, x, y, z, yaw, 0, 1.65, 0.55, 0.18, 2.5, 2.0);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateCableCars(mesh, cars, elapsed) {
  const ax = 58;
  const az = 92;
  const ay = topY(ax, az) + 18;
  const bx = 108;
  const bz = 64;
  const by = topY(bx, bz) + 24;
  const yaw = Math.atan2(bx - ax, bz - az);
  cars.forEach((car, index) => {
    const t = (car.t + elapsed * car.speed) % 1;
    const wave = t < 0.5 ? t * 2 : (1 - t) * 2;
    const x = ax + (bx - ax) * wave;
    const z = az + (bz - az) * wave;
    const y = ay + (by - ay) * wave;
    setPart(mesh, index, x, y, z, yaw, 0, 0, 0, 3.2, 2.0, 2.3);
  });
  mesh.instanceMatrix.needsUpdate = true;
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
