# 3D City Atlas

An offline procedural 3D city atlas built with Vite, Three.js, WebGL, and instanced block geometry. The simulation presents a connected world of iconic city centres that can be explored from high above or flown through at street level.

The current atlas includes Rome, Athens, Paris, London, Munich, Berlin, and New York. Each city sits on its own terrain patch with local rivers, roads, landmarks, dense urban blocks, animated crowds, and connector roads between cities.

## Highlights

- Fully self-contained runtime: no external models, images, textures, fonts, or CDN assets.
- Procedural Canvas texture atlas for terrain, stone, water, roofs, glass, metal, graffiti, and neon.
- WebGL rendering through Three.js with `InstancedMesh` batches for high voxel counts.
- Free-flight navigation with keyboard, mouse look, and wheel movement.
- Orbit navigation for zooming from monument detail to full-world views.
- Collision-aware city placement through reserved planner rectangles.
- Procedural landmark modelling for monuments, rivers, roads, bridges, rail lines, plazas, buildings, people, and vehicles.
- Tested locally on macOS with 55+ FPS target. The current browser smoke test reported roughly 120 FPS, 127k static voxels, 1.5k animated people, 7 cities, and 8 connector segments.

## Cities

### Rome

Ancient Rome is centered on a rounded Colosseum with seating tiers, exposed hypogeum, velarium, crowds, and gladiators. The city includes the Forum, Arch of Constantine, Temple of Venus and Roma, basilicas, colonnades, aqueducts, Circus Maximus, terracotta-roofed insulae, the Tiber River, Seven Hills terrain, and cardo/decumanus road structure.

### Athens

Athens is centered on the Acropolis hill and the Parthenon. It includes the Propylaea, Erechtheion, Temple of Athena Nike, ancient walls, Ancient Agora, Roman Agora, Temple of Olympian Zeus, Hadrian's Library, Odeon of Herodes Atticus, Theatre of Dionysus, Syntagma Square, Panathenaic Stadium, Plaka, Monastiraki, Mount Lycabettus, rocky terrain, hillside paths, and visitors.

### Paris

Paris is centered on the Eiffel Tower with lattice legs, platforms, antenna, visitors, lighting details, and Champ de Mars gardens. The city includes the Seine, left-bank/right-bank layout, Louvre, Notre-Dame, Arc de Triomphe, Champs-Elysees, Trocadero, Grand Palais, Les Invalides, Musee d'Orsay, Pantheon, Sacre-Coeur on Montmartre, Haussmann blocks, cafes, bridges, lamps, and animated pedestrians.

### London

London is centered on the Palace of Westminster and Big Ben / Elizabeth Tower. It includes the Thames, embankments, bridges, Westminster Abbey, London Eye, Trafalgar Square, Buckingham Palace, St Paul's Cathedral, Tower Bridge, Tower of London, The Shard, Somerset House, Covent Garden, Piccadilly Circus, red buses, black cabs, pubs, markets, parks, and animated crowds.

### Munich

Munich is centered on Marienplatz and the Neues Rathaus with Gothic Revival facade, clock tower, Glockenspiel details, arcades, spires, and visitors. It includes Frauenkirche, St. Peter's Church, Viktualienmarkt, Odeonsplatz, Theatinerkirche, Residenz, Hofgarten, Feldherrnhalle, Karlsplatz/Stachus, Sendlinger Tor, Isartor, Deutsches Museum, English Garden, Isar riverfront paths, trams, cyclists, market stalls, beer halls, and Bavarian old-town blocks.

### Berlin

Berlin is centered on the Brandenburg Gate with the Fernsehturm visible above Alexanderplatz. It includes the Spree, canals, rail viaducts, Reichstag, Berlin Cathedral, Museum Island, Potsdamer Platz, Checkpoint Charlie, Gendarmenmarkt, Unter den Linden, East Side Gallery, Oberbaum Bridge, Victory Column, Tempelhof Field, Prussian stone landmarks, DDR-era blocks, glass offices, graffiti walls, courtyards, warehouses, bikes, taxis, and animated crowds.

Berlin also adds club-culture atmosphere through industrial nightlife zones inspired by power stations, vault clubs, riverside venues, and warehouse yards, with concrete exteriors, fenced queues, subtle neon signage, bouncers, smokers, kiosks, bikes, taxis, and late-night street activity.

### New York

New York is centered on dense Midtown Manhattan and the Empire State Building with Art Deco massing, stepped crown, spire, observation decks, and street-level activity. It includes Hudson and East River edges, Manhattan grid roads, Times Square, Chrysler Building, Grand Central Terminal, Rockefeller Center, One Vanderbilt, Flatiron Building, Bryant Park, Central Park South, Madison Square Garden, New York Public Library, Lower Manhattan skyline elements, Brooklyn Bridge, yellow taxis, steam vents, billboards, subway entrances, vendors, trees, and crowds.

## Navigation

The bottom navigation jumps between city and route views:

- `Rome`, `Athens`, `Paris`, `London`, `Munich`, `Berlin`, `New York`
- `R-A Road`, `R-P Road`, `P-M Road`, `M-B Road`, `P-L Road`, `P-NY Route`
- `Fly`

Flight controls:

- `W/A/S/D` or arrow keys: move
- `Q/E`: descend/ascend
- `Shift`: fast movement
- `Alt`: slow movement
- Mouse movement: look around while flight mode is active
- Mouse wheel: move forward/back through the world

Orbit controls:

- Drag to orbit
- Wheel to zoom from close monument views to full multi-city views
- Pan is enabled for broader inspection

## Technical Architecture

The app is a plain Vite and Three.js project with no backend.

```text
src/
  main.js           App bootstrap, renderer, camera, lights, HUD, controls, flight mode
  worldScene.js     City registry, connector roads, world bounds, nav targets, global height lookup
  atlas.js          Procedural Canvas texture generation and material library
  voxelBatcher.js   Shared InstancedMesh batching for static voxel geometry
  planner.js        Rectangle reservation and collision checks for city planning
  romeScene.js      Procedural Rome module
  athensScene.js    Procedural Athens module
  parisScene.js     Procedural Paris module
  londonScene.js    Procedural London module
  munichScene.js    Procedural Munich module
  berlinScene.js    Procedural Berlin module
  newYorkScene.js   Procedural New York module
  styles.css        HUD, controls, labels, responsive layout
```

### Rendering

Static world geometry is grouped by material and rendered with `THREE.InstancedMesh`, using one box geometry scaled and positioned thousands of times. This keeps draw calls low while still allowing a dense city scene with many buildings, roads, bridges, plazas, monuments, trees, lamps, and street objects.

Animated pedestrians, cyclists, taxis, cabs, buses, and trams are also instanced, but they use dynamic instance matrices that update every frame. People are composed from multiple small instanced body parts so they are visibly styled instead of black silhouettes.

### Materials and Textures

`src/atlas.js` creates all textures at runtime with Canvas. Materials cover terrain, grass, water, asphalt, cobblestone, limestone, marble, travertine, terracotta, brick, stucco, slate, iron, steel, glass, copper, gold, cloth, vegetation, graffiti, and neon accents.

No image files are loaded by the app. This keeps the project offline-friendly and easy to clone.

### Procedural City Modules

Each city module exports:

- `create<City>Scene(materials)`: builds the city group, labels, focus targets, metrics, and animation update function.
- `<city>TerrainHeightAt(x, z)`: samples the local terrain height for camera collision, placement, and connector routing.

The city modules use the shared `Planner` to reserve landmarks, bridges, roads, plazas, and building lots. This reduces collisions between generated buildings and important landmarks or rivers.

### World Composition

`src/worldScene.js` owns the multi-city layout. It places each city at a world origin, adds connector roads, computes global bounds, aggregates metrics, and exposes `heightAt(x, z)` so navigation can stay above city terrain and connector paths.

The current connectors are:

- Rome to Athens
- Rome to Paris
- Paris to Munich
- Munich to Berlin
- Paris to London
- Paris to New York, modelled as a longer triple route

## Requirements

- macOS, Windows, or Linux with a modern WebGL-capable browser
- Node.js 18 or newer
- npm

The project is tested on macOS.

## Run Locally

```sh
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173/
```

## Build

```sh
npm run build
npm run preview
```

The production bundle is generated into `dist/`. The repository ignores `dist/` because it is build output.

## Performance Notes

- Static voxels are batched by material with `InstancedMesh`.
- Runtime texture generation happens once at startup.
- Dynamic agents reuse instanced geometry and update matrices only.
- The renderer uses `powerPreference: 'high-performance'`.
- Pixel ratio is capped to reduce GPU pressure on high-DPI displays.
- The camera far plane and navigation bounds are tuned for the expanded multi-city map.

The HUD exposes live FPS, voxel count, people count, and city count. A debug object is also available in the browser console:

```js
window.__ROME_METRICS__
```

The object name is historical from the original Rome prototype.

## Adding Another City

1. Create `src/<city>Scene.js`.
2. Export `create<City>Scene(materials)` and `<city>TerrainHeightAt(x, z)`.
3. Reserve key landmarks and roads with `Planner`.
4. Build terrain, rivers, roads, landmarks, urban blocks, street details, and animated agents.
5. Add any required material keys to `src/atlas.js`.
6. Register the city in `CITY_SPECS` inside `src/worldScene.js`.
7. Add connector specs in `CONNECTOR_SPECS`.
8. Run `npm run build` and test the new nav button and flight mode in the browser.

## Repository Notes

This repo intentionally excludes:

- `node_modules/`
- `dist/`
- local screenshots
- local prompt scratch files

The application itself remains asset-free at runtime.
