import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher, yawForVector } from './voxelBatcher.js';

const WORLD_BOUNDS = 270;
const TERRAIN_CELL = 4;
const TILE = 3.8;
const HIKER_COUNT = 220;
const VILLAGE_ACTIVITY_COUNT = 76;
const PACK_ANIMAL_COUNT = 18;
const WALL_WALKWAY_Y_OFFSET = 3.05;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'greatWallTerrain',
  'greatWallForest',
  'greatWallStone',
  'greatWallEarth',
  'cobblestone',
  'limestone',
  'slate',
  'wood',
  'cloth',
  'gold',
  'vegetation',
  'shadow',
  'crowd',
  'skin'
];

const WALL_POINTS = [
  [-230, -22],
  [-204, -46],
  [-176, -62],
  [-146, -48],
  [-116, -18],
  [-84, -4],
  [-54, 28],
  [-22, 38],
  [10, 18],
  [42, 34],
  [72, 62],
  [104, 52],
  [134, 18],
  [166, -8],
  [198, 6],
  [230, 34]
].map(([x, z]) => ({ x, z }));

const TOWER_INDICES = [0, 2, 4, 6, 8, 10, 12, 14, 15];

const LANDMARKS = [
  ['Great Wall Ridge', 0, 22, 236, 52],
  ['Badaling Gate', -176, -62, 42, 36],
  ['Mutianyu Restored Wall', -108, -14, 76, 34],
  ['Jinshanling Ridge', 44, 34, 88, 34],
  ['Simatai Stairs', 92, 60, 52, 32],
  ['Jiankou Wild Wall', 168, -4, 76, 36],
  ['Beacon Tower', 230, 34, 34, 30],
  ['Mountain Village', -170, 126, 78, 52],
  ['Valley Terraces', 116, -142, 96, 62],
  ['Juyongguan Pass', -218, -8, 58, 44],
  ['Pine Valley', 22, -148, 124, 70]
];

function createRng(seed = 0x4757414c) {
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

function wallCenterZ(x) {
  let best = WALL_POINTS[0].z;
  let bestDistance = Infinity;

  for (let i = 1; i < WALL_POINTS.length; i += 1) {
    const a = WALL_POINTS[i - 1];
    const b = WALL_POINTS[i];
    const dx = b.x - a.x;
    const t = dx === 0 ? 0 : Math.max(0, Math.min(1, (x - a.x) / dx));
    const sx = a.x + dx * t;
    const dz = b.z - a.z;
    const distance = Math.abs(x - sx);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = a.z + dz * t;
    }
  }

  return best;
}

function distanceToWallSq(x, z) {
  let best = Infinity;
  for (let i = 1; i < WALL_POINTS.length; i += 1) {
    best = Math.min(best, distanceToSegmentSq(x, z, WALL_POINTS[i - 1], WALL_POINTS[i]));
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

function terrainHeightAt(x, z) {
  const ridgeZ = wallCenterZ(x);
  const ridgeDistance = z - ridgeZ;
  const wallRidge = Math.exp(-((ridgeDistance / 38) ** 2)) * (31 + Math.sin(x * 0.025) * 5);
  const northRange = Math.exp(-(((x - 64) / 170) ** 2 + ((z + 132) / 92) ** 2)) * 17;
  const westPeak = Math.exp(-(((x + 178) / 64) ** 2 + ((z + 72) / 54) ** 2)) * 15;
  const eastPeak = Math.exp(-(((x - 176) / 62) ** 2 + ((z - 8) / 46) ** 2)) * 18;
  const valleyCut = Math.exp(-(((x + 34) / 190) ** 2 + ((z - 136) / 72) ** 2)) * 7;
  const passCut = Math.exp(-(((x + 218) / 42) ** 2 + ((z + 8) / 38) ** 2)) * 7.5;
  const ravine = Math.exp(-(((x - 38) / 64) ** 2 + ((z + 106) / 32) ** 2)) * 6.5;
  const noise = Math.sin(x * 0.041 + z * 0.027) * 0.56 + Math.cos(x * 0.017 - z * 0.039) * 0.42;

  return Math.max(0.62, 1.2 + wallRidge + northRange + westPeak + eastPeak - valleyCut - passCut - ravine + noise);
}

export function greatWallTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function isForest(x, z) {
  const wallDistance = Math.sqrt(distanceToWallSq(x, z));
  if (wallDistance < 20) return false;
  if (z < -88 || x > 132 || x < -192) return true;
  return Math.sin(x * 0.037 + z * 0.019) > -0.08;
}

function isTerraceZone(x, z) {
  return x > 58 && x < 178 && z > -176 && z < -96;
}

function isVillageZone(x, z) {
  return x > -214 && x < -124 && z > 88 && z < 158;
}

export function createGreatWallScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Great Wall voxel material: ${key}`);
  }

  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 6, isRiver: () => false });
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
  const wallFrames = buildGreatWall({ batch, addTop, addLabel, rng });
  buildPassesAndGatehouses({ addTop, addTiledRect, addLabel, rng });
  buildVillagesAndTerraces({ planner, batch, addTop, addTiledRect, addLabel, rng });
  buildForestsAndRock({ planner, addTop, rng });
  buildAtmosphere({ addTop, rng });
  const wallPedestrians = buildHikers({ animated, wallFrames, rng });
  const villagePedestrians = buildVillageLife({ animated, rng });
  const packAnimals = buildPackAnimals({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-great-wall-china-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      greatWall: new THREE.Vector3(0, topY(0, 22) + 20, 22),
      badaling: new THREE.Vector3(-176, topY(-176, -62) + 16, -62),
      mutianyu: new THREE.Vector3(-108, topY(-108, -14) + 18, -14),
      jinshanling: new THREE.Vector3(44, topY(44, 34) + 18, 34),
      simatai: new THREE.Vector3(92, topY(92, 60) + 21, 60),
      jiankou: new THREE.Vector3(168, topY(168, -4) + 19, -4),
      beacon: new THREE.Vector3(230, topY(230, 34) + 20, 34),
      village: new THREE.Vector3(-170, topY(-170, 126) + 12, 126),
      terraces: new THREE.Vector3(116, topY(116, -142) + 10, -142),
      pass: new THREE.Vector3(-218, topY(-218, -8) + 14, -8),
      aerial: new THREE.Vector3(0, topY(0, 22) + 12, 22)
    },
    metrics: {
      instances: total,
      pedestrians: wallPedestrians + villagePedestrians,
      carts: packAnimals,
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

  WALL_POINTS.forEach((point, index) => {
    planner.reserveRect(`wall-ridge-${index}`, point.x, point.z, 24, 24, { force: true, type: 'landmark' });
  });

  [
    ['Village trail', -174, 72, 12, 116],
    ['Terrace trail', 88, -72, 12, 148],
    ['Pass road', -226, 18, 42, 92]
  ].forEach(([tag, x, z, width, depth]) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
  });
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      const h = terrainHeightAt(x, z);
      let material = 'greatWallTerrain';
      if (isTerraceZone(x, z) || isVillageZone(x, z)) material = 'greatWallEarth';
      else if (isForest(x, z)) material = 'greatWallForest';
      batch.add(material, x, h / 2 - 0.04, z, TERRAIN_CELL * 1.03, h, TERRAIN_CELL * 1.03);
    }
  }
}

function buildGreatWall({ batch, addTop, addLabel, rng }) {
  const frames = [];

  for (let i = 1; i < WALL_POINTS.length; i += 1) {
    const a = WALL_POINTS[i - 1];
    const b = WALL_POINTS[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(length / 5.2));
    const yaw = yawForVector(dx, dz);
    const dirX = dx / length;
    const dirZ = dz / length;
    const perpX = -dirZ;
    const perpZ = dirX;

    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      const x = a.x + dx * t;
      const z = a.z + dz * t;
      const base = topY(x, z);
      const rugged = i >= 12 || (i >= 2 && i <= 3);
      const width = rugged ? 8.0 : 9.2;
      const height = rugged ? 2.0 + ((step + i) % 3) * 0.22 : 2.7;
      const segmentLength = length / steps + 0.45;

      addTop('greatWallStone', x, z, segmentLength, height, width, null, yaw, base);
      addTop('cobblestone', x, z, segmentLength * 0.86, 0.32, width * 0.56, null, yaw, base + height);

      for (const side of [-1, 1]) {
        const px = x + perpX * side * (width * 0.43);
        const pz = z + perpZ * side * (width * 0.43);
        const parapetHeight = rugged && (step + side + i) % 5 === 0 ? 0.7 : 1.45;
        addTop('greatWallStone', px, pz, segmentLength * 0.94, parapetHeight, 0.75, null, yaw, base + height);
        if (step % 2 === 0 && !rugged) {
          const cx = x + perpX * side * (width * 0.48) + dirX * segmentLength * 0.22;
          const cz = z + perpZ * side * (width * 0.48) + dirZ * segmentLength * 0.22;
          addTop('limestone', cx, cz, 1.35, 1.18, 0.95, null, yaw, base + height + 1.34);
        }
      }

      const slope = Math.abs(topY(b.x, b.z) - topY(a.x, a.z)) / length;
      if (slope > 0.1 || i === 10 || i === 11) {
        for (let s = -1; s <= 1; s += 1) {
          const sx = x + dirX * s * 1.15;
          const sz = z + dirZ * s * 1.15;
          addTop('limestone', sx, sz, segmentLength * 0.18, 0.38, width * 0.48, null, yaw, topY(sx, sz) + height + 0.16 + s * slope * 1.2);
        }
      }

      if (rugged && step % 3 === 0) {
        const rubbleX = x + (rng() - 0.5) * 7;
        const rubbleZ = z + (rng() - 0.5) * 6;
        addTop('slate', rubbleX, rubbleZ, 2.4 + rng() * 2.2, 0.75 + rng(), 1.7 + rng() * 2.1, null, rng() * Math.PI, topY(rubbleX, rubbleZ) + 0.05);
        if (rng() > 0.45) addPine(addTop, rubbleX + (rng() - 0.5) * 8, rubbleZ + (rng() - 0.5) * 8, 0.6 + rng() * 0.35);
      }

      frames.push({ x, z, yaw, dirX, dirZ, perpX, perpZ, width, base, height });
    }
  }

  TOWER_INDICES.forEach((pointIndex, towerIndex) => {
    const point = WALL_POINTS[pointIndex];
    const next = WALL_POINTS[Math.min(WALL_POINTS.length - 1, pointIndex + 1)];
    const previous = WALL_POINTS[Math.max(0, pointIndex - 1)];
    const yaw = yawForVector(next.x - previous.x, next.z - previous.z);
    const scale = towerIndex === 0 || towerIndex === TOWER_INDICES.length - 1 ? 1.25 : 1;
    buildWatchtower(addTop, point.x, point.z, yaw, {
      name: towerIndex === 0 ? 'Juyongguan Signal Tower' : towerIndex === TOWER_INDICES.length - 1 ? 'Beacon Tower' : 'Great Wall Watchtower',
      scale,
      roof: towerIndex % 3 === 0,
      weathered: towerIndex >= 6 || towerIndex === 1
    });
  });

  addLabel('Great Wall Ridge', 0, topY(0, 22) + 34, 22);
  addLabel('Mutianyu Restored Wall', -108, topY(-108, -14) + 24, -14);
  addLabel('Jinshanling Ridge', 44, topY(44, 34) + 25, 34);
  addLabel('Simatai Stairs', 92, topY(92, 60) + 24, 60);
  addLabel('Jiankou Wild Wall', 168, topY(168, -4) + 24, -4);
  addLabel('Beacon Tower', 230, topY(230, 34) + 28, 34);
  return frames;
}

function buildWatchtower(addTop, x, z, yaw, options = {}) {
  const scale = options.scale ?? 1;
  const base = topY(x, z);
  const towerMaterial = options.weathered ? 'greatWallStone' : 'limestone';
  const width = 13.2 * scale;
  const depth = 11.8 * scale;
  const height = 12.4 * scale;

  addTop('greatWallStone', x, z, width + 2.4, 2.6 * scale, depth + 2.4, null, yaw, base - 0.18);
  addTop(towerMaterial, x, z, width, height, depth, null, yaw, base + 1.8 * scale);
  addTop('cobblestone', x, z, width * 0.82, 0.35 * scale, depth * 0.82, null, yaw, base + 1.8 * scale + height);

  for (const side of [-1, 1]) {
    addTop('shadow', x + Math.sin(yaw) * side * depth * 0.52, z + Math.cos(yaw) * side * depth * 0.52, 3.1 * scale, 2.8 * scale, 0.35, null, yaw, base + height * 0.46);
    addTop('shadow', x + Math.cos(yaw) * side * width * 0.52, z - Math.sin(yaw) * side * width * 0.52, 0.35, 2.4 * scale, 2.8 * scale, null, yaw, base + height * 0.52);
  }

  for (let i = -2; i <= 2; i += 1) {
    addTop('greatWallStone', x + Math.cos(yaw) * i * 2.5, z - Math.sin(yaw) * i * 2.5 + Math.cos(yaw) * depth * 0.48, 1.2, 1.5 * scale, 0.9, null, yaw, base + height + 2.0 * scale);
    addTop('greatWallStone', x + Math.cos(yaw) * i * 2.5, z - Math.sin(yaw) * i * 2.5 - Math.cos(yaw) * depth * 0.48, 1.2, 1.5 * scale, 0.9, null, yaw, base + height + 2.0 * scale);
  }

  if (options.roof) {
    addTop('slate', x, z, width * 1.18, 1.25 * scale, depth * 1.18, null, yaw, base + height + 2.8 * scale);
    addTop('gold', x, z, width * 0.22, 0.8 * scale, depth * 0.22, null, yaw, base + height + 4.1 * scale);
  } else if (options.weathered) {
    for (let i = 0; i < 5; i += 1) {
      addTop('slate', x + (i - 2) * 2.2, z + ((i % 2) - 0.5) * 4, 2.2, 0.8, 1.8, null, yaw + i * 0.14, base + height + 2.2 * scale);
    }
  }

  if (options.name) addLabelForTower(addTop, options.name, x, z, base + height + 10 * scale);
}

function addLabelForTower(addTop, name, x, z, y) {
  if (name === 'Great Wall Watchtower') return;
  addTop('gold', x, z, 0.72, 5.2, 0.72, null, 0, y - 5.2);
}

function buildPassesAndGatehouses({ addTop, addTiledRect, addLabel, rng }) {
  buildMountainPath(addTop, [
    [-232, 92],
    [-226, 52],
    [-218, -8],
    [-204, -46],
    [-176, -62]
  ], 6.8, 'cobblestone');
  buildGatehouse(addTop, -218, -8, -0.12, 1.15, 'Juyongguan Pass');
  buildGatehouse(addTop, -176, -62, 0.35, 1.35, 'Badaling Gate');

  addTiledRect('cobblestone', -218, 26, 54, 34, { tile: 3.5, height: 0.16 });
  for (let i = 0; i < 28; i += 1) {
    const x = -242 + rng() * 50;
    const z = 8 + rng() * 44;
    addStaticPerson(addTop, x, z, i % 5 === 0 ? 'cloth' : 'crowd', 0.9 + rng() * 0.16);
  }

  for (let i = 0; i < 12; i += 1) {
    buildBanner(addTop, -204 + i * 4.6, -23 + (i % 2) * 6, i % 2 ? 0.2 : -0.12);
  }

  addLabel('Juyongguan Pass', -218, topY(-218, -8) + 22, -8);
  addLabel('Badaling Gate', -176, topY(-176, -62) + 26, -62);
}

function buildGatehouse(addTop, x, z, yaw, scale, name) {
  const base = topY(x, z);
  addTop('greatWallStone', x, z, 28 * scale, 8.5 * scale, 14 * scale, null, yaw, base);
  addTop('shadow', x, z - Math.cos(yaw) * 7 * scale, 7.2 * scale, 4.6 * scale, 0.55 * scale, null, yaw, base + 1.4 * scale);
  addTop('limestone', x, z, 17 * scale, 6.8 * scale, 11 * scale, null, yaw, base + 8.2 * scale);
  addTop('slate', x, z, 21 * scale, 2.0 * scale, 13 * scale, null, yaw, base + 14.8 * scale);
  addTop('gold', x, z - Math.cos(yaw) * 7.4 * scale, 8.5 * scale, 1.1 * scale, 0.42 * scale, null, yaw, base + 11.8 * scale);
  if (name) addStaticPerson(addTop, x + 9 * scale, z + 8 * scale, 'crowd', 1.05);
}

function buildVillagesAndTerraces({ planner, batch, addTop, addTiledRect, addLabel, rng }) {
  buildMountainPath(addTop, [
    [-184, 136],
    [-174, 104],
    [-166, 72],
    [-146, 28],
    [-116, -18]
  ], 5.4, 'greatWallEarth');

  addTiledRect('greatWallEarth', -170, 126, 78, 48, { tile: 3.6, height: 0.12 });
  addLabel('Mountain Village', -170, topY(-170, 126) + 12, 126);
  for (let i = 0; i < 32; i += 1) {
    const x = -206 + rng() * 78;
    const z = 96 + rng() * 64;
    const width = 8 + Math.floor(rng() * 4) * 2;
    const depth = 7 + Math.floor(rng() * 4) * 2;
    if (!planner.reserveRect(`great-wall-village-${i}`, x, z, width + 3, depth + 3, { type: 'building' })) continue;
    buildVillageHouse(batch, addTop, x, z, width, depth, 4.2 + rng() * 2.8, rng() * 0.5 - 0.25);
  }
  for (let i = 0; i < 18; i += 1) buildLantern(addTop, -198 + rng() * 62, 100 + rng() * 48, rng() * Math.PI);
  buildVillageDetails({ addTop, addTiledRect, rng });

  addTiledRect('greatWallEarth', 116, -142, 96, 62, { tile: 4, height: 0.12 });
  for (let row = 0; row < 10; row += 1) {
    const z = -176 + row * 7.2;
    addTop(row % 2 ? 'greatWallEarth' : 'vegetation', 116, z, 92 - row * 3.2, 0.35, 3.4, null, 0, topY(116, z) + row * 0.16);
  }
  for (let i = 0; i < 18; i += 1) {
    const x = 76 + rng() * 80;
    const z = -168 + rng() * 50;
    addTop('wood', x, z, 0.5, 2.2, 0.5);
  }
  buildTerraceDetails({ addTop, rng });
  addLabel('Valley Terraces', 116, topY(116, -142) + 12, -142);

  buildMountainPath(addTop, [
    [116, -142],
    [98, -96],
    [82, -28],
    [72, 62]
  ], 4.8, 'greatWallEarth');
}

function buildVillageDetails({ addTop, addTiledRect, rng }) {
  addTiledRect('cobblestone', -170, 126, 42, 28, { tile: 3.5, height: 0.13, baseOffset: 0.08 });
  buildVillageWell(addTop, -170, 126);
  buildVillageShrine(addTop, -190, 142);
  buildPackStation(addTop, -146, 104);

  [
    [-190, 112, -0.25, 0xf0dfb2],
    [-184, 133, 0.18, 0xc85f46],
    [-160, 141, -0.12, 0xd8a334],
    [-146, 121, 0.28, 0x516a7a],
    [-172, 104, 0.04, 0x7d3041]
  ].forEach(([x, z, yaw, color]) => buildVillageStall(addTop, x, z, yaw, color));

  [
    [[-212, 96], [-210, 144], [-198, 160]],
    [[-134, 96], [-132, 136], [-144, 158]],
    [[-202, 158], [-170, 166], [-138, 154]],
    [[-204, 92], [-174, 88], [-142, 96]]
  ].forEach((points) => buildFenceLine(addTop, points, 'wood'));

  for (let i = 0; i < 18; i += 1) {
    const x = -204 + rng() * 76;
    const z = 96 + rng() * 62;
    if (i % 3 === 0) buildDryingRack(addTop, x, z, rng() * Math.PI);
    else if (i % 3 === 1) buildWoodPile(addTop, x, z, rng() * Math.PI);
    else buildCrates(addTop, x, z, rng() * Math.PI);
  }
}

function buildTerraceDetails({ addTop, rng }) {
  for (let row = 0; row < 8; row += 1) {
    const z = -170 + row * 7.2;
    addTop('water', 116, z + 2.9, 70 - row * 3.4, 0.12, 0.8, 0x5fa6b8, 0, topY(116, z) + row * 0.16 + 0.28);
  }

  [
    [[74, -178], [78, -126], [92, -90]],
    [[158, -174], [150, -128], [132, -96]]
  ].forEach((points) => buildFenceLine(addTop, points, 'wood'));

  for (let i = 0; i < 26; i += 1) {
    const x = 76 + rng() * 82;
    const z = -170 + rng() * 54;
    if (i % 4 === 0) addStaticPerson(addTop, x, z, 'crowd', 0.9);
    else addTop('vegetation', x, z, 2.6, 0.3, 1.4, 0x6d8548, rng() * Math.PI, topY(x, z) + 0.18);
  }
}

function buildVillageHouse(batch, addTop, x, z, width, depth, height, yaw) {
  const base = topY(x, z);
  batch.addTop('wood', x, base, z, width, height, depth, null, yaw);
  batch.addTop('slate', x, base + height, z, width + 1.4, 1.3, depth + 1.6, null, yaw);
  batch.addTop('shadow', x, base + 2.2, z + depth / 2 + 0.2, width * 0.42, 1.5, 0.3, null, yaw);
  if (width > 10) addTop('greatWallEarth', x + width * 0.36, z - depth * 0.34, 2.4, 1.8, 2.2, null, yaw, base + 0.1);
}

function buildVillageWell(addTop, x, z) {
  const base = topY(x, z);
  addTop('greatWallStone', x, z, 5.2, 0.8, 5.2, null, 0, base);
  addTop('water', x, z, 3.4, 0.18, 3.4, 0x5fa6b8, 0, base + 0.72);
  addTop('wood', x - 2.8, z, 0.32, 3.8, 0.32, null, 0, base + 0.8);
  addTop('wood', x + 2.8, z, 0.32, 3.8, 0.32, null, 0, base + 0.8);
  addTop('wood', x, z, 6.2, 0.36, 0.36, null, 0, base + 4.1);
}

function buildVillageShrine(addTop, x, z) {
  const base = topY(x, z);
  addTop('greatWallStone', x, z, 8.6, 1.0, 7.2, null, 0, base);
  addTop('wood', x, z, 6.4, 4.5, 5.2, null, 0, base + 0.9);
  addTop('slate', x, z, 8.2, 1.2, 6.8, null, 0, base + 5.2);
  addTop('gold', x, z - 2.9, 2.0, 0.8, 0.28, null, 0, base + 3.6);
}

function buildVillageStall(addTop, x, z, yaw, color) {
  const base = topY(x, z);
  addTop('wood', x, z, 5.6, 0.75, 3.2, null, yaw, base);
  addTop('cloth', x, z, 6.4, 0.35, 4.2, color, yaw, base + 1.45);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addTop(
        'wood',
        x + Math.cos(yaw) * sx * 2.4 - Math.sin(yaw) * sz * 1.4,
        z - Math.sin(yaw) * sx * 2.4 + Math.cos(yaw) * sz * 1.4,
        0.22,
        1.6,
        0.22,
        null,
        yaw,
        base + 0.05
      );
    }
  }
  buildCrates(addTop, x + Math.cos(yaw) * 4.1, z - Math.sin(yaw) * 4.1, yaw);
}

function buildPackStation(addTop, x, z) {
  buildFenceLine(addTop, [[x - 12, z - 8], [x + 12, z - 8], [x + 14, z + 10], [x - 10, z + 12]], 'wood');
  for (let i = 0; i < 5; i += 1) {
    addTop('greatWallEarth', x - 8 + i * 4, z + 4 + (i % 2) * 3, 3.2, 0.75, 2.2, null, i * 0.15, topY(x, z) + 0.14);
  }
}

function buildFenceLine(addTop, points, material) {
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / 7));
    const yaw = yawForVector(dx, dz);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      addTop(material, x, z, 0.32, 2.2, 0.32, null, yaw, topY(x, z) + 0.08);
      if (step < steps) {
        const mx = ax + dx * ((step + 0.5) / steps);
        const mz = az + dz * ((step + 0.5) / steps);
        addTop(material, mx, mz, length / steps * 0.82, 0.28, 0.28, null, yaw, topY(mx, mz) + 1.55);
      }
    }
  }
}

function buildDryingRack(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x - Math.cos(yaw) * 2.0, z + Math.sin(yaw) * 2.0, 0.25, 2.6, 0.25, null, yaw, base);
  addTop('wood', x + Math.cos(yaw) * 2.0, z - Math.sin(yaw) * 2.0, 0.25, 2.6, 0.25, null, yaw, base);
  addTop('wood', x, z, 4.4, 0.25, 0.25, null, yaw, base + 2.5);
  addTop('cloth', x - Math.cos(yaw) * 0.9, z + Math.sin(yaw) * 0.9, 1.2, 1.4, 0.18, 0xf0dfb2, yaw, base + 1.45);
  addTop('cloth', x + Math.cos(yaw) * 0.9, z - Math.sin(yaw) * 0.9, 1.1, 1.25, 0.18, 0x516a7a, yaw, base + 1.35);
}

function buildWoodPile(addTop, x, z, yaw) {
  const base = topY(x, z);
  for (let i = 0; i < 4; i += 1) {
    addTop('wood', x + (i - 1.5) * 0.55, z + (i % 2) * 0.45, 3.1, 0.38, 0.38, null, yaw + (i % 2) * 0.18, base + i * 0.18);
  }
}

function buildCrates(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x, z, 1.8, 1.2, 1.7, null, yaw, base);
  addTop('greatWallEarth', x + Math.cos(yaw) * 1.7, z - Math.sin(yaw) * 1.7, 1.4, 0.9, 1.2, null, yaw + 0.14, base + 0.05);
}

function buildForestsAndRock({ planner, addTop, rng }) {
  for (let i = 0; i < 520; i += 1) {
    const x = -252 + rng() * 504;
    const z = -244 + rng() * 468;
    if (planner.hasPoint(x, z, 'landmark') || Math.sqrt(distanceToWallSq(x, z)) < 14) continue;
    if (isForest(x, z) || rng() > 0.72) {
      addPine(addTop, x, z, 0.55 + rng() * 0.8);
    } else if (rng() > 0.55) {
      addRock(addTop, x, z, 0.75 + rng() * 1.5, rng() * Math.PI);
    }
  }

  for (let i = 0; i < 80; i += 1) {
    const x = -240 + rng() * 480;
    const z = -118 + rng() * 82;
    if (Math.sqrt(distanceToWallSq(x, z)) < 8) continue;
    addRock(addTop, x, z, 1.2 + rng() * 2.2, rng() * Math.PI);
  }
}

function buildAtmosphere({ addTop, rng }) {
  for (let i = 0; i < 18; i += 1) {
    const x = -220 + rng() * 440;
    const z = 94 + rng() * 104;
    const base = Math.max(1.4, topY(x, z) + 0.4);
    addTop('cloth', x, z, 32 + rng() * 42, 0.18, 6 + rng() * 7, null, rng() * 0.4 - 0.2, base);
  }
}

function buildMountainPath(addTop, points, width, material) {
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(length / 4.2));
    const yaw = yawForVector(dx, dz);
    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      addTop(material, x, z, length / steps + 0.5, 0.16, width, null, yaw, topY(x, z) + 0.06);
    }
  }
}

function addPine(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.55 * scale, 3.2 * scale, 0.55 * scale, null, 0, base);
  addTop('greatWallForest', x, z, 2.8 * scale, 3.8 * scale, 2.8 * scale, null, 0, base + 2.2 * scale);
  addTop('vegetation', x, z, 1.9 * scale, 2.5 * scale, 1.9 * scale, null, 0, base + 4.7 * scale);
}

function addRock(addTop, x, z, scale = 1, yaw = 0) {
  const base = topY(x, z);
  addTop('slate', x, z, 3.0 * scale, 1.35 * scale, 2.2 * scale, null, yaw, base);
  if (scale > 1.3) addTop('greatWallStone', x + 1.4 * scale, z - 0.8 * scale, 1.8 * scale, 0.7 * scale, 1.4 * scale, null, yaw + 0.35, base + 0.9 * scale);
}

function buildBanner(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.34, 5.2, 0.34, null, yaw, base);
  addTop('cloth', x + Math.cos(yaw) * 0.9, z - Math.sin(yaw) * 0.9, 2.4, 2.0, 0.26, null, yaw, base + 3.0);
}

function buildLantern(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.28, 3.2, 0.28, null, yaw, base);
  addTop('gold', x, z, 0.92, 0.92, 0.92, null, yaw, base + 2.5);
}

function addStaticPerson(addTop, x, z, body = 'crowd', scale = 1) {
  const base = topY(x, z);
  addTop(body, x, z, 0.55 * scale, 1.08 * scale, 0.42 * scale, null, 0, base + 0.02);
  addTop('skin', x, z, 0.36 * scale, 0.36 * scale, 0.36 * scale, null, 0, base + 1.05 * scale);
}

function buildHikers({ animated, wallFrames, rng }) {
  const routes = createHikerRoutes(wallFrames);
  const hikers = [];
  for (let i = 0; i < HIKER_COUNT; i += 1) {
    const route = routes[i % routes.length];
    hikers.push({
      route,
      distance: rng() * route.length,
      speed: 2.0 + rng() * 2.8,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.9 + rng() * 0.24,
      guard: i % 8 === 0
    });
  }

  const group = new THREE.Group();
  group.name = 'great-wall-hikers-and-guards';
  const parts = {
    body: makeInstancedPart(hikers.length, 'great-wall-hiker-body', 0x516a7a),
    head: makeInstancedPart(hikers.length, 'great-wall-hiker-head', 0xc58a61),
    hair: makeInstancedPart(hikers.length, 'great-wall-hiker-hair', 0x2f241f),
    pack: makeInstancedPart(hikers.length, 'great-wall-hiker-pack', 0x7a4d30),
    leftLeg: makeInstancedPart(hikers.length, 'great-wall-hiker-left-leg', 0x30333a),
    rightLeg: makeInstancedPart(hikers.length, 'great-wall-hiker-right-leg', 0x30333a),
    banner: makeInstancedPart(hikers.length, 'great-wall-guard-banner', 0xd8a334)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateHikers(parts, hikers, elapsed) });
  updateHikers(parts, hikers, 0);
  return hikers.length;
}

function buildVillageLife({ animated, rng }) {
  const routes = createVillageLifeRoutes();
  const villagers = [];
  for (let i = 0; i < VILLAGE_ACTIVITY_COUNT; i += 1) {
    const route = routes[i % routes.length];
    villagers.push({
      route,
      distance: rng() * route.length,
      speed: 1.1 + rng() * 1.7,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.86 + rng() * 0.2,
      worker: i % 4 === 0
    });
  }

  const group = new THREE.Group();
  group.name = 'great-wall-village-life';
  const parts = {
    body: makeInstancedPart(villagers.length, 'great-wall-villager-body', 0x8a4f3d),
    apron: makeInstancedPart(villagers.length, 'great-wall-villager-apron', 0xf0dfb2),
    head: makeInstancedPart(villagers.length, 'great-wall-villager-head', 0xc58a61),
    hair: makeInstancedPart(villagers.length, 'great-wall-villager-hair', 0x2f241f),
    basket: makeInstancedPart(villagers.length, 'great-wall-villager-basket', 0x7a4d30),
    leftLeg: makeInstancedPart(villagers.length, 'great-wall-villager-left-leg', 0x30333a),
    rightLeg: makeInstancedPart(villagers.length, 'great-wall-villager-right-leg', 0x30333a)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateVillageLife(parts, villagers, elapsed) });
  updateVillageLife(parts, villagers, 0);
  return villagers.length;
}

function buildPackAnimals({ animated, rng }) {
  const routes = createPackAnimalRoutes();
  const animals = [];
  for (let i = 0; i < PACK_ANIMAL_COUNT; i += 1) {
    const route = routes[i % routes.length];
    animals.push({
      route,
      distance: rng() * route.length,
      speed: 0.75 + rng() * 0.8,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.88 + rng() * 0.22
    });
  }

  const group = new THREE.Group();
  group.name = 'great-wall-pack-animals';
  const parts = {
    body: makeInstancedPart(animals.length, 'great-wall-pack-animal-body', 0x6f5137),
    head: makeInstancedPart(animals.length, 'great-wall-pack-animal-head', 0x6f5137),
    load: makeInstancedPart(animals.length, 'great-wall-pack-animal-load', 0xb9875a),
    legA: makeInstancedPart(animals.length, 'great-wall-pack-animal-leg-a', 0x3d2c1f),
    legB: makeInstancedPart(animals.length, 'great-wall-pack-animal-leg-b', 0x3d2c1f)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updatePackAnimals(parts, animals, elapsed) });
  updatePackAnimals(parts, animals, 0);
  return animals.length;
}

function createHikerRoutes(wallFrames) {
  const wallRoute = wallFrames
    .filter((_, index) => index % 2 === 0)
    .map((frame) => ({ x: frame.x, z: frame.z }));

  return [
    { width: 3.8, loop: false, surfaceOffset: WALL_WALKWAY_Y_OFFSET, points: wallRoute },
    { width: 3.4, loop: false, surfaceOffset: WALL_WALKWAY_Y_OFFSET, points: wallRoute.slice(8, 42) },
    { width: 3.4, loop: false, surfaceOffset: WALL_WALKWAY_Y_OFFSET, points: wallRoute.slice(18, 58) },
    { width: 3.2, loop: false, surfaceOffset: WALL_WALKWAY_Y_OFFSET, points: wallRoute.slice(32).reverse() },
    { width: 3.0, loop: false, surfaceOffset: WALL_WALKWAY_Y_OFFSET, points: wallRoute.slice(46).reverse() },
    { width: 5.4, loop: false, points: [[-184, 136], [-174, 104], [-166, 72], [-146, 28], [-116, -18]].map(([x, z]) => ({ x, z })) },
    { width: 4.8, loop: false, points: [[116, -142], [98, -96], [82, -28], [72, 62]].map(([x, z]) => ({ x, z })) },
    { width: 5.2, loop: true, points: [[-242, 8], [-218, -8], [-186, -20], [-176, -62], [-204, -46]].map(([x, z]) => ({ x, z })) }
  ].map(prepareRoute).filter((route) => route.length > 0);
}

function createVillageLifeRoutes() {
  return [
    { width: 5.2, loop: true, points: [[-206, 112], [-190, 142], [-170, 150], [-148, 136], [-146, 108], [-172, 100]].map(([x, z]) => ({ x, z })) },
    { width: 4.8, loop: true, points: [[-190, 112], [-170, 126], [-150, 118], [-158, 142], [-184, 136]].map(([x, z]) => ({ x, z })) },
    { width: 4.4, loop: false, points: [[-206, 126], [-184, 126], [-170, 126], [-150, 126], [-136, 116]].map(([x, z]) => ({ x, z })) },
    { width: 4.8, loop: false, points: [[78, -168], [104, -154], [132, -142], [156, -118]].map(([x, z]) => ({ x, z })) },
    { width: 4.2, loop: true, points: [[92, -164], [118, -166], [146, -154], [134, -132], [102, -138]].map(([x, z]) => ({ x, z })) }
  ].map(prepareRoute).filter((route) => route.length > 0);
}

function createPackAnimalRoutes() {
  return [
    { width: 4.4, loop: false, points: [[-202, 142], [-182, 126], [-164, 106], [-146, 72], [-116, -18]].map(([x, z]) => ({ x, z })) },
    { width: 4.0, loop: false, points: [[-142, 104], [-166, 116], [-188, 136], [-208, 152]].map(([x, z]) => ({ x, z })) },
    { width: 4.2, loop: false, points: [[116, -142], [100, -110], [88, -74], [72, 62]].map(([x, z]) => ({ x, z })) }
  ].map(prepareRoute).filter((route) => route.length > 0);
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
  return { width: route.width, loop: route.loop, surfaceOffset: route.surfaceOffset ?? 0, points, segments, length };
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

function updateHikers(parts, hikers, elapsed) {
  hikers.forEach((hiker, index) => {
    const sample = sampleRoute(hiker.route, hiker.distance + elapsed * hiker.speed);
    const yaw = yawForVector(sample.tangentX, sample.tangentZ);
    const lateralX = -sample.tangentZ * hiker.lane;
    const lateralZ = sample.tangentX * hiker.lane;
    const x = sample.x + lateralX;
    const z = sample.z + lateralZ;
    const y = topY(x, z) + hiker.route.surfaceOffset;
    const walk = Math.sin(elapsed * 5.4 + hiker.phase) * 0.22;
    const s = hiker.scale;

    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    setPart(parts.body, index, x, y + 0.7 * s, z, 0.52 * s, 1.12 * s, 0.42 * s);
    setPart(parts.head, index, x, y + 1.45 * s, z, 0.36 * s, 0.36 * s, 0.36 * s);
    setPart(parts.hair, index, x, y + 1.66 * s, z, 0.38 * s, 0.18 * s, 0.38 * s);
    setPart(parts.pack, index, x - Math.cos(yaw) * 0.32 * s, y + 0.86 * s, z + Math.sin(yaw) * 0.32 * s, 0.28 * s, 0.62 * s, 0.48 * s);
    setPart(parts.leftLeg, index, x + Math.sin(yaw) * 0.16 * s, y + 0.15 * s, z + Math.cos(yaw) * 0.16 * s, 0.16 * s, 0.56 * s, 0.16 * s, yaw, walk);
    setPart(parts.rightLeg, index, x - Math.sin(yaw) * 0.16 * s, y + 0.15 * s, z - Math.cos(yaw) * 0.16 * s, 0.16 * s, 0.56 * s, 0.16 * s, yaw, -walk);
    setPart(parts.banner, index, x + Math.cos(yaw) * 0.36 * s, y + 1.35 * s, z - Math.sin(yaw) * 0.36 * s, hiker.guard ? 0.18 * s : 0.001, hiker.guard ? 1.4 * s : 0.001, hiker.guard ? 0.18 * s : 0.001);
  });

  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateVillageLife(parts, villagers, elapsed) {
  villagers.forEach((villager, index) => {
    const sample = sampleRoute(villager.route, villager.distance + elapsed * villager.speed);
    const yaw = yawForVector(sample.tangentX, sample.tangentZ);
    const lateralX = -sample.tangentZ * villager.lane;
    const lateralZ = sample.tangentX * villager.lane;
    const x = sample.x + lateralX;
    const z = sample.z + lateralZ;
    const y = topY(x, z);
    const walk = Math.sin(elapsed * 4.8 + villager.phase) * 0.2;
    const s = villager.scale;

    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    setPart(parts.body, index, x, y + 0.66 * s, z, 0.5 * s, 1.05 * s, 0.4 * s);
    setPart(parts.apron, index, x + Math.cos(yaw) * 0.05 * s, y + 0.62 * s, z - Math.sin(yaw) * 0.05 * s, villager.worker ? 0.42 * s : 0.001, villager.worker ? 0.72 * s : 0.001, villager.worker ? 0.1 * s : 0.001);
    setPart(parts.head, index, x, y + 1.34 * s, z, 0.34 * s, 0.34 * s, 0.34 * s);
    setPart(parts.hair, index, x, y + 1.52 * s, z, 0.36 * s, 0.17 * s, 0.36 * s);
    setPart(parts.basket, index, x + Math.sin(yaw) * 0.34 * s, y + 0.76 * s, z + Math.cos(yaw) * 0.34 * s, 0.34 * s, 0.34 * s, 0.34 * s);
    setPart(parts.leftLeg, index, x + Math.sin(yaw) * 0.14 * s, y + 0.13 * s, z + Math.cos(yaw) * 0.14 * s, 0.15 * s, 0.52 * s, 0.15 * s, yaw, walk);
    setPart(parts.rightLeg, index, x - Math.sin(yaw) * 0.14 * s, y + 0.13 * s, z - Math.cos(yaw) * 0.14 * s, 0.15 * s, 0.52 * s, 0.15 * s, yaw, -walk);
  });

  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updatePackAnimals(parts, animals, elapsed) {
  animals.forEach((animal, index) => {
    const sample = sampleRoute(animal.route, animal.distance + elapsed * animal.speed);
    const yaw = yawForVector(sample.tangentX, sample.tangentZ);
    const lateralX = -sample.tangentZ * animal.lane;
    const lateralZ = sample.tangentX * animal.lane;
    const x = sample.x + lateralX;
    const z = sample.z + lateralZ;
    const y = topY(x, z);
    const bob = Math.sin(elapsed * 3.2 + animal.phase) * 0.08;
    const s = animal.scale;

    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    setPart(parts.body, index, x, y + 0.85 * s + bob, z, 1.55 * s, 0.8 * s, 0.62 * s);
    setPart(parts.head, index, x + Math.cos(yaw) * 0.95 * s, y + 1.12 * s + bob, z - Math.sin(yaw) * 0.95 * s, 0.5 * s, 0.5 * s, 0.42 * s);
    setPart(parts.load, index, x - Math.cos(yaw) * 0.18 * s, y + 1.35 * s + bob, z + Math.sin(yaw) * 0.18 * s, 1.08 * s, 0.42 * s, 0.74 * s);
    setPart(parts.legA, index, x + Math.cos(yaw) * 0.44 * s + Math.sin(yaw) * 0.26 * s, y + 0.25 * s, z - Math.sin(yaw) * 0.44 * s + Math.cos(yaw) * 0.26 * s, 0.16 * s, 0.5 * s, 0.16 * s);
    setPart(parts.legB, index, x - Math.cos(yaw) * 0.44 * s - Math.sin(yaw) * 0.26 * s, y + 0.25 * s, z + Math.sin(yaw) * 0.44 * s - Math.cos(yaw) * 0.26 * s, 0.16 * s, 0.5 * s, 0.16 * s);
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
