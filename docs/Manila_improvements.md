You are working on an existing WebGL / Three.js / InstancedMesh procedural voxel city project for Manila.

Goal:
Rebuild and clean up the Manila map so it feels like a coherent, realistic, production-ready Manila-inspired city, not a chaotic scene. The current project has many overlapping roads, buildings, pedestrian paths, bridges, and city objects. The map should be rebuilt or heavily refactored from the ground up if needed.

Final target:
A self-contained, offline procedural HD voxel simulation of Manila and the wider Metro Manila region, centered on Intramuros, Manila Cathedral, Fort Santiago, and the Pasig River, while expanding into Makati, BGC, Ortigas, Quezon City, Binondo, Quiapo, Escolta, Pasay / Manila Bay, Marikina, and other recognizable areas. The result must run on macOS, use no external assets, keep procedural Canvas atlas textures, use InstancedMesh/WebGL voxels, and target 55+ FPS.

Important:
Do not simply add more objects. First fix the city structure, layout logic, collision rules, roads, zoning, and placement system. The result must feel like a real city, with clean roads, readable neighborhoods, realistic density, no junk-yard overlap, and strong Manila identity.

Use the following working modes:

1. PLAN MODE
2. INVESTIGATION MODE
3. EXECUTION MODE
4. QA MODE
5. FINALIZATION MODE

Use at least 6 specialist “agents” per mode conceptually. This means you should divide the work into clear specialist roles and use their findings to guide the implementation. You do not need to literally run separate processes unless the environment supports it, but the work must reflect multi-agent thinking and checks.

============================================================
PLAN MODE — minimum 6 specialist roles
============================================================

Create a short but concrete plan before editing code.

Use these specialist roles:

1. City Layout Architect
   - Defines the new Manila map structure.
   - Separates districts clearly.
   - Ensures city zones are readable and not randomly scattered.

2. Road Network Planner
   - Designs a clean hierarchy of roads:
     major roads, secondary streets, alleys, pedestrian paths, bridges, and waterfront paths.
   - Prevents roads from crossing buildings or plazas incorrectly.

3. Collision / Placement Engineer
   - Defines strict rules for object placement.
   - Ensures buildings, roads, rivers, bridges, vehicles, markets, and props do not overlap.

4. Manila Identity Researcher
   - Uses existing project context and, if available, local reference knowledge already present in the codebase.
   - Adds recognizable Manila-inspired features without relying on external assets.

5. Performance Engineer
   - Keeps 55+ FPS target.
   - Uses InstancedMesh properly.
   - Avoids excessive geometry, duplicate meshes, and unnecessary draw calls.

6. QA Lead
   - Defines measurable acceptance criteria.
   - Blocks final delivery if roads, buildings, rivers, or landmarks still overlap.

Plan output must include:
- Current likely problems
- Files/functions to inspect
- Proposed rebuild/refactor strategy
- QA acceptance checklist
- Risk areas

============================================================
INVESTIGATION MODE — minimum 6 specialist roles
============================================================

Inspect the existing codebase before making major changes.

Use these specialist roles:

1. Map Structure Inspector
   - Find where the Manila map is generated.
   - Identify district generation, landmark placement, road generation, and terrain logic.

2. Road / Building Overlap Inspector
   - Locate code that places roads and buildings.
   - Identify why roads overlap buildings or pedestrian areas.

3. Landmark Placement Inspector
   - Inspect how Intramuros, Pasig River, Manila Bay, Makati, BGC, Ortigas, Binondo, Quiapo, Escolta, and other areas are placed.
   - Check whether landmarks have reserved space.

4. Object Density Inspector
   - Find excessive clutter.
   - Identify props, vehicles, markets, signs, or crowds placed without spacing rules.

5. Rendering / Performance Inspector
   - Review InstancedMesh usage.
   - Check geometry/material reuse.
   - Check whether object counts are too high.

6. Screenshot / Visual QA Inspector
   - If screenshot tooling exists, generate before/after screenshots.
   - Look for obvious visual chaos, overlaps, missing roads, broken bridges, or floating objects.

Investigation output must include:
- A concise list of root causes
- Exact files/functions that need changes
- A rebuild strategy
- Anything that should be deleted, simplified, or replaced

============================================================
EXECUTION MODE — minimum 6 specialist roles
============================================================

Implement the cleanup and rebuild.

Use these specialist roles:

1. City Grid / District Builder
   - Rebuild Manila as structured zones:
     - Intramuros / old Manila core
     - Binondo / Quiapo / Escolta heritage-commercial zone
     - Pasig River corridor
     - Makati CBD
     - BGC modern business district
     - Ortigas business district
     - Quezon City creative / student / residential areas
     - Manila Bay / Pasay waterfront
     - Marikina river / local neighborhood zone
     - Port / industrial / market edges where appropriate
   - These zones should have different architectural identity and density.

2. Collision System Engineer
   - Add or improve a reservation/collision system.
   - Every major element should reserve a footprint:
     buildings, roads, bridges, plazas, landmarks, waterways, parks, stations, markets, and major props.
   - No building should be placed on roads, rivers, bridges, plazas, or pedestrian paths.
   - No road should cut through landmark structures.
   - No vehicle should spawn inside buildings or water unless it is a boat.

3. Road and Transit Engineer
   - Create a readable road network.
   - Add major arteries, secondary streets, side streets, pedestrian lanes, bridges, and waterfront paths.
   - Add elevated rail/MRT/LRT hints where appropriate.
   - Add jeepneys, buses, motorcycles, taxis, delivery riders, ferries, and boats only in valid places.
   - Ensure roads connect districts naturally.

4. Landmark and Local Identity Designer
   - Keep or add the following:
     - Intramuros
     - Manila Cathedral
     - Fort Santiago
     - San Agustin Church
     - Rizal Park / Luneta
     - National Museum area
     - Manila City Hall
     - Binondo
     - Quiapo
     - Escolta
     - Jones Bridge
     - Pasig River
     - Manila Bay promenade
     - Makati CBD
     - BGC
     - Ortigas
     - Cubao / Quezon City
     - Maginhawa / Teacher’s Village style food streets
     - Poblacion-style nightlife streets
     - Marikina River Park
   - Use recognizable local details:
     sari-sari stores, carinderias, jeepneys, tricycles, wet markets, barangay halls, basketball courts, churches, schools, underpasses, footbridges, laundry lines, neon signs, food stalls, and dense shopfronts.

5. Waterfront / River Designer
   - Give the Pasig River, esteros, canals, Manila Bay, bridges, ferries, and waterfront promenades a clear role.
   - Prevent buildings from blocking the river.
   - Add proper bridge approaches.
   - Add river ferries and small boats only on water.
   - Add sunset bayfront atmosphere.

6. Performance / Rendering Engineer
   - Keep the scene performant.
   - Use InstancedMesh for repeated objects.
   - Reuse materials and procedural Canvas atlas textures.
   - Avoid too many unique geometries.
   - Reduce clutter if FPS or visual clarity suffers.

Execution rules:
- Prefer clean procedural systems over manually placing random objects.
- Add helper functions for footprints, reservations, zoning, and safe placement.
- Remove or disable chaotic placement logic if it cannot be made safe.
- Do not use external assets.
- Keep everything offline.
- Preserve macOS compatibility.

============================================================
QA MODE — minimum 10 specialist QA roles
============================================================

After implementation, run a strict QA pass. Use at least 10 QA roles. Each QA role must produce findings. If issues are found, return to EXECUTION MODE and fix them before finalizing.

QA roles:

1. Road Collision QA
   - Check if roads overlap buildings, plazas, landmarks, parks, or pedestrian zones.

2. Building Collision QA
   - Check if buildings overlap roads, rivers, bridges, landmarks, or other buildings.

3. Waterway QA
   - Check Pasig River, Manila Bay, esteros, canals, ferries, bridges, and waterfront paths.

4. Bridge QA
   - Check that bridges connect valid road/path endpoints and do not float or cut through buildings.

5. District Identity QA
   - Check that each district has a distinct character and does not feel randomly generated.

6. Manila Realism QA
   - Check whether the city feels like Manila / Metro Manila, not a generic cyberpunk city or junkyard.

7. Landmark QA
   - Check that major landmarks are readable and have clear surrounding space.

8. Transit QA
   - Check jeepneys, tricycles, buses, trains, stations, underpasses, footbridges, ferries, and traffic placement.

9. Nightlife / Local Spots QA
   - Check Poblacion, Cubao, Maginhawa, Escolta, Binondo, Quiapo, Makati, and BGC local/underground/business atmosphere.

10. Performance QA
   - Check FPS target, object count, draw calls, InstancedMesh usage, and unnecessary geometry.

11. Screenshot Visual QA
   - Generate screenshots if tooling exists.
   - Check visual cleanliness from top-down and street-level angles.

12. Final Production QA
   - Confirm the project builds, runs, and feels production-ready.

QA must produce:
- List of issues found
- Severity: blocker / major / minor
- File/function affected
- Fix recommendation
- Whether execution must continue

Do not finalize until:
- There are no blocker issues
- There are no major overlap issues
- Roads are clean
- Buildings are placed safely
- Waterways and bridges are readable
- Districts are recognizable
- The scene runs smoothly

============================================================
FINALIZATION MODE
============================================================

When QA passes:

1. Run the available build/test/lint commands.
2. Run the project locally if possible.
3. Capture screenshots if the environment supports it.
4. Confirm the final map is clean and production-ready.
5. Commit all changes with a clear commit message.
6. Push to the remote repository only if:
   - Git remote is configured
   - The working branch is correct
   - Authentication is available
   - The push does not conflict with repository rules

Suggested commit message:
"Rebuild Manila procedural city layout and fix collision placement"

Final response must include:
- Summary of what changed
- Files changed
- QA results
- Build/test results
- Screenshot paths if created
- Commit hash if committed
- Push status

============================================================
MANILA CREATIVE DIRECTION TO PRESERVE
============================================================

The final simulation should still follow this creative direction:

Create a self-contained, offline procedural HD voxel simulation of Manila and the wider Metro Manila region, centered on the historic core of Intramuros with Manila Cathedral, Fort Santiago, and the Pasig River as the main focal points. Expand beyond the tourist centre to capture the full layered identity of Manila: Spanish colonial heritage, dense urban neighborhoods, business districts, river life, markets, transport systems, nightlife, hidden local spots, creative scenes, and everyday community energy.

Include collision-free placement of landmarks, roads, bridges, waterways, rail lines, plazas, parks, waterfronts, high-rises, informal streets, and neighborhood zones.

Core Manila / historic focal area:
Intramuros with stone walls, gates, cobbled streets, courtyards, churches, plazas, colonial façades, horse carriages, visitors, street vendors, and warm lighting details. Surround it with Fort Santiago, Manila Cathedral, San Agustin Church, Casa Manila, Baluarte de San Diego, Rizal Park / Luneta, National Museum complex, Manila City Hall, Binondo, Quiapo, Escolta, Jones Bridge, and the Pasig River.

Expanded Metro Manila districts and landmarks:
- Makati: Ayala Avenue, Greenbelt, Legazpi Village, Salcedo Village, business towers, parks, cafés, galleries, weekend market energy
- BGC: glass towers, wide roads, murals, High Street, corporate plazas, rooftop bars, restaurants, public art, modern nightlife
- Ortigas: office towers, malls, EDSA traffic, business density, transport hubs
- Quezon City: Tomas Morato, Timog, UP Diliman, Maginhawa, Cubao, Araneta City, local food streets, music venues, student and creative culture
- Pasay / Bay Area: Mall of Asia area, Manila Bay promenade, convention halls, hotels, sunset waterfront energy
- Mandaluyong / San Juan: residential-commercial mix, malls, side streets, bridges, local eateries
- Parañaque / Las Piñas: coastal roads, neighborhood streets, market zones, jeepneys, churches
- Marikina: river park, shoe-industry references, bike paths, local neighborhoods
- Caloocan / Navotas / Malabon: port-side and market atmosphere, fish markets, dense local streets, waterways, industrial edges

Hidden local spots and everyday Manila:
- Poblacion, Makati: hidden bars, rooftop spots, neon alleys, speakeasy-style entrances, small restaurants, art walls, late-night street life
- Escolta: old Art Deco buildings, creative cafés, thrift shops, galleries, restored heritage façades, gritty street texture
- Binondo side streets: food alleys, lanterns, shop signs, dumpling houses, bakeries, carts, market movement
- Quiapo: church crowds, street vendors, underpass life, market stalls, old cinemas, jeepney routes
- Cubao Expo: indie shops, record stores, vintage signage, bars, galleries, small music venues
- Maginhawa / Teacher’s Village: local restaurants, cafés, student energy, murals, small creative spaces
- Legazpi and Salcedo weekend markets: food stalls, shaded paths, local shoppers, small parks
- Avenida / Recto atmosphere: old commercial buildings, bookstores, print shops, neon signs, dense pedestrian flow
- Marikina River Park: bikes, families, bridges, riverfront paths
- Kapitolyo / San Juan / Mandaluyong food streets: neighborhood restaurants, hidden cafés, late-night comfort food spots
- La Loma / local food districts: grill houses, small eateries, street-level activity

Underground, creative, and nightlife culture:
Include basement bars, speakeasy doors, rooftop venues, indie music rooms, DJ spaces, small clubs, karaoke bars, comedy rooms, art galleries, tattoo shops, record shops, pop-up markets, late-night food stalls, and street gatherings.

Business and modern city zones:
Show Makati CBD, BGC, Ortigas Center, and the Bay Area with glass towers, office plazas, elevated walkways, malls, hotel entrances, corporate signage, rooftop restaurants, parking structures, delivery riders, commuters, and after-work crowds.

Transport and street life:
Make mobility a major part of the simulation: jeepneys, tricycles, buses, taxis, motorcycles, delivery riders, MRT/LRT lines, stations, elevated tracks, underpasses, footbridges, traffic lights, EDSA-like congestion, bridges across the Pasig River, ferries, informal crossing points, and busy sidewalks.

Waterfronts and waterways:
Give the Pasig River, Manila Bay, esteros, canals, and river bridges a strong presence. Include river ferries, small boats, waterfront paths, bridge traffic, informal riverside communities, modern riverside redevelopment pockets, sunset views over Manila Bay, seawall promenades, and bayfront evening crowds.

Urban fabric and architecture:
Include Spanish colonial stonework, Art Deco heritage buildings, postwar concrete blocks, high-rise condos, glass towers, malls, dense shopfronts, markets, churches, schools, hospitals, basketball courts, gated villages, barangay halls, apartment blocks, informal settlements, warehouses, port infrastructure, and small crowds. Let the city transition naturally between Intramuros heritage, old Manila commercial streets, dense working neighborhoods, creative local pockets, corporate Makati/BGC/Ortigas, and bayfront leisure zones.

Atmosphere:
Cinematic tropical urban lighting shifting from humid golden-hour haze to electric rainy-night energy. Include warm sunset over Manila Bay, wet street reflections, neon signage, jeepney chrome, concrete textures, painted walls, tropical greenery, river shimmer, market color, and high-rise glass glow. Palette: sunset orange / concrete grey / tropical green / bay blue / neon pink / cyan / amber / jeepney chrome / weathered cream / brick-red.

The final scene should feel dense, local, historic, modern, chaotic in the natural Manila way but cleanly implemented, creative, business-driven, underground, and unmistakably Manila.

Performance requirement:
55+ FPS, InstancedMesh/WebGL voxels, procedural Canvas atlas, no external assets, must run on macOS.

============================================================
NON-NEGOTIABLE ACCEPTANCE CRITERIA
============================================================

The project is not complete unless all of these are true:

- No roads crossing through buildings
- No buildings placed on roads
- No buildings placed in rivers, canals, or bay water
- No random floating bridges
- No bridges that start or end nowhere
- No vehicles inside buildings
- No boats on land
- No pedestrian paths blocked by buildings
- Landmarks have reserved space around them
- Districts are visually readable
- Manila identity is clear
- Business districts are distinct from heritage areas
- Underground/local/nightlife areas are visible but not messy
- The map feels planned, not randomly scattered
- Build/test/lint pass where available
- Performance remains close to or above 55 FPS
- Final code is committed
- Push to remote is completed
