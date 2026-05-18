import * as THREE from 'three';

const TILE_SIZE = 96;

const PALETTE = {
  terrain: '#9f8756',
  grass: '#7d8f52',
  bank: '#c6a46d',
  water: '#3f91aa',
  basalt: '#4e4941',
  road: '#746a5b',
  travertine: '#d8c29b',
  marble: '#efe3c8',
  porphyry: '#7d3041',
  terracotta: '#b96038',
  brick: '#9f583d',
  stucco: '#d2b78a',
  gold: '#d8a334',
  cloth: '#f0dfb2',
  sand: '#d7b56f',
  shadow: '#2e2924',
  wood: '#7a4d30',
  crowd: '#c57b54',
  skin: '#b47a54',
  vegetation: '#617b44',
  parisTerrain: '#b8aa7a',
  parisGrass: '#8da36a',
  cobblestone: '#77766d',
  limestone: '#d8cfb7',
  slate: '#5c6268',
  iron: '#7d654e',
  glass: '#9cc8c8',
  copper: '#75a26a',
  munichTerrain: '#b9a86f',
  munichGrass: '#7f9659',
  athensTerrain: '#c7b078',
  athensRock: '#a68f6d',
  athensGrass: '#7f8f55',
  nyTerrain: '#8f8a78',
  asphalt: '#34383d',
  concrete: '#8b8d88',
  steel: '#66727a',
  neon: '#f0c84b',
  londonTerrain: '#9d947b',
  londonGrass: '#687d55',
  berlinTerrain: '#8d897d',
  berlinGrass: '#5f774b',
  graffiti: '#5d5a57',
  neonPink: '#f25fa7',
  neonCyan: '#48d9ff',
  neonPurple: '#a66bff'
};

const TEXTURE_BASE = {
  water: '#ffffff',
  shadow: '#ffffff',
  gold: '#ffffff',
  porphyry: '#ffffff',
  terracotta: '#ffffff',
  vegetation: '#ffffff',
  slate: '#ffffff',
  iron: '#ffffff',
  glass: '#ffffff',
  copper: '#ffffff',
  asphalt: '#ffffff',
  concrete: '#ffffff',
  steel: '#ffffff',
  neon: '#ffffff',
  graffiti: '#ffffff',
  neonPink: '#ffffff',
  neonCyan: '#ffffff',
  neonPurple: '#ffffff'
};

function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tint(hex, amount) {
  const color = new THREE.Color(hex);
  const hsl = {};
  color.getHSL(hsl);
  hsl.l = Math.max(0, Math.min(1, hsl.l + amount));
  color.setHSL(hsl.h, hsl.s, hsl.l);
  return `#${color.getHexString()}`;
}

function drawNoise(ctx, rng, base, density = 900, alpha = 0.13) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  for (let i = 0; i < density; i += 1) {
    const shade = rng() > 0.5 ? 1 : -1;
    ctx.fillStyle = `${tint(base, shade * rng() * 0.16)}${Math.floor(alpha * 255)
      .toString(16)
      .padStart(2, '0')}`;
    ctx.fillRect(
      Math.floor(rng() * TILE_SIZE),
      Math.floor(rng() * TILE_SIZE),
      1 + Math.floor(rng() * 3),
      1 + Math.floor(rng() * 3)
    );
  }
}

function drawPaving(ctx, base, rng) {
  drawNoise(ctx, rng, base, 650, 0.16);
  ctx.strokeStyle = 'rgba(45, 38, 31, 0.26)';
  ctx.lineWidth = 1;
  for (let y = 12; y < TILE_SIZE; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.floor(rng() * 3));
    ctx.lineTo(TILE_SIZE, y + Math.floor(rng() * 3));
    ctx.stroke();
  }
  for (let x = 10; x < TILE_SIZE; x += 17) {
    ctx.beginPath();
    ctx.moveTo(x + Math.floor(rng() * 3), 0);
    ctx.lineTo(x + Math.floor(rng() * 3), TILE_SIZE);
    ctx.stroke();
  }
}

function drawBrick(ctx, base, rng) {
  drawNoise(ctx, rng, base, 500, 0.1);
  ctx.strokeStyle = 'rgba(72, 34, 25, 0.28)';
  ctx.lineWidth = 2;
  const h = 12;
  for (let y = 0; y <= TILE_SIZE; y += h) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TILE_SIZE, y);
    ctx.stroke();
    const offset = (y / h) % 2 === 0 ? 0 : 16;
    for (let x = -offset; x < TILE_SIZE; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
      ctx.stroke();
    }
  }
}

function drawMarble(ctx, base, rng) {
  drawNoise(ctx, rng, base, 420, 0.11);
  for (let i = 0; i < 18; i += 1) {
    ctx.strokeStyle = `rgba(124, 105, 86, ${0.12 + rng() * 0.12})`;
    ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath();
    const y = rng() * TILE_SIZE;
    ctx.moveTo(-10, y);
    for (let x = 0; x <= TILE_SIZE + 16; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.12 + rng() * 4) * (5 + rng() * 10));
    }
    ctx.stroke();
  }
}

function drawRoof(ctx, base, rng) {
  drawNoise(ctx, rng, base, 520, 0.11);
  ctx.fillStyle = 'rgba(82, 31, 20, 0.24)';
  for (let x = 4; x < TILE_SIZE; x += 10) {
    ctx.fillRect(x, 0, 2, TILE_SIZE);
  }
  ctx.strokeStyle = 'rgba(255, 210, 148, 0.18)';
  for (let y = 10; y < TILE_SIZE; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TILE_SIZE, y + Math.sin(y) * 2);
    ctx.stroke();
  }
}

function drawWater(ctx, base, rng) {
  const gradient = ctx.createLinearGradient(0, 0, TILE_SIZE, TILE_SIZE);
  gradient.addColorStop(0, '#3b8ea8');
  gradient.addColorStop(0.55, base);
  gradient.addColorStop(1, '#6bb8bf');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  for (let i = 0; i < 26; i += 1) {
    ctx.strokeStyle = `rgba(232, 244, 227, ${0.14 + rng() * 0.18})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const y = rng() * TILE_SIZE;
    ctx.moveTo(-8, y);
    for (let x = 0; x <= TILE_SIZE + 8; x += 12) {
      ctx.lineTo(x, y + Math.sin(x * 0.18 + rng() * 5) * 4);
    }
    ctx.stroke();
  }
}

function drawGraffiti(ctx, base, rng) {
  drawNoise(ctx, rng, base, 520, 0.16);
  const colors = ['#f25fa7', '#48d9ff', '#a66bff', '#f0c84b', '#e05d4f'];
  for (let i = 0; i < 16; i += 1) {
    ctx.strokeStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.45 + rng() * 0.35;
    ctx.lineWidth = 2 + rng() * 3;
    ctx.beginPath();
    const startX = rng() * TILE_SIZE;
    const startY = rng() * TILE_SIZE;
    ctx.moveTo(startX, startY);
    for (let p = 0; p < 4; p += 1) {
      ctx.lineTo(startX + (rng() - 0.5) * 42, startY + (rng() - 0.5) * 28);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTexture(kind, base) {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d');
  const rng = seeded(hashSeed(kind));

  if (kind === 'road' || kind === 'basalt' || kind === 'cobblestone' || kind === 'asphalt' || kind === 'concrete') drawPaving(ctx, base, rng);
  else if (kind === 'brick' || kind === 'porphyry') drawBrick(ctx, base, rng);
  else if (kind === 'marble' || kind === 'travertine' || kind === 'stucco' || kind === 'limestone') drawMarble(ctx, base, rng);
  else if (kind === 'terracotta') drawRoof(ctx, base, rng);
  else if (kind === 'water') drawWater(ctx, base, rng);
  else if (kind === 'graffiti') drawGraffiti(ctx, base, rng);
  else drawNoise(ctx, rng, base, 700, 0.12);

  return canvas;
}

function makeTexture(kind, renderer) {
  const texture = new THREE.CanvasTexture(drawTexture(kind, TEXTURE_BASE[kind] ?? '#ffffff'));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
  return texture;
}

function makeMaterial(kind, renderer, options = {}) {
  const texture = makeTexture(kind, renderer);
  const material = new THREE.MeshLambertMaterial({
    color: options.color ?? PALETTE[kind],
    map: texture,
    emissive: options.emissive ?? 0x2c2115,
    emissiveIntensity: options.emissiveIntensity ?? 0.04,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
    fog: options.fog ?? false,
    vertexColors: false
  });
  material.name = kind;
  material.userData.defaultColor = new THREE.Color(PALETTE[kind]).getHex();
  return material;
}

export function createMaterialLibrary(renderer) {
  return {
    terrain: makeMaterial('terrain', renderer),
    grass: makeMaterial('grass', renderer),
    bank: makeMaterial('bank', renderer),
    water: makeMaterial('water', renderer, { transparent: true, opacity: 0.84, depthWrite: false }),
    basalt: makeMaterial('basalt', renderer),
    road: makeMaterial('road', renderer),
    travertine: makeMaterial('travertine', renderer),
    marble: makeMaterial('marble', renderer),
    porphyry: makeMaterial('porphyry', renderer),
    terracotta: makeMaterial('terracotta', renderer),
    brick: makeMaterial('brick', renderer),
    stucco: makeMaterial('stucco', renderer),
    gold: makeMaterial('gold', renderer),
    cloth: makeMaterial('cloth', renderer, { transparent: true, opacity: 0.9 }),
    sand: makeMaterial('sand', renderer),
    shadow: makeMaterial('shadow', renderer),
    wood: makeMaterial('wood', renderer),
    crowd: makeMaterial('crowd', renderer),
    skin: makeMaterial('skin', renderer),
    vegetation: makeMaterial('vegetation', renderer),
    parisTerrain: makeMaterial('parisTerrain', renderer),
    parisGrass: makeMaterial('parisGrass', renderer),
    cobblestone: makeMaterial('cobblestone', renderer),
    limestone: makeMaterial('limestone', renderer),
    slate: makeMaterial('slate', renderer),
    iron: makeMaterial('iron', renderer),
    glass: makeMaterial('glass', renderer, { transparent: true, opacity: 0.72, depthWrite: false }),
    copper: makeMaterial('copper', renderer),
    munichTerrain: makeMaterial('munichTerrain', renderer),
    munichGrass: makeMaterial('munichGrass', renderer),
    athensTerrain: makeMaterial('athensTerrain', renderer),
    athensRock: makeMaterial('athensRock', renderer),
    athensGrass: makeMaterial('athensGrass', renderer),
    nyTerrain: makeMaterial('nyTerrain', renderer),
    asphalt: makeMaterial('asphalt', renderer),
    concrete: makeMaterial('concrete', renderer),
    steel: makeMaterial('steel', renderer),
    neon: makeMaterial('neon', renderer, { emissive: 0xf0c84b, emissiveIntensity: 0.35 }),
    londonTerrain: makeMaterial('londonTerrain', renderer),
    londonGrass: makeMaterial('londonGrass', renderer),
    berlinTerrain: makeMaterial('berlinTerrain', renderer),
    berlinGrass: makeMaterial('berlinGrass', renderer),
    graffiti: makeMaterial('graffiti', renderer, { emissive: 0x242126, emissiveIntensity: 0.08 }),
    neonPink: makeMaterial('neonPink', renderer, { emissive: 0xf25fa7, emissiveIntensity: 0.55 }),
    neonCyan: makeMaterial('neonCyan', renderer, { emissive: 0x48d9ff, emissiveIntensity: 0.55 }),
    neonPurple: makeMaterial('neonPurple', renderer, { emissive: 0xa66bff, emissiveIntensity: 0.55 })
  };
}

export { PALETTE };
