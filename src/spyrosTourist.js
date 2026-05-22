import * as THREE from 'three';

const LETTER_PATTERN = {
  S: [
    [0, 0], [1, 0], [2, 0],
    [0, 1],
    [0, 2], [1, 2], [2, 2],
    [2, 3],
    [0, 4], [1, 4], [2, 4]
  ],
  P: [
    [0, 0], [1, 0],
    [0, 1], [2, 1],
    [0, 2], [1, 2],
    [0, 3],
    [0, 4]
  ],
  Y: [
    [0, 0], [2, 0],
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4]
  ],
  R: [
    [0, 0], [1, 0],
    [0, 1], [2, 1],
    [0, 2], [1, 2],
    [0, 3], [2, 3],
    [0, 4], [2, 4]
  ],
  O: [
    [0, 0], [1, 0], [2, 0],
    [0, 1], [2, 1],
    [0, 2], [2, 2],
    [0, 3], [2, 3],
    [0, 4], [1, 4], [2, 4]
  ]
};

const CITY_ROUTE_OFFSETS = [
  [-20, 18],
  [-6, 7],
  [14, 4],
  [24, 18],
  [8, 34],
  [-16, 28]
];

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();

export function buildSpyrosTourists({ modules, focusTargets }) {
  const tourists = modules.map((module, index) => {
    const target = focusTargets[`${module.id}:${module.view.targetKey}`] ?? module.origin;
    const route = buildCityRoute(module, target);
    const baseDistance = (index * 13.7) % route.length;
    const initial = sampleRoute(route, baseDistance);
    return {
      cityId: module.id,
      cityName: module.name,
      route,
      baseDistance,
      speed: 2.05 + (index % 5) * 0.11,
      walkHz: 4.9 + (index % 4) * 0.26,
      phase: index * 0.73,
      pauseEvery: 13.5 + (index % 3) * 1.2,
      pauseDuration: 3.6 + (index % 4) * 0.35,
      lane: ((index % 3) - 1) * 0.9,
      scale: 1.22,
      labelPosition: new THREE.Vector3(initial.x, initial.y + 6.5, initial.z),
      focusTarget: new THREE.Vector3(initial.x, initial.y + 4.5, initial.z)
    };
  });

  const group = new THREE.Group();
  group.name = 'spyros-recurring-tourist-personas';

  const parts = {
    shoes: makeMesh(tourists.length, 'spyros-shoes', 0x181b1f),
    leftLeg: makeMesh(tourists.length, 'spyros-left-leg', 0x26384f),
    rightLeg: makeMesh(tourists.length, 'spyros-right-leg', 0x26384f),
    shirt: makeMesh(tourists.length, 'spyros-shirt', 0xf4f0df),
    jacket: makeMesh(tourists.length, 'spyros-open-jacket', 0x1f5f73),
    head: makeMesh(tourists.length, 'spyros-head', 0xc98d63),
    hair: makeMesh(tourists.length, 'spyros-hair', 0x3c2d24),
    sunglasses: makeMesh(tourists.length, 'spyros-sunglasses', 0x111418),
    leftArm: makeMesh(tourists.length, 'spyros-left-arm', 0xc98d63),
    rightArm: makeMesh(tourists.length, 'spyros-right-arm', 0xc98d63),
    backpack: makeMesh(tourists.length, 'spyros-backpack', 0x7d3041),
    camera: makeMesh(tourists.length, 'spyros-camera', 0x22262a),
    bubbleStem: makeMesh(tourists.length, 'spyros-thought-bubble-stem', 0xfff4dc),
    bubbleDotA: makeMesh(tourists.length, 'spyros-thought-bubble-dot-a', 0xfff4dc),
    bubbleDotB: makeMesh(tourists.length, 'spyros-thought-bubble-dot-b', 0xfff4dc),
    bubblePanel: makeMesh(tourists.length, 'spyros-thought-bubble-panel', 0xfff4dc),
    letters: makeMesh(tourists.length * countLetterBlocks('SPYROS'), 'spyros-shirt-name-spyros', 0xd62828)
  };

  Object.values(parts).forEach((mesh) => group.add(mesh));

  function update(elapsed) {
    updateTourists(parts, tourists, elapsed);
  }

  update(0);

  return {
    group,
    labels: tourists.map((tourist) => {
      return {
        name: `SPYROS in ${tourist.cityName}`,
        city: tourist.cityName,
        position: tourist.labelPosition
      };
    }),
    focusTargets: Object.fromEntries(
      tourists.map((tourist) => {
        return [`${tourist.cityId}:spyros`, tourist.focusTarget];
      })
    ),
    metrics: {
      spyrosTourists: tourists.length,
      instances: Object.entries(parts).reduce((sum, [, mesh]) => sum + mesh.count, 0)
    },
    update
  };
}

function buildCityRoute(module, target) {
  const localTarget = target.clone().sub(module.origin);
  const centerX = localTarget.x;
  const centerZ = localTarget.z;
  const points = CITY_ROUTE_OFFSETS.map(([ox, oz], index) => {
    const x = clamp(centerX + ox, -module.bounds + 24, module.bounds - 24);
    const z = clamp(centerZ + oz, -module.bounds + 24, module.bounds - 24);
    const y = module.origin.y + module.heightAt(x, z) + 0.08;
    return {
      x: module.origin.x + x,
      y,
      z: module.origin.z + z,
      stop: index % 2 === 1
    };
  });
  return prepareRoute(points);
}

function prepareRoute(points) {
  const closed = [...points, points[0]];
  const segments = [];
  let timelineLength = 0;
  for (let i = 0; i < closed.length - 1; i += 1) {
    const a = closed[i];
    const b = closed[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const segmentLength = Math.hypot(dx, dz);
    if (segmentLength <= 0.001) continue;
    const holdLength = b.stop ? 7.5 : 0;
    segments.push({
      a,
      b,
      dx,
      dy,
      dz,
      length: segmentLength,
      holdLength,
      start: timelineLength,
      holdStart: timelineLength + segmentLength,
      totalLength: segmentLength + holdLength
    });
    timelineLength += segmentLength + holdLength;
  }
  return { points: closed, segments, length: Math.max(timelineLength, 0.001) };
}

function sampleRoute(route, distance) {
  const d = ((distance % route.length) + route.length) % route.length;
  const segment = route.segments.find((candidate) => d <= candidate.start + candidate.totalLength) ?? route.segments[route.segments.length - 1];
  const invLength = 1 / segment.length;
  const tangentX = segment.dx * invLength;
  const tangentZ = segment.dz * invLength;
  if (segment.holdLength > 0 && d >= segment.holdStart) {
    return {
      x: segment.b.x,
      y: segment.b.y,
      z: segment.b.z,
      tangentX,
      tangentZ,
      stop: true
    };
  }

  const t = Math.max(0, Math.min(1, (d - segment.start) / segment.length));
  return {
    x: segment.a.x + segment.dx * t,
    y: segment.a.y + segment.dy * t,
    z: segment.a.z + segment.dz * t,
    tangentX,
    tangentZ,
    stop: false
  };
}

function touristDistance(tourist, elapsed) {
  const cycle = tourist.pauseEvery + tourist.pauseDuration;
  const cycleTime = (elapsed + tourist.phase) % cycle;
  const pausesElapsed = Math.floor((elapsed + tourist.phase) / cycle);
  const activeTime = pausesElapsed * tourist.pauseEvery + Math.min(cycleTime, tourist.pauseEvery);
  return tourist.baseDistance + activeTime * tourist.speed;
}

function updateTourists(parts, tourists, elapsed) {
  let letterIndex = 0;
  tourists.forEach((tourist, index) => {
    const cycle = tourist.pauseEvery + tourist.pauseDuration;
    const cycleTime = (elapsed + tourist.phase) % cycle;
    const cyclePause = cycleTime > tourist.pauseEvery;
    const sample = sampleRoute(tourist.route, touristDistance(tourist, elapsed));
    const paused = cyclePause || sample.stop;
    const x = sample.x - sample.tangentZ * tourist.lane;
    const z = sample.z + sample.tangentX * tourist.lane;
    const y = sample.y;
    tourist.labelPosition.set(x, y + 6.5, z);
    tourist.focusTarget.set(x, y + 4.5, z);
    const yaw = Math.atan2(sample.tangentX, sample.tangentZ);
    const look = paused ? Math.sin(elapsed * 1.65 + tourist.phase) * 0.74 : Math.sin(elapsed * 0.8 + tourist.phase) * 0.12;
    const rhythm = elapsed * tourist.walkHz + tourist.phase;
    const stride = paused ? 0 : Math.sin(rhythm) * 0.22;
    const armSwing = paused ? Math.sin(elapsed * 1.4 + tourist.phase) * 0.06 : -stride * 0.7;
    const bob = paused ? Math.sin(elapsed * 1.9 + tourist.phase) * 0.012 : Math.abs(Math.sin(rhythm)) * 0.075;
    const s = tourist.scale;
    const bubbleScale = paused ? 1 + Math.sin(elapsed * 2.2 + tourist.phase) * 0.08 : 0.001;

    setPart(parts.shoes, index, x, y, z, yaw, 0, 0.12, 0, 0.72 * s, 0.18 * s, 0.42 * s);
    setPart(parts.leftLeg, index, x, y, z, yaw, -0.16, 0.48, stride, 0.18 * s, 0.78 * s, 0.18 * s);
    setPart(parts.rightLeg, index, x, y, z, yaw, 0.16, 0.48, -stride, 0.18 * s, 0.78 * s, 0.18 * s);
    setPart(parts.shirt, index, x, y + bob, z, yaw, 0, 1.28, -0.01, 0.78 * s, 0.9 * s, 0.5 * s);
    setPart(parts.jacket, index, x, y + bob, z, yaw, 0, 1.3, -0.06, 0.92 * s, 0.96 * s, 0.12 * s);
    setPart(parts.backpack, index, x, y + bob, z, yaw, 0, 1.34, -0.36, 0.54 * s, 0.82 * s, 0.18 * s);
    setPart(parts.head, index, x, y + bob, z, yaw + look, 0, 2.02, 0, 0.48 * s, 0.5 * s, 0.48 * s);
    setPart(parts.hair, index, x, y + bob, z, yaw + look, 0, 2.31, -0.04, 0.5 * s, 0.16 * s, 0.48 * s);
    setPart(parts.sunglasses, index, x, y + bob, z, yaw + look, 0, 2.08, 0.25, 0.5 * s, 0.09 * s, 0.08 * s);
    setPart(parts.leftArm, index, x, y + bob, z, yaw, -0.55, 1.22, armSwing, 0.15 * s, 0.72 * s, 0.15 * s);
    setPart(parts.rightArm, index, x, y + bob, z, yaw, 0.55, 1.22, -armSwing, 0.15 * s, 0.72 * s, 0.15 * s);
    setPart(parts.camera, index, x, y + bob, z, yaw, 0.33, 1.58, 0.34, 0.3 * s, 0.24 * s, 0.16 * s);
    setPart(parts.bubbleStem, index, x, y, z, yaw, 0.46, 2.82, 0.1, 0.12 * bubbleScale, 0.42 * bubbleScale, 0.12 * bubbleScale);
    setPart(parts.bubbleDotA, index, x, y, z, yaw, 0.66, 3.15, 0.12, 0.22 * bubbleScale, 0.22 * bubbleScale, 0.22 * bubbleScale);
    setPart(parts.bubbleDotB, index, x, y, z, yaw, 0.86, 3.48, 0.12, 0.32 * bubbleScale, 0.32 * bubbleScale, 0.32 * bubbleScale);
    setPart(parts.bubblePanel, index, x, y, z, yaw + look * 0.25, 1.14, 3.82, 0.12, 1.3 * bubbleScale, 0.56 * bubbleScale, 0.18 * bubbleScale);
    letterIndex = setNameLetters(parts.letters, letterIndex, x, y + bob, z, yaw, s);
  });

  Object.values(parts).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
  });
}

function setNameLetters(mesh, startIndex, x, y, z, yaw, s) {
  const text = 'SPYROS';
  const block = 0.055 * s;
  const gap = 0.026 * s;
  let index = startIndex;
  let penX = -0.47 * s;
  for (const letter of text) {
    const pattern = LETTER_PATTERN[letter] ?? [];
    for (const [cx, cy] of pattern) {
      setPart(mesh, index, x, y, z, yaw, penX + cx * (block + gap), 1.36 * s - cy * (block + gap), 0.285 * s, block, block, 0.03 * s);
      index += 1;
    }
    penX += 0.18 * s;
  }
  return index;
}

function countLetterBlocks(text) {
  return [...text].reduce((sum, letter) => sum + (LETTER_PATTERN[letter]?.length ?? 0), 0);
}

function makeMesh(count, name, color) {
  const material = new THREE.MeshBasicMaterial({ color, vertexColors: false, fog: false });
  material.name = name;
  material.toneMapped = false;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, count);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  return mesh;
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
  scale.set(sx, sy, sz);
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(index, matrix);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
