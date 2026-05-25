import * as THREE from 'three';
import { createManilaScene } from '../src/manilaScene.js';

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
  'poblacion',
  'bgc',
  'ortigas',
  'quezonCity',
  'cubao',
  'bayArea',
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

if (scene.metrics.blocks < 175) failures.push(`Manila block density regressed: ${scene.metrics.blocks}`);
if (scene.metrics.cityLifeDetails < 650) failures.push(`Manila city-life details regressed: ${scene.metrics.cityLifeDetails}`);
if (scene.labels.length < 50) failures.push(`Manila labels regressed: ${scene.labels.length}`);

const matrix = new THREE.Matrix4();
let instancedMeshes = 0;
let scannedInstances = 0;
let badMatrices = 0;
let hiddenPedestrians = 0;

for (const elapsed of [0, 0.5, 10, 60, 600]) {
  scene.update(elapsed);
  scene.group.traverse((object) => {
    if (!object.isInstancedMesh) return;
    if (elapsed === 0) instancedMeshes += 1;
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, matrix);
      scannedInstances += 1;
      if (!matrix.elements.every(Number.isFinite)) badMatrices += 1;
      if (object.name === 'manila-pedestrian-body' && matrix.elements[13] < -9999) hiddenPedestrians += 1;
    }
  });
}

if (badMatrices > 0) failures.push(`Found ${badMatrices} non-finite instance matrices`);
if (hiddenPedestrians > 0) failures.push(`Found ${hiddenPedestrians} hidden pedestrian placements`);

const summary = {
  labels: scene.labels.length,
  focusTargets: Object.keys(scene.focusTargets).length,
  metrics: scene.metrics,
  instancedMeshes,
  scannedInstances,
  badMatrices,
  hiddenPedestrians
};

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, failures, summary }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}
