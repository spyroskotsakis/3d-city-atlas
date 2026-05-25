import * as THREE from 'three';
import { createManilaScene, manilaTerrainHeightAt, manilaTopologyProbe } from '../src/manilaScene.js';

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

const REQUIRED_FOCUS_TARGETS = [
  'intramuros',
  'cathedral',
  'fortSantiago',
  'sanAgustin',
  'casaManila',
  'pasigRiver',
  'rizalPark',
  'nationalMuseum',
  'cityHall',
  'jonesBridge',
  'binondo',
  'quiapo',
  'escolta',
  'makati',
  'greenbelt',
  'salcedo',
  'poblacion',
  'bgc',
  'ortigas',
  'edsa',
  'mrtLrt',
  'quezonCity',
  'tomasMorato',
  'maginhawa',
  'upDiliman',
  'cubao',
  'kapitolyo',
  'laLoma',
  'manilaBay',
  'bayArea',
  'paranaque',
  'navotas',
  'port',
  'marikina',
  'aerial'
];

const materials = Object.fromEntries(
  MATERIAL_KEYS.map((key) => {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    material.userData.defaultColor = 0xffffff;
    return [key, material];
  })
);

const failures = [];
const scene = createManilaScene(materials);

for (const targetKey of REQUIRED_FOCUS_TARGETS) {
  if (!scene.focusTargets[targetKey]) failures.push(`Missing focus target: ${targetKey}`);
}

for (const [key, target] of Object.entries(scene.focusTargets)) {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) {
    failures.push(`Non-finite focus target coordinates: ${key}`);
  }
}

for (const label of scene.labels) {
  if (!label.name || !Number.isFinite(label.position.x) || !Number.isFinite(label.position.y) || !Number.isFinite(label.position.z)) {
    failures.push(`Invalid label: ${label.name ?? '<unnamed>'}`);
  }
}

const animatedSum =
  scene.metrics.pedestrians +
  scene.metrics.cyclists +
  scene.metrics.jeepneys +
  scene.metrics.motorbikes +
  scene.metrics.tricycles +
  scene.metrics.taxis +
  scene.metrics.buses +
  scene.metrics.trains +
  scene.metrics.boats +
  scene.metrics.kalesas;

if (animatedSum !== scene.metrics.animatedInstances) {
  failures.push(`Animated metric mismatch: expected ${animatedSum}, got ${scene.metrics.animatedInstances}`);
}

const rebuiltDensity = scene.metrics.blocks + Math.floor((scene.metrics.connectedFabric ?? 0) / 18);
if (scene.metrics.blocks < 120) failures.push(`Manila urban block fallback regressed: ${scene.metrics.blocks}`);
if ((scene.metrics.connectedFabric ?? 0) < 1800) failures.push(`Manila connected fabric regressed: ${scene.metrics.connectedFabric ?? 0}`);
if (rebuiltDensity < 250) failures.push(`Manila rebuilt density regressed: ${rebuiltDensity}`);
if (scene.metrics.cityLifeDetails < 650) failures.push(`Manila city-life details regressed: ${scene.metrics.cityLifeDetails}`);
if (scene.labels.length < 50) failures.push(`Manila labels regressed: ${scene.labels.length}`);
for (const expectedLabel of ['Ongpin Food Alleys', 'Avenida / Recto Book Row', 'Quiapo Underpass Market']) {
  if (!scene.labels.some((label) => label.name === expectedLabel)) failures.push(`Missing rebuilt local label: ${expectedLabel}`);
}

const waterFocusTargets = new Set(['pasig', 'pasigRiver', 'jonesBridge', 'bay', 'manilaBay']);
for (const [key, target] of Object.entries(scene.focusTargets)) {
  if (waterFocusTargets.has(key)) continue;
  if (manilaTopologyProbe.isWater(target.x, target.z, 1.2)) failures.push(`Dry focus target is in water: ${key}`);
  if (target.y - manilaTerrainHeightAt(target.x, target.z) < 7) failures.push(`Focus target camera too low: ${key}`);
}

if (manilaTopologyProbe.isWater(-218, -118, 2)) failures.push('Port focus is still classified as water');
if (manilaTerrainHeightAt(-218, -118) <= 0.7) failures.push('Port reclaimed land terrain is too low');
if (!manilaTopologyProbe.isWater(-246, -118, 0)) failures.push('Adjacent Manila Bay water beside port was lost');
if (!manilaTopologyProbe.isWater(-250, -104, 0)) failures.push('Adjacent dock water beside port was lost');
let reclaimedWaterSamples = 0;
for (let x = -232; x <= -172; x += 8) {
  for (let z = -154; z <= -78; z += 8) {
    if (manilaTopologyProbe.isWater(x, z, 0)) reclaimedWaterSamples += 1;
  }
}
if (reclaimedWaterSamples > 0) failures.push(`Port reclaimed box still has ${reclaimedWaterSamples} water samples`);

const matrix = new THREE.Matrix4();
const matrixPosition = new THREE.Vector3();
const matrixScale = new THREE.Vector3();
let instancedMeshes = 0;
let scannedInstances = 0;
let badMatrices = 0;
let hiddenAnimated = 0;
let offRoadVehicles = 0;
let hiddenKalesas = 0;
let nonWaterBoats = 0;
let lowBridgeVehicles = 0;
const roadLikePositions = [];
const qualityPositions = [];
const staticRoadOverlaps = [];
const qualityKinds = new Set([
  'voxels:asphalt',
  'voxels:cobblestone',
  'voxels:limestone',
  'voxels:concrete',
  'voxels:brick',
  'voxels:glass',
  'voxels:steel',
  'voxels:gold',
  'voxels:wood',
  'voxels:cloth',
  'voxels:vegetation',
  'voxels:graffiti',
  'voxels:neon',
  'voxels:neonPink',
  'voxels:neonCyan'
]);
const buildingOverlapKinds = new Set([
  'voxels:concrete',
  'voxels:brick',
  'voxels:glass',
  'voxels:limestone',
  'voxels:steel'
]);
const mainRoadSegments = manilaTopologyProbe.roadSegments();

for (const elapsed of [0, 0.5, 10, 60, 600]) {
  scene.update(elapsed);
  scene.group.traverse((object) => {
    if (!object.isInstancedMesh) return;
    if (elapsed === 0) instancedMeshes += 1;
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, matrix);
      scannedInstances += 1;
      if (!matrix.elements.every(Number.isFinite)) badMatrices += 1;
      matrixPosition.setFromMatrixPosition(matrix);
      const hidden = matrixPosition.y < -9999;
      if (!object.name.startsWith('voxels:') && hidden) hiddenAnimated += 1;
      if (object.name.includes('kalesa') && hidden) hiddenKalesas += 1;
      if (!hidden && ['manila-jeepney-body', 'manila-motorbike-frame', 'manila-tricycle-bike', 'manila-taxi-body', 'manila-bus-body'].includes(object.name)) {
        if (!manilaTopologyProbe.isRoadDeck(matrixPosition.x, matrixPosition.z, 1.45)) offRoadVehicles += 1;
        if (manilaTopologyProbe.isWater(matrixPosition.x, matrixPosition.z, 1.2) && matrixPosition.y < manilaTerrainHeightAt(matrixPosition.x, matrixPosition.z) + 1.3) {
          lowBridgeVehicles += 1;
        }
      }
      if (!hidden && object.name === 'manila-boat-hull' && !manilaTopologyProbe.isNavigableWater(matrixPosition.x, matrixPosition.z, 1.4)) nonWaterBoats += 1;
      if (elapsed === 0 && (object.name === 'voxels:asphalt' || object.name === 'voxels:cobblestone')) {
        roadLikePositions.push([matrixPosition.x, matrixPosition.z]);
      }
      if (elapsed === 0 && qualityKinds.has(object.name)) {
        qualityPositions.push([matrixPosition.x, matrixPosition.z]);
      }
      if (elapsed === 0 && buildingOverlapKinds.has(object.name) && matrixPosition.y > -9999) {
        matrixScale.setFromMatrixScale(matrix);
        const roadOverlap = matrixScale.y >= 3 && matrixScale.x >= 3 && matrixScale.z >= 3
          ? roadOverlapForFootprint(matrix, matrixPosition, mainRoadSegments)
          : null;
        if (roadOverlap) {
          staticRoadOverlaps.push({
            kind: object.name,
            road: roadOverlap,
            x: Number(matrixPosition.x.toFixed(1)),
            z: Number(matrixPosition.z.toFixed(1)),
            sx: Number(matrixScale.x.toFixed(1)),
            sy: Number(matrixScale.y.toFixed(1)),
            sz: Number(matrixScale.z.toFixed(1))
          });
        }
      }
    }
  });
}

if (badMatrices > 0) failures.push(`Found ${badMatrices} non-finite instance matrices`);
if (hiddenAnimated > 0) failures.push(`Found ${hiddenAnimated} hidden animated placements`);
if (hiddenKalesas > 0) failures.push(`Found ${hiddenKalesas} hidden kalesa placements`);
if (offRoadVehicles > 0) failures.push(`Found ${offRoadVehicles} road vehicle samples away from road decks`);
if (lowBridgeVehicles > 0) failures.push(`Found ${lowBridgeVehicles} bridge vehicle samples below deck height`);
if (nonWaterBoats > 0) failures.push(`Found ${nonWaterBoats} boat samples outside navigable water`);
if (staticRoadOverlaps.length > 0) {
  failures.push(`Found ${staticRoadOverlaps.length} solid building footprints on main road decks: ${JSON.stringify(staticRoadOverlaps.slice(0, 8))}`);
}

function roadOverlapForFootprint(matrix, position, roadSegments) {
  const e = matrix.elements;
  const center = { x: position.x, z: position.z };
  const halfX = { x: e[0] * 0.5, z: e[2] * 0.5 };
  const halfZ = { x: e[8] * 0.5, z: e[10] * 0.5 };
  const corners = [
    { x: center.x - halfX.x - halfZ.x, z: center.z - halfX.z - halfZ.z },
    { x: center.x + halfX.x - halfZ.x, z: center.z + halfX.z - halfZ.z },
    { x: center.x - halfX.x + halfZ.x, z: center.z - halfX.z + halfZ.z },
    { x: center.x + halfX.x + halfZ.x, z: center.z + halfX.z + halfZ.z }
  ];
  const minX = Math.min(...corners.map((corner) => corner.x));
  const maxX = Math.max(...corners.map((corner) => corner.x));
  const minZ = Math.min(...corners.map((corner) => corner.z));
  const maxZ = Math.max(...corners.map((corner) => corner.z));

  for (const segment of roadSegments) {
    const roadHalf = segment.width / 2 + 0.35;
    if (Math.max(segment.a.x, segment.b.x) < minX - roadHalf || Math.min(segment.a.x, segment.b.x) > maxX + roadHalf) continue;
    if (Math.max(segment.a.z, segment.b.z) < minZ - roadHalf || Math.min(segment.a.z, segment.b.z) > maxZ + roadHalf) continue;
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.z - segment.a.z;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / 2.2));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = segment.a.x + dx * t;
      const z = segment.a.z + dz * t;
      if (pointInExpandedFootprint(x, z, center, halfX, halfZ, roadHalf)) return segment.name;
    }
  }
  return null;
}

function pointInExpandedFootprint(x, z, center, halfX, halfZ, pad) {
  const relX = x - center.x;
  const relZ = z - center.z;
  const xHalf = Math.hypot(halfX.x, halfX.z);
  const zHalf = Math.hypot(halfZ.x, halfZ.z);
  if (xHalf <= 0.001 || zHalf <= 0.001) return false;
  const ux = { x: halfX.x / xHalf, z: halfX.z / xHalf };
  const uz = { x: halfZ.x / zHalf, z: halfZ.z / zHalf };
  const localX = relX * ux.x + relZ * ux.z;
  const localZ = relX * uz.x + relZ * uz.z;
  return Math.abs(localX) <= xHalf + pad && Math.abs(localZ) <= zHalf + pad;
}

function nearestRoadDistance(x, z) {
  let best = Infinity;
  for (const [rx, rz] of roadLikePositions) {
    const distance = Math.hypot(rx - x, rz - z);
    if (distance < best) best = distance;
  }
  return best;
}

for (const [key, target] of Object.entries(scene.focusTargets)) {
  if (waterFocusTargets.has(key)) continue;
  const maxDistance = ['marikina', 'paranaque', 'navotas'].includes(key) ? 42 : 34;
  const distance = nearestRoadDistance(target.x, target.z);
  if (distance > maxDistance) failures.push(`Focus target has no nearby street deck: ${key} (${distance.toFixed(1)})`);
}

function nearestQualityDistance(x, z) {
  let best = Infinity;
  for (const [qx, qz] of qualityPositions) {
    const distance = Math.hypot(qx - x, qz - z);
    if (distance < best) best = distance;
  }
  return best;
}

const coverageBoxes = {
  oldManila: [-120, 60, -188, -54, 28],
  civicCore: [-150, -30, 42, 136, 38],
  businessCore: [-10, 224, 0, 144, 32],
  qcCubao: [40, 230, -250, -100, 38],
  baySouth: [-210, -86, 150, 306, 38],
  portNavotas: [-238, -76, -246, -78, 38],
  marikina: [230, 326, -132, -54, 34]
};

const coverageSummary = {};
for (const [name, [x1, x2, z1, z2, limit]] of Object.entries(coverageBoxes)) {
  let maxGap = 0;
  let samples = 0;
  for (let x = x1; x <= x2; x += 10) {
    for (let z = z1; z <= z2; z += 10) {
      if (manilaTopologyProbe.isWater(x, z, 1.5)) continue;
      const distance = nearestQualityDistance(x, z);
      maxGap = Math.max(maxGap, distance);
      samples += 1;
    }
  }
  coverageSummary[name] = { maxGap: Number(maxGap.toFixed(1)), samples };
  if (samples === 0) failures.push(`Urban coverage box had no dry samples: ${name}`);
  if (maxGap > limit) failures.push(`Urban coverage gap too large in ${name}: ${maxGap.toFixed(1)} > ${limit}`);
}

const summary = {
  labels: scene.labels.length,
  focusTargets: Object.keys(scene.focusTargets).length,
  metrics: scene.metrics,
  instancedMeshes,
  scannedInstances,
  badMatrices,
  hiddenAnimated,
  offRoadVehicles,
  nonWaterBoats,
  lowBridgeVehicles,
  staticRoadOverlaps: staticRoadOverlaps.length,
  roadLikePositions: roadLikePositions.length,
  qualityPositions: qualityPositions.length,
  coverage: coverageSummary
};

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures, summary }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}
