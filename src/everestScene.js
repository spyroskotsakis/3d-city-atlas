import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher, yawForVector } from './voxelBatcher.js';

const WORLD_BOUNDS = 380;
const TERRAIN_CELL = 7;
const TILE = 3.8;
const CLIMBER_COUNT = 260;
const TREKKER_COUNT = 170;
const YAK_COUNT = 32;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'everestSnow',
  'everestIce',
  'everestRock',
  'everestMoraine',
  'everestForest',
  'everestTent',
  'water',
  'cobblestone',
  'limestone',
  'slate',
  'wood',
  'cloth',
  'gold',
  'shadow',
  'steel',
  'vegetation',
  'crowd',
  'skin'
];

const SOUTH_ROUTE = [
  [-32, 78],
  [-12, 42],
  [2, 6],
  [32, -24],
  [58, -54],
  [48, -82],
  [64, -116],
  [10, -128]
].map(([x, z]) => ({ x, z }));

const NORTH_ROUTE = [
  [160, -255],
  [130, -205],
  [104, -158],
  [104, -118],
  [78, -92],
  [64, -116],
  [10, -128]
].map(([x, z]) => ({ x, z }));

const TREK_ROUTE = [
  [-300, 310],
  [-250, 262],
  [-196, 220],
  [-116, 186],
  [-180, 156],
  [-108, 146],
  [-34, 150],
  [-112, 94],
  [-56, 112],
  [-32, 78]
].map(([x, z]) => ({ x, z }));

const GLACIERS = [
  { name: 'Khumbu Glacier', points: [[-82, 104], [-32, 78], [-12, 42], [2, 6]], width: 26 },
  { name: 'Western Cwm', points: [[2, 6], [32, -24], [58, -54]], width: 30 },
  { name: 'Rongbuk Glacier', points: [[180, -274], [160, -255], [130, -205], [104, -158], [104, -118], [78, -92]], width: 26 },
  { name: 'Lhotse Face', points: [[32, -24], [58, -54], [64, -90]], width: 18 }
].map((glacier) => ({ ...glacier, points: glacier.points.map(([x, z]) => ({ x, z })) }));

const CAMPS = [
  ['South Base Camp', -32, 78, 54, 34, 'southBase', 28, 0x1f4f86],
  ['Khumbu Icefall', -12, 42, 40, 36, 'icefall', 10, 0xf0dfb2],
  ['Camp I', 2, 6, 32, 22, 'campI', 12, 0xd94f45],
  ['Camp II / Advanced Base', 32, -24, 42, 26, 'campII', 18, 0x2b6f8f],
  ['Camp III - Lhotse Face', 58, -54, 26, 18, 'campIII', 9, 0xe6c663],
  ['Camp IV / South Col', 48, -82, 30, 18, 'southCol', 11, 0x4b5d6b],
  ['North Base Camp', 160, -255, 64, 36, 'northBase', 24, 0x3a5872],
  ['Interim Camp', 130, -205, 38, 24, 'interimCamp', 10, 0x6d4f7c],
  ['North Advanced Base Camp', 104, -158, 48, 28, 'northAbc', 18, 0xb96038],
  ['North Col / Camp I', 104, -118, 36, 24, 'northCol', 12, 0xd8a334],
  ['North Ridge High Camp', 78, -92, 30, 18, 'northHighCamp', 8, 0x5c6268]
];

const VILLAGES = [
  ['Lukla Airstrip', -300, 310, 70, 38, 'lukla', 18],
  ['Phakding', -250, 262, 52, 34, 'phakding', 13],
  ['Namche Bazaar', -196, 220, 76, 50, 'namche', 30],
  ['Khumjung / Kunde', -116, 186, 54, 34, 'khumjung', 18],
  ['Tengboche Monastery', -180, 156, 56, 36, 'tengboche', 14],
  ['Dingboche', -108, 146, 50, 34, 'dingboche', 14],
  ['Pheriche', -34, 150, 44, 30, 'pheriche', 10],
  ['Lobuche', -112, 94, 40, 28, 'lobuche', 10],
  ['Gorak Shep', -56, 112, 36, 26, 'gorakShep', 8],
  ['Tibetan Staging Village', 235, -282, 64, 40, 'tibetVillage', 16]
];

const PEAKS = [
  ['Everest Summit', 10, -128, 50, 42, 96],
  ['South Summit', 64, -116, 30, 22, 66],
  ['Lhotse', 106, -52, 44, 36, 76],
  ['Nuptse', -78, -2, 54, 30, 60],
  ['Ama Dablam', -255, 126, 42, 36, 52],
  ['Pumori', -132, -130, 46, 38, 54],
  ['Cho Oyu Massif', 250, -190, 72, 44, 48]
];

function createRng(seed = 0x45565253) {
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

function distanceToSegmentSq(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) {
    const ax = x - a.x;
    const az = z - a.z;
    return ax * ax + az * az;
  }
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq));
  const px = a.x + dx * t;
  const pz = a.z + dz * t;
  const ox = x - px;
  const oz = z - pz;
  return ox * ox + oz * oz;
}

function distanceToPolylineSq(x, z, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    best = Math.min(best, distanceToSegmentSq(x, z, points[i - 1], points[i]));
  }
  return best;
}

function routeDistance(x, z) {
  return Math.sqrt(Math.min(distanceToPolylineSq(x, z, SOUTH_ROUTE), distanceToPolylineSq(x, z, NORTH_ROUTE)));
}

function glacierDistance(x, z) {
  let best = Infinity;
  for (const glacier of GLACIERS) {
    best = Math.min(best, Math.sqrt(distanceToPolylineSq(x, z, glacier.points)) - glacier.width / 2);
  }
  return best;
}

function peakLiftAt(x, z) {
  let lift = 0;
  for (const [, px, pz, sx, sz, height] of PEAKS) {
    lift += Math.exp(-(((x - px) / sx) ** 2 + ((z - pz) / sz) ** 2)) * height;
  }
  return lift;
}

function valleyCutAt(x, z) {
  const khumbu = Math.sqrt(distanceToPolylineSq(x, z, TREK_ROUTE));
  const southValley = Math.exp(-((khumbu / 38) ** 2)) * 14;
  const rongbuk = Math.sqrt(distanceToPolylineSq(x, z, NORTH_ROUTE));
  const northValley = Math.exp(-((rongbuk / 42) ** 2)) * 10;
  const river = Math.exp(-(((x + 204) / 110) ** 2 + ((z - 252) / 42) ** 2)) * 8;
  return southValley + northValley + river;
}

function terrainHeightAt(x, z) {
  const baseRise = 15 + Math.max(0, -z) * 0.03 + Math.max(0, 220 - Math.abs(x)) * 0.012;
  const summitMass = peakLiftAt(x, z);
  const cwm = Math.exp(-(((x - 2) / 74) ** 2 + ((z - 10) / 42) ** 2)) * 14;
  const tibetPlateau = Math.exp(-(((x - 172) / 160) ** 2 + ((z + 210) / 84) ** 2)) * 9;
  const moraine = Math.exp(-((glacierDistance(x, z) / 24) ** 2)) * 5.5;
  const valley = valleyCutAt(x, z);
  const noise = Math.sin(x * 0.031 + z * 0.024) * 1.2 + Math.cos(x * 0.019 - z * 0.041) * 0.9;
  const terracedLower = z > 150 ? Math.floor((z - 150) / 18) * 0.24 : 0;
  return Math.max(1.2, baseRise + summitMass + cwm + tibetPlateau + moraine - valley + terracedLower + noise);
}

export function everestTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function isGlacier(x, z, padding = 0) {
  return glacierDistance(x, z) < padding;
}

function isBlockedTerrain(x, z, padding = 0) {
  if (isGlacier(x, z, 6 + padding)) return true;
  if (terrainHeightAt(x, z) > 68 && routeDistance(x, z) > 16) return true;
  return false;
}

function terrainMaterial(x, z, height) {
  if (isGlacier(x, z, 1.5)) return 'everestIce';
  if (height > 62 || z < -72) return 'everestSnow';
  if (height > 38) return Math.sin(x * 0.12 + z * 0.08) > -0.15 ? 'everestSnow' : 'everestRock';
  if (z > 148 && height < 30) return 'everestForest';
  if (glacierDistance(x, z) < 18) return 'everestMoraine';
  return 'everestRock';
}

export function createEverestScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Everest voxel material: ${key}`);
  }

  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 8, isRiver: isBlockedTerrain });
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
    const yaw = options.yaw ?? 0;
    const baseOffset = options.baseOffset ?? 0.04;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    for (let lx = -width / 2 + tile / 2; lx <= width / 2 - tile / 2; lx += tile) {
      for (let lz = -depth / 2 + tile / 2; lz <= depth / 2 - tile / 2; lz += tile) {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ?? null, yaw, topY(wx, wz) + baseOffset);
      }
    }
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildPeaksAndRidges({ addTop, addLabel, rng });
  buildGlaciersAndIcefall({ addTop, addTiledRect, addLabel, rng });
  buildClimbingRoutes({ addTop, addTiledRect, addLabel });
  buildCamps({ planner, addTop, addTiledRect, addLabel, rng });
  buildVillages({ planner, addTop, addTiledRect, addLabel, rng });
  buildRegionalDetails({ planner, addTop, rng });
  const climbers = buildClimbers({ animated, rng });
  const trekkers = buildTrekkers({ animated, rng });
  const yaks = buildYaks({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-mount-everest-himalayas-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      summit: new THREE.Vector3(10, topY(10, -128) + 30, -128),
      southBase: new THREE.Vector3(-32, topY(-32, 78) + 12, 78),
      southBaseCamp: new THREE.Vector3(-32, topY(-32, 78) + 12, 78),
      icefall: new THREE.Vector3(-12, topY(-12, 42) + 14, 42),
      khumbuIcefall: new THREE.Vector3(-12, topY(-12, 42) + 14, 42),
      campII: new THREE.Vector3(32, topY(32, -24) + 13, -24),
      campTwo: new THREE.Vector3(32, topY(32, -24) + 13, -24),
      southCol: new THREE.Vector3(48, topY(48, -82) + 13, -82),
      northBase: new THREE.Vector3(160, topY(160, -255) + 12, -255),
      northBaseCamp: new THREE.Vector3(160, topY(160, -255) + 12, -255),
      northCol: new THREE.Vector3(104, topY(104, -118) + 14, -118),
      namche: new THREE.Vector3(-196, topY(-196, 220) + 12, 220),
      tengboche: new THREE.Vector3(-180, topY(-180, 156) + 14, 156),
      lukla: new THREE.Vector3(-300, topY(-300, 310) + 10, 310),
      khumbuGlacier: new THREE.Vector3(-32, topY(-32, 78) + 8, 78),
      tibet: new THREE.Vector3(235, topY(235, -282) + 11, -282),
      aerial: new THREE.Vector3(4, topY(4, -82) + 20, -82)
    },
    metrics: {
      instances: total,
      pedestrians: climbers + trekkers,
      carts: yaks,
      reservations: planner.reservations.length,
      monuments: CAMPS.length + VILLAGES.length + PEAKS.length
    },
    update(elapsed) {
      for (const item of animated) item.update(elapsed);
    }
  };
}

function reserveLandmarks(planner) {
  for (const [name, x, z, width, depth] of CAMPS) {
    planner.reserveRect(name, x, z, width, depth, { force: true, type: 'camp' });
  }
  for (const [name, x, z, width, depth] of VILLAGES) {
    planner.reserveRect(name, x, z, width, depth, { force: true, type: 'village' });
  }
  for (const [name, x, z, sx, sz] of PEAKS) {
    planner.reserveRect(name, x, z, sx * 1.15, sz * 1.15, { force: true, type: 'peak' });
  }
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      const h = terrainHeightAt(x, z);
      const kind = terrainMaterial(x, z, h);
      const shade = Math.sin(x * 0.06 + z * 0.04) * 0.035 + Math.cos(x * 0.028 - z * 0.05) * 0.025;
      batch.add(kind, x, h / 2 - 0.05, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04, terrainColor(kind, shade));
    }
  }
}

function terrainColor(kind, shade) {
  if (kind === 'everestSnow') return vary(0xf0f4ee, shade);
  if (kind === 'everestIce') return vary(0x9fd4e4, shade);
  if (kind === 'everestMoraine') return vary(0x6f6558, shade);
  if (kind === 'everestForest') return vary(0x45624b, shade);
  return vary(0x5f5c56, shade);
}

function buildPeaksAndRidges({ addTop, addLabel, rng }) {
  for (const [name, x, z, sx, sz, height] of PEAKS) {
    const base = topY(x, z);
    const layers = Math.max(4, Math.round(height / 15));
    for (let i = 0; i < layers; i += 1) {
      const t = i / layers;
      const width = sx * (0.7 - t * 0.48);
      const depth = sz * (0.7 - t * 0.48);
      addTop(i > layers * 0.45 ? 'everestSnow' : 'everestRock', x + (rng() - 0.5) * 1.4, z + (rng() - 0.5) * 1.4, width, 3.8, depth, null, 0, base + i * 3.5);
    }
    if (name === 'Everest Summit') {
      addTop('everestSnow', x, z, 11, 8, 11, 0xf4f7f3, 0, base + layers * 3.5);
      addTop('gold', x + 1.8, z - 1.5, 0.65, 5.2, 0.65, 0xd8a334, 0, base + layers * 3.5 + 7.5);
    }
    addLabel(name, x, base + layers * 3.9 + 10, z);
  }

  for (let i = 0; i < 44; i += 1) {
    const t = i / 43;
    const x = -84 + t * 158;
    const z = -18 - Math.sin(t * Math.PI) * 114;
    addTop('everestSnow', x, z, 10, 1.3, 5.5, 0xf0f4ee, yawForVector(1, -0.4), topY(x, z) + 0.2);
  }
}

function buildGlaciersAndIcefall({ addTop, addTiledRect, addLabel, rng }) {
  for (const glacier of GLACIERS) {
    for (let i = 1; i < glacier.points.length; i += 1) {
      const a = glacier.points[i - 1];
      const b = glacier.points[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const yaw = yawForVector(dx, dz);
      addTiledRect('everestIce', (a.x + b.x) / 2, (a.z + b.z) / 2, glacier.width, length, { color: '#9fd4e4', height: 0.16, tile: 4.0, yaw });
    }
    const mid = glacier.points[Math.floor(glacier.points.length / 2)];
    addLabel(glacier.name, mid.x, topY(mid.x, mid.z) + 7, mid.z);
  }

  for (let i = 0; i < 46; i += 1) {
    const x = -30 + rng() * 38;
    const z = 26 + rng() * 36;
    const yaw = rng() * Math.PI;
    addTop('shadow', x, z, 1.0 + rng() * 1.4, 0.18, 8 + rng() * 10, 0x26323b, yaw);
    if (i % 4 === 0) {
      addTop('everestIce', x + 2, z + 1, 3 + rng() * 4, 6 + rng() * 8, 3 + rng() * 5, 0xb6e7ee);
    }
    if (i % 7 === 0) {
      addTop('wood', x, z, 12, 0.26, 1.0, null, yaw + Math.PI / 2, topY(x, z) + 0.25);
      addTop('steel', x, z, 12, 0.18, 0.28, 0x66727a, yaw + Math.PI / 2, topY(x, z) + 0.5);
    }
  }
}

function buildClimbingRoutes({ addTop, addTiledRect, addLabel }) {
  buildRoutePath(SOUTH_ROUTE, { addTiledRect, material: 'cloth', width: 3.6, color: '#d94f45' });
  buildRoutePath(NORTH_ROUTE, { addTiledRect, material: 'cloth', width: 3.4, color: '#48d9ff' });
  buildRoutePath(TREK_ROUTE, { addTiledRect, material: 'cobblestone', width: 7, color: '#77766d' });

  for (const route of [SOUTH_ROUTE, NORTH_ROUTE]) {
    for (let i = 0; i < route.length; i += 1) {
      const point = route[i];
      addTop('gold', point.x, point.z, 0.45, 3.4, 0.45, 0xd8a334);
      addTop('cloth', point.x + 0.8, point.z, 1.8, 0.55, 0.28, i % 2 ? 0xd94f45 : 0x48d9ff, 0, topY(point.x, point.z) + 3.1);
    }
  }
  addLabel('Summit Ridge / Hillary Step Zone', 56, topY(56, -112) + 14, -112);
}

function buildRoutePath(points, { addTiledRect, material, width, color }) {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    addTiledRect(material, (a.x + b.x) / 2, (a.z + b.z) / 2, width, length, {
      color,
      height: material === 'cloth' ? 0.12 : 0.14,
      tile: material === 'cloth' ? 3.2 : 3.8,
      yaw: yawForVector(dx, dz),
      baseOffset: 0.22
    });
  }
}

function buildCamps({ planner, addTop, addTiledRect, addLabel, rng }) {
  for (const [name, x, z, width, depth, , tents, color] of CAMPS) {
    addTiledRect(name.includes('Icefall') ? 'everestIce' : 'everestMoraine', x, z, width, depth, { color: name.includes('Icefall') ? '#9fd4e4' : '#6f6558', height: 0.13, tile: 3.8 });
    for (let i = 0; i < tents; i += 1) {
      const tx = x - width * 0.34 + (i % 7) * (width / 7) + (rng() - 0.5) * 2.6;
      const tz = z - depth * 0.28 + Math.floor(i / 7) * 8.4 + (rng() - 0.5) * 2.2;
      if (isBlockedTerrain(tx, tz, -3)) continue;
      buildTent({ addTop, x: tx, z: tz, color: i % 4 === 0 ? 0xd94f45 : color, yaw: (rng() - 0.5) * 0.8 });
      if (i % 5 === 0) buildGearStack({ addTop, x: tx + 3.2, z: tz + 2.2 });
    }
    if (!name.includes('Icefall')) {
      addTop('steel', x + width * 0.34, z - depth * 0.18, 5.8, 1.4, 3.2, 0x66727a);
      addTop('gold', x + width * 0.38, z + depth * 0.22, 0.55, 4.2, 0.55, 0xd8a334);
      buildPrayerFlags({ addTop, x: x - width * 0.28, z: z + depth * 0.36, count: 8, span: width * 0.54 });
    }
    planner.reserveRect(`${name}-activity`, x, z, width, depth, { force: true, type: 'camp' });
    addLabel(name, x, topY(x, z) + 9, z);
  }
}

function buildTent({ addTop, x, z, color, yaw = 0 }) {
  addTop('everestTent', x, z, 4.8, 2.0, 3.4, color, yaw);
  addTop('cloth', x, z, 5.2, 0.45, 3.8, vary(color, 0.08), yaw, topY(x, z) + 1.8);
  addTop('shadow', x, z + 1.7, 2.2, 0.8, 0.3, 0x2e2924, yaw, topY(x, z) + 0.4);
}

function buildGearStack({ addTop, x, z }) {
  addTop('steel', x, z, 1.0, 1.6, 1.0, 0x66727a);
  addTop('cloth', x + 1.3, z - 0.8, 1.6, 0.8, 1.1, 0x3a5872);
  addTop('everestTent', x - 1.2, z + 0.8, 1.8, 0.9, 1.2, 0xd94f45);
}

function buildVillages({ planner, addTop, addTiledRect, addLabel, rng }) {
  for (const [name, x, z, width, depth, , houses] of VILLAGES) {
    const isAirstrip = name.includes('Airstrip');
    addTiledRect(isAirstrip ? 'cobblestone' : 'everestMoraine', x, z, width, depth, { color: isAirstrip ? '#77766d' : '#6f6558', height: 0.14, tile: 3.8 });
    if (isAirstrip) {
      addTop('cobblestone', x, z + 3, 68, 0.16, 8, 0x3f4243, 0.08);
      addTop('cloth', x + 34, z + 3, 6, 0.2, 0.8, 0xf0dfb2, 0.08, topY(x, z) + 0.3);
    }
    for (let i = 0; i < houses; i += 1) {
      const hx = x - width * 0.34 + (i % 6) * (width / 6) + (rng() - 0.5) * 2.4;
      const hz = z - depth * 0.28 + Math.floor(i / 6) * 9.2 + (rng() - 0.5) * 2.2;
      buildLodge({ addTop, x: hx, z: hz, floors: name.includes('Namche') ? 2 + (i % 2) : 1, color: i % 3 === 0 ? 0xb96038 : 0x5c6268 });
    }
    if (name.includes('Namche')) buildAmphitheaterTerraces({ addTop, x, z });
    if (name.includes('Tengboche')) buildMonastery({ addTop, x, z });
    if (name.includes('Tibetan')) buildTibetanStaging({ addTop, x, z });
    if (name.includes('Namche') || name.includes('Khumjung') || name.includes('Tengboche') || name.includes('Dingboche')) {
      buildStupa({ addTop, x: x + width * 0.32, z: z + depth * 0.3 });
    }
    buildPrayerFlags({ addTop, x: x - width * 0.35, z: z - depth * 0.4, count: 9, span: width * 0.7 });
    planner.reserveRect(`${name}-settlement`, x, z, width, depth, { force: true, type: 'village' });
    addLabel(name, x, topY(x, z) + 10, z);
  }
}

function buildLodge({ addTop, x, z, floors = 1, color = 0x5c6268 }) {
  const height = 3.6 + floors * 2.5;
  addTop('limestone', x, z, 6.2, height, 5.4, 0xa8a096);
  addTop('slate', x, z, 7.0, 1.0, 6.2, color, 0, topY(x, z) + height);
  addTop('wood', x, z + 2.9, 4.2, 0.8, 0.35, 0x7a4d30, 0, topY(x, z) + 2.4);
}

function buildMonastery({ addTop, x, z }) {
  addTop('limestone', x, z, 22, 7.2, 14, 0xd8cfb7);
  addTop('gold', x, z, 24, 1.0, 16, 0xd8a334, 0, topY(x, z) + 7.2);
  addTop('gold', x - 12, z, 2.0, 7, 2.0, 0xd8a334);
  addTop('gold', x + 12, z, 2.0, 7, 2.0, 0xd8a334);
  addTop('cloth', x, z + 7.4, 16, 1.2, 0.4, 0xd94f45, 0, topY(x, z) + 5.2);
}

function buildAmphitheaterTerraces({ addTop, x, z }) {
  for (let i = 0; i < 5; i += 1) {
    addTop('cobblestone', x - 16 + i * 8, z + 20 + i * 3, 32 - i * 3, 0.28, 2.0, 0x77766d, 0, topY(x, z) + i * 0.8);
  }
}

function buildTibetanStaging({ addTop, x, z }) {
  addTop('steel', x + 28, z - 6, 9, 2.4, 5, 0x66727a);
  addTop('steel', x + 16, z - 8, 7, 2.0, 4, 0x4b5d6b);
  addTop('gold', x - 26, z + 8, 0.8, 7, 0.8, 0xd8a334);
}

function buildStupa({ addTop, x, z }) {
  addTop('limestone', x, z, 4.8, 1.4, 4.8, 0xd8cfb7);
  addTop('limestone', x, z, 3.2, 1.1, 3.2, 0xf0dfb2, 0, topY(x, z) + 1.4);
  addTop('gold', x, z, 1.8, 2.3, 1.8, 0xd8a334, 0, topY(x, z) + 2.5);
  addTop('cloth', x, z + 2.5, 5.0, 0.42, 0.3, 0xd94f45, 0, topY(x, z) + 3.8);
}

function buildPrayerFlags({ addTop, x, z, count, span }) {
  const colors = [0xd94f45, 0x315ca8, 0xe6c663, 0x4d8a54, 0xf0dfb2];
  for (let i = 0; i < count; i += 1) {
    const px = x + (i / Math.max(1, count - 1)) * span;
    addTop('gold', px, z, 0.24, 2.4, 0.24, 0xd8a334);
    addTop('cloth', px + 1.1, z, 1.6, 0.55, 0.25, colors[i % colors.length], 0, topY(px, z) + 2.2);
  }
}

function buildRegionalDetails({ planner, addTop, rng }) {
  for (let i = 0; i < 180; i += 1) {
    const x = -330 + rng() * 270;
    const z = 150 + rng() * 180;
    if (planner.hasPoint(x, z)) continue;
    addTop('vegetation', x, z, 1.8, 4 + rng() * 2.4, 1.8, 0x45624b);
  }

  for (let i = 0; i < 80; i += 1) {
    const x = -260 + rng() * 520;
    const z = -260 + rng() * 330;
    if (planner.hasPoint(x, z)) continue;
    const h = topY(x, z);
    addTop(i % 2 ? 'everestRock' : 'everestMoraine', x, z, 3 + rng() * 4, 1.2 + rng() * 2, 3 + rng() * 4, i % 2 ? 0x5f5c56 : 0x6f6558, 0, h);
  }

  for (let i = 1; i < Math.min(TREK_ROUTE.length, 6); i += 1) {
    const a = TREK_ROUTE[i - 1];
    const b = TREK_ROUTE[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    const length = Math.min(24, Math.hypot(dx, dz) * 0.42);
    const yaw = yawForVector(dx, dz);
    addTop('steel', x, z, length, 0.32, 1.0, 0x66727a, yaw, topY(x, z) + 1.8);
    addTop('wood', x, z, length + 1, 0.24, 1.4, 0x7a4d30, yaw, topY(x, z) + 1.55);
  }
}

function buildClimbers({ animated, rng }) {
  const routes = [prepareRoute(SOUTH_ROUTE, 4.2, false), prepareRoute(NORTH_ROUTE, 4.0, false)];
  const climbers = [];
  for (let i = 0; i < CLIMBER_COUNT; i += 1) {
    const route = routes[i % routes.length];
    climbers.push({ route, distance: rng() * route.length, speed: 1.1 + rng() * 2.2, lane: (rng() - 0.5) * route.width, phase: rng() * Math.PI * 2, scale: 0.92 + rng() * 0.22 });
  }
  const group = new THREE.Group();
  group.name = 'everest-fixed-rope-climbers';
  const parts = {
    body: makeInstancedPart(climbers.length, 'everest-climber-body', 0x2b6f8f),
    pack: makeInstancedPart(climbers.length, 'everest-climber-pack', 0xd94f45),
    head: makeInstancedPart(climbers.length, 'everest-climber-head', 0xf0dfb2),
    helmet: makeInstancedPart(climbers.length, 'everest-climber-helmet', 0xe6c663),
    leftLeg: makeInstancedPart(climbers.length, 'everest-climber-left-leg', 0x30333a),
    rightLeg: makeInstancedPart(climbers.length, 'everest-climber-right-leg', 0x30333a)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updatePeople(parts, climbers, elapsed, true); } });
  updatePeople(parts, climbers, 0, true);
  return climbers.length;
}

function buildTrekkers({ animated, rng }) {
  const route = prepareRoute(TREK_ROUTE, 6.6, false);
  const trekkers = [];
  for (let i = 0; i < TREKKER_COUNT; i += 1) {
    trekkers.push({ route, distance: rng() * route.length, speed: 2 + rng() * 3.8, lane: (rng() - 0.5) * route.width, phase: rng() * Math.PI * 2, scale: 0.95 + rng() * 0.22 });
  }
  const group = new THREE.Group();
  group.name = 'everest-village-trekkers-and-porters';
  const parts = {
    body: makeInstancedPart(trekkers.length, 'everest-trekker-body', 0x6d4f7c),
    pack: makeInstancedPart(trekkers.length, 'everest-trekker-pack', 0x7a4d30),
    head: makeInstancedPart(trekkers.length, 'everest-trekker-head', 0xc58a61),
    helmet: makeInstancedPart(trekkers.length, 'everest-trekker-hat', 0x5c6268),
    leftLeg: makeInstancedPart(trekkers.length, 'everest-trekker-left-leg', 0x30333a),
    rightLeg: makeInstancedPart(trekkers.length, 'everest-trekker-right-leg', 0x30333a)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updatePeople(parts, trekkers, elapsed, false); } });
  updatePeople(parts, trekkers, 0, false);
  return trekkers.length;
}

function buildYaks({ animated, rng }) {
  const route = prepareRoute(TREK_ROUTE.slice(0, 6), 5.0, false);
  const yaks = [];
  for (let i = 0; i < YAK_COUNT; i += 1) {
    yaks.push({ route, distance: rng() * route.length, speed: 1.5 + rng() * 1.6, lane: (rng() - 0.5) * route.width, phase: rng() * Math.PI * 2 });
  }
  const group = new THREE.Group();
  group.name = 'everest-yak-caravans';
  const parts = {
    body: makeInstancedPart(yaks.length, 'everest-yak-body', 0x3c2f28),
    head: makeInstancedPart(yaks.length, 'everest-yak-head', 0x332821),
    loadA: makeInstancedPart(yaks.length, 'everest-yak-load-a', 0xd8a334),
    loadB: makeInstancedPart(yaks.length, 'everest-yak-load-b', 0xd94f45),
    legs: makeInstancedPart(yaks.length, 'everest-yak-legs', 0x261d18)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateYaks(parts, yaks, elapsed); } });
  updateYaks(parts, yaks, 0);
  return yaks.length;
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

function prepareRoute(points, width, loop) {
  const routePoints = loop ? [...points, points[0]] : points;
  const segments = [];
  let length = 0;
  for (let i = 0; i < routePoints.length - 1; i += 1) {
    const a = routePoints[i];
    const b = routePoints[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segmentLength = Math.hypot(dx, dz);
    if (segmentLength <= 0.001) continue;
    segments.push({ a, b, dx, dz, length: segmentLength, start: length });
    length += segmentLength;
  }
  return { width, loop, points: routePoints, segments, length };
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
  return { x, z, tangentX: segment.dx * invLength * direction, tangentZ: segment.dz * invLength * direction };
}

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scaleVector = new THREE.Vector3();

function updatePeople(parts, people, elapsed, highAltitude) {
  people.forEach((person, index) => {
    const sample = sampleRoute(person.route, person.distance + elapsed * person.speed);
    const x = sample.x - sample.tangentZ * person.lane;
    const z = sample.z + sample.tangentX * person.lane;
    const y = topY(x, z) + 0.08;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const stride = Math.sin(elapsed * (highAltitude ? 5.0 : 7.0) + person.phase) * 0.12;
    const bob = Math.abs(Math.sin(elapsed * 5 + person.phase)) * 0.05;
    const scale = person.scale;
    setPart(parts.body, index, x, y + bob, z, yaw, 0, 1.12, 0, 0.62 * scale, 1.05 * scale, 0.44 * scale);
    setPart(parts.pack, index, x, y + bob, z, yaw, 0, 1.1, -0.36, 0.72 * scale, 0.9 * scale, 0.28 * scale);
    setPart(parts.head, index, x, y + bob, z, yaw, 0, 1.88, 0, 0.44 * scale, 0.42 * scale, 0.44 * scale);
    setPart(parts.helmet, index, x, y + bob, z, yaw, 0, 2.13, 0, 0.5 * scale, 0.18 * scale, 0.5 * scale);
    setPart(parts.leftLeg, index, x, y, z, yaw, -0.15, 0.4, stride, 0.16 * scale, 0.7 * scale, 0.16 * scale);
    setPart(parts.rightLeg, index, x, y, z, yaw, 0.15, 0.4, -stride, 0.16 * scale, 0.7 * scale, 0.16 * scale);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateYaks(parts, yaks, elapsed) {
  yaks.forEach((yak, index) => {
    const sample = sampleRoute(yak.route, yak.distance + elapsed * yak.speed);
    const x = sample.x - sample.tangentZ * yak.lane;
    const z = sample.z + sample.tangentX * yak.lane;
    const y = topY(x, z) + 0.08;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const bob = Math.abs(Math.sin(elapsed * 4 + yak.phase)) * 0.08;
    setPart(parts.body, index, x, y + bob, z, yaw, 0, 0.85, 0, 1.25, 0.9, 1.95);
    setPart(parts.head, index, x, y + bob, z, yaw, 0, 1.15, 1.2, 0.64, 0.52, 0.7);
    setPart(parts.loadA, index, x, y + bob, z, yaw, -0.55, 1.42, -0.1, 0.58, 0.58, 0.7);
    setPart(parts.loadB, index, x, y + bob, z, yaw, 0.55, 1.42, -0.1, 0.58, 0.58, 0.7);
    setPart(parts.legs, index, x, y, z, yaw, 0, 0.28, 0, 1.05, 0.55, 1.55);
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
