import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher } from './voxelBatcher.js';

const WORLD_BOUNDS = 340;
const TERRAIN_CELL = 5.8;
const TILE = 3.4;
const PEDESTRIAN_COUNT = 430;
const JEEPNEY_COUNT = 58;
const MOTORBIKE_COUNT = 64;
const TRICYCLE_COUNT = 42;
const TAXI_COUNT = 26;
const BUS_COUNT = 16;
const TRAIN_COUNT = 12;
const BOAT_COUNT = 18;
const KALESA_COUNT = 10;
const CYCLIST_COUNT = 34;
const tempColor = new THREE.Color();
const ANIMATED_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

const MATERIAL_KEYS = [
  'manilaTerrain',
  'manilaGrass',
  'manilaBay',
  'jeepneyChrome',
  'water',
  'asphalt',
  'concrete',
  'cobblestone',
  'limestone',
  'brick',
  'slate',
  'glass',
  'steel',
  'gold',
  'wood',
  'cloth',
  'vegetation',
  'shadow',
  'graffiti',
  'neon',
  'neonPink',
  'neonCyan',
  'crowd',
  'skin'
];

const LANDMARK_ZONES = [
  ['Intramuros', -96, -14, 84, 78],
  ['Rizal Park / Luneta', -112, 70, 78, 44],
  ['National Museum Complex', -118, 112, 58, 34],
  ['Manila City Hall', -54, 82, 44, 34],
  ['Binondo / Escolta', -58, -92, 70, 54],
  ['Quiapo', 12, -130, 50, 36],
  ['Makati CBD', 58, 72, 82, 62],
  ['Poblacion', 18, 24, 44, 34],
  ['Greenbelt / Legazpi', 32, 116, 54, 38],
  ['BGC High Street', 148, 78, 88, 62],
  ['Ortigas Center', 176, 30, 72, 54],
  ['Mandaluyong / San Juan', 118, -66, 62, 38],
  ['Quezon City', 116, -198, 92, 54],
  ['Tomas Morato / Timog', 88, -148, 72, 42],
  ['Cubao Expo', 168, -128, 70, 46],
  ['Pasay Bay Area', -168, 188, 100, 62],
  ['Paranaque / Las Pinas', -138, 272, 86, 54],
  ['Marikina River Park', 268, -114, 72, 52],
  ['Caloocan / Navotas / Malabon', -126, -202, 92, 56],
  ['Port and Fish Market', -218, -118, 72, 54],
  ['La Loma Grill District', -32, -188, 54, 34]
];

const PROTECTED_LANDMARK_ZONES = [
  ['Intramuros protected core', -96, -14, 88, 84],
  ['Fort Santiago protected core', -122, -66, 36, 28],
  ['Rizal Park protected lawn', -112, 70, 84, 50],
  ['National Museum protected block', -118, 112, 64, 42],
  ['Manila City Hall protected block', -54, 82, 52, 40]
];

const ACTOR_SOLID_ZONES = [
  ['Intramuros North Gate', -96, -50, 18, 8],
  ['Intramuros West Gate', -134, -14, 18, 8],
  ['Intramuros North Wall West', -120, -47, 30, 5],
  ['Intramuros North Wall East', -66, -47, 18, 5],
  ['Intramuros East Wall', -58, -14, 5, 70],
  ['Intramuros West Wall', -134, -14, 5, 70],
  ['Intramuros South Wall', -96, 19, 78, 5],
  ['Manila Cathedral', -82, -18, 34, 23],
  ['Fort Santiago', -122, -66, 34, 28],
  ['San Agustin Church', -100, 16, 25, 17],
  ['Casa Manila', -70, 16, 23, 17],
  ['Baluarte de San Diego', -132, 24, 25, 20],
  ['Rizal Monument', -112, 70, 9, 9],
  ['National Museum', -118, 112, 44, 26],
  ['Manila City Hall', -54, 82, 40, 24],
  ['Quiapo Church', 0, -134, 23, 21],
  ['Binondo Gate West', -90, -116, 8, 7],
  ['Binondo Gate East', -74, -116, 8, 7],
  ['Escolta Art Deco Block', -44, -70, 31, 19],
  ['Greenbelt Glass Pavilion', 20, 108, 26, 14],
  ['Greenbelt Limestone Pavilion', 48, 112, 30, 16],
  ['BGC Retail Pavilion', 148, 118, 32, 10],
  ['Ortigas Mall', 196, 30, 46, 22],
  ['UP Diliman Main Hall', 96, -210, 36, 20],
  ['Quezon City Campus Block', 150, -190, 50, 20],
  ['Araneta City Block', 202, -156, 24, 24],
  ['Bay Area Hotel', -146, 174, 22, 22],
  ['Bay Area Tower', -182, 182, 20, 20],
  ['Bay Convention Hall', -170, 210, 50, 26],
  ['Paranaque Church', -144, 268, 26, 22],
  ['Barangay Civic Anchor', -106, -192, 13, 11],
  ['Coastal Civic Anchor', -116, 232, 13, 11],
  ['Marikina Shoe Hall', 252, -104, 22, 14]
];

const FOOTBRIDGES = [
  [96, -126, 24, 0.08, 'EDSA / Aurora Footbridge'],
  [84, 74, 28, -0.1, 'Ayala Footbridge'],
  [-36, 22, 22, 0.16, 'Intramuros Connector Footbridge'],
  [148, 78, 26, 0.08, 'BGC High Street Footbridge'],
  [104, -186, 24, -0.18, 'UP / Maginhawa Footbridge']
];

const PUBLIC_REALM_BLOCKERS = [
  ...ACTOR_SOLID_ZONES,
  ['Greenbelt Outdoor Pavilion Buffer', 20, 108, 30, 18],
  ['Greenbelt Market Pavilion Buffer', 48, 112, 34, 20],
  ['BGC Retail Pavilion Buffer', 148, 118, 36, 14],
  ['Ortigas Mall Buffer', 196, 30, 48, 22],
  ['Poblacion Venue Cluster', 18, 31, 60, 28],
  ['Bay Area Hotel Cluster', -166, 188, 76, 82],
  ['La Loma Grill Row', -32, -188, 58, 36]
];

const PEDESTRIAN_ROUTES = [
  [[-126, -44], [-104, -44], [-76, -38], [-64, -26], [-64, 2], [-84, 28], [-116, 24], [-124, 4], [-126, -44]],
  [[-78, -100], [-58, -104], [-34, -110], [-54, -112], [-78, -100]],
  [[6, 12], [34, 18], [42, 42], [8, 48], [6, 12]],
  [[116, 82], [180, 82], [180, 108], [116, 108], [116, 82]],
  [[76, -238], [126, -246], [170, -224], [166, -178], [118, -176], [74, -198], [76, -238]],
  [[-212, 142], [-212, 232], [-206, 232], [-206, 142], [-212, 142]],
  [[28, 128], [70, 130], [78, 96], [60, 88], [34, 96], [28, 128]],
  [[88, -224], [126, -212], [152, -236], [116, -248], [88, -224]],
  [[144, -142], [202, -156], [214, -124], [168, -104], [144, -142]],
  [[-156, -216], [-118, -202], [-86, -176], [-126, -160], [-156, -216]],
  [[-174, 252], [-122, 272], [-96, 242], [-138, 222], [-174, 252]],
  [[296, -118], [318, -108], [326, -74], [300, -66], [296, -118]]
].map((points) => points.map(([x, z]) => ({ x, z })));

const PAVED_ROADS = [
  ['Roxas Boulevard', [[-200, -236], [-200, 250]], 12],
  ['EDSA', [[70, -250], [74, -126], [78, -26], [80, 74], [104, 168]], 12],
  ['C5 Corridor', [[234, -224], [230, -108], [232, 72], [210, 196]], 14],
  ['Ayala Avenue', [[-4, 76], [112, 72]], 8],
  ['BGC Service North', [[104, 52], [184, 52]], 7],
  ['BGC Service South', [[104, 132], [192, 132]], 7],
  ['BGC 5th Avenue Link', [[104, 64], [104, 132]], 6],
  ['BGC 11th Avenue Link', [[192, 64], [192, 132]], 6],
  ['Quezon Avenue', [[38, -154], [104, -166], [170, -166]], 8],
  ['Taft / Rizal Avenue', [[-18, 112], [-18, 24], [-18, -104], [-18, -172]], 12],
  ['Port Road', [[-238, -150], [-172, -150], [-122, -140], [-104, -134]], 12],
  ['Makati Connector', [[-24, 92], [58, 72], [96, 54], [104, 52], [184, 52], [220, 92], [286, -88]], 14],
  ['Old Manila Route', [[-142, -132], [-86, -148], [-40, -166], [24, -172], [74, -148], [112, -112], [188, -58], [242, -36], [258, 72]], 14],
  ['Marikina Bike / River Road', [[232, -124], [268, -124], [304, -116], [318, -82]], 6, { traffic: false }],
  ['Poblacion Night Street', [[-8, 2], [18, 3], [44, 4]], 6, { traffic: false }],
  ['Cubao Expo Lane', [[142, -140], [168, -134], [202, -128]], 6, { traffic: false }]
];

const VEHICLE_ROADS = PAVED_ROADS.filter(([, , , options]) => options?.traffic !== false);
const ROAD_ROUTES = VEHICLE_ROADS.map(([, points]) => points.map(([x, z]) => ({ x, z })));

const TRAIN_ROUTES = [
  [[-200, -118], [-112, -92], [-42, -98], [48, -118], [112, -112], [178, -138]],
  [[70, -250], [74, -126], [78, -26], [80, 74], [104, 168]]
].map((points) => points.map(([x, z]) => ({ x, z })));

const PASIG_BRIDGES = [
  [-82, 'Jones Bridge'],
  [-22, 'Quezon Bridge'],
  [72, 'Guadalupe Bridge'],
  [164, 'Ortigas Bridge']
];

const BOAT_ROUTES = [
  [[-248, -22], [-204, -32], [-156, -40]],
  [[-42, -25], [-10, -32], [28, -39], [70, -45], [118, -25], [164, -29], [214, -39], [250, -46], [286, -31]],
  [[-286, -220], [-282, -120], [-276, 20], [-270, 150], [-272, 238]]
].map((points) => points.map(([x, z]) => ({ x, z })));

const KALESA_ROUTES = [
  [[-126, -40], [-104, -40], [-66, -34], [-56, -10], [-56, 30], [-88, 32], [-116, 24], [-126, 4], [-126, -40]],
  [[-120, -34], [-92, -34], [-62, -28], [-54, -6], [-54, 24], [-84, 32], [-116, 18], [-120, -34]]
].map((points) => points.map(([x, z]) => ({ x, z })));

const CYCLIST_ROUTES = [
  [[232, -124], [268, -116], [304, -92], [320, -66], [300, -54], [260, -78], [232, -124]],
  [[80, -230], [122, -236], [164, -210], [126, -184], [86, -198], [80, -230]],
  [[28, 120], [66, 124], [76, 96], [42, 78], [28, 120]]
].map((points) => points.map(([x, z]) => ({ x, z })));

const ESTERO_POLYLINES = [
  [{ x: -92, z: -130 }, { x: -82, z: -54 }, { x: -120, z: 12 }],
  [{ x: -16, z: -146 }, { x: -32, z: -74 }, { x: -6, z: -30 }],
  [{ x: -204, z: -166 }, { x: -214, z: -98 }, { x: -238, z: -40 }],
  [{ x: 230, z: -132 }, { x: 268, z: -132 }, { x: 302, z: -132 }, { x: 314, z: -120 }]
];

const URBAN_FILL_ZONES = [
  { name: 'Tondo / Navotas dense streets', x: -122, z: -204, width: 118, depth: 74, attempts: 150, height: [3.4, 9.5], material: 'concrete', accent: 'cloth' },
  { name: 'Binondo / Escolta shophouse fabric', x: -56, z: -98, width: 104, depth: 74, attempts: 145, height: [4.2, 12], material: 'brick', accent: 'neonPink' },
  { name: 'Quiapo / Avenida market fabric', x: 10, z: -138, width: 94, depth: 72, attempts: 135, height: [4.2, 11], material: 'concrete', accent: 'gold' },
  { name: 'Makati CBD tower fabric', x: 62, z: 76, width: 108, depth: 88, attempts: 120, height: [9, 34], material: 'glass', accent: 'neonCyan' },
  { name: 'BGC glass grid fabric', x: 150, z: 84, width: 118, depth: 88, attempts: 118, height: [10, 38], material: 'glass', accent: 'neonCyan' },
  { name: 'Ortigas mall-office fabric', x: 180, z: 22, width: 96, depth: 72, attempts: 90, height: [8, 30], material: 'concrete', accent: 'neon' },
  { name: 'Mandaluyong / San Juan fabric', x: 118, z: -66, width: 102, depth: 64, attempts: 92, height: [4, 15], material: 'concrete', accent: 'cloth' },
  { name: 'Quezon City student creative fabric', x: 118, z: -198, width: 144, depth: 98, attempts: 154, height: [3.6, 13], material: 'concrete', accent: 'graffiti' },
  { name: 'Cubao / Araneta fabric', x: 172, z: -132, width: 98, depth: 72, attempts: 96, height: [4.8, 18], material: 'concrete', accent: 'neonPink' },
  { name: 'Bay Area hotel blocks', x: -164, z: 188, width: 112, depth: 86, attempts: 88, height: [6, 26], material: 'glass', accent: 'neon' },
  { name: 'Paranaque / Las Pinas coastal fabric', x: -138, z: 270, width: 110, depth: 70, attempts: 84, height: [3.4, 10], material: 'concrete', accent: 'cloth' },
  { name: 'Marikina river neighborhood fabric', x: 270, z: -102, width: 92, depth: 64, attempts: 76, height: [3.4, 10], material: 'brick', accent: 'gold' },
  { name: 'Port industrial fabric', x: -222, z: -118, width: 90, depth: 78, attempts: 78, height: [3.2, 12], material: 'steel', accent: 'cloth' },
  { name: 'La Loma food district fabric', x: -34, z: -188, width: 78, depth: 54, attempts: 62, height: [3.4, 8.5], material: 'brick', accent: 'neon' }
];

const CITY_SURFACE_MATS = [
  { x: -74, z: -134, width: 150, depth: 92, kind: 'concrete', color: '#8b8d88', tile: 3.4 },
  { x: 12, z: -180, width: 128, depth: 82, kind: 'concrete', color: '#8b8d88', tile: 3.4 },
  { x: 78, z: -48, width: 142, depth: 92, kind: 'concrete', color: '#8b8d88', tile: 3.4 },
  { x: 62, z: 52, width: 132, depth: 106, kind: 'concrete', color: '#8b8d88', tile: 3.4 },
  { x: 158, z: 78, width: 146, depth: 100, kind: 'concrete', color: '#8b8d88', tile: 3.4 },
  { x: 180, z: -28, width: 122, depth: 84, kind: 'concrete', color: '#8b8d88', tile: 3.4 },
  { x: 118, z: -204, width: 158, depth: 104, kind: 'concrete', color: '#8b8d88', tile: 3.4 },
  { x: -150, z: 168, width: 136, depth: 116, kind: 'concrete', color: '#8b8d88', tile: 3.4 },
  { x: -138, z: 258, width: 126, depth: 84, kind: 'concrete', color: '#8b8d88', tile: 3.4 },
  { x: -132, z: -202, width: 118, depth: 82, kind: 'concrete', color: '#777a76', tile: 3.4 },
  { x: -220, z: -116, width: 88, depth: 76, kind: 'concrete', color: '#777a76', tile: 3.4 },
  { x: 270, z: -94, width: 94, depth: 72, kind: 'concrete', color: '#8b8d88', tile: 3.4 }
];

const CITY_FABRIC_ZONES = [
  { name: 'Santa Cruz / Tondo compact blocks', x: -96, z: -164, cols: 7, rows: 4, stepX: 13, stepZ: 13, width: 7.2, depth: 7.2, height: [4, 9], material: 'concrete', accent: 'cloth' },
  { name: 'Binondo north shop blocks', x: -92, z: -128, cols: 7, rows: 3, stepX: 12, stepZ: 11, width: 6.8, depth: 6.2, height: [4.5, 10], material: 'brick', accent: 'neonPink' },
  { name: 'Recto / Avenida blocks', x: -8, z: -166, cols: 8, rows: 4, stepX: 12, stepZ: 12, width: 6.6, depth: 6.8, height: [4.5, 10.5], material: 'concrete', accent: 'gold' },
  { name: 'Quiapo fringe blocks', x: 36, z: -122, cols: 5, rows: 4, stepX: 12, stepZ: 12, width: 6.4, depth: 6.4, height: [4, 9], material: 'concrete', accent: 'cloth' },
  { name: 'Mandaluyong bridge blocks', x: 112, z: -28, cols: 7, rows: 4, stepX: 13, stepZ: 13, width: 7.2, depth: 7.2, height: [5, 14], material: 'concrete', accent: 'neon' },
  { name: 'Makati fringe blocks', x: 18, z: 64, cols: 5, rows: 5, stepX: 13, stepZ: 13, width: 7.4, depth: 7.4, height: [7, 18], material: 'glass', accent: 'neonCyan' },
  { name: 'Makati / Pasay edge blocks', x: -42, z: 132, cols: 6, rows: 4, stepX: 13, stepZ: 13, width: 7.4, depth: 7.4, height: [5, 13], material: 'concrete', accent: 'cloth' },
  { name: 'BGC podium grid', x: 150, z: 128, cols: 7, rows: 3, stepX: 14, stepZ: 13, width: 8.2, depth: 7.6, height: [6, 15], material: 'glass', accent: 'neonCyan' },
  { name: 'Ortigas north grid', x: 202, z: -16, cols: 6, rows: 4, stepX: 13, stepZ: 13, width: 7.8, depth: 7.6, height: [7, 22], material: 'glass', accent: 'neon' },
  { name: 'QC food and campus blocks', x: 96, z: -230, cols: 8, rows: 4, stepX: 14, stepZ: 13, width: 7.6, depth: 7.2, height: [4, 10], material: 'concrete', accent: 'graffiti' },
  { name: 'Cubao station blocks', x: 194, z: -154, cols: 5, rows: 4, stepX: 13, stepZ: 12, width: 7.4, depth: 7.0, height: [5, 14], material: 'concrete', accent: 'neonPink' },
  { name: 'Bay reclaimed grid', x: -154, z: 228, cols: 7, rows: 4, stepX: 14, stepZ: 14, width: 8.0, depth: 8.0, height: [5, 15], material: 'glass', accent: 'neon' },
  { name: 'Coastal village grid', x: -118, z: 286, cols: 6, rows: 3, stepX: 13, stepZ: 13, width: 7.2, depth: 7.0, height: [3.5, 8], material: 'concrete', accent: 'cloth' },
  { name: 'Navotas market grid', x: -146, z: -224, cols: 7, rows: 4, stepX: 12, stepZ: 12, width: 7.0, depth: 6.8, height: [3.5, 8], material: 'steel', accent: 'cloth' },
  { name: 'Marikina neighborhood grid', x: 290, z: -72, cols: 4, rows: 4, stepX: 13, stepZ: 13, width: 7.2, depth: 7.0, height: [3.5, 8.5], material: 'brick', accent: 'gold' }
];

function createRng(seed = 0x4d4e4c41) {
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

function bayEdge(z) {
  return -205 - Math.exp(-(((z - 176) / 108) ** 2)) * 18 + Math.sin(z * 0.026) * 7;
}

function pasigCenterZ(x) {
  return -34 + Math.sin((x + 94) * 0.033) * 10 + Math.sin(x * 0.071) * 3;
}

function pasigWaterCenterZ(x) {
  return pasigCenterZ(x) - Math.exp(-(((x + 104) / 56) ** 2)) * 28;
}

function pasigWidthAt(x) {
  return 22 + Math.sin(x * 0.035 + 1.3) * 3.5;
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

function esteroDistance(x, z) {
  let best = Infinity;
  for (const points of ESTERO_POLYLINES) {
    best = Math.min(best, distanceToPolylineSq(x, z, points));
  }
  return Math.sqrt(best);
}

function isBay(x, z, pad = 0) {
  return x < bayEdge(z) + pad;
}

function isReclaimedPortLand(x, z, pad = 0) {
  return x >= -232 - pad && x <= -172 + pad && z >= -154 - pad && z <= -78 + pad;
}

function isPasig(x, z, pad = 0) {
  return Math.abs(z - pasigWaterCenterZ(x)) <= pasigWidthAt(x) / 2 + pad && x > -260 - pad && x < 294 + pad;
}

function isRoadDeck(x, z, pad = 0) {
  return isRoadDeckFor(PAVED_ROADS, x, z, pad);
}

function isVehicleRoadDeck(x, z, pad = 0) {
  return isRoadDeckFor(VEHICLE_ROADS, x, z, pad);
}

function isRoadDeckFor(roads, x, z, pad = 0) {
  for (const [, points, width] of roads) {
    for (let i = 1; i < points.length; i += 1) {
      const a = { x: points[i - 1][0], z: points[i - 1][1] };
      const b = { x: points[i][0], z: points[i][1] };
      if (distanceToSegmentSq(x, z, a, b) <= (width / 2 + pad) ** 2) return true;
    }
  }
  return false;
}

function isHistoricCore(x, z, pad = 0) {
  return x > -140 - pad && x < -52 + pad && z > -58 - pad && z < 34 + pad;
}

function isWater(x, z, pad = 0) {
  if (isReclaimedPortLand(x, z, pad)) return false;
  const pasig = isPasig(x, z, pad);
  if (isHistoricCore(x, z, pad) && !pasig) return false;
  return isBay(x, z, pad) || pasig || esteroDistance(x, z) < 4.4 + pad;
}

function isDryRouteSurface(x, z, pad = 0) {
  return isWalkRouteSurface(x, z, pad);
}

function isWalkRouteSurface(x, z, pad = 0) {
  return !isWater(x, z, pad) || isRoadDeck(x, z, pad);
}

function isRoadRouteSurface(x, z, pad = 0) {
  return isVehicleRoadDeck(x, z, pad);
}

function isHistoricStreetSurface(x, z, pad = 0) {
  return isHistoricCore(x, z, 4) && isWalkRouteSurface(x, z, pad);
}

function isNavigableWater(x, z, pad = 0) {
  return isBay(x, z, pad) || isPasig(x, z, pad);
}

function terrainHeightAt(x, z) {
  if (isWater(x, z, 0)) return 0.54 + Math.sin(x * 0.034 + z * 0.021) * 0.035;
  const makati = Math.exp(-(((x - 58) / 82) ** 2 + ((z - 72) / 72) ** 2)) * 0.6;
  const bgc = Math.exp(-(((x - 148) / 88) ** 2 + ((z - 78) / 72) ** 2)) * 0.55;
  const qc = Math.exp(-(((x - 116) / 132) ** 2 + ((z + 198) / 76) ** 2)) * 0.45;
  const riverCut = Math.exp(-((z - pasigWaterCenterZ(x)) ** 2) / 360) * 0.38;
  return Math.max(0.72, 1.05 + makati + bgc + qc - riverCut + Math.sin(x * 0.029 + z * 0.023) * 0.13);
}

export function manilaTerrainHeightAt(x, z) {
  return terrainHeightAt(x, z);
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

function manilaWaterY(x, z) {
  return isBay(x, z, 0.5) && !isPasig(x, z, 0.5) ? 0.34 : 0.62;
}

function roadSurfaceY(x, z) {
  if (isWater(x, z, 1.2) && isRoadRouteSurface(x, z, 2.4)) return Math.max(topY(x, z) + 1.55, 1.95);
  if (isWater(x, z, 1.2) && isRoadDeck(x, z, 2.2)) return Math.max(topY(x, z) + 1.45, 1.85);
  return topY(x, z);
}

export const manilaTopologyProbe = {
  isWater,
  isRoadDeck,
  isDryRouteSurface,
  isWalkRouteSurface,
  isRoadRouteSurface,
  isHistoricStreetSurface,
  isNavigableWater,
  pasigWaterCenterZ,
  pasigWidthAt,
  roadSurfaceY,
  bridgeSegments: () => PASIG_BRIDGES.map(([x, name]) => {
    const z = pasigWaterCenterZ(x);
    const halfLength = (pasigWidthAt(x) + 18) / 2;
    return {
      name,
      width: 8,
      a: { x, z: z - halfLength },
      b: { x, z: z + halfLength }
    };
  }),
  footbridgeSegments: () => FOOTBRIDGES.map(([x, z, length, yaw, name]) => {
    const dx = Math.sin(yaw) * length / 2;
    const dz = Math.cos(yaw) * length / 2;
    return {
      name,
      width: 5.4,
      a: { x: x - dx, z: z - dz },
      b: { x: x + dx, z: z + dz }
    };
  }),
  roadSegments: () => PAVED_ROADS.flatMap(([name, points, width]) => points.slice(1).map((point, index) => ({
    name,
    width,
    a: { x: points[index][0], z: points[index][1] },
    b: { x: point[0], z: point[1] }
  }))),
  trainSegments: () => TRAIN_ROUTES.flatMap((points, routeIndex) => points.slice(1).map((point, index) => ({
    name: `rail-${routeIndex}`,
    width: 6.8,
    a: points[index],
    b: point
  })))
};

function isParkArea(x, z) {
  return (
    ((x + 112) / 52) ** 2 + ((z - 70) / 25) ** 2 < 1 ||
    ((x - 84) / 34) ** 2 + ((z + 208) / 22) ** 2 < 1 ||
    ((x - 270) / 44) ** 2 + ((z + 114) / 28) ** 2 < 1 ||
    ((x - 116) / 28) ** 2 + ((z - 102) / 18) ** 2 < 1
  );
}

function terrainMaterial(x, z) {
  if (isWater(x, z, 0.5)) return 'manilaBay';
  if (isParkArea(x, z)) return 'manilaGrass';
  return 'manilaTerrain';
}

export function createManilaScene(materials) {
  for (const key of MATERIAL_KEYS) {
    if (!materials[key]) throw new Error(`Missing Manila voxel material: ${key}`);
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
  let detailReservationId = 0;
  const reserveDetail = (x, z, width, depth, type = 'detail') => {
    planner.reserveRect(`manila-detail-${detailReservationId}`, x, z, width, depth, { force: true, type });
    detailReservationId += 1;
  };

  const addTiledRect = (kind, x, z, width, depth, options = {}) => {
    const tile = options.tile ?? TILE;
    const sy = options.height ?? 0.14;
    const baseOffset = options.baseOffset ?? 0.035;
    const yaw = options.yaw ?? 0;
    const skipWater = options.skipWater ?? true;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);

    for (let lx = -width / 2 + tile / 2; lx <= width / 2 - tile / 2; lx += tile) {
      for (let lz = -depth / 2 + tile / 2; lz <= depth / 2 - tile / 2; lz += tile) {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        if (skipWater && isWater(wx, wz, -0.8)) continue;
        const shade = Math.sin(wx * 0.17 + wz * 0.09) * 0.024 + Math.cos(lz * 0.39) * 0.014;
        addTop(kind, wx, wz, tile * 0.98, sy, tile * 0.98, options.color ? vary(options.color, shade) : null, yaw, topY(wx, wz) + baseOffset);
      }
    }
  };

  const reserveRoadSegment = (tag, ax, az, bx, bz, width = 8) => {
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const steps = Math.max(1, Math.ceil(length / 16));
    for (let i = 0; i <= steps; i += 1) {
      const t = steps === 0 ? 0 : i / steps;
      planner.reserveRect(`${tag}-${i}`, ax + dx * t, az + dz * t, width + 10, width + 10, { force: true, type: 'road' });
    }
    addTiledRect('asphalt', x, z, width, length, { color: '#3f4243', height: 0.12, tile: 3.4, yaw, baseOffset: 0.02 });
    const bridgeStep = Math.max(8, Math.min(14, length / 12));
    for (let d = bridgeStep / 2; d < length; d += bridgeStep) {
      const t = d / length;
      const px = ax + dx * t;
      const pz = az + dz * t;
      if (!isWater(px, pz, 1.2)) continue;
      const base = Math.max(topY(px, pz) + 0.95, 1.35);
      addTop('steel', px, pz, width + 3.2, 0.56, bridgeStep + 1.5, 0x66727a, yaw, base);
      addTop('asphalt', px, pz, width, 0.18, bridgeStep + 0.8, 0x3f4243, yaw, base + 0.5);
      addTop('limestone', px, pz, width + 4.4, 0.42, 0.62, 0xd8cfb7, yaw, base + 0.9);
    }
  };

  reserveLandmarkZones(planner);
  reserveFixedManilaFootprints(planner);
  buildTerrain(batch);
  buildWaterways({ addTop, addTiledRect, addLabel });
  buildRoadsAndTransit({ planner, reserveRoadSegment, addTop, addTiledRect, addLabel });
  const roadLegibilityDetails = buildRoadLegibilityLayer({ addTop, addLabel });
  const connectedFabric = buildConnectedCityFabric({ planner, addTop, addTiledRect, addLabel, rng });
  buildIntramuros({ addTop, addTiledRect, addLabel, rng });
  buildCivicLandmarks({ addTop, addTiledRect, addLabel, rng });
  buildOldManila({ planner, addTop, addTiledRect, addLabel, rng });
  buildBusinessDistricts({ planner, addTop, addTiledRect, addLabel, rng });
  buildNeighborhoods({ planner, addTop, addTiledRect, addLabel, rng });
  const cityLifeDetails = buildLayeredCityLife({ planner, addTop, addTiledRect, addLabel, reserveDetail, rng });
  const blocks = buildUrbanBlocks({ planner, addTop, rng });
  buildStreetLife({ planner, addTop, rng });
  const publicRealmDetails = buildManilaPublicRealmPolish({ planner, addTop, addTiledRect, addLabel, rng });
  const pedestrians = buildPedestrians({ animated, planner, rng });
  const cyclists = buildCyclists({ animated, planner, rng });
  const jeepneys = buildJeepneys({ animated, rng });
  const motorbikes = buildMotorbikes({ animated, rng });
  const tricycles = buildTricycles({ animated, rng });
  const taxis = buildTaxis({ animated, rng });
  const buses = buildBuses({ animated, rng });
  const trains = buildTrains({ animated, rng });
  const boats = buildBoats({ animated, rng });
  const kalesas = buildKalesas({ animated, planner, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-manila-metro-voxel-city';
  for (const item of animated) group.add(item.object);

  return {
    group,
    labels,
    focusTargets: {
      intramuros: new THREE.Vector3(-96, topY(-96, -14) + 18, -14),
      cathedral: new THREE.Vector3(-82, topY(-82, -18) + 22, -18),
      fortSantiago: new THREE.Vector3(-122, topY(-122, -54) + 16, -54),
      sanAgustin: new THREE.Vector3(-100, topY(-100, 16) + 16, 16),
      casaManila: new THREE.Vector3(-70, topY(-70, 16) + 12, 16),
      baluarte: new THREE.Vector3(-132, topY(-132, 24) + 12, 24),
      pasig: new THREE.Vector3(-42, topY(-42, pasigWaterCenterZ(-42)) + 8, pasigWaterCenterZ(-42)),
      pasigRiver: new THREE.Vector3(-42, topY(-42, pasigWaterCenterZ(-42)) + 8, pasigWaterCenterZ(-42)),
      rizalPark: new THREE.Vector3(-112, topY(-112, 70) + 8, 70),
      nationalMuseum: new THREE.Vector3(-118, topY(-118, 112) + 18, 112),
      cityHall: new THREE.Vector3(-54, topY(-54, 82) + 22, 82),
      jonesBridge: new THREE.Vector3(-82, topY(-82, pasigWaterCenterZ(-82)) + 10, pasigWaterCenterZ(-82)),
      binondo: new THREE.Vector3(-58, topY(-58, -92) + 12, -92),
      quiapo: new THREE.Vector3(12, topY(12, -130) + 12, -130),
      escolta: new THREE.Vector3(-44, topY(-44, -70) + 12, -70),
      makati: new THREE.Vector3(58, topY(58, 72) + 30, 72),
      greenbelt: new THREE.Vector3(32, topY(32, 116) + 14, 116),
      salcedo: new THREE.Vector3(66, topY(66, 120) + 10, 120),
      bgc: new THREE.Vector3(148, topY(148, 78) + 34, 78),
      ortigas: new THREE.Vector3(176, topY(176, 30) + 28, 30),
      edsa: new THREE.Vector3(98, topY(98, -86) + 18, -86),
      mrtLrt: new THREE.Vector3(94, topY(94, -86) + 18, -86),
      quezonCity: new THREE.Vector3(116, topY(116, -198) + 14, -198),
      tomasMorato: new THREE.Vector3(88, topY(88, -148) + 12, -148),
      maginhawa: new THREE.Vector3(44, topY(44, -218) + 12, -218),
      upDiliman: new THREE.Vector3(126, topY(126, -238) + 14, -238),
      cubao: new THREE.Vector3(168, topY(168, -128) + 12, -128),
      araneta: new THREE.Vector3(202, topY(202, -156) + 18, -156),
      poblacion: new THREE.Vector3(18, topY(18, 24) + 12, 24),
      kapitolyo: new THREE.Vector3(136, topY(136, -48) + 12, -48),
      laLoma: new THREE.Vector3(-32, topY(-32, -188) + 12, -188),
      bay: new THREE.Vector3(-190, topY(-190, 188) + 9, 188),
      manilaBay: new THREE.Vector3(-190, topY(-190, 188) + 9, 188),
      bayArea: new THREE.Vector3(-168, topY(-168, 188) + 24, 188),
      paranaque: new THREE.Vector3(-138, topY(-138, 272) + 12, 272),
      navotas: new THREE.Vector3(-126, topY(-126, -202) + 12, -202),
      port: new THREE.Vector3(-218, topY(-218, -118) + 12, -118),
      marikina: new THREE.Vector3(286, topY(286, -96) + 10, -96),
      aerial: new THREE.Vector3(4, topY(4, 6) + 13, 6)
    },
    metrics: {
      instances: total,
      pedestrians,
      taxis,
      jeepneys,
      buses,
      cyclists,
      motorbikes,
      tricycles,
      trams: 0,
      trains,
      boats,
      carts: kalesas,
      kalesas,
      animatedInstances: pedestrians + cyclists + jeepneys + motorbikes + tricycles + taxis + buses + trains + boats + kalesas,
      reservations: planner.reservations.length,
      monuments: LANDMARK_ZONES.length,
      blocks,
      cityLifeDetails,
      connectedFabric,
      roadLegibilityDetails,
      publicRealmDetails
    },
    update(elapsed) {
      for (const item of animated) item.update(elapsed);
    }
  };
}

function reserveLandmarkZones(planner) {
  PROTECTED_LANDMARK_ZONES.forEach(([name, x, z, width, depth]) => {
    planner.reserveRect(name, x, z, width, depth, { force: true, type: 'landmark' });
  });
}

function reserveFixedManilaFootprints(planner) {
  [
    ['quiapo-church', 0, -134, 22, 20],
    ['escolta-art-deco', -44, -70, 30, 18],
    ['escolta-side-buildings', -32, -60, 14, 10],
    ['binondo-gate-west', -90, -116, 6, 5],
    ['binondo-gate-east', -74, -116, 6, 5],
    ['recto-clear-market-lane', -33, -150, 18, 14],
    ['up-diliman-main-hall', 96, -210, 36, 20],
    ['qc-campus-block', 150, -190, 50, 20],
    ['araneta-city-block', 202, -156, 22, 22],
    ['bay-area-hotel', -146, 174, 20, 20],
    ['bay-area-tower', -182, 182, 18, 18],
    ['bay-area-convention-hall', -170, 210, 48, 24],
    ['paranaque-church', -144, 268, 24, 20],
    ['marikina-river-shoe-hall', 252, -104, 22, 14],
    ['marikina-shoe-sign', 288, -98, 8, 10],
    ['kapitolyo-civic-anchor', 126, -58, 12, 10],
    ['barangay-civic-anchor', -106, -192, 12, 10],
    ['coastal-civic-anchor', -116, 232, 12, 10],
    ['marikina-civic-anchor', 268, -100, 12, 10],
    ['laloma-civic-anchor', -2, -192, 12, 10],
    ['laloma-grill-row', -32, -188, 56, 34],
    ['poblacion-neon-alleys', 18, 31, 58, 26],
    ['bgc-high-street-promenade', 148, 100, 88, 20],
    ['bgc-retail-pavilion', 148, 118, 34, 14],
    ['greenbelt-weekend-market-clear', 66, 120, 26, 20],
    ['kapitolyo-market-clear', 136, -48, 36, 24],
    ['cubao-expo-street-life-clear', 174, -110, 46, 26],
    ['binondo-market-clear', -74, -122, 52, 30],
    ['old-manila-market-clear', -44, -86, 36, 22],
    ['qc-food-cart-clear', 86, -180, 34, 22],
    ['coastal-market-clear', -132, 248, 56, 36],
    ['baywalk-promenade', -212, 188, 16, 136],
    ['marikina-river-park-core', 268, -108, 74, 44],
    ['malabon-riverside-civic', -92, -202, 14, 12],
    ['ortigas-bridge-approach', 164, -34, 16, 58]
  ].forEach(([name, x, z, width, depth]) => {
    planner.reserveRect(`fixed-${name}`, x, z, width, depth, { force: true, type: 'landmark' });
  });
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      const kind = terrainMaterial(x, z);
      const h = terrainHeightAt(x, z);
      const shade = Math.sin(x * 0.058 + z * 0.037) * 0.035 + Math.cos(x * 0.021 - z * 0.045) * 0.02;
      if (kind === 'manilaBay') {
        batch.add(kind, x, 0.18, z, TERRAIN_CELL * 1.05, 0.24, TERRAIN_CELL * 1.05, terrainColor(kind, shade));
      } else {
        batch.add(kind, x, h / 2 - 0.04, z, TERRAIN_CELL * 1.04, h, TERRAIN_CELL * 1.04, terrainColor(kind, shade));
      }
    }
  }
}

function terrainColor(kind, shade) {
  if (kind === 'manilaGrass') return vary(0x4f8750, shade);
  if (kind === 'manilaBay') return vary(0x3f91aa, shade);
  return vary(0xa89a82, shade);
}

function buildWaterways({ addTop, addTiledRect, addLabel }) {
  for (let x = -246; x <= 278; x += 22) {
    const z = pasigWaterCenterZ(x);
    if (isHistoricCore(x, z, 8)) continue;
    addTop('water', x, z, 20, 0.16, pasigWidthAt(x), 0x3f91aa, 0, 0.58);
  }
  for (let x = -146; x <= -58; x += 14) {
    const z = pasigWaterCenterZ(x);
    addTop('water', x, z, 13.2, 0.15, Math.max(12, pasigWidthAt(x) * 0.72), 0x3f91aa, 0, 0.6);
    addTop('manilaBay', x, z + pasigWidthAt(x) * 0.36, 12.6, 0.08, 1.2, 0x3f91aa, 0, 0.78);
  }
  for (const [x, label] of PASIG_BRIDGES) {
    const z = pasigWaterCenterZ(x);
    addTop('steel', x, z, 8, 1.0, pasigWidthAt(x) + 18, 0x66727a, 0, topY(x, z) + 1.2);
    addTop('asphalt', x, z, 5.5, 0.18, pasigWidthAt(x) + 15, 0x3f4243, 0, topY(x, z) + 2.1);
    addBridgeArchDetails(addTop, x, z, pasigWidthAt(x) + 16);
    addLabel(label, x, topY(x, z) + 6, z);
  }
  buildPasigRiverfront(addTop, addLabel);
  addTiledRect('cobblestone', -212, 188, 10, 132, { color: '#77766d', height: 0.12, tile: 3.4 });
  addLabel('Pasig River', -42, topY(-42, pasigWaterCenterZ(-42)) + 7, pasigWaterCenterZ(-42));
  addLabel('Manila Bay Promenade', -190, topY(-190, 188) + 7, 188);
}

function addBridgeArchDetails(addTop, x, z, length) {
  for (const side of [-1, 1]) {
    addTop('limestone', x + side * 3.9, z, 0.72, 3.4, length, 0xd8cfb7, 0, topY(x, z) + 2.1);
    for (let i = -2; i <= 2; i += 1) {
      const pz = z + i * (length / 5);
      addTop('steel', x + side * 3.9, pz, 0.82, 2.8 - Math.abs(i) * 0.28, 0.72, 0x66727a, 0, topY(x, z) + 2.9);
    }
  }
  addTop('gold', x, z - length / 2 - 1.2, 8.4, 0.45, 0.45, 0xd8a334, 0, topY(x, z) + 4.6);
  addTop('gold', x, z + length / 2 + 1.2, 8.4, 0.45, 0.45, 0xd8a334, 0, topY(x, z) + 4.6);
}

function buildPasigRiverfront(addTop, addLabel) {
  for (let x = -224; x <= 248; x += 18) {
    const z = pasigWaterCenterZ(x);
    const width = pasigWidthAt(x);
    for (const side of [-1, 1]) {
      const bankZ = z + side * (width / 2 + 5.0);
      if (isWater(x, bankZ, 1.0)) continue;
      addTop('limestone', x, bankZ, 10, 0.7, 1.0, 0xd8cfb7, 0, topY(x, bankZ) + 0.2);
      addTop('cobblestone', x, bankZ + side * 3.0, 9.4, 0.13, 2.4, 0x77766d, 0, topY(x, bankZ) + 0.18);
      if (x % 36 === 0) {
        addTop('gold', x - 3.2, bankZ + side * 4.6, 0.28, 3.2, 0.28, 0xd8a334);
        addTop('neon', x - 3.2, bankZ + side * 4.6, 0.9, 0.42, 0.9, 0xf0dfb2, 0, topY(x, bankZ) + 3.0);
        addTop('vegetation', x + 3.2, bankZ + side * 4.4, 1.7, 3.2, 1.7, 0x4f8750);
      }
      if (x % 72 === 0 && !isHistoricCore(x, bankZ, 12)) {
        addTop('brick', x + 5.2, bankZ + side * 8.0, 7.2, 5.4, 5.6, 0x9f583d);
        addTop('slate', x + 5.2, bankZ + side * 8.0, 7.8, 0.55, 6.0, 0x5c6268, 0, topY(x + 5.2, bankZ + side * 8.0) + 5.4);
        addTop('neonCyan', x + 5.2, bankZ + side * 5.0, 5.2, 0.58, 0.28, 0x48d9ff, 0, topY(x + 5.2, bankZ + side * 8.0) + 3.2);
      }
    }
  }
  for (const [x, name] of [[-182, 'Pasig Ferry Stop'], [92, 'Guadalupe Ferry Stop'], [214, 'River Ferry Stop']]) {
    const z = pasigWaterCenterZ(x);
    const dockZ = z + pasigWidthAt(x) / 2 + 4.0;
    addTop('wood', x, dockZ, 14, 0.44, 4.2, 0x7a4d30, 0, topY(x, dockZ) + 0.45);
    addTop('steel', x, dockZ + 2.4, 12, 0.42, 0.4, 0x66727a, 0, topY(x, dockZ) + 1.6);
    addLabel(name, x, topY(x, dockZ) + 5.4, dockZ);
  }
}

function buildRoadsAndTransit({ planner, reserveRoadSegment, addTop, addTiledRect, addLabel }) {
  for (const [name, points, width] of PAVED_ROADS) {
    for (let i = 1; i < points.length; i += 1) reserveRoadSegment(`${name}-${i}`, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], width);
  }

  for (const [routeIndex, route] of TRAIN_ROUTES.entries()) {
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const steps = Math.max(1, Math.ceil(length / 10));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        planner.reserveRect(`rail-corridor-${routeIndex}-${i}-${step}`, a.x + dx * t, a.z + dz * t, 13, 13, { force: true, type: 'rail' });
      }
      addTop('steel', mx, mz, 2.2, 0.72, length, 0x66727a, yaw, topY(mx, mz) + 6.2);
      addTop('steel', mx, mz, 6.4, 0.46, length, 0x66727a, yaw, topY(mx, mz) + 5.7);
      for (let t = 0; t <= 1; t += 0.22) {
        const px = a.x + dx * t;
        const pz = a.z + dz * t;
        addTop('concrete', px, pz, 0.8, 5.4, 0.8, 0x8b8d88, yaw);
      }
      if (i % 2 === 0) addTransitStation(addTop, (a.x + b.x) / 2, (a.z + b.z) / 2, yaw);
    }
  }
  buildFootbridgesAndUnderpasses(planner, addTop);
  addTiledRect('manilaGrass', -112, 70, 72, 34, { color: '#4f8750', height: 0.12, tile: 3.4 });
  addLabel('MRT / LRT Lines', 94, topY(94, -86) + 12, -86);
  addLabel('EDSA Traffic Corridor', 98, topY(98, -86) + 10, -86);
}

function addTransitStation(addTop, x, z, yaw) {
  addTop('concrete', x, z, 15, 1.6, 5.2, 0x8b8d88, yaw, topY(x, z) + 7.0);
  addTop('steel', x, z, 17, 0.6, 6.4, 0x66727a, yaw, topY(x, z) + 8.6);
}

function buildFootbridgesAndUnderpasses(planner, addTop) {
  FOOTBRIDGES.forEach(([x, z, length, yaw, name]) => {
    const reserveWidth = Math.abs(Math.sin(yaw)) * length + Math.abs(Math.cos(yaw)) * 4.8 + 4;
    const reserveDepth = Math.abs(Math.cos(yaw)) * length + Math.abs(Math.sin(yaw)) * 4.8 + 4;
    planner.reserveRect(`footbridge-${name}`, x, z, reserveWidth, reserveDepth, { force: true, type: 'rail' });
    planner.reserveRect(`footbridge-${name}-west-stair`, x - Math.cos(yaw) * length * 0.45, z + Math.sin(yaw) * length * 0.45, 5.2, 5.2, { force: true, type: 'rail' });
    planner.reserveRect(`footbridge-${name}-east-stair`, x + Math.cos(yaw) * length * 0.45, z - Math.sin(yaw) * length * 0.45, 5.2, 5.2, { force: true, type: 'rail' });
    addTop('steel', x, z, length, 0.45, 3.1, 0x66727a, yaw, topY(x, z) + 5.4);
    addTop('concrete', x - Math.cos(yaw) * length * 0.45, z + Math.sin(yaw) * length * 0.45, 2.0, 5.2, 2.0, 0x8b8d88, yaw);
    addTop('concrete', x + Math.cos(yaw) * length * 0.45, z - Math.sin(yaw) * length * 0.45, 2.0, 5.2, 2.0, 0x8b8d88, yaw);
    addTop('shadow', x, z, length * 0.64, 0.25, 2.0, 0x2e2924, yaw, topY(x, z) + 0.25);
  });
}

function buildRoadLegibilityLayer({ addTop, addLabel }) {
  let details = 0;
  const markerRoutes = [
    { name: 'Roxas Boulevard', points: [[-200, -222], [-200, 238]], width: 12, color: 0xf0dfb2 },
    { name: 'EDSA', points: [[70, -238], [74, -126], [78, -26], [80, 74], [104, 158]], width: 12, color: 0xd8a334 },
    { name: 'Ayala Avenue', points: [[-2, 76], [108, 72]], width: 8, color: 0xf0dfb2 },
    { name: 'BGC High Street Grid', points: [[104, 52], [184, 52], [192, 132], [104, 132], [104, 52]], width: 7, color: 0x48d9ff },
    { name: 'Old Manila Route', points: [[-142, -132], [-86, -148], [-40, -166], [24, -172], [74, -148], [112, -112], [188, -58], [242, -36]], width: 14, color: 0xf0dfb2 },
    { name: 'C5 Corridor', points: [[234, -214], [230, -108], [232, 72], [212, 184]], width: 14, color: 0x48d9ff }
  ];

  for (const route of markerRoutes) {
    for (let i = 1; i < route.points.length; i += 1) {
      const [ax, az] = route.points[i - 1];
      const [bx, bz] = route.points[i];
      details += addRoadCenterMarkers(addTop, ax, az, bx, bz, route.width, route.color);
    }
  }

  [
    [-200, -118, 0, 12],
    [-200, 70, 0, 12],
    [78, -26, 0.05, 12],
    [80, 74, 0.08, 12],
    [58, 72, 1.53, 10],
    [148, 52, 1.57, 9],
    [148, 132, 1.57, 9],
    [104, 100, 0, 9],
    [192, 100, 0, 9],
    [-18, -104, 0, 12],
    [24, -172, 1.37, 13],
    [232, -124, 0.12, 8],
    [-126, 286, 1.1, 9]
  ].forEach(([x, z, yaw, width]) => {
    details += addCrosswalk(addTop, x, z, yaw, width);
    details += addTrafficSignal(addTop, x - Math.cos(yaw) * width * 0.58, z + Math.sin(yaw) * width * 0.58);
    details += addTrafficSignal(addTop, x + Math.cos(yaw) * width * 0.58, z - Math.sin(yaw) * width * 0.58);
  });

  [
    [-204, -86, 0.06, 'Pasig Ferry / Jeepney Transfer'],
    [-200, 154, 0, 'Roxas Baywalk Stop'],
    [82, -92, 0.06, 'EDSA Bus Stop'],
    [64, 72, 1.52, 'Ayala Commuter Stop'],
    [172, 52, 1.57, 'BGC Bus Stop'],
    [234, -120, 0.02, 'C5 Bike and Bus Stop']
  ].forEach(([x, z, yaw, label]) => {
    details += addTransitShelter(addTop, x, z, yaw);
    addLabel(label, x, topY(x, z) + 7, z);
  });

  addLabel('Metro Manila Road Hierarchy', 70, topY(70, -26) + 16, -26);
  return details;
}

function addRoadCenterMarkers(addTop, ax, az, bx, bz, roadWidth, color) {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  if (length <= 0.01) return 0;
  const yaw = Math.atan2(dx, dz);
  let count = 0;
  for (let d = 8; d < length - 4; d += 16) {
    const t = d / length;
    const x = ax + dx * t;
    const z = az + dz * t;
    if (!isRoadDeck(x, z, 0.4)) continue;
    addTop('gold', x, z, 0.42, 0.08, Math.min(7.2, roadWidth * 0.68), color, yaw, roadSurfaceY(x, z) + 0.18);
    count += 1;
  }
  return count;
}

function addCrosswalk(addTop, x, z, yaw, width) {
  let count = 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  for (let i = -2; i <= 2; i += 1) {
    const px = x + i * 1.35 * sin;
    const pz = z + i * 1.35 * cos;
    if (!isRoadDeck(px, pz, 1.4)) continue;
    addTop('gold', px, pz, width, 0.07, 0.42, 0xf0dfb2, yaw, roadSurfaceY(px, pz) + 0.19);
    count += 1;
  }
  return count;
}

function addTrafficSignal(addTop, x, z) {
  if (isWater(x, z, 1.0)) return 0;
  addTop('steel', x, z, 0.28, 3.0, 0.28, 0x66727a);
  addTop('neon', x, z, 0.8, 0.42, 0.8, 0xf0dfb2, 0, topY(x, z) + 2.8);
  return 2;
}

function addTransitShelter(addTop, x, z, yaw = 0) {
  if (!canPlaceDetailFootprint(x, z, 8.4, 4.6, { roadPad: 0.2, waterPad: 1.0 })) return 0;
  addTop('wood', x, z, 7.2, 0.45, 2.0, 0x7a4d30, yaw);
  addTop('steel', x - Math.sin(yaw) * 3.1, z - Math.cos(yaw) * 1.4, 0.26, 2.8, 0.26, 0x66727a, yaw);
  addTop('steel', x + Math.sin(yaw) * 3.1, z + Math.cos(yaw) * 1.4, 0.26, 2.8, 0.26, 0x66727a, yaw);
  addTop('cloth', x, z, 7.8, 0.34, 3.0, 0x48d9ff, yaw, topY(x, z) + 2.7);
  return 4;
}

function buildCivicLandmarks({ addTop, addTiledRect, addLabel, rng }) {
  buildRizalPark({ addTop, addTiledRect, addLabel, rng });
  buildNationalMuseum(addTop, addTiledRect, addLabel, -118, 112);
  buildManilaCityHall(addTop, addTiledRect, addLabel, -54, 82);
  enhanceJonesBridge(addTop, -82, pasigWaterCenterZ(-82));
}

function buildRizalPark({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('manilaGrass', -112, 70, 78, 44, { color: '#4f8750', height: 0.12, tile: 3.4 });
  buildPath(addTop, [[-148, 70], [-112, 70], [-76, 70]], 4.2, 'cobblestone');
  buildPath(addTop, [[-112, 50], [-112, 90]], 3.6, 'cobblestone');
  addTop('limestone', -112, 70, 5.2, 10.5, 5.2, 0xd8cfb7);
  addTop('gold', -112, 70, 1.4, 3.6, 1.4, 0xd8a334, 0, topY(-112, 70) + 10.2);
  addTop('shadow', -112, 64, 8, 1.1, 1.0, 0x2e2924, 0, topY(-112, 70) + 1.4);
  addTop('wood', -84, 52, 0.4, 9, 0.4, 0x7a4d30);
  addTop('cloth', -82, 52, 4.2, 2.2, 0.26, 0xd94f45, 0, topY(-84, 52) + 7.2);
  for (let i = 0; i < 16; i += 1) {
    addStaticPerson(addTop, -146 + rng() * 68, 52 + rng() * 36, i % 4 === 0 ? 'cloth' : 'crowd', 0.86 + rng() * 0.16);
  }
  addLabel('Rizal Park / Luneta', -112, topY(-112, 70) + 12, 70);
}

function buildNationalMuseum(addTop, addTiledRect, addLabel, x, z) {
  addTiledRect('cobblestone', x, z, 58, 34, { color: '#77766d', height: 0.12, tile: 3.4 });
  addTop('limestone', x, z, 38, 9.6, 20, 0xd8cfb7);
  addTop('limestone', x, z - 11, 42, 2.2, 4.2, 0xd8cfb7);
  for (let i = -3; i <= 3; i += 1) {
    addTop('limestone', x + i * 5.2, z - 13, 1.1, 8.2, 1.1, 0xefe3c8);
  }
  addTop('gold', x, z - 14.4, 26, 0.7, 0.34, 0xd8a334, 0, topY(x, z) + 7.4);
  addLabel('National Museum Complex', x, topY(x, z) + 18, z);
}

function buildManilaCityHall(addTop, addTiledRect, addLabel, x, z) {
  addTiledRect('concrete', x, z, 46, 32, { color: '#8b8d88', height: 0.12, tile: 3.4 });
  addTop('limestone', x, z, 30, 8.8, 18, 0xd8cfb7);
  addTop('slate', x, z, 32, 0.9, 20, 0x5c6268, 0, topY(x, z) + 8.8);
  addTop('limestone', x + 17, z - 2, 6.5, 23, 6.5, 0xd8cfb7);
  addTop('gold', x + 17, z - 2, 7.6, 1.0, 7.6, 0xd8a334, 0, topY(x + 17, z - 2) + 23);
  addTop('glass', x + 17, z - 5.6, 3.4, 3.4, 0.34, 0x9cc8c8, 0, topY(x + 17, z - 2) + 17);
  addLabel('Manila City Hall', x, topY(x, z) + 23, z);
}

function enhanceJonesBridge(addTop, x, z) {
  const avoidWestGate = Math.abs(x + 82) < 0.1;
  for (let i = -3; i <= 3; i += 1) {
    const px = x + i * 5.6;
    if (avoidWestGate && px < -88) continue;
    addTop('limestone', px, z - 3.1, 0.8, 2.3, 0.8, 0xd8cfb7, 0, topY(px, z) + 2.4);
    addTop('limestone', px, z + 3.1, 0.8, 2.3, 0.8, 0xd8cfb7, 0, topY(px, z) + 2.4);
    addTop('gold', px, z - 3.1, 0.9, 0.7, 0.9, 0xd8a334, 0, topY(px, z) + 4.4);
    addTop('gold', px, z + 3.1, 0.9, 0.7, 0.9, 0xd8a334, 0, topY(px, z) + 4.4);
  }
  const railX = avoidWestGate ? x + 7 : x;
  const railWidth = avoidWestGate ? 22 : 36;
  addTop('limestone', railX, z - 3.2, railWidth, 0.7, 0.55, 0xd8cfb7, 0, topY(x, z) + 3.0);
  addTop('limestone', railX, z + 3.2, railWidth, 0.7, 0.55, 0xd8cfb7, 0, topY(x, z) + 3.0);
}

function buildIntramuros({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', -96, -14, 72, 62, { color: '#77766d', height: 0.13, tile: 3.4 });
  addWallRect(addTop, -96, -14, 76, 66);
  buildGate(addTop, -96, -50, 0);
  buildGate(addTop, -134, -14, Math.PI / 2);
  buildCathedral(addTop, -82, -18);
  buildFortSantiago(addTop, -122, -66);
  buildColonialChurch(addTop, -100, 16, 'San Agustin Church');
  buildCasaManila(addTop, -70, 16);
  buildBaluarte(addTop, -132, 24);
  buildIntramurosDetails({ addTop, rng });
  addTop('manilaGrass', -114, 18, 14, 0.12, 12, 0x4f8750);
  for (let i = 0; i < 16; i += 1) {
    const x = -124 + rng() * 56;
    const z = -36 + rng() * 50;
    addStaticPerson(addTop, x, z, i % 4 === 0 ? 'cloth' : 'crowd', 0.82);
  }
  addLabel('Intramuros', -96, topY(-96, -14) + 16, -14);
  addLabel('Manila Cathedral', -82, topY(-82, -18) + 25, -18);
  addLabel('Fort Santiago', -122, topY(-122, -66) + 15, -66);
  addLabel('San Agustin Church', -100, topY(-100, 16) + 16, 16);
  addLabel('Casa Manila', -70, topY(-70, 16) + 12, 16);
  addLabel('Baluarte de San Diego', -132, topY(-132, 24) + 12, 24);
}

function addWallRect(addTop, x, z, width, depth) {
  const northZ = z - depth / 2;
  const southZ = z + depth / 2;
  const westX = x - width / 2;
  const eastX = x + width / 2;
  const gateGapMin = x - 10;
  const bridgeGapMax = x + 22;
  addTop('limestone', (westX + gateGapMin) / 2, northZ, gateGapMin - westX, 5.2, 3.0, 0x8b8276);
  addTop('limestone', (bridgeGapMax + eastX) / 2, northZ, eastX - bridgeGapMax, 5.2, 3.0, 0x8b8276);
  addTop('limestone', x, z + depth / 2, width, 5.2, 3.0, 0x8b8276);
  addTop('limestone', x - width / 2, z, 3.0, 5.2, depth, 0x8b8276);
  addTop('limestone', x + width / 2, z, 3.0, 5.2, depth, 0x8b8276);
  for (let i = 0; i < 8; i += 1) {
    const towerX = x - width / 2 + i * (width / 7);
    if (towerX > gateGapMin && towerX < bridgeGapMax) continue;
    addTop('limestone', towerX, northZ, 4.2, 6.3, 4.2, 0x8b8276);
  }
}

function buildGate(addTop, x, z, yaw) {
  addTop('brick', x, z, 16, 7.2, 6.2, 0x9f583d, yaw);
  addTop('shadow', x, z, 5.2, 4.8, 6.6, 0x2e2924, yaw, topY(x, z) + 0.4);
  addTop('gold', x, z - 3.4, 8, 0.6, 0.4, 0xd8a334, yaw, topY(x, z) + 5.5);
}

function buildCathedral(addTop, x, z) {
  addTop('limestone', x, z, 24, 9.2, 17, 0xd8cfb7);
  addTop('slate', x, z, 25, 1.0, 18, 0x5c6268, 0, topY(x, z) + 9.2);
  addTop('limestone', x - 13, z - 4, 5, 17, 5, 0xd8cfb7);
  addTop('limestone', x + 13, z - 4, 5, 17, 5, 0xd8cfb7);
  addTop('gold', x, z - 9, 12, 1.2, 0.7, 0xd8a334, 0, topY(x, z) + 6.4);
  addTop('glass', x, z - 9.4, 4.8, 3.2, 0.36, 0x9cc8c8, 0, topY(x, z) + 4.4);
  addTop('gold', x - 13, z - 4, 5.8, 1.1, 5.8, 0xd8a334, 0, topY(x - 13, z - 4) + 17);
  addTop('gold', x + 13, z - 4, 5.8, 1.1, 5.8, 0xd8a334, 0, topY(x + 13, z - 4) + 17);
}

function buildFortSantiago(addTop, x, z) {
  addTop('limestone', x, z, 30, 6.6, 20, 0x8b8276);
  addTop('manilaGrass', x + 4, z + 3, 18, 0.16, 10, 0x4f8750, 0, topY(x, z) + 6.8);
  addTop('brick', x - 13, z, 5, 9, 22, 0x9f583d);
  addTop('limestone', x, z - 12, 18, 7.2, 3.2, 0xd8cfb7);
  addTop('shadow', x, z - 13.8, 6.2, 4.4, 0.62, 0x2e2924, 0, topY(x, z) + 1.2);
  addTop('gold', x, z - 14.2, 8.4, 0.58, 0.36, 0xd8a334, 0, topY(x, z) + 5.7);
  addTop('limestone', x - 15.5, z - 8, 5.4, 6.8, 5.4, 0x8b8276, 0.2);
  addTop('limestone', x + 15.5, z - 8, 5.4, 6.8, 5.4, 0x8b8276, -0.2);
  for (let i = -2; i <= 2; i += 1) {
    addTop('limestone', x + i * 4.4, z - 17, 1.0, 2.2, 1.0, 0xd8cfb7);
  }
  addTop('gold', x + 8, z - 11, 0.6, 8, 0.6, 0xd8a334);
  addTop('shadow', x, z - 11.2, 10, 4.8, 0.6, 0x2e2924, 0, topY(x, z) + 1.4);
  addTop('water', x + 18, z + 2, 4.6, 0.14, 25, 0x3f91aa, 0, 0.62);
  addTop('cloth', x + 10, z - 12, 4.2, 1.8, 0.28, 0xd94f45, 0, topY(x, z) + 7.8);
  buildPath(addTop, [[x - 8, z - 28], [x, z - 16], [x + 12, z - 6]], 3.2, 'cobblestone');
}

function buildColonialChurch(addTop, x, z) {
  addTop('limestone', x, z, 22, 7.0, 13, 0xd8cfb7);
  addTop('brick', x, z, 23, 0.9, 14, 0xb96038, 0, topY(x, z) + 7.0);
  addTop('limestone', x - 10, z - 5, 4, 12, 4, 0xd8cfb7);
  addTop('limestone', x - 10, z - 5, 5.2, 0.9, 5.2, 0xd8cfb7, 0, topY(x - 10, z - 5) + 12);
  addTop('gold', x - 10, z - 5, 0.5, 3.2, 0.5, 0xd8a334, 0, topY(x - 10, z - 5) + 12.8);
  for (let i = -1; i <= 1; i += 1) {
    addTop('limestone', x + i * 6.8, z + 7.2, 1.1, 5.4, 1.1, 0xd8cfb7);
  }
  addTop('glass', x + 2, z - 6.8, 4.2, 2.0, 0.34, 0x9cc8c8, 0, topY(x, z) + 3.8);
}

function buildCasaManila(addTop, x, z) {
  addTop('limestone', x, z, 18, 5.4, 12, 0xd8cfb7);
  addTop('brick', x, z + 7, 18, 1.1, 3.2, 0xb96038);
  addTop('cobblestone', x, z + 1.2, 7.8, 0.12, 5.8, 0x77766d);
  for (let i = -1; i <= 1; i += 1) {
    addTop('wood', x + i * 5.2, z - 6.3, 3.2, 1.1, 0.4, 0x7a4d30, 0, topY(x, z) + 4.1);
    addTop('glass', x + i * 5.2, z - 6.6, 2.2, 1.2, 0.28, 0x9cc8c8, 0, topY(x, z) + 2.6);
    addTop('wood', x + i * 5.2, z - 5.8, 3.4, 0.32, 0.32, 0x7a4d30, 0, topY(x, z) + 5.1);
  }
  addTop('wood', x - 9.4, z, 0.42, 4.6, 10.4, 0x7a4d30);
  addTop('wood', x + 9.4, z, 0.42, 4.6, 10.4, 0x7a4d30);
  addTop('manilaGrass', x + 12, z + 2, 8, 0.14, 8, 0x4f8750);
}

function buildBaluarte(addTop, x, z) {
  const base = topY(x, z);
  addTop('limestone', x, z, 20, 4.8, 15, 0x8b8276);
  addTop('limestone', x - 8, z + 5, 7, 5.8, 7, 0x8b8276, 0.5);
  addTop('limestone', x + 8, z + 5, 7, 5.8, 7, 0x8b8276, -0.5);
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    addTop('limestone', x + Math.cos(angle) * 8.5, z + Math.sin(angle) * 6.4, 3.4, 2.4, 2.2, 0x8b8276, angle);
  }
  addTop('manilaGrass', x, z, 14, 0.16, 9, 0x4f8750, 0, base + 4.9);
  addTop('shadow', x, z - 7.8, 8, 2.0, 0.45, 0x2e2924, 0, base + 1.4);
}

function buildIntramurosDetails({ addTop, rng }) {
  addTop('cobblestone', -84, -2, 18, 0.12, 14, 0x77766d, 0, topY(-84, -2) + 0.06);
  addTop('vegetation', -92, -2, 2.8, 3.6, 2.8, 0x4f8750);
  addTop('vegetation', -76, -2, 2.8, 3.6, 2.8, 0x4f8750);
  for (let i = 0; i < 10; i += 1) {
    const x = -130 + (i % 5) * 16;
    const z = i < 5 ? -46 : 20;
    addTop('gold', x, z, 0.34, 2.8, 0.34, 0xd8a334);
    addTop('neon', x, z, 0.9, 0.45, 0.9, 0xf0dfb2, 0, topY(x, z) + 2.6);
  }
  for (let i = 0; i < 12; i += 1) {
    addStaticPerson(addTop, -126 + rng() * 58, -44 + rng() * 66, i % 3 === 0 ? 'cloth' : 'crowd', 0.82 + rng() * 0.12);
  }
}

function buildOldManila({ planner, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', -58, -92, 62, 46, { color: '#77766d', height: 0.13, tile: 3.4 });
  buildShopRows({ planner, addTop, x: -58, z: -92, width: 58, rows: 4, material: 'brick', roof: 'gold', rng, lanterns: true, tag: 'binondo-shop-row' });
  buildArtDecoBlock(addTop, -44, -70);
  buildBinondoDetails({ addTop, rng });
  buildEscoltaDetails({ planner, addTop, rng });
  addTiledRect('concrete', 12, -130, 44, 30, { color: '#777a76', height: 0.12, tile: 3.4 });
  buildShopRows({ planner, addTop, x: 12, z: -130, width: 42, rows: 3, material: 'concrete', roof: 'slate', rng, neon: true, tag: 'quiapo-shop-row' });
  addTop('limestone', 0, -134, 18, 12, 16, 0xd8cfb7);
  addTop('gold', 0, -134, 20, 1.1, 18, 0xd8a334, 0, topY(0, -134) + 12);
  buildQuiapoDetails({ addTop, rng });
  addLabel('Binondo Food Alleys', -58, topY(-58, -92) + 12, -92);
  addLabel('Escolta Heritage Row', -44, topY(-44, -70) + 14, -70);
  addLabel('Quiapo Market', 12, topY(12, -130) + 12, -130);
}

function buildArtDecoBlock(addTop, x, z) {
  addTop('limestone', x, z, 26, 12, 14, 0xd8cfb7);
  for (let i = 0; i < 4; i += 1) {
    addTop('glass', x - 9 + i * 6, z - 7.2, 2.4, 4.8, 0.5, 0x9cc8c8, 0, topY(x, z) + 4.2);
  }
  addTop('gold', x, z - 7.8, 20, 0.8, 0.6, 0xd8a334, 0, topY(x, z) + 10.2);
}

function buildBinondoDetails({ addTop, rng }) {
  addTop('brick', -90, -116, 4, 9, 3, 0xd94f45);
  addTop('brick', -74, -116, 4, 9, 3, 0xd94f45);
  addTop('gold', -82, -116, 20, 2.2, 2.4, 0xd8a334, 0, topY(-82, -116) + 8.2);
  for (let i = 0; i < 12; i += 1) {
    const x = -96 + i * 5.2;
    addTop('neonPink', x, -102, 1.1, 1.1, 0.3, 0xf25fa7, 0, topY(x, -102) + 3.4);
    if (i % 3 === 0) addStaticPerson(addTop, x, -96 + rng() * 12, 'crowd', 0.82);
  }
}

function buildEscoltaDetails({ planner, addTop, rng }) {
  for (let i = 0; i < 4; i += 1) {
    const x = -64 + i * 10.5;
    addTop('limestone', x, -60, 10, 8 + (i % 2) * 2.2, 6, 0xd8cfb7);
    addTop('neonCyan', x, -63.4, 7.2, 0.8, 0.34, i % 2 ? 0xf25fa7 : 0x48d9ff, 0, topY(x, -60) + 4.8);
    addTop('glass', x, -63.7, 5.2, 2.1, 0.28, 0x9cc8c8, 0, topY(x, -60) + 2.2);
  }
  buildMarketStalls(addTop, -28, -82, 5, 0xf0dfb2, rng, 0.1, planner);
}

function buildQuiapoDetails({ addTop, rng }) {
  addTop('shadow', 8, -118, 34, 0.18, 7.6, 0x2e2924, 0, topY(8, -118) + 0.15);
  for (let i = 0; i < 7; i += 1) {
    addTop('cloth', -8 + i * 6.2, -150, 5.2, 0.5, 3.4, i % 2 ? 0xd8a334 : 0xd94f45, 0, topY(-8 + i * 6.2, -150) + 2.4);
    addStaticPerson(addTop, -10 + i * 6.2, -146 + rng() * 7, i % 2 ? 'cloth' : 'crowd', 0.82);
  }
  addTop('neon', 28, -134, 8, 0.8, 0.34, 0xf0dfb2, 0, topY(28, -134) + 5.2);
}

function buildBusinessDistricts({ planner, addTop, addTiledRect, addLabel, rng }) {
  buildBusinessCore({ planner, addTop, addTiledRect, x: 58, z: 72, label: 'Makati CBD', towers: 12, rng });
  buildBusinessCore({ planner, addTop, addTiledRect, x: 148, z: 78, label: 'BGC High Street', towers: 14, rng, modern: true });
  buildBusinessCore({ planner, addTop, addTiledRect, x: 176, z: 30, label: 'Ortigas Center', towers: 10, rng });
  buildGreenbeltAndMarkets({ planner, addTop, addTiledRect, addLabel, rng });
  buildBGCArtAndRooftops({ addTop, addTiledRect, addLabel, rng });
  buildOrtigasMalls({ planner, addTop, addTiledRect, addLabel, rng });
  buildNightlifePocket({ planner, addTop, addTiledRect, addLabel, x: 18, z: 24, label: 'Poblacion Hidden Bars', rng });
  buildRainyReflections({ addTop, rng });
  addLabel('Makati CBD', 58, topY(58, 72) + 36, 72);
  addLabel('BGC High Street', 148, topY(148, 78) + 38, 78);
  addLabel('Ortigas Center', 176, topY(176, 30) + 32, 30);
}

function buildBusinessCore({ planner, addTop, addTiledRect, x, z, label, towers, rng, modern = false }) {
  addTiledRect('concrete', x, z, 76, 54, { color: '#8b8d88', height: 0.14, tile: 3.4 });
  addTiledRect('manilaGrass', x - 22, z + 16, 20, 12, { color: '#4f8750', height: 0.12, tile: 3.4 });
  const towerSlots = [
    [-31, -21], [-15, -21], [4, -21], [23, -21], [35, -17],
    [-33, 19], [-16, 20], [2, 21], [20, 20], [35, 18],
    [-24, 34], [-6, 35], [12, 34], [30, 33]
  ];
  let placed = 0;
  for (let i = 0; i < Math.min(towers, towerSlots.length); i += 1) {
    const [slotX, slotZ] = towerSlots[i];
    const tx = x + slotX + (rng() - 0.5) * 2.2;
    const tz = z + slotZ + (rng() - 0.5) * 2.2;
    const width = 8 + rng() * 3.4;
    const depth = 8 + rng() * 3.4;
    if (!canPlaceUrbanParcel(planner, tx, tz, width, depth, 1.8)) continue;
    if (!planner.reserveRect(`${label}-tower-${i}`, tx, tz, width + 1.2, depth + 1.2, { type: 'building' })) continue;
    const h = modern ? 18 + rng() * 34 : 14 + rng() * 28;
    addTop(i % 3 === 0 ? 'glass' : 'concrete', tx, tz, width, h, depth, i % 3 === 0 ? 0x9cc8c8 : 0x8b8d88);
    addTop('steel', tx, tz, width + 0.8, 0.6, depth + 0.8, 0x66727a, 0, topY(tx, tz) + h);
    addTop(i % 2 ? 'neon' : 'neonCyan', tx - 3.2, tz - 4.9, 0.38, Math.min(14, h * 0.72), 0.28, i % 2 ? 0xd8a334 : 0x48d9ff, 0, topY(tx, tz) + h * 0.28);
    addTop(i % 2 ? 'neonCyan' : 'neon', tx + 3.2, tz - 4.9, 0.38, Math.min(12, h * 0.62), 0.28, i % 2 ? 0x48d9ff : 0xd8a334, 0, topY(tx, tz) + h * 0.36);
    if (i % 5 === 0) {
      addTop('gold', tx, tz, 4.6, 0.34, 4.6, 0xd8a334, 0, topY(tx, tz) + h + 0.55);
      addTop('steel', tx + 1.8, tz - 1.8, 0.36, 3.8, 0.36, 0x66727a, 0, topY(tx, tz) + h + 0.8);
    }
    if (i % 4 === 0) addTop('neonCyan', tx, tz - 4.8, 4.2, 1.2, 0.35, 0x48d9ff, 0, topY(tx, tz) + h * 0.56);
    placed += 1;
  }
  if (canPlaceUrbanParcel(planner, x + 26, z - 24, 18, 12, 0.8)) {
    planner.reserveRect(`${label}-parking-podium`, x + 26, z - 24, 20, 14, { type: 'building' });
    addTop('asphalt', x + 26, z - 24, 18, 0.15, 12, 0x34383d);
    addTop('gold', x + 26, z - 24, 12, 0.18, 0.45, 0xd8a334, 0, topY(x + 26, z - 24) + 0.22);
    addTop('gold', x + 20, z - 24, 0.45, 0.18, 9, 0xd8a334, 0, topY(x + 26, z - 24) + 0.22);
    addTop('gold', x + 32, z - 24, 0.45, 0.18, 9, 0xd8a334, 0, topY(x + 26, z - 24) + 0.22);
  }
  if (placed < Math.ceil(towers * 0.55)) {
    for (let i = placed; i < Math.ceil(towers * 0.55); i += 1) {
      const tx = x - 28 + i * 12;
      const tz = z + 31 + (i % 2) * 5;
      if (canPlaceUrbanParcel(planner, tx, tz, 7.2, 7.2, 1.2) && planner.reserveRect(`${label}-skyline-backfill-${i}`, tx, tz, 8.4, 8.4, { type: 'building' })) {
        addTop('glass', tx, tz, 7.2, modern ? 24 : 18, 7.2, 0x9cc8c8);
        addTop('steel', tx, tz, 7.8, 0.5, 7.8, 0x66727a, 0, topY(tx, tz) + (modern ? 24 : 18));
      }
    }
  }
}

function buildNightlifePocket({ planner, addTop, addTiledRect, addLabel, x, z, label, rng }) {
  addTiledRect('concrete', x, z, 38, 28, { color: '#777a76', height: 0.12, tile: 3.4 });
  for (let i = 0; i < 12; i += 1) {
    const px = x - 16 + (i % 4) * 10;
    const pz = z - 10 + Math.floor(i / 4) * 9;
    if (planner) {
      if (!canPlaceUrbanParcel(planner, px, pz, 7.4, 6.2, 1.0)) continue;
      if (!planner.reserveRect(`${label}-venue-${i}`, px, pz, 8.4, 7.2, { type: 'building' })) continue;
    }
    addTop(i % 2 ? 'brick' : 'concrete', px, pz, 7.4, 5 + rng() * 3.2, 6.2, i % 2 ? 0x9f583d : 0x8b8d88);
    addTop(i % 3 === 0 ? 'neonPink' : 'neonCyan', px, pz - 3.3, 4.8, 0.9, 0.35, i % 3 === 0 ? 0xf25fa7 : 0x48d9ff, 0, topY(px, pz) + 3.8);
    if (i % 5 === 0) {
      addTop('wood', px, pz, 6.2, 0.35, 5.0, 0x7a4d30, 0, topY(px, pz) + 5.9);
      addTop('neon', px - 2.2, pz - 1.8, 1.0, 0.38, 1.0, 0xf0dfb2, 0, topY(px, pz) + 6.3);
      addStaticPerson(addTop, px + 1.8, pz + 1.6, 'cloth', 0.78);
    }
  }
  buildMarketStalls(addTop, x + 2, z + 18, 5, 0xf25fa7, rng, 0.05, planner);
  addLabel(label, x, topY(x, z) + 12, z);
}

function buildGreenbeltAndMarkets({ planner, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('manilaGrass', 32, 116, 48, 30, { color: '#4f8750', height: 0.12, tile: 3.4 });
  addTop('glass', 20, 108, 24, 6.8, 12, 0x9cc8c8);
  addTop('limestone', 48, 112, 28, 5.2, 14, 0xd8cfb7);
  addTop('neonCyan', 36, 100, 18, 0.8, 0.35, 0x48d9ff, 0, topY(36, 100) + 4.2);
  buildMarketStalls(addTop, 66, 120, 7, 0xd8a334, rng, 0, planner);
  buildMarketStalls(addTop, 28, 134, 5, 0xf25fa7, rng, 0, planner);
  addLabel('Greenbelt / Legazpi Village', 32, topY(32, 116) + 14, 116);
  addLabel('Salcedo Weekend Market', 66, topY(66, 120) + 10, 120);
}

function buildBGCArtAndRooftops({ addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('cobblestone', 148, 100, 82, 14, { color: '#77766d', height: 0.12, tile: 3.4 });
  addTiledRect('concrete', 148, 118, 78, 10, { color: '#8b8d88', height: 0.12, tile: 3.4 });
  addTop('glass', 148, 118, 30, 4.4, 8.2, 0x9cc8c8);
  addTop('neon', 148, 113.2, 24, 0.72, 0.32, 0xd8a334, 0, topY(148, 118) + 3.6);
  for (let i = 0; i < 7; i += 1) {
    const x = 112 + i * 12;
    addTop('neonPink', x, 99, 2.6, 4.4 + (i % 3), 0.45, i % 2 ? 0x48d9ff : 0xf25fa7, 0, topY(x, 99) + 0.6);
    addTop('vegetation', x + 3.2, 104, 2.8, 2.2, 2.8, 0x4f8750, 0, topY(x + 3.2, 104) + 0.2);
    addTop('gold', x - 3.4, 106, 0.28, 2.8, 0.28, 0xd8a334);
    addTop('neon', x - 3.4, 106, 0.78, 0.38, 0.78, 0xf0dfb2, 0, topY(x - 3.4, 106) + 2.6);
  }
  for (let i = 0; i < 5; i += 1) {
    const x = 124 + i * 12;
    addTop('steel', x, 124, 2.6, 2.6, 2.6, 0x66727a, i * 0.4);
    addTop(i % 2 ? 'neonPink' : 'neonCyan', x, 124, 3.4, 0.42, 0.42, i % 2 ? 0xf25fa7 : 0x48d9ff, i * 0.4, topY(x, 124) + 2.6);
  }
  for (let i = 0; i < 8; i += 1) {
    addStaticPerson(addTop, 112 + rng() * 74, 94 + rng() * 16, i % 3 === 0 ? 'cloth' : 'crowd', 0.86);
  }
  addLabel('BGC Public Art', 148, topY(148, 100) + 14, 100);
}

function buildOrtigasMalls({ planner, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('concrete', 196, 30, 56, 32, { color: '#8b8d88', height: 0.12, tile: 3.4 });
  addTop('limestone', 196, 30, 42, 8.4, 18, 0xd8cfb7);
  addTop('glass', 176, 30, 10, 15, 10, 0x9cc8c8);
  addTop('gold', 196, 20, 34, 0.8, 0.4, 0xd8a334, 0, topY(196, 30) + 6.2);
  addTop('steel', 206, 48, 30, 0.6, 6, 0x66727a, 0.08, topY(206, 48) + 4.4);
  buildMarketStalls(addTop, 136, -48, 5, 0xf0dfb2, rng, 0, planner);
  addLabel('Ortigas Malls', 196, topY(196, 30) + 14, 30);
  addLabel('Kapitolyo Food Streets', 136, topY(136, -48) + 12, -48);
}

function buildRainyReflections({ addTop, rng }) {
  for (const [x, z, count] of [
    [18, 24, 8],
    [168, -128, 7],
    [-58, -92, 7],
    [98, -86, 7],
    [-190, 188, 9]
  ]) {
    for (let i = 0; i < count; i += 1) {
      const px = x + (rng() - 0.5) * 42;
      const pz = z + (rng() - 0.5) * 28;
      if (isWater(px, pz, 1.2)) continue;
      addTop(i % 2 ? 'glass' : 'water', px, pz, 5 + rng() * 5, 0.028, 1.2 + rng() * 1.8, i % 2 ? 0x48d9ff : 0x3f91aa, rng() * Math.PI, topY(px, pz) + 0.18);
    }
  }
}

function buildNeighborhoods({ planner, addTop, addTiledRect, addLabel, rng }) {
  buildCampusAndFoodStreet({ planner, addTop, addTiledRect, addLabel, x: 116, z: -198, rng });
  buildNightlifePocket({ planner, addTop, addTiledRect, addLabel, x: 168, z: -128, label: 'Cubao Expo', rng });
  buildBayArea({ planner, addTop, addTiledRect, addLabel, rng });
  buildLocalDistrict({ planner, addTop, addTiledRect, addLabel, x: 118, z: -66, label: 'Mandaluyong / San Juan Food Streets', rng });
  buildLocalDistrict({ planner, addTop, addTiledRect, addLabel, x: -126, z: -202, label: 'Navotas / Malabon Markets', rng, industrial: true });
  buildLocalDistrict({ planner, addTop, addTiledRect, addLabel, x: -138, z: 272, label: 'Paranaque / Las Pinas', rng });
  buildPortAndFishMarket({ planner, addTop, addTiledRect, addLabel, rng });
  buildLaLomaGrillDistrict({ planner, addTop, addTiledRect, addLabel, rng });
  buildSouthernCoast({ planner, addTop, addTiledRect, addLabel, rng });
  buildMarikina({ planner, addTop, addTiledRect, addLabel, rng });
}

function buildCampusAndFoodStreet({ planner, addTop, addTiledRect, addLabel, x, z, rng }) {
  addTiledRect('manilaGrass', x - 24, z - 8, 50, 34, { color: '#4f8750', height: 0.12, tile: 3.4 });
  addTop('limestone', x - 20, z - 12, 32, 7, 16, 0xd8cfb7);
  addTop('concrete', x + 34, z + 8, 46, 7, 16, 0x8b8d88);
  buildShopRows({ planner, addTop, x: x + 18, z: z + 28, width: 74, rows: 2, material: 'concrete', roof: 'slate', rng, neon: true, tag: 'maginhawa-shop-row' });
  addTop('graffiti', x + 58, z + 28, 18, 3.4, 0.4, 0xf25fa7, 0, topY(x + 58, z + 28) + 3.2);
  addTop('gold', x - 66, z + 16, 22, 0.5, 22, 0xd8a334, 0, topY(x - 66, z + 16) + 0.3);
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2;
    addTop('gold', x - 66 + Math.cos(angle) * 9, z + 16 + Math.sin(angle) * 9, 1.8, 0.32, 1.8, 0xd8a334, angle, topY(x - 66, z + 16) + 0.65);
  }
  addTop('limestone', x - 66, z + 16, 3.8, 13, 3.8, 0xd8cfb7);
  addTop('gold', x - 66, z + 16, 4.5, 0.8, 4.5, 0xd8a334, 0, topY(x - 66, z + 16) + 13);
  addTop('concrete', x + 86, z + 42, 18, 9, 18, 0x8b8d88);
  buildMarketStalls(addTop, x - 72, z + 28, 7, 0xd94f45, rng, 0, planner);
  buildMarketStalls(addTop, x - 44, z + 64, 6, 0xf0dfb2, rng, 0, planner);
  addLabel('UP Diliman', x + 10, topY(x + 10, z - 18) + 14, z - 18);
  addLabel('Maginhawa Food Street', x - 42, topY(x - 42, z + 40) + 12, z + 40);
  addLabel('Tomas Morato / Timog', x - 28, topY(x - 28, z + 50) + 12, z + 50);
  addLabel('Araneta City', x + 86, topY(x + 86, z + 42) + 16, z + 42);
}

function buildBayArea({ planner, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('concrete', -168, 188, 88, 52, { color: '#8b8d88', height: 0.14, tile: 3.4 });
  addTop('glass', -146, 174, 16, 22, 16, 0x9cc8c8);
  addTop('glass', -182, 182, 14, 19, 14, 0x9cc8c8);
  addTop('limestone', -170, 210, 44, 8, 20, 0xd8cfb7);
  addTop('gold', -170, 210, 46, 0.9, 22, 0xd8a334, 0, topY(-170, 210) + 8);
  addTop('gold', -210, 202, 7, 7, 7, 0xd8a334);
  addTop('steel', -226, 178, 34, 0.65, 4.2, 0x66727a, 0.04, topY(-226, 178) + 1.3);
  addTop('wood', -238, 178, 12, 0.5, 7, 0x7a4d30, 0.04, topY(-238, 178) + 0.8);
  for (let i = 0; i < 7; i += 1) {
    addTop('steel', -272 + i * 8, 156, 5.6, 3.4, 3.6, i % 2 ? 0x66727a : 0xd94f45);
    addTop('wood', -274 + i * 7, 146, 4.8, 0.36, 16, 0x7a4d30, 0.04, topY(-274 + i * 7, 146) + 0.55);
  }
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const x = -258 + col * 6.4;
      const z = 132 + row * 5.2;
      if (isWater(x, z, 1.4)) continue;
      addTop(row % 2 ? 'steel' : 'brick', x, z, 5.2, 2.0 + (col % 2) * 0.9, 3.8, col % 3 === 0 ? 0xd94f45 : col % 3 === 1 ? 0x48d9ff : 0x66727a);
    }
  }
  for (let i = 0; i < 3; i += 1) {
    const x = -248 + i * 22;
    addTop('steel', x, 142, 1.2, 15, 1.2, 0x66727a);
    addTop('steel', x + 5.4, 134, 14, 0.8, 1.2, 0x66727a, -0.35, topY(x, 142) + 13.4);
    addTop('gold', x + 10.8, 130, 1.8, 1.8, 1.8, 0xd8a334, 0, topY(x, 142) + 12.8);
  }
  for (let i = 0; i < 5; i += 1) {
    const dockX = -266 + i * 11;
    addTop('wood', dockX, 118, 10, 0.42, 4.8, 0x7a4d30, 0.04, topY(dockX, 118) + 0.5);
    addTop('steel', dockX, 118, 6, 1.1, 2.8, 0x66727a, 0.04, topY(dockX, 118) + 1.0);
  }
  addTop('limestone', -218, 226, 48, 0.7, 2.0, 0xd8cfb7, -0.12, topY(-218, 226) + 0.3);
  for (let i = 0; i < 18; i += 1) {
    const personX = -210 + rng() * 84;
    const personZ = 160 + rng() * 62;
    if (plannerFootprintBlocked(planner, personX, personZ, 2.4, 2.4, 0.6)) continue;
    const placed = addStaticPerson(addTop, personX, personZ, i % 3 === 0 ? 'cloth' : 'crowd', 0.82);
    if (placed > 0) planner?.reserveRect(`bay-area-crowd-${i}`, personX, personZ, 2.8, 2.8, { force: true, type: 'detail' });
  }
  addLabel('Pasay / Bay Area', -168, topY(-168, 188) + 24, 188);
}

function buildLocalDistrict({ planner, addTop, addTiledRect, addLabel, x, z, label, rng, industrial = false }) {
  addTiledRect('concrete', x, z, 62, 38, { color: industrial ? '#777a76' : '#8b8d88', height: 0.13, tile: 3.4 });
  for (let i = 0; i < 15; i += 1) {
    const bx = x - 26 + (i % 5) * 13;
    const bz = z - 14 + Math.floor(i / 5) * 12;
    if (isWater(bx, bz, 3.2)) continue;
    if (planner) {
      if (!canPlaceUrbanParcel(planner, bx, bz, 8.5, 7.4, 1.1)) continue;
      if (!planner.reserveRect(`${label}-block-${i}`, bx, bz, 9.7, 8.6, { type: 'building' })) continue;
    }
    addTop(industrial && i % 3 === 0 ? 'steel' : 'concrete', bx, bz, 8.5, 4.4 + rng() * 4, 7.4, industrial ? 0x66727a : 0x8b8d88);
    if (i % 4 === 0) addTop('cloth', bx, bz - 4, 5.5, 0.6, 0.35, 0xd94f45, 0, topY(bx, bz) + 3.2);
  }
  addBasketballCourt({ planner, addTop, x: x + 20, z: z + 18 });
  addLabel(label, x, topY(x, z) + 12, z);
}

function buildPortAndFishMarket({ planner, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('concrete', -218, -118, 62, 42, { color: '#777a76', height: 0.13, tile: 3.4 });
  for (let i = 0; i < 4; i += 1) {
    const pierX = -252 + i * 13;
    addTop('wood', pierX, -104, 9, 0.55, 30, 0x7a4d30, 0.02, topY(pierX, -104) + 0.5);
    addTop('steel', pierX + 2, -124, 2, 12, 2, 0x66727a);
    addTop('steel', pierX + 8, -132, 12, 0.8, 1.2, 0x66727a, -0.35, topY(pierX + 8, -132) + 11.2);
  }
  for (let i = 0; i < 14; i += 1) {
    const x = -210 + (i % 7) * 7;
    const z = -132 + Math.floor(i / 7) * 7;
    if (isWater(x, z, 2.4) || footprintTouchesRoad(x, z, 5.4, 4.2, 1.2)) continue;
    addTop(i % 2 ? 'steel' : 'cloth', x, z, 5.4, 2.8, 4.2, i % 2 ? 0x66727a : 0xf0dfb2);
    if (i % 3 === 0) addStaticPerson(addTop, x - 2, z + 6, 'crowd', 0.8);
  }
  for (let i = 0; i < 9; i += 1) {
    addTop('steel', -236 + i * 7, -92, 4.8, 2.6, 3.6, i % 2 ? 0x66727a : 0xd94f45);
  }
  buildMarketStalls(addTop, -194, -94, 7, 0x48d9ff, rng, 0, planner);
  addLabel('Port and Fish Market', -218, topY(-218, -118) + 13, -118);
}

function buildLaLomaGrillDistrict({ planner, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('concrete', -32, -188, 50, 30, { color: '#777a76', height: 0.13, tile: 3.4 });
  for (let i = 0; i < 10; i += 1) {
    const x = -52 + (i % 5) * 10;
    const z = -198 + Math.floor(i / 5) * 14;
    addTop('brick', x, z, 7.2, 4.6, 6.2, 0x9f583d);
    addTop('cloth', x, z - 3.4, 6.2, 0.5, 0.35, i % 2 ? 0xd94f45 : 0xd8a334, 0, topY(x, z) + 3.4);
    addTop('shadow', x + 2.6, z + 4.1, 1.4, 3.8 + rng() * 2, 1.4, 0x2e2924);
    if (i % 2 === 0) addStaticPerson(addTop, x - 2, z + 4.2, 'crowd', 0.82);
  }
  buildMarketStalls(addTop, -18, -178, 5, 0xf0dfb2, rng, 0, planner);
  addLaLomaStreetLife(addTop, rng);
  addLabel('La Loma Grill District', -32, topY(-32, -188) + 12, -188);
}

function addLaLomaStreetLife(addTop, rng) {
  for (let i = 0; i < 9; i += 1) {
    const x = -54 + i * 7.4;
    const z = -173 + (i % 2) * 4.2;
    if (isWater(x, z, 1.5) || isRoadDeck(x, z, 3.0) || footprintTouchesRoad(x, z, 4.6, 3.0, 4.0)) continue;
    addTop('gold', x, z, 0.24, 2.8, 0.24, 0xd8a334);
    addTop('neon', x, z, 0.82, 0.36, 0.82, 0xf0dfb2, 0, topY(x, z) + 2.55);
    addTop('wood', x + 2.4, z + 1.6, 2.8, 0.42, 1.1, 0x7a4d30, 0.08);
    if (i % 2 === 0) addStaticPerson(addTop, x - 1.4 + rng() * 1.2, z + 2.8, i % 3 === 0 ? 'cloth' : 'crowd', 0.8);
  }
}

function buildSouthernCoast({ planner, addTop, addTiledRect, addLabel, rng }) {
  addTop('limestone', -144, 268, 20, 8, 16, 0xd8cfb7);
  addTop('gold', -144, 268, 22, 0.9, 18, 0xd8a334, 0, topY(-144, 268) + 8);
  buildMarketStalls(addTop, -118, 248, 6, 0xd94f45, rng, 0, planner);
  addTop('wood', -100, 288, 0.6, 14, 0.6, 0x7a4d30);
  addTop('gold', -100, 288, 6.5, 0.8, 6.5, 0xd8a334, 0, topY(-100, 288) + 13.2);
  addLabel('Paranaque / Las Pinas', -138, topY(-138, 272) + 12, 272);
}

function buildMarikina({ planner, addTop, addTiledRect, addLabel, rng }) {
  addTiledRect('manilaGrass', 268, -114, 62, 42, { color: '#4f8750', height: 0.12, tile: 3.4 });
  for (let x = 234; x <= 302; x += 8.5) {
    addTop('water', x, -132, 8.6, 0.15, 8.2, 0x3f91aa, 0, 0.6);
  }
  addTop('steel', 286, -132, 22, 0.52, 4.6, 0x66727a, 0, topY(286, -132) + 1.2);
  addTop('asphalt', 286, -132, 18, 0.16, 3.2, 0x34383d, 0, topY(286, -132) + 1.7);
  buildShopRows({ planner, addTop, x: 268, z: -94, width: 58, rows: 2, material: 'concrete', roof: 'gold', rng, tag: 'marikina-shop-row' });
  addTop('gold', 288, -98, 3.2, 5.2, 8, 0xd8a334);
  buildPath(addTop, [[236, -124], [286, -116], [302, -88]], 2.6, 'cobblestone');
  addTop('cloth', 292, -98, 7.5, 1.0, 0.4, 0x48d9ff, 0, topY(292, -98) + 4.6);
  addTop('limestone', 252, -104, 18, 5.8, 10, 0xd8cfb7);
  addTop('neonCyan', 252, -109.4, 10, 0.64, 0.28, 0x48d9ff, 0, topY(252, -104) + 4.4);
  for (let i = 0; i < 10; i += 1) {
    addStaticPerson(addTop, 240 + rng() * 54, -118 + rng() * 18, i % 2 ? 'cloth' : 'crowd', 0.78);
  }
  addLabel('Marikina River Park', 268, topY(268, -114) + 10, -114);
}

function buildShopRows({ planner = null, addTop, x, z, width, rows, material, roof, rng, lanterns = false, neon = false, tag = 'shop-row' }) {
  const cols = Math.max(3, Math.floor(width / 11));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const bx = x - width / 2 + 6 + col * (width / cols);
      const bz = z - rows * 4 + row * 9;
      if (isWater(bx, bz, 3.2)) continue;
      if (planner) {
        if (!canPlaceUrbanParcel(planner, bx, bz, 8.4, 6.4, 0.9)) continue;
        if (!planner.reserveRect(`${tag}-${row}-${col}`, bx, bz, 9.4, 7.4, { type: 'building' })) continue;
      }
      addTop(material, bx, bz, 8.4, 4.2 + rng() * 2.2, 6.4, material === 'brick' ? 0x9f583d : 0x8b8d88);
      addTop(roof, bx, bz, 8.8, 0.65, 6.8, roof === 'gold' ? 0xd8a334 : 0x5c6268, 0, topY(bx, bz) + 4.4);
      if (lanterns && col % 2 === 0) addTop('neonPink', bx, bz - 3.6, 1.2, 1.2, 0.3, 0xf25fa7, 0, topY(bx, bz) + 3.2);
      if (neon && col % 2 === 1) addTop('neonCyan', bx, bz - 3.6, 4.2, 0.8, 0.3, 0x48d9ff, 0, topY(bx, bz) + 3.1);
    }
  }
}

function buildPath(addTop, points, width, material = 'cobblestone') {
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length <= 0.01) continue;
    const yaw = Math.atan2(dx, dz);
    const steps = Math.max(1, Math.ceil(length / 5.4));
    for (let step = 0; step < steps; step += 1) {
      const t = (step + 0.5) / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      if (isWater(x, z, -0.8)) continue;
      addTop(material, x, z, width, 0.13, length / steps + 0.45, material === 'asphalt' ? 0x3f4243 : 0x77766d, yaw, topY(x, z) + 0.03);
    }
  }
}

function addStaticPerson(addTop, x, z, body = 'crowd', scale = 1) {
  if (
    isWater(x, z, 1.2) ||
    isRoadRouteSurface(x, z, 0.75) ||
    footprintTouchesRoad(x, z, 2.2 * scale, 2.2 * scale, 2.0) ||
    actorSolidZoneContains(x, z, 0.45) ||
    publicRealmFootprintBlocked(x, z, 2.0 * scale, 2.0 * scale, 0.3)
  ) return 0;
  const base = topY(x, z) + 0.05;
  addTop(body, x, z, 0.52 * scale, 0.92 * scale, 0.38 * scale, body === 'cloth' ? 0xf0dfb2 : 0xc57b54, 0, base);
  addTop('skin', x, z, 0.36 * scale, 0.34 * scale, 0.36 * scale, 0xb47a54, 0, base + 0.88 * scale);
  return 2;
}

function buildMarketStalls(addTop, x, z, count, color, rng, yaw = 0, planner = null) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  for (let i = 0; i < count; i += 1) {
    const lx = (i - (count - 1) / 2) * 4.4;
    const lz = (i % 2) * 4.8;
    const sx = x + lx * cos + lz * sin;
    const sz = z - lx * sin + lz * cos;
    if (isWater(sx, sz, 1.5)) continue;
    if (
      footprintTouchesRoad(sx, sz, 4.2, 3.2, 0.8) ||
      publicRealmFootprintBlocked(sx, sz, 4.2, 3.2, 0.25) ||
      plannerFootprintBlocked(planner, sx, sz, 4.2, 3.2, 0.35)
    ) continue;
    planner?.reserveRect(`market-stall-${sx.toFixed(1)}-${sz.toFixed(1)}`, sx, sz, 5.2, 4.4, { force: true, type: 'detail' });
    addTop('wood', sx, sz, 3.2, 1.05, 2.4, 0x7a4d30, yaw);
    addTop('cloth', sx, sz, 3.8, 0.32, 2.8, color, yaw, topY(sx, sz) + 1.0);
    if (i % 2 === 0) addStaticPerson(addTop, sx + (rng() - 0.5) * 2.8, sz + 3.4, i % 4 === 0 ? 'cloth' : 'crowd', 0.86);
  }
}

function addBasketballCourt({ planner = null, addTop, x, z }) {
  const candidates = [
    [x, z],
    [x + 12, z + 8],
    [x - 12, z - 8],
    [x + 14, z - 6],
    [x - 14, z + 6]
  ];
  const placement = candidates.find(([cx, cz]) => (
    !isWater(cx, cz, 4) &&
    !footprintTouchesRoad(cx, cz, 18, 12, 2.4) &&
    !plannerFootprintBlocked(planner, cx, cz, 18, 12, 0.5)
  ));
  if (!placement) return 0;
  const [courtX, courtZ] = placement;
  planner?.reserveRect(`basketball-court-${courtX.toFixed(1)}-${courtZ.toFixed(1)}`, courtX, courtZ, 20, 14, { force: true, type: 'detail' });
  addTop('concrete', courtX, courtZ, 18, 0.14, 12, 0x777a76);
  addTop('gold', courtX - 8, courtZ, 0.4, 4, 0.4, 0xd8a334);
  addTop('gold', courtX + 8, courtZ, 0.4, 4, 0.4, 0xd8a334);
  addTop('cloth', courtX, courtZ, 14, 0.18, 0.35, 0xd94f45, 0, topY(courtX, courtZ) + 0.24);
  return 4;
}

function buildConnectedCityFabric({ planner, addTop, addTiledRect, addLabel, rng }) {
  let count = 0;

  for (const mat of CITY_SURFACE_MATS) {
    addTiledRect(mat.kind, mat.x, mat.z, mat.width, mat.depth, {
      color: mat.color,
      height: 0.08,
      tile: mat.tile,
      baseOffset: -0.035
    });
    count += Math.floor((mat.width * mat.depth) / 120);
  }

  for (const zone of CITY_FABRIC_ZONES) {
    count += buildDistrictStreetGrid({ planner, addTop, zone, rng });
  }

  count += buildHistoricCivicConnectors({ planner, addTop, rng });
  count += buildOldManilaParcelFrontages({ planner, addTop, addLabel, rng });
  count += buildReclaimedPortSystem({ planner, addTop, rng });
  count += buildNavotasMalabonPortSpine({ planner, addTop, addLabel, rng });
  count += buildMetroConnectorStreets({ planner, addTop });
  return count;
}

function buildDistrictStreetGrid({ planner, addTop, zone, rng }) {
  let count = 0;
  const minX = zone.x - (zone.cols * zone.stepX) / 2;
  const maxX = zone.x + (zone.cols * zone.stepX) / 2;
  const minZ = zone.z - (zone.rows * zone.stepZ) / 2;
  const maxZ = zone.z + (zone.rows * zone.stepZ) / 2;

  for (let row = 0; row <= zone.rows; row += 1) {
    const z = minZ + row * zone.stepZ;
    count += addLocalStreet({ planner, addTop, points: [[minX - 8, z], [maxX + 8, z]], width: 3.0, material: zone.material === 'brick' ? 'cobblestone' : 'asphalt' });
  }

  for (let col = 0; col <= zone.cols; col += 1) {
    const x = minX + col * zone.stepX;
    count += addLocalStreet({ planner, addTop, points: [[x, minZ - 8], [x, maxZ + 8]], width: 2.8, material: 'asphalt' });
  }

  for (let row = 0; row < zone.rows; row += 1) {
    for (let col = 0; col < zone.cols; col += 1) {
      const x = minX + (col + 0.5) * zone.stepX + (rng() - 0.5) * 1.2;
      const z = minZ + (row + 0.5) * zone.stepZ + (rng() - 0.5) * 1.2;
      const width = zone.width * (0.82 + rng() * 0.26);
      const depth = zone.depth * (0.82 + rng() * 0.26);
      if (!canPlaceUrbanParcel(planner, x, z, width, depth, 1.4)) continue;
      if (!planner.reserveRect(`${zone.name}-${row}-${col}`, x, z, width + 1.0, depth + 1.0, { type: 'building' })) continue;
      const height = zone.height[0] + rng() * (zone.height[1] - zone.height[0]);
      const material = resolveFabricMaterial(zone, height, rng);
      const yaw = (rng() - 0.5) * 0.08;
      addTop(material, x, z, width, height, depth, materialColor(material, rng), yaw);
      addTop(height > 12 ? 'steel' : 'slate', x, z, width + 0.5, 0.42, depth + 0.5, height > 12 ? 0x66727a : 0x5c6268, yaw, topY(x, z) + height);
      addTop(zone.accent, x, z - depth / 2 - 0.22, width * 0.62, 0.4, 0.22, accentColor(zone.accent, rng), yaw, topY(x, z) + Math.min(4.8, height * 0.58));
      if (rng() > 0.72) addLaundryLines(addTop, null, x + width * 0.18, z + depth / 2 + 0.6, width * 0.62, yaw);
      count += 3;
    }
  }

  return count;
}

function addLocalStreet({ planner, addTop, points, width, material = 'asphalt' }) {
  let count = 0;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    if (localStreetTouchesReservedFootprint(planner, ax, az, bx, bz, width) || isWater(mx, mz, 1.0)) continue;
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / 3.2));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      if (!planner.hasPoint(x, z, 'road') && !localStreetPointTouchesReservedFootprint(planner, x, z)) {
        planner.reserveRect(`local-street-${x.toFixed(1)}-${z.toFixed(1)}`, x, z, width + 5.6, width + 5.6, { force: true, type: 'road' });
      }
    }
    buildPath(addTop, [points[i - 1], points[i]], width, material);
    count += Math.ceil(length / 10);
  }
  return count;
}

function localStreetTouchesReservedFootprint(planner, ax, az, bx, bz, width) {
  const dx = bx - ax;
  const dz = bz - az;
  const length = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(length / 4.5));
  const nx = length > 0.001 ? -dz / length : 0;
  const nz = length > 0.001 ? dx / length : 0;
  const edgePad = Math.max(width * 0.58, 1.8);
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = ax + dx * t;
    const z = az + dz * t;
    if (localStreetPointTouchesReservedFootprint(planner, x, z)) return true;
    if (localStreetPointTouchesReservedFootprint(planner, x + nx * edgePad, z + nz * edgePad)) return true;
    if (localStreetPointTouchesReservedFootprint(planner, x - nx * edgePad, z - nz * edgePad)) return true;
  }
  return false;
}

function localStreetPointTouchesReservedFootprint(planner, x, z) {
  return planner.hasPoint(x, z, 'landmark') || planner.hasPoint(x, z, 'building') || planner.hasPoint(x, z, 'detail');
}

function canPlaceUrbanParcel(planner, x, z, width, depth, roadPad = 1.2) {
  if (footprintTouchesWater(x, z, width, depth, 3.0) || footprintTouchesRoad(x, z, width, depth, roadPad)) return false;
  return planner.canPlaceRect(x, z, width, depth);
}

function resolveFabricMaterial(zone, height, rng) {
  if (height > 18) return rng() > 0.34 ? 'glass' : 'concrete';
  if (zone.material === 'brick') return rng() > 0.2 ? 'brick' : 'concrete';
  if (zone.material === 'steel') return rng() > 0.38 ? 'steel' : 'concrete';
  if (zone.material === 'glass') return rng() > 0.35 ? 'glass' : 'concrete';
  return rng() > 0.72 ? 'brick' : 'concrete';
}

function materialColor(material, rng) {
  if (material === 'brick') return rng() > 0.5 ? 0x9f583d : 0xb96038;
  if (material === 'glass') return rng() > 0.5 ? 0x9cc8c8 : 0x88bfc6;
  if (material === 'steel') return 0x66727a;
  if (material === 'limestone') return 0xd8cfb7;
  return rng() > 0.5 ? 0x8b8d88 : 0x9a9b94;
}

function buildHistoricCivicConnectors({ planner, addTop, rng }) {
  let count = 0;
  count += addLocalStreet({ planner, addTop, points: [[-82, -54], [-82, -18], [-96, 18], [-112, 50], [-112, 72], [-118, 112]], width: 4.2, material: 'cobblestone' });
  count += addLocalStreet({ planner, addTop, points: [[-84, 70], [-54, 82], [-32, 90]], width: 3.8, material: 'asphalt' });
  count += addLocalStreet({ planner, addTop, points: [[-138, 38], [-112, 50], [-76, 52], [-46, 60]], width: 3.4, material: 'cobblestone' });
  count += addLocalStreet({ planner, addTop, points: [[-132, -44], [-110, -24], [-82, -18], [-62, -8]], width: 3.2, material: 'cobblestone' });

  for (const [x, z, width, depth] of [
    [-82, -5, 22, 16],
    [-108, 42, 24, 10],
    [-58, 62, 22, 10],
    [-112, 100, 36, 8],
    [-54, 64, 20, 10]
  ]) {
    if (isWater(x, z, 1.5) || planner.hasPoint(x, z, 'landmark')) continue;
    addTop('cobblestone', x, z, width, 0.11, depth, 0x77766d, 0, topY(x, z) + 0.035);
    for (let i = 0; i < Math.max(2, Math.floor(width / 8)); i += 1) {
      const px = x - width / 2 + 4 + i * 8;
      addTop('gold', px, z - depth / 2 + 1.2, 0.26, 3.2, 0.26, 0xd8a334);
      addTop('neon', px, z - depth / 2 + 1.2, 0.78, 0.35, 0.78, 0xf0dfb2, 0, topY(px, z) + 2.95);
      if (i % 2 === 0) addStaticPerson(addTop, px + (rng() - 0.5) * 2, z + 1.8 + rng() * 3.0, 'crowd', 0.78);
      count += 3;
    }
    count += 1;
  }

  for (let i = 0; i < 9; i += 1) {
    const z = 44 + i * 7.6;
    addTop('vegetation', -144, z, 2.1, 3.4, 2.1, 0x4f8750);
    addTop('vegetation', -78, z, 2.1, 3.4, 2.1, 0x4f8750);
    count += 2;
  }

  return count;
}

function buildOldManilaParcelFrontages({ planner, addTop, addLabel, rng }) {
  let count = 0;
  const frontages = [
    { name: 'Ongpin food alley', points: [[-98, -112], [-76, -116], [-54, -112], [-34, -106]], side: -1, accent: 'neonPink', material: 'brick' },
    { name: 'Escolta heritage frontage', points: [[-82, -66], [-58, -66], [-32, -68], [-12, -74]], side: 1, accent: 'neonCyan', material: 'limestone' },
    { name: 'Avenida book row', points: [[-18, -156], [4, -158], [28, -154], [50, -146]], side: -1, accent: 'gold', material: 'concrete' },
    { name: 'Recto cinema row', points: [[-24, -178], [4, -180], [32, -174], [58, -164]], side: 1, accent: 'neonPink', material: 'concrete' },
    { name: 'Quiapo market lane', points: [[-12, -142], [8, -140], [30, -136], [46, -126]], side: 1, accent: 'cloth', material: 'concrete' }
  ];

  for (const frontage of frontages) {
    for (let i = 1; i < frontage.points.length; i += 1) {
      const [ax, az] = frontage.points[i - 1];
      const [bx, bz] = frontage.points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.hypot(dx, dz);
      const nx = (-dz / length) * frontage.side;
      const nz = (dx / length) * frontage.side;
      count += addLocalStreet({ planner, addTop, points: [frontage.points[i - 1], frontage.points[i]], width: 2.8, material: 'asphalt' });
      const parcels = Math.max(2, Math.floor(length / 6));
      for (let p = 0; p < parcels; p += 1) {
        const t = (p + 0.5) / parcels;
        const x = ax + dx * t + nx * 5.0;
        const z = az + dz * t + nz * 5.0;
        const width = 4.4 + rng() * 2.0;
        const depth = 4.8 + rng() * 1.8;
        if (!canPlaceUrbanParcel(planner, x, z, width, depth, 0.9)) continue;
        if (!planner.reserveRect(`${frontage.name}-${i}-${p}`, x, z, width + 0.8, depth + 0.8, { type: 'building' })) continue;
        const height = 4 + rng() * 4.5;
        addTop(frontage.material, x, z, width, height, depth, materialColor(frontage.material, rng), 0);
        addTop('slate', x, z, width + 0.4, 0.34, depth + 0.4, 0x5c6268, 0, topY(x, z) + height);
        addTop(frontage.accent, x - nx * (width / 2 + 0.12), z - nz * (depth / 2 + 0.12), Math.min(4.2, width * 0.78), 0.46, 0.22, accentColor(frontage.accent, rng), 0, topY(x, z) + Math.min(3.8, height * 0.6));
        if (frontage.name.includes('cinema') && p % 2 === 0) addTop('neon', x, z - depth / 2 - 0.28, width * 0.9, 1.1, 0.26, 0xd8a334, 0, topY(x, z) + 3.1);
        if (frontage.name.includes('book')) addTop('wood', x + width / 2 + 0.4, z, 1.2, 1.2, depth * 0.72, 0x7a4d30, 0, topY(x, z) + 0.6);
        if (p % 2 === 0) addStaticPerson(addTop, x - nx * 3.8, z - nz * 3.8, p % 3 === 0 ? 'cloth' : 'crowd', 0.78);
        count += 5;
      }
    }
  }

  addLabel('Ongpin Food Alleys', -64, topY(-64, -112) + 10, -112);
  addLabel('Avenida / Recto Book Row', 18, topY(18, -160) + 10, -160);
  addLabel('Quiapo Underpass Market', 26, topY(26, -136) + 10, -136);

  return count;
}

function buildReclaimedPortSystem({ planner, addTop, rng }) {
  let count = 0;
  addTop('concrete', -202, -116, 58, 0.11, 64, 0x777a76, 0, topY(-202, -116) + 0.025);
  for (let i = 0; i < 5; i += 1) {
    const z = -148 + i * 15;
    count += addLocalStreet({ planner, addTop, points: [[-230, z], [-176, z]], width: 3.4, material: 'asphalt' });
  }
  for (let i = 0; i < 6; i += 1) {
    const x = -224 + i * 9.2;
    const z = -138 + (i % 3) * 18;
    if (!canPlaceUrbanParcel(planner, x, z, 6.2, 7.0, 0.8)) continue;
    planner.reserveRect(`port-cold-storage-${i}`, x, z, 7.4, 8.2, { type: 'building' });
    addTop(i % 2 ? 'steel' : 'concrete', x, z, 6.2, 4.2 + rng() * 2.4, 7.0, i % 2 ? 0x66727a : 0x8b8d88);
    addTop('cloth', x, z - 3.7, 4.6, 0.5, 0.24, i % 2 ? 0x48d9ff : 0xf0dfb2, 0, topY(x, z) + 2.6);
    count += 3;
  }
  for (let i = 0; i < 9; i += 1) {
    const x = -232 - (i % 3) * 8.5;
    const z = -134 + Math.floor(i / 3) * 20;
    addTop('wood', x, z, 14, 0.44, 3.2, 0x7a4d30, 0.03, topY(x, z) + 0.42);
    addTop('steel', x - 4, z, 2.6, 1.2, 2.0, 0x66727a, 0.03, topY(x, z) + 0.92);
    count += 2;
  }
  return count;
}

function buildNavotasMalabonPortSpine({ planner, addTop, addLabel, rng }) {
  let count = 0;
  count += addLocalStreet({ planner, addTop, points: [[-176, -232], [-146, -220], [-118, -198], [-88, -170], [-68, -146]], width: 4.4, material: 'asphalt' });
  count += addLocalStreet({ planner, addTop, points: [[-228, -118], [-198, -132], [-166, -154], [-140, -184]], width: 4.2, material: 'asphalt' });

  for (let i = 0; i < 14; i += 1) {
    const x = -184 + (i % 7) * 10.4;
    const z = -224 + Math.floor(i / 7) * 18;
    if (canPlaceDetailFootprint(x, z, 6.4, 4.6, { roadPad: 0.4, waterPad: 1.4 }) && !planner.hasPoint(x, z, 'building')) {
      addTop('wood', x, z, 6.2, 1.0, 4.2, 0x7a4d30);
      addTop('cloth', x, z - 2.4, 6.8, 0.38, 4.8, i % 2 ? 0x48d9ff : 0xf0dfb2, 0, topY(x, z) + 0.95);
      addTop('steel', x + 2.7, z + 1.8, 1.2, 1.2, 1.8, 0x66727a, 0, topY(x, z) + 0.9);
      if (i % 2 === 0) addStaticPerson(addTop, x - 2.4, z + 3.2, 'crowd', 0.78);
      count += 4;
    }
  }

  for (let i = 0; i < 10; i += 1) {
    const x = -132 + (i % 5) * 11.2;
    const z = -188 + Math.floor(i / 5) * 16;
    if (!canPlaceUrbanParcel(planner, x, z, 6.4, 7.0, 0.8)) continue;
    if (!planner.reserveRect(`malabon-shop-house-${i}`, x, z, 7.6, 8.2, { type: 'building' })) continue;
    const h = 4.2 + rng() * 3.4;
    addTop(i % 2 ? 'brick' : 'concrete', x, z, 6.4, h, 7.0, i % 2 ? 0x9f583d : 0x8b8d88);
    addTop('slate', x, z, 6.9, 0.38, 7.5, 0x5c6268, 0, topY(x, z) + h);
    addTop(i % 2 ? 'neonCyan' : 'gold', x, z - 3.7, 4.4, 0.5, 0.24, i % 2 ? 0x48d9ff : 0xd8a334, 0, topY(x, z) + 3.2);
    count += 3;
  }

  for (let i = 0; i < 7; i += 1) {
    const x = -226 + i * 8.4;
    const z = -104 + (i % 2) * 10;
    if (isWater(x, z, 0.8) && !isReclaimedPortLand(x, z, 0)) {
      addTop('wood', x, z, 9.5, 0.42, 2.7, 0x7a4d30, 0.02, topY(x, z) + 0.36);
      addTop('steel', x + 2.4, z, 2.4, 1.0, 1.6, 0x66727a, 0, topY(x, z) + 0.82);
      count += 2;
    }
  }

  addBasketballCourt({ planner, addTop, x: -88, z: -184 });
  addTop('limestone', -92, -202, 9.2, 4.8, 7.2, 0xd8cfb7);
  addTop('gold', -92, -205.8, 6.2, 0.45, 0.28, 0xd8a334, 0, topY(-92, -202) + 3.5);
  addLabel('Navotas Fish Market', -156, topY(-156, -216) + 9, -216);
  addLabel('Malabon Riverside Streets', -98, topY(-98, -184) + 9, -184);
  return count + 8;
}

function buildMetroConnectorStreets({ planner, addTop }) {
  let count = 0;
  count += addLocalStreet({
    planner,
    addTop,
    points: [[-204, 250], [-184, 262], [-164, 280], [-126, 286]],
    width: 4.2,
    material: 'asphalt'
  });
  return count;
}

function buildLayeredCityLife({ planner, addTop, addTiledRect, addLabel, reserveDetail, rng }) {
  let details = 0;
  details += buildOldManilaFineGrain({ planner, addTop, reserveDetail, rng });
  details += buildPoblacionAndNightlife({ planner, addTop, addTiledRect, addLabel, reserveDetail, rng });
  details += buildCorporateAfterWorkLayer({ planner, addTop, rng });
  details += buildQuezonCreativeLayer({ planner, addTop, addLabel, reserveDetail, rng });
  details += buildWaterfrontAndPortLayer({ planner, addTop, addLabel, rng });
  details += buildEverydayCommunityLayer({ planner, addTop, addLabel, reserveDetail, rng });
  return details;
}

function canPlaceDetailFootprint(x, z, width = 4, depth = 4, options = {}) {
  if (footprintTouchesWater(x, z, width, depth, options.waterPad ?? 1.4)) return false;
  if (!options.allowRoad && footprintTouchesRoad(x, z, width, depth, options.roadPad ?? 1.4)) return false;
  return true;
}

function actorSolidZoneContains(x, z, pad = 0) {
  return zoneContainsPoint(ACTOR_SOLID_ZONES, x, z, pad);
}

function publicRealmFootprintBlocked(x, z, width, depth, pad = 0) {
  return zoneIntersectsFootprint(PUBLIC_REALM_BLOCKERS, x, z, width, depth, pad);
}

function zoneContainsPoint(zones, x, z, pad = 0) {
  return zones.some(([, cx, cz, width, depth]) => (
    x >= cx - width / 2 - pad &&
    x <= cx + width / 2 + pad &&
    z >= cz - depth / 2 - pad &&
    z <= cz + depth / 2 + pad
  ));
}

function zoneIntersectsFootprint(zones, x, z, width, depth, pad = 0) {
  return zones.some(([, cx, cz, zoneWidth, zoneDepth]) => (
    x - width / 2 - pad < cx + zoneWidth / 2 &&
    x + width / 2 + pad > cx - zoneWidth / 2 &&
    z - depth / 2 - pad < cz + zoneDepth / 2 &&
    z + depth / 2 + pad > cz - zoneDepth / 2
  ));
}

function actorRouteClear(planner, x, z, pad = 0.7, options = {}) {
  if (isWater(x, z, pad)) return false;
  if (!options.allowVehicleRoad && isRoadRouteSurface(x, z, 0.7)) return false;
  if (actorSolidZoneContains(x, z, pad)) return false;
  if (plannerPointBlocked(planner, x, z, pad)) return false;
  return true;
}

function plannerPointBlocked(planner, x, z, pad = 0.7) {
  if (!planner) return false;
  const offsets = [
    [0, 0],
    [pad, 0],
    [-pad, 0],
    [0, pad],
    [0, -pad],
    [pad * 0.7, pad * 0.7],
    [-pad * 0.7, pad * 0.7],
    [pad * 0.7, -pad * 0.7],
    [-pad * 0.7, -pad * 0.7]
  ];
  return offsets.some(([dx, dz]) => planner.hasPoint(x + dx, z + dz, 'building'));
}

function plannerFootprintBlocked(planner, x, z, width, depth, pad = 0, types = ['building', 'landmark']) {
  if (!planner) return false;
  const rect = {
    x1: x - width / 2 - pad,
    x2: x + width / 2 + pad,
    z1: z - depth / 2 - pad,
    z2: z + depth / 2 + pad
  };
  return planner.reservations.some((reserved) => (
    types.includes(reserved.type) &&
    rect.x1 < reserved.x2 &&
    rect.x2 > reserved.x1 &&
    rect.z1 < reserved.z2 &&
    rect.z2 > reserved.z1
  ));
}

function addDetailBuilding(addTop, reserveDetail, x, z, width, height, depth, material, color, yaw = 0, planner = null) {
  if (!canPlaceDetailFootprint(x, z, width, depth, { roadPad: 1.0 })) return 0;
  const reservationWidth = width + 1.8;
  const reservationDepth = depth + 1.8;
  if (planner && !planner.reserveRect(`detail-building-${x.toFixed(1)}-${z.toFixed(1)}`, x, z, reservationWidth, reservationDepth, { type: 'building' })) return 0;
  if (!planner) reserveDetail?.(x, z, reservationWidth, reservationDepth, 'building');
  addTop(material, x, z, width, height, depth, color, yaw);
  addTop(height > 9 ? 'steel' : 'slate', x, z, width + 0.5, 0.42, depth + 0.5, height > 9 ? 0x66727a : 0x5c6268, yaw, topY(x, z) + height);
  return 2;
}

function addShopfrontSign(addTop, x, z, width, color, y = 3.2, yaw = 0) {
  if (isWater(x, z, 1.4)) return 0;
  addTop('neonCyan', x, z, width, 0.62, 0.28, color, yaw, topY(x, z) + y);
  addTop('gold', x - width / 2 - 0.6, z, 0.24, 1.7, 0.24, 0xd8a334, yaw, topY(x, z) + y - 0.45);
  addTop('gold', x + width / 2 + 0.6, z, 0.24, 1.7, 0.24, 0xd8a334, yaw, topY(x, z) + y - 0.45);
  return 3;
}

function addLaundryLines(addTop, reserveDetail, x, z, width = 9, yaw = 0) {
  if (!canPlaceDetailFootprint(x, z, width, 2.2, { roadPad: 2.4 })) return 0;
  reserveDetail?.(x, z, width + 1.4, 3.4);
  addTop('wood', x - width / 2, z, 0.22, 3.1, 0.22, 0x7a4d30, yaw);
  addTop('wood', x + width / 2, z, 0.22, 3.1, 0.22, 0x7a4d30, yaw);
  addTop('cloth', x, z, width, 0.18, 0.2, 0xf0dfb2, yaw, topY(x, z) + 2.7);
  for (let i = -2; i <= 2; i += 1) {
    addTop(i % 2 ? 'cloth' : 'neonCyan', x + i * (width / 5), z + 0.2, 1.2, 0.8, 0.18, i % 2 ? 0xd94f45 : 0x48d9ff, yaw, topY(x, z) + 2.15);
  }
  return 8;
}

function addSariSariCluster(addTop, reserveDetail, x, z, rng, yaw = 0, planner = null) {
  if (!canPlaceDetailFootprint(x, z, 8, 7, { roadPad: 0.8 })) return 0;
  if (plannerFootprintBlocked(planner, x, z, 8, 7, 0.35)) return 0;
  reserveDetail?.(x, z, 9.2, 8.2);
  addTop('wood', x, z, 6.2, 2.8, 4.2, 0x7a4d30, yaw);
  addTop('cloth', x, z - 2.3, 6.8, 0.55, 0.3, rng() > 0.5 ? 0xd94f45 : 0xf0dfb2, yaw, topY(x, z) + 2.35);
  addTop('neon', x - 1.6, z - 2.55, 1.0, 1.0, 0.26, 0xd8a334, yaw, topY(x, z) + 1.35);
  addTop('neonPink', x + 1.6, z - 2.55, 1.0, 1.0, 0.26, 0xf25fa7, yaw, topY(x, z) + 1.35);
  addStaticPerson(addTop, x + 3.4, z + 1.8, 'crowd', 0.78);
  return 6;
}

function buildOldManilaFineGrain({ planner, addTop, reserveDetail, rng }) {
  let details = 0;
  for (let i = 0; i < 12; i += 1) {
    const x = -92 + i * 7.0;
    details += addShopfrontSign(addTop, x, -108, 4.8, i % 2 ? 0xf25fa7 : 0xd8a334, 3.6);
    if (i % 2 === 0) {
      addTop('neonPink', x, -112.2, 0.8, 1.2, 0.28, 0xf25fa7, 0, topY(x, -112.2) + 3.0);
      addTop('gold', x, -113.2, 1.1, 0.4, 1.1, 0xd8a334, 0, topY(x, -113.2) + 2.45);
      details += 2;
    }
    if (i % 3 === 0) addStaticPerson(addTop, x + (rng() - 0.5) * 2, -100 + rng() * 8, 'crowd', 0.82);
  }
  buildMarketStalls(addTop, -78, -122, 8, 0xd94f45, rng, 0.08, planner);
  buildMarketStalls(addTop, -34, -90, 7, 0xf0dfb2, rng, -0.12, planner);
  details += 30;

  for (let i = 0; i < 7; i += 1) {
    const x = -74 + i * 12;
    details += addDetailBuilding(addTop, reserveDetail, x, -54, 8.6, 5.2 + (i % 3) * 1.8, 5.6, i % 2 ? 'limestone' : 'brick', i % 2 ? 0xd8cfb7 : 0x9f583d, 0, planner);
    addTop('graffiti', x, -57.1, 6.8, 2.2, 0.32, i % 2 ? 0x48d9ff : 0xf25fa7, 0, topY(x, -54) + 2.2);
    details += 1;
  }
  buildMarketStalls(addTop, 12, -150, 9, 0xd8a334, rng, 0.04, planner);
  addTop('shadow', 2, -118, 42, 0.16, 8.2, 0x2e2924, 0, topY(2, -118) + 0.12);
  addTop('neon', -4, -116, 22, 0.42, 0.36, 0xf0dfb2, 0, topY(-4, -116) + 1.1);
  details += 38;
  return details;
}

function buildPoblacionAndNightlife({ planner, addTop, addTiledRect, addLabel, reserveDetail, rng }) {
  let details = 0;
  addTiledRect('concrete', 16, 30, 50, 16, { color: '#777a76', height: 0.1, tile: 3.2, baseOffset: 0.04 });
  for (let i = 0; i < 14; i += 1) {
    const x = -4 + (i % 7) * 7.2;
    const z = 18 + Math.floor(i / 7) * 13;
    details += addDetailBuilding(addTop, reserveDetail, x, z, 5.8, 4.6 + rng() * 2.8, 5.2, i % 2 ? 'brick' : 'concrete', i % 2 ? 0x9f583d : 0x8b8d88);
    details += addShopfrontSign(addTop, x, z - 2.9, 3.8, i % 3 === 0 ? 0xf25fa7 : 0x48d9ff, 3.0);
    if (i % 4 === 0) {
      addTop('shadow', x - 1.8, z - 3.15, 1.2, 2.0, 0.34, 0x2e2924, 0, topY(x, z) + 1.0);
      addStaticPerson(addTop, x + 2.8, z - 2.6, 'cloth', 0.76);
      details += 2;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    const x = 0 + i * 5.4;
    addTop(i % 2 ? 'neonPink' : 'neonCyan', x, 45, 3.0, 0.48, 0.3, i % 2 ? 0xf25fa7 : 0x48d9ff, 0, topY(x, 45) + 4.8);
    addTop('steel', x, 46.8, 1.2, 1.2, 1.2, 0x66727a, i * 0.4, topY(x, 45) + 5.2);
    details += 2;
  }
  buildMarketStalls(addTop, 34, 42, 7, 0xf25fa7, rng, -0.06, planner);
  addLabel('Poblacion Neon Alleys', 18, topY(18, 34) + 12, 34);
  return details + 24;
}

function buildCorporateAfterWorkLayer({ planner, addTop, rng }) {
  let details = 0;
  for (const [x, z, width, count, color] of [
    [58, 54, 72, 10, 0x48d9ff],
    [148, 70, 86, 12, 0xf25fa7],
    [178, 12, 66, 8, 0xd8a334]
  ]) {
    for (let i = 0; i < count; i += 1) {
      const px = x - width / 2 + i * (width / Math.max(1, count - 1));
      const pz = z + (i % 2 ? 9 : -9);
      if (isWater(px, pz, 1.5) || footprintTouchesRoad(px, pz, 5.0, 4.2, 1.0) || plannerFootprintBlocked(planner, px, pz, 5.0, 4.2, 0.35)) continue;
      planner?.reserveRect(`corporate-after-work-${px.toFixed(1)}-${pz.toFixed(1)}`, px, pz, 5.6, 4.8, { force: true, type: 'detail' });
      addTop('gold', px, pz, 0.26, 3.8, 0.26, 0xd8a334);
      addTop('neon', px, pz, 0.9, 0.42, 0.9, 0xf0dfb2, 0, topY(px, pz) + 3.45);
      if (i % 3 === 0) addStaticPerson(addTop, px + 1.8, pz + 1.2, 'cloth', 0.84);
      if (i % 4 === 0) {
        addTop('neonCyan', px, pz - 2.4, 4.4, 0.46, 0.26, color, 0, topY(px, pz) + 2.4);
      }
      details += 4;
    }
  }
  for (let i = 0; i < 9; i += 1) {
    const x = 108 + i * 10;
    addTop('graffiti', x, 91.4, 4.2, 3.8, 0.32, i % 2 ? 0xf25fa7 : 0x48d9ff, 0, topY(x, 91) + 2.5);
    details += 1;
  }
  return details;
}

function buildQuezonCreativeLayer({ planner, addTop, addLabel, reserveDetail, rng }) {
  let details = 0;
  for (let i = 0; i < 11; i += 1) {
    const x = 40 + i * 8.4;
    const z = -170 + (i % 3) * 8;
    const placed = addDetailBuilding(addTop, reserveDetail, x, z, 6.6, 4 + rng() * 2, 5.2, 'concrete', 0x8b8d88, 0, planner);
    details += placed;
    if (placed === 0) continue;
    addTop('graffiti', x, -173 + (i % 3) * 8, 5.2, 2.4, 0.3, i % 2 ? 0xf25fa7 : 0x48d9ff, 0, topY(x, -170 + (i % 3) * 8) + 2.2);
    details += 1;
  }
  if (!plannerFootprintBlocked(planner, 176, -116, 12, 8, 0.45) && !footprintTouchesRoad(176, -116, 12, 8, 1.0)) {
    planner?.reserveRect('qc-indie-stage', 176, -116, 13, 9, { force: true, type: 'detail' });
    addTop('wood', 176, -116, 10, 1.0, 6, 0x7a4d30);
    addTop('neonPink', 176, -119.2, 8.2, 0.8, 0.32, 0xf25fa7, 0, topY(176, -116) + 2.1);
    addTop('steel', 176, -112.2, 8.8, 0.42, 0.42, 0x66727a, 0, topY(176, -116) + 2.5);
  }
  for (let i = 0; i < 12; i += 1) {
    addStaticPerson(addTop, 160 + rng() * 34, -126 + rng() * 18, i % 3 === 0 ? 'cloth' : 'crowd', 0.78);
  }
  buildMarketStalls(addTop, 70, -186, 8, 0xf0dfb2, rng, -0.08, planner);
  addLabel('QC Indie Music Rooms', 176, topY(176, -116) + 10, -116);
  return details + 36;
}

function buildWaterfrontAndPortLayer({ planner, addTop, addLabel, rng }) {
  let details = 0;
  for (let i = 0; i < 18; i += 1) {
    const z = 118 + i * 8.2;
    const x = -212 + Math.sin(i * 0.7) * 3;
    if (isWater(x - 12, z, 1.5)) {
      addTop('limestone', x, z, 12, 0.56, 1.4, 0xd8cfb7, 0.08, topY(x, z) + 0.22);
      addTop('gold', x + 7.8, z + 1.1, 0.25, 2.8, 0.25, 0xd8a334);
      if (i % 3 === 0) addStaticPerson(addTop, x + 4, z + 2.4, 'crowd', 0.78);
      details += 3;
    }
  }
  details += addBaywalkSocialEdge(addTop, rng);
  for (let i = 0; i < 10; i += 1) {
    const x = -246 + i * 7.4;
    addTop('cloth', x, -88, 5.4, 0.6, 0.36, i % 2 ? 0x48d9ff : 0xf0dfb2, 0, topY(x, -88) + 2.8);
    addTop('steel', x, -84.6, 4.8, 2.8, 3.2, i % 2 ? 0x66727a : 0xd94f45);
    details += 2;
  }
  buildMarketStalls(addTop, -132, 238, 8, 0xd94f45, rng, 0.12, planner);
  addLabel('Manila Bay Sunset Promenade', -198, topY(-198, 188) + 9, 188);
  addLabel('Manila Baywalk', -214, topY(-214, 188) + 8, 188);
  return details + 24;
}

function addBaywalkSocialEdge(addTop, rng) {
  let details = 0;
  for (let i = 0; i < 12; i += 1) {
    const z = 138 + i * 10.2;
    const x = -214 + Math.sin(i * 0.56) * 2.4;
    if (isWater(x, z, 0.5) || footprintTouchesRoad(x, z, 7.2, 4.8, 0.4)) continue;
    addTop('wood', x, z, 3.8, 0.36, 1.2, 0x7a4d30, 0.04, topY(x, z) + 0.22);
    addTop('gold', x + 3.2, z - 1.2, 0.24, 3.2, 0.24, 0xd8a334);
    addTop('neon', x + 3.2, z - 1.2, 0.86, 0.36, 0.86, 0xf0dfb2, 0, topY(x, z) + 3.0);
    if (i % 3 === 0) addTop('vegetation', x - 3.4, z + 1.3, 1.8, 3.4, 1.8, 0x4f8750);
    if (i % 2 === 0) addStaticPerson(addTop, x + (rng() - 0.5) * 2.4, z + 2.0, 'crowd', 0.78);
    details += i % 3 === 0 ? 5 : 4;
  }
  return details;
}

function buildEverydayCommunityLayer({ planner, addTop, addLabel, reserveDetail, rng }) {
  let details = 0;
  for (const [x, z, label] of [
    [116, -42, 'Kapitolyo Carinderias'],
    [-116, -176, 'Barangay Side Streets'],
    [-126, 248, 'Coastal Neighborhood Streets'],
    [258, -84, 'Marikina Bike Paths'],
    [-12, -176, 'La Loma Late Food']
  ]) {
    for (let i = 0; i < 5; i += 1) {
      details += addSariSariCluster(addTop, reserveDetail, x - 18 + i * 9, z + (i % 2) * 7, rng, 0.04, planner);
      if (i % 2 === 0) details += addLaundryLines(addTop, reserveDetail, x - 16 + i * 9, z + 9, 7.4, 0.04);
    }
    addBasketballCourt({ planner, addTop, x: x + 28, z: z + 18 });
    addTop('limestone', x + 10, z - 16, 9.2, 5.2, 7.4, 0xd8cfb7);
    addTop('gold', x + 10, z - 20, 6.4, 0.5, 0.32, 0xd8a334, 0, topY(x + 10, z - 16) + 3.7);
    addLabel(label, x, topY(x, z) + 10, z);
    details += 14;
  }
  return details;
}

function buildManilaPublicRealmPolish({ planner, addTop, addTiledRect, addLabel, rng }) {
  let details = 0;
  details += buildHistoricPublicRealmPolish({ planner, addTop, addTiledRect, addLabel, rng });
  details += buildOldManilaPublicRealmPolish({ planner, addTop, addLabel, rng });
  details += buildModernPublicRealmPolish({ planner, addTop, addTiledRect, addLabel, rng });
  details += buildWaterfrontPublicRealmPolish({ planner, addTop, addLabel, rng });
  details += buildOuterDistrictPublicRealmPolish({ planner, addTop, addLabel, rng });
  return details;
}

function buildHistoricPublicRealmPolish({ planner, addTop, addTiledRect, addLabel, rng }) {
  let details = 0;
  addTiledRect('cobblestone', -88, -4, 24, 16, { color: '#77766d', height: 0.12, tile: 3.4 });
  addTiledRect('cobblestone', -118, -42, 28, 14, { color: '#77766d', height: 0.12, tile: 3.4 });
  details += 24;

  [
    [-104, -8], [-96, -8], [-88, -8], [-80, -8],
    [-124, -38], [-116, -38], [-108, -38], [-100, -38],
    [-122, 14], [-112, 20], [-96, 26], [-82, 22]
  ].forEach(([x, z], index) => {
    details += addPublicLamp(planner, addTop, x, z, index % 2 ? 0xf0dfb2 : 0xd8a334);
    if (index % 3 === 0) details += addSafeBench(planner, addTop, x + 2.4, z + 1.8, index * 0.17);
  });

  for (let i = 0; i < 9; i += 1) {
    const x = -128 + i * 7.6;
    details += addPublicRealmProp(planner, addTop, 'neon', x, -48, 1.0, 0.8, 0.28, i % 2 ? 0xf0dfb2 : 0xd8a334, 0, topY(x, -48) + 3.3, { width: 1.2, depth: 0.6 });
    details += addPublicRealmProp(planner, addTop, 'gold', x, -48, 0.22, 2.6, 0.22, 0xd8a334, 0, null, { width: 0.6, depth: 0.6 });
  }

  [
    [-128, -30], [-118, -30], [-108, -30], [-88, 4], [-78, 6], [-94, 18]
  ].forEach(([x, z], index) => {
    details += addSafeFoodCart(planner, addTop, x, z, index % 2 ? 0xd94f45 : 0xf0dfb2, index * 0.12);
    details += addStaticPerson(addTop, x + 2.0 + rng(), z + 2.2, index % 2 ? 'cloth' : 'crowd', 0.78);
  });

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const x = -122 + Math.cos(angle) * 18;
    const z = -66 + Math.sin(angle) * 13;
    details += addPublicRealmProp(planner, addTop, 'limestone', x, z, 1.2, 1.1, 1.2, 0x8b8276, angle, topY(x, z) + 6.7, { width: 1.4, depth: 1.4, allowSolid: true });
    details += addPublicRealmProp(planner, addTop, 'vegetation', x, z + 2.0, 1.4, 2.2, 1.4, 0x4f8750, 0, null, { width: 1.8, depth: 1.8 });
  }

  addTop('limestone', -111, -80, 18, 0.5, 1.0, 0xd8cfb7, 0, topY(-111, -80) + 0.3);
  addTop('gold', -119, -80, 0.28, 3.0, 0.28, 0xd8a334);
  addTop('gold', -103, -80, 0.28, 3.0, 0.28, 0xd8a334);
  details += 3;

  addLabel('Plaza Roma Courtyard Life', -88, topY(-88, -4) + 9, -4);
  addLabel('Fort Santiago Gate Plaza', -118, topY(-118, -42) + 10, -42);
  return details;
}

function buildOldManilaPublicRealmPolish({ planner, addTop, addLabel, rng }) {
  let details = 0;
  for (let i = 0; i < 12; i += 1) {
    const x = -98 + i * 5.8;
    details += addPublicRealmProp(planner, addTop, 'neonPink', x, -118, 0.9, 0.9, 0.28, 0xf25fa7, 0, topY(x, -118) + 3.4, { width: 1.2, depth: 0.8 });
    if (i % 2 === 0) details += addSafeFoodCart(planner, addTop, x + 1.8, -108, i % 4 === 0 ? 0xd94f45 : 0xf0dfb2, 0.04);
    if (i % 3 === 0) details += addStaticPerson(addTop, x + (rng() - 0.5) * 2, -104, 'crowd', 0.78);
  }

  for (let i = 0; i < 5; i += 1) {
    const x = -64 + i * 10.5;
    addTop('limestone', x, -60, 8.0 - i * 0.3, 0.55, 7.0 - i * 0.2, 0xd8cfb7, 0, topY(x, -60) + 8.8 + i * 0.72);
    details += addPublicRealmProp(planner, addTop, i % 2 ? 'neonCyan' : 'neonPink', x, -64.2, 6.6, 0.55, 0.24, i % 2 ? 0x48d9ff : 0xf25fa7, 0, topY(x, -60) + 5.8, { width: 6.8, depth: 0.8, allowSolid: true });
  }

  [
    [-54, -73, 0x48d9ff], [-42, -75, 0xf25fa7], [-30, -78, 0xd8a334],
    [-2, -146, 0xd94f45], [10, -144, 0xf0dfb2], [24, -140, 0xd8a334], [38, -132, 0xf25fa7],
    [-12, -164, 0xf0dfb2], [8, -166, 0x48d9ff], [30, -160, 0xd8a334]
  ].forEach(([x, z, color], index) => {
    details += addSafeFoodCart(planner, addTop, x, z, color, index * 0.08);
    if (index % 2 === 0) details += addStaticPerson(addTop, x + 2.4, z + 2.2, index % 3 === 0 ? 'cloth' : 'crowd', 0.78);
  });

  addLabel('Escolta Creative Reuse Facades', -44, topY(-44, -64) + 13, -64);
  addLabel('Quiapo Vendor Spillover', 20, topY(20, -142) + 10, -142);
  return details + 5;
}

function buildModernPublicRealmPolish({ planner, addTop, addTiledRect, addLabel, rng }) {
  let details = 0;
  addTiledRect('manilaGrass', 54, 104, 34, 20, { color: '#4f8750', height: 0.11, tile: 3.4 });
  details += 20;
  [
    [42, 96], [54, 98], [66, 102], [70, 116], [44, 118],
    [116, 96], [136, 106], [164, 106], [180, 96], [148, 118],
    [188, 16], [212, 16], [220, 38]
  ].forEach(([x, z], index) => {
    details += addSafePlanter(planner, addTop, x, z, index % 2 ? 0x4f8750 : 0x3f7f5f);
    if (index % 2 === 0) details += addSafeBench(planner, addTop, x + 2.2, z + 1.4, index * 0.09);
    if (index % 3 === 0) details += addStaticPerson(addTop, x - 1.4, z + 2.0, 'cloth', 0.82);
  });

  for (let i = 0; i < 9; i += 1) {
    const x = 112 + i * 8.5;
    details += addPublicRealmProp(planner, addTop, i % 2 ? 'neonPink' : 'neonCyan', x, 96, 3.2, 3.2 + (i % 3), 0.38, i % 2 ? 0xf25fa7 : 0x48d9ff, i * 0.2, topY(x, 96) + 0.5, { width: 3.6, depth: 1.0 });
    details += addPublicLamp(planner, addTop, x + 2.4, 108, 0xf0dfb2);
  }

  [
    [54, 124], [66, 124], [134, 56], [150, 56], [166, 56], [184, 26], [204, 26]
  ].forEach(([x, z], index) => {
    details += addSafeFoodCart(planner, addTop, x, z, index % 2 ? 0xf25fa7 : 0x48d9ff, 0.02);
  });

  addTop('steel', 206, 48, 38, 0.55, 5.2, 0x66727a, 0.08, topY(206, 48) + 7.2);
  addTop('neonCyan', 206, 48, 30, 0.36, 0.32, 0x48d9ff, 0.08, topY(206, 48) + 7.8);
  details += 2;

  addLabel('Ayala Triangle Cafe Walks', 54, topY(54, 104) + 11, 104);
  addLabel('BGC High Street Promenade', 148, topY(148, 104) + 13, 104);
  addLabel('Ortigas Transit Plaza', 204, topY(204, 26) + 12, 26);
  return details;
}

function buildWaterfrontPublicRealmPolish({ planner, addTop, addLabel, rng }) {
  let details = 0;
  addTop('gold', -204, 206, 8.5, 8.5, 8.5, 0xd8a334, 0, topY(-204, 206) + 4.2);
  addTop('manilaBay', -204, 206, 6.0, 6.0, 6.0, 0x3f91aa, 0, topY(-204, 206) + 4.2);
  details += 2;

  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const x = -220 + Math.cos(angle) * 11;
    const z = 232 + Math.sin(angle) * 11;
    details += addPublicRealmProp(planner, addTop, 'steel', x, z, 0.5, 3.8, 0.5, 0x66727a, angle, null, { width: 0.8, depth: 0.8, waterPad: 0.5 });
    if (i % 2 === 0) details += addPublicRealmProp(planner, addTop, 'neon', x, z, 1.2, 0.35, 1.2, 0xf0dfb2, 0, topY(x, z) + 3.7, { width: 1.2, depth: 1.2, waterPad: 0.5 });
  }
  addTop('steel', -220, 232, 23, 0.5, 0.6, 0x66727a, 0, topY(-220, 232) + 11.6);
  addTop('steel', -220, 232, 0.6, 0.5, 23, 0x66727a, 0, topY(-220, 232) + 11.6);
  details += 2;

  for (let i = 0; i < 10; i += 1) {
    const z = 142 + i * 9.4;
    const x = -216 + Math.sin(i * 0.4) * 2.2;
    details += addSafeBench(planner, addTop, x, z, 0.06);
    details += addSafePlanter(planner, addTop, x + 3.2, z + 1.8, 0x4f8750);
    if (i % 2 === 0) details += addStaticPerson(addTop, x - 2.0, z + 1.4, 'crowd', 0.78);
  }

  for (let i = 0; i < 7; i += 1) {
    const x = -250 + i * 6.4;
    details += addPublicRealmProp(planner, addTop, 'wood', x, -118, 6.6, 0.38, 2.2, 0x7a4d30, 0.04, topY(x, -118) + 0.42, { width: 6.8, depth: 2.6, waterPad: 0.3 });
    details += addPublicRealmProp(planner, addTop, 'cloth', x, -116, 4.8, 0.38, 0.3, 0x48d9ff, 0.04, topY(x, -118) + 2.0, { width: 5.0, depth: 0.8, waterPad: 0.3 });
  }

  addLabel('Bay Area Globe Plaza', -204, topY(-204, 206) + 13, 206);
  addLabel('Baywalk Family Promenade', -210, topY(-210, 188) + 9, 188);
  return details;
}

function buildOuterDistrictPublicRealmPolish({ planner, addTop, addLabel, rng }) {
  let details = 0;
  [
    [82, -128, 0xd94f45], [104, -156, 0xf0dfb2], [126, -154, 0x48d9ff],
    [160, -116, 0xf25fa7], [184, -116, 0x48d9ff],
    [246, -88, 0xd8a334], [278, -82, 0x48d9ff], [292, -78, 0xf0dfb2],
    [-54, -181, 0xd94f45], [-44, -181, 0xf0dfb2], [-34, -181, 0xd8a334],
    [-150, -228, 0x48d9ff], [-132, -220, 0xf0dfb2], [-112, -204, 0xd94f45],
    [-150, 252, 0xf0dfb2], [-132, 258, 0x48d9ff]
  ].forEach(([x, z, color], index) => {
    details += addSafeFoodCart(planner, addTop, x, z, color, index * 0.05);
    if (index % 2 === 0) details += addSafeBench(planner, addTop, x + 2.2, z + 2.6, index * 0.04);
    if (index % 3 === 0) details += addStaticPerson(addTop, x - 1.8 + rng(), z + 2.4, index % 2 ? 'cloth' : 'crowd', 0.78);
  });

  for (let i = 0; i < 8; i += 1) {
    const x = 238 + i * 8.2;
    details += addPublicRealmProp(planner, addTop, 'steel', x, -90, 0.28, 1.5, 2.4, 0x66727a, Math.PI / 2, null, { width: 2.8, depth: 0.8 });
    details += addPublicRealmProp(planner, addTop, 'gold', x, -90, 0.5, 0.5, 2.9, 0xd8a334, Math.PI / 2, topY(x, -90) + 1.4, { width: 3.0, depth: 0.8 });
  }

  addLabel('Tomas Morato Restaurant Strip', 104, topY(104, -142) + 10, -142);
  addLabel('Cubao Expo Record Shops', 174, topY(174, -116) + 10, -116);
  addLabel('Marikina Bike Racks and Shoe Market', 278, topY(278, -84) + 9, -84);
  addLabel('Navotas Market Edge', -132, topY(-132, -220) + 9, -220);
  return details;
}

function addPublicRealmProp(planner, addTop, kind, x, z, sx, sy, sz, color, yaw = 0, base = null, options = {}) {
  const width = options.width ?? Math.max(0.8, sx);
  const depth = options.depth ?? Math.max(0.8, sz);
  if (!options.allowSolid && publicRealmFootprintBlocked(x, z, width, depth, 0.35)) return 0;
  if (!options.allowSolid && plannerFootprintBlocked(planner, x, z, width, depth, 0.35)) return 0;
  if (!canPlaceDetailFootprint(x, z, width, depth, {
    roadPad: options.roadPad ?? 0.55,
    waterPad: options.waterPad ?? 0.9,
    allowRoad: options.allowRoad ?? false
  })) return 0;
  if (planner && options.blocksActors === true) {
    const reservePad = options.reservePad ?? 0.5;
    planner.reserveRect(
      `public-realm-${kind}-${x.toFixed(1)}-${z.toFixed(1)}-${sx.toFixed(1)}-${sz.toFixed(1)}`,
      x,
      z,
      width + reservePad,
      depth + reservePad,
      { force: true, type: 'detail' }
    );
  }
  addTop(kind, x, z, sx, sy, sz, color, yaw, base ?? topY(x, z));
  return 1;
}

function addPublicLamp(planner, addTop, x, z, color = 0xf0dfb2) {
  let details = 0;
  details += addPublicRealmProp(planner, addTop, 'gold', x, z, 0.24, 3.1, 0.24, 0xd8a334, 0, null, { width: 0.6, depth: 0.6 });
  details += addPublicRealmProp(planner, addTop, 'neon', x, z, 0.82, 0.36, 0.82, color, 0, topY(x, z) + 2.9, { width: 1.0, depth: 1.0 });
  return details;
}

function addSafeBench(planner, addTop, x, z, yaw = 0) {
  return addPublicRealmProp(planner, addTop, 'wood', x, z, 3.2, 0.38, 1.0, 0x7a4d30, yaw, topY(x, z) + 0.22, { width: 3.6, depth: 1.4, roadPad: 0.8, blocksActors: true });
}

function addSafePlanter(planner, addTop, x, z, color = 0x4f8750) {
  let details = 0;
  details += addPublicRealmProp(planner, addTop, 'wood', x, z, 2.4, 0.48, 2.4, 0x7a4d30, 0, topY(x, z) + 0.18, { width: 2.8, depth: 2.8, roadPad: 0.7, blocksActors: true });
  details += addPublicRealmProp(planner, addTop, 'vegetation', x, z, 1.8, 2.8, 1.8, color, 0, topY(x, z) + 0.52, { width: 2.4, depth: 2.4, roadPad: 0.7, blocksActors: true });
  return details;
}

function addSafeFoodCart(planner, addTop, x, z, color = 0xf0dfb2, yaw = 0) {
  let details = 0;
  details += addPublicRealmProp(planner, addTop, 'wood', x, z, 3.0, 1.0, 2.0, 0x7a4d30, yaw, topY(x, z) + 0.12, { width: 3.5, depth: 2.5, roadPad: 0.8, blocksActors: true });
  details += addPublicRealmProp(planner, addTop, 'cloth', x, z - Math.cos(yaw) * 1.2, 3.4, 0.34, 2.4, color, yaw, topY(x, z) + 1.05, { width: 3.8, depth: 2.8, roadPad: 0.8 });
  return details;
}

function footprintTouchesRoad(x, z, width, depth, pad = 0) {
  const xSteps = Math.max(2, Math.ceil(width / 2.4));
  const zSteps = Math.max(2, Math.ceil(depth / 2.4));
  for (let ix = 0; ix <= xSteps; ix += 1) {
    const sx = x - width / 2 + (width * ix) / xSteps;
    for (let iz = 0; iz <= zSteps; iz += 1) {
      const sz = z - depth / 2 + (depth * iz) / zSteps;
      if (isRoadDeck(sx, sz, pad)) return true;
    }
  }
  return false;
}

function buildUrbanBlocks({ planner, addTop, rng }) {
  let blocks = 0;
  for (const zone of URBAN_FILL_ZONES) {
    const attempts = Math.ceil(zone.attempts * 5);
    for (let i = 0; i < attempts; i += 1) {
      const x = zone.x + (rng() - 0.5) * zone.width;
      const z = zone.z + (rng() - 0.5) * zone.depth;
      if (isWater(x, z, 5) || planner.hasPoint(x, z)) continue;
      const compact = zone.height[1] <= 13;
      const width = compact ? 3.8 + rng() * 4.8 : 5.2 + rng() * 7.5;
      const depth = compact ? 3.8 + rng() * 4.8 : 5.2 + rng() * 7.5;
      if (footprintTouchesWater(x, z, width, depth, 4) || footprintTouchesRoad(x, z, width, depth, 2.8)) continue;
      if (!planner.reserveRect(`manila-${zone.name}-${i}`, x, z, width + 1.4, depth + 1.4, { type: 'building' })) continue;
      const height = zone.height[0] + rng() * (zone.height[1] - zone.height[0]) + blockHeightAt(x, z, rng) * 0.34;
      const material = resolveUrbanMaterial(zone, height, rng);
      addTop(material, x, z, width, height, depth, material === 'brick' ? 0x9f583d : material === 'glass' ? 0x9cc8c8 : material === 'steel' ? 0x66727a : 0x8b8d88);
      addTop(height > 13 ? 'steel' : 'slate', x, z, width + 0.7, 0.5, depth + 0.7, height > 13 ? 0x66727a : 0x5c6268, 0, topY(x, z) + height);
      if (rng() > 0.68) {
        addTop(zone.accent, x, z - depth / 2 - 0.24, width * 0.68, 0.42, 0.24, accentColor(zone.accent, rng), 0, topY(x, z) + Math.min(5.4, height * 0.58));
      }
      if (height > 18 && rng() > 0.58) {
        addTop('glass', x - width / 2 - 0.08, z, 0.24, height * 0.5, depth * 0.72, 0x9cc8c8, 0, topY(x, z) + height * 0.22);
        addTop('glass', x + width / 2 + 0.08, z, 0.24, height * 0.44, depth * 0.62, 0x9cc8c8, 0, topY(x, z) + height * 0.25);
      }
      blocks += 1;
    }
  }
  return blocks;
}

function resolveUrbanMaterial(zone, height, rng) {
  if (height > 18) return rng() > 0.35 ? 'glass' : 'concrete';
  if (zone.material === 'brick') return rng() > 0.22 ? 'brick' : 'concrete';
  if (zone.material === 'steel') return rng() > 0.42 ? 'steel' : 'concrete';
  if (zone.material === 'glass') return rng() > 0.34 ? 'glass' : 'concrete';
  return rng() > 0.68 ? 'brick' : zone.material;
}

function accentColor(kind, rng) {
  if (kind === 'neonPink') return 0xf25fa7;
  if (kind === 'neonCyan') return 0x48d9ff;
  if (kind === 'neon') return 0xd8a334;
  if (kind === 'graffiti') return rng() > 0.5 ? 0xf25fa7 : 0x48d9ff;
  if (kind === 'cloth') return rng() > 0.5 ? 0xd94f45 : 0xf0dfb2;
  return 0xd8a334;
}

function footprintTouchesWater(x, z, width, depth, pad = 0) {
  const samples = [
    [x, z],
    [x - width / 2, z - depth / 2],
    [x + width / 2, z - depth / 2],
    [x - width / 2, z + depth / 2],
    [x + width / 2, z + depth / 2],
    [x - width / 2, z],
    [x + width / 2, z],
    [x, z - depth / 2],
    [x, z + depth / 2]
  ];
  return samples.some(([sx, sz]) => isWater(sx, sz, pad));
}

function blockHeightAt(x, z, rng) {
  const business = Math.max(
    Math.exp(-(((x - 58) / 84) ** 2 + ((z - 72) / 76) ** 2)),
    Math.exp(-(((x - 148) / 90) ** 2 + ((z - 78) / 72) ** 2)),
    Math.exp(-(((x - 176) / 78) ** 2 + ((z - 6) / 64) ** 2))
  );
  const oldManila = Math.exp(-(((x + 44) / 100) ** 2 + ((z + 94) / 86) ** 2));
  return 4 + rng() * 7 + business * (8 + rng() * 20) + oldManila * (2 + rng() * 4);
}

function buildStreetLife({ planner, addTop, rng }) {
  const routes = ROAD_ROUTES.map((route) => prepareRoute(route, 7, false));
  for (let i = 0; i < 160; i += 1) {
    const route = routes[i % routes.length];
    const sample = sampleRoute(route, rng() * 900);
    const x = sample.x - sample.tangentZ * (5 + rng() * 10);
    const z = sample.z + sample.tangentX * (5 + rng() * 10);
    if (isWater(x, z, 3) || planner.hasPoint(x, z, 'building') || actorSolidZoneContains(x, z, 2.0) || footprintTouchesRoad(x, z, 4.6, 3.4, 4.0)) continue;
    if (i % 4 === 0) {
      addTop('cloth', x, z, 4.8, 2.6, 3.2, i % 8 === 0 ? 0xd94f45 : 0xf0dfb2);
      addTop('gold', x, z - 1.8, 4.5, 0.35, 0.25, 0xd8a334, 0, topY(x, z) + 2.2);
    } else if (i % 4 === 1) {
      addTop('wood', x, z, 3.2, 2.4, 2.4, 0x7a4d30);
      addTop('cloth', x, z - 1.3, 2.6, 0.45, 0.25, 0x48d9ff, 0, topY(x, z) + 1.9);
    } else {
      addTop('vegetation', x, z, 1.4, 3.2 + rng() * 2.2, 1.4, 0x4f8750);
    }
  }
}

function buildPedestrians({ animated, planner, rng }) {
  const routes = PEDESTRIAN_ROUTES.map((route) => prepareRoute(route, 5.6, true));
  const people = [];
  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    const lane = (rng() - 0.5) * route.width;
    people.push({
      route,
      distance: findValidWalkDistance(route, lane, rng, planner, 1.0),
      speed: 2.4 + rng() * 3.2,
      lane,
      phase: rng() * Math.PI * 2,
      scale: 0.94 + rng() * 0.18,
      lastX: null,
      lastZ: null,
      lastYaw: 0
    });
  }
  const group = new THREE.Group();
  group.name = 'manila-pedestrians-vendors-nightlife-crowds';
  const parts = {
    body: makeInstancedPart(people.length, 'manila-pedestrian-body', 0x315ca8),
    shirt: makeInstancedPart(people.length, 'manila-pedestrian-shirt', 0xf25fa7),
    head: makeInstancedPart(people.length, 'manila-pedestrian-head', 0xb47a54),
    hair: makeInstancedPart(people.length, 'manila-pedestrian-hair', 0x2e2924),
    leftLeg: makeInstancedPart(people.length, 'manila-pedestrian-left-leg', 0x30333a),
    rightLeg: makeInstancedPart(people.length, 'manila-pedestrian-right-leg', 0x30333a)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updatePeople(parts, people, elapsed, planner); } });
  updatePeople(parts, people, 0, planner);
  return people.length;
}

function buildCyclists({ animated, planner, rng }) {
  const routes = CYCLIST_ROUTES.map((route) => prepareRoute(route, 3.2, true));
  const cyclists = [];
  for (let i = 0; i < CYCLIST_COUNT; i += 1) {
    const route = routes[i % routes.length];
    const lane = (rng() - 0.5) * route.width;
    cyclists.push({
      route,
      distance: findValidWalkDistance(route, lane, rng, planner, 0.9),
      speed: 4.6 + rng() * 3.2,
      lane,
      phase: rng() * Math.PI * 2,
      lastX: null,
      lastZ: null,
      lastYaw: 0
    });
  }
  const group = new THREE.Group();
  group.name = 'manila-cyclists-marikina-makati-qc';
  const parts = {
    frame: makeInstancedPart(cyclists.length, 'manila-cyclist-frame', 0x2e2924),
    rider: makeInstancedPart(cyclists.length, 'manila-cyclist-rider', 0x48d9ff),
    head: makeInstancedPart(cyclists.length, 'manila-cyclist-head', 0xb47a54),
    wheelA: makeInstancedPart(cyclists.length, 'manila-cyclist-wheel-a', 0x202326),
    wheelB: makeInstancedPart(cyclists.length, 'manila-cyclist-wheel-b', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateCyclists(parts, cyclists, elapsed, planner); } });
  updateCyclists(parts, cyclists, 0, planner);
  return cyclists.length;
}

function buildJeepneys({ animated, rng }) {
  const routes = ROAD_ROUTES.map((route) => prepareRoute(route, 9.5, false));
  const vehicles = [];
  for (let i = 0; i < JEEPNEY_COUNT; i += 1) {
    const route = routes[i % routes.length];
    vehicles.push({ route, distance: rng() * route.length, speed: 6 + rng() * 5.5, lane: (rng() - 0.5) * route.width, color: i % 3 });
  }
  const group = new THREE.Group();
  group.name = 'manila-jeepneys';
  const parts = {
    body: makeInstancedPart(vehicles.length, 'manila-jeepney-body', 0xd8a334),
    cab: makeInstancedPart(vehicles.length, 'manila-jeepney-cab', 0x48d9ff),
    chrome: makeInstancedPart(vehicles.length, 'manila-jeepney-chrome', 0xbfd0d5),
    sign: makeInstancedPart(vehicles.length, 'manila-jeepney-route-sign', 0xf25fa7),
    wheels: makeInstancedPart(vehicles.length, 'manila-jeepney-wheels', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateJeepneys(parts, vehicles, elapsed); } });
  updateJeepneys(parts, vehicles, 0);
  return vehicles.length;
}

function buildMotorbikes({ animated, rng }) {
  const routes = ROAD_ROUTES.map((route) => prepareRoute(route, 7.5, false));
  const bikes = [];
  for (let i = 0; i < MOTORBIKE_COUNT; i += 1) {
    const route = routes[i % routes.length];
    bikes.push({ route, distance: rng() * route.length, speed: 8 + rng() * 7, lane: (rng() - 0.5) * route.width, phase: rng() * Math.PI * 2 });
  }
  const group = new THREE.Group();
  group.name = 'manila-motorcycles-delivery-riders';
  const parts = {
    bike: makeInstancedPart(bikes.length, 'manila-motorbike-frame', 0x2e2924),
    rider: makeInstancedPart(bikes.length, 'manila-motorbike-rider', 0x2b6f8f),
    box: makeInstancedPart(bikes.length, 'manila-motorbike-delivery-box', 0xd94f45),
    helmet: makeInstancedPart(bikes.length, 'manila-motorbike-helmet', 0xe6c663)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateMotorbikes(parts, bikes, elapsed); } });
  updateMotorbikes(parts, bikes, 0);
  return bikes.length;
}

function buildTricycles({ animated, rng }) {
  const routes = ROAD_ROUTES.map((route) => prepareRoute(route, 8.2, false));
  const tricycles = [];
  for (let i = 0; i < TRICYCLE_COUNT; i += 1) {
    const route = routes[i % routes.length];
    tricycles.push({ route, distance: rng() * route.length, speed: 5 + rng() * 4.5, lane: (rng() - 0.5) * route.width });
  }
  const group = new THREE.Group();
  group.name = 'manila-tricycles';
  const parts = {
    bike: makeInstancedPart(tricycles.length, 'manila-tricycle-bike', 0x2e2924),
    sidecar: makeInstancedPart(tricycles.length, 'manila-tricycle-sidecar', 0xe6c663),
    canopy: makeInstancedPart(tricycles.length, 'manila-tricycle-canopy', 0x48d9ff),
    rider: makeInstancedPart(tricycles.length, 'manila-tricycle-rider', 0xb47a54)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateTricycles(parts, tricycles, elapsed); } });
  updateTricycles(parts, tricycles, 0);
  return tricycles.length;
}

function buildTaxis({ animated, rng }) {
  const routes = ROAD_ROUTES.map((route) => prepareRoute(route, 8.5, false));
  const taxis = [];
  for (let i = 0; i < TAXI_COUNT; i += 1) {
    const route = routes[i % routes.length];
    taxis.push({ route, distance: rng() * route.length, speed: 7 + rng() * 5.5, lane: (rng() - 0.5) * route.width });
  }
  const group = new THREE.Group();
  group.name = 'manila-taxis';
  const parts = {
    body: makeInstancedPart(taxis.length, 'manila-taxi-body', 0xf0dfb2),
    roof: makeInstancedPart(taxis.length, 'manila-taxi-roof', 0xd8a334),
    window: makeInstancedPart(taxis.length, 'manila-taxi-window', 0x3f91aa),
    wheels: makeInstancedPart(taxis.length, 'manila-taxi-wheels', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateTaxis(parts, taxis, elapsed); } });
  updateTaxis(parts, taxis, 0);
  return taxis.length;
}

function buildBuses({ animated, rng }) {
  const routes = ROAD_ROUTES.slice(0, 2).map((route) => prepareRoute(route, 6.5, false));
  const buses = [];
  for (let i = 0; i < BUS_COUNT; i += 1) {
    const route = routes[i % routes.length];
    buses.push({ route, distance: rng() * route.length, speed: 5.5 + rng() * 3.5, lane: (rng() - 0.5) * route.width });
  }
  const group = new THREE.Group();
  group.name = 'manila-buses';
  const parts = {
    body: makeInstancedPart(buses.length, 'manila-bus-body', 0xe8e8df),
    stripe: makeInstancedPart(buses.length, 'manila-bus-stripe', 0xd94f45),
    window: makeInstancedPart(buses.length, 'manila-bus-window', 0x3f91aa),
    wheels: makeInstancedPart(buses.length, 'manila-bus-wheels', 0x202326)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateBuses(parts, buses, elapsed); } });
  updateBuses(parts, buses, 0);
  return buses.length;
}

function buildTrains({ animated, rng }) {
  const routes = TRAIN_ROUTES.map((route) => prepareRoute(route, 0, false));
  const trains = [];
  for (let i = 0; i < TRAIN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    trains.push({ route, distance: rng() * route.length, speed: 12 + rng() * 7 });
  }
  const group = new THREE.Group();
  group.name = 'manila-lrt-mrt-trains';
  const parts = {
    body: makeInstancedPart(trains.length, 'manila-train-body', 0xe8e8df),
    stripe: makeInstancedPart(trains.length, 'manila-train-stripe', 0x48d9ff),
    window: makeInstancedPart(trains.length, 'manila-train-window', 0x3f91aa)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateTrains(parts, trains, elapsed); } });
  updateTrains(parts, trains, 0);
  return trains.length;
}

function buildBoats({ animated, rng }) {
  const routes = BOAT_ROUTES.map((route) => prepareRoute(route, 0, false));
  const boats = [];
  for (let i = 0; i < BOAT_COUNT; i += 1) {
    const route = routes[i % routes.length];
    boats.push({ route, distance: rng() * route.length, speed: 3 + rng() * 3, lane: (rng() - 0.5) * 4 });
  }
  const group = new THREE.Group();
  group.name = 'manila-pasig-ferries-and-bay-boats';
  const parts = {
    hull: makeInstancedPart(boats.length, 'manila-boat-hull', 0x7a4d30),
    roof: makeInstancedPart(boats.length, 'manila-boat-roof', 0xf0dfb2),
    passengers: makeInstancedPart(boats.length, 'manila-boat-passengers', 0xc57b54),
    wake: makeInstancedPart(boats.length, 'manila-boat-wake', 0x9fd4e4)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateBoats(parts, boats, elapsed); } });
  updateBoats(parts, boats, 0);
  return boats.length;
}

function buildKalesas({ animated, planner, rng }) {
  const routes = KALESA_ROUTES.map((route) => prepareRoute(route, 2.8, true));
  const kalesas = [];
  for (let i = 0; i < KALESA_COUNT; i += 1) {
    const route = routes[i % routes.length];
    const lane = (rng() - 0.5) * route.width;
    kalesas.push({
      route,
      distance: findValidHistoricDistance(route, lane, rng, planner, 1.0),
      speed: 2.1 + rng() * 1.2,
      lane,
      phase: rng() * Math.PI * 2,
      lastX: null,
      lastZ: null,
      lastYaw: 0
    });
  }
  const group = new THREE.Group();
  group.name = 'manila-intramuros-kalesas';
  const parts = {
    cart: makeInstancedPart(kalesas.length, 'manila-kalesa-cart', 0x7a4d30),
    canopy: makeInstancedPart(kalesas.length, 'manila-kalesa-canopy', 0xf0dfb2),
    wheelA: makeInstancedPart(kalesas.length, 'manila-kalesa-wheel-a', 0x202326),
    wheelB: makeInstancedPart(kalesas.length, 'manila-kalesa-wheel-b', 0x202326),
    horseBody: makeInstancedPart(kalesas.length, 'manila-kalesa-horse-body', 0x6b432b),
    horseHead: makeInstancedPart(kalesas.length, 'manila-kalesa-horse-head', 0x6b432b),
    driver: makeInstancedPart(kalesas.length, 'manila-kalesa-driver', 0xb47a54)
  };
  Object.values(parts).forEach((mesh) => group.add(mesh));
  animated.push({ object: group, update(elapsed) { updateKalesas(parts, kalesas, elapsed, planner); } });
  updateKalesas(parts, kalesas, 0, planner);
  return kalesas.length;
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

const routeSample = { x: 0, z: 0, tangentX: 0, tangentZ: 1 };

function sampleRoute(route, distance, target = routeSample) {
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
  target.x = x;
  target.z = z;
  target.tangentX = segment.dx * invLength * direction;
  target.tangentZ = segment.dz * invLength * direction;
  return target;
}

function makeInstancedPart(count, name, color) {
  const material = new THREE.MeshBasicMaterial({ color, vertexColors: false, fog: false });
  material.name = name;
  material.toneMapped = false;
  const mesh = new THREE.InstancedMesh(ANIMATED_BOX_GEOMETRY, material, count);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
}

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scaleVector = new THREE.Vector3();
const resolvedRoutePoint = { x: 0, z: 0, valid: true };

function resolveRoutePoint(sample, lane, pad, validator) {
  const sideX = -sample.tangentZ;
  const sideZ = sample.tangentX;
  resolvedRoutePoint.x = sample.x + sideX * lane;
  resolvedRoutePoint.z = sample.z + sideZ * lane;
  resolvedRoutePoint.valid = true;
  if (validator(resolvedRoutePoint.x, resolvedRoutePoint.z, pad)) return resolvedRoutePoint;

  const fallbacks = [0, lane * 0.5, -lane * 0.5, lane * 0.25, -lane * 0.25, 1.4, -1.4, 2.8, -2.8];
  for (const fallbackLane of fallbacks) {
    const x = sample.x + sideX * fallbackLane;
    const z = sample.z + sideZ * fallbackLane;
    if (validator(x, z, pad)) {
      resolvedRoutePoint.x = x;
      resolvedRoutePoint.z = z;
      resolvedRoutePoint.valid = true;
      return resolvedRoutePoint;
    }
  }

  resolvedRoutePoint.x = sample.x;
  resolvedRoutePoint.z = sample.z;
  resolvedRoutePoint.valid = validator(sample.x, sample.z, pad);
  return resolvedRoutePoint;
}

function resolveWalkActorRoutePoint(sample, lane, pad = 1.2, planner = null) {
  return resolveRoutePoint(sample, lane, pad, (x, z, routePad) => isWalkRouteSurface(x, z, routePad) && actorRouteClear(planner, x, z, routePad));
}

function resolveRoadRoutePoint(sample, lane, pad = 1.2) {
  return resolveRoutePoint(sample, lane, pad, isRoadRouteSurface);
}

function resolveHistoricRoutePoint(sample, lane, pad = 1.0, planner = null) {
  return resolveRoutePoint(sample, lane, pad, (x, z, routePad) => isHistoricStreetSurface(x, z, routePad) && actorRouteClear(planner, x, z, routePad));
}

function resolveWaterRoutePoint(sample, lane, pad = 1.2) {
  return resolveRoutePoint(sample, lane, pad, isNavigableWater);
}

const routeSeedSample = { x: 0, z: 0, tangentX: 0, tangentZ: 1 };

function findValidWalkDistance(route, lane, rng, planner, pad) {
  return findValidActorDistance(route, lane, rng, pad, (sample) => resolveWalkActorRoutePoint(sample, lane, pad, planner));
}

function findValidHistoricDistance(route, lane, rng, planner, pad) {
  return findValidActorDistance(route, lane, rng, pad, (sample) => resolveHistoricRoutePoint(sample, lane, pad, planner));
}

function findValidActorDistance(route, lane, rng, pad, resolve) {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const distance = rng() * route.length;
    const sample = sampleRoute(route, distance, routeSeedSample);
    const resolved = resolve(sample, lane, pad);
    if (resolved.valid) return distance;
  }
  return rng() * route.length;
}

function hideParts(parts, index) {
  Object.values(parts).forEach((mesh) => {
    setPart(mesh, index, 0, -10000, 0, 0, 0, 0, 0, 0.01, 0.01, 0.01);
  });
}

function markPartsDirty(parts) {
  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function updatePeople(parts, people, elapsed, planner) {
  people.forEach((person, index) => {
    const sample = sampleRoute(person.route, person.distance + elapsed * person.speed);
    const resolved = resolveWalkActorRoutePoint(sample, person.lane, 1.0, planner);
    if (!resolved.valid && person.lastX == null) {
      hideParts(parts, index);
      return;
    }
    const x = resolved.valid ? resolved.x : person.lastX;
    const z = resolved.valid ? resolved.z : person.lastZ;
    const y = topY(x, z) + 0.08;
    const yaw = resolved.valid ? Math.atan2(sample.tangentX, sample.tangentZ) : person.lastYaw;
    person.lastX = x;
    person.lastZ = z;
    person.lastYaw = yaw;
    const stride = Math.sin(elapsed * 7.2 + person.phase) * 0.14;
    const bob = Math.abs(Math.sin(elapsed * 5.4 + person.phase)) * 0.05;
    const scale = person.scale;
    setPart(parts.body, index, x, y + bob, z, yaw, 0, 1.08, 0, 0.58 * scale, 0.95 * scale, 0.38 * scale);
    setPart(parts.shirt, index, x, y + bob, z, yaw, 0, 1.28, -0.08, 0.62 * scale, 0.38 * scale, 0.42 * scale);
    setPart(parts.head, index, x, y + bob, z, yaw, 0, 1.78, 0, 0.4 * scale, 0.38 * scale, 0.4 * scale);
    setPart(parts.hair, index, x, y + bob, z, yaw, 0, 1.98, -0.02, 0.42 * scale, 0.14 * scale, 0.42 * scale);
    setPart(parts.leftLeg, index, x, y, z, yaw, -0.14, 0.38, stride, 0.15 * scale, 0.65 * scale, 0.15 * scale);
    setPart(parts.rightLeg, index, x, y, z, yaw, 0.14, 0.38, -stride, 0.15 * scale, 0.65 * scale, 0.15 * scale);
  });
  markPartsDirty(parts);
}

function updateCyclists(parts, cyclists, elapsed, planner) {
  cyclists.forEach((cyclist, index) => {
    const sample = sampleRoute(cyclist.route, cyclist.distance + elapsed * cyclist.speed);
    const resolved = resolveWalkActorRoutePoint(sample, cyclist.lane, 0.9, planner);
    if (!resolved.valid && cyclist.lastX == null) {
      hideParts(parts, index);
      return;
    }
    const x = resolved.valid ? resolved.x : cyclist.lastX;
    const z = resolved.valid ? resolved.z : cyclist.lastZ;
    const y = topY(x, z) + 0.12;
    const yaw = resolved.valid ? Math.atan2(sample.tangentX, sample.tangentZ) : cyclist.lastYaw;
    cyclist.lastX = x;
    cyclist.lastZ = z;
    cyclist.lastYaw = yaw;
    const pedal = Math.sin(elapsed * 8.5 + cyclist.phase) * 0.08;
    setPart(parts.frame, index, x, y, z, yaw, 0, 0.62, 0, 0.62, 0.28, 1.55);
    setPart(parts.rider, index, x, y + pedal, z, yaw, 0, 1.18, -0.08, 0.42, 0.78, 0.42);
    setPart(parts.head, index, x, y + pedal, z, yaw, 0, 1.72, -0.16, 0.34, 0.32, 0.34);
    setPart(parts.wheelA, index, x, y, z, yaw, -0.46, 0.34, 0.54, 0.14, 0.62, 0.62);
    setPart(parts.wheelB, index, x, y, z, yaw, 0.46, 0.34, -0.54, 0.14, 0.62, 0.62);
  });
  markPartsDirty(parts);
}

function updateJeepneys(parts, vehicles, elapsed) {
  vehicles.forEach((vehicle, index) => {
    const sample = sampleRoute(vehicle.route, vehicle.distance + elapsed * vehicle.speed);
    const resolved = resolveRoadRoutePoint(sample, vehicle.lane, 1.0);
    if (!resolved.valid) {
      hideParts(parts, index);
      return;
    }
    const x = resolved.x;
    const z = resolved.z;
    const y = roadSurfaceY(x, z) + 0.18;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 1.0, 0, 2.3, 1.25, 4.8);
    setPart(parts.cab, index, x, y, z, yaw, 0, 1.78, -1.2, 2.1, 0.85, 1.7);
    setPart(parts.chrome, index, x, y, z, yaw, 0, 1.72, 1.35, 2.4, 0.26, 1.3);
    setPart(parts.sign, index, x, y, z, yaw, 0, 2.3, -2.2, 1.8, 0.38, 0.24);
    setPart(parts.wheels, index, x, y, z, yaw, 0, 0.38, 0, 2.55, 0.42, 4.4);
  });
  markPartsDirty(parts);
}

function updateMotorbikes(parts, bikes, elapsed) {
  bikes.forEach((bike, index) => {
    const sample = sampleRoute(bike.route, bike.distance + elapsed * bike.speed);
    const resolved = resolveRoadRoutePoint(sample, bike.lane, 1.0);
    if (!resolved.valid) {
      hideParts(parts, index);
      return;
    }
    const x = resolved.x;
    const z = resolved.z;
    const y = roadSurfaceY(x, z) + 0.14;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.bike, index, x, y, z, yaw, 0, 0.45, 0, 0.62, 0.34, 1.7);
    setPart(parts.rider, index, x, y, z, yaw, 0, 1.08, -0.15, 0.44, 0.85, 0.42);
    setPart(parts.box, index, x, y, z, yaw, 0, 1.02, 0.72, 0.62, 0.56, 0.62);
    setPart(parts.helmet, index, x, y, z, yaw, 0, 1.62, -0.32, 0.38, 0.24, 0.38);
  });
  markPartsDirty(parts);
}

function updateTricycles(parts, tricycles, elapsed) {
  tricycles.forEach((tricycle, index) => {
    const sample = sampleRoute(tricycle.route, tricycle.distance + elapsed * tricycle.speed);
    const resolved = resolveRoadRoutePoint(sample, tricycle.lane, 1.0);
    if (!resolved.valid) {
      hideParts(parts, index);
      return;
    }
    const x = resolved.x;
    const z = resolved.z;
    const y = roadSurfaceY(x, z) + 0.14;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.bike, index, x, y, z, yaw, -0.3, 0.46, 0, 0.58, 0.34, 1.65);
    setPart(parts.sidecar, index, x, y, z, yaw, 0.58, 0.58, 0.08, 0.88, 0.64, 1.22);
    setPart(parts.canopy, index, x, y, z, yaw, 0.58, 1.18, 0.08, 0.98, 0.24, 1.3);
    setPart(parts.rider, index, x, y, z, yaw, -0.3, 1.08, -0.22, 0.4, 0.8, 0.4);
  });
  markPartsDirty(parts);
}

function updateTaxis(parts, taxis, elapsed) {
  taxis.forEach((taxi, index) => {
    const sample = sampleRoute(taxi.route, taxi.distance + elapsed * taxi.speed);
    const resolved = resolveRoadRoutePoint(sample, taxi.lane, 1.0);
    if (!resolved.valid) {
      hideParts(parts, index);
      return;
    }
    const x = resolved.x;
    const z = resolved.z;
    const y = roadSurfaceY(x, z) + 0.16;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 0.72, 0, 1.65, 0.72, 3.1);
    setPart(parts.roof, index, x, y, z, yaw, 0, 1.18, -0.2, 1.35, 0.48, 1.55);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.22, -0.5, 1.72, 0.42, 1.5);
    setPart(parts.wheels, index, x, y, z, yaw, 0, 0.28, 0, 1.78, 0.32, 2.9);
  });
  markPartsDirty(parts);
}

function updateBuses(parts, buses, elapsed) {
  buses.forEach((bus, index) => {
    const sample = sampleRoute(bus.route, bus.distance + elapsed * bus.speed);
    const resolved = resolveRoadRoutePoint(sample, bus.lane, 1.0);
    if (!resolved.valid) {
      hideParts(parts, index);
      return;
    }
    const x = resolved.x;
    const z = resolved.z;
    const y = roadSurfaceY(x, z) + 0.2;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 1.0, 0, 2.2, 1.3, 5.4);
    setPart(parts.stripe, index, x, y, z, yaw, 0, 1.42, -0.2, 2.3, 0.28, 5.0);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.7, -0.45, 2.35, 0.42, 3.6);
    setPart(parts.wheels, index, x, y, z, yaw, 0, 0.38, 0, 2.35, 0.38, 5.0);
  });
  markPartsDirty(parts);
}

function updateTrains(parts, trains, elapsed) {
  trains.forEach((train, index) => {
    const sample = sampleRoute(train.route, train.distance + elapsed * train.speed);
    const x = sample.x;
    const z = sample.z;
    const y = topY(x, z) + 6.15;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    setPart(parts.body, index, x, y, z, yaw, 0, 1.1, 0, 2.8, 1.6, 11);
    setPart(parts.stripe, index, x, y, z, yaw, 0, 1.6, -0.1, 2.95, 0.28, 10.4);
    setPart(parts.window, index, x, y, z, yaw, 0, 1.8, -0.5, 3.0, 0.45, 6.0);
  });
  markPartsDirty(parts);
}

function updateBoats(parts, boats, elapsed) {
  boats.forEach((boat, index) => {
    const sample = sampleRoute(boat.route, boat.distance + elapsed * boat.speed);
    const resolved = resolveWaterRoutePoint(sample, boat.lane, 1.4);
    if (!resolved.valid) {
      hideParts(parts, index);
      return;
    }
    const x = resolved.x;
    const z = resolved.z;
    const waterY = manilaWaterY(x, z);
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const wakePulse = 1 + Math.sin(elapsed * 3.2 + index * 0.73) * 0.2;
    setPart(parts.hull, index, x, waterY, z, yaw, 0, 0.35, 0, 2.1, 0.7, 6.2);
    setPart(parts.roof, index, x, waterY, z, yaw, 0, 1.0, -0.3, 1.8, 0.48, 3.8);
    setPart(parts.passengers, index, x, waterY, z, yaw, 0, 1.24, 0.7, 1.3, 0.34, 1.6);
    setPart(parts.wake, index, x, waterY, z, yaw, 0, 0.08, 3.8, 1.6 * wakePulse, 0.08, 2.6 * wakePulse);
  });
  markPartsDirty(parts);
}

function updateKalesas(parts, kalesas, elapsed, planner) {
  kalesas.forEach((kalesa, index) => {
    const sample = sampleRoute(kalesa.route, kalesa.distance + elapsed * kalesa.speed);
    const resolved = resolveHistoricRoutePoint(sample, kalesa.lane, 1.0, planner);
    if (!resolved.valid && kalesa.lastX == null) {
      hideParts(parts, index);
      return;
    }
    const x = resolved.valid ? resolved.x : kalesa.lastX;
    const z = resolved.valid ? resolved.z : kalesa.lastZ;
    const y = topY(x, z) + 0.12;
    const yaw = resolved.valid ? Math.atan2(sample.tangentX, sample.tangentZ) : kalesa.lastYaw;
    kalesa.lastX = x;
    kalesa.lastZ = z;
    kalesa.lastYaw = yaw;
    const trot = Math.sin(elapsed * 8 + kalesa.phase) * 0.08;
    setPart(parts.cart, index, x, y, z, yaw, 0, 0.62, 1.15, 1.45, 1.05, 2.2);
    setPart(parts.canopy, index, x, y, z, yaw, 0, 1.45, 1.0, 1.65, 0.38, 1.85);
    setPart(parts.wheelA, index, x, y, z, yaw, -0.9, 0.42, 1.25, 0.18, 0.74, 0.74);
    setPart(parts.wheelB, index, x, y, z, yaw, 0.9, 0.42, 1.25, 0.18, 0.74, 0.74);
    setPart(parts.horseBody, index, x, y + trot, z, yaw, 0, 0.88, -1.15, 0.9, 0.82, 1.72);
    setPart(parts.horseHead, index, x, y + trot, z, yaw, 0, 1.3, -2.0, 0.58, 0.56, 0.72);
    setPart(parts.driver, index, x, y, z, yaw, 0, 1.65, 0.25, 0.46, 0.72, 0.46);
  });
  markPartsDirty(parts);
}

function setPart(mesh, index, x, y, z, yaw, localX, localY, localZ, sx, sy, sz) {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  position.set(x + localX * cos + localZ * sin, y + localY, z - localX * sin + localZ * cos);
  quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
  scaleVector.set(sx, sy, sz);
  matrix.compose(position, quaternion, scaleVector);
  mesh.setMatrixAt(index, matrix);
}
