# 3D City Atlas

An offline procedural 3D city atlas built with Vite, Three.js, WebGL, and instanced block geometry. The simulation presents a connected world of iconic city centres that can be explored from high above or flown through at street level.

The current atlas includes Rome, Venice, Athens, Egypt, Angkor, Paris, Barcelona, London, Munich, Berlin, New York, Brazil, and Peru. Each city sits on its own terrain patch with local rivers, canals, roads, landmarks, dense urban blocks, animated crowds, and connector routes between cities.

Live site: https://3d-city-atlas.vercel.app/

## Highlights

- Fully self-contained runtime: no external models, images, textures, fonts, or CDN assets.
- Share-ready metadata with Open Graph, Twitter card, manifest, app icons, sitemap, and a generated social preview image.
- Procedural Canvas texture atlas for terrain, stone, water, roofs, glass, metal, graffiti, and neon.
- WebGL rendering through Three.js with `InstancedMesh` batches for high counts of reusable 3D blocks.
- Free-flight navigation with keyboard, mouse look, and wheel movement.
- Orbit navigation for zooming from monument detail to full-world views.
- Collision-aware city placement through reserved planner rectangles.
- Procedural landmark modelling for monuments, rivers, roads, bridges, rail lines, plazas, buildings, people, and vehicles.
- Tested locally on macOS with a 55+ FPS target across the expanded thirteen-city world.

## Cities

### Rome

Ancient Rome is centered on a rounded Colosseum with seating tiers, exposed hypogeum, velarium, crowds, and gladiators. The city includes the Forum, Arch of Constantine, Temple of Venus and Roma, basilicas, colonnades, aqueducts, Circus Maximus, terracotta-roofed insulae, the Tiber River, Seven Hills terrain, and cardo/decumanus road structure.

### Venice

Venice is centered on the Grand Canal and St Mark's Square, with St Mark's Basilica, the Campanile, Doge's Palace, Rialto Bridge, Bridge of Sighs, Santa Maria della Salute, San Giorgio Maggiore, Ca' d'Oro, Teatro La Fenice, Accademia Bridge, lagoon islands, narrow canals, bridges, quays, palazzos, cafes, laundry lines, crowds, gondolas, vaporetti, and small boats.

### Athens

Athens is centered on the Acropolis hill and the Parthenon. It includes the Propylaea, Erechtheion, Temple of Athena Nike, ancient walls, Ancient Agora, Roman Agora, Temple of Olympian Zeus, Hadrian's Library, Odeon of Herodes Atticus, Theatre of Dionysus, Syntagma Square, Panathenaic Stadium, Plaka, Monastiraki, Mount Lycabettus, rocky terrain, hillside paths, and visitors.

### Egypt

Ancient Egypt is centered on the Giza Plateau with the Great Pyramid of Giza and the Great Sphinx. It includes the pyramids of Khafre and Menkaure, satellite pyramids, mastaba tombs, causeways, the Valley Temple, pylons, obelisks, hypostyle-style courtyards, sphinx-lined paths, a sacred lake, mudbrick villages, granaries, markets, workers, priests, guards, farmers, animals, Nile docks, irrigation canals, reed beds, palm groves, feluccas, cargo boats, and the contrast between green Nile land and desert plateau.

### Angkor

Angkor is centered on Angkor Wat with the outer moat, long axial causeway, symmetrical galleries, lotus-shaped tower quincunx, courtyards, bas-relief wall bands, naga balustrades, monks, visitors, and ceremonial activity. The region includes Angkor Thom, Bayon face towers, Baphuon, Terrace of the Elephants, Ta Prohm-style root-wrapped ruins, Preah Khan, Ta Keo, Banteay Kdei, Srah Srang, East and West Baray reservoirs, Banteay Srei, Phnom Bakheng, canals, bridges, rice fields, jungle paths, stilt houses, ox carts, boats, and dense tropical overgrowth.

### Paris

Paris is centered on the Eiffel Tower with lattice legs, platforms, antenna, visitors, lighting details, and Champ de Mars gardens. The city includes the Seine, left-bank/right-bank layout, Louvre, Notre-Dame, Arc de Triomphe, Champs-Elysees, Trocadero, Grand Palais, Les Invalides, Musee d'Orsay, Pantheon, Sacre-Coeur on Montmartre, Haussmann blocks, cafes, bridges, lamps, and animated pedestrians.

### Barcelona

Barcelona is centered on the Sagrada Familia with spires, sculptural facades, mosaic accents, stained-glass color, plaza visitors, and construction-crane detail. It includes the Cerda grid, Passeig de Gracia, Avinguda Diagonal, Gran Via, La Rambla, Placa de Catalunya, Barri Gotic, Barcelona Cathedral, Arc de Triomf, Palau de la Musica Catalana, Park Guell, Casa Batllo, Casa Mila, Casa Vicens, Torre Bellesguard, Palau Guell, Montjuic, Magic Fountain, Port Vell, Barceloneta Beach, Tibidabo, Camp Nou, Modernist blocks, cafes, palms, bikes, scooters, buses, and Gaudi-inspired mosaic details.

### London

London is centered on the Palace of Westminster and Big Ben / Elizabeth Tower. It includes the Thames, embankments, bridges, Westminster Abbey, London Eye, Trafalgar Square, Buckingham Palace, St Paul's Cathedral, Tower Bridge, Tower of London, The Shard, Somerset House, Covent Garden, Piccadilly Circus, red buses, black cabs, pubs, markets, parks, and animated crowds.

### Munich

Munich is centered on Marienplatz and the Neues Rathaus with Gothic Revival facade, clock tower, Glockenspiel details, arcades, spires, and visitors. It includes Frauenkirche, St. Peter's Church, Viktualienmarkt, Odeonsplatz, Theatinerkirche, Residenz, Hofgarten, Feldherrnhalle, Karlsplatz/Stachus, Sendlinger Tor, Isartor, Deutsches Museum, English Garden, Isar riverfront paths, trams, cyclists, market stalls, beer halls, and Bavarian old-town blocks.

### Berlin

Berlin is centered on the Brandenburg Gate with the Fernsehturm visible above Alexanderplatz. It includes the Spree, canals, rail viaducts, Reichstag, Berlin Cathedral, Museum Island, Potsdamer Platz, Checkpoint Charlie, Gendarmenmarkt, Unter den Linden, East Side Gallery, Oberbaum Bridge, Victory Column, Tempelhof Field, Prussian stone landmarks, DDR-era blocks, glass offices, graffiti walls, courtyards, warehouses, bikes, taxis, and animated crowds.

Berlin also adds club-culture atmosphere through industrial nightlife zones inspired by power stations, vault clubs, riverside venues, and warehouse yards, with concrete exteriors, fenced queues, subtle neon signage, bouncers, smokers, kiosks, bikes, taxis, and late-night street activity.

### New York

New York is centered on dense Midtown Manhattan and the Empire State Building with Art Deco massing, stepped crown, spire, observation decks, and street-level activity. It includes Hudson and East River edges, Manhattan grid roads, Times Square, Chrysler Building, Grand Central Terminal, Rockefeller Center, One Vanderbilt, Flatiron Building, Bryant Park, Central Park South, Madison Square Garden, New York Public Library, Lower Manhattan skyline elements, Brooklyn Bridge, yellow taxis, steam vents, billboards, subway entrances, vendors, trees, and crowds.

### Brazil

Brazil is centered on Rio de Janeiro with Christ the Redeemer on Corcovado, Sugarloaf Mountain, Guanabara Bay, Copacabana, Ipanema, Maracana, Lapa Arches, Selaron Steps, Botanical Garden, Rodrigo de Freitas Lagoon, hillside communities, local vendors, motorbikes, buses, beach life, cable cars, and boats. It expands outward with compact regional scenes for Sao Paulo, Brasilia, Salvador, Recife and Olinda, the Amazon River, Pantanal wetlands, Iguacu Falls, and Lencois Maranhenses.

### Peru

Peru is centered on Machu Picchu and Cusco. Machu Picchu includes stepped agricultural terraces, Inca stone structures, temples, stairways, plazas, visitors, llamas, cloud-forest ridgelines, and elevated viewpoints. Cusco includes a historic plaza core, cathedral, colonial arcades, Inca stone walls, narrow streets, red-tiled roofs, and markets. The broader module includes Sacsayhuaman, the Sacred Valley, Ollantaytambo, Lake Titicaca, Arequipa, Lima coastal cliffs, Nazca-inspired desert plains, Colca Canyon, Amazon Basin settlements, Rainbow Mountain, Andean villages, buses, mototaxis, boats, textiles, and terraced farming.

## Navigation

The foldable destination panel is the city switcher. It sits in the top-right on desktop and becomes a compact bottom-right drawer on smaller screens:

- `Rome`, `Venice`, `Athens`, `Egypt`, `Angkor`, `Paris`, `Barcelona`, `London`, `Munich`, `Berlin`, `New York`, `Brazil`, `Peru`
- `Fly`

Connector roads remain visible in the world and can be explored in flight mode, but they are not shown as primary navigation buttons.

The atlas information panel opens on load, auto-collapses after a few seconds, and can be reopened or closed with its top-right toggle. Its landmark buttons update to the active city and fly the camera directly to each city-specific focus point.

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
  voxelBatcher.js   Shared InstancedMesh batching for static 3D block geometry
  planner.js        Rectangle reservation and collision checks for city planning
  romeScene.js      Procedural Rome module
  veniceScene.js    Procedural Venice module
  athensScene.js    Procedural Athens module
  egyptScene.js     Procedural Ancient Egypt module
  angkorScene.js    Procedural Angkor module
  parisScene.js     Procedural Paris module
  barcelonaScene.js Procedural Barcelona module
  londonScene.js    Procedural London module
  munichScene.js    Procedural Munich module
  berlinScene.js    Procedural Berlin module
  newYorkScene.js   Procedural New York module
  brazilScene.js    Procedural Brazil / Rio de Janeiro module
  peruScene.js      Procedural Peru / Machu Picchu and Cusco module
  styles.css        HUD, controls, labels, responsive layout
```

Vercel Web Analytics is initialized once from `src/main.js` with the framework-agnostic `@vercel/analytics` client injection. It only adds page-view tracking for the deployed frontend and does not expose analytics data in the app.

### Rendering

Static world geometry is grouped by material and rendered with `THREE.InstancedMesh`, using one box geometry scaled and positioned thousands of times. These reusable 3D blocks are often called voxels in graphics programming. This keeps draw calls low while still allowing a dense city scene with many buildings, roads, bridges, plazas, monuments, trees, lamps, and street objects.

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

- Rome to Venice
- Rome to Athens
- Athens to Egypt
- Egypt to Angkor
- Rome to Paris
- Paris to Barcelona
- Paris to Munich
- Munich to Berlin
- Paris to London
- Paris to New York, modelled as a longer triple route
- New York to Brazil
- Brazil to Peru

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

- Static 3D blocks are batched by material with `InstancedMesh`.
- Runtime texture generation happens once at startup.
- Dynamic agents reuse instanced geometry and update matrices only.
- The renderer uses `powerPreference: 'high-performance'`.
- Pixel ratio is capped to reduce GPU pressure on high-DPI displays.
- The camera far plane and navigation bounds are tuned for the expanded multi-city map.

The HUD exposes live FPS, 3D block count, people count, and city count. A debug object is also available in the browser console:

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
