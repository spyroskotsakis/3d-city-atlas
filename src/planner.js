export class Planner {
  constructor({ bounds, isRiver }) {
    this.bounds = bounds;
    this.isRiver = isRiver;
    this.reservations = [];
  }

  reserveRect(tag, x, z, width, depth, options = {}) {
    const rect = {
      tag,
      type: options.type ?? 'reserved',
      x1: x - width / 2,
      x2: x + width / 2,
      z1: z - depth / 2,
      z2: z + depth / 2
    };

    if (!options.force && !this.canPlaceRect(x, z, width, depth)) return false;
    this.reservations.push(rect);
    return true;
  }

  canPlaceRect(x, z, width, depth) {
    const rect = {
      x1: x - width / 2,
      x2: x + width / 2,
      z1: z - depth / 2,
      z2: z + depth / 2
    };

    if (
      rect.x1 < -this.bounds ||
      rect.x2 > this.bounds ||
      rect.z1 < -this.bounds ||
      rect.z2 > this.bounds
    ) {
      return false;
    }

    const samples = [
      [rect.x1, rect.z1],
      [rect.x1, rect.z2],
      [rect.x2, rect.z1],
      [rect.x2, rect.z2],
      [x, z]
    ];

    if (samples.some(([sx, sz]) => this.isRiver(sx, sz, 5))) return false;
    return !this.reservations.some((reserved) => rectsIntersect(rect, reserved));
  }

  hasPoint(x, z, type) {
    return this.reservations.some((rect) => {
      if (type && rect.type !== type) return false;
      return x >= rect.x1 && x <= rect.x2 && z >= rect.z1 && z <= rect.z2;
    });
  }
}

export function rectsIntersect(a, b) {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.z1 < b.z2 && a.z2 > b.z1;
}
