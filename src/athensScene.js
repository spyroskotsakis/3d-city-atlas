import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 380;
const TERRAIN_CELL = 6;
const TILE = 3.55;
const PEDESTRIAN_COUNT = 230;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'athensTerrain',
  'athensRock',
  'athensGrass',
  'water',
  'cobblestone',
  'marble',
  'limestone',
  'stucco',
  'terracotta',
  'gold',
  'vegetation',
  'wood',
  'shadow',
  'cloth',
  'crowd',
  'skin'
];

const LANDMARKS = [
  ['Acropolis', 0, 0, 112, 86],
  ['Ancient Agora', -64, 54, 56, 42],
  ['Roman Agora', -20, 62, 42, 34],
  ['Temple of Olympian Zeus', 68, 78, 58, 42],
  ["Hadrian's Library", -38, 86, 42, 30],
  ['Odeon of Herodes Atticus', -42, 12, 42, 30],
  ['Theatre of Dionysus', 32, 22, 46, 32],
  ['Arch of Hadrian', 54, 56, 24, 20],
  ['Syntagma Square', 76, -54, 58, 42],
  ['Panathenaic Stadium', 126, 54, 62, 44],
  ['Monastiraki', -58, 98, 42, 34],
  ['Plaka', 20, 58, 70, 54],
  ['Mount Lycabettus', 124, -138, 64, 52],
  ['Long Walls corridor', -116, 166, 182, 24],
  ['Piraeus Port', -232, 246, 92, 54],
  ['Mikrolimano Marina', -170, 228, 64, 42],
  ['Zea Marina', -218, 286, 68, 44],
  ['Faliro Coast', -82, 250, 118, 54],
  ['Mount Parnitha', -220, -330, 150, 88],
  ['Mount Penteli', 270, -320, 128, 98],
  ['Palia Penteli', 230, -262, 50, 34],
  ['Drafi', 314, -224, 44, 30],
  ['Mount Hymettus', 286, 36, 108, 230],
  ['Northern Athens suburbs', 150, -204, 54, 38],
  ['Eastern Athens suburbs', 182, 100, 58, 40]
];

function createRng(seed = 0x41544845) {
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
  tempColor.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + amount * 0.08)), Math.max(0, Math.min(1, hsl.l + amount)));
  return tempColor.getHex();
}

function acropolisProfile(x, z) {
  const main = Math.exp(-(((x - 2) / 50) ** 2 + ((z + 1) / 36) ** 2)) * 22;
  const ridge = Math.exp(-(((x + 10) / 76) ** 2 + ((z - 2) / 17) ** 2)) * 7;
  return main + ridge;
}

function gaussian(x, z, cx, cz, sx, sz, height) {
  return Math.exp(-(((x - cx) / sx) ** 2 + ((z - cz) / sz) ** 2)) * height;
}

function mountainProfile(x, z) {
  const parnitha = gaussian(x, z, -220, -330, 96, 52, 38);
  const penteli = gaussian(x, z, 270, -320, 74, 54, 35);
  const hymettus = gaussian(x, z, 286, 36, 42, 168, 27);
  const aigaleo = gaussian(x, z, -300, 86, 44, 126, 16);
  return Math.max(parnitha, penteli, hymettus, aigaleo);
}

function foothillProfile(x, z) {
  return (
    gaussian(x, z, 210, -260, 122, 92, 8) +
    gaussian(x, z, 300, -214, 96, 74, 5) +
    gaussian(x, z, -174, -268, 150, 96, 6) +
    gaussian(x, z, 246, 118, 92, 112, 4)
  );
}

function isWater(x, z, pad = 0) {
  const p = Math.max(0, pad);
  const piraeusQuay = x > -304 - p && x < -176 + p && z > 224 - p && z < 252 + p;
  const faliroPromenade = x > -130 - p && x < -42 + p && z > 236 - p && z < 262 + p;
  if (piraeusQuay || faliroPromenade) return false;

  const inSaronic = z > 306 - p && x < -32 + p;
  const inPortBasin = x < -176 + p && z > 214 - p;
  const inFaliroBay = x > -158 - p && x < 12 + p && z > 252 - p;
  const zeaHarbor = ((x + 220) / (42 + p)) ** 2 + ((z - 286) / (24 + p)) ** 2 < 1;
  const mikrolimano = ((x + 170) / (34 + p)) ** 2 + ((z - 230) / (22 + p)) ** 2 < 1;
  return inSaronic || inPortBasin || inFaliroBay || zeaHarbor || mikrolimano;
}

function isMountainNoBuild(x, z, pad = 0) {
  const p = Math.max(0, pad);
  return (
    gaussian(x, z, -220, -330, 112 + p, 60 + p, 1) > 0.42 ||
    gaussian(x, z, 270, -320, 82 + p, 62 + p, 1) > 0.44 ||
    gaussian(x, z, 286, 36, 44 + p, 176 + p, 1) > 0.5 ||
    gaussian(x, z, -300, 86, 44 + p, 132 + p, 1) > 0.52
  );
}

function terrainHeightAt(x, z) {
  if (isWater(x, z)) return 0.34 + Math.sin(x * 0.045 + z * 0.02) * 0.035;
  const acropolis = acropolisProfile(x, z);
  const lycabettus = Math.exp(-(((x - 124) / 40) ** 2 + ((z + 138) / 34) ** 2)) * 24;
  const agoraDip = Math.exp(-(((x + 48) / 76) ** 2 + ((z - 72) / 54) ** 2)) * 0.75;
  const cityRise = Math.exp(-(((x - 30) / 150) ** 2 + ((z - 20) / 130) ** 2)) * 0.9;
  const portLowland = gaussian(x, z, -224, 246, 118, 76, 0.45);
  const suburbs = gaussian(x, z, 150, -198, 160, 86, 0.75) + gaussian(x, z, 210, -24, 134, 130, 0.45);
  return Math.max(
    0.55,
    1.05 +
      acropolis +
      lycabettus +
      mountainProfile(x, z) +
      foothillProfile(x, z) +
      cityRise +
      suburbs -
      portLowland -
      agoraDip +
      Math.sin(x * 0.023 + z * 0.019) * 0.2
  );
}

export function athensTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function waterY(x, z) {
  return terrainHeightAt(x, z) + 0.02;
}

function isBlockedTerrain(x, z, pad = 0) {
  return isWater(x, z, pad) || isMountainNoBuild(x, z, pad);
}

export function createAthensScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Athens voxel material: ${key}`);
  }

  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 10, isRiver: isBlockedTerrain });
  const labels = [];
  const animated = [];
  const roadSegments = [];

  const addLabel = (name, x, y, z) => {
    labels.push({ name, position: new THREE.Vector3(x, y, z) });
  };

  const addTop = (kind, x, z, sx, sy, sz, color = null, yaw = 0, base = topY(x, z)) => {
    batch.addTop(kind, x, base, z, sx, sy, sz, color, yaw);
  };

  const addTiledRect = (kind, x, z, width, depth, options = {}) => {
    const tile = options.tile ?? TILE;
    const sy = options.height ?? 0.15;
    const baseOffset = options.baseOffset ?? 0.035;
    const yaw = options.yaw ?? 0;
    const skipWater = options.skipWater ?? false;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const xStart = -width / 2 + tile / 2;
    const xEnd = width / 2 - tile / 2;
    const zStart = -depth / 2 + tile / 2;
    const zEnd = depth / 2 - tile / 2;

    for (let lx = xStart; lx <= xEnd; lx += tile) {
      for (let lz = zStart; lz <= zEnd; lz += tile) {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        if (skipWater && isWater(wx, wz)) continue;
        const shade = Math.sin(wx * 0.15 + wz * 0.12) * 0.022 + Math.cos(lz * 0.35) * 0.012;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, topY(wx, wz) + baseOffset);
      }
    }
  };

  const reserveRoad = (tag, x, z, width, depth, yaw = 0) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
    if (width >= depth) {
      const dx = Math.cos(yaw) * width * 0.5;
      const dz = -Math.sin(yaw) * width * 0.5;
      roadSegments.push({ ax: x - dx, az: z - dz, bx: x + dx, bz: z + dz, width: depth });
    } else {
      const dx = Math.sin(yaw) * depth * 0.5;
      const dz = Math.cos(yaw) * depth * 0.5;
      roadSegments.push({ ax: x - dx, az: z - dz, bx: x + dx, bz: z + dz, width });
    }
    addTiledRect('cobblestone', x, z, width, depth, { color: '#827565', height: 0.12, tile: 3.55, yaw, baseOffset: 0.02 });
  };

  const reserveRoadSegment = (tag, ax, az, bx, bz, width = 10) => {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length <= 0.01) return;
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const yaw = Math.atan2(-dz, dx);
    planner.reserveRect(tag, x, z, Math.abs(dx) + width, Math.abs(dz) + width, { force: true, type: 'road' });
    roadSegments.push({ ax, az, bx, bz, width });
    addTiledRect('cobblestone', x, z, length, width, {
      color: '#827565',
      height: 0.12,
      tile: 3.55,
      yaw,
      baseOffset: 0.02,
      skipWater: true
    });
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildStreets({ reserveRoad, reserveRoadSegment, addTiledRect, addTop });
  buildAtticaMountains({ addTop, addTiledRect, addLabel, rng });
  buildAcropolis({ batch, addTop, addTiledRect, addLabel, rng });
  buildAgora({ batch, addTop, addTiledRect, addLabel });
  buildOlympianZeus({ addTop, addTiledRect, addLabel });
  buildHadriansLibrary({ batch, addTop, addTiledRect, addLabel });
  buildOdeonAndTheatres({ addTop, addTiledRect, addLabel });
  buildSyntagma({ addTop, addTiledRect, addLabel });
  buildPanathenaicStadium({ addTop, addTiledRect, addLabel });
  buildMonastirakiAndPlaka({ addTop, addTiledRect, addLabel, rng });
  buildLycabettus({ addTop, addTiledRect, addLabel, rng });
  buildPiraeusHarbor({ planner, addTop, addTiledRect, addLabel, rng });
  buildPaliaPenteliAndDrafi({ planner, batch, addTop, addTiledRect, addLabel, rng });
  buildRegionalDistricts({ planner, batch, addTop, addTiledRect, addLabel, rng });
  const blocks = buildAthenianBlocks({ planner, batch, addTop, rng });
  buildStreetDetails({ planner, addTop, rng, roadSegments });
  const pedestrians = buildPedestrians({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-athens-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      acropolis: new THREE.Vector3(0, 34, 0),
      parthenon: new THREE.Vector3(8, 40, -4),
      agora: new THREE.Vector3(-54, 10, 62),
      syntagma: new THREE.Vector3(76, 9, -54),
      lycabettus: new THREE.Vector3(124, 34, -138),
      piraeus: new THREE.Vector3(-232, 16, 246),
      paliaPenteli: new THREE.Vector3(230, 30, -262),
      drafi: new THREE.Vector3(314, 25, -224),
      penteli: new THREE.Vector3(270, 54, -320),
      parnitha: new THREE.Vector3(-220, 56, -330),
      hymettus: new THREE.Vector3(286, 46, 36),
      atticaAerial: new THREE.Vector3(18, 18, -18),
      aerial: new THREE.Vector3(18, 18, -18)
    },
    metrics: {
      instances: total,
      pedestrians,
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
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isWater(x, z)) {
        batch.add('water', x, waterY(x, z), z, TERRAIN_CELL * 1.04, 0.18, TERRAIN_CELL * 1.04, 0x5aa6bc);
        continue;
      }

      const h = terrainHeightAt(x, z);
      const mountain = mountainProfile(x, z);
      const rocky =
        acropolisProfile(x, z) > 4 ||
        mountain > 5 ||
        Math.exp(-(((x - 124) / 42) ** 2 + ((z + 138) / 34) ** 2)) > 0.18;
      const green =
        (x > 48 && x < 112 && z < -72 && z > -122) ||
        (x > 96 && x < 160 && z < -160) ||
        (x > 84 && x < 150 && z > 22 && z < 88) ||
        foothillProfile(x, z) > 2.4 ||
        (x > 208 && x < 352 && z > -306 && z < -188) ||
        (x < -164 && z < -274);
      const material = rocky ? 'athensRock' : green ? 'athensGrass' : 'athensTerrain';
      batch.add(material, x, h / 2 - 0.04, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04);
    }
  }
}

function buildStreets({ reserveRoad, reserveRoadSegment, addTiledRect, addTop }) {
  reserveRoad('Dionysiou Areopagitou', -2, 38, 118, 8, -0.1);
  reserveRoad('Ermou Street', -6, 94, 116, 8, 0.03);
  reserveRoad('Syntagma axis', 72, 16, 8, 138, 0);
  reserveRoad('Agora approach', -56, 70, 9, 80, -0.08);
  reserveRoad('Panathenaic approach', 100, 64, 82, 8, 0.1);
  reserveRoad('Plaka lanes east', 28, 56, 8, 80, -0.35);
  reserveRoad('Plaka lanes west', -18, 56, 8, 74, 0.42);
  reserveRoad('Acropolis west steps', -42, 18, 11, 56, -0.55);
  reserveRoad('Lycabettus avenue', 92, -96, 9, 112, 0.2);

  buildRoadPath(reserveRoadSegment, 'Athens-Piraeus Long Walls', [
    [-6, 94],
    [-58, 118],
    [-116, 166],
    [-178, 210],
    [-232, 246]
  ], 11);
  buildRoadPath(reserveRoadSegment, 'Syntagma-Penteli avenue', [
    [76, -54],
    [116, -118],
    [164, -188],
    [230, -262],
    [270, -320]
  ], 10);
  buildRoadPath(reserveRoadSegment, 'Drafi hillside road', [
    [164, -188],
    [220, -216],
    [272, -224],
    [314, -224]
  ], 8);
  buildRoadPath(reserveRoadSegment, 'Hymettus ring road', [
    [98, -66],
    [152, -26],
    [214, 36],
    [264, 120]
  ], 9);
  buildRoadPath(reserveRoadSegment, 'Parnitha mountain road', [
    [-24, -84],
    [-86, -172],
    [-154, -270],
    [-220, -330]
  ], 9);
  buildRoadPath(reserveRoadSegment, 'Western ring road', [
    [-52, 80],
    [-142, 124],
    [-232, 112],
    [-300, 72]
  ], 8);
  buildRoadPath(reserveRoadSegment, 'Coastal avenue', [
    [-232, 246],
    [-170, 228],
    [-82, 250],
    [-20, 274]
  ], 10);

  for (let i = 0; i < 11; i += 1) {
    const x = -42 + i * 8;
    addTop('limestone', x, 24 - i * 1.7, 5.6, 0.16, 2.7, null, -0.55, topY(x, 24 - i * 1.7) + 0.1);
  }

  addTiledRect('athensGrass', 92, -96, 44, 42, { color: '#6d8552', height: 0.14, tile: 3.6 });
}

function buildRoadPath(reserveRoadSegment, tag, points, width) {
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    reserveRoadSegment(`${tag} ${i}`, ax, az, bx, bz, width);
  }
}

function buildAcropolis({ batch, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('athensRock', 0, 0, 104, 76, { color: '#a9926f', height: 0.2, tile: 3.6, baseOffset: 0.06 });

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const x = Math.cos(angle) * 49;
    const z = Math.sin(angle) * 34;
    addTop('limestone', x, z, 7.2, 3.8, 3.2, null, -angle, topY(x, z) + 0.1);
  }

  buildParthenon({ batch, addTop, addLabel, rng });
  buildPropylaea({ addTop, addLabel });
  buildErechtheion({ addTop, addLabel });
  buildAthenaNike({ addTop, addLabel });

  for (let i = 0; i < 58; i += 1) {
    const px = -34 + rng() * 74;
    const pz = -26 + rng() * 56;
    if (Math.hypot(px - 8, pz + 4) < 18) continue;
    addTop('crowd', px, pz, 0.58, 1.08, 0.58, null);
    addTop('skin', px, pz, 0.38, 0.38, 0.38, null, 0, topY(px, pz) + 1.04);
  }

  addLabel('Acropolis', 0, topY(0, 0) + 28, 0);
}

function buildParthenon({ batch, addTop, addLabel, rng }) {
  const x = 8;
  const z = -4;
  const base = topY(x, z) + 0.25;
  addTop('marble', x, z, 42, 1.2, 19, null, 0, base);
  addTop('marble', x, z, 36, 7.5, 13.5, null, 0, base + 1.2);
  addTop('shadow', x, z + 6.9, 28, 4.8, 0.35, 0x2e2924, 0, base + 2.3);
  addTop('shadow', x, z - 6.9, 28, 4.8, 0.35, 0x2e2924, 0, base + 2.3);

  for (let i = -4; i <= 4; i += 1) {
    const cx = x + i * 4.1;
    batch.addTop('marble', cx, base + 1.25, z - 8.4, 1.0, 6.5, 1.0);
    batch.addTop('marble', cx, base + 1.25, z + 8.4, 1.0, 6.5, 1.0);
  }
  for (let i = -2; i <= 2; i += 1) {
    const cz = z + i * 4.0;
    batch.addTop('marble', x - 20.4, base + 1.25, cz, 1.0, 6.5, 1.0);
    batch.addTop('marble', x + 20.4, base + 1.25, cz, 1.0, 6.5, 1.0);
  }

  addTop('marble', x, z, 44, 1.3, 21, null, 0, base + 7.7);
  addTop('terracotta', x, z, 46, 3.2, 23, 0xb96038, 0, base + 9.0);
  for (const sx of [-1, 1]) {
    for (let level = 0; level < 4; level += 1) {
      addTop('marble', x + sx * (17.6 - level * 3), z, 3.2, 1.05, 23 - level * 3.6, null, 0, base + 10.8 + level * 1.0);
    }
  }

  for (let i = 0; i < 14; i += 1) {
    const px = x - 18 + rng() * 36;
    const pz = z + (rng() > 0.5 ? 12 : -12);
    addTop('crowd', px, pz, 0.52, 1.02, 0.52, null);
  }

  addLabel('Parthenon', x, base + 16, z);
}

function buildPropylaea({ addTop, addLabel }) {
  const x = -38;
  const z = -2;
  const base = topY(x, z) + 0.15;
  addTop('marble', x, z, 22, 7.2, 13, null, 0, base);
  addTop('terracotta', x, z, 24, 2.4, 15, 0xb96038, 0, base + 7.2);
  for (let i = -2; i <= 2; i += 1) {
    addTop('marble', x + i * 4, z + 7, 0.8, 5.8, 0.8, null, 0, base + 0.4);
  }
  addLabel('Propylaea', x, base + 12, z);
}

function buildErechtheion({ addTop, addLabel }) {
  const x = -16;
  const z = -18;
  const base = topY(x, z) + 0.15;
  addTop('marble', x, z, 21, 5.7, 11, null, 0, base);
  addTop('terracotta', x, z, 22, 2.0, 12, 0xb96038, 0, base + 5.7);
  for (let i = 0; i < 5; i += 1) {
    addTop('marble', x + 7.5, z - 4 + i * 2, 0.62, 3.3, 0.62, null, 0, base + 0.3);
    addTop('gold', x + 7.5, z - 4 + i * 2, 0.45, 0.5, 0.45, 0xd8a334, 0, base + 3.7);
  }
  addLabel('Erechtheion', x, base + 10.5, z);
}

function buildAthenaNike({ addTop, addLabel }) {
  const x = -48;
  const z = 14;
  const base = topY(x, z) + 0.1;
  addTop('marble', x, z, 12, 4.4, 8, null, 0, base);
  addTop('terracotta', x, z, 13, 1.5, 9, 0xb96038, 0, base + 4.4);
  addLabel('Temple of Athena Nike', x, base + 8, z);
}

function buildAgora({ batch, addTop, addTiledRect, addLabel }) {
  addTiledRect('cobblestone', -64, 54, 60, 46, { color: '#827565', height: 0.13, tile: 3.5 });
  const stoaX = -74;
  const stoaZ = 42;
  const base = topY(stoaX, stoaZ);
  addTop('marble', stoaX, stoaZ, 50, 6.2, 10, null, 0, base);
  addTop('terracotta', stoaX, stoaZ, 52, 2.2, 12, 0xb96038, 0, base + 6.2);
  for (let i = -5; i <= 5; i += 1) {
    batch.addTop('marble', stoaX + i * 4.3, base + 0.4, stoaZ + 5.5, 0.8, 5.5, 0.8);
  }

  const templeX = -42;
  const templeZ = 70;
  addTop('marble', templeX, templeZ, 22, 5.6, 12, null);
  addTop('terracotta', templeX, templeZ, 24, 2.0, 14, 0xb96038, 0, topY(templeX, templeZ) + 5.6);
  addLabel('Ancient Agora', -64, topY(-64, 54) + 9, 54);
}

function buildOlympianZeus({ addTop, addTiledRect, addLabel }) {
  const x = 68;
  const z = 78;
  const base = topY(x, z) + 0.1;
  addTiledRect('cobblestone', x, z, 64, 46, { color: '#817566', height: 0.12, tile: 3.5 });
  for (let ix = -3; ix <= 3; ix += 1) {
    for (let iz = -1; iz <= 1; iz += 1) {
      if ((ix + iz) % 3 === 0) continue;
      addTop('marble', x + ix * 7, z + iz * 8, 1.2, 10.5, 1.2, null, 0, base);
      addTop('marble', x + ix * 7, z + iz * 8, 2.0, 0.7, 2.0, null, 0, base + 10.5);
    }
  }
  addTop('marble', x, z, 52, 0.7, 26, null, 0, base + 0.1);
  addLabel('Temple of Olympian Zeus', x, base + 14, z);
}

function buildHadriansLibrary({ batch, addTop, addTiledRect, addLabel }) {
  const x = -38;
  const z = 86;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 48, 34, { color: '#827565', height: 0.12, tile: 3.5 });
  addTop('limestone', x, z, 38, 7, 18, null, 0, base);
  addTop('shadow', x, z + 9.2, 30, 4.8, 0.35, 0x2e2924, 0, base + 1.5);
  for (let i = -4; i <= 4; i += 1) {
    batch.addTop('marble', x + i * 4, base + 0.4, z + 9.8, 0.75, 6.4, 0.75);
  }
  addLabel("Hadrian's Library", x, base + 12, z);
}

function buildOdeonAndTheatres({ addTop, addTiledRect, addLabel }) {
  buildTheatre({ addTop, addLabel }, -42, 12, 26, 8, 'Odeon of Herodes Atticus');
  buildTheatre({ addTop, addLabel }, 32, 22, 30, 7, 'Theatre of Dionysus');
  addTiledRect('cobblestone', 54, 56, 28, 22, { color: '#807465', height: 0.12, tile: 3.4 });
  addTop('marble', 54, 56, 13, 7.8, 2.6);
  addTop('shadow', 54, 57.5, 6, 5.8, 0.4, 0x2e2924, 0, topY(54, 56) + 0.7);
  addLabel('Arch of Hadrian', 54, topY(54, 56) + 11, 56);
}

function buildTheatre({ addTop, addLabel }, x, z, radius, rows, name) {
  const base = topY(x, z) + 0.08;
  for (let row = 0; row < rows; row += 1) {
    const r = radius - row * 2.2;
    for (let i = 0; i <= 18; i += 1) {
      const angle = Math.PI * (0.12 + i * 0.042);
      const px = x + Math.cos(angle) * r;
      const pz = z + Math.sin(angle) * r;
      addTop('limestone', px, pz, 3.2, 0.55, 2.0, null, -angle, base + row * 0.42);
    }
  }
  addTop('marble', x, z + radius * 0.52, radius * 0.9, 0.45, radius * 0.28, null, 0, base + 0.1);
  addLabel(name, x, base + rows * 0.7 + 5, z + radius * 0.4);
}

function buildSyntagma({ addTop, addTiledRect, addLabel }) {
  const x = 76;
  const z = -54;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 64, 46, { color: '#81766a', height: 0.13, tile: 3.5 });
  addTop('limestone', x + 16, z - 12, 44, 11, 18, null, 0, base);
  addTop('terracotta', x + 16, z - 12, 46, 2.4, 20, 0xb96038, 0, base + 11);
  addTop('water', x - 18, z + 8, 11, 0.25, 11, 0x62a9b9);
  addTop('marble', x - 18, z + 8, 14, 0.45, 14, null, 0, topY(x - 18, z + 8) + 0.08);
  addLabel('Syntagma Square', x, base + 15, z);
}

function buildPanathenaicStadium({ addTop, addTiledRect, addLabel }) {
  const x = 126;
  const z = 54;
  const base = topY(x, z) + 0.1;
  addTiledRect('cobblestone', x, z, 70, 50, { color: '#81776a', height: 0.12, tile: 3.5 });
  for (let row = 0; row < 8; row += 1) {
    addTop('marble', x, z - 18 + row * 2.1, 48 - row * 2.8, 0.55, 1.8, null, 0, base + row * 0.34);
    addTop('marble', x - 25 + row * 1.2, z + 4, 1.9, 0.55, 34 - row * 2, null, 0, base + row * 0.34);
    addTop('marble', x + 25 - row * 1.2, z + 4, 1.9, 0.55, 34 - row * 2, null, 0, base + row * 0.34);
  }
  addTop('athensTerrain', x, z + 3, 38, 0.18, 38, null, 0, base + 0.1);
  addLabel('Panathenaic Stadium', x, base + 9, z);
}

function buildMonastirakiAndPlaka({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', -58, 98, 48, 38, { color: '#807469', height: 0.13, tile: 3.5 });
  addTop('water', -58, 98, 10, 0.25, 10, 0x62a9b9);
  for (let i = 0; i < 18; i += 1) {
    const x = -76 + (i % 6) * 7;
    const z = 88 + Math.floor(i / 6) * 8;
    addTop('wood', x, z, 4.4, 1.1, 3.0);
    addTop(i % 3 === 0 ? 'cloth' : 'terracotta', x, z, 5.2, 0.6, 3.8, i % 3 === 0 ? 0xf0dfb2 : 0xb96038, 0, topY(x, z) + 1.1);
  }

  for (let i = 0; i < 32; i += 1) {
    const x = -10 + rng() * 68;
    const z = 34 + rng() * 58;
    addTop('stucco', x, z, 5.2 + rng() * 2.8, 3.2 + rng() * 2.8, 5.2 + rng() * 3.2);
    if (i % 2 === 0) addTop('terracotta', x, z, 6.2, 1.4, 6.2, 0xb96038, 0, topY(x, z) + 4.8);
  }

  addLabel('Monastiraki', -58, topY(-58, 98) + 7, 98);
  addLabel('Plaka', 22, topY(22, 58) + 8, 58);
}

function buildLycabettus({ addTop, addTiledRect, addLabel, rng }) {
  const x = 124;
  const z = -138;
  addTiledRect('athensRock', x, z, 62, 48, { color: '#a28c6b', height: 0.16, tile: 3.6, baseOffset: 0.05 });
  addTop('limestone', x, z, 14, 6.2, 9, null);
  addTop('terracotta', x, z, 16, 2, 11, 0xb96038, 0, topY(x, z) + 6.2);
  for (let i = 0; i < 34; i += 1) {
    const px = x + (rng() - 0.5) * 58;
    const pz = z + (rng() - 0.5) * 44;
    addTop('vegetation', px, pz, 1.8 + rng() * 1.2, 3.8 + rng() * 2.4, 1.8 + rng() * 1.2);
  }
  addLabel('Mount Lycabettus', x, topY(x, z) + 14, z);
}

function buildAtticaMountains({ addTop, addTiledRect, addLabel, rng }) {
  const mountains = [
    { name: 'Mount Parnitha', x: -220, z: -330, width: 136, depth: 72, pines: 78, color: '#8c8060' },
    { name: 'Mount Penteli', x: 270, z: -320, width: 112, depth: 78, pines: 48, color: '#a89572' },
    { name: 'Mount Hymettus', x: 286, z: 36, width: 74, depth: 206, pines: 74, color: '#918362' },
    { name: 'Aigaleo Hills', x: -300, z: 86, width: 58, depth: 132, pines: 42, color: '#8d8061' }
  ];

  for (const mountain of mountains) {
    addTiledRect('athensRock', mountain.x, mountain.z, mountain.width, mountain.depth, {
      color: mountain.color,
      height: 0.16,
      tile: 4.8,
      baseOffset: 0.08,
      skipWater: true
    });
    for (let i = 0; i < mountain.pines; i += 1) {
      const px = mountain.x + (rng() - 0.5) * mountain.width * 0.9;
      const pz = mountain.z + (rng() - 0.5) * mountain.depth * 0.9;
      if (isWater(px, pz)) continue;
      addPine(addTop, px, pz, 0.8 + rng() * 0.8);
    }
    addLabel(mountain.name, mountain.x, topY(mountain.x, mountain.z) + 18, mountain.z);
  }

  for (let i = 0; i < 7; i += 1) {
    const x = 236 + i * 9;
    const z = -346 + i * 4;
    addTop('marble', x, z, 16 - i * 1.2, 0.38, 4.8, 0xd9ceb1, -0.22, topY(x, z) + 0.12);
  }

  addTiledRect('limestone', 262, -328, 44, 18, { color: '#cdbf9b', height: 0.14, tile: 4.2, baseOffset: 0.08 });
  addTop('limestone', 254, -344, 14, 6.2, 8, null, 0, topY(254, -344) + 0.1);
  addTop('gold', 254, -344, 2.4, 1.2, 2.4, 0xd8a334, 0, topY(254, -344) + 6.3);
  addLabel('Penteli Quarries', 262, topY(262, -328) + 13, -328);
}

function buildPiraeusHarbor({ planner, addTop, addTiledRect, addLabel, rng }) {
  planner.reserveRect('Piraeus main quays', -232, 246, 128, 74, { force: true, type: 'landmark' });
  planner.reserveRect('Mikrolimano quays', -170, 228, 62, 36, { force: true, type: 'landmark' });
  planner.reserveRect('Faliro promenade', -82, 250, 96, 40, { force: true, type: 'landmark' });
  planner.reserveRect('Piraeus warehouses', -240, 228, 108, 56, { force: true, type: 'landmark' });

  addTiledRect('cobblestone', -232, 246, 128, 74, { color: '#807565', height: 0.13, tile: 3.6, skipWater: true });
  addTiledRect('cobblestone', -170, 228, 62, 36, { color: '#817767', height: 0.13, tile: 3.6, skipWater: true });
  addTiledRect('cobblestone', -82, 250, 96, 40, { color: '#837867', height: 0.12, tile: 3.8, skipWater: true });

  addTop('limestone', -252, 238, 94, 1.2, 6, null, 0, topY(-252, 238) + 0.14);
  addTop('limestone', -216, 278, 78, 1.2, 5, null, 0, topY(-216, 278) + 0.12);
  addTop('limestone', -164, 216, 46, 1.0, 5, null, 0, topY(-164, 216) + 0.12);
  for (let i = 0; i < 6; i += 1) {
    const x = -276 + i * 18;
    addTop('wood', x, 272, 6, 0.8, 46, null, 0, waterY(x, 272) + 0.12);
  }

  [
    [-284, 268, 0.04, 1.05, 0xe9dfc5],
    [-254, 294, -0.08, 0.82, 0xded8cb],
    [-220, 306, 0.12, 0.7, 0xf0dfb2],
    [-178, 248, -0.18, 0.54, 0xd5e4e6]
  ].forEach(([x, z, yaw, scale, color]) => buildFerry(addTop, x, z, yaw, scale, color));

  for (let i = 0; i < 18; i += 1) {
    const x = -196 + (i % 6) * 9;
    const z = 220 + Math.floor(i / 6) * 10;
    buildMarinaBoat(addTop, x, z, (i % 2 ? 0.2 : -0.16), 0.75 + rng() * 0.3);
  }

  for (let i = 0; i < 12; i += 1) {
    const x = -278 + (i % 4) * 26;
    const z = 210 + Math.floor(i / 4) * 18;
    addTop(i % 3 === 0 ? 'limestone' : 'stucco', x, z, 16, 7 + (i % 2) * 3, 12, null);
    addTop('terracotta', x, z, 17, 1.1, 13, 0xb96038, 0, topY(x, z) + 7.4 + (i % 2) * 3);
  }

  buildFountain(addTop, -82, 250, 8);
  addLabel('Piraeus Port', -232, topY(-232, 246) + 14, 246);
  addLabel('Mikrolimano', -170, topY(-170, 228) + 10, 228);
  addLabel('Faliro Coast', -82, topY(-82, 250) + 10, 250);
}

function buildPaliaPenteliAndDrafi({ planner, addTop, addTiledRect, addLabel, rng }) {
  [
    ['Palia Penteli town hall', 212, -272, 28, 16],
    ['Palia Penteli school', 250, -244, 38, 32],
    ['Palia Penteli church', 214, -238, 16, 12],
    ['Megalo Doukisi Plakentias villa', 248, -292, 30, 18],
    ['Palia Penteli observatory', 252, -334, 22, 18],
    ['Drafi civic building', 298, -232, 26, 16],
    ['Drafi school', 330, -210, 34, 28],
    ['Drafi sports court', 338, -242, 22, 16]
  ].forEach(([tag, x, z, width, depth]) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'landmark' });
  });

  addTiledRect('cobblestone', 230, -262, 62, 46, { color: '#7f7566', height: 0.12, tile: 3.4, skipWater: true });
  buildFountain(addTop, 230, -262, 6.5);
  buildCivicBuilding(addTop, 212, -272, 24, 12, 10, 'townhall');
  buildSchoolComplex(addTop, 250, -244, 34, 28);
  buildChurch(addTop, 214, -238, 1.0);
  buildCivicBuilding(addTop, 248, -292, 26, 14, 11, 'villa');
  buildObservatory(addTop, 252, -334);

  addTiledRect('cobblestone', 314, -224, 54, 38, { color: '#807665', height: 0.12, tile: 3.4, skipWater: true });
  buildFountain(addTop, 314, -224, 5.5);
  buildCivicBuilding(addTop, 298, -232, 22, 11, 9, 'civic');
  buildSchoolComplex(addTop, 330, -210, 30, 24);
  buildSportsCourt(addTop, 338, -242, 18, 12);

  const hillsideZones = [
    { prefix: 'palia-penteli-house', cx: 230, cz: -262, width: 92, depth: 74, count: 34 },
    { prefix: 'drafi-house', cx: 314, cz: -224, width: 88, depth: 62, count: 30 }
  ];

  for (const zone of hillsideZones) {
    for (let i = 0; i < zone.count; i += 1) {
      const x = zone.cx + (rng() - 0.5) * zone.width;
      const z = zone.cz + (rng() - 0.5) * zone.depth;
      const width = 8 + Math.floor(rng() * 4) * 2;
      const depth = 8 + Math.floor(rng() * 3) * 2;
      if (!planner.reserveRect(`${zone.prefix}-${i}`, x, z, width + 3, depth + 3, { type: 'building' })) continue;
      buildHillsideHouse(addTop, x, z, width, depth, 1 + Math.floor(rng() * 2), rng);
      if (rng() > 0.45) addPine(addTop, x + (rng() - 0.5) * 12, z + (rng() - 0.5) * 12, 0.75 + rng() * 0.5);
    }
  }

  addLabel('Palia Penteli Square', 230, topY(230, -262) + 12, -262);
  addLabel('Megalo Doukisi Plakentias', 248, topY(248, -292) + 12, -292);
  addLabel('Palia Penteli Observatory', 252, topY(252, -334) + 16, -334);
  addLabel('Drafi', 314, topY(314, -224) + 12, -224);
}

function buildRegionalDistricts({ planner, batch, addTop, addTiledRect, addLabel, rng }) {
  const civicAnchors = [
    { name: 'Northern Athens', x: 150, z: -204, school: true, church: true, court: true },
    { name: 'Hymettus Foothills', x: 206, z: -36, school: true, church: false, court: true },
    { name: 'Eastern Suburbs', x: 182, z: 100, school: false, church: true, court: true }
  ];

  for (const anchor of civicAnchors) {
    planner.reserveRect(`${anchor.name} civic core`, anchor.x, anchor.z, 58, 44, { force: true, type: 'landmark' });
    addTiledRect('cobblestone', anchor.x, anchor.z, 48, 34, { color: '#817668', height: 0.12, tile: 3.6, skipWater: true });
    buildCivicBuilding(addTop, anchor.x - 14, anchor.z - 8, 20, 10, 8, 'civic');
    if (anchor.school) buildSchoolComplex(addTop, anchor.x + 18, anchor.z + 12, 28, 22);
    if (anchor.church) buildChurch(addTop, anchor.x + 16, anchor.z - 14, 0.85);
    if (anchor.court) buildSportsCourt(addTop, anchor.x - 18, anchor.z + 16, 18, 11);
    addLabel(anchor.name, anchor.x, topY(anchor.x, anchor.z) + 10, anchor.z);
  }

  for (let i = 0; i < 34; i += 1) {
    const x = -122 + rng() * 90;
    const z = 126 + rng() * 104;
    if (!planner.reserveRect(`long-walls-district-${i}`, x, z, 10, 10, { type: 'building' })) continue;
    buildAthenianBuilding(batch, addTop, x, z, 8 + rng() * 4, 8 + rng() * 4, 2 + Math.floor(rng() * 3), rng);
  }
}

function addPine(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('wood', x, z, 0.55 * scale, 2.8 * scale, 0.55 * scale, null, 0, base);
  addTop('vegetation', x, z, 2.2 * scale, 3.2 * scale, 2.2 * scale, 0x496744, 0, base + 2.1 * scale);
  addTop('vegetation', x, z, 1.5 * scale, 2.2 * scale, 1.5 * scale, 0x5a7a4a, 0, base + 4.0 * scale);
}

function buildFerry(addTop, x, z, yaw, scale = 1, color = 0xe9dfc5) {
  const base = waterY(x, z) + 0.08;
  addTop('limestone', x, z, 24 * scale, 2.6 * scale, 8 * scale, color, yaw, base);
  addTop('stucco', x - Math.cos(yaw) * 2 * scale, z + Math.sin(yaw) * 2 * scale, 16 * scale, 4.2 * scale, 5.4 * scale, null, yaw, base + 2.2 * scale);
  addTop('shadow', x + Math.cos(yaw) * 4 * scale, z - Math.sin(yaw) * 4 * scale, 4 * scale, 2.4 * scale, 1.6 * scale, 0x30333a, yaw, base + 6 * scale);
  addTop('gold', x - Math.cos(yaw) * 7 * scale, z + Math.sin(yaw) * 7 * scale, 2.4 * scale, 1.8 * scale, 2.4 * scale, 0xd8a334, yaw, base + 6.2 * scale);
}

function buildMarinaBoat(addTop, x, z, yaw, scale = 1) {
  const base = waterY(x, z) + 0.06;
  addTop('limestone', x, z, 7 * scale, 1.0 * scale, 2.8 * scale, 0xf2e8cf, yaw, base);
  addTop('cloth', x, z - 0.7 * scale, 2.2 * scale, 3.2 * scale, 0.32 * scale, 0xf0dfb2, yaw, base + 1.1 * scale);
}

function buildCivicBuilding(addTop, x, z, width, depth, height, variant) {
  const base = topY(x, z);
  addTop(variant === 'villa' ? 'marble' : 'limestone', x, z, width, height, depth, null, 0, base);
  addTop('terracotta', x, z, width + 1.2, 1.6, depth + 1.2, 0xb96038, 0, base + height);
  for (let i = -Math.floor(width / 6); i <= Math.floor(width / 6); i += 1) {
    addTop('shadow', x + i * 4.8, z + depth / 2 + 0.18, 1.1, 1.8, 0.28, 0x2e2924, 0, base + 3);
  }
  if (variant === 'townhall') {
    addTop('gold', x, z - depth / 2 - 1.2, 1.2, 4.6, 1.2, 0xd8a334, 0, base + 0.1);
  }
}

function buildSchoolComplex(addTop, x, z, width, depth) {
  const base = topY(x, z);
  addTop('athensTerrain', x, z, width, 0.16, depth, null, 0, base + 0.04);
  addTop('stucco', x - width * 0.18, z - depth * 0.12, width * 0.48, 6.4, depth * 0.42, null, 0, base + 0.12);
  addTop('limestone', x + width * 0.22, z + depth * 0.12, width * 0.34, 5.4, depth * 0.34, null, 0, base + 0.12);
  addTop('athensGrass', x + width * 0.14, z - depth * 0.26, width * 0.38, 0.12, depth * 0.2, 0x6c8952, 0, base + 0.2);
}

function buildChurch(addTop, x, z, scale = 1) {
  const base = topY(x, z);
  addTop('limestone', x, z, 12 * scale, 7 * scale, 8 * scale, null, 0, base);
  addTop('terracotta', x, z, 13 * scale, 1.6 * scale, 9 * scale, 0xb96038, 0, base + 7 * scale);
  addTop('gold', x, z - 1.2 * scale, 1.1 * scale, 4.2 * scale, 1.1 * scale, 0xd8a334, 0, base + 7.8 * scale);
  addTop('gold', x, z - 1.2 * scale, 3.2 * scale, 0.7 * scale, 0.7 * scale, 0xd8a334, 0, base + 10.3 * scale);
}

function buildSportsCourt(addTop, x, z, width, depth) {
  const base = topY(x, z);
  addTop('athensGrass', x, z, width, 0.13, depth, 0x6d8552, 0, base + 0.04);
  addTop('gold', x, z, width + 0.6, 0.12, 0.45, 0xe6c663, 0, base + 0.22);
  addTop('gold', x, z, 0.45, 0.12, depth + 0.6, 0xe6c663, 0, base + 0.22);
}

function buildObservatory(addTop, x, z) {
  const base = topY(x, z);
  addTop('limestone', x, z, 14, 6.2, 10, null, 0, base);
  addTop('marble', x, z, 9, 3.8, 9, null, 0, base + 6.2);
  addTop('gold', x, z, 5, 2.2, 5, 0xd8a334, 0, base + 9.6);
}

function buildFountain(addTop, x, z, radius) {
  addTop('marble', x, z, radius * 2, 0.45, radius * 2, null, 0, topY(x, z) + 0.1);
  addTop('water', x, z, radius * 1.45, 0.25, radius * 1.45, 0x62a9b9, 0, topY(x, z) + 0.56);
  addTop('gold', x, z, 0.62, 3.0, 0.62, 0xd8a334, 0, topY(x, z) + 0.82);
}

function buildHillsideHouse(addTop, x, z, width, depth, floors, rng) {
  const base = topY(x, z);
  const height = floors * 3.1 + 1.4;
  addTop(rng() > 0.5 ? 'stucco' : 'limestone', x, z, width, height, depth, null, 0, base);
  addTop('terracotta', x, z, width + 1.1, 1.1, depth + 1.1, 0xb96038, 0, base + height);
  if (rng() > 0.4) addTop('wood', x, z + depth / 2 + 0.9, width * 0.68, 0.55, 0.9, null, 0, base + 2.5);
}

function buildAthenianBlocks({ planner, batch, addTop, rng }) {
  let placed = 0;
  const xs = [-156, -130, -104, -78, -52, -26, 0, 30, 58, 88, 116, 146];
  const zs = [-154, -124, -94, -64, -34, -4, 28, 58, 90, 120, 150];

  for (const x of xs) {
    for (const z of zs) {
      const width = 12 + Math.floor(rng() * 5) * 2;
      const depth = 10 + Math.floor(rng() * 5) * 2;
      if (!planner.reserveRect(`athens-block-${placed}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
      buildAthenianBuilding(batch, addTop, x, z, width, depth, 2 + Math.floor(rng() * 4), rng);
      placed += 1;
    }
  }

  for (let i = 0; i < 48; i += 1) {
    const x = -166 + rng() * 330;
    const z = -164 + rng() * 320;
    const width = 10 + Math.floor(rng() * 5) * 2;
    const depth = 10 + Math.floor(rng() * 5) * 2;
    if (!planner.reserveRect(`athens-fill-${i}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
    buildAthenianBuilding(batch, addTop, x, z, width, depth, 2 + Math.floor(rng() * 4), rng);
    placed += 1;
  }

  const zones = [
    { tag: 'piraeus', minX: -308, maxX: -150, minZ: 168, maxZ: 292, count: 74, minFloors: 2, maxFloors: 4 },
    { tag: 'faliro', minX: -122, maxX: 12, minZ: 190, maxZ: 288, count: 46, minFloors: 2, maxFloors: 5 },
    { tag: 'western-basin', minX: -304, maxX: -172, minZ: -42, maxZ: 142, count: 64, minFloors: 2, maxFloors: 5 },
    { tag: 'northern-suburbs', minX: 92, maxX: 260, minZ: -252, maxZ: -150, count: 82, minFloors: 2, maxFloors: 5 },
    { tag: 'eastern-basin', minX: 138, maxX: 284, minZ: -118, maxZ: 146, count: 78, minFloors: 2, maxFloors: 5 },
    { tag: 'hillside-edge', minX: 220, maxX: 350, minZ: -316, maxZ: -184, count: 52, minFloors: 1, maxFloors: 3 }
  ];

  for (const zone of zones) {
    for (let i = 0; i < zone.count; i += 1) {
      const x = zone.minX + rng() * (zone.maxX - zone.minX);
      const z = zone.minZ + rng() * (zone.maxZ - zone.minZ);
      const width = 9 + Math.floor(rng() * 5) * 2;
      const depth = 9 + Math.floor(rng() * 5) * 2;
      const floors = zone.minFloors + Math.floor(rng() * (zone.maxFloors - zone.minFloors + 1));
      if (!planner.reserveRect(`athens-${zone.tag}-${i}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
      if (zone.tag === 'hillside-edge') {
        buildHillsideHouse(addTop, x, z, width, depth, floors, rng);
      } else {
        buildAthenianBuilding(batch, addTop, x, z, width, depth, floors, rng);
      }
      placed += 1;
    }
  }

  return placed;
}

function buildAthenianBuilding(batch, addTop, x, z, width, depth, floors, rng) {
  const base = topY(x, z);
  const material = rng() > 0.42 ? 'stucco' : 'limestone';
  const height = floors * 3.1 + 1.8;
  addTop(material, x, z, width, height, depth, null, 0, base);
  addTop(rng() > 0.72 ? 'terracotta' : 'athensTerrain', x, z, width + 1.2, 1.0, depth + 1.2, rng() > 0.72 ? 0xb96038 : null, 0, base + height);

  for (let i = -Math.floor(width / 5); i <= Math.floor(width / 5); i += 1) {
    const wx = x + i * 4.2;
    batch.addTop('shadow', wx, base + 3.2, z + depth / 2 + 0.15, 1.4, 1.8, 0.28);
    if (floors > 3) batch.addTop('shadow', wx, base + 7.0, z + depth / 2 + 0.15, 1.4, 1.8, 0.28);
    if (rng() > 0.64) batch.addTop('vegetation', wx, base + height + 0.2, z, 1.0, 1.8, 1.0);
  }

  if (rng() > 0.74) {
    addTop('wood', x, z + depth / 2 + 1.2, width * 0.72, 0.8, 1.1, null, 0, base + 2.5);
    addTop('cloth', x, z + depth / 2 + 1.8, width * 0.56, 0.45, 0.34, 0xf0dfb2, 0, base + 3.2);
  }
}

function buildStreetDetails({ planner, addTop, rng, roadSegments }) {
  const roads = planner.reservations.filter((item) => item.type === 'road');
  for (let i = 0; i < 236; i += 1) {
    const segment = roadSegments[i % roadSegments.length];
    const sample = segment ? sampleRoadSegment(segment, rng) : null;
    const road = roads[i % roads.length];
    const x = sample?.x ?? road.x1 + rng() * (road.x2 - road.x1);
    const z = sample?.z ?? road.z1 + rng() * (road.z2 - road.z1);
    if (isBlockedTerrain(x, z, 3)) continue;
    if (i % 4 === 0) {
      addTop('vegetation', x, z, 1.6, 3.8, 1.6);
    } else {
      addTop('gold', x, z, 0.34, 3.2, 0.34, 0xd8a334);
      addTop('gold', x + 0.48, z, 0.9, 0.38, 0.38, 0xe6c663, 0, topY(x, z) + 3.2);
    }
  }

  [
    [-58, 98, 7],
    [76, -54, 9],
    [24, 62, 5],
    [-232, 246, 7],
    [230, -262, 6],
    [314, -224, 5],
    [150, -204, 5],
    [206, -36, 5]
  ].forEach(([x, z, radius]) => {
    addTop('marble', x, z, radius * 2, 0.45, radius * 2, null, 0, topY(x, z) + 0.1);
    addTop('water', x, z, radius * 1.5, 0.25, radius * 1.5, 0x62a9b9, 0, topY(x, z) + 0.56);
    addTop('gold', x, z, 0.62, 3.2, 0.62, 0xd8a334, 0, topY(x, z) + 0.82);
  });
}

function sampleRoadSegment(segment, rng) {
  const dx = segment.bx - segment.ax;
  const dz = segment.bz - segment.az;
  const length = Math.hypot(dx, dz);
  if (length <= 0.001) return { x: segment.ax, z: segment.az };
  const t = rng();
  const lateral = (rng() - 0.5) * segment.width * 0.85;
  return {
    x: segment.ax + dx * t - (dz / length) * lateral,
    z: segment.az + dz * t + (dx / length) * lateral
  };
}

function buildPedestrians({ animated, rng }) {
  const routes = createPedestrianRoutes();
  const pedestrians = [];
  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    pedestrians.push({
      route,
      distance: rng() * route.length,
      speed: 2.8 + rng() * 3.8,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 1 + rng() * 0.28
    });
  }

  const group = new THREE.Group();
  group.name = 'athens-street-crowds';
  const parts = {
    body: makePedestrianMesh(pedestrians.length, 'athens-pedestrian-body', 0x4f6d85),
    head: makePedestrianMesh(pedestrians.length, 'athens-pedestrian-head', 0xd09a6d),
    hair: makePedestrianMesh(pedestrians.length, 'athens-pedestrian-hair', 0x5b4634),
    leftLeg: makePedestrianMesh(pedestrians.length, 'athens-pedestrian-left-leg', 0x38404a),
    rightLeg: makePedestrianMesh(pedestrians.length, 'athens-pedestrian-right-leg', 0x38404a),
    leftArm: makePedestrianMesh(pedestrians.length, 'athens-pedestrian-left-arm', 0xd09a6d),
    rightArm: makePedestrianMesh(pedestrians.length, 'athens-pedestrian-right-arm', 0xd09a6d)
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

function makePedestrianMesh(count, name, color) {
  const material = new THREE.MeshBasicMaterial({ color, vertexColors: false, fog: false });
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
    { width: 6.2, loop: false, points: [[-102, 94], [-52, 94], [-8, 94], [50, 78], [126, 54]] },
    { width: 5.4, loop: false, points: [[-44, 18], [-24, 36], [18, 42], [64, 56], [100, 64]] },
    { width: 5.2, loop: false, points: [[72, -96], [76, -54], [74, 4], [68, 78]] },
    { width: 5.0, loop: true, points: [[-60, 42], [-24, 54], [-38, 86], [-74, 80]] },
    { width: 5.0, loop: true, points: [[-30, 36], [44, 38], [48, 78], [-18, 78]] },
    { width: 4.8, loop: true, ellipse: { x: 0, z: 0, rx: 46, rz: 33, segments: 42 } },
    { width: 5.5, loop: true, ellipse: { x: 76, z: -54, rx: 32, rz: 22, segments: 36 } },
    { width: 6.4, loop: false, points: [[-6, 94], [-58, 118], [-116, 166], [-178, 210], [-232, 246]] },
    { width: 5.6, loop: true, ellipse: { x: -232, z: 246, rx: 48, rz: 28, segments: 38 } },
    { width: 4.8, loop: false, points: [[76, -54], [116, -118], [164, -188], [230, -262], [270, -320]] },
    { width: 4.6, loop: true, ellipse: { x: 230, z: -262, rx: 30, rz: 22, segments: 30 } },
    { width: 4.4, loop: true, ellipse: { x: 314, z: -224, rx: 28, rz: 18, segments: 28 } },
    { width: 4.6, loop: false, points: [[98, -66], [152, -26], [214, 36], [264, 120]] }
  ].map((definition) => {
    const points = definition.ellipse
      ? makeEllipsePoints(definition.ellipse)
      : definition.points.map(([x, z]) => ({ x, z }));
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

const pedestrianMatrix = new THREE.Matrix4();
const pedestrianPosition = new THREE.Vector3();
const pedestrianQuaternion = new THREE.Quaternion();
const pedestrianScale = new THREE.Vector3();

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

    setPedestrianPart(parts.body, index, x, y + bob, z, yaw, 0, 1.13, 0, 0.62 * scale, 1.02 * scale, 0.44 * scale);
    setPedestrianPart(parts.head, index, x, y + bob, z, yaw, 0, 1.88, 0, 0.46 * scale, 0.46 * scale, 0.46 * scale);
    setPedestrianPart(parts.hair, index, x, y + bob, z, yaw, 0, 2.12, -0.03, 0.44 * scale, 0.13 * scale, 0.44 * scale);
    setPedestrianPart(parts.leftLeg, index, x, y, z, yaw, -0.15, 0.38, stride, 0.16 * scale, 0.68 * scale, 0.16 * scale);
    setPedestrianPart(parts.rightLeg, index, x, y, z, yaw, 0.15, 0.38, -stride, 0.16 * scale, 0.68 * scale, 0.16 * scale);
    setPedestrianPart(parts.leftArm, index, x, y + bob, z, yaw, -0.43, 1.05, -stride * 0.65, 0.14 * scale, 0.64 * scale, 0.14 * scale);
    setPedestrianPart(parts.rightArm, index, x, y + bob, z, yaw, 0.43, 1.05, stride * 0.65, 0.14 * scale, 0.64 * scale, 0.14 * scale);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function setPedestrianPart(mesh, index, x, y, z, yaw, localX, localY, localZ, sx, sy, sz) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  pedestrianPosition.set(
    x + localX * cos + localZ * sin,
    y + localY,
    z - localX * sin + localZ * cos
  );
  pedestrianQuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
  pedestrianScale.set(sx, sy, sz);
  pedestrianMatrix.compose(pedestrianPosition, pedestrianQuaternion, pedestrianScale);
  mesh.setMatrixAt(index, pedestrianMatrix);
}
