import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher, yawForVector } from './voxelBatcher.js';

const WORLD_BOUNDS = 310;
const TERRAIN_CELL = 5.8;
const TILE = 3.6;
const VISITOR_COUNT = 240;
const BOAT_COUNT = 16;
const RAFT_COUNT = 14;
const WILDLIFE_COUNT = 34;
const UPSTREAM_WATER_Y = 21.2;
const GORGE_WATER_Y = 2.7;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'victoriaTerrain',
  'victoriaSavanna',
  'victoriaRainforest',
  'victoriaBasalt',
  'victoriaFoam',
  'victoriaMist',
  'water',
  'road',
  'cobblestone',
  'limestone',
  'sandstone',
  'wood',
  'steel',
  'concrete',
  'cloth',
  'gold',
  'glass',
  'shadow',
  'vegetation',
  'tropicalGreen',
  'crowd',
  'skin',
  'neonCyan',
  'neonPink'
];

const FALL_SECTIONS = [
  { key: 'devilsCataract', label: "Devil's Cataract", x: -152, width: 42, density: 0.86, color: 0xcde9ed },
  { key: 'mainFalls', label: 'Main Falls', x: -72, width: 82, density: 1.0, color: 0xe2f4f5 },
  { key: 'horseshoeFalls', label: 'Horseshoe Falls', x: 20, width: 48, density: 0.92, color: 0xd5eff1 },
  { key: 'rainbowFalls', label: 'Rainbow Falls', x: 84, width: 52, density: 0.96, color: 0xe7f7f8 },
  { key: 'easternCataract', label: 'Eastern Cataract', x: 148, width: 46, density: 0.88, color: 0xcde9ed }
];

const GORGE_POINTS = [
  [-168, 18],
  [-88, 50],
  [34, 30],
  [132, 78],
  [22, 124],
  [-116, 108],
  [-204, 164],
  [-40, 218],
  [156, 202]
].map(([x, z]) => ({ x, z }));

const BOAT_ROUTES = [
  [[-214, -196], [-146, -176], [-76, -188], [-12, -154], [54, -174], [128, -144]],
  [[-242, -112], [-154, -128], [-48, -110], [54, -128], [162, -88]],
  [[-42, -236], [26, -210], [86, -164], [112, -84]]
].map((points) => points.map(([x, z]) => ({ x, z })));

const VISITOR_ROUTES = [
  { width: 4.2, loop: false, points: [[-182, 64], [-132, 50], [-72, 44], [2, 48], [74, 44], [142, 32], [188, 26]].map(toPoint) },
  { width: 3.6, loop: true, points: [[-176, 82], [-142, 64], [-112, 82], [-132, 102], [-168, 100]].map(toPoint) },
  { width: 3.5, loop: true, points: [[132, 22], [164, 30], [176, 58], [148, 72], [118, 52]].map(toPoint) },
  { width: 4.0, loop: false, points: [[-214, 142], [-186, 120], [-160, 92], [-132, 50]].map(toPoint) },
  { width: 4.2, loop: false, points: [[206, -178], [170, -124], [128, -84], [154, -30]].map(toPoint) },
  { width: 4.4, loop: true, points: [[-238, 150], [-210, 124], [-176, 142], [-190, 178], [-232, 184]].map(toPoint) }
].map(prepareRoute);

const LANDMARKS = [
  ['Falls Escarpment', 0, -16, 360, 36],
  ["Devil's Cataract", -152, -12, 48, 38],
  ['Main Falls', -72, -12, 90, 40],
  ['Horseshoe Falls', 20, -12, 56, 38],
  ['Rainbow Falls', 84, -12, 58, 38],
  ['Eastern Cataract', 148, -12, 52, 38],
  ['Boiling Pot', 34, 80, 58, 50],
  ['Knife-Edge Bridge', 172, 42, 58, 24],
  ['Victoria Falls Bridge', 118, 112, 92, 24],
  ["Devil's Pool", 154, -34, 34, 22],
  ['Rainforest Trails', -20, 70, 310, 80],
  ['Livingstone', 212, -166, 108, 74],
  ['Victoria Falls Town', -218, 154, 104, 74],
  ['Zambezi River', 0, -142, 260, 120],
  ['Victoria Falls Aerial', 0, 30, 260, 220]
];

function createRng(seed = 0x56464354) {
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

function fallsLipZ(x) {
  return -18 + Math.sin(x * 0.031) * 2.2 + Math.sin(x * 0.078) * 0.9;
}

function upstreamCenterX(z) {
  return Math.sin((z + 145) * 0.023) * 18 + Math.sin(z * 0.061) * 4;
}

function upstreamWidthAt(z) {
  const narrowing = Math.max(0, (z + 210) / 190);
  return 186 - narrowing * 58 + Math.sin(z * 0.04) * 9;
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

function gorgeDistance(x, z) {
  return Math.sqrt(distanceToPolylineSq(x, z, GORGE_POINTS));
}

function isUpstreamRiver(x, z, pad = 0) {
  if (z < -242 - pad || z > fallsLipZ(x) + pad) return false;
  const center = upstreamCenterX(z);
  const halfWidth = upstreamWidthAt(z) / 2 + pad;
  return Math.abs(x - center) <= halfWidth && x > -270 - pad && x < 250 + pad;
}

function isFallsLip(x, z, pad = 0) {
  return Math.abs(z - fallsLipZ(x)) <= 5.8 + pad && Math.abs(x) <= 184 + pad;
}

function isGorgeWater(x, z, pad = 0) {
  return z > -4 - pad && z < 244 + pad && gorgeDistance(x, z) <= 8.5 + pad;
}

function isWater(x, z, pad = 0) {
  return isUpstreamRiver(x, z, pad) || isFallsLip(x, z, pad) || isGorgeWater(x, z, pad);
}

function isRainforest(x, z) {
  const mistBand = z > 16 && z < 112 && x > -226 && x < 226;
  const sprayPocket = ((x + 64) / 150) ** 2 + ((z - 72) / 78) ** 2 < 1.18;
  return mistBand || sprayPocket;
}

function gorgeCutAt(x, z) {
  if (z < -8) return 0;
  const main = Math.exp(-((gorgeDistance(x, z) / 62) ** 2)) * 18;
  const sideA = Math.exp(-(((x + 162) / 32) ** 2 + ((z - 116) / 76) ** 2)) * 8;
  const sideB = Math.exp(-(((x - 134) / 36) ** 2 + ((z - 126) / 80) ** 2)) * 7;
  return main + sideA + sideB;
}

function terrainHeightAt(x, z) {
  if (isUpstreamRiver(x, z, 0)) return UPSTREAM_WATER_Y + Math.sin(x * 0.035 + z * 0.019) * 0.12;
  if (isFallsLip(x, z, 0)) return UPSTREAM_WATER_Y - 0.8;
  if (isGorgeWater(x, z, 0)) return GORGE_WATER_Y + Math.sin(x * 0.05 + z * 0.04) * 0.08;

  const basin = 22.5 + Math.sin(x * 0.019 + z * 0.016) * 0.9 + Math.cos(x * 0.011 - z * 0.023) * 0.75;
  const northBank = Math.exp(-(((z + 72) / 78) ** 2)) * 3.2;
  const gorgeWall = Math.exp(-(((gorgeDistance(x, z) - 24) / 18) ** 2)) * 8.6;
  const basaltRidge = Math.exp(-(((z - 54) / 48) ** 2)) * 4.5;
  const townLift = Math.exp(-(((x - 212) / 110) ** 2 + ((z + 166) / 82) ** 2)) * 1.4;
  const savannaRoll = Math.max(0, Math.abs(x) - 190) * 0.016 + Math.max(0, z - 170) * 0.018;
  const cut = gorgeCutAt(x, z);
  return Math.max(3.4, basin + northBank + gorgeWall + basaltRidge + townLift + savannaRoll - cut);
}

export function victoriaFallsTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function materialForTerrain(x, z, height) {
  if (isUpstreamRiver(x, z, 0.4) || isGorgeWater(x, z, 0.4)) return 'water';
  if (isFallsLip(x, z, 0.4)) return 'victoriaFoam';
  if (isRainforest(x, z)) return 'victoriaRainforest';
  if (z > -2 && gorgeDistance(x, z) < 54) return 'victoriaBasalt';
  if (height < 12) return 'victoriaBasalt';
  if (Math.abs(x) > 218 || z > 178 || z < -214) return 'victoriaSavanna';
  return 'victoriaTerrain';
}

function waterSurfaceY(x, z) {
  if (isUpstreamRiver(x, z, 0) || isFallsLip(x, z, 0)) return UPSTREAM_WATER_Y + Math.sin(x * 0.035 + z * 0.019) * 0.11;
  return GORGE_WATER_Y + Math.sin(x * 0.06 + z * 0.037) * 0.08;
}

function isProtectedWaterOrGorge(x, z, pad = 0) {
  if (isWater(x, z, pad + 8)) return true;
  return z > -2 && gorgeDistance(x, z) < 28 + pad;
}

export function createVictoriaFallsScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Victoria Falls voxel material: ${key}`);
  }

  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 8, isRiver: isWater });
  const labels = [];
  const animated = [];

  const addLabel = (name, x, y, z) => {
    labels.push({ name, position: new THREE.Vector3(x, y, z) });
  };

  const addTop = (kind, x, z, sx, sy, sz, color = null, yaw = 0, base = topY(x, z)) => {
    batch.addTop(kind, x, base, z, sx, sy, sz, color, yaw);
  };

  const addBox = (kind, x, y, z, sx, sy, sz, color = null, yaw = 0) => {
    batch.add(kind, x, y, z, sx, sy, sz, color, yaw);
  };

  const addTiledRect = (kind, x, z, width, depth, options = {}) => {
    const tile = options.tile ?? TILE;
    const sy = options.height ?? 0.14;
    const yaw = options.yaw ?? 0;
    const baseOffset = options.baseOffset ?? 0.08;
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
  buildZambezi({ addTop, addBox, addLabel, rng });
  buildWaterfallCurtains({ addBox, addTop, addLabel, rng });
  buildGorgeSystem({ addTop, addBox, addLabel, rng });
  buildRainforestAndViewpoints({ planner, addTop, addTiledRect, addLabel, rng });
  buildBridges({ addTop, addBox, addLabel, rng });
  buildTowns({ planner, addTop, addTiledRect, addLabel, rng });
  buildSavannaAndWildlife({ planner, addTop, rng });
  const pedestrians = buildVisitors({ animated, rng });
  const boats = buildBoats({ animated, rng });
  const rafts = buildRafts({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-victoria-falls-zambia-zimbabwe-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      falls: new THREE.Vector3(0, UPSTREAM_WATER_Y + 18, -18),
      devilsCataract: new THREE.Vector3(-152, UPSTREAM_WATER_Y + 12, -16),
      mainFalls: new THREE.Vector3(-72, UPSTREAM_WATER_Y + 12, -16),
      horseshoeFalls: new THREE.Vector3(20, UPSTREAM_WATER_Y + 12, -16),
      rainbowFalls: new THREE.Vector3(84, UPSTREAM_WATER_Y + 12, -16),
      easternCataract: new THREE.Vector3(148, UPSTREAM_WATER_Y + 12, -16),
      zambeziRiver: new THREE.Vector3(-10, waterSurfaceY(-10, -142) + 8, -142),
      boilingPot: new THREE.Vector3(34, topY(34, 80) + 12, 80),
      knifeEdgeBridge: new THREE.Vector3(172, topY(172, 42) + 11, 42),
      victoriaFallsBridge: new THREE.Vector3(118, topY(118, 112) + 18, 112),
      devilsPool: new THREE.Vector3(154, waterSurfaceY(154, -34) + 8, -34),
      rainforestTrail: new THREE.Vector3(-20, topY(-20, 70) + 10, 70),
      livingstone: new THREE.Vector3(212, topY(212, -166) + 14, -166),
      victoriaFallsTown: new THREE.Vector3(-218, topY(-218, 154) + 14, 154),
      aerial: new THREE.Vector3(0, UPSTREAM_WATER_Y + 22, 30)
    },
    metrics: {
      instances: total,
      pedestrians,
      boats: boats + rafts,
      wildlife: WILDLIFE_COUNT,
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
    ['Zimbabwe rainforest path', -52, 70, 292, 12],
    ['Zambia cliff path', 164, 34, 86, 12],
    ['Livingstone access road', 204, -128, 118, 14],
    ['Falls town access road', -214, 126, 116, 14],
    ['Bridge approach', 112, 112, 118, 16]
  ].forEach(([tag, x, z, width, depth]) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
  });
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      const height = terrainHeightAt(x, z);
      const material = materialForTerrain(x, z, height);
      const color = material === 'victoriaTerrain' ? vary(0x9f8756, Math.sin(x * 0.07 + z * 0.04) * 0.05) : null;
      batch.add(material, x, height / 2 - 0.04, z, TERRAIN_CELL * 1.04, height, TERRAIN_CELL * 1.04, color);
    }
  }
}

function buildZambezi({ addTop, addBox, addLabel, rng }) {
  for (let z = -232; z <= -34; z += 7.2) {
    const center = upstreamCenterX(z);
    const width = upstreamWidthAt(z);
    const steps = Math.max(4, Math.floor(width / 10));
    for (let i = 0; i < steps; i += 1) {
      const x = center - width / 2 + (i + 0.5) * (width / steps);
      if (!isUpstreamRiver(x, z, 2)) continue;
      addTop('water', x, z, width / steps + 1.6, 0.18, 7.8, 0x3f91aa, 0, waterSurfaceY(x, z) + 0.04);
      if ((i + Math.floor(z)) % 5 === 0) {
        addTop('victoriaFoam', x + (rng() - 0.5) * 2.5, z + (rng() - 0.5) * 3, 4.2, 0.08, 0.6, 0xe6f6f4, rng() * 0.4, waterSurfaceY(x, z) + 0.2);
      }
    }
  }

  [
    [-114, -176, 42, 22],
    [36, -154, 54, 28],
    [132, -112, 44, 24],
    [-34, -86, 46, 18]
  ].forEach(([x, z, width, depth], index) => {
    buildRiverIsland(addTop, x, z, width, depth, rng, index);
  });

  for (const route of BOAT_ROUTES) {
    buildWaterRouteWake(addTop, route, 5.5, 'victoriaFoam', rng);
  }

  addLabel('Zambezi River', -10, waterSurfaceY(-10, -142) + 8, -142);
  addBox('victoriaMist', -4, UPSTREAM_WATER_Y + 13, -14, 250, 18, 14, 0xffffff, 0);
}

function buildRiverIsland(addTop, x, z, width, depth, rng, index) {
  const yaw = Math.sin(index) * 0.18;
  const base = waterSurfaceY(x, z) + 0.24;
  addTop('victoriaSavanna', x, z, width, 0.9, depth, null, yaw, base);
  addTop('victoriaRainforest', x - width * 0.18, z + depth * 0.1, width * 0.42, 1.1, depth * 0.44, null, yaw, base + 0.7);
  for (let i = 0; i < Math.floor(width / 8); i += 1) {
    addPalm(addTop, x - width * 0.42 + rng() * width * 0.84, z - depth * 0.32 + rng() * depth * 0.64, 0.72 + rng() * 0.36);
  }
}

function buildWaterRouteWake(addTop, route, width, material, rng) {
  const prepared = prepareRoute({ width, loop: false, points: route });
  for (const segment of prepared.segments) {
    const steps = Math.max(2, Math.ceil(segment.length / 8));
    const yaw = yawForVector(segment.dx, segment.dz);
    for (let i = 0; i < steps; i += 1) {
      if (i % 2 !== 0) continue;
      const t = (i + 0.5) / steps;
      const x = segment.a.x + segment.dx * t;
      const z = segment.a.z + segment.dz * t;
      addTop(material, x + (rng() - 0.5) * width, z + (rng() - 0.5) * width, 3.8, 0.08, 0.72, 0xe6f6f4, yaw + rng() * 0.22, waterSurfaceY(x, z) + 0.22);
    }
  }
}

function buildWaterfallCurtains({ addBox, addTop, addLabel, rng }) {
  for (const section of FALL_SECTIONS) {
    const steps = Math.max(4, Math.floor(section.width / 7));
    const left = section.x - section.width / 2;
    for (let i = 0; i < steps; i += 1) {
      const x = left + (i + 0.5) * (section.width / steps);
      const lip = fallsLipZ(x);
      const stripWidth = section.width / steps * 0.86;
      const height = 18.5 + section.density * 3.4 + Math.sin((x + i) * 0.12) * 1.2;
      const y = GORGE_WATER_Y + height / 2 + 1.4;
      const color = i % 3 === 0 ? section.color : null;
      addBox('water', x, y, lip + 0.6, stripWidth, height, 1.8, color, 0);
      addBox('victoriaFoam', x, GORGE_WATER_Y + 1.2, lip + 4.8, stripWidth * 0.95, 1.2, 4.2, 0xf1fbfa, 0);
      if (i % 2 === 0) {
        addBox('victoriaMist', x + (rng() - 0.5) * 4, GORGE_WATER_Y + 6.4 + rng() * 7, lip + 14 + rng() * 8, stripWidth * 1.7, 5 + rng() * 5, 4 + rng() * 4, 0xffffff, rng() * 0.4);
      }
    }

    const labelY = UPSTREAM_WATER_Y + 8 + section.density * 4;
    addLabel(section.label, section.x, labelY, fallsLipZ(section.x) - 8);
  }

  buildRainbow(addTop, -24, 38, 78, 22, 0.15);
  buildRainbow(addTop, 96, 48, 62, 18, -0.08);
  addLabel('Mosi-oa-Tunya / Victoria Falls', 0, UPSTREAM_WATER_Y + 20, -20);
}

function buildRainbow(addTop, x, z, width, height, yaw) {
  const colors = [0xf25fa7, 0xd8a334, 0x75a26a, 0x48d9ff];
  for (let band = 0; band < colors.length; band += 1) {
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      const arcX = x - width / 2 + width * t;
      const arcZ = z + Math.sin(t * Math.PI) * height;
      addTop(band % 2 === 0 ? 'neonPink' : 'neonCyan', arcX, arcZ, 3.2, 0.12, 0.42, colors[band], yaw, topY(arcX, arcZ) + 6.6 + band * 0.16);
    }
  }
}

function buildGorgeSystem({ addTop, addBox, addLabel, rng }) {
  const gorgeRoute = prepareRoute({ width: 8, loop: false, points: GORGE_POINTS });

  for (const segment of gorgeRoute.segments) {
    const steps = Math.max(2, Math.ceil(segment.length / 5.5));
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
      const waterY = waterSurfaceY(cx, cz);
      addTop('water', cx, cz, segment.length / steps + 0.8, 0.18, 8.5, 0x2f7f94, yaw, waterY + 0.05);
      if (i % 2 === 0) addTop('victoriaFoam', cx, cz, 4.8, 0.1, 1.1, 0xeaf7f5, yaw + 0.05, waterY + 0.22);

      for (const side of [-1, 1]) {
        const wallX = cx + perpX * side * 18;
        const wallZ = cz + perpZ * side * 18;
        const ledgeX = cx + perpX * side * 31;
        const ledgeZ = cz + perpZ * side * 31;
        if (Math.abs(wallX) < WORLD_BOUNDS - 6 && Math.abs(wallZ) < WORLD_BOUNDS - 6) {
          addTop('victoriaBasalt', wallX, wallZ, segment.length / steps + 1, 1.4, 6.2, null, yaw, topY(wallX, wallZ) + 0.3);
          if (i % 3 === 0) addTop('shadow', wallX, wallZ, 2.1, 2.2, 5.6, null, yaw + side * 0.08, topY(wallX, wallZ) + 1.6);
        }
        if (Math.abs(ledgeX) < WORLD_BOUNDS - 6 && Math.abs(ledgeZ) < WORLD_BOUNDS - 6 && i % 2 === 0) {
          addTop('sandstone', ledgeX, ledgeZ, 4.6, 0.5, 2.6, null, yaw + rng() * 0.18, topY(ledgeX, ledgeZ) + 0.18);
        }
      }
    }
  }

  for (let i = 0; i < 22; i += 1) {
    const angle = (i / 22) * Math.PI * 2;
    const x = 34 + Math.cos(angle) * (11 + (i % 3) * 2.4);
    const z = 80 + Math.sin(angle) * (8 + (i % 4) * 2.1);
    addTop(i % 2 === 0 ? 'victoriaFoam' : 'water', x, z, 3.2, 0.14, 0.8, 0xeaf7f5, angle, waterSurfaceY(34, 80) + 0.3 + Math.sin(i) * 0.05);
  }

  addBox('victoriaMist', 32, 13, 80, 70, 15, 38, 0xffffff, 0.1);
  addLabel('Boiling Pot', 34, topY(34, 80) + 12, 80);
}

function buildRainforestAndViewpoints({ planner, addTop, addTiledRect, addLabel, rng }) {
  buildPath(addTop, [
    [-190, 76],
    [-152, 60],
    [-104, 52],
    [-42, 52],
    [24, 56],
    [88, 50],
    [148, 36],
    [190, 30]
  ], 5.4, 'cobblestone');

  buildPath(addTop, [
    [148, -46],
    [164, -18],
    [174, 24],
    [184, 56],
    [160, 82]
  ], 4.2, 'cobblestone');

  FALL_SECTIONS.forEach((section, index) => {
    const x = section.x + (index % 2 === 0 ? -4 : 5);
    const z = 42 + (index % 2) * 8;
    buildViewpoint(addTop, addTiledRect, x, z, 34 + index * 2, 18, 0.04 * (index - 2), section.label);
    planner.reserveRect(`${section.key}-viewpoint`, x, z, 38, 22, { force: true, type: 'building' });
  });

  buildViewpoint(addTop, addTiledRect, 154, -34, 28, 16, 0.14, "Devil's Pool");
  addTop('water', 154, -34, 17, 0.18, 8.5, 0x3f91aa, 0.1, waterSurfaceY(154, -34) + 0.12);
  addTop('victoriaFoam', 166, -28, 7, 0.12, 1.4, 0xeaf7f5, 0.15, waterSurfaceY(166, -28) + 0.22);
  addLabel("Devil's Pool", 154, waterSurfaceY(154, -34) + 7, -34);

  for (let i = 0; i < 34; i += 1) {
    const x = -198 + rng() * 390;
    const z = 34 + rng() * 78;
    if (isProtectedWaterOrGorge(x, z, 6) || planner.hasPoint(x, z, 'building')) continue;
    if (i % 4 === 0) buildInterpretiveSign(addTop, x, z, rng() * 0.5 - 0.25);
    else buildBench(addTop, x, z, rng() * Math.PI);
  }

  for (let i = 0; i < 90; i += 1) {
    const route = VISITOR_ROUTES[i % VISITOR_ROUTES.length];
    const sample = sampleRoute(route, (i / 90) * route.length);
    const x = sample.x + (rng() - 0.5) * route.width;
    const z = sample.z + (rng() - 0.5) * route.width;
    if (!isProtectedWaterOrGorge(x, z, 2)) addStaticPerson(addTop, x, z, i % 5 === 0 ? 'cloth' : 'crowd', 0.86 + rng() * 0.18);
  }

  addLabel('Rainforest Trails', -20, topY(-20, 70) + 10, 70);
}

function buildViewpoint(addTop, addTiledRect, x, z, width, depth, yaw, name) {
  addTiledRect('cobblestone', x, z, width, depth, { tile: 3.2, height: 0.16, yaw, baseOffset: 0.12 });
  const base = topY(x, z);
  addTop('wood', x, z - Math.cos(yaw) * depth * 0.5, width * 0.95, 1.3, 0.42, null, yaw, base + 0.16);
  for (let i = -2; i <= 2; i += 1) {
    addTop('wood', x + Math.cos(yaw) * i * (width / 5), z - Math.sin(yaw) * i * (width / 5) - Math.cos(yaw) * depth * 0.5, 0.34, 1.6, 0.34, null, yaw, base + 0.08);
  }
  buildInterpretiveSign(addTop, x - width * 0.34, z + depth * 0.25, yaw, name);
}

function buildBridges({ addTop, addBox, addLabel, rng }) {
  buildBridgeDeck(addTop, 172, 42, 62, 3.7, -0.55, 'Knife-Edge Bridge', true);
  buildBridgeDeck(addTop, 118, 112, 106, 5.6, 0.38, 'Victoria Falls Bridge', false);

  const base = topY(118, 112);
  addBox('steel', 118, base + 6.8, 112, 96, 1.2, 1.0, null, 0.38);
  for (let i = -4; i <= 4; i += 1) {
    addBox('steel', 118 + Math.cos(0.38) * i * 11, base + 4.2 + (4 - Math.abs(i)) * 0.72, 112 - Math.sin(0.38) * i * 11, 0.7, 8.5, 0.7, null, 0.38);
  }
  for (let i = 0; i < 8; i += 1) {
    addStaticPerson(addTop, 90 + rng() * 56, 100 + rng() * 24, i % 3 ? 'crowd' : 'cloth', 0.86);
  }

  addLabel('Knife-Edge Bridge', 172, topY(172, 42) + 10, 42);
  addLabel('Victoria Falls Bridge', 118, topY(118, 112) + 18, 112);
}

function buildBridgeDeck(addTop, x, z, length, width, yaw, name, narrow) {
  const steps = Math.max(4, Math.ceil(length / 8));
  for (let i = 0; i < steps; i += 1) {
    const offset = -length / 2 + (i + 0.5) * (length / steps);
    const wx = x + Math.cos(yaw) * offset;
    const wz = z - Math.sin(yaw) * offset;
    addTop(narrow ? 'wood' : 'steel', wx, wz, length / steps + 0.6, 0.34, width, null, yaw, topY(wx, wz) + 0.5);
    addTop('wood', wx + Math.sin(yaw) * width * 0.52, wz + Math.cos(yaw) * width * 0.52, length / steps, 0.82, 0.28, null, yaw, topY(wx, wz) + 1.0);
    addTop('wood', wx - Math.sin(yaw) * width * 0.52, wz - Math.cos(yaw) * width * 0.52, length / steps, 0.82, 0.28, null, yaw, topY(wx, wz) + 1.0);
  }
  buildInterpretiveSign(addTop, x - Math.cos(yaw) * length * 0.35, z + Math.sin(yaw) * length * 0.35, yaw, name);
}

function buildTowns({ planner, addTop, addTiledRect, addLabel, rng }) {
  buildTown({
    planner,
    addTop,
    addTiledRect,
    addLabel,
    rng,
    name: 'Livingstone',
    x: 212,
    z: -166,
    yaw: -0.16,
    marketColor: 0xd8a334
  });
  buildTown({
    planner,
    addTop,
    addTiledRect,
    addLabel,
    rng,
    name: 'Victoria Falls Town',
    x: -218,
    z: 154,
    yaw: 0.18,
    marketColor: 0xb96038
  });
}

function buildTown({ planner, addTop, addTiledRect, addLabel, rng, name, x, z, yaw, marketColor }) {
  planner.reserveRect(`${name}-core`, x, z, 112, 78, { force: true, type: 'building' });
  addTiledRect('road', x, z, 116, 78, { tile: 4.4, height: 0.12, yaw, baseOffset: 0.08 });
  buildPath(addTop, [
    [x - 58, z - 2],
    [x - 20, z + 10],
    [x + 20, z - 8],
    [x + 58, z + 2]
  ], 6.8, 'road');

  for (let row = -1; row <= 1; row += 1) {
    for (let col = -2; col <= 2; col += 1) {
      const bx = x + col * 20 + (row % 2) * 5;
      const bz = z + row * 19 + (col % 2) * 3;
      if (isWater(bx, bz, 12)) continue;
      buildLodge(addTop, bx, bz, 13 + rng() * 7, 10 + rng() * 5, 4.2 + rng() * 2.6, yaw + (rng() - 0.5) * 0.22, rng);
    }
  }

  addTiledRect('cobblestone', x - 28, z + 28, 38, 22, { tile: 3.2, height: 0.14, yaw, baseOffset: 0.12 });
  for (let i = 0; i < 14; i += 1) {
    const sx = x - 44 + (i % 7) * 5.8;
    const sz = z + 18 + Math.floor(i / 7) * 8;
    addTop('cloth', sx, sz, 4.2, 1.3, 3.2, i % 2 ? marketColor : 0x48d9ff, yaw + 0.05, topY(sx, sz) + 0.08);
    addStaticPerson(addTop, sx + 2.5, sz + 2.4, i % 3 === 0 ? 'cloth' : 'crowd', 0.84);
  }

  buildStationHint(addTop, x + 42, z - 24, yaw);
  buildSafariTruck(addTop, x + 38, z + 26, yaw + 0.08, 0);
  buildSafariTruck(addTop, x + 22, z + 26, yaw + 0.04, 1);
  buildDock(addTop, x > 0 ? 170 : -180, x > 0 ? -108 : 104, yaw);
  addLabel(name, x, topY(x, z) + 14, z);
}

function buildLodge(addTop, x, z, width, depth, height, yaw, rng) {
  const base = topY(x, z);
  addTop('limestone', x, z, width, height, depth, null, yaw, base);
  addTop('wood', x, z, width * 1.12, 1.4, depth * 1.2, null, yaw, base + height);
  addTop('shadow', x, z - Math.cos(yaw) * depth * 0.52, width * 0.34, 1.6, 0.36, null, yaw, base + height * 0.44);
  for (let i = -1; i <= 1; i += 1) {
    addTop('glass', x + Math.cos(yaw) * i * width * 0.24, z - Math.sin(yaw) * i * width * 0.24 - Math.cos(yaw) * depth * 0.52, 1.8, 1.1, 0.28, null, yaw, base + height * 0.58);
  }
  if (rng() > 0.66) buildPalmCluster(addTop, x + width * 0.55, z + depth * 0.35, 2, rng);
}

function buildStationHint(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('concrete', x, z, 26, 2.2, 12, null, yaw, base + 0.1);
  addTop('steel', x, z, 28, 0.8, 14, null, yaw, base + 2.4);
  addTop('wood', x - Math.cos(yaw) * 8, z + Math.sin(yaw) * 8, 5, 0.42, 1.2, null, yaw, base + 3.4);
  addTop('gold', x + Math.cos(yaw) * 8, z - Math.sin(yaw) * 8, 4.4, 0.5, 1.2, null, yaw, base + 3.4);
}

function buildSafariTruck(addTop, x, z, yaw, paletteIndex) {
  const bodyColors = [0x8f6f46, 0x617b44];
  const base = topY(x, z);
  addTop('cloth', x, z, 7.4, 1.6, 3.1, bodyColors[paletteIndex % bodyColors.length], yaw, base + 0.12);
  addTop('glass', x + Math.cos(yaw) * 1.8, z - Math.sin(yaw) * 1.8, 2.0, 1.0, 2.5, null, yaw, base + 1.22);
  addTop('shadow', x - Math.cos(yaw) * 2.5, z + Math.sin(yaw) * 2.5, 0.82, 0.55, 3.4, null, yaw, base + 0.12);
  addTop('shadow', x + Math.cos(yaw) * 2.5, z - Math.sin(yaw) * 2.5, 0.82, 0.55, 3.4, null, yaw, base + 0.12);
}

function buildDock(addTop, x, z, yaw) {
  addTop('wood', x, z, 28, 0.36, 5.6, null, yaw, topY(x, z) + 0.16);
  for (let i = -2; i <= 2; i += 1) {
    addTop('wood', x + Math.cos(yaw) * i * 5.2, z - Math.sin(yaw) * i * 5.2, 0.45, 2.0, 0.45, null, yaw, topY(x, z) + 0.05);
  }
}

function buildSavannaAndWildlife({ planner, addTop, rng }) {
  for (let i = 0; i < 880; i += 1) {
    const x = -WORLD_BOUNDS + rng() * WORLD_BOUNDS * 2;
    const z = -WORLD_BOUNDS + rng() * WORLD_BOUNDS * 2;
    if (planner.hasPoint(x, z) || isProtectedWaterOrGorge(x, z, 5)) continue;
    if (isRainforest(x, z)) {
      if (rng() > 0.22) addRainforestTree(addTop, x, z, 0.72 + rng() * 0.7);
      else addPalm(addTop, x, z, 0.72 + rng() * 0.42);
    } else if (rng() > 0.62) {
      addAcacia(addTop, x, z, 0.7 + rng() * 0.55);
    } else if (rng() > 0.35) {
      addGrassTuft(addTop, x, z, 0.75 + rng() * 0.65);
    }
  }

  for (let i = 0; i < 150; i += 1) {
    const x = -280 + rng() * 560;
    const z = -258 + rng() * 528;
    if (planner.hasPoint(x, z) || isProtectedWaterOrGorge(x, z, 7)) continue;
    addRock(addTop, x, z, 0.5 + rng() * 1.5, rng() * Math.PI);
  }

  for (let i = 0; i < WILDLIFE_COUNT; i += 1) {
    const x = i % 2 === 0 ? 214 + rng() * 72 : -284 + rng() * 92;
    const z = i % 3 === 0 ? -22 + rng() * 188 : -260 + rng() * 118;
    if (isProtectedWaterOrGorge(x, z, 8)) continue;
    if (i % 8 === 0) addElephantHint(addTop, x, z, rng() * Math.PI, 0.82 + rng() * 0.2);
    else if (i % 5 === 0) addGiraffeHint(addTop, x, z, rng() * Math.PI, 0.76 + rng() * 0.2);
    else addAntelopeHint(addTop, x, z, rng() * Math.PI, 0.78 + rng() * 0.22);
  }
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
      addTop(material, x, z, length / steps + 0.6, 0.14, width, null, yaw, topY(x, z) + 0.12);
    }
  }
}

function buildInterpretiveSign(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x - Math.sin(yaw) * 1.1, z - Math.cos(yaw) * 1.1, 0.28, 2.2, 0.28, null, yaw, base);
  addTop('wood', x + Math.sin(yaw) * 1.1, z + Math.cos(yaw) * 1.1, 0.28, 2.2, 0.28, null, yaw, base);
  addTop('cloth', x, z, 4.8, 1.2, 0.28, 0xf0dfb2, yaw, base + 1.8);
}

function buildBench(addTop, x, z, yaw) {
  const base = topY(x, z);
  addTop('wood', x, z, 4.2, 0.35, 1.1, null, yaw, base + 0.72);
  addTop('wood', x, z + Math.cos(yaw) * 0.45, 4.2, 1.0, 0.32, null, yaw, base + 0.94);
  addTop('shadow', x - Math.cos(yaw) * 1.6, z + Math.sin(yaw) * 1.6, 0.32, 0.7, 0.32, null, yaw, base);
  addTop('shadow', x + Math.cos(yaw) * 1.6, z - Math.sin(yaw) * 1.6, 0.32, 0.7, 0.32, null, yaw, base);
}

function addStaticPerson(addTop, x, z, body = 'crowd', scale = 1) {
  const base = topY(x, z);
  addTop(body, x, z, 0.56 * scale, 1.08 * scale, 0.42 * scale, null, 0, base + 0.02);
  addTop('skin', x, z, 0.36 * scale, 0.36 * scale, 0.36 * scale, null, 0, base + 1.05 * scale);
}

function addRainforestTree(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.55 * scale, 3.4 * scale, 0.55 * scale, null, 0, base);
  addTop('victoriaRainforest', x, z, 3.2 * scale, 2.8 * scale, 3.2 * scale, null, 0, base + 2.4 * scale);
  addTop('tropicalGreen', x + 0.8 * scale, z - 0.4 * scale, 2.4 * scale, 1.9 * scale, 2.4 * scale, null, 0, base + 3.9 * scale);
}

function addPalm(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.44 * scale, 4.2 * scale, 0.44 * scale, null, 0, base);
  for (let i = 0; i < 5; i += 1) {
    const yaw = (i / 5) * Math.PI * 2;
    addTop('vegetation', x + Math.cos(yaw) * 0.9 * scale, z + Math.sin(yaw) * 0.9 * scale, 3.0 * scale, 0.38 * scale, 0.78 * scale, null, yaw, base + 3.9 * scale);
  }
}

function buildPalmCluster(addTop, x, z, count, rng) {
  for (let i = 0; i < count; i += 1) {
    addPalm(addTop, x + (rng() - 0.5) * 10, z + (rng() - 0.5) * 10, 0.62 + rng() * 0.34);
  }
}

function addAcacia(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.52 * scale, 2.4 * scale, 0.52 * scale, null, 0, base);
  addTop('vegetation', x, z, 4.6 * scale, 1.2 * scale, 3.1 * scale, null, Math.sin(x) * 0.3, base + 2.0 * scale);
  addTop('victoriaSavanna', x + 0.8 * scale, z - 0.5 * scale, 2.8 * scale, 0.8 * scale, 2.0 * scale, null, 0.2, base + 2.7 * scale);
}

function addGrassTuft(addTop, x, z, scale = 1) {
  addTop('vegetation', x, z, 1.7 * scale, 0.68 * scale, 1.4 * scale, 0x6f8f44, Math.sin(x * 0.2) * 0.4, topY(x, z) + 0.02);
}

function addRock(addTop, x, z, scale = 1, yaw = 0) {
  const base = topY(x, z);
  addTop(scale > 1.1 ? 'victoriaBasalt' : 'sandstone', x, z, 2.6 * scale, 1.0 * scale, 2.1 * scale, null, yaw, base + 0.02);
  if (scale > 1.25) addTop('shadow', x + 0.8 * scale, z - 0.4 * scale, 1.4 * scale, 0.4 * scale, 1.0 * scale, null, yaw + 0.3, base + 0.82 * scale);
}

function addElephantHint(addTop, x, z, yaw, scale) {
  const base = topY(x, z);
  addTop('concrete', x, z, 3.2 * scale, 1.8 * scale, 1.6 * scale, 0x8b8d88, yaw, base + 0.2);
  addTop('concrete', x + Math.cos(yaw) * 1.8 * scale, z - Math.sin(yaw) * 1.8 * scale, 1.0 * scale, 1.0 * scale, 1.0 * scale, 0x8b8d88, yaw, base + 1.3 * scale);
  addTop('concrete', x + Math.cos(yaw) * 2.4 * scale, z - Math.sin(yaw) * 2.4 * scale, 0.36 * scale, 1.2 * scale, 0.32 * scale, 0x8b8d88, yaw, base + 0.45 * scale);
}

function addGiraffeHint(addTop, x, z, yaw, scale) {
  const base = topY(x, z);
  addTop('gold', x, z, 1.1 * scale, 2.0 * scale, 0.72 * scale, 0xc4974c, yaw, base + 0.08);
  addTop('gold', x + Math.cos(yaw) * 0.62 * scale, z - Math.sin(yaw) * 0.62 * scale, 0.42 * scale, 2.5 * scale, 0.42 * scale, 0xc4974c, yaw, base + 1.7 * scale);
  addTop('gold', x + Math.cos(yaw) * 0.9 * scale, z - Math.sin(yaw) * 0.9 * scale, 0.72 * scale, 0.55 * scale, 0.5 * scale, 0xc4974c, yaw, base + 4.0 * scale);
}

function addAntelopeHint(addTop, x, z, yaw, scale) {
  const base = topY(x, z);
  addTop('gold', x, z, 1.8 * scale, 0.9 * scale, 0.72 * scale, 0xb9875a, yaw, base + 0.16);
  addTop('gold', x + Math.cos(yaw) * 1.1 * scale, z - Math.sin(yaw) * 1.1 * scale, 0.55 * scale, 0.55 * scale, 0.5 * scale, 0xb9875a, yaw, base + 0.75 * scale);
}

function buildVisitors({ animated, rng }) {
  const visitors = [];
  const routes = VISITOR_ROUTES.filter((route) => route.length > 0);
  for (let i = 0; i < VISITOR_COUNT; i += 1) {
    const route = routes[i % routes.length];
    visitors.push({
      route,
      distance: rng() * route.length,
      speed: 1.2 + rng() * 2.0,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.86 + rng() * 0.22,
      camera: i % 8 === 0
    });
  }

  const group = new THREE.Group();
  group.name = 'victoria-falls-visitors';
  const parts = {
    body: makeInstancedPart(visitors.length, 'victoria-visitor-body', 0x516a7a),
    vest: makeInstancedPart(visitors.length, 'victoria-visitor-vest', 0xd8a334),
    head: makeInstancedPart(visitors.length, 'victoria-visitor-head', 0xc58a61),
    hair: makeInstancedPart(visitors.length, 'victoria-visitor-hair', 0x2f241f),
    pack: makeInstancedPart(visitors.length, 'victoria-visitor-pack', 0x7a4d30),
    leftLeg: makeInstancedPart(visitors.length, 'victoria-visitor-left-leg', 0x30333a),
    rightLeg: makeInstancedPart(visitors.length, 'victoria-visitor-right-leg', 0x30333a),
    camera: makeInstancedPart(visitors.length, 'victoria-visitor-camera', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateVisitors(parts, visitors, elapsed) });
  updateVisitors(parts, visitors, 0);
  return visitors.length;
}

function buildBoats({ animated, rng }) {
  const routes = BOAT_ROUTES.map((points) => prepareRoute({ width: 5.2, loop: false, points })).filter((route) => route.length > 0);
  const boats = [];
  for (let i = 0; i < BOAT_COUNT; i += 1) {
    const route = routes[i % routes.length];
    boats.push({
      route,
      distance: rng() * route.length,
      speed: 2.6 + rng() * 2.8,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 0.88 + rng() * 0.18
    });
  }

  const group = new THREE.Group();
  group.name = 'victoria-zambezi-boats';
  const parts = {
    hull: makeInstancedPart(boats.length, 'victoria-boat-hull', 0x7a4d30),
    canopy: makeInstancedPart(boats.length, 'victoria-boat-canopy', 0xf0dfb2),
    wake: makeInstancedPart(boats.length, 'victoria-boat-wake', 0xe6f6f4),
    passengerA: makeInstancedPart(boats.length, 'victoria-boat-passenger-a', 0x516a7a),
    passengerB: makeInstancedPart(boats.length, 'victoria-boat-passenger-b', 0xd8a334)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateBoats(parts, boats, elapsed) });
  updateBoats(parts, boats, 0);
  return boats.length;
}

function buildRafts({ animated, rng }) {
  const riverRoute = prepareRoute({ width: 4.8, loop: false, points: GORGE_POINTS });
  const rafts = [];
  for (let i = 0; i < RAFT_COUNT; i += 1) {
    rafts.push({
      route: riverRoute,
      distance: rng() * riverRoute.length,
      speed: 2.2 + rng() * 2.4,
      lane: (rng() - 0.5) * 3.2,
      phase: rng() * Math.PI * 2,
      scale: 0.82 + rng() * 0.2
    });
  }

  const group = new THREE.Group();
  group.name = 'victoria-gorge-rafts';
  const parts = {
    hull: makeInstancedPart(rafts.length, 'victoria-raft-hull', 0xb96038),
    bow: makeInstancedPart(rafts.length, 'victoria-raft-bow', 0xd8a334),
    wake: makeInstancedPart(rafts.length, 'victoria-raft-wake', 0xeaf7f5),
    passengerA: makeInstancedPart(rafts.length, 'victoria-raft-passenger-a', 0x516a7a),
    passengerB: makeInstancedPart(rafts.length, 'victoria-raft-passenger-b', 0xf0dfb2)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update: (elapsed) => updateRafts(parts, rafts, elapsed) });
  updateRafts(parts, rafts, 0);
  return rafts.length;
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
    setPart(parts.camera, index, x + Math.cos(yaw) * 0.36 * s, y + 1.06 * s, z - Math.sin(yaw) * 0.36 * s, visitor.camera ? 0.22 * s : 0.001, visitor.camera ? 0.18 * s : 0.001, visitor.camera ? 0.3 * s : 0.001);
  });

  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateBoats(parts, boats, elapsed) {
  boats.forEach((boat, index) => {
    const sample = sampleRoute(boat.route, boat.distance + elapsed * boat.speed);
    const yaw = yawForVector(sample.tangentX, sample.tangentZ);
    const lateralX = -sample.tangentZ * boat.lane;
    const lateralZ = sample.tangentX * boat.lane;
    const x = sample.x + lateralX;
    const z = sample.z + lateralZ;
    const y = waterSurfaceY(x, z) + 0.38 + Math.sin(elapsed * 2.1 + boat.phase) * 0.07;
    const s = boat.scale;

    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    setPart(parts.hull, index, x, y + 0.22 * s, z, 6.6 * s, 0.38 * s, 2.2 * s, yaw);
    setPart(parts.canopy, index, x - Math.cos(yaw) * 0.5 * s, y + 1.04 * s, z + Math.sin(yaw) * 0.5 * s, 3.2 * s, 0.34 * s, 2.1 * s, yaw);
    setPart(parts.wake, index, x - Math.cos(yaw) * 4.4 * s, y - 0.14 * s, z + Math.sin(yaw) * 4.4 * s, 3.2 * s, 0.1 * s, 1.2 * s, yaw);
    setPart(parts.passengerA, index, x - Math.sin(yaw) * 0.45 * s, y + 0.84 * s, z - Math.cos(yaw) * 0.45 * s, 0.34 * s, 0.66 * s, 0.32 * s);
    setPart(parts.passengerB, index, x + Math.sin(yaw) * 0.45 * s, y + 0.78 * s, z + Math.cos(yaw) * 0.45 * s, 0.34 * s, 0.62 * s, 0.32 * s);
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
    const y = waterSurfaceY(x, z) + 0.35 + Math.sin(elapsed * 3 + raft.phase) * 0.09;
    const s = raft.scale;

    quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    setPart(parts.hull, index, x, y + 0.18 * s, z, 4.4 * s, 0.34 * s, 1.8 * s, yaw);
    setPart(parts.bow, index, x + Math.cos(yaw) * 1.8 * s, y + 0.38 * s, z - Math.sin(yaw) * 1.8 * s, 0.8 * s, 0.34 * s, 1.6 * s, yaw);
    setPart(parts.wake, index, x - Math.cos(yaw) * 2.8 * s, y + 0.03 * s, z + Math.sin(yaw) * 2.8 * s, 2.8 * s, 0.12 * s, 1.2 * s, yaw);
    setPart(parts.passengerA, index, x - Math.cos(yaw) * 0.58 * s + Math.sin(yaw) * 0.35 * s, y + 0.82 * s, z + Math.sin(yaw) * 0.58 * s + Math.cos(yaw) * 0.35 * s, 0.34 * s, 0.68 * s, 0.32 * s);
    setPart(parts.passengerB, index, x + Math.cos(yaw) * 0.44 * s - Math.sin(yaw) * 0.31 * s, y + 0.78 * s, z - Math.sin(yaw) * 0.44 * s - Math.cos(yaw) * 0.31 * s, 0.34 * s, 0.66 * s, 0.32 * s);
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
