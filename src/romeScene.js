import * as THREE from 'three';
import { Planner } from './planner.js';
import { VoxelBatcher, yawForVector } from './voxelBatcher.js';

const WORLD_BOUNDS = 205;
const TERRAIN_CELL = 4;
const TILE = 3.8;
const PEDESTRIAN_COUNT = 180;
const tempColor = new THREE.Color();

const HILLS = [
  { name: 'Palatine Hill', x: -58, z: 48, amp: 7.1, rx: 48, rz: 36 },
  { name: 'Capitoline Hill', x: -128, z: -22, amp: 6.4, rx: 36, rz: 30 },
  { name: 'Aventine Hill', x: -104, z: 118, amp: 6.7, rx: 48, rz: 42 },
  { name: 'Caelian Hill', x: 62, z: 72, amp: 5.9, rx: 52, rz: 38 },
  { name: 'Esquiline Hill', x: 70, z: -62, amp: 6.9, rx: 62, rz: 44 },
  { name: 'Viminal Hill', x: 18, z: -118, amp: 5.4, rx: 42, rz: 34 },
  { name: 'Quirinal Hill', x: -58, z: -126, amp: 6.2, rx: 50, rz: 36 }
];

function createRng(seed = 0x5e7a11) {
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
  tempColor.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s + amount * 0.15)), Math.max(0, Math.min(1, hsl.l + amount)));
  return tempColor.getHex();
}

function topY(x, z) {
  return terrainHeightAt(x, z) + 0.08;
}

export function riverCenterX(z) {
  return -168 + Math.sin(z * 0.032) * 17 + Math.sin(z * 0.071 + 1.7) * 7;
}

export function isRiver(x, z, pad = 0) {
  const width = 30 + Math.sin(z * 0.044) * 4;
  return Math.abs(x - riverCenterX(z)) <= width / 2 + pad;
}

export function terrainHeightAt(x, z) {
  let height = 0.7 + Math.sin(x * 0.028 + z * 0.011) * 0.22 + Math.cos(z * 0.025) * 0.18;
  for (const hill of HILLS) {
    const nx = (x - hill.x) / hill.rx;
    const nz = (z - hill.z) / hill.rz;
    height += hill.amp * Math.exp(-(nx * nx + nz * nz));
  }
  height -= Math.exp(-((x + 4) * (x + 4)) / 900 - (z * z) / 1900) * 1.2;
  return Math.max(0.5, height);
}

export function createRomeScene(materials) {
  const rng = createRng();
  const batch = new VoxelBatcher(materials);
  const planner = new Planner({ bounds: WORLD_BOUNDS - 18, isRiver });
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
    const baseOffset = options.baseOffset ?? 0.04;
    const x1 = x - width / 2 + tile / 2;
    const x2 = x + width / 2 - tile / 2;
    const z1 = z - depth / 2 + tile / 2;
    const z2 = z + depth / 2 - tile / 2;

    for (let ix = x1; ix <= x2; ix += tile) {
      for (let iz = z1; iz <= z2; iz += tile) {
        if (isRiver(ix, iz, -1)) continue;
        const jitter = (Math.sin(ix * 1.7 + iz * 2.1) + Math.cos(ix * 0.9)) * 0.018;
        const instanceColor = options.color ? vary(options.color, jitter) : null;
        addTop(kind, ix, iz, tile * 0.98, sy, tile * 0.98, instanceColor, 0, topY(ix, iz) + baseOffset);
      }
    }
  };

  const addRoadRect = (tag, x, z, width, depth, kind = 'road') => {
    planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'road' });
    addTiledRect(kind, x, z, width, depth, { color: kind === 'basalt' ? '#4d4840' : '#746a5b' });
  };

  reserveLandmarks(planner);
  buildTerrain(batch);
  buildRoads(addRoadRect, addTiledRect, batch);
  buildColosseum({ batch, addTop, addTiledRect, addLabel, rng, materials, animated });
  buildForum({ batch, addTop, addTiledRect, addLabel });
  buildArchOfConstantine({ batch, addTop, addLabel });
  buildTempleVenusRoma({ batch, addTop, addTiledRect, addLabel });
  buildBasilicas({ batch, addTop, addTiledRect, addLabel });
  buildAqueducts({ batch, addTop, addLabel });
  buildCircusMaximus({ batch, addTop, addTiledRect, addLabel });
  buildTiberBridges({ batch, addTop, addLabel });
  buildHillsLabels(addLabel);
  buildInsulae({ planner, batch, addTop, rng });
  const pedestrians = buildPedestrians({ animated, rng });

  const { group, total } = batch.build();
  group.name = 'procedural-rome-voxel-city';

  for (const item of animated) group.add(item.object);

  const focusTargets = {
    colosseum: new THREE.Vector3(0, 14, 0),
    forum: new THREE.Vector3(-126, 10, -28),
    circus: new THREE.Vector3(-72, 9, 132),
    aerial: new THREE.Vector3(-18, 6, 10)
  };

  return {
    group,
    labels,
    focusTargets,
    metrics: {
      instances: total,
      pedestrians,
      reservations: planner.reservations.length,
      hills: HILLS.length
    },
    update(elapsed) {
      for (const item of animated) item.update(elapsed);
    }
  };
}

function reserveLandmarks(planner) {
  [
    ['Colosseum', 0, 0, 102, 82],
    ['Forum Romanum', -128, -28, 78, 58],
    ['Arch of Constantine', -42, 50, 24, 18],
    ['Temple Venus Roma', -78, 10, 48, 34],
    ['Basilica Maxentius', 78, -38, 58, 42],
    ['Basilica Julia', -126, 15, 66, 22],
    ['Aqueduct arcade', 148, -16, 22, 292],
    ['Circus Maximus', -76, 132, 132, 58],
    ['Tiber bridge west', -156, -72, 48, 18],
    ['Tiber bridge south', -156, 68, 48, 18]
  ].forEach(([tag, x, z, width, depth]) => planner.reserveRect(tag, x, z, width, depth, { force: true, type: 'landmark' }));
}

function buildTerrain(batch) {
  for (let x = -WORLD_BOUNDS; x <= WORLD_BOUNDS; x += TERRAIN_CELL) {
    for (let z = -WORLD_BOUNDS; z <= WORLD_BOUNDS; z += TERRAIN_CELL) {
      if (isRiver(x, z, 0.5)) {
        batch.add('water', x, 0.36, z, TERRAIN_CELL * 1.04, 0.2, TERRAIN_CELL * 1.04, vary('#7fc3c0', Math.sin(z * 0.06) * 0.03));
        continue;
      }

      const h = terrainHeightAt(x, z);
      const nearBank = Math.abs(x - riverCenterX(z)) < 24;
      const high = h > 5.8;
      const kind = nearBank ? 'bank' : high ? 'grass' : 'terrain';
      const baseColor = nearBank ? '#c6a46d' : high ? '#7d8f52' : '#9f8756';
      const shade = Math.sin(x * 0.13 + z * 0.07) * 0.035 + Math.cos(z * 0.17) * 0.02;
      batch.add(kind, x, h / 2 - 0.02, z, TERRAIN_CELL * 1.02, h, TERRAIN_CELL * 1.02, vary(baseColor, shade));

      if (nearBank && Math.abs(Math.sin(z * 0.11 + x)) > 0.92) {
        batch.addTop('vegetation', x, h, z, 1.4, 2.2, 1.4, vary('#617b44', shade), 0);
      }
    }
  }
}

function buildRoads(addRoadRect, addTiledRect) {
  addRoadRect('Decumanus to Forum', -124, -25, 110, 9, 'road');
  addRoadRect('Via Sacra west approach', -54, -22, 52, 9, 'road');
  addRoadRect('Via Labicana east approach', 86, -22, 104, 9, 'road');
  addRoadRect('Cardo north', 48, -112, 10, 126, 'road');
  addRoadRect('Cardo south', 55, 82, 10, 88, 'road');
  addRoadRect('Circus connector', -54, 94, 118, 8, 'road');
  addRoadRect('Forum north cardo', -114, -64, 10, 62, 'road');
  addRoadRect('Tiber bridge road north', -156, -72, 58, 10, 'basalt');
  addRoadRect('Tiber bridge road south', -156, 68, 58, 10, 'basalt');

  addTiledRect('road', 0, 0, 118, 96, { color: '#81715f', height: 0.12, tile: 4.2, baseOffset: 0.015 });
}

function buildColosseum({ batch, addTop, addTiledRect, addLabel, rng, materials, animated }) {
  const cx = 0;
  const cz = 0;
  const base = topY(cx, cz) + 0.12;
  const outerA = 43;
  const outerB = 33;
  const innerA = 17;
  const innerB = 10.5;
  const segments = 96;

  addTiledRect('travertine', cx, cz, 99, 77, { height: 0.24, color: '#cdb58c', tile: 3.6, baseOffset: 0.04 });

  for (let level = 0; level < 4; level += 1) {
    const y = base + level * 4.25;
    const sy = level === 3 ? 3.2 : 3.55;
    const ringA = outerA - level * 0.9;
    const ringB = outerB - level * 0.65;
    for (let i = 0; i < segments; i += 1) {
      const theta = (i / segments) * Math.PI * 2;
      const x = cx + Math.cos(theta) * ringA;
      const z = cz + Math.sin(theta) * ringB;
      const tx = -Math.sin(theta) * ringA;
      const tz = Math.cos(theta) * ringB;
      const yaw = yawForVector(tx, tz);
      const bayColor = vary('#d8c29b', ((i + level) % 5) * 0.012 - 0.02);
      batch.add('travertine', x, y + sy / 2, z, 2.9, sy, 2.0, bayColor, yaw);

      if (i % 2 === 0 && level < 3) {
        const normalX = Math.cos(theta);
        const normalZ = Math.sin(theta);
        batch.add(
          'shadow',
          x + normalX * 1.24,
          y + sy * 0.48,
          z + normalZ * 1.24,
          1.38,
          sy * 0.55,
          0.25,
          vary('#2e2924', 0.02),
          yaw
        );
      }
    }
  }

  for (let tier = 0; tier < 9; tier += 1) {
    const a = innerA + 4.2 + tier * 2.35;
    const b = innerB + 3.2 + tier * 1.78;
    const y = base + 0.8 + tier * 1.38;
    for (let i = 0; i < segments; i += 1) {
      const theta = (i / segments) * Math.PI * 2;
      const x = cx + Math.cos(theta) * a;
      const z = cz + Math.sin(theta) * b;
      const tx = -Math.sin(theta) * a;
      const tz = Math.cos(theta) * b;
      const yaw = yawForVector(tx, tz);
      batch.add('marble', x, y, z, 2.2, 0.72, 1.8, vary('#d4c09a', tier * 0.006 - 0.02), yaw);

      if (tier > 1 && i % 5 === 0 && rng() > 0.25) {
        const crowdColor = ['#7d3041', '#b96038', '#d8a334', '#587177', '#efe3c8'][Math.floor(rng() * 5)];
        batch.add('crowd', x, y + 0.85, z, 0.72, 1.05, 0.72, vary(crowdColor, rng() * 0.08 - 0.04), yaw);
      }
    }
  }

  for (let x = -innerA + 2; x <= innerA - 2; x += 4) {
    for (let z = -innerB + 1; z <= innerB - 1; z += 3) {
      const inside = (x * x) / (innerA * innerA) + (z * z) / (innerB * innerB) < 1;
      if (!inside) continue;
      const material = Math.abs(x) < 3 || Math.abs(z) < 2 ? 'shadow' : 'sand';
      batch.addTop(material, cx + x, base - 0.34, cz + z, 3.6, 0.28, 2.6, material === 'shadow' ? vary('#2e2924', 0.04) : vary('#d7b56f', 0.02), 0);
    }
  }

  for (let x = -13; x <= 13; x += 6.5) {
    batch.addTop('wood', cx + x, base - 0.02, cz, 0.9, 1.5, innerB * 1.65, vary('#7a4d30', 0.02));
  }
  for (let z = -7.5; z <= 7.5; z += 5) {
    batch.addTop('wood', cx, base, cz + z, innerA * 1.55, 1.15, 0.75, vary('#7a4d30', -0.02));
  }

  for (let i = 0; i < 32; i += 1) {
    const theta = (i / 32) * Math.PI * 2;
    const x = Math.cos(theta) * 34;
    const z = Math.sin(theta) * 25;
    const yaw = yawForVector(Math.cos(theta), Math.sin(theta));
    batch.add('cloth', x, base + 19.4, z, 15.5, 0.32, 2.4, vary('#f0dfb2', i % 3 === 0 ? 0.04 : -0.015), yaw);
    batch.add('wood', Math.cos(theta) * 44.5, base + 17.6, Math.sin(theta) * 34.3, 0.55, 5.3, 0.55, vary('#7a4d30', 0.02));
  }

  createGladiator({ materials, animated, x: -5.3, z: 0.7, base, primary: 0x7d3041, phase: 0 });
  createGladiator({ materials, animated, x: 5.2, z: -1.2, base, primary: 0xb96038, phase: Math.PI });

  addLabel('Colosseum', cx, base + 25, cz);
}

function createGladiator({ materials, animated, x, z, base, primary, phase }) {
  const group = new THREE.Group();
  group.position.set(x, base + 0.15, z);

  const make = (kind, sx, sy, sz, px, py, pz, color = 0xffffff) => {
    const material = materials[kind].clone();
    material.color.set(color);
    material.vertexColors = false;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(px, py, pz);
    group.add(mesh);
    return mesh;
  };

  make('skin', 0.72, 0.72, 0.72, 0, 2.8, 0, 0xb47a54);
  make('crowd', 0.9, 1.2, 0.58, 0, 1.9, 0, primary);
  make('skin', 0.28, 0.9, 0.28, -0.34, 0.8, 0, 0xb47a54);
  make('skin', 0.28, 0.9, 0.28, 0.34, 0.8, 0, 0xb47a54);
  const shield = make('porphyry', 0.16, 1.2, 0.9, -0.68, 1.85, 0.08, primary);
  const sword = make('gold', 0.12, 1.7, 0.12, 0.76, 2.06, 0, 0xd8a334);
  sword.rotation.z = -0.58;

  animated.push({
    object: group,
    update(elapsed) {
      const t = elapsed * 1.4 + phase;
      group.position.x = x + Math.sin(t) * 1.1;
      group.position.z = z + Math.cos(t * 0.9) * 0.8;
      group.rotation.y = Math.sin(t * 0.7) * 0.55;
      shield.position.y = 1.82 + Math.sin(t * 3) * 0.08;
      sword.rotation.z = -0.58 + Math.sin(t * 4) * 0.24;
    }
  });
}

function buildPedestrians({ animated, rng }) {
  const routes = createPedestrianRoutes();
  const pedestrians = [];

  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) {
    const route = routes[i % routes.length];
    pedestrians.push({
      route,
      distance: rng() * route.length,
      speed: 3.6 + rng() * 4.4,
      lane: (rng() - 0.5) * route.width,
      phase: rng() * Math.PI * 2,
      scale: 1.18 + rng() * 0.36
    });
  }

  const group = new THREE.Group();
  group.name = 'walking-street-pedestrians';

  const parts = {
    body: makePedestrianMesh(pedestrians.length, 'pedestrian-body', 0xdb7042),
    head: makePedestrianMesh(pedestrians.length, 'pedestrian-head', 0xd09a6d),
    hair: makePedestrianMesh(pedestrians.length, 'pedestrian-hair', 0xb07842),
    belt: makePedestrianMesh(pedestrians.length, 'pedestrian-belt', 0xd8a334),
    leftLeg: makePedestrianMesh(pedestrians.length, 'pedestrian-left-leg', 0xc58a61),
    rightLeg: makePedestrianMesh(pedestrians.length, 'pedestrian-right-leg', 0xc58a61),
    leftArm: makePedestrianMesh(pedestrians.length, 'pedestrian-left-arm', 0xd09a6d),
    rightArm: makePedestrianMesh(pedestrians.length, 'pedestrian-right-arm', 0xd09a6d)
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
  const material = new THREE.MeshBasicMaterial({
    color,
    vertexColors: false,
    fog: false
  });
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
    { width: 5.6, loop: false, points: [[-166, -25], [120, -22]] },
    { width: 5.0, loop: false, points: [[48, -170], [48, -45], [52, 30], [55, 132]] },
    { width: 4.4, loop: false, points: [[-116, -92], [-114, -48], [-114, -4]] },
    { width: 4.2, loop: false, points: [[-118, 94], [-54, 94], [8, 94]] },
    { width: 4.8, loop: false, points: [[-184, -72], [-156, -72], [-126, -72]] },
    { width: 4.8, loop: false, points: [[-184, 68], [-156, 68], [-126, 68]] },
    { width: 6.2, loop: true, points: [[-162, -55], [-92, -55], [-88, -2], [-166, -2]] },
    { width: 5.4, loop: true, points: [[-102, -9], [-54, -18], [-42, 50], [-78, 28]] },
    { width: 8.8, loop: true, ellipse: { x: 0, z: 0, rx: 58, rz: 45, segments: 44 } },
    { width: 6.4, loop: true, ellipse: { x: -76, z: 132, rx: 63, rz: 26, segments: 36 } },
    { width: 5.0, loop: true, points: [[46, -62], [104, -62], [106, -12], [42, -12]] },
    { width: 5.0, loop: true, points: [[-101, -9], [-54, -9], [-54, 31], [-101, 31]] }
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
    segments.push({
      a,
      b,
      dx,
      dz,
      length: segmentLength,
      start: length
    });
    length += segmentLength;
  }

  return {
    width: route.width,
    loop: route.loop,
    points,
    segments,
    length
  };
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
  const tangentX = segment.dx * invLength * direction;
  const tangentZ = segment.dz * invLength * direction;

  return { x, z, tangentX, tangentZ };
}

function updatePedestrians(parts, pedestrians, elapsed) {
  pedestrians.forEach((person, index) => {
    const sample = sampleRoute(person.route, person.distance + elapsed * person.speed);
    const x = sample.x - sample.tangentZ * person.lane;
    const z = sample.z + sample.tangentX * person.lane;
    const y = topY(x, z) + 0.08;
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const stride = Math.sin(elapsed * 8.2 + person.phase) * 0.18;
    const bob = Math.abs(Math.sin(elapsed * 8.2 + person.phase)) * 0.07;
    const scale = person.scale;

    setPedestrianPart(parts.body, index, x, y + bob, z, yaw, 0, 1.24, 0, 0.7 * scale, 1.12 * scale, 0.48 * scale);
    setPedestrianPart(parts.belt, index, x, y + bob, z, yaw, 0, 0.88, -0.01, 0.78 * scale, 0.12 * scale, 0.52 * scale);
    setPedestrianPart(parts.head, index, x, y + bob, z, yaw, 0, 2.02, 0, 0.52 * scale, 0.52 * scale, 0.52 * scale);
    setPedestrianPart(parts.hair, index, x, y + bob, z, yaw, 0, 2.31, -0.03, 0.5 * scale, 0.14 * scale, 0.5 * scale);
    setPedestrianPart(parts.leftLeg, index, x, y, z, yaw, -0.18, 0.44, stride, 0.18 * scale, 0.78 * scale, 0.18 * scale);
    setPedestrianPart(parts.rightLeg, index, x, y, z, yaw, 0.18, 0.44, -stride, 0.18 * scale, 0.78 * scale, 0.18 * scale);
    setPedestrianPart(parts.leftArm, index, x, y + bob, z, yaw, -0.5, 1.18, -stride * 0.72, 0.16 * scale, 0.72 * scale, 0.16 * scale);
    setPedestrianPart(parts.rightArm, index, x, y + bob, z, yaw, 0.5, 1.18, stride * 0.72, 0.16 * scale, 0.72 * scale, 0.16 * scale);
  });

  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

const pedestrianMatrix = new THREE.Matrix4();
const pedestrianPosition = new THREE.Vector3();
const pedestrianQuaternion = new THREE.Quaternion();
const pedestrianScale = new THREE.Vector3();

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

function buildForum({ batch, addTop, addTiledRect, addLabel }) {
  const x = -128;
  const z = -28;
  addTiledRect('marble', x, z, 72, 48, { height: 0.2, color: '#d9c8a2', tile: 3.2 });
  buildColonnadeLine(batch, -162, -55, -92, -55, 14, 8.2);
  buildColonnadeLine(batch, -162, -2, -92, -2, 14, 8.2);
  buildColonnadeLine(batch, -166, -51, -166, -6, 8, 7.4);
  buildColonnadeLine(batch, -88, -51, -88, -6, 8, 7.4);

  addTop('gold', -130, -29, 4.4, 7.8, 4.4, 0xd8a334, 0, topY(-130, -29) + 0.2);
  addTop('porphyry', -130, -29, 8, 1.2, 8, 0x7d3041, 0, topY(-130, -29));
  addLabel('Forum Romanum', x, topY(x, z) + 14, z);
}

function buildArchOfConstantine({ batch, addTop, addLabel }) {
  const x = -42;
  const z = 50;
  const base = topY(x, z) + 0.1;
  const yaw = 0;

  [-8, -2.6, 2.6, 8].forEach((dx, index) => {
    const width = index === 1 || index === 2 ? 2.2 : 3.2;
    batch.addTop('travertine', x + dx, base, z, width, 12, 6.5, vary('#d8c29b', index * 0.012), yaw);
  });
  batch.addTop('travertine', x, base + 11.8, z, 20, 3.5, 6.8, vary('#d8c29b', -0.02), yaw);
  batch.addTop('marble', x, base + 15.1, z, 21.5, 5.0, 7.4, vary('#efe3c8', -0.01), yaw);
  batch.addTop('gold', x, base + 20.1, z - 3.85, 13.2, 0.6, 0.35, 0xd8a334, yaw);
  [-5.2, 5.2].forEach((dx) => batch.addTop('shadow', x + dx, base + 2.2, z - 3.45, 4.2, 7.5, 0.3, 0x2e2924, yaw));
  batch.addTop('shadow', x, base + 2.2, z - 3.5, 3.0, 9.3, 0.32, 0x2e2924, yaw);
  addLabel('Arch of Constantine', x, base + 23, z);
}

function buildTempleVenusRoma({ batch, addTop, addTiledRect, addLabel }) {
  const x = -78;
  const z = 10;
  const base = topY(x, z) + 0.08;
  addTiledRect('marble', x, z, 48, 34, { height: 0.22, color: '#e1d1ad', tile: 3.3 });
  batch.addTop('travertine', x, base, z, 43, 2.4, 28, vary('#d8c29b', -0.02));

  for (let ix = -18; ix <= 18; ix += 6) {
    batch.addTop('marble', x + ix, base + 2.4, z - 12, 1.3, 9.2, 1.3, vary('#efe3c8', 0.0));
    batch.addTop('marble', x + ix, base + 2.4, z + 12, 1.3, 9.2, 1.3, vary('#efe3c8', -0.015));
  }
  for (let iz = -8; iz <= 8; iz += 6) {
    batch.addTop('marble', x - 20, base + 2.4, z + iz, 1.3, 9.2, 1.3, vary('#efe3c8', 0.01));
    batch.addTop('marble', x + 20, base + 2.4, z + iz, 1.3, 9.2, 1.3, vary('#efe3c8', -0.01));
  }

  batch.addTop('marble', x - 7, base + 2.5, z, 12, 8.2, 16, vary('#efe3c8', -0.02));
  batch.addTop('marble', x + 7, base + 2.5, z, 12, 8.2, 16, vary('#efe3c8', 0.0));
  batch.addTop('terracotta', x, base + 10.6, z, 42, 2.1, 27, vary('#b96038', 0.03));
  batch.addTop('gold', x, base + 13.1, z, 35, 0.8, 2.2, 0xd8a334);
  addLabel('Temple of Venus and Roma', x, base + 18, z);
}

function buildBasilicas({ batch, addTop, addTiledRect, addLabel }) {
  buildBasilica(batch, addTop, addTiledRect, -126, 15, 62, 18, 'Basilica Julia');
  buildBasilica(batch, addTop, addTiledRect, 78, -38, 54, 38, 'Basilica of Maxentius', true);
  addLabel('Basilica Julia', -126, topY(-126, 15) + 18, 15);
  addLabel('Basilica Maxentius', 78, topY(78, -38) + 24, -38);
}

function buildBasilica(batch, addTop, addTiledRect, x, z, width, depth, _name, vaulted = false) {
  const base = topY(x, z) + 0.08;
  addTiledRect('marble', x, z, width + 4, depth + 4, { height: 0.18, color: '#d8c7a4', tile: 3.2 });
  batch.addTop('stucco', x, base, z, width, vaulted ? 13 : 9, 2.2, vary('#d2b78a', -0.01));
  batch.addTop('stucco', x, base, z - depth / 2, width, vaulted ? 12 : 8, 2.1, vary('#d2b78a', 0.01));
  batch.addTop('stucco', x, base, z + depth / 2, width, vaulted ? 12 : 8, 2.1, vary('#d2b78a', -0.02));
  batch.addTop('stucco', x - width / 2, base, z, 2.1, vaulted ? 12 : 8, depth, vary('#d2b78a', 0.0));
  batch.addTop('stucco', x + width / 2, base, z, 2.1, vaulted ? 12 : 8, depth, vary('#d2b78a', 0.015));

  for (let ix = x - width / 2 + 9; ix <= x + width / 2 - 9; ix += 9) {
    batch.addTop('shadow', ix, base + 2.5, z - depth / 2 - 1.08, 4.4, 4.8, 0.35, 0x2e2924);
    batch.addTop('shadow', ix, base + 2.5, z + depth / 2 + 1.08, 4.4, 4.8, 0.35, 0x2e2924);
  }

  if (vaulted) {
    for (let ix = -width / 2 + 6; ix <= width / 2 - 6; ix += 12) {
      batch.addTop('terracotta', x + ix, base + 12, z, 8.5, 2.2, depth + 3, vary('#b96038', 0.02));
    }
  } else {
    batch.addTop('terracotta', x, base + 8.8, z, width + 2, 2.1, depth + 3, vary('#b96038', 0.0));
  }
}

function buildAqueducts({ batch, addTop, addLabel }) {
  const x = 148;
  for (let z = -154; z <= 124; z += 13) {
    const base = topY(x, z);
    addTop('travertine', x, z, 2.2, 18, 2.2, vary('#d8c29b', 0.01), 0, base);
    addTop('travertine', x, z + 6.5, 3.2, 2.2, 13, vary('#d8c29b', -0.02), 0, base + 17.8);
    addTop('shadow', x - 1.7, z + 6.4, 0.4, 9.5, 7.5, 0x2e2924, 0, base + 6.1);
  }
  addTop('water', x, -15, 4.8, 0.65, 290, vary('#7fc3c0', 0.04), 0, topY(x, -15) + 21.4);
  addLabel('Aqueducts', x, topY(x, -15) + 28, -15);
}

function buildCircusMaximus({ batch, addTop, addTiledRect, addLabel }) {
  const x = -76;
  const z = 132;
  const base = topY(x, z) + 0.05;
  addTiledRect('sand', x, z, 122, 46, { height: 0.16, color: '#d7b56f', tile: 3.4 });

  for (let ix = -54; ix <= 54; ix += 5.5) {
    addTop('travertine', x + ix, z - 26, 4.2, 1.4, 5.4, vary('#cdb58c', -0.03), 0, topY(x + ix, z - 26));
    addTop('travertine', x + ix, z + 26, 4.2, 1.4, 5.4, vary('#cdb58c', -0.01), 0, topY(x + ix, z + 26));
  }
  for (let tier = 0; tier < 4; tier += 1) {
    addTop('travertine', x, z - 30 - tier * 2.4, 118 - tier * 8, 1.2, 3.2, vary('#d8c29b', tier * 0.01), 0, base + tier * 1.1);
    addTop('travertine', x, z + 30 + tier * 2.4, 118 - tier * 8, 1.2, 3.2, vary('#d8c29b', tier * 0.01), 0, base + tier * 1.1);
  }
  addTop('porphyry', x, z, 74, 0.7, 2.8, 0x7d3041, 0, base + 0.2);
  addTop('gold', x - 18, z, 2.1, 12, 2.1, 0xd8a334, 0, base + 0.8);
  addTop('gold', x + 24, z, 2.1, 9, 2.1, 0xd8a334, 0, base + 0.8);
  addLabel('Circus Maximus', x, base + 18, z);
}

function buildTiberBridges({ batch, addTop, addLabel }) {
  [
    { x: -156, z: -72, name: 'Tiber Bridge' },
    { x: -156, z: 68, name: 'Tiber Bridge' }
  ].forEach((bridge) => {
    const base = 1.35;
    addTop('travertine', bridge.x, bridge.z, 52, 1.8, 10, vary('#d8c29b', -0.02), 0, base);
    for (let dx = -20; dx <= 20; dx += 10) {
      addTop('shadow', bridge.x + dx, bridge.z, 4.4, 2.2, 7, 0x2e2924, 0, 0.55);
    }
    addLabel(bridge.name, bridge.x, 8, bridge.z);
  });
}

function buildHillsLabels(addLabel) {
  for (const hill of HILLS) {
    addLabel(hill.name, hill.x, terrainHeightAt(hill.x, hill.z) + 8, hill.z);
  }
}

function buildInsulae({ planner, batch, addTop, rng }) {
  let placed = 0;
  const attempts = [];
  for (let x = -145; x <= 132; x += 15) {
    for (let z = -166; z <= 166; z += 15) {
      attempts.push([x + (rng() - 0.5) * 4.8, z + (rng() - 0.5) * 4.8]);
    }
  }

  attempts.sort(() => rng() - 0.5);

  for (const [x, z] of attempts) {
    if (placed >= 245) break;
    if (rng() < 0.18) continue;
    const width = 8 + Math.floor(rng() * 4) * 3.2;
    const depth = 8 + Math.floor(rng() * 4) * 3.1;
    const floors = 2 + Math.floor(rng() * 4);
    if (!planner.reserveRect('insula', x, z, width + 2.2, depth + 2.2, { type: 'insula' })) continue;
    buildInsula(batch, addTop, x, z, width, depth, floors, rng);
    placed += 1;
  }
}

function buildInsula(batch, addTop, x, z, width, depth, floors, rng) {
  const base = topY(x, z) + 0.08;
  const floorHeight = 2.75;
  const height = floors * floorHeight;
  const body = rng() > 0.5 ? 'brick' : 'stucco';
  const bodyColor = body === 'brick' ? '#9f583d' : '#d2b78a';
  const courtyard = width > 14 && depth > 14 && rng() > 0.55;

  addTop('travertine', x, z, width + 0.8, 0.9, depth + 0.8, vary('#bba47f', -0.02), 0, base);

  if (courtyard) {
    const wall = 2.5;
    addTop(body, x, z - depth / 2 + wall / 2, width, height, wall, vary(bodyColor, rng() * 0.06 - 0.03), 0, base + 0.85);
    addTop(body, x, z + depth / 2 - wall / 2, width, height, wall, vary(bodyColor, rng() * 0.06 - 0.03), 0, base + 0.85);
    addTop(body, x - width / 2 + wall / 2, z, wall, height, depth, vary(bodyColor, rng() * 0.06 - 0.03), 0, base + 0.85);
    addTop(body, x + width / 2 - wall / 2, z, wall, height, depth, vary(bodyColor, rng() * 0.06 - 0.03), 0, base + 0.85);
    addTop('marble', x, z, width - wall * 2.2, 0.2, depth - wall * 2.2, vary('#d9c8a2', -0.03), 0, base + 1.0);
  } else {
    addTop(body, x, z, width, height, depth, vary(bodyColor, rng() * 0.07 - 0.035), 0, base + 0.85);
  }

  const baysX = Math.max(2, Math.floor(width / 4));
  const baysZ = Math.max(2, Math.floor(depth / 4));
  for (let floor = 0; floor < floors; floor += 1) {
    const wy = base + 1.65 + floor * floorHeight;
    for (let bay = 1; bay < baysX; bay += 1) {
      const wx = x - width / 2 + (bay / baysX) * width;
      batch.add('shadow', wx, wy, z - depth / 2 - 0.11, 1.1, 1.0, 0.22, 0x2e2924);
      batch.add('shadow', wx, wy, z + depth / 2 + 0.11, 1.1, 1.0, 0.22, 0x2e2924);
    }
    for (let bay = 1; bay < baysZ; bay += 1) {
      const wz = z - depth / 2 + (bay / baysZ) * depth;
      batch.add('shadow', x - width / 2 - 0.11, wy, wz, 0.22, 1.0, 1.1, 0x2e2924);
      batch.add('shadow', x + width / 2 + 0.11, wy, wz, 0.22, 1.0, 1.1, 0x2e2924);
    }
  }

  addTop('terracotta', x, z, width + 1.0, 1.0, depth + 1.0, vary('#b96038', rng() * 0.08 - 0.02), 0, base + height + 0.9);
  addTop('terracotta', x, z, width * 0.34, 1.0, depth + 1.6, vary('#b96038', 0.04), 0, base + height + 1.7);
}

function buildColonnadeLine(batch, x1, z1, x2, z2, count, height) {
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;
    const base = topY(x, z);
    batch.addTop('marble', x, base, z, 1.25, height, 1.25, vary('#efe3c8', i % 2 ? -0.015 : 0.015));
    batch.addTop('travertine', x, base + height, z, 2.6, 0.55, 2.6, vary('#d8c29b', -0.02));
  }
}
