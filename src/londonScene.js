import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 320;
const TERRAIN_CELL = 6.4;
const TILE = 3.55;
const PEDESTRIAN_COUNT = 330;
const BUS_COUNT = 24;
const CAB_COUNT = 42;
const TRAIN_COUNT = 14;
const RIVER_BOAT_COUNT = 14;
const tempColor = new THREE.Color();

const MATERIAL_KEYS = [
  'londonTerrain',
  'londonGrass',
  'water',
  'cobblestone',
  'asphalt',
  'concrete',
  'limestone',
  'brick',
  'slate',
  'glass',
  'steel',
  'gold',
  'vegetation',
  'wood',
  'shadow',
  'neon',
  'crowd',
  'skin',
  'marble',
  'graffiti',
  'neonPink',
  'neonCyan'
];

const LANDMARKS = [
  ['Palace of Westminster', -24, 2, 94, 32],
  ['Elizabeth Tower', -72, -6, 22, 22],
  ['Westminster Abbey', -50, -34, 44, 32],
  ['London Eye', 12, 42, 44, 34],
  ['Trafalgar Square', -34, -78, 50, 38],
  ['Buckingham Palace', -112, -72, 64, 42],
  ["St Paul's Cathedral", 72, -42, 50, 38],
  ['Tower Bridge', 142, 18, 58, 20],
  ['Tower of London', 124, -2, 46, 34],
  ['The Shard', 94, 58, 34, 30],
  ['Somerset House', 26, -30, 54, 30],
  ['Covent Garden', 10, -82, 48, 34],
  ['Piccadilly Circus', -76, -108, 42, 32],
  ['Leadenhall Market', 94, -78, 40, 28],
  ['Bank of England', 116, -58, 38, 30],
  ['Canary Wharf', 226, 78, 62, 46],
  ['Greenwich', 268, 166, 70, 48],
  ['British Museum', -18, -156, 54, 38],
  ["King's Cross / St Pancras", 48, -214, 70, 40],
  ['Camden Market', -66, -246, 74, 48],
  ['Regent Park', -94, -190, 82, 58],
  ['Hyde Park', -186, -124, 116, 74],
  ['Notting Hill', -244, -150, 70, 46],
  ['Kensington Museums', -216, -62, 76, 44],
  ['Shoreditch / Hoxton', 156, -130, 74, 50],
  ['Hackney / Dalston', 204, -198, 82, 52],
  ['Borough Market', 58, 78, 58, 42],
  ['Tate Modern / Globe', 36, 48, 64, 34],
  ['Battersea Power Station', -188, 86, 80, 44],
  ['Brixton', -92, 226, 82, 52],
  ['Peckham', 46, 228, 76, 50],
  ['Wembley Stadium', -268, -248, 78, 56],
  ['Hampstead Heath', -150, -286, 86, 54]
];

function createRng(seed = 0x4c4f4e44) {
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

function thamesCenterZ(x) {
  return 18 + Math.sin((x + 24) * 0.034) * 12 + Math.sin(x * 0.071 - 0.6) * 5;
}

function thamesWidthAt(x) {
  return 25 + Math.sin(x * 0.045 + 0.4) * 4;
}

function isRiver(x, z, pad = 0) {
  return Math.abs(z - thamesCenterZ(x)) <= thamesWidthAt(x) / 2 + pad;
}

function terrainHeightAt(x, z) {
  const westminsterRise = Math.exp(-(((x + 30) / 74) ** 2 + ((z + 18) / 58) ** 2)) * 0.8;
  const cityRise = Math.exp(-(((x - 72) / 88) ** 2 + ((z + 34) / 76) ** 2)) * 1.0;
  const riverCut = Math.exp(-((z - thamesCenterZ(x)) ** 2) / 420) * 0.72;
  return Math.max(0.55, 1.08 + westminsterRise + cityRise - riverCut + Math.sin(x * 0.023 + z * 0.019) * 0.15);
}

export function londonTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

export function createLondonScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing London voxel material: ${key}`);
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
    const xStart = -width / 2 + tile / 2;
    const xEnd = width / 2 - tile / 2;
    const zStart = -depth / 2 + tile / 2;
    const zEnd = depth / 2 - tile / 2;

    for (let lx = xStart; lx <= xEnd; lx += tile) {
      for (let lz = zStart; lz <= zEnd; lz += tile) {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        if (isRiver(wx, wz, -0.9)) continue;
        const shade = Math.sin(wx * 0.15 + wz * 0.13) * 0.022 + Math.cos(lz * 0.36) * 0.012;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, topY(wx, wz) + baseOffset);
      }
    }
  };

  const reserveRoad = (tag, x, z, width, depth, yaw = 0) => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
    addTiledRect('asphalt', x, z, width, depth, { color: '#36383d', height: 0.12, tile: 3.55, yaw, baseOffset: 0.02 });
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildThames({ batch, addTop, addTiledRect, addLabel });
  buildStreets({ reserveRoad, addTiledRect, addTop });
  buildWestminster({ batch, addTop, addTiledRect, addLabel, rng });
  buildAbbeyAndSquare({ addTop, addTiledRect, addLabel });
  buildLondonEye({ addTop, addTiledRect, addLabel });
  buildWestEnd({ addTop, addTiledRect, addLabel, rng });
  buildBuckingham({ addTop, addTiledRect, addLabel });
  buildCityAndEast({ addTop, addTiledRect, addLabel });
  buildWiderLondon({ addTop, addTiledRect, addLabel, rng });
  buildTransitAndNightlife({ planner, addTop, addTiledRect, addLabel, rng });
  const blocks = buildUrbanBlocks({ planner, batch, addTop, rng });
  buildStreetDetails({ planner, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });
  const buses = buildBuses({ animated, rng });
  const cabs = buildCabs({ animated, rng });
  const trains = buildTrains({ animated, rng });
  const boats = buildRiverBoats({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-london-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      westminster: new THREE.Vector3(-28, 22, 2),
      bigBen: new THREE.Vector3(-72, 34, -6),
      thames: new THREE.Vector3(12, 8, 34),
      londonEye: new THREE.Vector3(12, 44, 42),
      trafalgar: new THREE.Vector3(-34, 16, -78),
      coventGarden: new THREE.Vector3(10, 12, -82),
      soho: new THREE.Vector3(-66, 14, -122),
      towerBridge: new THREE.Vector3(142, 22, 18),
      stPauls: new THREE.Vector3(72, 30, -42),
      buckingham: new THREE.Vector3(-112, 22, -72),
      westEnd: new THREE.Vector3(-58, 14, -100),
      city: new THREE.Vector3(116, 32, -58),
      southBank: new THREE.Vector3(36, 16, 48),
      camden: new THREE.Vector3(-66, 16, -246),
      shoreditch: new THREE.Vector3(156, 18, -130),
      boroughMarket: new THREE.Vector3(58, 14, 78),
      nottingHill: new THREE.Vector3(-244, 14, -150),
      battersea: new THREE.Vector3(-188, 36, 86),
      canaryWharf: new THREE.Vector3(226, 54, 78),
      greenwich: new THREE.Vector3(268, 18, 166),
      hydePark: new THREE.Vector3(-186, 8, -124),
      southLondon: new THREE.Vector3(-26, 16, 226),
      aerial: new THREE.Vector3(0, 9, -6)
    },
    metrics: {
      instances: total,
      pedestrians,
      buses,
      cabs,
      trams: trains,
      boats,
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
    ['Vauxhall Bridge', -196, 36, 58, 16],
    ['Westminster Bridge', -28, 24, 50, 14],
    ['Waterloo Bridge', 24, 8, 48, 14],
    ['Blackfriars Bridge', 60, 10, 54, 14],
    ['London Bridge', 96, 12, 48, 14],
    ['Southwark Bridge', 120, 14, 54, 14],
    ['Tower Bridge Span', 142, 18, 66, 16],
    ['Docklands Footbridge', 236, 62, 58, 16],
    ['Greenwich River Crossing', 274, 132, 58, 16]
  ].forEach(([tag, x, z, width, depth]) => planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'bridge' }));
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isRiver(x, z, 0.5)) {
        batch.add('water', x, 0.3, z, TERRAIN_CELL * 1.08, 0.24, TERRAIN_CELL * 1.08, vary('#4d8fa5', Math.sin(x * 0.08) * 0.03));
        continue;
      }

      const h = terrainHeightAt(x, z);
      const park =
        (x > -146 && x < -70 && z > -104 && z < -42) ||
        (x > -20 && x < 40 && z > -102 && z < -70) ||
        (x > -62 && x < -20 && z > -36 && z < -10) ||
        (x > -244 && x < -126 && z > -162 && z < -86) ||
        (x > -146 && x < -54 && z > -220 && z < -162) ||
        (x > -194 && x < -104 && z > -314 && z < -258) ||
        (x > -126 && x < -44 && z > 182 && z < 260) ||
        (x > 236 && x < 306 && z > 138 && z < 198);
      const bank = Math.abs(z - thamesCenterZ(x)) < thamesWidthAt(x) / 2 + 10;
      batch.add(park || bank ? 'londonGrass' : 'londonTerrain', x, h / 2 - 0.04, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04);
    }
  }
}

function buildThames({ batch, addTop, addTiledRect, addLabel }) {
  for (let x = -284; x <= 300; x += 10) {
    const centerZ = thamesCenterZ(x);
    addTop('concrete', x, centerZ - thamesWidthAt(x) / 2 - 4.8, 9, 0.18, 3.0, null);
    addTop('concrete', x, centerZ + thamesWidthAt(x) / 2 + 4.8, 9, 0.18, 3.0, null);
    if (x % 30 === 0) {
      addTop('vegetation', x, centerZ - thamesWidthAt(x) / 2 - 9, 1.8, 4.2, 1.8);
      addTop('vegetation', x, centerZ + thamesWidthAt(x) / 2 + 9, 1.8, 4.2, 1.8);
    }
  }

  [
    [-196, 36, 'Vauxhall Bridge'],
    [-28, 24, 'Westminster Bridge'],
    [24, 8, 'Waterloo Bridge'],
    [60, 10, 'Blackfriars Bridge'],
    [96, 12, 'London Bridge'],
    [120, 14, 'Southwark Bridge'],
    [142, 18, 'Tower Bridge'],
    [236, 62, 'Docklands Footbridge'],
    [274, 132, 'Greenwich River Crossing']
  ].forEach(([x, z, name]) => {
    addTiledRect('concrete', x, z, 54, 12, { color: '#858983', height: 0.18, tile: 3.2 });
    batch.addTop('steel', x, topY(x, z) + 0.5, z - 6.2, 54, 0.9, 0.58);
    batch.addTop('steel', x, topY(x, z) + 0.5, z + 6.2, 54, 0.9, 0.58);
    if (name === 'Westminster Bridge' || name === 'Tower Bridge') addLabel(name, x, topY(x, z) + 5, z);
  });

  addLabel('River Thames', 42, 5, thamesCenterZ(42));

  for (let x = -224; x <= 286; x += 46) {
    const z = thamesCenterZ(x);
    addTop('wood', x, z + thamesWidthAt(x) / 2 + 9, 18, 0.34, 5.4, null);
    addTop('steel', x, z + thamesWidthAt(x) / 2 + 12.5, 12, 0.42, 1.6, 0x66727a);
    addTop('wood', x + 4, z + thamesWidthAt(x) / 2 + 14.6, 8, 0.28, 2.2, null);
  }
}

function buildStreets({ reserveRoad, addTiledRect, addTop }) {
  reserveRoad('Whitehall', -40, -48, 8, 74, 0.08);
  reserveRoad('The Mall', -82, -74, 82, 8, 0);
  reserveRoad('Strand', 18, -62, 118, 8, -0.08);
  reserveRoad('Fleet Street', 76, -50, 94, 8, -0.08);
  reserveRoad('Oxford Street', -30, -124, 154, 8, 0);
  reserveRoad('Regent Street', -72, -96, 8, 74, -0.2);
  reserveRoad('Piccadilly', -82, -96, 92, 8, 0.08);
  reserveRoad('Embankment north', 14, 0, 150, 7, -0.12);
  reserveRoad('South Bank', 36, 44, 128, 7, -0.08);
  reserveRoad('Westminster approach', -48, -18, 70, 8, 0.05);
  reserveRoad('City approach', 92, -18, 8, 82, 0);
  reserveRoad('Marylebone Euston Road', -8, -204, 176, 8, 0.02);
  reserveRoad('Camden High Street', -66, -226, 8, 90, -0.08);
  reserveRoad('Bishopsgate Shoreditch', 146, -118, 8, 132, -0.04);
  reserveRoad('Commercial Street', 128, -94, 72, 8, 0.04);
  reserveRoad('Portobello Road', -244, -154, 8, 82, 0.05);
  reserveRoad('Kensington High Street', -206, -68, 104, 8, -0.04);
  reserveRoad('Battersea riverside', -176, 82, 96, 8, 0.1);
  reserveRoad('Brixton Road', -88, 198, 8, 104, 0.02);
  reserveRoad('Peckham High Street', 34, 220, 94, 8, -0.05);
  reserveRoad('Docklands spine', 220, 88, 112, 8, 0.08);
  reserveRoad('Greenwich approach', 264, 150, 86, 8, 0.15);
  reserveRoad('Wembley way', -260, -246, 82, 10, 0.05);

  addTiledRect('londonGrass', -112, -72, 66, 44, { color: '#61794f', height: 0.14, tile: 3.6 });
  addTiledRect('londonGrass', -42, -22, 36, 22, { color: '#61794f', height: 0.14, tile: 3.6 });
  addTiledRect('londonGrass', -186, -124, 116, 74, { color: '#61794f', height: 0.14, tile: 3.8 });
  addTiledRect('londonGrass', -94, -190, 82, 58, { color: '#61794f', height: 0.14, tile: 3.8 });
  addTiledRect('londonGrass', -150, -286, 86, 54, { color: '#55714e', height: 0.14, tile: 3.8 });

  for (let i = 0; i < 12; i += 1) {
    addTop('concrete', -92 + i * 12, -74, 2.0, 0.14, 7.8);
  }

  for (let x = -232; x <= -142; x += 16) {
    addTop('vegetation', x, -126, 2.0, 4.4, 2.0);
    addTop('wood', x, -108, 6.4, 0.7, 1.0, null);
  }
}

function buildWestminster({ batch, addTop, addTiledRect, addLabel, rng }) {
  const x = -24;
  const z = 2;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 104, 42, { color: '#7d766d', height: 0.14, tile: 3.4 });
  addTop('limestone', x, z, 86, 12, 16, null, 0, base);
  addTop('limestone', x, z - 7.4, 90, 6, 4.2, null, 0, base + 11.5);
  addTop('slate', x, z - 2, 90, 3.0, 18, 0x596066, 0, base + 17);

  for (let bay = -7; bay <= 7; bay += 1) {
    const bx = x + bay * 5.6;
    addTop('shadow', bx, z + 8.2, 2.2, 4.4, 0.32, 0x2d2924, 0, base + 3.3);
    addTop('limestone', bx, z + 8.6, 0.48, 11.5, 0.48, null, 0, base + 0.8);
    if (bay % 2 === 0) addTop('gold', bx, z + 8.9, 0.48, 0.72, 0.48, 0xd8a334, 0, base + 12.4);
  }

  for (const tx of [x - 42, x + 42]) {
    addTop('limestone', tx, z - 3, 8, 25, 8, null, 0, base);
    addTop('slate', tx, z - 3, 9, 4.2, 9, 0x596066, 0, base + 25);
    addTop('gold', tx, z - 3, 0.7, 3.5, 0.7, 0xd8a334, 0, base + 31);
  }

  buildElizabethTower({ addTop, addLabel });

  for (let i = 0; i < 44; i += 1) {
    const px = x - 48 + rng() * 96;
    const pz = z + 14 + (rng() - 0.5) * 16;
    addTop('crowd', px, pz, 0.56, 1.06, 0.56, null);
    addTop('skin', px, pz, 0.36, 0.36, 0.36, null, 0, topY(px, pz) + 1.02);
  }

  addLabel('Palace of Westminster', x, base + 24, z);
}

function buildElizabethTower({ addTop, addLabel }) {
  const x = -72;
  const z = -6;
  const base = topY(x, z);
  addTop('limestone', x, z, 9.5, 39, 9.5, null, 0, base);
  addTop('shadow', x, z + 4.9, 5.2, 5.2, 0.35, 0x292622, 0, base + 23);
  addTop('gold', x, z + 5.2, 4.2, 4.2, 0.34, 0xd8a334, 0, base + 24);
  addTop('slate', x, z, 11, 5.2, 11, 0x596066, 0, base + 39);
  addTop('gold', x, z, 1.0, 7.5, 1.0, 0xd8a334, 0, base + 45);
  addLabel('Big Ben / Elizabeth Tower', x, base + 55, z);
}

function buildAbbeyAndSquare({ addTop, addTiledRect, addLabel }) {
  const x = -50;
  const z = -34;
  const base = topY(x, z);
  addTiledRect('cobblestone', x, z, 52, 38, { color: '#7d766d', height: 0.12, tile: 3.4 });
  addTop('limestone', x, z, 34, 10, 16, null, 0, base);
  addTop('slate', x, z, 36, 3.0, 18, 0x596066, 0, base + 10);
  for (const sx of [-1, 1]) {
    addTop('limestone', x + sx * 18, z - 5, 7, 22, 7, null, 0, base);
    addTop('slate', x + sx * 18, z - 5, 8, 3.5, 8, 0x596066, 0, base + 22);
  }
  addTop('gold', x - 2, z + 15, 1.0, 8, 1.0, 0xd8a334);
  addLabel('Westminster Abbey', x, base + 30, z);
}

function buildLondonEye({ addTop, addTiledRect, addLabel }) {
  const x = 12;
  const z = 42;
  const base = topY(x, z);
  addTiledRect('concrete', x, z, 50, 36, { color: '#858983', height: 0.14, tile: 3.4 });
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const px = x + Math.cos(a) * 17;
    const py = base + 19 + Math.sin(a) * 17;
    addTop('steel', px, z, 1.0, 1.0, 1.0, 0xc7d2d4, 0, py - 0.5);
    if (i % 4 === 0) addTop('glass', px, z, 2.0, 1.4, 1.4, 0x9cc8c8, 0, py - 0.7);
  }
  addTop('steel', x, z, 1.3, 38, 1.3, 0xc7d2d4, 0, base);
  addTop('steel', x - 7, z, 1.1, 25, 1.1, 0xc7d2d4, 0.28, base);
  addTop('steel', x + 7, z, 1.1, 25, 1.1, 0xc7d2d4, -0.28, base);
  addLabel('London Eye', x, base + 40, z);
}

function buildWestEnd({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', -34, -78, 56, 42, { color: '#7d766d', height: 0.14, tile: 3.4 });
  addTop('water', -34, -78, 16, 0.24, 16, 0x62a9b9);
  addTop('marble', -34, -78, 19, 0.45, 19, null, 0, topY(-34, -78) + 0.08);
  addTop('gold', -34, -78, 1.0, 10, 1.0, 0xd8a334);
  addLabel('Trafalgar Square', -34, topY(-34, -78) + 14, -78);

  addTiledRect('cobblestone', 10, -82, 50, 36, { color: '#7d766d', height: 0.13, tile: 3.4 });
  for (let i = 0; i < 16; i += 1) {
    const x = -8 + (i % 5) * 8;
    const z = -94 + Math.floor(i / 5) * 9;
    addTop('wood', x, z, 4.4, 1.1, 3.0);
    addTop(i % 2 ? 'slate' : 'brick', x, z, 5.0, 0.7, 3.8, i % 2 ? 0x596066 : 0x9f583d, 0, topY(x, z) + 1.1);
    if (rng() > 0.55) addTop('vegetation', x + 2, z + 1.6, 1.0, 1.7, 1.0);
  }
  addLabel('Covent Garden', 10, topY(10, -82) + 8, -82);

  addTop('neon', -76, -108, 7.5, 3.4, 7.5, 0xd94f45);
  addTop('gold', -76, -108, 1.0, 7, 1.0, 0xd8a334);
  addLabel('Piccadilly Circus', -76, topY(-76, -108) + 13, -108);
}

function buildBuckingham({ addTop, addTiledRect, addLabel }) {
  const x = -112;
  const z = -72;
  const base = topY(x, z);
  addTiledRect('londonGrass', x, z, 72, 48, { color: '#61794f', height: 0.14, tile: 3.6 });
  addTop('limestone', x, z, 54, 11, 20, null, 0, base);
  addTop('slate', x, z, 56, 3.0, 22, 0x596066, 0, base + 11);
  for (let i = -4; i <= 4; i += 1) {
    addTop('shadow', x + i * 5.4, z + 10.4, 1.8, 3.4, 0.3, 0x2d2924, 0, base + 4);
  }
  addTop('gold', x + 6, z + 24, 1.1, 9, 1.1, 0xd8a334);
  addLabel('Buckingham Palace', x, base + 20, z);
}

function buildCityAndEast({ addTop, addTiledRect, addLabel }) {
  const paulX = 72;
  const paulZ = -42;
  const base = topY(paulX, paulZ);
  addTiledRect('cobblestone', paulX, paulZ, 54, 40, { color: '#7d766d', height: 0.13, tile: 3.4 });
  addTop('limestone', paulX, paulZ, 34, 12, 18, null, 0, base);
  addTop('slate', paulX, paulZ, 36, 3, 20, 0x596066, 0, base + 12);
  addTop('limestone', paulX, paulZ, 16, 10, 16, null, 0, base + 15);
  addTop('gold', paulX, paulZ, 1.0, 5, 1.0, 0xd8a334, 0, base + 28);
  addLabel("St Paul's Cathedral", paulX, base + 36, paulZ);

  const towerX = 124;
  const towerZ = -2;
  addTiledRect('cobblestone', towerX, towerZ, 52, 38, { color: '#7d766d', height: 0.13, tile: 3.4 });
  addTop('limestone', towerX, towerZ, 34, 12, 22, null);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addTop('limestone', towerX + sx * 19, towerZ + sz * 12, 7, 18, 7, null);
      addTop('slate', towerX + sx * 19, towerZ + sz * 12, 8, 3, 8, 0x596066, 0, topY(towerX + sx * 19, towerZ + sz * 12) + 18);
    }
  }
  addLabel('Tower of London', towerX, topY(towerX, towerZ) + 24, towerZ);

  const shardX = 94;
  const shardZ = 58;
  addTop('glass', shardX, shardZ, 14, 58, 14, 0x9cc8c8);
  addTop('glass', shardX, shardZ, 10, 30, 10, 0x9cc8c8, 0, topY(shardX, shardZ) + 58);
  addTop('steel', shardX, shardZ, 1.0, 10, 1.0, 0xc7d2d4, 0, topY(shardX, shardZ) + 88);
  addLabel('The Shard', shardX, topY(shardX, shardZ) + 102, shardZ);

  const canaryX = 172;
  const canaryZ = 72;
  addTop('glass', canaryX, canaryZ, 16, 44, 16, 0x86b2bf);
  addTop('steel', canaryX + 20, canaryZ + 4, 13, 36, 13, 0x66727a);
  addTop('glass', canaryX - 18, canaryZ - 5, 11, 32, 11, 0x9cc8c8);
  addLabel('Canary Wharf', canaryX, topY(canaryX, canaryZ) + 50, canaryZ);
}

function buildWiderLondon({ addTop, addTiledRect, addLabel, rng }) {
  buildMuseumQuarter({ addTop, addTiledRect, addLabel });
  buildNorthLondon({ addTop, addTiledRect, addLabel, rng });
  buildWestLondon({ addTop, addTiledRect, addLabel, rng });
  buildSouthLondon({ addTop, addTiledRect, addLabel, rng });
  buildDocklandsAndGreenwich({ addTop, addTiledRect, addLabel, rng });
}

function buildMuseumQuarter({ addTop, addTiledRect, addLabel }) {
  const museumX = -18;
  const museumZ = -156;
  addTiledRect('cobblestone', museumX, museumZ, 60, 42, { color: '#7d766d', height: 0.13, tile: 3.4 });
  addTop('limestone', museumX, museumZ, 44, 9, 22, null);
  addTop('limestone', museumX, museumZ + 12.4, 36, 8, 5, null);
  for (let i = -4; i <= 4; i += 1) {
    addTop('limestone', museumX + i * 4.6, museumZ + 15.2, 1.0, 8.6, 1.0, null);
  }
  addTop('slate', museumX, museumZ, 46, 2.6, 24, 0x596066, 0, topY(museumX, museumZ) + 9);
  addLabel('British Museum', museumX, topY(museumX, museumZ) + 18, museumZ);

  const kingX = 48;
  const kingZ = -214;
  addTiledRect('concrete', kingX, kingZ, 76, 44, { color: '#858983', height: 0.13, tile: 3.4 });
  addTop('brick', kingX - 14, kingZ, 42, 13, 18, 0x9f583d);
  addTop('glass', kingX + 22, kingZ + 2, 24, 16, 18, 0x9cc8c8);
  addTop('steel', kingX + 2, kingZ + 20, 72, 1.8, 4.4, 0x66727a);
  for (let i = -3; i <= 3; i += 1) {
    addTop('steel', kingX + i * 9, kingZ + 24, 1.2, 8.4, 1.2, 0x66727a);
  }
  addLabel("King's Cross / St Pancras", kingX, topY(kingX, kingZ) + 24, kingZ);
}

function buildNorthLondon({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('water', -66, -232, 92, 6, { color: '#4d8fa5', height: 0.18, tile: 3.2 });
  addTiledRect('cobblestone', -66, -246, 78, 48, { color: '#7d766d', height: 0.13, tile: 3.4 });
  for (let i = 0; i < 24; i += 1) {
    const x = -98 + (i % 6) * 12.8;
    const z = -260 + Math.floor(i / 6) * 10.5;
    addTop(i % 3 === 0 ? 'brick' : 'wood', x, z, 7.8, 2.0 + rng() * 1.4, 5.2, i % 3 === 0 ? 0x8f4d39 : 0x7a4d30);
    addTop(i % 2 ? 'neonPink' : 'neonCyan', x, z + 2.9, 5.0, 0.4, 0.28, null, 0, topY(x, z) + 2.4);
  }
  addTop('steel', -94, -232, 20, 1.1, 3.2, 0x66727a);
  addTop('steel', -38, -232, 20, 1.1, 3.2, 0x66727a);
  addLabel('Camden Market', -66, topY(-66, -246) + 10, -246);

  addTiledRect('londonGrass', -150, -286, 86, 54, { color: '#55714e', height: 0.14, tile: 3.8 });
  for (let i = 0; i < 28; i += 1) {
    addTop('vegetation', -186 + rng() * 72, -308 + rng() * 46, 2.0, 5.0 + rng() * 2, 2.0);
  }
  addTop('limestone', -132, -278, 14, 7, 12, null);
  addLabel('Hampstead Heath', -150, topY(-150, -286) + 9, -286);

  addTiledRect('cobblestone', -18, -206, 64, 28, { color: '#77766d', height: 0.13, tile: 3.4 });
  for (let i = 0; i < 9; i += 1) {
    addTop('limestone', -42 + i * 6.6, -204, 4.8, 6.5, 10, null);
  }
  addLabel('Islington / Angel', -18, topY(-18, -206) + 12, -206);
}

function buildWestLondon({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('londonGrass', -186, -124, 116, 74, { color: '#61794f', height: 0.14, tile: 3.8 });
  addTiledRect('londonGrass', -94, -190, 82, 58, { color: '#61794f', height: 0.14, tile: 3.8 });
  for (const [x, z, label] of [
    [-186, -124, 'Hyde Park'],
    [-94, -190, "Regent's Park"]
  ]) {
    addTop('water', x + 14, z + 8, 24, 0.18, 8, 0x4d8fa5);
    for (let i = 0; i < 30; i += 1) {
      addTop('vegetation', x - 44 + rng() * 88, z - 26 + rng() * 52, 1.8, 4.2 + rng() * 1.6, 1.8);
    }
    addLabel(label, x, topY(x, z) + 8, z);
  }

  addTiledRect('cobblestone', -244, -150, 74, 48, { color: '#77766d', height: 0.13, tile: 3.4 });
  for (let i = 0; i < 22; i += 1) {
    const x = -276 + (i % 5) * 14;
    const z = -166 + Math.floor(i / 5) * 11;
    addTop('limestone', x, z, 9, 5.2, 8.5, vary(0xd8cfb7, (i % 4 - 1.5) * 0.035));
    addTop('neon', x, z + 4.7, 5.2, 0.36, 0.28, 0xe6c663, 0, topY(x, z) + 3.1);
  }
  addLabel('Notting Hill / Portobello', -244, topY(-244, -150) + 12, -150);

  addTiledRect('cobblestone', -216, -62, 76, 44, { color: '#77766d', height: 0.13, tile: 3.4 });
  addTop('limestone', -226, -62, 28, 10, 16, null);
  addTop('limestone', -194, -60, 24, 9, 14, null);
  addTop('glass', -216, -42, 18, 9, 10, 0x9cc8c8);
  addLabel('Kensington Museums', -216, topY(-216, -62) + 16, -62);
}

function buildSouthLondon({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', 58, 78, 64, 42, { color: '#77766d', height: 0.13, tile: 3.4 });
  for (let i = 0; i < 18; i += 1) {
    const x = 34 + (i % 6) * 9;
    const z = 66 + Math.floor(i / 6) * 9;
    addTop('wood', x, z, 5.8, 1.2, 3.6, null);
    addTop('neon', x, z + 2.2, 4.2, 0.32, 0.24, 0xe6c663, 0, topY(x, z) + 1.4);
  }
  addLabel('Borough Market', 58, topY(58, 78) + 10, 78);

  addTiledRect('concrete', 36, 48, 70, 34, { color: '#858983', height: 0.13, tile: 3.4 });
  addTop('brick', 20, 50, 18, 10, 18, 0x9f583d);
  addTop('shadow', 20, 50, 12, 0.7, 12, 0x2d2924, 0, topY(20, 50) + 10);
  addTop('limestone', 54, 48, 20, 8, 13, null);
  addTop('wood', 54, 58, 22, 4.2, 2.0, null);
  addLabel('Tate Modern / Globe', 36, topY(36, 48) + 16, 48);

  addTiledRect('cobblestone', -188, 86, 82, 44, { color: '#77766d', height: 0.13, tile: 3.4 });
  addTop('brick', -188, 86, 40, 16, 20, 0x8f4d39);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addTop('brick', -188 + sx * 16, 86 + sz * 8, 5.2, 28, 5.2, 0x8f4d39);
    }
  }
  addTop('glass', -142, 92, 22, 18, 16, 0x9cc8c8);
  addLabel('Battersea Power Station', -188, topY(-188, 86) + 34, 86);

  for (const zone of [
    ['Brixton', -92, 226, 0xd94f45],
    ['Peckham Rooftops', 46, 228, 0x48d9ff]
  ]) {
    const [name, x, z, neonColor] = zone;
    addTiledRect('cobblestone', x, z, 82, 50, { color: '#77766d', height: 0.13, tile: 3.4 });
    for (let i = 0; i < 18; i += 1) {
      const bx = x - 32 + (i % 6) * 12.8;
      const bz = z - 16 + Math.floor(i / 6) * 13;
      addTop(i % 2 ? 'brick' : 'concrete', bx, bz, 9, 5 + rng() * 6, 9, i % 2 ? 0x9f583d : 0x8b8d88);
      if (i % 3 === 0) addTop('graffiti', bx, bz + 4.7, 6.2, 2.6, 0.28, 0x5d5a57, 0, topY(bx, bz) + 3.8);
      if (i % 4 === 0) addTop('neonPink', bx, bz - 4.7, 5.4, 0.4, 0.28, neonColor, 0, topY(bx, bz) + 5.0);
    }
    addLabel(name, x, topY(x, z) + 14, z);
  }
}

function buildDocklandsAndGreenwich({ addTop, addTiledRect, addLabel, rng }) {
  for (const [x, z, width, depth] of [
    [220, 96, 72, 18],
    [250, 122, 62, 16],
    [198, 70, 42, 14]
  ]) {
    addTiledRect('water', x, z, width, depth, { color: '#4d8fa5', height: 0.18, tile: 3.2 });
    addTiledRect('concrete', x, z - depth / 2 - 5, width, 5, { color: '#858983', height: 0.13, tile: 3.4 });
  }
  const towerSites = [
    [176, 50], [202, 48], [232, 54], [266, 74],
    [164, 88], [300, 96], [202, 138], [296, 138],
    [198, 136], [236, 142], [274, 148], [304, 132]
  ];
  towerSites.forEach(([x, z], index) => {
    addTop(index % 2 ? 'glass' : 'steel', x, z, 12 + rng() * 8, 20 + rng() * 36, 12 + rng() * 6, index % 2 ? 0x86b2bf : 0x66727a);
  });

  addTiledRect('cobblestone', 268, 166, 72, 48, { color: '#77766d', height: 0.13, tile: 3.4 });
  addTop('limestone', 250, 164, 34, 9, 16, null);
  addTop('slate', 250, 164, 36, 2.4, 18, 0x596066, 0, topY(250, 164) + 9);
  addTop('wood', 280, 160, 9, 1.2, 28, null, 0.18);
  addTop('gold', 280, 160, 0.8, 10, 0.8, 0xd8a334);
  addTiledRect('londonGrass', 286, 190, 44, 26, { color: '#61794f', height: 0.14, tile: 3.8 });
  addTop('limestone', 286, 194, 11, 11, 11, null);
  addLabel('Greenwich Maritime Quarter', 268, topY(268, 166) + 18, 166);

  addTiledRect('concrete', -268, -248, 80, 56, { color: '#858983', height: 0.13, tile: 3.4 });
  addTop('steel', -268, -248, 46, 12, 32, 0x66727a);
  addTop('londonGrass', -268, -248, 34, 0.24, 22, 0x61794f, 0, topY(-268, -248) + 12);
  addTop('gold', -268, -218, 2.2, 18, 2.2, 0xd8a334);
  addLabel('Wembley Stadium', -268, topY(-268, -248) + 24, -248);
}

function buildTransitAndNightlife({ planner, addTop, addTiledRect, addLabel, rng }) {
  const stations = [
    ['Westminster Underground', -46, -12],
    ['Waterloo Station', 24, 66],
    ['Victoria Station', -106, -34],
    ['Paddington Station', -190, -176],
    ['Liverpool Street', 130, -86],
    ['London Bridge Station', 86, 42],
    ['Camden Town', -66, -220],
    ['Canary Wharf DLR', 222, 92]
  ];
  for (const [name, x, z] of stations) {
    planner.reserveRect(name, x, z, 20, 16, { force: true, type: 'station' });
    addTiledRect('concrete', x, z, 22, 16, { color: '#858983', height: 0.13, tile: 3.2 });
    addTop('brick', x, z, 12, 5.5, 7, 0x9f583d);
    addTop('neon', x, z + 3.8, 8, 0.38, 0.32, 0xd94f45, 0, topY(x, z) + 5.7);
    addTop('steel', x - 7, z, 0.65, 7.2, 0.65, 0x66727a);
  }

  const rails = [
    ['Overground Viaduct', -32, -222, 160, 5, 0.02],
    ['East London Overground', 172, -164, 116, 5, 0.12],
    ['DLR Docklands', 224, 104, 116, 5, 0.16]
  ];
  for (const [tag, x, z, width, depth, yaw] of rails) {
    planner.reserveRect(tag, x, z, width, depth + 8, { force: true, type: 'rail' });
    addTiledRect('steel', x, z, width, depth, { color: '#66727a', height: 0.24, tile: 3.5, yaw });
    for (let i = -Math.floor(width / 18); i <= Math.floor(width / 18); i += 1) {
      addTop('concrete', x + i * 18 * Math.cos(yaw), z - i * 18 * Math.sin(yaw), 1.4, 5.2, 1.4, 0x858983);
    }
  }

  const venues = [
    ['Soho Nightlife', -66, -122, 'neonPink'],
    ['West End Theatres', -32, -110, 'neon'],
    ['Shoreditch Warehouses', 156, -130, 'neonCyan'],
    ['Dalston Clubs', 204, -198, 'neonPink'],
    ['Camden Live Music', -86, -252, 'neonCyan'],
    ['Brixton Night Market', -92, 226, 'neon'],
    ['Peckham Rooftop', 46, 228, 'neonPink']
  ];
  for (const [name, x, z, light] of venues) {
    addTiledRect('cobblestone', x, z, 36, 22, { color: '#77766d', height: 0.13, tile: 3.4 });
    addTop('brick', x - 7, z, 16, 7 + rng() * 5, 12, 0x8f4d39);
    addTop('shadow', x + 8, z, 14, 6 + rng() * 5, 10, 0x2d2924);
    addTop(light, x - 7, z + 6.2, 11, 0.48, 0.34, null, 0, topY(x, z) + 5.4);
    for (let i = 0; i < 7; i += 1) {
      const px = x - 16 + i * 5.2;
      const pz = z + 12 + (rng() - 0.5) * 3;
      addTop('crowd', px, pz, 0.58, 1.05, 0.58, null);
      addTop('skin', px, pz, 0.36, 0.36, 0.36, null, 0, topY(px, pz) + 1.02);
    }
    if (name === 'Soho Nightlife' || name === 'Shoreditch Warehouses' || name === 'Brixton Night Market') {
      addLabel(name, x, topY(x, z) + 13, z);
    }
  }
}

function buildUrbanBlocks({ planner, batch, addTop, rng }) {
  let placed = 0;
  const xs = [-286, -260, -234, -208, -182, -156, -130, -104, -78, -52, -26, 0, 26, 52, 78, 104, 132, 158, 186, 214, 242, 270, 296];
  const zs = [-282, -254, -226, -198, -170, -142, -114, -86, -58, -30, -2, 30, 62, 94, 126, 158, 190, 222, 254];

  for (const x of xs) {
    for (const z of zs) {
      const width = 12 + Math.floor(rng() * 5) * 2;
      const depth = 10 + Math.floor(rng() * 5) * 2;
      if (!planner.reserveRect(`london-block-${placed}`, x, z, width + 4, depth + 4, { type: 'building' })) continue;
      buildLondonBuilding(batch, addTop, x, z, width, depth, 2 + Math.floor(rng() * 5), rng);
      placed += 1;
    }
  }

  return placed;
}

function buildLondonBuilding(batch, addTop, x, z, width, depth, floors, rng) {
  const base = topY(x, z);
  const cityCore = x > 42 && x < 140 && z < -8;
  const material = cityCore && rng() > 0.45 ? 'glass' : rng() > 0.5 ? 'brick' : 'limestone';
  const height = cityCore ? 12 + rng() * 30 : floors * 3.1 + 2.2;
  addTop(material, x, z, width, height, depth, null, 0, base);
  addTop(cityCore ? 'steel' : 'slate', x, z, width + 1.2, 1.4, depth + 1.2, cityCore ? 0x66727a : 0x596066, 0, base + height);

  for (let i = -Math.floor(width / 5); i <= Math.floor(width / 5); i += 1) {
    const wx = x + i * 4.2;
    batch.addTop('shadow', wx, base + 3.2, z + depth / 2 + 0.15, 1.3, 1.8, 0.28);
    if (height > 12) batch.addTop('shadow', wx, base + 7.0, z + depth / 2 + 0.15, 1.3, 1.8, 0.28);
  }

  if (!cityCore && rng() > 0.76) {
    addTop('wood', x, z + depth / 2 + 1.2, width * 0.7, 0.85, 1.1, null, 0, base + 2.7);
    addTop('gold', x, z + depth / 2 + 1.82, width * 0.5, 0.42, 0.34, 0xd8a334, 0, base + 3.4);
  }
}

function buildStreetDetails({ planner, addTop, rng }) {
  const roads = planner.reservations.filter((item) => item.type === 'road');
  for (let i = 0; i < 128; i += 1) {
    const road = roads[i % roads.length];
    const x = road.x1 + rng() * (road.x2 - road.x1);
    const z = road.z1 + rng() * (road.z2 - road.z1);
    if (isRiver(x, z, 2)) continue;
    if (i % 5 === 0) {
      addTop('vegetation', x, z, 1.6, 4.2, 1.6);
    } else if (i % 7 === 0) {
      addTop('steel', x, z, 3.0, 1.2, 2.4, 0x4a4f53);
      addTop('neon', x, z - 1.3, 3.2, 0.32, 0.28, 0xd94f45, 0, topY(x, z) + 1.1);
    } else {
      addTop('gold', x, z, 0.34, 3.2, 0.34, 0xd8a334);
      addTop('gold', x + 0.45, z, 0.86, 0.38, 0.38, 0xe6c663, 0, topY(x, z) + 3.2);
    }
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
      speed: 2.8 + rng() * 4.0,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 1 + rng() * 0.28
    });
  }

  const group = new THREE.Group();
  group.name = 'london-street-crowds';
  const parts = {
    body: makeInstancedPart(pedestrians.length, 'london-pedestrian-body', 0x334f69),
    head: makeInstancedPart(pedestrians.length, 'london-pedestrian-head', 0xd09a6d),
    hair: makeInstancedPart(pedestrians.length, 'london-pedestrian-hair', 0x4b3a2e),
    leftLeg: makeInstancedPart(pedestrians.length, 'london-pedestrian-left-leg', 0x2f3642),
    rightLeg: makeInstancedPart(pedestrians.length, 'london-pedestrian-right-leg', 0x2f3642),
    leftArm: makeInstancedPart(pedestrians.length, 'london-pedestrian-left-arm', 0xd09a6d),
    rightArm: makeInstancedPart(pedestrians.length, 'london-pedestrian-right-arm', 0xd09a6d)
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

function buildBuses({ animated, rng }) {
  const routes = createVehicleRoutes();
  const buses = [];
  for (let i = 0; i < BUS_COUNT; i += 1) {
    const route = routes[i % routes.length];
    buses.push({ route, distance: rng() * route.length, speed: 6.2 + rng() * 3.5, lane: (rng() - 0.5) * route.width });
  }

  const group = new THREE.Group();
  group.name = 'london-red-buses';
  const parts = {
    body: makeInstancedPart(buses.length, 'london-bus-body', 0xb8282e),
    upper: makeInstancedPart(buses.length, 'london-bus-upper-deck', 0xc8353a),
    window: makeInstancedPart(buses.length, 'london-bus-windows', 0x253f52),
    wheelA: makeInstancedPart(buses.length, 'london-bus-front-wheels', 0x202326),
    wheelB: makeInstancedPart(buses.length, 'london-bus-rear-wheels', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateVehicles(parts, buses, elapsed, 'bus');
    }
  });
  updateVehicles(parts, buses, 0, 'bus');
  return buses.length;
}

function buildCabs({ animated, rng }) {
  const routes = createVehicleRoutes();
  const cabs = [];
  for (let i = 0; i < CAB_COUNT; i += 1) {
    const route = routes[(i + 1) % routes.length];
    cabs.push({ route, distance: rng() * route.length, speed: 8 + rng() * 4.5, lane: (rng() - 0.5) * route.width });
  }

  const group = new THREE.Group();
  group.name = 'london-black-cabs';
  const parts = {
    body: makeInstancedPart(cabs.length, 'london-cab-body', 0x1d2228),
    upper: makeInstancedPart(cabs.length, 'london-cab-upper', 0x222830),
    window: makeInstancedPart(cabs.length, 'london-cab-windows', 0x6d9fb0),
    wheelA: makeInstancedPart(cabs.length, 'london-cab-front-wheels', 0x111315),
    wheelB: makeInstancedPart(cabs.length, 'london-cab-rear-wheels', 0x111315)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateVehicles(parts, cabs, elapsed, 'cab');
    }
  });
  updateVehicles(parts, cabs, 0, 'cab');
  return cabs.length;
}

function buildTrains({ animated, rng }) {
  const routes = createTrainRoutes();
  const trains = [];
  for (let i = 0; i < TRAIN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    trains.push({ route, distance: rng() * route.length, speed: 9 + rng() * 5, lane: (rng() - 0.5) * route.width });
  }

  const group = new THREE.Group();
  group.name = 'london-overground-and-dlr-trains';
  const parts = {
    body: makeInstancedPart(trains.length, 'london-train-body', 0xd8cfb7),
    stripe: makeInstancedPart(trains.length, 'london-train-stripe', 0xd94f45),
    window: makeInstancedPart(trains.length, 'london-train-windows', 0x253f52),
    coupler: makeInstancedPart(trains.length, 'london-train-coupler', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateTrains(parts, trains, elapsed);
    }
  });
  updateTrains(parts, trains, 0);
  return trains.length;
}

function buildRiverBoats({ animated, rng }) {
  const routes = createRiverBoatRoutes();
  const boats = [];
  for (let i = 0; i < RIVER_BOAT_COUNT; i += 1) {
    const route = routes[i % routes.length];
    boats.push({ route, distance: rng() * route.length, speed: 5.5 + rng() * 2.8, lane: (rng() - 0.5) * route.width });
  }

  const group = new THREE.Group();
  group.name = 'london-thames-riverboats';
  const parts = {
    hull: makeInstancedPart(boats.length, 'london-riverboat-hull', 0xd8cfb7),
    cabin: makeInstancedPart(boats.length, 'london-riverboat-cabin', 0x6d9fb0),
    stripe: makeInstancedPart(boats.length, 'london-riverboat-red-stripe', 0xb8282e),
    wake: makeInstancedPart(boats.length, 'london-riverboat-wake', 0xbbe3e5)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));

  animated.push({
    object: group,
    update(elapsed) {
      updateRiverBoats(parts, boats, elapsed);
    }
  });
  updateRiverBoats(parts, boats, 0);
  return boats.length;
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

function createPedestrianRoutes() {
  return [
    { width: 5.5, loop: false, points: [[-82, -108], [-72, -96], [-34, -78], [10, -82], [72, -50], [126, -2]] },
    { width: 5.4, loop: false, points: [[-112, -72], [-82, -74], [-40, -48], [-28, 2], [12, 42]] },
    { width: 5.0, loop: false, points: [[-40, -34], [-24, 2], [24, 8], [96, 12], [142, 18]] },
    { width: 5.0, loop: true, points: [[-62, -42], [-26, -42], [-26, 10], [-62, 8]] },
    { width: 5.4, loop: true, points: [[-58, -96], [18, -96], [18, -62], [-58, -62]] },
    { width: 5.0, loop: true, ellipse: { x: -34, z: -78, rx: 28, rz: 20, segments: 36 } },
    { width: 5.4, loop: true, ellipse: { x: 12, z: 42, rx: 24, rz: 18, segments: 32 } },
    { width: 5.0, loop: true, points: [[-98, -260], [-66, -246], [-38, -232], [-66, -220]] },
    { width: 5.2, loop: true, points: [[-276, -166], [-244, -150], [-210, -140], [-244, -122]] },
    { width: 5.0, loop: true, points: [[130, -150], [156, -130], [186, -116], [154, -92]] },
    { width: 5.0, loop: true, points: [[34, 66], [58, 78], [78, 92], [36, 100]] },
    { width: 5.0, loop: true, points: [[-126, 198], [-92, 226], [-48, 236], [-70, 194]] },
    { width: 5.0, loop: true, points: [[210, 70], [226, 78], [250, 122], [268, 166]] }
  ].map((definition) => {
    const points = definition.ellipse
      ? makeEllipsePoints(definition.ellipse)
      : definition.points.map(([x, z]) => ({ x, z }));
    return prepareRoute({ ...definition, points });
  });
}

function createVehicleRoutes() {
  return [
    { width: 4.0, loop: true, points: [[-114, -74], [-72, -74], [-34, -78], [20, -62], [92, -50], [136, -2], [96, 12], [24, 8], [-28, 2]] },
    { width: 4.0, loop: true, points: [[-78, -110], [-76, -96], [-34, -78], [-40, -34], [-28, 2], [12, 42], [58, 44], [96, 12]] },
    { width: 4.0, loop: true, points: [[-126, -126], [-30, -124], [-72, -96], [-82, -74], [-40, -48], [20, -62]] },
    { width: 4.0, loop: true, points: [[12, -82], [36, -62], [76, -50], [92, -18], [96, 12], [142, 18], [94, 58], [36, 44]] },
    { width: 4.0, loop: true, points: [[-190, -176], [-126, -126], [-76, -108], [-18, -156], [48, -214], [-66, -226]] },
    { width: 4.0, loop: true, points: [[128, -94], [156, -130], [204, -198], [226, 78], [268, 166], [142, 18]] },
    { width: 4.0, loop: true, points: [[-188, 86], [-92, 226], [46, 228], [58, 78], [24, 66], [-28, 24]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createTrainRoutes() {
  return [
    { width: 1.4, loop: true, points: [[-102, -222], [-42, -222], [24, -214], [86, -204], [146, -164], [214, -122]] },
    { width: 1.4, loop: true, points: [[128, -174], [170, -156], [212, -116], [236, -20], [224, 104], [268, 150]] },
    { width: 1.3, loop: true, points: [[36, -214], [72, -178], [126, -86], [186, -40], [226, 78], [270, 148]] }
  ].map((definition) => prepareRoute({ ...definition, points: definition.points.map(([x, z]) => ({ x, z })) }));
}

function createRiverBoatRoutes() {
  const points = [];
  for (let x = -270; x <= 292; x += 28) {
    points.push({ x, z: thamesCenterZ(x) + Math.sin(x * 0.05) * 2 });
  }
  return [
    prepareRoute({ width: 11, loop: false, points }),
    prepareRoute({ width: 9, loop: false, points: points.map((point) => ({ x: point.x, z: point.z + 6 })) })
  ];
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

function updateVehicles(parts, vehicles, elapsed, type) {
  vehicles.forEach((vehicle, index) => {
    const sample = sampleRoute(vehicle.route, vehicle.distance + elapsed * vehicle.speed);
    const x = sample.x - sample.tangentZ * vehicle.lane;
    const z = sample.z + sample.tangentX * vehicle.lane;
    const y = topY(x, z) + 0.1;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);

    if (type === 'bus') {
      setPart(parts.body, index, x, y, z, yaw, 0, 1.05, 0, 2.6, 1.45, 6.2);
      setPart(parts.upper, index, x, y, z, yaw, 0, 2.35, 0, 2.55, 1.25, 6.0);
      setPart(parts.window, index, x, y, z, yaw, 0, 2.28, 0.1, 2.65, 0.62, 5.3);
      setPart(parts.wheelA, index, x, y, z, yaw, 0, 0.42, 2.0, 2.8, 0.34, 0.5);
      setPart(parts.wheelB, index, x, y, z, yaw, 0, 0.42, -2.0, 2.8, 0.34, 0.5);
    } else {
      setPart(parts.body, index, x, y, z, yaw, 0, 0.72, 0, 2.2, 0.85, 3.8);
      setPart(parts.upper, index, x, y, z, yaw, 0, 1.28, -0.2, 1.45, 0.56, 1.7);
      setPart(parts.window, index, x, y, z, yaw, 0, 1.28, -0.05, 2.25, 0.42, 2.2);
      setPart(parts.wheelA, index, x, y, z, yaw, 0, 0.34, 1.18, 2.35, 0.32, 0.42);
      setPart(parts.wheelB, index, x, y, z, yaw, 0, 0.34, -1.18, 2.35, 0.32, 0.42);
    }
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateTrains(parts, trains, elapsed) {
  trains.forEach((train, index) => {
    const sample = sampleRoute(train.route, train.distance + elapsed * train.speed);
    const x = sample.x - sample.tangentZ * train.lane;
    const z = sample.z + sample.tangentX * train.lane;
    const y = topY(x, z) + 2.8;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);

    setPart(parts.body, index, x, y, z, yaw, 0, 0.8, 0, 2.8, 1.45, 13.5);
    setPart(parts.stripe, index, x, y, z, yaw, 0, 1.1, 0, 2.9, 0.28, 13.7);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.45, 0.15, 2.95, 0.56, 10.6);
    setPart(parts.coupler, index, x, y, z, yaw, 0, 0.62, -7.4, 2.2, 0.35, 0.42);
  });
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updateRiverBoats(parts, boats, elapsed) {
  boats.forEach((boat, index) => {
    const sample = sampleRoute(boat.route, boat.distance + elapsed * boat.speed);
    const x = sample.x - sample.tangentZ * boat.lane;
    const z = sample.z + sample.tangentX * boat.lane;
    const y = 0.74 + Math.sin(elapsed * 1.6 + index) * 0.04;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);

    setPart(parts.hull, index, x, y, z, yaw, 0, 0.32, 0, 3.4, 0.62, 10.2);
    setPart(parts.cabin, index, x, y, z, yaw, 0, 1.08, -0.7, 2.3, 0.78, 4.8);
    setPart(parts.stripe, index, x, y, z, yaw, 0, 0.74, 3.2, 3.5, 0.22, 2.0);
    setPart(parts.wake, index, x, y, z, yaw, 0, 0.08, -6.6, 3.2, 0.08, 5.0);
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
