import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher, yawForVector } from './voxelBatcher.js';

const WORLD_BOUNDS = 360;
const TERRAIN_CELL = 6;
const TILE = 3.8;
const VISITOR_COUNT = 210;
const RAFT_COUNT = 18;
const SHUTTLE_COUNT = 12;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'grandCanyonRim',
  'grandCanyonPlateau',
  'grandCanyonSandstone',
  'grandCanyonShale',
  'grandCanyonDepth',
  'grandCanyonGreen',
  'water',
  'road',
  'cobblestone',
  'limestone',
  'sandstone',
  'wood',
  'cloth',
  'gold',
  'glass',
  'shadow',
  'vegetation',
  'crowd',
  'skin'
];

const RIVER_POINTS = [
  [-274, 38],
  [-224, 8],
  [-170, 24],
  [-118, -20],
  [-58, -28],
  [4, -66],
  [72, -42],
  [136, -82],
  [206, -56],
  [276, -92]
].map(([x, z]) => ({ x, z }));

const SIDE_CANYONS = [
  [[-214, 128], [-180, 76], [-170, 24]],
  [[-78, 144], [-92, 72], [-118, -20]],
  [[56, 152], [42, 62], [4, -66]],
  [[170, 126], [154, 12], [136, -82]],
  [[-222, -174], [-182, -82], [-170, 24]],
  [[32, -196], [44, -118], [72, -42]],
  [[204, -202], [190, -120], [206, -56]]
].map((points) => points.map(([x, z]) => ({ x, z })));

const LANDMARKS = [
  ['South Rim Overlook', -84, 168, 84, 54],
  ['Mather Point', -112, 154, 50, 36],
  ['Yavapai Point', 10, 152, 58, 36],
  ['Desert View Watchtower', 184, 112, 58, 46],
  ['Bright Angel Trail', -132, 112, 38, 116],
  ['South Kaibab Trail', 78, 112, 36, 126],
  ['Colorado River', 28, -58, 238, 38],
  ['Temple Buttes', 86, -102, 120, 86],
  ['North Rim', 0, -218, 188, 54],
  ['Visitor Center', -176, 218, 86, 54],
  ['Canyon Aerial', 0, -18, 230, 180]
];

const BUTTES = [
  [-74, -102, 34, 27, 16],
  [54, -122, 44, 34, 19],
  [142, -18, 30, 26, 14],
  [-198, -48, 26, 23, 13],
  [204, -126, 36, 28, 15]
];

function createRng(seed = 0x4743415a) {
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

function distanceToPolylineSq(x, z, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    best = Math.min(best, distanceToSegmentSq(x, z, points[i - 1], points[i]));
  }
  return best;
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

function riverDistance(x, z) {
  return Math.sqrt(distanceToPolylineSq(x, z, RIVER_POINTS));
}

function canyonCutAt(x, z) {
  const mainDistance = riverDistance(x, z);
  let cut = Math.exp(-((mainDistance / 82) ** 2)) * 34;
  for (const canyon of SIDE_CANYONS) {
    const d = Math.sqrt(distanceToPolylineSq(x, z, canyon));
    cut += Math.exp(-((d / 28) ** 2)) * 12.5;
  }
  return cut;
}

function butteLiftAt(x, z) {
  let lift = 0;
  for (const [bx, bz, sx, sz, height] of BUTTES) {
    lift += Math.exp(-(((x - bx) / sx) ** 2 + ((z - bz) / sz) ** 2)) * height;
  }
  return lift;
}

function terrainHeightAt(x, z) {
  const distance = riverDistance(x, z);
  const plateau = 37.5 + Math.sin(x * 0.019 + z * 0.013) * 1.5 + Math.cos(x * 0.011 - z * 0.027) * 1.2;
  const southRim = Math.exp(-(((z - 164) / 86) ** 2)) * 5.6;
  const northRim = Math.exp(-(((z + 218) / 76) ** 2)) * 7.2;
  const eastRim = Math.exp(-(((x - 228) / 68) ** 2 + ((z - 72) / 150) ** 2)) * 4.8;
  const cut = canyonCutAt(x, z);
  const strataSteps = Math.floor(Math.max(0, cut) / 5) * 0.62;
  const noise = Math.sin(x * 0.053 + z * 0.031) * 0.62 + Math.cos(x * 0.024 - z * 0.047) * 0.48;
  let height = plateau + southRim + northRim + eastRim + butteLiftAt(x, z) - cut + strataSteps + noise;

  if (distance < 9) height = Math.min(height, 3.1 + Math.sin(x * 0.04) * 0.45 + Math.cos(z * 0.05) * 0.38);
  return Math.max(1.15, height);
}

export function grandCanyonTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function materialForTerrain(x, z, height) {
  const distance = riverDistance(x, z);
  if (distance < 13) return 'grandCanyonDepth';
  if (height < 9) return 'grandCanyonDepth';
  if (height < 17) return 'grandCanyonShale';
  if (height < 26) return 'grandCanyonSandstone';
  if (z < -190 || (Math.abs(x) > 210 && z > 80)) return 'grandCanyonGreen';
  if (height > 40) return 'grandCanyonPlateau';
  return 'grandCanyonRim';
}

function isRiver(x, z, padding = 0) {
  return riverDistance(x, z) < 8 + padding;
}

function isProtectedCanyon(x, z) {
  if (isRiver(x, z, 14)) return true;
  if (canyonCutAt(x, z) > 18 && z < 130) return true;
  return false;
}

export function createGrandCanyonScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Grand Canyon voxel material: ${key}`);
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
  buildRiver({ addTop, addLabel, rng });
  buildStrataAndButtes({ addTop, addLabel, rng });
  buildRimInfrastructure({ planner, addTop, addTiledRect, addLabel, rng });
  buildTrails({ addTop, addLabel, rng });
  buildVegetationAndDetails({ planner, addTop, rng });
  const pedestrians = buildVisitors({ animated, rng });
  const boats = buildRafts({ animated, rng });
  const buses = buildShuttles({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-grand-canyon-arizona-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      overlook: new THREE.Vector3(-84, topY(-84, 168) + 12, 168),
      mather: new THREE.Vector3(-112, topY(-112, 154) + 10, 154),
      yavapai: new THREE.Vector3(10, topY(10, 152) + 10, 152),
      watchtower: new THREE.Vector3(184, topY(184, 112) + 20, 112),
      brightAngel: new THREE.Vector3(-132, topY(-132, 112) + 12, 112),
      southKaibab: new THREE.Vector3(78, topY(78, 112) + 12, 112),
      coloradoRiver: new THREE.Vector3(28, topY(28, -58) + 5, -58),
      buttes: new THREE.Vector3(86, topY(86, -102) + 20, -102),
      northRim: new THREE.Vector3(0, topY(0, -218) + 18, -218),
      visitorCenter: new THREE.Vector3(-176, topY(-176, 218) + 10, 218),
      aerial: new THREE.Vector3(0, topY(0, -18) + 18, -18)
    },
    metrics: {
      instances: total,
      pedestrians,
      boats,
      buses,
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
    ['South Rim road', -40, 220, 262, 16],
    ['Rim trail', -14, 158, 260, 12],
    ['Bright Angel switchbacks', -132, 72, 24, 116],
    ['South Kaibab switchbacks', 78, 78, 24, 126],
    ['Desert View road', 142, 166, 118, 14]
  ].forEach(([tag, x, z, width, depth]) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
  });
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      const height = terrainHeightAt(x, z);
      const material = materialForTerrain(x, z, height);
      batch.add(material, x, height / 2 - 0.04, z, TERRAIN_CELL * 1.04, height, TERRAIN_CELL * 1.04);
    }
  }
}

function buildRiver({ addTop, addLabel, rng }) {
  const route = prepareRoute({ width: 8, loop: false, points: RIVER_POINTS });

  for (const segment of route.segments) {
    const steps = Math.max(2, Math.ceil(segment.length / 4.5));
    const yaw = yawForVector(segment.dx, segment.dz);
    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) / steps;
      const x = segment.a.x + segment.dx * t;
      const z = segment.a.z + segment.dz * t;
      const width = 8 + Math.sin((x + z) * 0.035) * 1.2;
      addTop('water', x, z, segment.length / steps + 0.8, 0.16, width, 0x3f91aa, yaw, topY(x, z) + 0.12);
      if (i % 4 === 0) {
        addTop('limestone', x + (rng() - 0.5) * width, z + (rng() - 0.5) * width, 2.8, 0.16, 0.55, null, yaw + rng() * 0.3, topY(x, z) + 0.34);
      }
      if (i % 7 === 0) {
        addTop('shadow', x - Math.sin(yaw) * width * 0.56, z - Math.cos(yaw) * width * 0.56, 2.2, 0.32, 2.4, null, rng() * Math.PI, topY(x, z) + 0.08);
        addTop('shadow', x + Math.sin(yaw) * width * 0.56, z + Math.cos(yaw) * width * 0.56, 2.2, 0.32, 2.4, null, rng() * Math.PI, topY(x, z) + 0.08);
      }
    }
  }

  addLabel('Colorado River', 28, topY(28, -58) + 8, -58);
}

function buildStrataAndButtes({ addTop, addLabel, rng }) {
  const route = prepareRoute({ width: 1, loop: false, points: RIVER_POINTS });
  const bandMaterials = ['grandCanyonShale', 'grandCanyonSandstone', 'grandCanyonRim', 'limestone', 'grandCanyonPlateau'];

  for (const segment of route.segments) {
    const steps = Math.max(2, Math.ceil(segment.length / 8));
    const yaw = yawForVector(segment.dx, segment.dz);
    const inv = 1 / segment.length;
    const tangentX = segment.dx * inv;
    const tangentZ = segment.dz * inv;
    const perpX = -tangentZ;
    const perpZ = tangentX;

    for (let i = 0; i < steps; i += 1) {
      const t = (i + 0.5) / steps;
      const cx = segment.a.x + segment.dx * t;
      const cz = segment.a.z + segment.dz * t;
      for (const side of [-1, 1]) {
        for (let band = 0; band < 6; band += 1) {
          const offset = 18 + band * 14 + Math.sin((cx + band * 17) * 0.03) * 3;
          const x = cx + perpX * side * offset;
          const z = cz + perpZ * side * offset;
          if (Math.abs(x) > WORLD_BOUNDS - 8 || Math.abs(z) > WORLD_BOUNDS - 8) continue;
          const material = bandMaterials[band % bandMaterials.length];
          const width = 8 + band * 1.4;
          const length = segment.length / steps + 1.2;
          addTop(material, x, z, length, 0.22 + band * 0.025, width, null, yaw, topY(x, z) + 0.12 + band * 0.05);
          if (band % 2 === 0 && i % 5 === 0) {
            addTop('shadow', x + perpX * side * 2.6, z + perpZ * side * 2.6, length * 0.55, 0.28, 1.1, null, yaw, topY(x, z) + 0.18);
          }
        }
      }
    }
  }

  BUTTES.forEach(([x, z, sx, sz, height], index) => {
    buildButte(addTop, x, z, sx, sz, height, rng, index);
  });
  addLabel('Temple Buttes', 86, topY(86, -102) + 30, -102);
}

function buildButte(addTop, x, z, sx, sz, height, rng, index) {
  const base = topY(x, z);
  const levels = Math.max(5, Math.floor(height / 3));
  for (let i = 0; i < levels; i += 1) {
    const shrink = i / levels;
    const material = i % 3 === 0 ? 'grandCanyonSandstone' : i % 3 === 1 ? 'grandCanyonRim' : 'grandCanyonShale';
    const lx = sx * (1 - shrink * 0.55);
    const lz = sz * (1 - shrink * 0.48);
    addTop(material, x + Math.sin(i + index) * 0.6, z + Math.cos(i * 0.7 + index) * 0.6, lx, 1.5, lz, null, rng() * 0.08 - 0.04, base + i * 1.45);
  }
  addTop('limestone', x, z, sx * 0.28, 0.42, sz * 0.22, null, 0, base + levels * 1.45 + 0.2);
}

function buildRimInfrastructure({ planner, addTop, addTiledRect, addLabel, rng }) {
  buildPath(addTop, [
    [-230, 222],
    [-176, 218],
    [-112, 186],
    [-84, 168],
    [10, 152],
    [92, 160],
    [184, 112],
    [236, 112]
  ], 7.5, 'road');

  buildPath(addTop, [
    [-170, 160],
    [-112, 154],
    [-84, 168],
    [10, 152],
    [72, 158],
    [184, 112]
  ], 4.2, 'cobblestone');

  buildOverlook(addTop, addTiledRect, -112, 154, 42, 24, -0.08, 'Mather Point');
  buildOverlook(addTop, addTiledRect, -84, 168, 58, 28, 0.1, 'South Rim Overlook');
  buildOverlook(addTop, addTiledRect, 10, 152, 48, 24, 0.04, 'Yavapai Point');
  buildDesertViewWatchtower(addTop, addTiledRect, addLabel, 184, 112, rng);
  buildVisitorCenter({ planner, addTop, addTiledRect, addLabel, rng });
  buildParkingTurnout({ addTop, addTiledRect, rng });

  addLabel('Mather Point', -112, topY(-112, 154) + 10, 154);
  addLabel('Yavapai Point', 10, topY(10, 152) + 10, 152);
  addLabel('South Rim Overlook', -84, topY(-84, 168) + 11, 168);
  addLabel('North Rim', 0, topY(0, -218) + 16, -218);

  for (let i = 0; i < 70; i += 1) {
    const x = -162 + rng() * 272;
    const z = 138 + rng() * 40;
    if (planner.hasPoint(x, z, 'building')) continue;
    addStaticPerson(addTop, x, z, i % 6 === 0 ? 'cloth' : 'crowd', 0.88 + rng() * 0.18);
  }
}

function buildOverlook(addTop, addTiledRect, x, z, width, depth, yaw, name) {
  addTiledRect('cobblestone', x, z, width, depth, { tile: 3.4, height: 0.16, yaw, baseOffset: 0.1 });
  addTop('limestone', x, z, width + 2.2, 0.8, 2.2, null, yaw, topY(x, z) + 0.18);
  const railZ = z - Math.cos(yaw) * depth * 0.52;
  const railX = x + Math.sin(yaw) * depth * 0.52;
  addTop('wood', railX, railZ, width * 0.9, 1.25, 0.42, null, yaw, topY(railX, railZ) + 0.2);
  for (let i = -2; i <= 2; i += 1) {
    addTop('wood', x + Math.cos(yaw) * i * (width / 5), z - Math.sin(yaw) * i * (width / 5) - Math.cos(yaw) * depth * 0.52, 0.42, 1.6, 0.42, null, yaw, topY(x, z) + 0.1);
  }
  buildSign(addTop, x - width * 0.34, z + depth * 0.34, yaw, name);
  buildBench(addTop, x + width * 0.26, z + depth * 0.26, yaw);
}

function buildDesertViewWatchtower(addTop, addTiledRect, addLabel, x, z, rng) {
  const yaw = -0.18;
  addTiledRect('cobblestone', x, z, 46, 34, { tile: 3.5, height: 0.15, yaw, baseOffset: 0.12 });
  const base = topY(x, z);
  addTop('grandCanyonShale', x, z, 15.5, 4.8, 15.5, null, yaw, base + 0.2);
  addTop('grandCanyonSandstone', x, z, 12.5, 7.8, 12.5, null, yaw, base + 4.8);
  addTop('grandCanyonRim', x, z, 10.2, 7.4, 10.2, null, yaw, base + 12.2);
  addTop('limestone', x, z, 8.3, 4.2, 8.3, null, yaw, base + 19.1);
  addTop('wood', x, z, 9.2, 1.4, 9.2, null, yaw, base + 23.2);
  addTop('gold', x, z, 2.2, 1.0, 2.2, null, yaw, base + 24.6);

  for (let i = 0; i < 8; i += 1) {
    const angle = yaw + (i / 8) * Math.PI * 2;
    const wx = x + Math.cos(angle) * 6.3;
    const wz = z + Math.sin(angle) * 6.3;
    addTop('shadow', wx, wz, 1.1, 2.0, 0.36, null, angle, base + 13 + (i % 2) * 3);
  }
  for (let i = 0; i < 8; i += 1) {
    addStaticPerson(addTop, x - 17 + rng() * 34, z - 12 + rng() * 20, i % 3 === 0 ? 'cloth' : 'crowd', 0.9);
  }
  buildSign(addTop, x - 22, z + 14, yaw, 'Desert View');
  addLabel('Desert View Watchtower', x, base + 31, z);
}

function buildVisitorCenter({ planner, addTop, addTiledRect, addLabel, rng }) {
  const x = -176;
  const z = 218;
  planner.reserveRect('grand-canyon-visitor-center-building', x, z, 64, 36, { force: true, type: 'building' });
  addTiledRect('road', -176, 244, 96, 38, { tile: 4.2, height: 0.12, baseOffset: 0.08 });
  addTiledRect('cobblestone', x, z, 72, 44, { tile: 3.8, height: 0.14, baseOffset: 0.1 });
  buildLodge(addTop, x - 18, z, 34, 18, 6.2, -0.08);
  buildLodge(addTop, x + 22, z + 4, 28, 16, 5.4, 0.12);
  buildSign(addTop, x - 38, z - 12, -0.08, 'Visitor Center');
  buildFlag(addTop, x + 40, z + 14, 0.08);
  addLabel('Visitor Center', x, topY(x, z) + 13, z);

  for (let i = 0; i < 28; i += 1) {
    buildParkedCar(addTop, -214 + (i % 7) * 11.5, 234 + Math.floor(i / 7) * 8.5, i % 2 ? 0.06 : Math.PI, i % 4);
  }
  for (let i = 0; i < 18; i += 1) {
    addStaticPerson(addTop, -210 + rng() * 74, 202 + rng() * 42, i % 4 === 0 ? 'cloth' : 'crowd', 0.88 + rng() * 0.16);
  }
}

function buildParkingTurnout({ addTop, addTiledRect, rng }) {
  addTiledRect('road', 118, 186, 88, 26, { tile: 4.2, height: 0.12, baseOffset: 0.1 });
  for (let i = 0; i < 14; i += 1) {
    buildParkedCar(addTop, 82 + (i % 7) * 11.4, 182 + Math.floor(i / 7) * 8.6, i % 2 ? 0 : Math.PI, i % 5);
  }
  for (let i = 0; i < 8; i += 1) {
    buildBench(addTop, 84 + rng() * 66, 160 + rng() * 18, -0.15 + rng() * 0.3);
  }
}

function buildTrails({ addTop, addLabel, rng }) {
  buildPath(addTop, [
    [-132, 142],
    [-144, 104],
    [-120, 78],
    [-146, 52],
    [-112, 26],
    [-128, -12],
    [-98, -34],
    [-74, -62]
  ], 4.0, 'grandCanyonSandstone');

  buildPath(addTop, [
    [78, 142],
    [66, 108],
    [96, 84],
    [64, 56],
    [98, 24],
    [54, -2],
    [24, -38],
    [4, -66]
  ], 3.8, 'grandCanyonSandstone');

  buildPath(addTop, [
    [-6, -218],
    [12, -184],
    [36, -142],
    [72, -42]
  ], 3.6, 'grandCanyonShale');

  addLabel('Bright Angel Trail', -132, topY(-132, 112) + 12, 112);
  addLabel('South Kaibab Trail', 78, topY(78, 112) + 12, 112);

  [
    [-132, 142],
    [-144, 104],
    [-120, 78],
    [-146, 52],
    [78, 142],
    [66, 108],
    [96, 84],
    [64, 56]
  ].forEach(([x, z], index) => {
    if (index % 2 === 0) buildTrailPost(addTop, x, z, rng() * Math.PI);
  });
}

function buildPath(addTop, points, width, material) {
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / 4.2));
    const yaw = yawForVector(dx, dz);

    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      addTop(material, x, z, length / steps + 0.5, 0.14, width, null, yaw, topY(x, z) + 0.12);
    }
  }
}

function buildVegetationAndDetails({ planner, addTop, rng }) {
  for (let i = 0; i < 680; i += 1) {
    const x = -WORLD_BOUNDS + rng() * WORLD_BOUNDS * 2;
    const z = -WORLD_BOUNDS + rng() * WORLD_BOUNDS * 2;
    if (planner.hasPoint(x, z) || isProtectedCanyon(x, z)) continue;
    const height = topY(x, z);
    const rimBias = z > 115 || z < -180 || Math.abs(x) > 230;
    if (rimBias && rng() > 0.36) addJuniper(addTop, x, z, 0.7 + rng() * 0.55);
    else if (rng() > 0.62) addScrub(addTop, x, z, 0.65 + rng() * 0.5);
    else if (height < 31 && rng() > 0.76) addCactus(addTop, x, z, 0.55 + rng() * 0.5);
  }

  for (let i = 0; i < 260; i += 1) {
    const x = -270 + rng() * 540;
    const z = -250 + rng() * 360;
    if (planner.hasPoint(x, z) || isRiver(x, z, 10)) continue;
    if (canyonCutAt(x, z) < 13 && rng() > 0.42) continue;
    addRock(addTop, x, z, 0.5 + rng() * 1.4, rng() * Math.PI);
  }

  for (let i = 0; i < 34; i += 1) {
    buildInterpretiveStop(addTop, -156 + rng() * 280, 146 + rng() * 44, rng() * 0.5 - 0.25);
  }
}

function buildLodge(addTop, x, z, width, depth, height, yaw) {
  const base = topY(x, z);
  addTop('grandCanyonShale', x, z, width, height, depth, null, yaw, base);
  addTop('wood', x, z, width * 1.08, 2.0, depth * 1.16, null, yaw, base + height);
  addTop('shadow', x, z - Math.cos(yaw) * depth * 0.51, width * 0.32, 2.2, 0.42, null, yaw, base + height * 0.42);
  for (let i = -2; i <= 2; i += 1) {
    addTop('gold', x + Math.cos(yaw) * i * (width / 6), z - Math.sin(yaw) * i * (width / 6) - Math.cos(yaw) * depth * 0.52, 1.4, 1.2, 0.34, null, yaw, base + height * 0.58);
  }
}

function buildParkedCar(addTop, x, z, yaw, paletteIndex = 0) {
  const colors = [0xb96038, 0x516a7a, 0xd8a334, 0x8b8d88, 0x75a26a];
  const base = topY(x, z);
  addTop('cloth', x, z, 5.2, 1.15, 2.5, colors[paletteIndex % colors.length], yaw, base + 0.06);
  addTop('glass', x + Math.cos(yaw) * 0.45, z - Math.sin(yaw) * 0.45, 2.4, 0.82, 2.0, null, yaw, base + 1.0);
  addTop('shadow', x + Math.cos(yaw) * 1.7, z - Math.sin(yaw) * 1.7, 0.7, 0.55, 2.8, null, yaw, base + 0.1);
  addTop('shadow', x - Math.cos(yaw) * 1.7, z + Math.sin(yaw) * 1.7, 0.7, 0.55, 2.8, null, yaw, base + 0.1);
}

function buildSign(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x - Math.sin(yaw) * 1.1, z - Math.cos(yaw) * 1.1, 0.28, 2.5, 0.28, null, yaw, base);
  addTop('wood', x + Math.sin(yaw) * 1.1, z + Math.cos(yaw) * 1.1, 0.28, 2.5, 0.28, null, yaw, base);
  addTop('cloth', x, z, 4.8, 1.4, 0.28, null, yaw, base + 2.0);
}

function buildFlag(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.32, 5.8, 0.32, null, yaw, base);
  addTop('cloth', x + Math.cos(yaw) * 1.1, z - Math.sin(yaw) * 1.1, 2.5, 1.6, 0.22, 0xb96038, yaw, base + 4.2);
}

function buildBench(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x, z, 4.2, 0.35, 1.1, null, yaw, base + 0.7);
  addTop('wood', x, z + Math.cos(yaw) * 0.45, 4.2, 1.0, 0.32, null, yaw, base + 0.94);
  addTop('shadow', x - Math.cos(yaw) * 1.6, z + Math.sin(yaw) * 1.6, 0.32, 0.7, 0.32, null, yaw, base);
  addTop('shadow', x + Math.cos(yaw) * 1.6, z - Math.sin(yaw) * 1.6, 0.32, 0.7, 0.32, null, yaw, base);
}

function buildTrailPost(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.32, 2.2, 0.32, null, yaw, base);
  addTop('gold', x + Math.cos(yaw) * 0.4, z - Math.sin(yaw) * 0.4, 1.4, 0.72, 0.24, null, yaw, base + 1.82);
}

function buildInterpretiveStop(addTop, x, z, yaw) {
  buildSign(addTop, x, z, yaw);
  if (Math.sin(x * 0.1 + z * 0.04) > 0.2) buildBench(addTop, x + 4, z + 2, yaw + 0.18);
}

function addJuniper(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.52 * scale, 2.4 * scale, 0.52 * scale, null, 0, base);
  addTop('grandCanyonGreen', x, z, 2.7 * scale, 2.3 * scale, 2.7 * scale, null, 0, base + 1.7 * scale);
  addTop('vegetation', x + 0.5 * scale, z - 0.2 * scale, 1.7 * scale, 1.4 * scale, 1.7 * scale, null, 0, base + 3.1 * scale);
}

function addScrub(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('vegetation', x, z, 1.8 * scale, 0.7 * scale, 1.5 * scale, null, Math.sin(x) * 0.4, base + 0.02);
}

function addCactus(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('grandCanyonGreen', x, z, 0.58 * scale, 2.6 * scale, 0.58 * scale, null, 0, base);
  addTop('grandCanyonGreen', x + 0.55 * scale, z, 0.35 * scale, 1.2 * scale, 0.35 * scale, null, 0, base + 1.0 * scale);
  addTop('grandCanyonGreen', x - 0.5 * scale, z, 0.32 * scale, 1.0 * scale, 0.32 * scale, null, 0, base + 0.8 * scale);
}

function addRock(addTop, x, z, scale = 1, yaw = 0) {
  const base = topY(x, z);
  const material = scale > 1.15 ? 'grandCanyonShale' : 'grandCanyonSandstone';
  addTop(material, x, z, 2.8 * scale, 1.15 * scale, 2.1 * scale, null, yaw, base);
  if (scale > 1.2) addTop('limestone', x + 1.1 * scale, z - 0.7 * scale, 1.6 * scale, 0.5 * scale, 1.1 * scale, null, yaw + 0.35, base + 0.8 * scale);
}

function addStaticPerson(addTop, x, z, body = 'crowd', scale = 1) {
  const base = topY(x, z);
  addTop(body, x, z, 0.55 * scale, 1.08 * scale, 0.42 * scale, null, 0, base + 0.02);
  addTop('skin', x, z, 0.36 * scale, 0.36 * scale, 0.36 * scale, null, 0, base + 1.05 * scale);
}

function buildVisitors({ animated, rng }) {
  const routes = createVisitorRoutes();
  const visitors = [];
  for (let i = 0; i < VISITOR_COUNT; i += 1) {
    const route = routes[i % routes.length];
    visitors.push({
      route,
      distance: rng() * route.length,
      speed: 1.15 + rng() * 2.1,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.86 + rng() * 0.22,
      photographer: i % 9 === 0
    });
  }

  const group = new THREE.Group();
  group.name = 'grand-canyon-visitors-and-hikers';
  const parts = {
    body: makeInstancedPart(visitors.length, 'grand-canyon-visitor-body', 0x516a7a),
    vest: makeInstancedPart(visitors.length, 'grand-canyon-visitor-vest', 0xd8a334),
    head: makeInstancedPart(visitors.length, 'grand-canyon-visitor-head', 0xc58a61),
    hair: makeInstancedPart(visitors.length, 'grand-canyon-visitor-hair', 0x2f241f),
    pack: makeInstancedPart(visitors.length, 'grand-canyon-visitor-pack', 0x7a4d30),
    leftLeg: makeInstancedPart(visitors.length, 'grand-canyon-visitor-left-leg', 0x30333a),
    rightLeg: makeInstancedPart(visitors.length, 'grand-canyon-visitor-right-leg', 0x30333a),
    camera: makeInstancedPart(visitors.length, 'grand-canyon-visitor-camera', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateVisitors(parts, visitors, elapsed) });
  updateVisitors(parts, visitors, 0);
  return visitors.length;
}

function buildRafts({ animated, rng }) {
  const riverRoute = prepareRoute({ width: 5, loop: false, points: RIVER_POINTS });
  const rafts = [];
  for (let i = 0; i < RAFT_COUNT; i += 1) {
    rafts.push({
      route: riverRoute,
      distance: rng() * riverRoute.length,
      speed: 2.4 + rng() * 2.4,
      lane: (rng() - 0.5) * 3.2,
      phase: rng() * Math.PI * 2,
      scale: 0.85 + rng() * 0.2
    });
  }

  const group = new THREE.Group();
  group.name = 'grand-canyon-colorado-river-rafts';
  const parts = {
    hull: makeInstancedPart(rafts.length, 'grand-canyon-raft-hull', 0xb96038),
    bow: makeInstancedPart(rafts.length, 'grand-canyon-raft-bow', 0xd8a334),
    passengerA: makeInstancedPart(rafts.length, 'grand-canyon-raft-passenger-a', 0x516a7a),
    passengerB: makeInstancedPart(rafts.length, 'grand-canyon-raft-passenger-b', 0xf0dfb2),
    wake: makeInstancedPart(rafts.length, 'grand-canyon-raft-wake', 0xbbe3e5)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateRafts(parts, rafts, elapsed) });
  updateRafts(parts, rafts, 0);
  return rafts.length;
}

function buildShuttles({ animated, rng }) {
  const routes = createShuttleRoutes();
  const shuttles = [];
  for (let i = 0; i < SHUTTLE_COUNT; i += 1) {
    const route = routes[i % routes.length];
    shuttles.push({
      route,
      distance: rng() * route.length,
      speed: 4.4 + rng() * 2.4,
      lane: (rng() - 0.5) * route.width * 0.34,
      phase: rng() * Math.PI * 2,
      scale: 0.9 + rng() * 0.14
    });
  }

  const group = new THREE.Group();
  group.name = 'grand-canyon-rim-shuttles';
  const parts = {
    body: makeInstancedPart(shuttles.length, 'grand-canyon-shuttle-body', 0xf0dfb2),
    stripe: makeInstancedPart(shuttles.length, 'grand-canyon-shuttle-stripe', 0xb96038),
    window: makeInstancedPart(shuttles.length, 'grand-canyon-shuttle-window', 0x4f7d8a),
    tireA: makeInstancedPart(shuttles.length, 'grand-canyon-shuttle-tires-a', 0x202326),
    tireB: makeInstancedPart(shuttles.length, 'grand-canyon-shuttle-tires-b', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateShuttles(parts, shuttles, elapsed) });
  updateShuttles(parts, shuttles, 0);
  return shuttles.length;
}

function createVisitorRoutes() {
  return [
    { width: 4.2, loop: false, points: [[-170, 160], [-112, 154], [-84, 168], [10, 152], [72, 158], [184, 112]].map(toPoint) },
    { width: 3.8, loop: true, points: [[-136, 142], [-116, 154], [-88, 166], [-66, 158], [-92, 144]].map(toPoint) },
    { width: 3.6, loop: true, points: [[-10, 144], [18, 154], [42, 146], [22, 134]].map(toPoint) },
    { width: 3.2, loop: false, points: [[-132, 142], [-144, 104], [-120, 78], [-146, 52], [-112, 26], [-128, -12], [-98, -34], [-74, -62]].map(toPoint) },
    { width: 3.2, loop: false, points: [[78, 142], [66, 108], [96, 84], [64, 56], [98, 24], [54, -2], [24, -38], [4, -66]].map(toPoint) },
    { width: 4.4, loop: true, points: [[-210, 224], [-176, 218], [-140, 220], [-152, 240], [-206, 238]].map(toPoint) },
    { width: 3.6, loop: false, points: [[-6, -218], [12, -184], [36, -142], [72, -42]].map(toPoint) }
  ].map(prepareRoute).filter((route) => route.length > 0);
}

function createShuttleRoutes() {
  return [
    { width: 6.8, loop: true, points: [[-232, 222], [-176, 218], [-112, 186], [-84, 168], [10, 152], [92, 160], [184, 112], [236, 112], [216, 190], [118, 186], [-20, 212]].map(toPoint) },
    { width: 6.2, loop: true, points: [[-214, 244], [-176, 244], [-132, 238], [-154, 218], [-210, 224]].map(toPoint) }
  ].map(prepareRoute).filter((route) => route.length > 0);
}

function toPoint([x, z]) {
  return { x, z };
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
const partQuaternion = new THREE.Quaternion();
const partEuler = new THREE.Euler();
const scale = new THREE.Vector3();

function updateVisitors(parts, visitors, elapsed) {
  visitors.forEach((visitor, index) => {
    const sample = sampleRoute(visitor.route, visitor.distance + elapsed * visitor.speed);
    const yaw = yawForVector(sample.tangentX, sample.tangentZ);
    const lateralX = -sample.tangentZ * visitor.lane;
    const lateralZ = sample.tangentX * visitor.lane;
    const x = sample.x + lateralX;
    const z = sample.z + lateralZ;
    const y = topY(x, z);
    const walk = Math.sin(elapsed * 5.0 + visitor.phase) * 0.21;
    const s = visitor.scale;

    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    setPart(parts.body, index, x, y + 0.68 * s, z, 0.52 * s, 1.08 * s, 0.42 * s);
    setPart(parts.vest, index, x + Math.cos(yaw) * 0.04 * s, y + 0.72 * s, z - Math.sin(yaw) * 0.04 * s, 0.44 * s, 0.58 * s, 0.12 * s);
    setPart(parts.head, index, x, y + 1.42 * s, z, 0.36 * s, 0.36 * s, 0.36 * s);
    setPart(parts.hair, index, x, y + 1.62 * s, z, 0.38 * s, 0.16 * s, 0.38 * s);
    setPart(parts.pack, index, x - Math.cos(yaw) * 0.34 * s, y + 0.84 * s, z + Math.sin(yaw) * 0.34 * s, 0.28 * s, 0.56 * s, 0.44 * s);
    setPart(parts.leftLeg, index, x + Math.sin(yaw) * 0.16 * s, y + 0.15 * s, z + Math.cos(yaw) * 0.16 * s, 0.16 * s, 0.54 * s, 0.16 * s, yaw, walk);
    setPart(parts.rightLeg, index, x - Math.sin(yaw) * 0.16 * s, y + 0.15 * s, z - Math.cos(yaw) * 0.16 * s, 0.16 * s, 0.54 * s, 0.16 * s, yaw, -walk);
    setPart(parts.camera, index, x + Math.cos(yaw) * 0.36 * s, y + 1.06 * s, z - Math.sin(yaw) * 0.36 * s, visitor.photographer ? 0.22 * s : 0.001, visitor.photographer ? 0.18 * s : 0.001, visitor.photographer ? 0.3 * s : 0.001);
  });

  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateRafts(parts, rafts, elapsed) {
  rafts.forEach((raft, index) => {
    const sample = sampleRoute(raft.route, raft.distance + elapsed * raft.speed);
    const yaw = yawForVector(sample.tangentX, sample.tangentZ);
    const lateralX = -sample.tangentZ * raft.lane;
    const lateralZ = sample.tangentX * raft.lane;
    const x = sample.x + lateralX;
    const z = sample.z + lateralZ;
    const y = topY(x, z) + 0.34 + Math.sin(elapsed * 2.8 + raft.phase) * 0.08;
    const s = raft.scale;

    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    setPart(parts.hull, index, x, y + 0.18 * s, z, 4.6 * s, 0.34 * s, 1.9 * s, yaw);
    setPart(parts.bow, index, x + Math.cos(yaw) * 1.9 * s, y + 0.38 * s, z - Math.sin(yaw) * 1.9 * s, 0.8 * s, 0.34 * s, 1.7 * s, yaw);
    setPart(parts.passengerA, index, x - Math.cos(yaw) * 0.58 * s + Math.sin(yaw) * 0.38 * s, y + 0.82 * s, z + Math.sin(yaw) * 0.58 * s + Math.cos(yaw) * 0.38 * s, 0.38 * s, 0.75 * s, 0.34 * s);
    setPart(parts.passengerB, index, x + Math.cos(yaw) * 0.44 * s - Math.sin(yaw) * 0.32 * s, y + 0.78 * s, z - Math.sin(yaw) * 0.44 * s - Math.cos(yaw) * 0.32 * s, 0.34 * s, 0.68 * s, 0.32 * s);
    setPart(parts.wake, index, x - Math.cos(yaw) * 2.8 * s, y + 0.03 * s, z + Math.sin(yaw) * 2.8 * s, 2.8 * s, 0.12 * s, 1.2 * s, yaw);
  });

  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateShuttles(parts, shuttles, elapsed) {
  shuttles.forEach((shuttle, index) => {
    const sample = sampleRoute(shuttle.route, shuttle.distance + elapsed * shuttle.speed);
    const yaw = yawForVector(sample.tangentX, sample.tangentZ);
    const lateralX = -sample.tangentZ * shuttle.lane;
    const lateralZ = sample.tangentX * shuttle.lane;
    const x = sample.x + lateralX;
    const z = sample.z + lateralZ;
    const y = topY(x, z);
    const s = shuttle.scale;

    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    setPart(parts.body, index, x, y + 0.88 * s, z, 7.2 * s, 1.65 * s, 2.55 * s, yaw);
    setPart(parts.stripe, index, x + Math.sin(yaw) * 1.32 * s, y + 1.02 * s, z + Math.cos(yaw) * 1.32 * s, 6.8 * s, 0.32 * s, 0.16 * s, yaw);
    setPart(parts.window, index, x, y + 1.55 * s, z - Math.cos(yaw) * 1.35 * s, 4.9 * s, 0.46 * s, 0.14 * s, yaw);
    setPart(parts.tireA, index, x + Math.cos(yaw) * 2.1 * s, y + 0.16 * s, z - Math.sin(yaw) * 2.1 * s, 0.72 * s, 0.46 * s, 2.8 * s, yaw);
    setPart(parts.tireB, index, x - Math.cos(yaw) * 2.1 * s, y + 0.16 * s, z + Math.sin(yaw) * 2.1 * s, 0.72 * s, 0.46 * s, 2.8 * s, yaw);
  });

  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function setPart(mesh, index, x, y, z, sx, sy, sz, yaw = null, pitch = 0) {
  position.set(x, y, z);
  if (yaw === null) {
    matrix.compose(position, quaternion, scale.set(sx, sy, sz));
  } else {
    partEuler.set(pitch, yaw, 0);
    partQuaternion.setFromEuler(partEuler);
    matrix.compose(position, partQuaternion, scale.set(sx, sy, sz));
  }
  mesh.setMatrixAt(index, matrix);
}
