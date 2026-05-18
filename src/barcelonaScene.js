import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 216;
const TERRAIN_CELL = 4;
const TILE = 3.6;
const PEDESTRIAN_COUNT = 260;
const TRAFFIC_COUNT = 54;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'barcelonaTerrain',
  'barcelonaGrass',
  'mosaic',
  'ceramic',
  'water',
  'sand',
  'cobblestone',
  'asphalt',
  'concrete',
  'limestone',
  'stucco',
  'terracotta',
  'brick',
  'glass',
  'iron',
  'gold',
  'turquoise',
  'lapis',
  'wood',
  'cloth',
  'vegetation',
  'shadow',
  'crowd',
  'skin'
];

const LANDMARKS = [
  ['Sagrada Familia', 0, -34, 72, 74],
  ['Sagrada Plaza', 0, -34, 94, 94],
  ['Park Guell', -70, -150, 82, 58],
  ['Casa Batllo', -38, 14, 26, 24],
  ['Casa Mila', -16, -2, 32, 26],
  ['Casa Vicens', -92, -72, 28, 24],
  ['Torre Bellesguard', -132, -164, 34, 28],
  ['Palau Guell', -82, 78, 34, 28],
  ['Placa Catalunya', -46, 48, 48, 42],
  ['La Rambla', -78, 82, 18, 92],
  ['Barri Gotic', -46, 104, 72, 54],
  ['Barcelona Cathedral', -38, 94, 42, 34],
  ['Arc de Triomf', 50, 54, 36, 24],
  ['Palau Musica', 12, 74, 34, 26],
  ['Port Vell', -18, 156, 74, 34],
  ['Barceloneta Beach', 74, 170, 92, 32],
  ['Montjuic', -138, 122, 82, 64],
  ['Magic Fountain', -118, 88, 42, 28],
  ['Tibidabo', -154, -204, 48, 34],
  ['Camp Nou', -174, 12, 62, 46]
];

function createRng(seed = 0x42434e31) {
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

function coastZ(x) {
  return 142 + Math.sin((x - 24) * 0.035) * 9 + Math.sin(x * 0.071 + 1.1) * 4;
}

function isSea(x, z, pad = 0) {
  return z >= coastZ(x) - pad;
}

function isHillZone(x, z) {
  return z < -122 || (x < -112 && z < -52) || (x < -134 && z < 82);
}

function terrainHeightAt(x, z) {
  const guellHill = Math.exp(-(((x + 72) / 78) ** 2 + ((z + 148) / 56) ** 2)) * 7.5;
  const tibidabo = Math.exp(-(((x + 154) / 60) ** 2 + ((z + 204) / 44) ** 2)) * 13.5;
  const montjuic = Math.exp(-(((x + 138) / 66) ** 2 + ((z - 120) / 62) ** 2)) * 8.8;
  const citySlope = Math.max(0, (-z - 30) * 0.013);
  const coastDrop = Math.exp(-((z - coastZ(x)) ** 2) / 900) * 0.36;
  return Math.max(0.52, 1.04 + citySlope + guellHill + tibidabo + montjuic - coastDrop + Math.sin(x * 0.027 + z * 0.022) * 0.08);
}

export function barcelonaTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function waterY(x, z) {
  return 0.58 + Math.sin(x * 0.045 + z * 0.031) * 0.035;
}

export function createBarcelonaScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Barcelona voxel material: ${key}`);
  }

  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 6, isRiver: isSea });
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
        if (skipWater && isSea(wx, wz, -0.7)) continue;
        const base = skipWater ? topY(wx, wz) + baseOffset : waterY(wx, wz) + baseOffset;
        const shade = Math.sin(wx * 0.11 + wz * 0.17) * 0.026 + Math.cos(lz * 0.25) * 0.012;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, base);
      }
    }
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildCoastAndParks({ addTop, addTiledRect, addLabel, rng });
  buildRoadNetwork({ addTop, addTiledRect, planner });
  buildSagradaFamilia({ addTop, addTiledRect, addLabel, rng });
  buildGaudiLandmarks({ addTop, addTiledRect, addLabel, rng });
  buildCivicLandmarks({ addTop, addTiledRect, addLabel, rng });
  const blocks = buildUrbanBlocks({ planner, batch, addTop, rng });
  buildStreetDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const traffic = buildTraffic({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-barcelona-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      sagrada: new THREE.Vector3(0, 54, -34),
      parkGuell: new THREE.Vector3(-70, 22, -150),
      passeig: new THREE.Vector3(-28, 12, 8),
      gothic: new THREE.Vector3(-46, 14, 104),
      waterfront: new THREE.Vector3(-18, 10, 156),
      montjuic: new THREE.Vector3(-138, 28, 122),
      tibidabo: new THREE.Vector3(-154, 34, -204),
      aerial: new THREE.Vector3(-24, 10, 22)
    },
    metrics: {
      instances: total,
      pedestrians,
      cyclists: traffic.bikes,
      buses: traffic.buses,
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
    ['Passeig de Gracia', -26, 4, 12, 166],
    ['Avinguda Diagonal', 10, -40, 178, 12],
    ['Gran Via', 8, 36, 190, 10],
    ['La Rambla Spine', -78, 82, 12, 110],
    ['Waterfront Promenade', 18, 144, 156, 10]
  ].forEach(([tag, x, z, width, depth]) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
  });
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isSea(x, z, -0.8)) {
        batch.addTop('water', x, waterY(x, z) - 0.18, z, TERRAIN_CELL * 1.04, 0.18, TERRAIN_CELL * 1.04);
        continue;
      }

      const height = terrainHeightAt(x, z);
      const material = isHillZone(x, z) || (z > 118 && x < -104) ? 'barcelonaGrass' : 'barcelonaTerrain';
      batch.add(material, x, height / 2 - 0.04, z, TERRAIN_CELL * 1.02, height, TERRAIN_CELL * 1.02);
    }
  }
}

function buildCoastAndParks({ addTop, addTiledRect, addLabel, rng }) {
  for (let x = -160; x <= 160; x += 8) {
    const z = coastZ(x) - 4;
    addTop('sand', x, z, 8.4, 0.22, 11, null, 0, topY(x, z) + 0.02);
    if (x % 24 === 0) addPalm(addTop, x, z - 8 + (rng() - 0.5) * 4, 0.95 + rng() * 0.35);
  }

  addTiledRect('sand', 74, 170, 96, 32, { skipWater: false, tile: 4, height: 0.18 });
  addLabel('Barceloneta Beach', 74, topY(74, 170) + 9, 170);
  for (let i = 0; i < 26; i += 1) {
    addTop(i % 2 ? 'cloth' : 'turquoise', 38 + rng() * 78, 156 + rng() * 26, 2.6, 0.14, 1.5, null, rng() * 0.4);
  }

  addTiledRect('barcelonaGrass', -70, -150, 84, 58, { tile: 4, height: 0.16 });
  addTiledRect('barcelonaGrass', -138, 122, 84, 64, { tile: 4, height: 0.16 });
  addLabel('Montjuic', -138, topY(-138, 122) + 23, 122);
  addLabel('Tibidabo', -154, topY(-154, -204) + 20, -204);
}

function buildRoadNetwork({ addTop, addTiledRect }) {
  const gridYaw = Math.PI * 0.25;
  for (let x = -96; x <= 104; x += 24) {
    addTiledRect('asphalt', x, 2, 5.6, 170, { yaw: gridYaw, tile: 3.5, height: 0.12 });
  }
  for (let z = -100; z <= 86; z += 24) {
    addTiledRect('asphalt', 4, z, 176, 5.6, { yaw: gridYaw, tile: 3.5, height: 0.12 });
  }

  addTiledRect('asphalt', -26, 4, 12, 170, { yaw: 0.08, tile: 3.6, height: 0.14, color: '#5e5d58' });
  addTiledRect('asphalt', 10, -40, 182, 12, { yaw: -0.28, tile: 3.6, height: 0.14, color: '#5e5d58' });
  addTiledRect('asphalt', 8, 36, 194, 10, { yaw: 0.02, tile: 3.6, height: 0.14, color: '#5e5d58' });
  addTiledRect('cobblestone', -78, 82, 12, 112, { yaw: -0.08, tile: 3.5, height: 0.14, color: '#7f766b' });
  addTiledRect('cobblestone', 18, 144, 160, 10, { yaw: 0.04, tile: 3.5, height: 0.14 });

  for (let t = 0; t <= 1; t += 0.09) {
    const x = -26 + Math.sin(t * Math.PI * 2) * 3;
    const z = -76 + t * 156;
    addPalm(addTop, x - 8, z, 0.72);
    addPalm(addTop, x + 8, z, 0.72);
  }
}

function buildSagradaFamilia({ addTop, addTiledRect, addLabel, rng }) {
  const x = 0;
  const z = -34;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 96, 96, { tile: 3.6, height: 0.15, color: '#bda36f' });

  addTop('limestone', x, z, 34, 34, 42, null, 0, base);
  addTop('limestone', x, z, 46, 5, 54, null, 0, base + 16);
  addTop('mosaic', x, z - 22, 42, 2.4, 2.2, null, 0, base + 20);
  addTop('mosaic', x, z + 22, 42, 2.4, 2.2, null, 0, base + 20);

  const spires = [
    [-20, -54, 39], [-8, -56, 52], [8, -56, 54], [20, -54, 40],
    [-22, -16, 44], [-8, -16, 64], [8, -16, 66], [22, -16, 46],
    [-20, 16, 40], [-7, 18, 58], [7, 18, 60], [20, 16, 42]
  ];
  spires.forEach(([sx, sz, height], index) => {
    buildSpire(addTop, x + sx, z + sz, height, index % 2 ? 'ceramic' : 'limestone');
  });

  for (let fx = -17; fx <= 17; fx += 8.5) {
    addTop('glass', x + fx, z - 23.5, 2.3, 8.5, 0.6, vary('#9cc8c8', rng() * 0.12), 0, base + 6);
    addTop('turquoise', x + fx, z + 23.5, 2.3, 8.5, 0.6, null, 0, base + 6);
  }

  for (let i = 0; i < 28; i += 1) {
    addTop(i % 2 ? 'limestone' : 'mosaic', x - 23 + rng() * 46, z - 28 + rng() * 56, 0.9, 1.4 + rng() * 1.6, 0.9, null, 0, base + 16 + rng() * 10);
  }

  addTop('wood', 32, -72, 1.1, 32, 1.1, null, 0.08, topY(32, -72));
  addTop('iron', 24, -66, 22, 1.0, 1.0, null, -0.2, topY(24, -66) + 30);
  addTop('gold', 16, -60, 1.8, 1.8, 1.8, null, 0, topY(16, -60) + 29);

  for (let i = 0; i < 56; i += 1) {
    addStaticPerson(addTop, -40 + rng() * 80, -78 + rng() * 86, i % 5 === 0 ? 'cloth' : 'crowd', 0.92 + rng() * 0.18);
  }
  addLabel('Sagrada Familia', x, base + 78, z);
}

function buildSpire(addTop, x, z, height, material) {
  const base = topY(x, z);
  const levels = 9;
  for (let i = 0; i < levels; i += 1) {
    const t = i / levels;
    const s = 6.2 * (1 - t * 0.72);
    addTop(material, x, z, s, height / levels, s, null, 0, base + i * (height / levels));
    if (i % 2 === 0) addTop('mosaic', x, z + s * 0.5, s * 0.4, 0.7, 0.5, null, 0, base + i * (height / levels) + 0.7);
  }
  addTop('gold', x, z, 2.3, 2.3, 2.3, null, 0, base + height);
}

function buildGaudiLandmarks({ addTop, addTiledRect, addLabel, rng }) {
  buildParkGuell(addTop, addTiledRect, addLabel, rng);
  buildGaudiHouse(addTop, addTiledRect, -38, 14, 22, 18, 18, 'Casa Batllo', addLabel, 'mosaic');
  buildGaudiHouse(addTop, addTiledRect, -16, -2, 26, 20, 21, 'Casa Mila', addLabel, 'limestone');
  buildGaudiHouse(addTop, addTiledRect, -92, -72, 24, 18, 16, 'Casa Vicens', addLabel, 'ceramic');
  buildGaudiHouse(addTop, addTiledRect, -132, -164, 30, 22, 18, 'Torre Bellesguard', addLabel, 'limestone');
  buildGaudiHouse(addTop, addTiledRect, -82, 78, 28, 20, 17, 'Palau Guell', addLabel, 'brick');
}

function buildParkGuell(addTop, addTiledRect, addLabel, rng) {
  const x = -70;
  const z = -150;
  const base = topY(x, z);
  addTiledRect('barcelonaGrass', x, z, 84, 58, { tile: 4, height: 0.16 });
  addTop('mosaic', x, z, 50, 0.9, 20, null, 0.16, base + 0.1);
  addTop('mosaic', x - 20, z + 10, 8, 7, 8, null, 0, base);
  addTop('mosaic', x + 20, z + 10, 8, 7, 8, null, 0, base);
  for (let i = 0; i < 26; i += 1) {
    const angle = (i / 26) * Math.PI * 2;
    addTop('ceramic', x + Math.cos(angle) * 28, z + Math.sin(angle) * 18, 2.0, 1.1, 2.0, null, angle, base + 1.2);
  }
  for (let i = 0; i < 18; i += 1) addPalm(addTop, x - 36 + rng() * 72, z - 26 + rng() * 52, 0.8 + rng() * 0.4);
  addLabel('Park Guell', x, base + 18, z);
}

function buildGaudiHouse(addTop, addTiledRect, x, z, width, depth, height, label, addLabel, facade) {
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, width + 16, depth + 14, { tile: 3.5, height: 0.13 });
  addTop(facade, x, z, width, height, depth, null, 0, base);
  addTop('terracotta', x, z, width * 0.96, 2.4, depth * 1.08, null, 0.1, base + height);
  for (let wx = -width / 2 + 4; wx <= width / 2 - 4; wx += 5) {
    for (let wy = 4; wy <= height - 4; wy += 5) {
      addTop('glass', x + wx, z + depth / 2 + 0.2, 1.5, 2.2, 0.4, null, 0, base + wy);
      addTop('iron', x + wx, z + depth / 2 + 0.55, 2.2, 0.28, 0.35, null, 0, base + wy - 1.4);
    }
  }
  for (let cx = -width / 2 + 4; cx <= width / 2 - 4; cx += 7) {
    addTop('mosaic', x + cx, z - depth / 2, 2.1, 4.2, 2.1, null, 0, base + height + 2.2);
  }
  addLabel(label, x, base + height + 9, z);
}

function buildCivicLandmarks({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', -46, 48, 54, 44, { tile: 3.5, height: 0.14 });
  addFountain(addTop, -46, 48, 1.2);
  addLabel('Placa de Catalunya', -46, topY(-46, 48) + 12, 48);

  addTiledRect('cobblestone', -46, 104, 76, 58, { tile: 3.2, height: 0.14 });
  buildCathedral(addTop, -38, 94, 'Barcelona Cathedral', addLabel);
  addLabel('Barri Gotic', -50, topY(-50, 112) + 10, 112);

  buildArc(addTop, 50, 54, 16, 21, 'Arc de Triomf', addLabel);
  buildModernistHall(addTop, addTiledRect, 12, 74, 'Palau Musica', addLabel);

  addTiledRect('wood', -18, 156, 76, 34, { skipWater: false, tile: 4, height: 0.18 });
  for (let x = -48; x <= 18; x += 18) {
    addTop('wood', x, 168, 12, 0.3, 20, null, 0.03);
  }
  addLabel('Port Vell', -18, topY(-18, 156) + 12, 156);

  addTiledRect('barcelonaGrass', -118, 88, 46, 30, { tile: 4, height: 0.14 });
  addFountain(addTop, -118, 88, 1.6);
  addLabel('Magic Fountain', -118, topY(-118, 88) + 13, 88);

  addTiledRect('barcelonaGrass', -174, 12, 66, 50, { tile: 4, height: 0.14 });
  addTop('concrete', -174, 12, 56, 2.2, 40, null, 0, topY(-174, 12));
  addTop('barcelonaGrass', -174, 12, 42, 0.6, 27, null, 0, topY(-174, 12) + 2.3);
  addLabel('Camp Nou', -174, topY(-174, 12) + 12, 12);

  for (let i = 0; i < 46; i += 1) {
    const aroundRamblas = i % 2 === 0;
    addStaticPerson(
      addTop,
      aroundRamblas ? -86 + rng() * 28 : -60 + rng() * 104,
      aroundRamblas ? 34 + rng() * 92 : 42 + rng() * 126,
      i % 3 === 0 ? 'cloth' : 'crowd',
      0.9 + rng() * 0.18
    );
  }
}

function buildCathedral(addTop, x, z, label, addLabel) {
  const base = topY(x, z);
  addTop('limestone', x, z, 32, 18, 24, null, 0, base);
  addTop('limestone', x - 13, z - 10, 8, 26, 8, null, 0, base);
  addTop('limestone', x + 13, z - 10, 8, 26, 8, null, 0, base);
  buildSpire(addTop, x - 13, z - 10, 28, 'limestone');
  buildSpire(addTop, x + 13, z - 10, 28, 'limestone');
  addTop('glass', x, z - 12.3, 7, 8, 0.6, null, 0, base + 7);
  addLabel(label, x, base + 42, z);
}

function buildArc(addTop, x, z, width, height, label, addLabel) {
  const base = topY(x, z);
  addTop('brick', x - width / 2, z, 4, height, 6, null, 0, base);
  addTop('brick', x + width / 2, z, 4, height, 6, null, 0, base);
  addTop('brick', x, z, width + 8, 4, 6, null, 0, base + height - 2);
  addTop('shadow', x, z - 0.2, width - 5, height - 6, 0.6, null, 0, base + 1.5);
  addLabel(label, x, base + height + 8, z);
}

function buildModernistHall(addTop, addTiledRect, x, z, label, addLabel) {
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 40, 30, { tile: 3.4, height: 0.13 });
  addTop('brick', x, z, 30, 17, 20, null, 0, base);
  addTop('glass', x, z - 10.4, 22, 7, 0.5, null, 0, base + 6);
  addTop('mosaic', x, z - 10.8, 30, 1.4, 0.7, null, 0, base + 15);
  for (let sx = -13; sx <= 13; sx += 8.6) buildSpire(addTop, x + sx, z, 11, 'ceramic');
  addLabel(label, x, base + 29, z);
}

function buildUrbanBlocks({ planner, batch, addTop, rng }) {
  let built = 0;
  for (let attempts = 0; attempts < 520 && built < 148; attempts += 1) {
    const inGothic = rng() > 0.72;
    const x = inGothic ? -86 + rng() * 92 : -116 + rng() * 238;
    const z = inGothic ? 64 + rng() * 74 : -104 + rng() * 210;
    if (isSea(x, z, 12) || isHillZone(x, z)) continue;

    const width = inGothic ? 9 + rng() * 10 : 14 + rng() * 15;
    const depth = inGothic ? 9 + rng() * 11 : 14 + rng() * 15;
    const yaw = inGothic ? (rng() - 0.5) * 0.35 : Math.PI * 0.25;
    if (!planner.canPlaceRect(x, z, width + 5, depth + 5)) continue;
    planner.reserveRect(`barcelona-block-${built}`, x, z, width + 5, depth + 5, { force: true, type: 'building' });
    buildApartmentBlock(batch, addTop, x, z, width, depth, 10 + rng() * 18, yaw, rng());
    built += 1;
  }
  return built;
}

function buildApartmentBlock(batch, addTop, x, z, width, depth, height, yaw, seed) {
  const base = topY(x, z);
  const material = seed > 0.72 ? 'brick' : seed > 0.38 ? 'stucco' : 'limestone';
  batch.addTop(material, x, base, z, width, height, depth, null, yaw);
  batch.addTop('terracotta', x, base + height + 0.05, z, width * 1.08, 1.4, depth * 1.08, null, yaw);
  for (let wx = -width / 2 + 3.2; wx <= width / 2 - 3; wx += 4.8) {
    for (let wy = 4; wy <= height - 3; wy += 5.2) {
      batch.addTop('shadow', x + wx, base + wy, z + depth / 2 + 0.15, 1.2, 1.6, 0.3, null, yaw);
      if (wy > 5) batch.addTop('iron', x + wx, base + wy - 1.1, z + depth / 2 + 0.42, 1.8, 0.22, 0.32, null, yaw);
    }
  }
  if (seed > 0.84) addTop('mosaic', x, z + depth / 2 + 0.4, width * 0.72, 0.7, 0.5, null, yaw, base + height * 0.55);
}

function buildStreetDetails({ planner, addTop, rng }) {
  for (let i = 0; i < 180; i += 1) {
    const x = -164 + rng() * 310;
    const z = -132 + rng() * 286;
    if (isSea(x, z, 4) || planner.hasPoint(x, z, 'landmark')) continue;
    if (i % 5 === 0) addCafe(addTop, x, z, rng() * 0.5);
    else if (i % 4 === 0) addMetro(addTop, x, z);
    else if (i % 3 === 0) addPalm(addTop, x, z, 0.62 + rng() * 0.25);
    else addStreetLamp(addTop, x, z);
  }
}

function addPalm(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.72 * scale, 5.8 * scale, 0.72 * scale, null, 0, base);
  for (let i = 0; i < 6; i += 1) {
    const yaw = (i / 6) * Math.PI * 2;
    addTop('vegetation', x + Math.sin(yaw) * 1.55 * scale, z + Math.cos(yaw) * 1.55 * scale, 0.85 * scale, 0.55 * scale, 3.4 * scale, null, yaw, base + 5.45 * scale);
  }
}

function addFountain(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('limestone', x, z, 8 * scale, 0.8 * scale, 8 * scale, null, 0, base);
  addTop('water', x, z, 6.2 * scale, 0.24 * scale, 6.2 * scale, null, 0, base + 0.8 * scale);
  addTop('gold', x, z, 1.0 * scale, 4.2 * scale, 1.0 * scale, null, 0, base + 0.9 * scale);
}

function addCafe(addTop, x, z, yaw = 0) {
  const base = topY(x, z);
  addTop('wood', x, z, 3.5, 0.8, 2.6, null, yaw, base);
  addTop('cloth', x, z, 4.8, 0.35, 3.8, null, yaw, base + 1.15);
  addTop('crowd', x + 2.8, z, 0.42, 0.9, 0.36, null, yaw, base + 0.02);
  addTop('skin', x + 2.8, z, 0.3, 0.3, 0.3, null, yaw, base + 0.9);
}

function addMetro(addTop, x, z) {
  const base = topY(x, z);
  addTop('iron', x, z, 3.2, 0.4, 2.4, null, 0, base);
  addTop('lapis', x, z, 2.2, 2.0, 0.42, null, 0, base + 0.4);
}

function addStreetLamp(addTop, x, z) {
  const base = topY(x, z);
  addTop('iron', x, z, 0.35, 4.2, 0.35, null, 0, base);
  addTop('gold', x, z, 0.85, 0.65, 0.85, null, 0, base + 4.25);
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
      speed: 2.4 + rng() * 3.4,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.94 + rng() * 0.22
    });
  }

  const group = new THREE.Group();
  group.name = 'barcelona-street-crowds';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'barcelona-pedestrian-body', 0x6d5c4f),
    head: makeInstancedPart(pedestrians.length, 'barcelona-pedestrian-head', 0xc98a62),
    hair: makeInstancedPart(pedestrians.length, 'barcelona-pedestrian-hair', 0x3b2b24),
    leftLeg: makeInstancedPart(pedestrians.length, 'barcelona-pedestrian-left-leg', 0x32363d),
    rightLeg: makeInstancedPart(pedestrians.length, 'barcelona-pedestrian-right-leg', 0x32363d),
    leftArm: makeInstancedPart(pedestrians.length, 'barcelona-pedestrian-left-arm', 0xc98a62),
    rightArm: makeInstancedPart(pedestrians.length, 'barcelona-pedestrian-right-arm', 0xc98a62)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updatePedestrians(parts, pedestrians, elapsed) });
  updatePedestrians(parts, pedestrians, 0);
  return pedestrians.length;
}

function buildTraffic({ animated, rng }) {
  const routes = createTrafficRoutes();
  const vehicles = [];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const kind = i % 9 === 0 ? 'bus' : i % 3 === 0 ? 'scooter' : 'bike';
    const route = routes[i % routes.length];
    vehicles.push({ kind, route, distance: rng() * route.length, speed: kind === 'bus' ? 7 + rng() * 2 : 8 + rng() * 5, lane: (rng() - 0.5) * route.width });
  }
  const buses = vehicles.filter((vehicle) => vehicle.kind === 'bus').length;
  const bikes = vehicles.length - buses;
  const group = new THREE.Group();
  group.name = 'barcelona-bikes-scooters-buses';
  const parts = {
    body: makeInstancedPart(vehicles.length, 'barcelona-traffic-body', 0xe1b43c),
    rider: makeInstancedPart(vehicles.length, 'barcelona-traffic-rider', 0x3c4f5f),
    wheelA: makeInstancedPart(vehicles.length, 'barcelona-traffic-wheel-a', 0x1f2224),
    wheelB: makeInstancedPart(vehicles.length, 'barcelona-traffic-wheel-b', 0x1f2224)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateTraffic(parts, vehicles, elapsed) });
  updateTraffic(parts, vehicles, 0);
  return { bikes, buses };
}

function createPedestrianRoutes() {
  return [
    { width: 7, loop: true, points: [[-42, -72], [0, -76], [42, -54], [38, -10], [0, 12], [-38, -4]] },
    { width: 6, loop: false, points: [[-28, -82], [-26, -10], [-38, 14], [-46, 48], [-78, 82], [-82, 132], [-18, 156]] },
    { width: 6, loop: true, points: [[-92, 76], [-44, 92], [-16, 122], [-74, 128]] },
    { width: 6, loop: true, points: [[-106, -176], [-70, -150], [-36, -122], [-92, -72], [-132, -164]] },
    { width: 6, loop: true, points: [[-150, 84], [-118, 88], [-138, 122], [-172, 118]] },
    { width: 6, loop: false, points: [[-18, 156], [42, 150], [74, 170], [128, 162]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createTrafficRoutes() {
  return [
    { width: 7, loop: true, points: [[-26, -92], [-26, -18], [-26, 52], [-18, 134], [34, 144], [50, 52], [10, -40]] },
    { width: 7, loop: true, points: [[-92, 36], [-22, 36], [72, 34], [112, 48], [62, 96], [-18, 104], [-78, 82]] },
    { width: 8, loop: true, points: [[-90, -80], [0, -40], [86, -8], [44, 44], [-46, 48]] }
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
    setPart(parts.body, index, x, y + 0.64 * s, z, 0.48 * s, 1.08 * s, 0.38 * s, yaw);
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

function updateTraffic(parts, vehicles, elapsed) {
  vehicles.forEach((vehicle, index) => {
    const sample = sampleRoute(vehicle.route, vehicle.distance + elapsed * vehicle.speed);
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const sideX = sample.tangentZ;
    const sideZ = -sample.tangentX;
    const x = sample.x + sideX * vehicle.lane;
    const z = sample.z + sideZ * vehicle.lane;
    const y = topY(x, z) + 0.18;
    const bus = vehicle.kind === 'bus';
    const scooter = vehicle.kind === 'scooter';
    setPart(parts.body, index, x, y + (bus ? 0.8 : 0.25), z, bus ? 3.2 : scooter ? 0.8 : 0.32, bus ? 1.5 : 0.28, bus ? 7.2 : scooter ? 2.0 : 2.4, yaw);
    setPart(parts.rider, index, x, y + (bus ? 1.9 : 1.0), z, bus ? 1.9 : 0.42, bus ? 0.5 : 1.0, bus ? 0.45 : 0.36, yaw);
    setPart(parts.wheelA, index, x - sideX * (bus ? 1.3 : 0.55), y, z - sideZ * (bus ? 1.3 : 0.55), 0.42, 0.42, bus ? 0.72 : 0.42, yaw);
    setPart(parts.wheelB, index, x + sideX * (bus ? 1.3 : 0.55), y, z + sideZ * (bus ? 1.3 : 0.55), 0.42, 0.42, bus ? 0.72 : 0.42, yaw);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}
