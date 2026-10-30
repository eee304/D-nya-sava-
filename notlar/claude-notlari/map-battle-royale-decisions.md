---
name: map-battle-royale-decisions
description: "User's design decisions for the Map Battle Royale rebuild (game name, zoom layers, models, multiplayer)"
metadata:
  node_type: memory
  type: project
  originSessionId: df688c93-f7b7-4903-9538-a966f1f0eb51
  modified: 2026-10-29T20:03:28.531Z
---

Rebuilding eee304/D-nya-sava- (single-file Three.js world strategy game) in /Applications/XAMPP/xamppfiles/htdocs/oyun. Original repo cloned to `original/` (reference, don't edit); new Vite project in `game/`. Plan + live 3D mockup: https://claude.ai/artifact/ATLEBa5GKxTrYRW53TBH5D

Decisions (2026-10-29):
- Name stays **Map Battle Royale**.
- Two zoom layers: world strategy map (far) + AoE-II-level isometric region view (near); user must be able to zoom out freely between them.
- Graphics target: at least Age of Empires II level detail (user's words: "en kötü").
- Models: start with code-generated low-poly models; swap to hand-made .glb in Phase 6.
- Multiplayer (PeerJS shared world, host-authoritative bots) must be preserved, not dropped.

Progress (2026-10-29): Phase 0 (Vite split, state object, smoke test) and Phase 1 (region view in src/region/, wheel zoom in/out between world and region) done. Phase 2 (painted world texture src/world/mapTexture.js, Line2 glowing borders, empire labels, raster land grid) done. Phase 3 (HUD: src/hud.css, topbar/ctxPanel/actionbar/toasts via MutationObserver on #hint, game speed) done. Phase 4 (src/units/: Formation, FX, models; battle panel; bot battle replays; region battle close-up; BATTLE_TIME 10s, roll at battle start) done. Phase 5 (build in region view: ghost + placeBuilding(point,{fromRegion})) done. User asked for full-screen battle cutscenes ("ara animasyon"): playCinematic in main.js + RegionView.cineFrame shots, pauses game, Esc skips, localStorage 'mbr-cinematics'. Provinces done (src/world/provinces.js; per-province troops S.troops, dev levels, take-one/take-all conquest, region view per province). Menu = turning globe (src/menu/globe.js); bot wars = red war-alert badges, click to watch cutscene.

Open requests (2026-10-29): (1) country identities: strengths/weaknesses, country-specific economies (fishing Norway, farming, livestock…, modern conjuncture) + trade system for resource-poor countries; (2) graphics overhaul: no boxy models, beautiful designs; Higgsfield allowed but ASK APPROVAL before any generation, spend few credits; (3) diversify battle animations. DONE 2026-10-29: country profiles + goods + trade (src/data/countryProfiles.js), new buildings fishery/ranch/oilwell/factory, rounded soldier/cavalry/tank/ship models, 4 battle scenarios × weather, day cycle tied to calendar (DAY_CYCLE=40 days; user rejected a manual sunset toggle). Next ideas: more model polish, sound.
Art direction (2026-10-29): user chose style C "painted miniature, more detailed" for models (Kit paints per-face colour jitter; detailed houses/soldiers/tank/cannon). World map = political map like Age of History II / Victoria 3 but "sympathetic": semi-transparent owner colour over painted terrain, dark thin borders, names painted on land (small, no overlap). Day cycle = 2 in-game months. Style page: https://claude.ai/artifact/5NKPRqdZkthSPSFp4PgHwY User decision: do everything with code as far as possible; Higgsfield only if code is insufficient (still ask approval first). Higgsfield balance 2026-10-29: 7280 credits (Ultra).

**Why:** user answered the plan's decision list explicitly.
**How to apply:** keep net/sync working through refactors; don't introduce external model packs before Phase 6; UI text in Turkish.
Regions (2026-10-30): provinces = real geographic regions (scripts/build-regions.mjs from Natural Earth admin-1; TR 7 official regions, BR 5, US 9 divisions) cut per era into public/data/regions-<era>.json. Building only inside a region view (world-map build click opens the region). Sea only if region border touches sea. User wants: region production from its buildings, wider free-roam region maps, lively towns (rigged people, moving animals/cars), cute-but-realistic.
Blender: no MCP needed — headless /Applications/Blender.app CLI; scripts in game/blender/*.py export public/models/*.glb (materials named "role|#hex", loaded via src/region/prefabs.js).
2026-10-30: user wants region maps as big as possible (they build there) → SIZE 200 in src/region/terrain.js, outer countryside fades into haze. Gameplay: user complained of being attacked right at start without developing → 12-month peace (+6 peaceful), threat ramp, one-month border warning, home militia; economy rebalanced (city must pay for itself, cheaper 20%-draft army). Graphics quality setting (Otomatik/Düşük/Orta/Yüksek, src/render/post.js).
