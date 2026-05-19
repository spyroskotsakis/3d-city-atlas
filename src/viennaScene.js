import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 216;
const TERRAIN_CELL = 4;
const TILE = 3.6;
const PEDESTRIAN_COUNT = 285;
const CYCLIST_COUNT = 34;

const MATERIAL_KEYS = [
  'viennaTerrain',
  'viennaGrass',
  'water',
  'cobblestone',
  'asphalt',
  'limestone',
  'marble',
  'stucco',
  'slate',
  'terracotta',
  'copper',
  'gold',
  'glass',
  'steel',
  'iron',
  'wood',
  'cloth',
  'mosaic',
  'ceramic',
  'vegetation',
  'shadow',
  'crowd',
  'skin',
  'neon',
  'neonPink',
  'neonCyan'
];

const LANDMARKS = [
  ['Stephansdom', 0, 0, 54, 50],
  ['Stephansplatz', 0, 14, 72, 54],
  ['Hofburg Palace', -62, 24, 74, 48],
  ['State Opera', -34, 76, 48, 34],
  ['Karlskirche', 24, 104, 48, 42],
  ['Belvedere Palace', 70, 138, 68, 48],
  ['Schonbrunn Palace', -156, 112, 78, 50],
  ['Rathaus', -82, -64, 56, 42],
  ['Parliament', -92, -20, 56, 32],
  ['MuseumsQuartier', -102, 42, 60, 42],
  ['Stadtpark', 54, 44, 62, 44],
  ['Hundertwasserhaus', 96, 44, 34, 34],
  ['Prater Wheel', 150, -54, 56, 56],
  ['Danube Canal Night Boats', 92, -18, 50, 82],
  ['Danube Waterfront', 158, -14, 66, 118]
];

const tempColor = new THREE.Color();

function createRng(seed = 0x5649454e) {
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

function canalCenterX(z) {
  return 88 + Math.sin((z + 14) * 0.035) * 7 + Math.sin(z * 0.071 + 0.8) * 3;
}

function canalWidthAt(z) {
  return 18 + Math.sin(z * 0.052 + 1.1) * 2.6;
}

function danubeCenterX(z) {
  return 158 + Math.sin((z - 18) * 0.026) * 11 + Math.sin(z * 0.061 + 0.4) * 4;
}

function danubeWidthAt(z) {
  return 34 + Math.sin(z * 0.041 + 0.6) * 4;
}

function isCanal(x, z, pad = 0) {
  if (z < -194 || z > 188) return false;
  return Math.abs(x - canalCenterX(z)) <= canalWidthAt(z) / 2 + pad;
}

function isDanube(x, z, pad = 0) {
  if (z < -204 || z > 196) return false;
  return Math.abs(x - danubeCenterX(z)) <= danubeWidthAt(z) / 2 + pad;
}

function isRiver(x, z, pad = 0) {
  return isCanal(x, z, pad) || isDanube(x, z, pad);
}

function terrainHeightAt(x, z) {
  const oldTownRise = Math.exp(-((x / 96) ** 2 + (z / 92) ** 2)) * 0.85;
  const belvedereRise = Math.exp(-(((x - 70) / 58) ** 2 + ((z - 138) / 52) ** 2)) * 1.05;
  const schonbrunnRise = Math.exp(-(((x + 156) / 66) ** 2 + ((z - 112) / 54) ** 2)) * 0.72;
  const praterLow = Math.exp(-(((x - 146) / 74) ** 2 + ((z + 54) / 74) ** 2)) * 0.55;
  const canalCut = Math.exp(-((x - canalCenterX(z)) ** 2) / 230) * 0.74;
  const danubeCut = Math.exp(-((x - danubeCenterX(z)) ** 2) / 520) * 0.82;
  return Math.max(
    0.42,
    1.04 + oldTownRise + belvedereRise + schonbrunnRise - praterLow - canalCut - danubeCut + Math.sin(x * 0.019 + z * 0.031) * 0.12
  );
}

export function viennaTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

export function createViennaScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Vienna voxel material: ${key}`);
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

    for (let lx = -width / 2 + tile / 2; lx <= width / 2 - tile / 2; lx += tile) {
      for (let lz = -depth / 2 + tile / 2; lz <= depth / 2 - tile / 2; lz += tile) {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        if (isRiver(wx, wz, -0.8)) continue;
        const shade = Math.sin(wx * 0.12 + wz * 0.08) * 0.02 + Math.cos(lz * 0.31) * 0.012;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, topY(wx, wz) + baseOffset);
      }
    }
  };

  const reserveRoad = (tag, x, z, width, depth, yaw = 0, material = 'cobblestone') => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
    addTiledRect(material, x, z, width, depth, { color: material === 'asphalt' ? '#3d4142' : '#7d756a', height: 0.12, tile: 3.55, yaw, baseOffset: 0.02 });
  };

  const reserveRoadSegment = (tag, ax, az, bx, bz, width, material = 'cobblestone') => {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return;
    reserveRoad(tag, (ax + bx) / 2, (az + bz) / 2, length, width, Math.atan2(-dz, dx), material);
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildWaterfront({ addTop, addTiledRect, addLabel, rng });
  buildStreets({ reserveRoad, reserveRoadSegment, addTop, addTiledRect });
  buildStephansdom({ addTop, addTiledRect, addLabel, rng });
  buildImperialLandmarks({ batch, addTop, addTiledRect, addLabel, rng });
  buildPraterAndParks({ addTop, addTiledRect, addLabel, rng });
  const blocks = buildUrbanBlocks({ planner, batch, addTop, rng });
  buildStreetDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const cyclists = buildCyclists({ animated, rng });
  const trams = buildTrams({ animated });
  const boats = buildBoats({ animated });
  const carts = buildCarriages({ animated });

  const { group, total } = batch.build();
  group.name = 'procedural-vienna-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      stephansdom: new THREE.Vector3(0, 54, 0),
      hofburg: new THREE.Vector3(-62, 24, 24),
      opera: new THREE.Vector3(-34, 22, 76),
      karlskirche: new THREE.Vector3(24, 26, 104),
      belvedere: new THREE.Vector3(70, 24, 138),
      rathaus: new THREE.Vector3(-82, 30, -64),
      danube: new THREE.Vector3(158, 12, -14),
      nightlife: new THREE.Vector3(92, 12, -18),
      prater: new THREE.Vector3(150, 42, -54),
      schonbrunn: new THREE.Vector3(-156, 22, 112),
      aerial: new THREE.Vector3(18, 14, 20)
    },
    metrics: {
      instances: total,
      pedestrians,
      cyclists,
      trams,
      boats,
      carts,
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
    ['Schweden Bridge', 88, -86, 42, 14],
    ['Urania Bridge', 92, -24, 46, 14],
    ['Stadtpark Bridge', 94, 42, 46, 14],
    ['Prater Bridge', 126, -88, 72, 15],
    ['Danube Night Bridge', 128, 18, 72, 15],
    ['Danube Park Bridge', 130, 94, 70, 15]
  ].forEach(([tag, x, z, width, depth]) => planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'bridge' }));
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isRiver(x, z, 0.3)) {
        batch.add('water', x, 0.24, z, TERRAIN_CELL * 1.08, 0.25, TERRAIN_CELL * 1.08, vary('#4b98aa', Math.sin(z * 0.08) * 0.03));
        continue;
      }

      const h = terrainHeightAt(x, z);
      const park =
        (x > 20 && x < 86 && z > 18 && z < 68) ||
        (x > 114 && x < 188 && z > -104 && z < 10) ||
        (x > 36 && x < 106 && z > 112 && z < 166) ||
        (x > -198 && x < -116 && z > 86 && z < 140);
      const bank =
        Math.abs(x - canalCenterX(z)) < canalWidthAt(z) / 2 + 13 ||
        Math.abs(x - danubeCenterX(z)) < danubeWidthAt(z) / 2 + 16;
      batch.add(park || bank ? 'viennaGrass' : 'viennaTerrain', x, h / 2 - 0.04, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04);
    }
  }
}

function buildWaterfront({ addTop, addTiledRect, addLabel, rng }) {
  for (let z = -172; z <= 166; z += 8) {
    const cx = canalCenterX(z);
    const dx = danubeCenterX(z);
    const cw = canalWidthAt(z) / 2;
    const dw = danubeWidthAt(z) / 2;
    addTop('cobblestone', cx - cw - 3.4, z, 2.4, 0.2, 6.8, 0x81786c);
    addTop('cobblestone', cx + cw + 3.4, z, 2.4, 0.2, 6.8, 0x81786c);
    addTop('viennaGrass', dx - dw - 4.4, z, 3.2, 0.18, 7.2, 0x6d865c);
    addTop('cobblestone', dx + dw + 4.6, z, 3.0, 0.18, 7.2, 0x7d756a);
  }

  [
    ['Schweden Bridge', 88, -86, 46, 7],
    ['Urania Bridge', 92, -24, 48, 7],
    ['Stadtpark Bridge', 94, 42, 48, 7],
    ['Prater Bridge', 128, -88, 74, 8],
    ['Danube Night Bridge', 130, 18, 74, 8],
    ['Danube Park Bridge', 132, 94, 72, 8]
  ].forEach(([name, x, z, width, depth]) => {
    addTiledRect('cobblestone', x, z, width, depth, { color: '#83786a', height: 0.18, tile: 3.3 });
    addTop('iron', x, z - depth / 2, width, 0.9, 0.38, 0x33383b, 0, topY(x, z) + 0.4);
    addTop('iron', x, z + depth / 2, width, 0.9, 0.38, 0x33383b, 0, topY(x, z) + 0.4);
    addLabel(name, x, topY(x, z) + 5, z);
  });

  buildPartyBoats({ addTop, addLabel, rng });
  addLabel('Danube Canal', canalCenterX(-8), 4.8, -8);
  addLabel('Danube Waterfront', danubeCenterX(-18), 5.4, -18);
}

function buildPartyBoats({ addTop, addLabel, rng }) {
  const boats = [
    [92, -54, 0.02, 18, 'neonPink'],
    [94, -22, -0.05, 20, 'neonCyan'],
    [90, 8, 0.03, 17, 'neon'],
    [158, -68, 0.04, 24, 'neonCyan'],
    [160, 24, -0.02, 26, 'neonPink']
  ];

  boats.forEach(([x, z, yaw, length, light], index) => {
    const base = 0.55;
    addTop('wood', x, z, length, 0.9, 5.0, 0x6b432b, yaw, base);
    addTop('steel', x, z, length * 0.86, 0.45, 4.1, 0x68757b, yaw, base + 0.82);
    addTop('glass', x, z - 0.2, length * 0.5, 2.0, 2.8, 0x8ec3c8, yaw, base + 1.2);
    addTop(light, x, z + 2.2, length * 0.76, 0.22, 0.28, null, yaw, base + 3.15);
    addTop('gold', x - length * 0.34, z - 2.2, 0.5, 3.0, 0.5, 0xe8bf63, yaw, base + 1);
    addTop('gold', x + length * 0.34, z - 2.2, 0.5, 3.0, 0.5, 0xe8bf63, yaw, base + 1);

    for (let i = 0; i < 9; i += 1) {
      const px = x + (rng() - 0.5) * (length * 0.7);
      const pz = z + (rng() - 0.5) * 3.2;
      addTop('crowd', px, pz, 0.5, 1.05, 0.5, null, 0, base + 1.18);
      addTop('skin', px, pz, 0.36, 0.36, 0.36, null, 0, base + 2.14);
    }

    if (index === 1) addLabel('Canal Party Boats', x, base + 7, z);
  });
}

function buildStreets({ reserveRoad, reserveRoadSegment, addTop, addTiledRect }) {
  const ring = makeEllipsePoints({ x: -12, z: 18, rx: 98, rz: 82, segments: 34 });
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    reserveRoadSegment(`Ringstrasse-${i}`, a.x, a.z, b.x, b.z, 11, 'asphalt');
  }

  reserveRoad('Karntner Strasse', -4, 50, 10, 96, 0);
  reserveRoad('Graben', -18, -5, 72, 8, -0.06);
  reserveRoad('Mariahilfer Strasse', -120, 48, 92, 9, 0.04);
  reserveRoad('Praterstrasse', 52, -44, 84, 9, -0.22);
  reserveRoad('Canal Promenade', 84, -16, 8, 164, 0);
  reserveRoad('Danube Promenade', 166, -10, 8, 172, 0);
  reserveRoadSegment('Belvedere Axis', 18, 92, 70, 138, 8, 'cobblestone');
  reserveRoadSegment('Schonbrunn Link', -98, 54, -156, 112, 8, 'cobblestone');
  reserveRoadSegment('Prater Link', 80, -40, 150, -54, 8, 'cobblestone');

  for (const offset of [-2.1, 2.1]) {
    for (let i = 0; i < ring.length; i += 2) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const yaw = Math.atan2(-dz, dx);
      addTop('iron', (a.x + b.x) / 2, (a.z + b.z) / 2 + offset, length, 0.12, 0.18, 0x33383b, yaw);
    }
  }

  addTiledRect('viennaGrass', 54, 44, 62, 44, { color: '#6e8a5c', height: 0.14, tile: 3.6 });
  addTiledRect('viennaGrass', 132, -42, 78, 58, { color: '#6a8758', height: 0.14, tile: 3.8 });
}

function buildStephansdom({ addTop, addTiledRect, addLabel, rng }) {
  const x = 0;
  const z = 0;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z + 12, 78, 58, { color: '#81786c', height: 0.14, tile: 3.2 });
  addTop('limestone', x, z, 18, 18, 42, 0xd8cfb7, 0, base);
  addTop('limestone', x, z + 2, 43, 14, 16, 0xd8cfb7, 0, base + 1.2);

  for (let i = -4; i <= 4; i += 1) {
    addTop('shadow', x - 9.3, z + i * 4.2, 0.34, 4.4, 1.7, 0x2e2924, 0, base + 5.4);
    addTop('shadow', x + 9.3, z + i * 4.2, 0.34, 4.4, 1.7, 0x2e2924, 0, base + 5.4);
    addTop('limestone', x - 11, z + i * 4.2, 1.0, 11, 1.0, 0xcfc5ad, 0, base + 1);
    addTop('limestone', x + 11, z + i * 4.2, 1.0, 11, 1.0, 0xcfc5ad, 0, base + 1);
  }

  addTop('slate', x, z, 20, 4, 44, 0x5f666b, 0, base + 18);
  for (let ix = -4; ix <= 4; ix += 1) {
    for (let iz = -8; iz <= 8; iz += 1) {
      const kind = (ix + iz) % 4 === 0 ? 'gold' : (ix + iz) % 3 === 0 ? 'terracotta' : 'slate';
      addTop(kind, x + ix * 2.05, z + iz * 2.28, 1.55, 0.32, 1.55, null, 0, base + 22.05 + Math.abs(ix) * 0.1);
    }
  }

  addTop('limestone', x + 17, z - 2, 8, 46, 8, 0xcfc5ad, 0, base);
  addTop('limestone', x + 17, z - 2, 6.3, 18, 6.3, 0xd8cfb7, 0, base + 46);
  addTop('slate', x + 17, z - 2, 5.1, 14, 5.1, 0x596168, 0, base + 64);
  addTop('gold', x + 17, z - 2, 0.85, 6.5, 0.85, 0xe8bf63, 0, base + 78);
  addTop('limestone', x - 18, z + 5, 7, 28, 7, 0xd8cfb7, 0, base);
  addTop('copper', x - 18, z + 5, 7.8, 5.2, 7.8, 0x79a66b, 0, base + 28);

  for (let i = 0; i < 52; i += 1) {
    const px = x + (rng() - 0.5) * 56;
    const pz = z + 20 + (rng() - 0.5) * 30;
    addTop('crowd', px, pz, 0.52, 1.04, 0.52);
    addTop('skin', px, pz, 0.36, 0.36, 0.36, null, 0, topY(px, pz) + 1.0);
  }
  addLabel('Stephansdom', x + 7, base + 88, z - 2);
}

function buildImperialLandmarks({ batch, addTop, addTiledRect, addLabel, rng }) {
  buildPalace({ addTop, addTiledRect, addLabel, x: -62, z: 24, width: 70, depth: 36, name: 'Hofburg Palace', roof: 'slate', garden: false });
  buildPalace({ addTop, addTiledRect, addLabel, x: -34, z: 76, width: 44, depth: 28, name: 'Vienna State Opera', roof: 'slate', garden: false });
  buildKarlskirche({ addTop, addTiledRect, addLabel });
  buildBelvedere({ addTop, addTiledRect, addLabel, rng });
  buildSchonbrunn({ addTop, addTiledRect, addLabel, rng });
  buildRathaus({ addTop, addTiledRect, addLabel, rng });
  buildParliament({ batch, addTop, addTiledRect, addLabel });
  buildMuseumsQuartier({ addTop, addTiledRect, addLabel, rng });
  buildHundertwasserhaus({ addTop, addTiledRect, addLabel });
}

function buildPalace({ addTop, addTiledRect, addLabel, x, z, width, depth, name, roof, garden }) {
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, width + 14, depth + 14, { color: '#80776b', height: 0.13, tile: 3.4 });
  addTop('limestone', x, z, width, 12, depth, 0xd8cfb7, 0, base);
  addTop(roof, x, z, width + 2.4, 3.6, depth + 2.4, roof === 'slate' ? 0x5f666b : 0x78a66b, 0, base + 12);
  for (let i = -Math.floor(width / 12); i <= Math.floor(width / 12); i += 1) {
    const wx = x + i * 8;
    addTop('shadow', wx, z + depth / 2 + 0.25, 3.2, 4.4, 0.34, 0x332d25, 0, base + 4.7);
    addTop('limestone', wx, z - depth / 2 - 0.25, 0.62, 10, 0.62, 0xcfc4ad, 0, base + 1);
  }
  addTop('gold', x, z + depth / 2 + 1.2, 8, 1.2, 0.8, 0xe3bd5c, 0, base + 8.5);
  if (garden) addTiledRect('viennaGrass', x, z + depth / 2 + 24, width, 26, { color: '#6f895e', height: 0.14, tile: 3.7 });
  addLabel(name, x, base + 20, z);
}

function buildKarlskirche({ addTop, addTiledRect, addLabel }) {
  const x = 24;
  const z = 104;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 52, 42, { color: '#81786c', height: 0.13, tile: 3.4 });
  addTop('limestone', x, z, 28, 13, 18, 0xd8cfb7, 0, base);
  addTop('copper', x, z, 18, 9, 18, 0x79a66b, 0, base + 13);
  addTop('gold', x, z, 0.9, 4, 0.9, 0xe6c663, 0, base + 22);
  for (const sx of [-1, 1]) {
    addTop('limestone', x + sx * 19, z + 4, 4.4, 24, 4.4, 0xcfc5ad, 0, base);
    for (let band = 0; band < 6; band += 1) {
      addTop('gold', x + sx * 19, z + 4, 4.8, 0.24, 4.8, 0xd7b253, 0, base + 3 + band * 3.2);
    }
    addTop('copper', x + sx * 19, z + 4, 5.2, 4.4, 5.2, 0x79a66b, 0, base + 24);
  }
  addLabel('Karlskirche', x, base + 32, z);
}

function buildBelvedere({ addTop, addTiledRect, addLabel, rng }) {
  const x = 70;
  const z = 138;
  buildPalace({ addTop, addTiledRect, addLabel, x, z, width: 64, depth: 30, name: 'Belvedere Palace', roof: 'copper', garden: true });
  for (let i = -4; i <= 4; i += 1) {
    addTop('vegetation', x + i * 8, z + 39, 2.2, 4.8 + rng() * 1.8, 2.2);
    addTop('water', x + i * 5, z + 27, 3.8, 0.22, 6.5, 0x62a9b9);
  }
}

function buildSchonbrunn({ addTop, addTiledRect, addLabel, rng }) {
  const x = -156;
  const z = 112;
  addTiledRect('viennaGrass', x, z + 8, 92, 70, { color: '#6f895e', height: 0.14, tile: 3.8 });
  buildPalace({ addTop, addTiledRect, addLabel, x, z, width: 74, depth: 30, name: 'Schonbrunn Palace', roof: 'terracotta', garden: false });
  for (let i = 0; i < 48; i += 1) {
    const px = x + (rng() - 0.5) * 80;
    const pz = z + 24 + (rng() - 0.5) * 44;
    if (i % 3 === 0) addTop('vegetation', px, pz, 2.2, 4.2 + rng() * 2.2, 2.2);
    else addTop('gold', px, pz, 0.44, 2.6, 0.44, 0xe1bc5d);
  }
}

function buildRathaus({ addTop, addTiledRect, addLabel, rng }) {
  const x = -82;
  const z = -64;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 62, 48, { color: '#81786c', height: 0.13, tile: 3.4 });
  addTop('limestone', x, z, 52, 13, 22, 0xd8cfb7, 0, base);
  addTop('slate', x, z, 55, 3.8, 24, 0x5f666b, 0, base + 13);
  addTop('limestone', x, z + 2, 10, 45, 10, 0xcfc5ad, 0, base);
  addTop('slate', x, z + 2, 7.4, 14, 7.4, 0x596168, 0, base + 45);
  addTop('gold', x, z + 2, 0.8, 5.4, 0.8, 0xe6c663, 0, base + 59);
  for (const ox of [-24, -14, 14, 24]) {
    addTop('limestone', x + ox, z - 4, 4.8, 22, 4.8, 0xd8cfb7, 0, base);
    addTop('slate', x + ox, z - 4, 5.2, 4.4, 5.2, 0x596168, 0, base + 22);
  }
  for (let i = 0; i < 20; i += 1) {
    const px = x + (rng() - 0.5) * 44;
    const pz = z + 20 + (rng() - 0.5) * 14;
    addTop('crowd', px, pz, 0.5, 1.0, 0.5);
    addTop('skin', px, pz, 0.34, 0.34, 0.34, null, 0, topY(px, pz) + 0.96);
  }
  addLabel('Rathaus', x, base + 68, z + 2);
}

function buildParliament({ batch, addTop, addTiledRect, addLabel }) {
  const x = -92;
  const z = -20;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 60, 36, { color: '#81786c', height: 0.13, tile: 3.4 });
  addTop('marble', x, z, 52, 11, 22, null, 0, base);
  addTop('slate', x, z, 54, 3.2, 24, 0x5f666b, 0, base + 11);
  for (let i = -4; i <= 4; i += 1) {
    batch.addTop('marble', x + i * 5, base + 1.2, z + 11.5, 1.2, 10.5, 1.2);
  }
  addTop('gold', x, z + 16, 1.2, 7, 1.2, 0xe6c663);
  addLabel('Parliament', x, base + 19, z);
}

function buildMuseumsQuartier({ addTop, addTiledRect, addLabel, rng }) {
  const x = -102;
  const z = 42;
  addTiledRect('cobblestone', x, z, 62, 44, { color: '#7d756a', height: 0.13, tile: 3.4 });
  for (const ox of [-18, 18]) {
    addTop('limestone', x + ox, z, 24, 11, 30, 0xd8cfb7);
    addTop('slate', x + ox, z, 26, 3, 32, 0x5f666b, 0, topY(x + ox, z) + 11);
  }
  for (let i = 0; i < 18; i += 1) {
    const px = x + (rng() - 0.5) * 48;
    const pz = z + (rng() - 0.5) * 26;
    addTop(i % 2 === 0 ? 'wood' : 'gold', px, pz, 2.8, 0.8, 2.8);
  }
  addLabel('MuseumsQuartier', x, topY(x, z) + 17, z);
}

function buildHundertwasserhaus({ addTop, addTiledRect, addLabel }) {
  const x = 96;
  const z = 44;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 40, 34, { color: '#80776b', height: 0.13, tile: 3.4 });
  for (let ix = -2; ix <= 2; ix += 1) {
    for (let iz = -1; iz <= 1; iz += 1) {
      const kind = (ix + iz) % 3 === 0 ? 'mosaic' : (ix + iz) % 2 === 0 ? 'ceramic' : 'stucco';
      addTop(kind, x + ix * 6, z + iz * 7, 6.4, 5.4 + ((ix + 2) % 2) * 2.2, 7.2, null, 0, base);
    }
  }
  addTop('vegetation', x - 8, z - 3, 3, 4.8, 3, null, 0, base + 8.2);
  addTop('vegetation', x + 10, z + 5, 3, 4.8, 3, null, 0, base + 9.4);
  addTop('gold', x, z + 14, 1.2, 12, 1.2, 0xe6c663, 0, base);
  addLabel('Hundertwasserhaus', x, base + 18, z);
}

function buildPraterAndParks({ addTop, addTiledRect, addLabel, rng }) {
  const x = 150;
  const z = -54;
  const base = topY(x, z);
  addTiledRect('viennaGrass', x, z, 86, 62, { color: '#6a8758', height: 0.14, tile: 3.8 });
  for (let i = 0; i < 58; i += 1) {
    const px = x + (rng() - 0.5) * 76;
    const pz = z + (rng() - 0.5) * 52;
    if (isRiver(px, pz, 2)) continue;
    addTop('vegetation', px, pz, 2.0 + rng() * 1.4, 4.0 + rng() * 3.8, 2.0 + rng() * 1.4);
  }
  buildFerrisWheel({ addTop, x, z, base });
  addLabel('Prater Giant Wheel', x, base + 46, z);

  addTiledRect('viennaGrass', 54, 44, 64, 44, { color: '#6f8a5d', height: 0.14, tile: 3.7 });
  addTop('gold', 54, 44, 1.0, 8.5, 1.0, 0xe6c663);
  addTop('gold', 54, 44, 4.2, 1.2, 4.2, 0xe6c663, 0, topY(54, 44) + 8.3);
  addLabel('Stadtpark', 54, topY(54, 44) + 12, 44);
}

function buildFerrisWheel({ addTop, x, z, base }) {
  addTop('steel', x, z, 2.0, 31, 2.0, 0x66727a, 0, base);
  addTop('steel', x - 12, z, 1.4, 28, 1.4, 0x66727a, -0.24, base);
  addTop('steel', x + 12, z, 1.4, 28, 1.4, 0x66727a, 0.24, base);

  const radius = 18;
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const py = base + 25 + Math.sin(a) * radius;
    addTop('iron', px, z, 1.2, 1.2, 1.2, 0x33383b, 0, py);
    if (i % 2 === 0) addTop(i % 4 === 0 ? 'neon' : 'neonPink', px, z, 2.8, 2.0, 2.2, null, 0, py - 1.2);
  }
  addTop('gold', x, z, 4.2, 4.2, 4.2, 0xe6c663, 0, base + 25);
}

function buildUrbanBlocks({ planner, batch, addTop, rng }) {
  let placed = 0;
  const xs = [-176, -146, -116, -86, -56, -28, 4, 34, 64, 110, 136, 184];
  const zs = [-154, -124, -94, -64, -34, -4, 28, 58, 88, 118, 148, 176];

  for (const x of xs) {
    for (const z of zs) {
      const width = 12 + Math.floor(rng() * 5) * 2;
      const depth = 12 + Math.floor(rng() * 5) * 2;
      if (!planner.reserveRect(`vienna-block-${placed}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
      buildViennaBlock(batch, addTop, x, z, width, depth, 2 + Math.floor(rng() * 4), rng);
      placed += 1;
    }
  }

  for (let i = 0; i < 78; i += 1) {
    const x = -188 + rng() * 360;
    const z = -176 + rng() * 356;
    const width = 10 + Math.floor(rng() * 6) * 2;
    const depth = 10 + Math.floor(rng() * 6) * 2;
    if (!planner.reserveRect(`vienna-fill-${i}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
    buildViennaBlock(batch, addTop, x, z, width, depth, 2 + Math.floor(rng() * 4), rng);
    placed += 1;
  }

  return placed;
}

function buildViennaBlock(batch, addTop, x, z, width, depth, floors, rng) {
  const base = topY(x, z);
  const facade = rng() > 0.58 ? 'stucco' : 'limestone';
  const height = floors * 3.2 + 2.2;
  addTop(facade, x, z, width, height, depth, null, 0, base);
  addTop(rng() > 0.46 ? 'slate' : 'terracotta', x, z, width + 1.8, 3.0, depth + 1.8, null, 0, base + height);
  addTop('copper', x, z + depth / 2 + 0.55, width * 0.72, 0.5, 0.45, 0x78a66b, 0, base + height + 1.1);

  for (let i = -Math.floor(width / 5); i <= Math.floor(width / 5); i += 1) {
    const wx = x + i * 4.2;
    batch.addTop('shadow', wx, base + 3.6, z + depth / 2 + 0.15, 1.25, 1.9, 0.28);
    if (floors > 2) batch.addTop('shadow', wx, base + 7.0, z + depth / 2 + 0.15, 1.25, 1.9, 0.28);
    if (floors > 4) batch.addTop('shadow', wx, base + 10.3, z + depth / 2 + 0.15, 1.25, 1.9, 0.28);
  }

  if (rng() > 0.72) {
    addTop('cloth', x, z + depth / 2 + 1.2, width * 0.62, 0.7, 1.1, null, 0, base + 2.8);
    addTop('wood', x, z + depth / 2 + 1.86, width * 0.46, 0.46, 0.32, null, 0, base + 3.55);
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
      addTop('vegetation', x, z, 1.7, 4.8 + rng() * 2, 1.7);
    } else {
      addTop('gold', x, z, 0.34, 3.2, 0.34, 0xe1bc5d);
      addTop('gold', x + 0.54, z, 1.0, 0.38, 0.38, 0xe7c15f, 0, topY(x, z) + 3.2);
    }
  }

  [
    [-18, -6, 6],
    [-82, -54, 7],
    [-34, 76, 5],
    [70, 138, 6]
  ].forEach(([x, z, radius]) => buildFountain(addTop, x, z, radius));

  for (let i = 0; i < 22; i += 1) {
    const x = -24 + (i % 6) * 9;
    const z = 38 + Math.floor(i / 6) * 8;
    addTop('wood', x, z, 4.2, 1.0, 2.8);
    addTop('cloth', x, z, 5.0, 0.6, 3.6, null, 0, topY(x, z) + 1.05);
  }
}

function buildFountain(addTop, x, z, radius) {
  addTop('marble', x, z, radius * 2, 0.48, radius * 2, null, 0, topY(x, z) + 0.1);
  addTop('water', x, z, radius * 1.55, 0.26, radius * 1.55, 0x62a9b9, 0, topY(x, z) + 0.58);
  addTop('gold', x, z, 0.72, 3.6, 0.72, 0xe6c663, 0, topY(x, z) + 0.84);
}

function buildPedestrians({ animated, rng }) {
  const routes = createStreetRoutes();
  const pedestrians = [];
  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    pedestrians.push({
      route,
      distance: rng() * route.length,
      speed: 2.6 + rng() * 3.5,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.96 + rng() * 0.3
    });
  }

  const group = new THREE.Group();
  group.name = 'vienna-street-crowds';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'vienna-pedestrian-body', 0x4d6b5d),
    head: makeInstancedPart(pedestrians.length, 'vienna-pedestrian-head', 0xd09a6d),
    hair: makeInstancedPart(pedestrians.length, 'vienna-pedestrian-hair', 0x51402f),
    leftLeg: makeInstancedPart(pedestrians.length, 'vienna-pedestrian-left-leg', 0x313c48),
    rightLeg: makeInstancedPart(pedestrians.length, 'vienna-pedestrian-right-leg', 0x313c48),
    leftArm: makeInstancedPart(pedestrians.length, 'vienna-pedestrian-left-arm', 0xd09a6d),
    rightArm: makeInstancedPart(pedestrians.length, 'vienna-pedestrian-right-arm', 0xd09a6d)
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
      speed: 7.6 + rng() * 4,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2
    });
  }

  const group = new THREE.Group();
  group.name = 'vienna-cyclists';
  const parts = {
    body: makeInstancedPart(cyclists.length, 'vienna-cyclist-body', 0x2f6d79),
    head: makeInstancedPart(cyclists.length, 'vienna-cyclist-head', 0xd09a6d),
    wheelA: makeInstancedPart(cyclists.length, 'vienna-cyclist-front-wheel', 0x24282b),
    wheelB: makeInstancedPart(cyclists.length, 'vienna-cyclist-rear-wheel', 0x24282b),
    frame: makeInstancedPart(cyclists.length, 'vienna-cyclist-frame', 0xd8a334)
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
    { route: prepareRoute({ width: 1, loop: true, points: makeEllipsePoints({ x: -12, z: 18, rx: 100, rz: 84, segments: 42 }) }), distance: 0, speed: 8.6 },
    { route: prepareRoute({ width: 1, loop: true, points: [{ x: -118, z: 48 }, { x: -62, z: 36 }, { x: -12, z: 18 }, { x: 54, z: -20 }, { x: 90, z: -28 }, { x: 54, z: -20 }, { x: -12, z: 18 }, { x: -62, z: 36 }] }), distance: 65, speed: 7.8 },
    { route: prepareRoute({ width: 1, loop: true, points: [{ x: 82, z: -118 }, { x: 86, z: -54 }, { x: 92, z: 12 }, { x: 96, z: 70 }, { x: 92, z: 12 }, { x: 86, z: -54 }] }), distance: 32, speed: 7.4 }
  ];

  const group = new THREE.Group();
  group.name = 'vienna-trams';
  const parts = {
    body: makeInstancedPart(trams.length, 'vienna-tram-body', 0xd93f37),
    roof: makeInstancedPart(trams.length, 'vienna-tram-roof', 0xf3e5c7),
    window: makeInstancedPart(trams.length, 'vienna-tram-window-band', 0x3e5f64)
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

function buildBoats({ animated }) {
  const boatRoutes = [
    { route: prepareRoute({ width: 3.2, loop: true, points: Array.from({ length: 18 }, (_, i) => {
      const z = -160 + i * 18;
      return { x: canalCenterX(z), z };
    }) }), distance: 0, speed: 5.4 },
    { route: prepareRoute({ width: 4.2, loop: true, points: Array.from({ length: 18 }, (_, i) => {
      const z = -166 + i * 19;
      return { x: danubeCenterX(z), z };
    }) }), distance: 90, speed: 4.8 },
    { route: prepareRoute({ width: 3.4, loop: true, points: Array.from({ length: 16 }, (_, i) => {
      const z = -132 + i * 18;
      return { x: canalCenterX(z), z };
    }) }), distance: 150, speed: 4.2 }
  ];

  const boats = [];
  for (let i = 0; i < 14; i += 1) {
    const route = boatRoutes[i % boatRoutes.length].route;
    boats.push({
      route,
      distance: i * 42,
      speed: boatRoutes[i % boatRoutes.length].speed + (i % 3) * 0.3,
      lane: ((i % 4) - 1.5) * 1.2
    });
  }

  const group = new THREE.Group();
  group.name = 'vienna-river-boats';
  const parts = {
    hull: makeInstancedPart(boats.length, 'vienna-boat-hull', 0x6b432b),
    deck: makeInstancedPart(boats.length, 'vienna-boat-deck', 0xf0dfb2),
    cabin: makeInstancedPart(boats.length, 'vienna-boat-cabin', 0x8ec3c8),
    light: makeInstancedPart(boats.length, 'vienna-boat-light', 0xf25fa7)
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

function buildCarriages({ animated }) {
  const carriages = [
    { route: prepareRoute({ width: 1, loop: true, points: [[-62, 24], [-34, 76], [-4, 50], [0, 14], [-62, 24]].map(([x, z]) => ({ x, z })) }), distance: 0, speed: 4.4 },
    { route: prepareRoute({ width: 1, loop: true, points: [[-102, 42], [-120, 48], [-92, -20], [-62, 24], [-102, 42]].map(([x, z]) => ({ x, z })) }), distance: 42, speed: 3.9 }
  ];

  const group = new THREE.Group();
  group.name = 'vienna-carriages';
  const parts = {
    body: makeInstancedPart(carriages.length, 'vienna-carriage-body', 0x3a2a1d),
    canopy: makeInstancedPart(carriages.length, 'vienna-carriage-canopy', 0xefe3c8),
    wheelA: makeInstancedPart(carriages.length, 'vienna-carriage-front-wheel', 0x24282b),
    wheelB: makeInstancedPart(carriages.length, 'vienna-carriage-rear-wheel', 0x24282b),
    horse: makeInstancedPart(carriages.length, 'vienna-carriage-horse', 0x6b432b)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateCarriages(parts, carriages, elapsed);
    }
  });
  updateCarriages(parts, carriages, 0);
  return carriages.length;
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
    { width: 6.2, loop: true, points: makeEllipsePoints({ x: -12, z: 18, rx: 92, rz: 76, segments: 40 }) },
    { width: 5.5, loop: false, points: [[-118, 48], [-72, 38], [-18, -5], [0, 14], [52, -22], [92, -24]] },
    { width: 5.2, loop: false, points: [[-4, 108], [-4, 50], [0, 14], [12, -18], [72, -48], [150, -54]] },
    { width: 5.4, loop: false, points: [[-156, 112], [-120, 82], [-86, 54], [-34, 76], [24, 104], [70, 138]] },
    { width: 5.2, loop: true, points: [[-36, -16], [26, -16], [30, 28], [-34, 34]] },
    { width: 5.0, loop: true, points: [[82, -120], [90, -54], [94, 20], [96, 86], [90, 20], [86, -54]] },
    { width: 5.0, loop: true, points: [[130, -112], [158, -84], [166, -10], [160, 78], [132, 96], [126, -28]] }
  ].map((definition) => {
    const points = definition.points.map((point) => (Array.isArray(point) ? { x: point[0], z: point[1] } : point));
    return prepareRoute({ ...definition, points });
  });
}

function createCyclistRoutes() {
  return [
    { width: 4.5, loop: true, points: makeEllipsePoints({ x: -12, z: 18, rx: 105, rz: 88, segments: 42 }) },
    { width: 4.0, loop: true, points: [[82, -146], [88, -84], [92, -24], [96, 52], [92, 116], [88, 32]] },
    { width: 3.8, loop: true, points: [[126, -112], [156, -82], [166, -12], [160, 74], [132, 96], [126, -18]] }
  ].map((definition) => {
    const points = definition.points.map((point) => (Array.isArray(point) ? { x: point[0], z: point[1] } : point));
    return prepareRoute({ ...definition, points });
  });
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
    setPart(parts.body, index, x, y, z, yaw, 0, 1.35, 0, 4.4, 2.5, 10.2);
    setPart(parts.roof, index, x, y, z, yaw, 0, 2.82, 0, 4.6, 0.5, 10.5);
    setPart(parts.window, index, x, y, z, yaw, 0, 2.0, -0.03, 4.7, 0.72, 8.4);
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
    const y = 0.52 + Math.sin(elapsed * 1.3 + index) * 0.08;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.hull, index, x, y, z, yaw, 0, 0.35, 0, 4.4, 0.8, 12.5);
    setPart(parts.deck, index, x, y, z, yaw, 0, 0.95, 0, 3.8, 0.35, 10.2);
    setPart(parts.cabin, index, x, y, z, yaw, 0, 1.75, -0.8, 2.6, 1.5, 4.2);
    setPart(parts.light, index, x, y, z, yaw, 0, 2.65, 2.8, 3.6, 0.22, 0.28);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateCarriages(parts, carriages, elapsed) {
  carriages.forEach((carriage, index) => {
    const sample = sampleRoute(carriage.route, carriage.distance + elapsed * carriage.speed);
    const x = sample.x;
    const z = sample.z;
    const y = topY(x, z) + 0.08;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const trot = Math.sin(elapsed * 9 + index) * 0.05;
    setPart(parts.body, index, x, y, z, yaw, 0, 0.9, -0.6, 2.4, 1.2, 3.0);
    setPart(parts.canopy, index, x, y, z, yaw, 0, 1.72, -0.6, 2.5, 0.54, 2.7);
    setPart(parts.wheelA, index, x, y, z, yaw, -1.25, 0.46, 0.6, 0.32, 0.84, 0.84);
    setPart(parts.wheelB, index, x, y, z, yaw, 1.25, 0.46, -1.55, 0.32, 0.84, 0.84);
    setPart(parts.horse, index, x, y + trot, z, yaw, 0, 0.86, 2.4, 1.1, 1.1, 2.2);
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
