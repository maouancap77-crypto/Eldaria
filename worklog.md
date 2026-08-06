---
Task ID: 1
Agent: main (Z.ai Code)
Task: Build Eldoria Online — a pixel-art isekai souls-like 2D RPG with dungeons, enemy/plant farming, and survival, based on the uploaded GDD (Eldoria_Online_GDD.docx).

Work Log:
- Read the GDD via pandoc: extracted full design (biomes, classes, survival stats, combat, wounds, magic, crafting, base building, weather, day/night, economy).
- Decided on a browser-playable vertical slice in Next.js 16 (canvas game) since the GDD targets Defold — adapted the core vision to web.
- Set up persistence: prisma schema (SaveGame + Leaderboard), `/api/save` (GET/POST/DELETE), `/api/leaderboard` (GET/POST); ran `bun run db:push`.
- Generated pixel-art title key art via z-ai image-generation CLI (1344x768, saved to public/game/title-art.png).
- Built game data layer (`src/lib/game/`):
  - types.ts — all TS types (Player, Enemy, Tile, items, recipes, save state, HUD snapshot).
  - data.ts — 30+ items (weapons/tools/food/potions/materials/seeds), 15 crafting recipes, 5 hero classes, 6 enemy defs (slime/goblin/skeleton/wolf/wraith/boss), XP curves, constants.
  - sprites.ts — procedural pixel-art rendering (tiles, resource nodes, crops, player per class, enemies w/ anim, projectiles, item icons, stations, portals, slash arcs).
- Built the engine (`engine.ts`, ~1900 lines): seeded world gen (plains 64x64 + dungeon 40x40), game loop, camera, input (keyboard+mouse), AABB collision, souls-like combat (light/heavy attack w/ arc hitbox, dodge roll w/ i-frames, block w/ stamina + guard break, backstab crits), enemy AI (idle/patrol/chase/windup-telegraph/attack/recover) with respawn farming, XP/leveling, loot drops, projectiles (bow/staff), survival decay (hunger/thirst/stamina/mana/HP regen + starvation dmg), day/night cycle w/ lighting overlay, farming (till/plant/grow/harvest), crafting w/ station validation + skill progression, gathering, drop pickup magnet, particles/float text/kill feed, save/export, autosave every 25s.
- Built React UI (`src/components/game/`): useGame hook, GameCanvas host, TitleScreen (title+class select w/ 5 classes), Hud (vitals/survival/XP/gold/zone/time/hotbar/boss bar/kill feed/toast), InventoryPanel (grid+details+use/equip/drop), CraftingPanel (recipes w/ have/need counts), Overlays (pause/death/win screens), ItemIcon (canvas sprite renderer).
- Added custom CSS (globals.css) for pixel-art aesthetic (pix-panel/pix-btn/pix-bar/pix-slot classes, glow, scanline-free clean pixel look).
- Wired page.tsx to render GameCanvas; updated layout metadata.

Stage Summary:
- Game is fully playable end-to-end at `/`. Verified via Agent Browser + VLM:
  - Title screen + class select (5 classes) render.
  - Pixel-art world (grass, paths, trees, rocks, bushes, campfire, workbench, portals) renders; player sprite + full HUD.
  - WASD movement, attack slash arc, souls-like combat damage confirmed both ways (wolf 50→38 HP, player 140→109 HP).
  - Enemies (slime/wolf/wraith/skeleton/goblin/boss) roam with AI.
  - Gathering (8 wood from tree), crafting (hoe at workbench, station validation rejects campfire recipes), farming (till→plant→grow→harvest yields berries+seeds), item consumption (berry restores hunger), dungeon portal transition (zone→dungeon w/ boss), day/night cycle, save/load round-trip all verified.
  - Inventory + crafting panels open/close correctly; death screen + respawn work.
- Lint passes clean; dev server runs on port 3000 with no runtime/console errors.
- Controls: WASD move · J/Click light · K/RMB heavy · Space dodge · Shift block · E interact · I inventory · C craft · 1-6 use item · Esc pause.
