import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher, yawForVector } from './voxelBatcher.js';

const WORLD_BOUNDS = 214;
const TERRAIN_CELL = 4;
const TILE = 3.7;
const PEDESTRIAN_COUNT = 220;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'parisTerrain',
  'parisGrass',
  'water',
  'cobblestone',
  'limestone',
  'slate',
  'iron',
  'glass',
  'copper',
  'gold',
  'vegetation',
  'marble',
  'shadow',
  'wood',
  'crowd',
  'skin'
];

const MONUMENTS = [
  ['Eiffel Tower', -82, 32, 62, 62],
  ['Champ de Mars', -82, 82, 72, 78],
  ['Trocadero', -88, -24, 62, 38],
  ['Louvre', 24, -28, 80, 46],
  ['Notre-Dame', 52, 24, 44, 30],
  ['Arc de Triomphe', -144, -74, 40, 40],
  ['Champs-Elysees', -86, -70, 118, 18],
  ['Grand Palais', -36, -48, 48, 34],
  ['Les Invalides', -28, 70, 58, 48],
  ["Musee d'Orsay", 8, 26, 62, 24],
  ['Pantheon', 68, 92, 40, 34],
  ['Sacre-Coeur', 122, -138, 56, 42],
  ['Opera Garnier', 46, -92, 46, 34]
];

function createRng(seed = 0x75016f) {
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
  tempColor.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + amount * 0.1)), Math.max(0, Math.min(1, hsl.l + amount)));
  return tempColor.getHex();
}

function riverCenterZ(x) {
  return 1 + Math.sin((x + 28) * 0.031) * 13 + Math.sin(x * 0.071 - 1.4) * 6;
}

function riverWidthAt(x) {
  return 23 + Math.sin(x * 0.049 + 0.4) * 4;
}

function isRiver(x, z, pad = 0) {
  const island =
    x > 31 &&
    x < 73 &&
    Math.abs(z - riverCenterZ(x)) < 6.2 &&
    Math.abs(z - riverCenterZ(x)) < 10 - Math.abs(x - 52) * 0.15;
  if (island) return false;
  return Math.abs(z - riverCenterZ(x)) <= riverWidthAt(x) / 2 + pad;
}

function terrainHeightAt(x, z) {
  const montmartreX = 122;
  const montmartreZ = -138;
  const montmartre = Math.exp(-(((x - montmartreX) / 48) ** 2 + ((z - montmartreZ) / 38) ** 2)) * 18.5;
  const chaillot = Math.exp(-(((x + 90) / 54) ** 2 + ((z + 22) / 36) ** 2)) * 4.2;
  const pantheonRise = Math.exp(-(((x - 66) / 44) ** 2 + ((z - 92) / 38) ** 2)) * 5.2;
  const riverCut = Math.exp(-((z - riverCenterZ(x)) ** 2) / 620) * 0.8;
  return Math.max(0.55, 1.2 + montmartre + chaillot + pantheonRise - riverCut + Math.sin(x * 0.025 + z * 0.017) * 0.22);
}

export function parisTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

export function createParisScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Paris voxel material: ${key}`);
  }

  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 14, isRiver });
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
    const sy = options.height ?? 0.18;
    const baseOffset = options.baseOffset ?? 0.035;
    const yaw = options.yaw ?? 0;
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
        if (isRiver(wx, wz, -1.1)) continue;
        const shade = Math.sin(wx * 0.19 + wz * 0.13) * 0.025 + Math.cos(lz * 0.41) * 0.012;
        const color = options.color ? vary(options.color, shade) : null;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, color, yaw, topY(wx, wz) + baseOffset);
      }
    }
  };

  const reserveRoad = (tag, x, z, width, depth, yaw = 0) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
    addTiledRect('cobblestone', x, z, width, depth, { color: '#81786b', height: 0.12, tile: 3.6, yaw, baseOffset: 0.02 });
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildSeineBanks({ batch, addTop, addTiledRect, addLabel });
  buildAvenues({ reserveRoad, addTiledRect });
  buildEiffelTower({ batch, addTop, addTiledRect, addLabel, rng, animated });
  buildChampDeMars({ addTop, addTiledRect, addLabel, rng });
  buildTrocadero({ batch, addTop, addTiledRect, addLabel });
  buildLouvre({ batch, addTop, addTiledRect, addLabel });
  buildNotreDame({ batch, addTop, addTiledRect, addLabel });
  buildArcDeTriomphe({ batch, addTop, addTiledRect, addLabel });
  buildGrandPalais({ batch, addTop, addTiledRect, addLabel });
  buildInvalides({ batch, addTop, addTiledRect, addLabel });
  buildOrsay({ batch, addTop, addTiledRect, addLabel });
  buildPantheon({ batch, addTop, addTiledRect, addLabel });
  buildSacreCoeur({ batch, addTop, addTiledRect, addLabel });
  buildOperaGarnier({ batch, addTop, addTiledRect, addLabel });
  const blocks = buildHaussmannBlocks({ planner, batch, addTop, rng });
  buildStreetDetails({ planner, batch, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-paris-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      eiffel: new THREE.Vector3(-82, 34, 32),
      louvre: new THREE.Vector3(24, 12, -28),
      notreDame: new THREE.Vector3(52, 16, 24),
      montmartre: new THREE.Vector3(122, 31, -138),
      aerial: new THREE.Vector3(0, 8, 0)
    },
    metrics: {
      instances: total,
      pedestrians,
      reservations: planner.reservations.length,
      monuments: MONUMENTS.length,
      blocks
    },
    update(elapsed) {
      for (const item of animated) item.update(elapsed);
    }
  };
}

function reserveLandmarks(planner) {
  MONUMENTS.forEach(([tag, x, z, width, depth]) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'landmark' });
  });
  [
    ['Pont Iena', -84, 5, 18, 44],
    ['Pont Alexandre III', -36, -6, 18, 44],
    ['Pont Royal', 12, -2, 18, 44],
    ['Pont Neuf', 42, 10, 18, 44],
    ['Pont Notre-Dame', 68, 13, 18, 42],
    ['Pont Austerlitz', 104, 8, 18, 42]
  ].forEach(([tag, x, z, width, depth]) => planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'bridge' }));
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isRiver(x, z, 0.6)) {
        batch.add('water', x, 0.32, z, TERRAIN_CELL * 1.05, 0.22, TERRAIN_CELL * 1.05, vary('#5f9eb4', Math.sin(x * 0.08) * 0.035));
        continue;
      }

      const h = terrainHeightAt(x, z);
      const nearBank = Math.abs(z - riverCenterZ(x)) < riverWidthAt(x) / 2 + 12;
      const highGrass = h > 9 || (z > 58 && x < -40 && x > -126);
      const kind = highGrass || nearBank ? 'parisGrass' : 'parisTerrain';
      const baseColor = nearBank ? '#7b915c' : highGrass ? '#6f8e4e' : '#9b8562';
      const shade = Math.sin(x * 0.12 + z * 0.07) * 0.03 + Math.cos(z * 0.19) * 0.018;
      batch.add(kind, x, h / 2 - 0.03, z, TERRAIN_CELL * 1.02, h, TERRAIN_CELL * 1.02, vary(baseColor, shade));
    }
  }
}

function buildSeineBanks({ batch, addTop, addTiledRect, addLabel }) {
  for (let x = -190; x <= 182; x += 8) {
    const z = riverCenterZ(x);
    const half = riverWidthAt(x) / 2;
    const tangentYaw = yawForVector(8, riverCenterZ(x + 4) - riverCenterZ(x - 4));
    addTop('limestone', x, z - half - 2.7, 7.8, 1.25, 2.4, vary('#c8b890', Math.sin(x * 0.06) * 0.02), tangentYaw, topY(x, z - half - 4.5));
    addTop('limestone', x, z + half + 2.7, 7.8, 1.25, 2.4, vary('#c8b890', Math.cos(x * 0.05) * 0.02), tangentYaw, topY(x, z + half + 4.5));
    if (x % 16 === 0) {
      addTop('vegetation', x + 1.8, z - half - 8.5, 1.8, 4.2, 1.8, vary('#4e7b41', 0.03), 0);
      addTop('vegetation', x - 1.8, z + half + 8.5, 1.8, 4.2, 1.8, vary('#527f43', -0.01), 0);
    }
  }

  addTiledRect('parisGrass', 52, riverCenterZ(52), 34, 11, { color: '#6d8b4c', height: 0.2, tile: 3.3, baseOffset: 0.05 });
  buildBridge(batch, -84, 'Pont dIena');
  buildBridge(batch, -36, 'Pont Alexandre III');
  buildBridge(batch, 12, 'Pont Royal');
  buildBridge(batch, 42, 'Pont Neuf');
  buildBridge(batch, 68, 'Pont Notre-Dame');
  buildBridge(batch, 104, 'Pont dAusterlitz');
  addLabel('Seine River', -10, 5.4, riverCenterZ(-10));
}

function buildBridge(batch, x, name) {
  const z = riverCenterZ(x);
  const width = riverWidthAt(x) + 17;
  const yaw = Math.PI / 2;
  batch.addTop('limestone', x, 1.15, z, width, 1.1, 9.6, vary('#cbbd9a', -0.01), yaw);
  batch.addTop('cobblestone', x, 2.28, z, width - 1.8, 0.38, 7.3, vary('#7f776e', 0.01), yaw);
  for (let dz = -width / 2 + 6; dz <= width / 2 - 6; dz += 9) {
    batch.addTop('shadow', x, 0.58, z + dz, 4.8, 1.8, 3.4, 0x20252a, yaw);
  }
  for (let side of [-1, 1]) {
    batch.addTop('iron', x + side * 5.2, 2.7, z, width, 1.0, 0.45, vary('#373b3c', 0.02), yaw);
  }
  batch.name = name;
}

function buildAvenues({ reserveRoad, addTiledRect }) {
  reserveRoad('Champs-Elysees', -86, -70, 120, 11, 0);
  reserveRoad('Rue de Rivoli', 6, -54, 142, 8, 0);
  reserveRoad('Boulevard Saint-Germain', 18, 62, 142, 8, 0.05);
  reserveRoad('North south axis west', -82, 28, 10, 118, 0);
  reserveRoad('Opera avenue', 36, -84, 56, 8, -0.18);
  reserveRoad('Montmartre approach', 100, -112, 76, 8, -0.55);
  reserveRoad('Invalides approach', -34, 52, 92, 8, -0.1);

  addTiledRect('parisGrass', -82, 82, 58, 72, { color: '#6f8f4f', height: 0.15, tile: 3.8 });
  addTiledRect('parisGrass', -91, -26, 54, 28, { color: '#6b8952', height: 0.15, tile: 3.6 });
}

function buildEiffelTower({ batch, addTop, addTiledRect, addLabel, rng, animated }) {
  const x = -82;
  const z = 32;
  const base = topY(x, z) + 0.18;
  addTiledRect('cobblestone', x, z, 64, 64, { color: '#827a6e', height: 0.18, tile: 3.6 });

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const legX = x + sx * 19;
      const legZ = z + sz * 19;
      const yaw = Math.atan2(sz, sx) + Math.PI / 4;
      for (let level = 0; level < 12; level += 1) {
        const t = level / 11;
        const lx = legX * (1 - t) + (x + sx * 5) * t;
        const lz = legZ * (1 - t) + (z + sz * 5) * t;
        batch.addTop('iron', lx, base + level * 4.3, lz, 2.25 - t * 0.75, 4.8, 2.25 - t * 0.75, vary('#514943', Math.sin(level + sx + sz) * 0.025), yaw);
        if (level < 11) {
          batch.addTop('iron', lx - sx * 2.7, base + level * 4.3 + 1.8, lz, 0.7, 5.4, 0.7, vary('#4b4642', 0.01), yaw + 0.75);
          batch.addTop('iron', lx, base + level * 4.3 + 1.8, lz - sz * 2.7, 0.7, 5.4, 0.7, vary('#4b4642', -0.01), yaw - 0.75);
        }
      }
    }
  }

  for (const side of [-1, 1]) {
    batch.addTop('iron', x, base + 7.2, z + side * 20, 31, 3.2, 2.0, vary('#544d45', 0.02));
    batch.addTop('iron', x + side * 20, base + 7.2, z, 2.0, 3.2, 31, vary('#544d45', -0.02));
    batch.addTop('shadow', x, base + 2.3, z + side * 21.2, 17, 8.2, 0.45, 0x23272a);
    batch.addTop('shadow', x + side * 21.2, base + 2.3, z, 0.45, 8.2, 17, 0x23272a);
  }

  addTop('iron', x, z, 46, 2.0, 46, vary('#5c534a', 0.01), 0, base + 20);
  addTop('iron', x, z, 25, 2.0, 25, vary('#594f47', -0.01), 0, base + 38);
  addTop('iron', x, z, 12, 1.7, 12, vary('#574d45', 0.0), 0, base + 55);
  addTop('iron', x, z, 6.5, 13, 6.5, vary('#514943', 0.01), 0, base + 56);
  addTop('iron', x, z, 2.4, 20, 2.4, vary('#4a4540', -0.01), 0, base + 68);
  addTop('gold', x, z, 1.0, 4.8, 1.0, 0xe6c15d, 0, base + 88);

  for (let i = 0; i < 70; i += 1) {
    const px = x + (rng() - 0.5) * 53;
    const pz = z + (rng() - 0.5) * 53;
    if (Math.hypot(px - x, pz - z) < 12 || isRiver(px, pz, 1)) continue;
    addTop('crowd', px, pz, 0.65, 1.15, 0.65, vary(['#2d4f70', '#8a3f45', '#d6b158', '#4f6d4a'][i % 4], rng() * 0.05), 0);
    addTop('skin', px, pz, 0.42, 0.42, 0.42, vary('#c89468', rng() * 0.04), 0, topY(px, pz) + 1.1);
  }

  createBlinkingLights({ materials: batch.materials, animated, x, z, base });
  addLabel('Eiffel Tower', x, base + 96, z);
}

function createBlinkingLights({ materials, animated, x, z, base }) {
  const points = [];
  const positions = [
    [x - 22, base + 21, z - 22], [x + 22, base + 21, z - 22], [x - 22, base + 21, z + 22], [x + 22, base + 21, z + 22],
    [x - 12, base + 39, z - 12], [x + 12, base + 39, z - 12], [x - 12, base + 39, z + 12], [x + 12, base + 39, z + 12],
    [x, base + 58, z], [x, base + 72, z], [x, base + 88, z]
  ];
  const material = materials.gold.clone();
  material.vertexColors = false;
  material.color.set(0xf4d56b);
  material.toneMapped = false;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, positions.length);
  mesh.name = 'eiffel-blinking-lights';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1.05, 1.05, 1.05);
  positions.forEach(([px, py, pz], index) => {
    points.push({ px, py, pz, phase: index * 0.81 });
    matrix.compose(position.set(px, py, pz), quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });

  animated.push({
    object: mesh,
    update(elapsed) {
      points.forEach((point, index) => {
        const pulse = 0.55 + Math.max(0, Math.sin(elapsed * 4.5 + point.phase)) * 0.9;
        matrix.compose(position.set(point.px, point.py, point.pz), quaternion, scale.setScalar(pulse));
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  });
}

function buildChampDeMars({ addTop, addTiledRect, addLabel, rng }) {
  const x = -82;
  const z = 82;
  addTiledRect('parisGrass', x, z, 62, 78, { color: '#71924f', height: 0.16, tile: 3.6 });
  addTiledRect('cobblestone', x, z, 8, 78, { color: '#8b8272', height: 0.14, tile: 3.4 });
  for (let iz = z - 33; iz <= z + 33; iz += 12) {
    addTop('vegetation', x - 25, iz, 2.2, 5.0, 2.2, vary('#4f7c40', rng() * 0.04), 0);
    addTop('vegetation', x + 25, iz, 2.2, 5.0, 2.2, vary('#547f42', rng() * 0.04), 0);
  }
  buildFountain(addTop, x, z + 30, 9);
  addLabel('Champ de Mars', x, topY(x, z) + 8, z);
}

function buildTrocadero({ batch, addTop, addTiledRect, addLabel }) {
  const x = -88;
  const z = -24;
  const base = topY(x, z) + 0.12;
  addTiledRect('limestone', x, z, 58, 30, { color: '#d2c29e', height: 0.18, tile: 3.4 });
  for (const side of [-1, 1]) {
    addTop('limestone', x + side * 17, z - 4, 18, 9.5, 14, vary('#d6c6a3', side * 0.01), 0, base);
    addTop('slate', x + side * 17, z - 4, 19.5, 2.0, 15.5, vary('#4d5660', -0.01), 0, base + 9.5);
    buildColonnade(batch, x + side * 17, z + 8, 20, 6, 6, 0);
  }
  buildFountain(addTop, x, z + 13, 12);
  addLabel('Trocadero', x, base + 15, z);
}

function buildLouvre({ batch, addTop, addTiledRect, addLabel }) {
  const x = 24;
  const z = -28;
  const base = topY(x, z) + 0.1;
  addTiledRect('cobblestone', x, z, 82, 48, { color: '#887e70', height: 0.15, tile: 3.4 });
  for (const dz of [-17, 17]) {
    addTop('limestone', x, z + dz, 76, 10, 7.0, vary('#d3c09a', dz > 0 ? 0.01 : -0.01), 0, base);
    addTop('slate', x, z + dz, 78, 2.1, 8.2, vary('#505965', 0.01), 0, base + 10);
  }
  for (const dx of [-38, 38]) {
    addTop('limestone', x + dx, z, 7.0, 10, 34, vary('#d0bd98', dx > 0 ? 0.0 : -0.02), 0, base);
    addTop('slate', x + dx, z, 8.3, 2.1, 35, vary('#4e5660', -0.01), 0, base + 10);
  }
  addTop('glass', x, z, 17, 9, 17, vary('#9bc9d3', 0.04), Math.PI / 4, base + 0.3);
  addTop('iron', x, z, 19, 1.0, 19, vary('#2f3436', 0.01), Math.PI / 4, base + 4.4);
  for (let dx = -30; dx <= 30; dx += 10) {
    addTop('shadow', x + dx, z - 20.7, 3.0, 4.0, 0.32, 0x2b2824, 0, base + 2.3);
    addTop('shadow', x + dx, z + 20.7, 3.0, 4.0, 0.32, 0x2b2824, 0, base + 2.3);
  }
  addLabel('Louvre', x, base + 17, z);
}

function buildNotreDame({ batch, addTop, addTiledRect, addLabel }) {
  const x = 52;
  const z = 24;
  const base = topY(x, z) + 0.12;
  addTiledRect('limestone', x, z, 42, 28, { color: '#cbbd9d', height: 0.16, tile: 3.2 });
  addTop('limestone', x, z, 27, 15, 12, vary('#c9b992', -0.01), 0, base);
  addTop('limestone', x, z + 5, 12, 12, 24, vary('#cfc09d', 0.0), 0, base);
  for (const dx of [-8, 8]) {
    addTop('limestone', x + dx, z - 11, 7.0, 23, 7.0, vary('#c8b890', dx > 0 ? 0.01 : -0.01), 0, base);
    addTop('shadow', x + dx, z - 14.8, 3.2, 8.2, 0.38, 0x262420, 0, base + 4.5);
  }
  addTop('slate', x, z + 4, 15, 2.4, 30, vary('#47515c', 0.01), 0, base + 14.8);
  addTop('copper', x, z + 10, 2.5, 22, 2.5, vary('#6c8b6d', 0.02), 0, base + 17);
  for (let dz = -2; dz <= 13; dz += 5) {
    addTop('glass', x - 13.7, z + dz, 0.35, 3.2, 2.4, 0x6fa6bd, 0, base + 5.2);
    addTop('glass', x + 13.7, z + dz, 0.35, 3.2, 2.4, 0x6fa6bd, 0, base + 5.2);
  }
  addLabel('Notre-Dame', x, base + 30, z);
}

function buildArcDeTriomphe({ batch, addTop, addTiledRect, addLabel }) {
  const x = -144;
  const z = -74;
  const base = topY(x, z) + 0.1;
  addTiledRect('cobblestone', x, z, 42, 42, { color: '#81796f', height: 0.14, tile: 3.5 });
  for (const dx of [-9, 9]) {
    addTop('limestone', x + dx, z, 7.4, 20, 12, vary('#d0c09d', dx > 0 ? 0.01 : -0.01), 0, base);
  }
  addTop('limestone', x, z, 26, 5.2, 12.5, vary('#d4c5a5', 0.01), 0, base + 16.2);
  addTop('limestone', x, z, 27, 7.8, 13.0, vary('#cdbd99', -0.01), 0, base + 21.4);
  addTop('shadow', x, z - 6.45, 10, 13, 0.45, 0x24221f, 0, base + 3.4);
  addTop('shadow', x, z + 6.45, 10, 13, 0.45, 0x24221f, 0, base + 3.4);
  addTop('gold', x, z - 7, 16, 0.6, 0.45, 0xd8b14f, 0, base + 29.5);
  addLabel('Arc de Triomphe', x, base + 34, z);
}

function buildGrandPalais({ batch, addTop, addTiledRect, addLabel }) {
  const x = -36;
  const z = -48;
  const base = topY(x, z) + 0.1;
  addTiledRect('limestone', x, z, 48, 34, { color: '#d2c29e', height: 0.16, tile: 3.2 });
  addTop('limestone', x, z, 42, 11, 22, vary('#d5c49e', 0.0), 0, base);
  addTop('glass', x, z, 33, 8, 25, vary('#9cc6d0', 0.03), 0, base + 11);
  addTop('iron', x, z, 36, 1.4, 27, vary('#3b4245', 0.01), 0, base + 18.3);
  addTop('copper', x, z, 8, 5.8, 8, vary('#6f9272', 0.0), Math.PI / 4, base + 18.6);
  buildColonnade(batch, x, z - 13, 36, 8, 6.5, 0);
  addLabel('Grand Palais', x, base + 28, z);
}

function buildInvalides({ batch, addTop, addTiledRect, addLabel }) {
  const x = -28;
  const z = 70;
  const base = topY(x, z) + 0.12;
  addTiledRect('parisGrass', x, z, 58, 48, { color: '#758f52', height: 0.15, tile: 3.5 });
  addTop('limestone', x, z, 42, 12, 26, vary('#d1c09c', 0.0), 0, base);
  addTop('slate', x, z, 44, 2.2, 28, vary('#535b65', 0.0), 0, base + 12);
  addTop('gold', x, z, 17, 9, 17, 0xd9b643, Math.PI / 4, base + 14);
  addTop('gold', x, z, 7, 10, 7, 0xe0bd4b, 0, base + 22);
  addTop('gold', x, z, 2.2, 9, 2.2, 0xe6c95a, 0, base + 31);
  buildColonnade(batch, x, z - 17, 34, 8, 7, 0);
  addLabel('Les Invalides', x, base + 43, z);
}

function buildOrsay({ batch, addTop, addTiledRect, addLabel }) {
  const x = 8;
  const z = 26;
  const base = topY(x, z) + 0.1;
  addTiledRect('cobblestone', x, z, 62, 24, { color: '#857d72', height: 0.14, tile: 3.3 });
  addTop('limestone', x, z, 56, 10, 15, vary('#d0bd96', -0.01), 0, base);
  addTop('slate', x, z, 58, 2.0, 17, vary('#505864', 0.0), 0, base + 10);
  for (const dx of [-20, -8, 8, 20]) {
    addTop('glass', x + dx, z - 8, 4.5, 4.2, 0.35, 0x73a7bd, 0, base + 3.2);
  }
  addTop('gold', x + 25, z - 8.4, 4.3, 4.3, 0.45, 0xd6b35b, 0, base + 5.0);
  addLabel("Musee d'Orsay", x, base + 17, z);
}

function buildPantheon({ batch, addTop, addTiledRect, addLabel }) {
  const x = 68;
  const z = 92;
  const base = topY(x, z) + 0.12;
  addTiledRect('limestone', x, z, 42, 34, { color: '#d3c3a2', height: 0.16, tile: 3.3 });
  addTop('limestone', x, z, 31, 12, 22, vary('#d0bf9b', 0.0), 0, base);
  buildColonnade(batch, x, z - 14, 28, 7, 9, 0);
  addTop('slate', x, z, 25, 4.8, 18, vary('#4f5864', 0.0), 0, base + 12);
  addTop('limestone', x, z, 12, 10, 12, vary('#d4c5a5', 0.01), 0, base + 16);
  addTop('copper', x, z, 6, 8, 6, vary('#6d8e72', 0.01), 0, base + 26);
  addLabel('Pantheon', x, base + 39, z);
}

function buildSacreCoeur({ batch, addTop, addTiledRect, addLabel }) {
  const x = 122;
  const z = -138;
  const base = topY(x, z) + 0.18;
  addTiledRect('parisGrass', x, z + 4, 58, 46, { color: '#718f50', height: 0.18, tile: 3.5 });
  addTop('marble', x, z, 36, 13, 24, vary('#ece3cf', -0.01), 0, base);
  for (const dx of [-18, 18]) {
    addTop('marble', x + dx, z - 7, 10, 23, 10, vary('#e9dfcc', dx > 0 ? 0.01 : -0.01), 0, base);
    addTop('marble', x + dx, z - 7, 6, 7, 6, vary('#eee5d2', 0.0), 0, base + 23);
  }
  addTop('marble', x, z, 19, 18, 19, vary('#eee5d1', 0.01), Math.PI / 4, base + 10);
  addTop('marble', x, z, 11, 10, 11, vary('#f1e8d6', 0.01), Math.PI / 4, base + 27);
  addTop('marble', x, z, 3.2, 9, 3.2, vary('#efe6d5', -0.01), 0, base + 37);
  buildColonnade(batch, x, z - 16, 30, 7, 8.5, 0);
  addLabel('Sacre-Coeur', x, base + 51, z);
}

function buildOperaGarnier({ batch, addTop, addTiledRect, addLabel }) {
  const x = 46;
  const z = -92;
  const base = topY(x, z) + 0.1;
  addTiledRect('cobblestone', x, z, 48, 34, { color: '#847b6e', height: 0.15, tile: 3.3 });
  addTop('limestone', x, z, 40, 13, 24, vary('#d1bf98', 0.0), 0, base);
  addTop('slate', x, z, 42, 3.2, 26, vary('#4d5662', -0.01), 0, base + 13);
  addTop('copper', x, z, 22, 5.6, 14, vary('#6d9072', 0.02), 0, base + 16.2);
  for (const dx of [-16, 16]) {
    addTop('gold', x + dx, z - 13, 3.2, 5.2, 3.2, 0xd6ad45, 0, base + 14);
  }
  buildColonnade(batch, x, z - 14, 34, 8, 8.5, 0);
  addLabel('Opera Garnier', x, base + 27, z);
}

function buildHaussmannBlocks({ planner, batch, addTop, rng }) {
  const attempts = [];
  for (let x = -184; x <= 178; x += 18) {
    for (let z = -180; z <= 180; z += 18) {
      const rightBank = z < riverCenterZ(x) - riverWidthAt(x) / 2 - 8;
      const leftBank = z > riverCenterZ(x) + riverWidthAt(x) / 2 + 8;
      if (!rightBank && !leftBank) continue;
      attempts.push([x + (rng() - 0.5) * 4.2, z + (rng() - 0.5) * 4.2]);
    }
  }
  attempts.sort(() => rng() - 0.5);

  let placed = 0;
  for (const [x, z] of attempts) {
    if (placed >= 310) break;
    const nearMontmartre = Math.hypot(x - 122, z + 138) < 48;
    const width = 10 + Math.floor(rng() * 3) * 3.4;
    const depth = 9 + Math.floor(rng() * 3) * 3.3;
    const floors = nearMontmartre ? 3 + Math.floor(rng() * 2) : 4 + Math.floor(rng() * 3);
    if (!planner.reserveRect('haussmann-block', x, z, width + 3, depth + 3, { type: 'block' })) continue;
    buildHaussmannBuilding(batch, addTop, x, z, width, depth, floors, rng);
    placed += 1;
  }
  return placed;
}

function buildHaussmannBuilding(batch, addTop, x, z, width, depth, floors, rng) {
  const base = topY(x, z) + 0.08;
  const floorHeight = 2.6;
  const height = floors * floorHeight;
  const bodyColor = rng() > 0.2 ? '#cdbb99' : '#d7c6a3';
  const yaw = rng() > 0.86 ? (rng() > 0.5 ? 0.08 : -0.08) : 0;
  addTop('limestone', x, z, width + 0.6, 0.8, depth + 0.6, vary('#b9aa8d', -0.02), yaw, base);
  addTop('limestone', x, z, width, height, depth, vary(bodyColor, rng() * 0.05 - 0.025), yaw, base + 0.8);

  const baysX = Math.max(2, Math.floor(width / 3.4));
  const baysZ = Math.max(2, Math.floor(depth / 3.4));
  for (let floor = 0; floor < floors; floor += 1) {
    const wy = base + 1.8 + floor * floorHeight;
    for (let bay = 1; bay < baysX; bay += 1) {
      const wx = x - width / 2 + (bay / baysX) * width;
      batch.add('glass', wx, wy, z - depth / 2 - 0.12, 1.0, 1.0, 0.2, 0x78a4b2, yaw);
      batch.add('glass', wx, wy, z + depth / 2 + 0.12, 1.0, 1.0, 0.2, 0x78a4b2, yaw);
      if (floor === 1 || floor === floors - 1) {
        batch.add('iron', wx, wy - 0.64, z - depth / 2 - 0.28, 1.25, 0.24, 0.16, 0x34383a, yaw);
        batch.add('iron', wx, wy - 0.64, z + depth / 2 + 0.28, 1.25, 0.24, 0.16, 0x34383a, yaw);
      }
    }
    for (let bay = 1; bay < baysZ; bay += 1) {
      const wz = z - depth / 2 + (bay / baysZ) * depth;
      batch.add('glass', x - width / 2 - 0.12, wy, wz, 0.2, 1.0, 1.0, 0x78a4b2, yaw);
      batch.add('glass', x + width / 2 + 0.12, wy, wz, 0.2, 1.0, 1.0, 0x78a4b2, yaw);
    }
  }

  addTop('slate', x, z, width + 1.2, 1.6, depth + 1.2, vary('#4e5660', rng() * 0.04 - 0.02), yaw, base + height + 0.9);
  addTop('slate', x, z, Math.max(3, width * 0.3), 1.1, depth + 1.8, vary('#59626d', 0.0), yaw, base + height + 2.25);
}

function buildStreetDetails({ planner, batch, addTop, rng }) {
  for (let x = -178; x <= 170; x += 18) {
    for (const z of [-70, -54, 62, 82]) {
      if (isRiver(x, z, 7) || planner.hasPoint(x, z, 'landmark')) continue;
      addTop('vegetation', x, z + 5, 2.0, 4.5, 2.0, vary('#4f7f3f', rng() * 0.04), 0);
      addLamp(addTop, x + 5.4, z - 4.2);
      if (rng() > 0.65) buildCafe(addTop, x - 4.5, z + 3.8, rng);
    }
  }

  for (const [x, z] of [[-134, -65], [-38, -58], [28, -62], [56, 74], [96, -112], [-24, 54], [74, 12], [118, -126]]) {
    buildMetroEntrance(addTop, x, z);
  }

  for (const [x, z, size] of [[-144, -74, 7], [-88, -24, 10], [-28, 70, 8], [68, 92, 6], [122, -118, 7], [24, -28, 5]]) {
    buildFountain(addTop, x, z + 18, size);
    addTop('marble', x + size + 4, z + 17, 1.6, 5.2, 1.6, vary('#d7c8a8', 0.0), 0);
    addTop('shadow', x + size + 4, z + 17, 2.4, 0.65, 2.4, 0x2d2a25, 0, topY(x + size + 4, z + 17) + 5.0);
  }
}

function buildCafe(addTop, x, z, rng) {
  addTop('wood', x, z, 3.4, 0.45, 3.4, vary('#7b563c', 0.0), 0);
  for (const dx of [-2.5, 2.5]) {
    addTop('crowd', x + dx, z, 0.62, 1.0, 0.62, vary('#6b486a', rng() * 0.04), 0);
    addTop('skin', x + dx, z, 0.42, 0.42, 0.42, vary('#c79165', 0.0), 0, topY(x + dx, z) + 1.0);
  }
  addTop('copper', x, z - 2.2, 4.8, 0.55, 1.4, vary('#8d5d42', 0.01), 0, topY(x, z - 2.2) + 2.2);
}

function buildMetroEntrance(addTop, x, z) {
  addTop('iron', x, z, 4.6, 0.55, 2.2, 0x2f3c37, 0);
  addTop('shadow', x, z, 3.6, 0.28, 1.5, 0x17191a, 0, topY(x, z) + 0.5);
  addTop('copper', x - 2.5, z, 0.45, 2.8, 0.45, 0x6f8d6e, 0);
  addTop('copper', x + 2.5, z, 0.45, 2.8, 0.45, 0x6f8d6e, 0);
  addTop('gold', x, z - 0.8, 4.8, 0.35, 0.35, 0xd2ad48, 0, topY(x, z) + 2.7);
}

function buildFountain(addTop, x, z, radius) {
  addTop('marble', x, z, radius * 2, 0.5, radius * 2, vary('#d9cfb9', 0.0), Math.PI / 4);
  addTop('water', x, z, radius * 1.45, 0.25, radius * 1.45, vary('#74acc0', 0.03), Math.PI / 4, topY(x, z) + 0.48);
  addTop('marble', x, z, radius * 0.35, 1.8, radius * 0.35, vary('#e0d4be', 0.0), 0, topY(x, z) + 0.6);
}

function addLamp(addTop, x, z) {
  addTop('iron', x, z, 0.38, 3.1, 0.38, 0x2d3132, 0);
  addTop('gold', x, z, 0.9, 0.9, 0.9, 0xe6c060, 0, topY(x, z) + 3.0);
}

function buildColonnade(batch, x, z, width, count, height, yaw) {
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const dx = -width / 2 + width * t;
    const px = x + Math.cos(yaw) * dx;
    const pz = z - Math.sin(yaw) * dx;
    const base = topY(px, pz) + 0.1;
    batch.addTop('marble', px, base, pz, 1.1, height, 1.1, vary('#efe3cd', i % 2 ? -0.015 : 0.01), yaw);
    batch.addTop('limestone', px, base + height, pz, 2.4, 0.55, 2.4, vary('#d2c29e', -0.01), yaw);
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
      speed: 3.4 + rng() * 3.8,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 1.05 + rng() * 0.32
    });
  }

  const group = new THREE.Group();
  group.name = 'paris-street-crowds';
  const parts = {
    body: makePedestrianMesh(pedestrians.length, 'paris-pedestrian-body', 0x415f7a),
    head: makePedestrianMesh(pedestrians.length, 'paris-pedestrian-head', 0xd09a6d),
    hair: makePedestrianMesh(pedestrians.length, 'paris-pedestrian-hair', 0x5c4632),
    leftLeg: makePedestrianMesh(pedestrians.length, 'paris-pedestrian-left-leg', 0x303744),
    rightLeg: makePedestrianMesh(pedestrians.length, 'paris-pedestrian-right-leg', 0x303744),
    leftArm: makePedestrianMesh(pedestrians.length, 'paris-pedestrian-left-arm', 0xd09a6d),
    rightArm: makePedestrianMesh(pedestrians.length, 'paris-pedestrian-right-arm', 0xd09a6d)
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
  const routeDefs = [
    { width: 7.5, loop: false, points: [[-154, -70], [-96, -70], [-36, -64], [36, -54], [92, -50]] },
    { width: 5.8, loop: false, points: [[-82, 114], [-82, 32], [-84, -20], [-96, -70]] },
    { width: 5.5, loop: false, points: [[-124, 18], [-84, 7], [-36, 2], [12, 4], [68, 13], [112, 12]] },
    { width: 6.2, loop: false, points: [[-44, 64], [18, 62], [68, 92], [104, 112]] },
    { width: 5.0, loop: true, points: [[-112, -42], [-62, -42], [-62, -8], [-112, -8]] },
    { width: 5.0, loop: true, points: [[-6, -52], [58, -52], [58, -16], [-6, -16]] },
    { width: 4.8, loop: true, points: [[32, 8], [72, 8], [76, 38], [36, 38]] },
    { width: 5.4, loop: true, points: [[96, -160], [144, -152], [150, -118], [108, -112]] },
    { width: 5.5, loop: true, ellipse: { x: -144, z: -74, rx: 22, rz: 22, segments: 36 } },
    { width: 5.8, loop: true, ellipse: { x: -82, z: 32, rx: 34, rz: 34, segments: 44 } }
  ];

  return routeDefs.map((definition) => {
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
