import * as THREE from 'three';
import { createAngkorScene, angkorTerrainHeightAt } from './angkorScene.js';
import { createAthensScene, athensTerrainHeightAt } from './athensScene.js';
import { createBarcelonaScene, barcelonaTerrainHeightAt } from './barcelonaScene.js';
import { createBerlinScene, berlinTerrainHeightAt } from './berlinScene.js';
import { createBrazilScene, brazilTerrainHeightAt } from './brazilScene.js';
import { createEgyptScene, egyptTerrainHeightAt } from './egyptScene.js';
import { createLondonScene, londonTerrainHeightAt } from './londonScene.js';
import { createMunichScene, munichTerrainHeightAt } from './munichScene.js';
import { createNewYorkScene, newYorkTerrainHeightAt } from './newYorkScene.js';
import { createParisScene, parisTerrainHeightAt } from './parisScene.js';
import { createPeruScene, peruTerrainHeightAt } from './peruScene.js';
import { createRomeScene, terrainHeightAt as romeTerrainHeightAt } from './romeScene.js';
import { createVeniceScene, veniceTerrainHeightAt } from './veniceScene.js';
import { createViennaScene, viennaTerrainHeightAt } from './viennaScene.js';
import { VoxelBatcher } from './voxelBatcher.js';

const CITY_SPECS = [
  {
    id: 'rome',
    name: 'Rome',
    origin: new THREE.Vector3(0, 0, 0),
    bounds: 220,
    create: createRomeScene,
    heightAt: romeTerrainHeightAt,
    view: {
      label: 'Rome',
      title: 'Rome aerial view',
      position: new THREE.Vector3(150, 174, 168),
      targetKey: 'aerial'
    }
  },
  {
    id: 'venice',
    name: 'Venice',
    origin: new THREE.Vector3(8, 0, -478),
    bounds: 186,
    create: createVeniceScene,
    heightAt: veniceTerrainHeightAt,
    view: {
      label: 'Venice',
      title: 'Venice Grand Canal view',
      position: new THREE.Vector3(118, 124, 132),
      targetKey: 'sanMarco'
    }
  },
  {
    id: 'athens',
    name: 'Athens',
    origin: new THREE.Vector3(-116, 0, 548),
    bounds: 210,
    create: createAthensScene,
    heightAt: athensTerrainHeightAt,
    view: {
      label: 'Athens',
      title: 'Athens Acropolis view',
      position: new THREE.Vector3(108, 132, 142),
      targetKey: 'parthenon'
    }
  },
  {
    id: 'egypt',
    name: 'Egypt',
    origin: new THREE.Vector3(-120, 0, 1044),
    bounds: 230,
    create: createEgyptScene,
    heightAt: egyptTerrainHeightAt,
    view: {
      label: 'Egypt',
      title: 'Ancient Egypt Giza Plateau view',
      position: new THREE.Vector3(142, 138, 156),
      targetKey: 'greatPyramid'
    }
  },
  {
    id: 'angkor',
    name: 'Angkor',
    origin: new THREE.Vector3(-120, 0, 1540),
    bounds: 228,
    create: createAngkorScene,
    heightAt: angkorTerrainHeightAt,
    view: {
      label: 'Angkor',
      title: 'Angkor Wat temple complex view',
      position: new THREE.Vector3(128, 132, 142),
      targetKey: 'angkorWat'
    }
  },
  {
    id: 'paris',
    name: 'Paris',
    origin: new THREE.Vector3(540, 0, -8),
    bounds: 230,
    create: createParisScene,
    heightAt: parisTerrainHeightAt,
    view: {
      label: 'Paris',
      title: 'Paris Eiffel Tower view',
      position: new THREE.Vector3(122, 138, 136),
      targetKey: 'eiffel'
    }
  },
  {
    id: 'barcelona',
    name: 'Barcelona',
    origin: new THREE.Vector3(560, 0, 480),
    bounds: 216,
    create: createBarcelonaScene,
    heightAt: barcelonaTerrainHeightAt,
    view: {
      label: 'Barcelona',
      title: 'Barcelona Sagrada Familia view',
      position: new THREE.Vector3(118, 132, 132),
      targetKey: 'sagrada'
    }
  },
  {
    id: 'london',
    name: 'London',
    origin: new THREE.Vector3(520, 0, -520),
    bounds: 214,
    create: createLondonScene,
    heightAt: londonTerrainHeightAt,
    view: {
      label: 'London',
      title: 'London Westminster view',
      position: new THREE.Vector3(112, 128, 122),
      targetKey: 'bigBen'
    }
  },
  {
    id: 'munich',
    name: 'Munich',
    origin: new THREE.Vector3(1030, 0, 112),
    bounds: 208,
    create: createMunichScene,
    heightAt: munichTerrainHeightAt,
    view: {
      label: 'Munich',
      title: 'Munich Marienplatz view',
      position: new THREE.Vector3(98, 116, 128),
      targetKey: 'rathaus'
    }
  },
  {
    id: 'berlin',
    name: 'Berlin',
    origin: new THREE.Vector3(1070, 0, -420),
    bounds: 214,
    create: createBerlinScene,
    heightAt: berlinTerrainHeightAt,
    view: {
      label: 'Berlin',
      title: 'Berlin Brandenburg Gate view',
      position: new THREE.Vector3(112, 132, 128),
      targetKey: 'brandenburg'
    }
  },
  {
    id: 'vienna',
    name: 'Vienna',
    origin: new THREE.Vector3(1320, 0, -820),
    bounds: 216,
    create: createViennaScene,
    heightAt: viennaTerrainHeightAt,
    view: {
      label: 'Vienna',
      title: 'Vienna Stephansdom view',
      position: new THREE.Vector3(116, 132, 128),
      targetKey: 'stephansdom'
    }
  },
  {
    id: 'new-york',
    name: 'New York',
    origin: new THREE.Vector3(1710, 0, -330),
    bounds: 226,
    create: createNewYorkScene,
    heightAt: newYorkTerrainHeightAt,
    view: {
      label: 'New York',
      title: 'New York Midtown view',
      position: new THREE.Vector3(112, 168, 132),
      targetKey: 'empire'
    }
  },
  {
    id: 'brazil',
    name: 'Brazil',
    origin: new THREE.Vector3(2240, 0, 230),
    bounds: 238,
    create: createBrazilScene,
    heightAt: brazilTerrainHeightAt,
    view: {
      label: 'Brazil',
      title: 'Brazil Rio de Janeiro view',
      position: new THREE.Vector3(132, 166, 148),
      targetKey: 'christ'
    }
  },
  {
    id: 'peru',
    name: 'Peru',
    origin: new THREE.Vector3(2760, 0, 540),
    bounds: 234,
    create: createPeruScene,
    heightAt: peruTerrainHeightAt,
    view: {
      label: 'Peru',
      title: 'Peru Machu Picchu and Cusco view',
      position: new THREE.Vector3(122, 164, 142),
      targetKey: 'machu'
    }
  }
];

const CONNECTOR_SPECS = [
  {
    id: 'rome-venice-road',
    label: 'R-V Road',
    title: 'Rome to Venice connector road',
    start: new THREE.Vector3(18, 0, -204),
    end: new THREE.Vector3(18, 0, -292),
    terrain: 'veniceTerrain',
    width: 18,
    curve: 3.0,
    cameraLift: 58,
    cameraBack: 56
  },
  {
    id: 'rome-athens-road',
    label: 'R-A Road',
    title: 'Rome to Athens connector road',
    start: new THREE.Vector3(-38, 0, 204),
    end: new THREE.Vector3(-126, 0, 338),
    terrain: 'athensTerrain',
    width: 18,
    curve: -7.2,
    cameraLift: 68,
    cameraBack: 72
  },
  {
    id: 'athens-egypt-road',
    label: 'A-E Road',
    title: 'Athens to Egypt connector road',
    start: new THREE.Vector3(-124, 0, 758),
    end: new THREE.Vector3(-120, 0, 814),
    terrain: 'egyptDesert',
    width: 18,
    curve: 2.8,
    cameraLift: 60,
    cameraBack: 58
  },
  {
    id: 'egypt-angkor-road',
    label: 'E-A Road',
    title: 'Egypt to Angkor connector road',
    start: new THREE.Vector3(-120, 0, 1274),
    end: new THREE.Vector3(-120, 0, 1312),
    terrain: 'angkorTerrain',
    width: 18,
    curve: -3.2,
    cameraLift: 62,
    cameraBack: 58
  },
  {
    id: 'rome-paris-road',
    label: 'R-P Road',
    title: 'Rome to Paris connector road',
    start: new THREE.Vector3(204, 0, -22),
    end: new THREE.Vector3(312, 0, -18),
    terrain: 'parisTerrain',
    width: 18,
    curve: 2.4,
    cameraLift: 62,
    cameraBack: 66
  },
  {
    id: 'paris-munich-road',
    label: 'P-M Road',
    title: 'Paris to Munich connector road',
    start: new THREE.Vector3(752, 0, 60),
    end: new THREE.Vector3(822, 0, 90),
    terrain: 'munichTerrain',
    width: 18,
    curve: -4.8,
    cameraLift: 58,
    cameraBack: 54
  },
  {
    id: 'paris-barcelona-road',
    label: 'P-B Road',
    title: 'Paris to Barcelona connector road',
    start: new THREE.Vector3(548, 0, 222),
    end: new THREE.Vector3(560, 0, 264),
    terrain: 'barcelonaTerrain',
    width: 18,
    curve: -2.6,
    cameraLift: 58,
    cameraBack: 54
  },
  {
    id: 'munich-berlin-road',
    label: 'M-B Road',
    title: 'Munich to Berlin connector road',
    start: new THREE.Vector3(1048, 0, -94),
    end: new THREE.Vector3(1068, 0, -206),
    terrain: 'berlinTerrain',
    width: 18,
    curve: -4.0,
    cameraLift: 60,
    cameraBack: 58
  },
  {
    id: 'berlin-vienna-road',
    label: 'B-V Road',
    title: 'Berlin to Vienna connector road',
    start: new THREE.Vector3(1180, 0, -612),
    end: new THREE.Vector3(1228, 0, -604),
    terrain: 'viennaTerrain',
    width: 18,
    curve: 4.2,
    cameraLift: 60,
    cameraBack: 58
  },
  {
    id: 'paris-london-road',
    label: 'P-L Road',
    title: 'Paris to London connector road',
    start: new THREE.Vector3(532, 0, -238),
    end: new THREE.Vector3(520, 0, -306),
    terrain: 'londonTerrain',
    width: 18,
    curve: 3.5,
    cameraLift: 58,
    cameraBack: 54
  },
  {
    id: 'paris-new-york-road-a',
    label: 'P-NY A',
    title: 'Paris to New York route segment',
    start: new THREE.Vector3(750, 0, -118),
    end: new THREE.Vector3(990, 0, -250),
    terrain: 'nyTerrain',
    width: 16,
    curve: 8.5,
    cameraLift: 66,
    cameraBack: 72,
    showInNav: false
  },
  {
    id: 'paris-new-york-road-b',
    label: 'P-NY Route',
    title: 'Long Paris to New York connector route',
    start: new THREE.Vector3(990, 0, -250),
    end: new THREE.Vector3(1240, 0, -390),
    terrain: 'nyTerrain',
    width: 16,
    curve: -10.5,
    cameraLift: 78,
    cameraBack: 92
  },
  {
    id: 'paris-new-york-road-c',
    label: 'P-NY C',
    title: 'Paris to New York route segment',
    start: new THREE.Vector3(1240, 0, -390),
    end: new THREE.Vector3(1496, 0, -330),
    terrain: 'nyTerrain',
    width: 16,
    curve: 7.0,
    cameraLift: 66,
    cameraBack: 72,
    showInNav: false
  },
  {
    id: 'new-york-brazil-road',
    label: 'NY-B Road',
    title: 'New York to Brazil connector road',
    start: new THREE.Vector3(1850, 0, -134),
    end: new THREE.Vector3(2076, 0, 28),
    terrain: 'brazilTerrain',
    width: 18,
    curve: -12.0,
    cameraLift: 76,
    cameraBack: 82
  },
  {
    id: 'brazil-peru-road',
    label: 'B-P Road',
    title: 'Brazil to Peru connector road',
    start: new THREE.Vector3(2462, 0, 412),
    end: new THREE.Vector3(2548, 0, 438),
    terrain: 'peruTerrain',
    width: 18,
    curve: 5.8,
    cameraLift: 66,
    cameraBack: 62
  }
];

export function createWorldScene(materials) {
  const group = new THREE.Group();
  group.name = 'procedural-rome-venice-athens-egypt-angkor-paris-barcelona-london-munich-berlin-vienna-new-york-brazil-peru-world';

  const modules = CITY_SPECS.map((spec) => {
    const city = spec.create(materials);
    city.group.position.copy(spec.origin);
    group.add(city.group);
    return { ...spec, city };
  });

  const connectors = CONNECTOR_SPECS.map((spec) => {
    const connector = buildConnector(materials, spec);
    group.add(connector.group);
    return { ...spec, ...connector };
  });

  const labels = [];
  const focusTargets = {};

  for (const connector of connectors) {
    focusTargets[connector.id] = connector.focusTarget.clone();
  }

  for (const module of modules) {
    for (const label of module.city.labels) {
      labels.push({
        name: label.name,
        city: module.name,
        position: label.position.clone().add(module.origin)
      });
    }

    for (const [key, target] of Object.entries(module.city.focusTargets)) {
      focusTargets[`${module.id}:${key}`] = target.clone().add(module.origin);
    }
  }

  const metrics = modules.reduce(
    (acc, module) => {
      acc.instances += module.city.metrics.instances;
      acc.pedestrians += module.city.metrics.pedestrians ?? 0;
      acc.cyclists += module.city.metrics.cyclists ?? 0;
      acc.trams += module.city.metrics.trams ?? 0;
      acc.taxis += module.city.metrics.taxis ?? 0;
      acc.buses += module.city.metrics.buses ?? 0;
      acc.cabs += module.city.metrics.cabs ?? 0;
      acc.gondolas += module.city.metrics.gondolas ?? 0;
      acc.boats += module.city.metrics.boats ?? 0;
      acc.carts += module.city.metrics.carts ?? 0;
      acc.pigeons += module.city.metrics.pigeons ?? 0;
      acc.reservations += module.city.metrics.reservations ?? 0;
      acc.labels += module.city.labels.length;
      return acc;
    },
    {
      instances: connectors.reduce((sum, connector) => sum + connector.instances, 0),
      pedestrians: 0,
      cyclists: 0,
      trams: 0,
      taxis: 0,
      buses: 0,
      cabs: 0,
      gondolas: 0,
      boats: 0,
      carts: 0,
      pigeons: 0,
      reservations: 0,
      labels: 0,
      cities: modules.length,
      connectors: connectors.length
    }
  );

  const bounds = computeWorldBounds(modules, connectors);
  const cityViews = modules.map((module) => buildCityView(module, focusTargets));
  const routeViews = connectors.filter((connector) => connector.showInNav !== false).map((connector) => buildConnectorView(connector));
  const navViews = cityViews;

  return {
    group,
    modules,
    connectors,
    labels,
    focusTargets,
    metrics,
    bounds,
    navViews,
    cityViews,
    routeViews,
    heightAt(x, z) {
      const module = modules.find((candidate) => {
        const lx = x - candidate.origin.x;
        const lz = z - candidate.origin.z;
        return Math.abs(lx) <= candidate.bounds && Math.abs(lz) <= candidate.bounds;
      });

      if (module) {
        return module.origin.y + module.heightAt(x - module.origin.x, z - module.origin.z);
      }

      const connector = connectors.find((candidate) => isOnConnector(candidate, x, z, 24));
      if (connector) return connectorHeightAt(connector, x, z);
      return 0.7;
    },
    update(elapsed) {
      for (const module of modules) module.city.update(elapsed);
    }
  };
}

function buildCityView(module, focusTargets) {
  const target =
    focusTargets[`${module.id}:${module.view.targetKey}`] ??
    focusTargets[`${module.id}:aerial`] ??
    module.origin.clone();

  return {
    id: module.id,
    label: module.view.label,
    title: module.view.title,
    position: module.origin.clone().add(module.view.position),
    target
  };
}

function buildConnectorView(connector) {
  const frame = connectorFrame(connector, 0.5);
  const direction = frame.tangent;
  return {
    id: connector.id,
    label: connector.label,
    title: connector.title,
    position: frame.center
      .clone()
      .addScaledVector(direction, -connector.cameraBack)
      .add(new THREE.Vector3(0, connector.cameraLift, -34)),
    target: connector.focusTarget.clone()
  };
}

function computeWorldBounds(modules, connectors) {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };

  for (const module of modules) {
    bounds.minX = Math.min(bounds.minX, module.origin.x - module.bounds - 28);
    bounds.maxX = Math.max(bounds.maxX, module.origin.x + module.bounds + 28);
    bounds.minZ = Math.min(bounds.minZ, module.origin.z - module.bounds - 28);
    bounds.maxZ = Math.max(bounds.maxZ, module.origin.z + module.bounds + 28);
  }

  for (const connector of connectors) {
    const pad = connector.width + Math.abs(connector.curve) + 42;
    bounds.minX = Math.min(bounds.minX, connector.start.x - pad, connector.end.x - pad);
    bounds.maxX = Math.max(bounds.maxX, connector.start.x + pad, connector.end.x + pad);
    bounds.minZ = Math.min(bounds.minZ, connector.start.z - pad, connector.end.z - pad);
    bounds.maxZ = Math.max(bounds.maxZ, connector.start.z + pad, connector.end.z + pad);
  }

  return bounds;
}

function buildConnector(materials, spec) {
  const batch = new VoxelBatcher(materials);
  const length = spec.start.distanceTo(spec.end);
  const steps = Math.max(8, Math.ceil(length / 5));

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const frame = connectorFrame(spec, t);

    for (let offset = -spec.width - 4; offset <= spec.width + 4; offset += 5) {
      const point = frame.center.clone().addScaledVector(frame.perp, offset);
      const h = connectorHeightAt(spec, point.x, point.z);
      batch.add(spec.terrain, point.x, h / 2 - 0.02, point.z, 5.1, h, 5.1);
    }

    for (let lane = -1; lane <= 1; lane += 1) {
      const point = frame.center.clone().addScaledVector(frame.perp, lane * 4.2);
      batch.addTop('cobblestone', point.x, connectorHeightAt(spec, point.x, point.z) + 0.05, point.z, 5.2, 0.18, 4.0, null, frame.yaw);
    }

    if (i % 3 === 0) {
      for (const side of [-1, 1]) {
        const tree = frame.center.clone().addScaledVector(frame.perp, side * (spec.width - 2));
        const lamp = frame.center.clone().addScaledVector(frame.perp, side * (spec.width - 6));
        const treeHeight = connectorHeightAt(spec, tree.x, tree.z);
        const lampHeight = connectorHeightAt(spec, lamp.x, lamp.z);
        batch.addTop('vegetation', tree.x, treeHeight, tree.z, 1.8, 4.4, 1.8);
        batch.addTop('gold', lamp.x, lampHeight, lamp.z, 0.42, 4.1, 0.42);
      }
    }
  }

  const built = batch.build();
  built.group.name = spec.id;
  return {
    group: built.group,
    instances: built.total,
    focusTarget: connectorFrame(spec, 0.5).center.add(new THREE.Vector3(0, 8, 0))
  };
}

function connectorFrame(connector, t) {
  const base = connector.start.clone().lerp(connector.end, t);
  const dx = connector.end.x - connector.start.x;
  const dz = connector.end.z - connector.start.z;
  const length = Math.max(0.001, Math.hypot(dx, dz));
  const direction = new THREE.Vector3(dx / length, 0, dz / length);
  const perp = new THREE.Vector3(-direction.z, 0, direction.x);
  const curveOffset = Math.sin(t * Math.PI) * connector.curve;
  const tangentCurve = Math.cos(t * Math.PI) * connector.curve * Math.PI / length;
  const tangent = direction.clone().addScaledVector(perp, tangentCurve).normalize();
  const yaw = Math.atan2(tangent.x, tangent.z);

  return {
    center: base.addScaledVector(perp, curveOffset),
    tangent,
    perp,
    yaw
  };
}

function connectorHeightAt(connector, x, z) {
  return 0.78 + Math.sin(x * 0.024 + z * 0.018 + connector.curve) * 0.18;
}

function isOnConnector(connector, x, z, pad = 0) {
  const radius = connector.width + pad;
  const radiusSq = radius * radius;
  let previous = connectorFrame(connector, 0).center;

  for (let i = 1; i <= 32; i += 1) {
    const current = connectorFrame(connector, i / 32).center;
    if (distanceToSegmentSq(x, z, previous, current) <= radiusSq) return true;
    previous = current;
  }

  return false;
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
