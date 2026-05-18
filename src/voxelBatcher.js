import * as THREE from 'three';

const BASE_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

export class VoxelBatcher {
  constructor(materials) {
    this.materials = materials;
    this.instances = new Map();
  }

  add(kind, x, y, z, sx, sy, sz, color = null, yaw = 0) {
    if (!this.materials[kind]) {
      throw new Error(`Unknown voxel material: ${kind}`);
    }

    if (!this.instances.has(kind)) this.instances.set(kind, []);
    this.instances.get(kind).push({ x, y, z, sx, sy, sz, color, yaw });
  }

  addTop(kind, x, baseY, z, sx, sy, sz, color = null, yaw = 0) {
    this.add(kind, x, baseY + sy / 2, z, sx, sy, sz, color, yaw);
  }

  build() {
    const group = new THREE.Group();
    let total = 0;

    for (const [kind, records] of this.instances.entries()) {
      const mesh = new THREE.InstancedMesh(BASE_GEOMETRY, this.materials[kind], records.length);
      mesh.name = `voxels:${kind}`;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      const useInstanceColors = mesh.material.vertexColors === true;

      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const color = new THREE.Color();

      records.forEach((record, index) => {
        position.set(record.x, record.y, record.z);
        quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, record.yaw);
        scale.set(record.sx, record.sy, record.sz);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        if (useInstanceColors) {
          mesh.setColorAt(index, record.color == null ? color.setHex(mesh.material.userData.defaultColor ?? 0xffffff) : color.set(record.color));
        }
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      group.add(mesh);
      total += records.length;
    }

    return { group, total };
  }
}

export function yawForVector(dx, dz) {
  return Math.atan2(-dz, dx);
}
