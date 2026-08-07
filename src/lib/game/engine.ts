// ============================================================================
// Eldoria Online — core game engine
// ============================================================================
import {
  TILE, MAP_W, MAP_H, DUNGEON_W, DUNGEON_H,
  PLAYER_SPEED, PLAYER_SPRINT, DODGE_SPEED, DODGE_TIME, IFRAME_TIME, DODGE_CD,
  STAMINA_DODGE, STAMINA_ATTACK, STAMINA_HEAVY, STAMINA_BLOCK_HIT,
  STAMINA_REGEN, STAMINA_REGEN_BLOCK, MANA_REGEN, HUNGER_RATE, THIRST_RATE,
  HP_REGEN_WELLFED, DAY_LENGTH,
  ITEMS, RECIPES, CLASSES, ENEMIES, xpForLevel, statsForClass, CRAFT_SKILLS,
  craftXpForLevel, ZONE_NAMES,
} from './data'
import { getMusic } from './music'
import type {
  ZoneId, Tile, TileType, Player, Enemy, EnemyKind, Projectile, DroppedItem,
  FloatText, Particle, ResourceNode, FarmPlot, CraftingStation, Portal,
  ItemStack, SaveData, HudSnapshot, HeroClassId, Dir, EnemyDef, CraftSkill,
  SpecialStructure, Companion, CompanionKind,
} from './types'
import {
  drawTile, drawResourceNode, drawCrop, drawPlayer, drawEnemy, drawProjectile,
  drawDroppedItem, drawStation, drawPortal, drawItemIcon, drawSpecialStructure,
} from './sprites'

// ---- seeded RNG -----------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const T = (type: TileType, solid = false, v = 0): Tile => ({ type, solid, v })

// ---- input ----------------------------------------------------------------
interface InputState {
  keys: Set<string>
  mouseX: number
  mouseY: number
  mouseDown: boolean
  rmb: boolean
}

export type EngineCommand =
  | { type: 'start'; heroName: string; cls: HeroClassId }
  | { type: 'useItem'; index: number }
  | { type: 'equip'; index: number }
  | { type: 'dropItem'; index: number }
  | { type: 'craft'; recipeId: string }
  | { type: 'toggleInventory' }
  | { type: 'toggleCrafting' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'respawn' }
  | { type: 'save' }
  | { type: 'quitToTitle' }
  | { type: 'submitRun' }
  | { type: 'toggleMusic' }

export class GameEngine {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  dpr = 1
  vw = 0
  vh = 0

  screen: 'title' | 'class' | 'game' | 'dead' | 'win' = 'title'
  paused = false
  showInventory = false
  showCrafting = false

  zone: ZoneId = 'plains'
  tiles: Record<ZoneId, Tile[][]> = { plains: [], dungeon: [] }
  resources: Record<ZoneId, ResourceNode[]> = { plains: [], dungeon: [] }
  stations: CraftingStation[] = []
  portals: Record<ZoneId, Portal[]> = { plains: [], dungeon: [] }
  structures: SpecialStructure[] = []
  farmPlots: FarmPlot[] = []
  enemies: Enemy[] = []
  projectiles: Projectile[] = []
  drops: DroppedItem[] = []
  floats: FloatText[] = []
  particles: Particle[] = []
  killFeed: { id: number; text: string; life: number }[] = []
  nearStructure: string | null = null

  // companions (elf = periodic heal, dog = attacks locked enemy)
  companions: Companion[] = []
  elfRescued = false
  dogRescued = false
  // rescue encounters: elf and dog are guarded by enemies until you free them
  rescueEncounters: { kind: CompanionKind; x: number; y: number; guardKilled: boolean; guardIds: number[] }[] = []

  player!: Player
  inventory: ItemStack[] = []
  equipped = 'rusty_sword'
  craftLevels: Record<CraftSkill, number> = { cooking: 1, crafting: 1, alchemy: 1, construction: 1 }
  craftXp: Record<CraftSkill, number> = { cooking: 0, crafting: 0, alchemy: 0, construction: 0 }

  heroName = 'Herói'
  cls: HeroClassId = 'warrior'
  bossKilled = false

  // off-screen tilemap cache — the single biggest perf win.
  // Instead of redrawing ~1000 tiles (thousands of fillRects) every frame,
  // we render the whole map to an off-screen canvas ONCE (per zone, or when
  // tiles change), then blit just the visible viewport with one drawImage.
  tileCache: Record<ZoneId, HTMLCanvasElement | null> = { plains: null, dungeon: null }
  tileCacheDirty: Record<ZoneId, boolean> = { plains: true, dungeon: true }

  timeOfDay = 0.3 // 0=midnight,0.25 dawn,0.5 noon,0.75 dusk
  playtime = 0
  seed = 12345

  camera = { x: 0, y: 0 }
  input: InputState = { keys: new Set(), mouseX: 0, mouseY: 0, mouseDown: false, rmb: false }

  nearStation: 'campfire' | 'workbench' | null = null
  nearPortal: string | null = null
  nearInteract: string | null = null
  bossRef: Enemy | null = null

  // combat feel: hitstop (brief game freeze on hit) + screen shake
  hitstop = 0
  shakeAmt = 0
  shakeTime = 0
  // music
  musicEnabled = true
  musicMood: 'calm' | 'combat' | 'dungeon' = 'calm'
  private combatMusicTimer = 0 // counts down after last hit to fade out combat music

  toast: { id: number; text: string; kind: 'info' | 'good' | 'bad' } | null = null
  message: string | null = null

  nextId = 1
  rafId = 0
  lastTime = 0
  running = false
  autoSaveTimer = 0

  private listeners = new Set<(s: HudSnapshot) => void>()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.ctx.imageSmoothingEnabled = false
    this.bindInput()
    this.resize()
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __eo?: GameEngine }).__eo = this
    }
  }

  // ---- lifecycle ----------------------------------------------------------
  start() {
    this.running = true
    this.lastTime = performance.now()
    this.loop()
  }

  dispose() {
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.unbindInput()
  }

  private hudAccum = 0
  private readonly HUD_INTERVAL = 1 / 15 // React HUD updates at 15fps; canvas stays 60fps

  private loop = () => {
    if (!this.running) return
    const now = performance.now()
    let dt = (now - this.lastTime) / 1000
    this.lastTime = now
    if (dt > 0.05) dt = 0.05
    // hitstop: freeze the simulation briefly on impactful hits for "weight"
    if (this.hitstop > 0) {
      this.hitstop -= dt
      // still tick shake decay + render so the freeze is visible
      this.updateShake(dt)
      this.render()
      this.hudAccum += dt
      if (this.hudAccum >= this.HUD_INTERVAL) { this.hudAccum = 0; this.emit() }
      this.rafId = requestAnimationFrame(this.loop)
      return
    }
    if (!this.paused && this.screen === 'game') this.update(dt)
    else if (this.screen === 'dead' || this.screen === 'win') {
      // still animate particles
      this.updateParticles(dt)
      this.updateShake(dt)
    }
    this.render() // canvas always renders at full 60fps
    // throttle React HUD updates to 15fps — this is the key perf fix
    this.hudAccum += dt
    if (this.hudAccum >= this.HUD_INTERVAL) {
      this.hudAccum = 0
      this.emit()
    }
    this.rafId = requestAnimationFrame(this.loop)
  }

  shake(amount: number, time: number) {
    this.shakeAmt = Math.max(this.shakeAmt, amount)
    this.shakeTime = Math.max(this.shakeTime, time)
  }
  private updateShake(dt: number) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt
      if (this.shakeTime <= 0) { this.shakeAmt = 0; this.shakeTime = 0 }
    }
  }

  // ---- input binding ------------------------------------------------------
  private keydown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (this.screen === 'game' && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'tab'].includes(k)) e.preventDefault()
    this.input.keys.add(k)
    if (this.screen !== 'game') return
    // panel toggles + pause work even when a panel is open
    if (k === 'escape') {
      if (this.showInventory) { this.showInventory = false; return }
      if (this.showCrafting) { this.showCrafting = false; return }
      this.togglePause(); return
    }
    if (k === 'i') { this.toggleInventory(); return }
    if (k === 'c') { this.toggleCrafting(); return }
    if (this.paused || this.showInventory || this.showCrafting) return
    if (k === 'e') this.interact()
    if (k === 't') this.farmAction()
    if (k === ' ') this.dodge()
    if (k === 'j') this.attack('light')
    if (k === 'k') this.startCharge() // hold K to charge heavy; release fires it
    if (k === 'tab') this.toggleLockOn()
    if (k === 'f') this.useAbilityF()
    if (k === 'g') this.useAbilityG()
    if (k >= '1' && k <= '6') this.useItem(parseInt(k) - 1)
    if (k === 'q') this.useEquippedPotion()
  }
  private keyup = (e: KeyboardEvent) => {
    this.input.keys.delete(e.key.toLowerCase())
  }
  private mousemove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    this.input.mouseX = e.clientX - rect.left
    this.input.mouseY = e.clientY - rect.top
  }
  private mousedown = (e: MouseEvent) => {
    if (this.screen !== 'game') return
    if (e.button === 0) {
      this.input.mouseDown = true
      this.attack('light')
    }
    if (e.button === 2) {
      this.input.rmb = true
      this.startCharge()
    }
  }
  private mouseup = (e: MouseEvent) => {
    if (e.button === 0) this.input.mouseDown = false
    if (e.button === 2) this.input.rmb = false
  }
  private contextmenu = (e: Event) => e.preventDefault()
  private resize = () => {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = window.devicePixelRatio || 1
    this.vw = rect.width
    this.vh = rect.height
    this.canvas.width = Math.floor(rect.width * this.dpr)
    this.canvas.height = Math.floor(rect.height * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.ctx.imageSmoothingEnabled = false
  }

  bindInput() {
    window.addEventListener('keydown', this.keydown)
    window.addEventListener('keyup', this.keyup)
    this.canvas.addEventListener('mousemove', this.mousemove)
    this.canvas.addEventListener('mousedown', this.mousedown)
    window.addEventListener('mouseup', this.mouseup)
    this.canvas.addEventListener('contextmenu', this.contextmenu)
    window.addEventListener('resize', this.resize)
  }
  unbindInput() {
    window.removeEventListener('keydown', this.keydown)
    window.removeEventListener('keyup', this.keyup)
    this.canvas.removeEventListener('mousemove', this.mousemove)
    this.canvas.removeEventListener('mousedown', this.mousedown)
    window.removeEventListener('mouseup', this.mouseup)
    this.canvas.removeEventListener('contextmenu', this.contextmenu)
    window.removeEventListener('resize', this.resize)
  }

  // ---- subscription -------------------------------------------------------
  subscribe(cb: (s: HudSnapshot) => void) {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }
  private emit() {
    const snap = this.snapshot()
    this.listeners.forEach((l) => l(snap))
  }

  // ---- commands -----------------------------------------------------------
  command(cmd: EngineCommand) {
    switch (cmd.type) {
      case 'start':
        this.startGame(cmd.heroName, cmd.cls)
        break
      case 'useItem':
        this.useItem(cmd.index)
        break
      case 'equip':
        this.equipItem(cmd.index)
        break
      case 'dropItem':
        this.dropItem(cmd.index)
        break
      case 'craft':
        this.craft(cmd.recipeId)
        break
      case 'toggleInventory':
        this.toggleInventory()
        break
      case 'toggleCrafting':
        this.toggleCrafting()
        break
      case 'pause':
        this.togglePause()
        break
      case 'resume':
        this.paused = false
        break
      case 'respawn':
        this.respawn()
        break
      case 'save':
        this.autoSaveTimer = 999
        break
      case 'quitToTitle':
        this.screen = 'title'
        this.paused = false
        this.stopMusic()
        break
      case 'toggleMusic':
        this.toggleMusic()
        break
    }
    // commands change state that the HUD must reflect immediately (don't wait for the 15fps tick)
    this.emit()
  }

  // ---- music --------------------------------------------------------------
  toggleMusic() {
    this.musicEnabled = !this.musicEnabled
    const m = getMusic()
    m.setEnabled(this.musicEnabled)
    if (this.musicEnabled) {
      this.startMusic()
      this.flashToast('Música: ON', 'good')
    } else {
      this.flashToast('Música: OFF', 'info')
    }
  }

  startMusic() {
    if (!this.musicEnabled) return
    const m = getMusic()
    m.setEnabled(true)
    m.setMood(this.musicMood)
    m.start()
  }

  stopMusic() {
    getMusic().stop()
  }

  // ---- world generation (fully procedural) ---------------------------------
  // Every playthrough generates a unique world: lake/river locations, forest
  // clusters, ore veins, ruins, clearings, enemy camps, and shrine positions
  // are all derived from the random seed. The spawn clearing at center is
  // always kept safe.

  private spawnClearing = { x: 32, y: 32, r: 6 } // player spawn — kept clear of obstacles/enemies

  private inSpawnClearing(tx: number, ty: number): boolean {
    const c = this.spawnClearing
    return Math.hypot(tx - c.x, ty - c.y) < c.r
  }

  private tileValidForResource(t: Tile | undefined, tx: number, ty: number): boolean {
    if (!t) return false
    if (t.solid) return false
    if (t.type === 'water') return false
    if (this.inSpawnClearing(tx, ty)) return false
    return true
  }

  private genPlains(seed: number) {
    const rng = mulberry32(seed)
    const tiles: Tile[][] = []
    // base terrain with subtle noise variation
    for (let y = 0; y < MAP_H; y++) {
      const row: Tile[] = []
      for (let x = 0; x < MAP_W; x++) {
        const r = rng()
        // patches of darker grass2 for texture
        row.push(T(r > 0.82 ? 'grass2' : 'grass', false, Math.floor(rng() * 1000)))
      }
      tiles.push(row)
    }

    // ---- 1. Lakes: 1-3 random lakes, away from spawn ----
    const lakeCount = 1 + Math.floor(rng() * 3)
    for (let l = 0; l < lakeCount; l++) {
      let lx: number, ly: number, lr: number, tries = 0
      do {
        lx = 6 + Math.floor(rng() * (MAP_W - 12))
        ly = 6 + Math.floor(rng() * (MAP_H - 12))
        lr = 4 + Math.floor(rng() * 5)
        tries++
      } while (this.inSpawnClearing(lx, ly) && tries < 20)
      for (let y = -lr - 1; y <= lr + 1; y++) {
        for (let x = -lr - 1; x <= lr + 1; x++) {
          const tx = lx + x, ty = ly + y
          if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue
          const d = x * x + y * y
          if (d < lr * lr) tiles[ty][tx] = T('water', true, 0)
          else if (d < (lr + 2) * (lr + 2) && rng() > 0.4) tiles[ty][tx] = T('sand', false, Math.floor(rng() * 1000))
        }
      }
    }

    // ---- 2. A serpentine river crossing part of the map ----
    if (rng() > 0.3) {
      const horiz = rng() > 0.5
      const startPos = 4 + Math.floor(rng() * (MAP_H - 8))
      const width = 2 + Math.floor(rng() * 2)
      let cy = startPos
      for (let x = 0; x < MAP_W; x++) {
        cy += Math.round((rng() - 0.5) * 2)
        cy = Math.max(2, Math.min(MAP_H - 3, cy))
        for (let w = -width; w <= width; w++) {
          const ty = cy + w
          if (ty < 0 || ty >= MAP_H) continue
          if (!this.inSpawnClearing(x, ty)) tiles[ty][x] = T('water', true, 0)
        }
      }
    }

    // ---- 3. Paths: a cross or L-shaped path through spawn ----
    const pathStyle = Math.floor(rng() * 3)
    if (pathStyle === 0) {
      // cross
      for (let x = 0; x < MAP_W; x++) if (tiles[32][x].type !== 'water') tiles[32][x] = T('path', false, Math.floor(rng() * 1000))
      for (let y = 0; y < MAP_H; y++) if (tiles[y][32].type !== 'water') tiles[y][32] = T('path', false, Math.floor(rng() * 1000))
    } else if (pathStyle === 1) {
      // horizontal only
      const py = 28 + Math.floor(rng() * 8)
      for (let x = 0; x < MAP_W; x++) if (tiles[py][x].type !== 'water') tiles[py][x] = T('path', false, Math.floor(rng() * 1000))
      for (let y = 0; y < MAP_H; y++) if (tiles[y][32].type !== 'water') tiles[y][32] = T('path', false, Math.floor(rng() * 1000))
    } else {
      // diagonal-ish (two paths meeting at center, offset)
      const ax = 24 + Math.floor(rng() * 16)
      for (let x = 0; x < MAP_W; x++) if (tiles[32][x].type !== 'water') tiles[32][x] = T('path', false, Math.floor(rng() * 1000))
      for (let y = 0; y < MAP_H; y++) if (tiles[y][ax].type !== 'water') tiles[y][ax] = T('path', false, Math.floor(rng() * 1000))
    }

    // ---- 4. Resources: scattered in procedural clusters ----
    const resources: ResourceNode[] = []
    let rid = 1
    const placeCluster = (type: ResourceNode['type'], count: number, region?: { x: number; y: number; r: number }) => {
      for (let i = 0; i < count; i++) {
        let tx: number, ty: number, tries = 0
        do {
          if (region) {
            tx = Math.floor(region.x + (rng() - 0.5) * region.r * 2)
            ty = Math.floor(region.y + (rng() - 0.5) * region.r * 2)
          } else {
            tx = Math.floor(rng() * MAP_W)
            ty = Math.floor(rng() * MAP_H)
          }
          tries++
        } while (!this.tileValidForResource(tiles[ty]?.[tx], tx, ty) && tries < 30)
        if (!this.tileValidForResource(tiles[ty]?.[tx], tx, ty)) continue
        const hp = type === 'tree' ? 4 : type === 'rock' ? 5 : type === 'iron' ? 6 : type === 'coal' ? 6 : type === 'bush' ? 2 : 2
        resources.push({ id: rid++, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 + (type === 'tree' ? 4 : 0), type, hp, maxHp: hp, respawnAt: 0, alive: true, v: Math.floor(rng() * 1000) })
      }
    }
    // forest clusters (3-5 dense groves)
    const groveCount = 3 + Math.floor(rng() * 3)
    for (let g = 0; g < groveCount; g++) {
      const gx = 6 + Math.floor(rng() * (MAP_W - 12))
      const gy = 6 + Math.floor(rng() * (MAP_H - 12))
      placeCluster('tree', 12 + Math.floor(rng() * 14), { x: gx, y: gy, r: 4 + Math.floor(rng() * 3) })
    }
    // rock fields (2-3)
    const rockFields = 2 + Math.floor(rng() * 2)
    for (let r = 0; r < rockFields; r++) {
      const rx = 6 + Math.floor(rng() * (MAP_W - 12))
      const ry = 6 + Math.floor(rng() * (MAP_H - 12))
      placeCluster('rock', 6 + Math.floor(rng() * 8), { x: rx, y: ry, r: 3 + Math.floor(rng() * 2) })
    }
    // ore veins: iron and coal in 1-2 random mountainous spots each
    const veinCount = 1 + Math.floor(rng() * 2)
    for (let v = 0; v < veinCount; v++) {
      const ix = 4 + Math.floor(rng() * (MAP_W - 8))
      const iy = 4 + Math.floor(rng() * (MAP_H - 8))
      placeCluster('iron', 6 + Math.floor(rng() * 6), { x: ix, y: iy, r: 3 })
      placeCluster('coal', 5 + Math.floor(rng() * 5), { x: ix + 3, y: iy + 2, r: 3 })
    }
    // scattered bushes and herbs
    placeCluster('bush', 18 + Math.floor(rng() * 10))
    placeCluster('herb', 14 + Math.floor(rng() * 10))

    // ---- 5. Ruins: scattered wall-tile blocks (decorative + solid) ----
    const ruinCount = 2 + Math.floor(rng() * 3)
    for (let r = 0; r < ruinCount; r++) {
      const rx = 6 + Math.floor(rng() * (MAP_W - 12))
      const ry = 6 + Math.floor(rng() * (MAP_H - 12))
      if (this.inSpawnClearing(rx, ry)) continue
      const rw = 2 + Math.floor(rng() * 3)
      const rh = 2 + Math.floor(rng() * 3)
      // only place walls on non-water tiles, leave a gap (doorway)
      const gap = Math.floor(rng() * rw)
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          if (x === gap && y === rh - 1) continue // doorway
          const tx = rx + x, ty = ry + y
          if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue
          if (tiles[ty][tx].type === 'water') continue
          tiles[ty][tx] = T('wall', true, Math.floor(rng() * 1000))
        }
      }
    }

    // ---- 6. Flowers and dirt patches (decoration) ----
    const flowerCount = 30 + Math.floor(rng() * 30)
    for (let i = 0; i < flowerCount; i++) {
      const tx = Math.floor(rng() * MAP_W), ty = Math.floor(rng() * MAP_H)
      if (tiles[ty]?.[tx]?.type === 'grass' && rng() > 0.4) tiles[ty][tx] = T('flower', false, Math.floor(rng() * 1000))
    }
    const dirtPatchCount = 5 + Math.floor(rng() * 6)
    for (let i = 0; i < dirtPatchCount; i++) {
      const dx = Math.floor(rng() * MAP_W), dy = Math.floor(rng() * MAP_H)
      const ds = 2 + Math.floor(rng() * 3)
      for (let y = -ds; y <= ds; y++) {
        for (let x = -ds; x <= ds; x++) {
          const tx = dx + x, ty = dy + y
          if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue
          if (x * x + y * y > ds * ds) continue
          if (tiles[ty][tx].type === 'grass' || tiles[ty][tx].type === 'grass2') tiles[ty][tx] = T('dirt', false, Math.floor(rng() * 1000))
        }
      }
    }

    // ---- 7. Stations near spawn (always at center, fixed for usability) ----
    const stations: CraftingStation[] = [
      { id: 1, x: 30 * TILE + 16, y: 30 * TILE, type: 'campfire' },
      { id: 2, x: 34 * TILE + 16, y: 30 * TILE, type: 'workbench' },
    ]

    // ---- 8. Dungeon portal: random edge position (avoid spawn) ----
    let px = 0, py = 0, ptries = 0
    do {
      // pick a random edge
      const edge = Math.floor(rng() * 4)
      if (edge === 0) { px = 4 + Math.floor(rng() * (MAP_W - 8)); py = 4 }
      else if (edge === 1) { px = 4 + Math.floor(rng() * (MAP_W - 8)); py = MAP_H - 5 }
      else if (edge === 2) { px = 4; py = 4 + Math.floor(rng() * (MAP_H - 8)) }
      else { px = MAP_W - 5; py = 4 + Math.floor(rng() * (MAP_H - 8)) }
      ptries++
    } while (this.inSpawnClearing(px, py) && ptries < 20)
    // clear tiles around portal
    for (let y = -1; y <= 2; y++) {
      for (let x = -1; x <= 1; x++) {
        const tx = px + x, ty = py + y
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue
        if (tiles[ty][tx].solid) tiles[ty][tx] = T('path', false, Math.floor(rng() * 1000))
      }
    }
    const portals: Portal[] = [
      { x: px * TILE - 4, y: py * TILE, w: 40, h: 56, to: 'dungeon', label: 'Cripta do Silêncio' },
    ]
    // remember dungeon portal position for player navigation hint
    this.dungeonPortalPos = { x: px, y: py }

    this.tiles.plains = tiles
    this.resources.plains = resources
    this.stations = stations
    this.portals.plains = portals
    this.tileCacheDirty.plains = true
  }

  private dungeonPortalPos = { x: 32, y: 4 }

  private genDungeon(seed: number) {
    // Procedural dungeon: random rooms connected by corridors, with a boss
    // arena at the far end. Layout changes every playthrough.
    const rng = mulberry32(seed ^ 0x9e37)
    const W = DUNGEON_W, H = DUNGEON_H
    const tiles: Tile[][] = []
    for (let y = 0; y < H; y++) {
      const row: Tile[] = []
      for (let x = 0; x < W; x++) row.push(T('wall', true, Math.floor(rng() * 1000)))
      tiles.push(row)
    }
    const carve = (x0: number, y0: number, w: number, h: number) => {
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++)
          if (x >= 0 && y >= 0 && x < W && y < H) tiles[y][x] = T('floor', false, Math.floor(rng() * 1000))
    }
    const carveH = (x1: number, x2: number, y: number) => {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) if (x >= 0 && x < W && y >= 0 && y < H) tiles[y][x] = T('floor', false, Math.floor(rng() * 1000))
    }
    const carveV = (y1: number, y2: number, x: number) => {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) if (x >= 0 && x < W && y >= 0 && y < H) tiles[y][x] = T('floor', false, Math.floor(rng() * 1000))
    }

    // entrance room at top-center
    const entX = Math.floor(W / 2) - 1
    const entY = 2
    carve(entX, entY, 4, 4)

    // generate 4-6 random rooms, connected by corridors
    const rooms: { x: number; y: number; w: number; h: number; cx: number; cy: number }[] = []
    const roomCount = 4 + Math.floor(rng() * 3)
    let lastCx = entX + 2, lastCy = entY + 4
    for (let i = 0; i < roomCount; i++) {
      let rx: number, ry: number, rw: number, rh: number, tries = 0
      do {
        rw = 4 + Math.floor(rng() * 6)
        rh = 4 + Math.floor(rng() * 5)
        rx = 2 + Math.floor(rng() * (W - rw - 4))
        ry = 8 + Math.floor(rng() * (H - rh - 10))
        tries++
      } while (tries < 30)
      carve(rx, ry, rw, rh)
      const cx = rx + Math.floor(rw / 2), cy = ry + Math.floor(rh / 2)
      // connect to previous room with an L-shaped corridor
      carveH(lastCx, cx, lastCy)
      carveV(lastCy, cy, cx)
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx, cy })
      lastCx = cx; lastCy = cy
    }

    // boss arena: large room at the bottom
    const bossW = 10 + Math.floor(rng() * 4)
    const bossH = 8 + Math.floor(rng() * 4)
    const bossX = Math.floor((W - bossW) / 2)
    const bossY = H - bossH - 2
    carve(bossX, bossY, bossW, bossH)
    // connect last room to boss arena
    carveH(lastCx, bossX + Math.floor(bossW / 2), lastCy)
    carveV(lastCy, bossY + Math.floor(bossH / 2), bossX + Math.floor(bossW / 2))

    // rubble decoration on floors
    const rubbleCount = 18 + Math.floor(rng() * 16)
    for (let i = 0; i < rubbleCount; i++) {
      const tx = Math.floor(rng() * W), ty = Math.floor(rng() * H)
      if (tiles[ty]?.[tx]?.type === 'floor' && rng() > 0.6) tiles[ty][tx] = T('rubble', false, Math.floor(rng() * 1000))
    }
    // altar in boss arena center
    const altarX = bossX + Math.floor(bossW / 2)
    const altarY = bossY + Math.floor(bossH / 2)
    if (tiles[altarY]?.[altarX]) tiles[altarY][altarX] = T('altar', false, 0)
    if (tiles[altarY]?.[altarX + 1]) tiles[altarY][altarX + 1] = T('altar', false, 0)
    // exit door at entrance
    if (tiles[entY - 1]?.[entX]) tiles[entY - 1][entX] = T('door', false, 0)
    if (tiles[entY - 1]?.[entX + 1]) tiles[entY - 1][entX + 1] = T('door', false, 0)

    // store boss arena center for enemy spawning
    this.dungeonBossPos = { x: altarX, y: altarY }
    // store entrance for player spawn
    this.dungeonEntrancePos = { x: entX + 2, y: entY }

    const portals: Portal[] = [
      { x: entX * TILE, y: (entY - 1) * TILE, w: 2 * TILE, h: TILE, to: 'plains', label: 'Voltar à Planície' },
    ]
    this.tiles.dungeon = tiles
    this.portals.dungeon = portals
    this.resources.dungeon = []
    this.tileCacheDirty.dungeon = true
  }

  private dungeonBossPos = { x: 20, y: 29 }
  private dungeonEntrancePos = { x: 20, y: 4 }

  private spawnStructures() {
    // Procedural shrine placement: chapel and tower at random valid positions,
    // far from spawn and from each other. Positions derived from seed (already
    // applied via genPlains rng) — here we pick using a fresh rng from seed.
    const rng = mulberry32(this.seed + 7777)
    this.structures = []
    const placed: { x: number; y: number }[] = []
    const findSpot = (minDist: number): { x: number; y: number } => {
      for (let tries = 0; tries < 60; tries++) {
        const tx = 4 + Math.floor(rng() * (MAP_W - 8))
        const ty = 4 + Math.floor(rng() * (MAP_H - 8))
        if (this.inSpawnClearing(tx, ty)) continue
        // not on water
        const t = this.tiles.plains[ty]?.[tx]
        if (!t || t.type === 'water' || t.solid) continue
        // far enough from other structures and portal
        if (Math.hypot(tx - this.dungeonPortalPos.x, ty - this.dungeonPortalPos.y) < minDist) continue
        let ok = true
        for (const p of placed) {
          if (Math.hypot(tx - p.x, ty - p.y) < 10) { ok = false; break }
        }
        if (!ok) continue
        // clear surrounding tiles so the structure is reachable
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const t2 = this.tiles.plains[ty + dy]?.[tx + dx]
            if (t2 && (t2.solid || t2.type === 'water')) {
              this.tiles.plains[ty + dy][tx + dx] = T('grass', false, Math.floor(rng() * 1000))
            }
          }
        }
        placed.push({ x: tx, y: ty })
        return { x: tx, y: ty }
      }
      return { x: 8, y: 22 }
    }
    const chapel = findSpot(12)
    const tower = findSpot(12)
    this.structures.push({ id: 1, type: 'chapel', x: chapel.x * TILE, y: chapel.y * TILE, used: false })
    this.structures.push({ id: 2, type: 'tower', x: tower.x * TILE, y: tower.y * TILE, used: false })
    this.tileCacheDirty.plains = true
    this.spawnRescueEncounters()
  }

  // spawn rescue encounters: elf & dog trapped, each guarded by enemies
  private spawnRescueEncounters() {
    const rng = mulberry32(this.seed + 9999)
    this.rescueEncounters = []
    if (this.elfRescued && this.dogRescued) return
    const findSpot = (): { x: number; y: number } => {
      for (let tries = 0; tries < 60; tries++) {
        const tx = 5 + Math.floor(rng() * (MAP_W - 10))
        const ty = 5 + Math.floor(rng() * (MAP_H - 10))
        if (this.inSpawnClearing(tx, ty)) continue
        const t = this.tiles.plains[ty]?.[tx]
        if (!t || t.type === 'water' || t.solid) continue
        return { x: tx, y: ty }
      }
      return { x: 12, y: 48 }
    }
    if (!this.elfRescued) {
      const spot = findSpot()
      this.rescueEncounters.push({ kind: 'elf', x: spot.x * TILE + 16, y: spot.y * TILE + 16, guardKilled: false, guardIds: [] })
    }
    if (!this.dogRescued) {
      const spot = findSpot()
      this.rescueEncounters.push({ kind: 'dog', x: spot.x * TILE + 16, y: spot.y * TILE + 16, guardKilled: false, guardIds: [] })
    }
  }

  private spawnEnemies() {
    // Procedural enemy placement: enemies spawn at random valid floor tiles,
    // distributed in small "camps" of the same type. The composition and
    // locations change every playthrough. Bosses are placed at fixed logical
    // spots (bear boss in a random plains clearing, dungeon boss in arena).
    this.enemies = []
    let id = 1
    const rng = mulberry32(this.seed + (this.zone === 'plains' ? 3333 : 5555))

    if (this.zone === 'plains') {
      // helper: find a random valid spawn tile (non-solid, non-water, outside
      // spawn clearing, optionally with a min distance from a point)
      const findTile = (minDistFrom?: { x: number; y: number }, d?: number): { x: number; y: number } => {
        for (let tries = 0; tries < 40; tries++) {
          const tx = 3 + Math.floor(rng() * (MAP_W - 6))
          const ty = 3 + Math.floor(rng() * (MAP_H - 6))
          if (this.inSpawnClearing(tx, ty)) continue
          const t = this.tiles.plains[ty]?.[tx]
          if (!t || t.solid || t.type === 'water') continue
          if (minDistFrom && d && Math.hypot(tx - minDistFrom.x, ty - minDistFrom.y) < d) continue
          // avoid placing right on the dungeon portal tile
          if (Math.hypot(tx - this.dungeonPortalPos.x, ty - this.dungeonPortalPos.y) < 3) continue
          return { x: tx, y: ty }
        }
        return { x: 10, y: 10 }
      }
      // spawn camps: small groups of the same enemy near each other
      const camps: { kind: EnemyKind; count: number }[] = [
        { kind: 'slime', count: 2 + Math.floor(rng() * 2) },
        { kind: 'goblin', count: 2 + Math.floor(rng() * 2) },
        { kind: 'wolf', count: 2 + Math.floor(rng() * 2) },
        { kind: 'jaguar', count: 1 + Math.floor(rng() * 2) },
        { kind: 'vampire', count: 1 + Math.floor(rng() * 2) },
        { kind: 'lizard_bard', count: 1 + Math.floor(rng() * 2) },
        { kind: 'skeleton', count: 1 + Math.floor(rng() * 2) },
        { kind: 'wraith', count: 1 },
      ]
      for (const camp of camps) {
        // pick a camp center, then scatter the group around it
        const center = findTile()
        for (let i = 0; i < camp.count; i++) {
          const spot = {
            x: Math.max(2, Math.min(MAP_W - 3, center.x + Math.round((rng() - 0.5) * 6))),
            y: Math.max(2, Math.min(MAP_H - 3, center.y + Math.round((rng() - 0.5) * 6))),
          }
          const t = this.tiles.plains[spot.y]?.[spot.x]
          if (!t || t.solid || t.type === 'water') continue
          if (this.inSpawnClearing(spot.x, spot.y)) continue
          this.enemies.push(this.makeEnemy(id++, camp.kind, spot.x * TILE + TILE / 2, spot.y * TILE + TILE / 2))
        }
      }
      // drake: 1-2, placed in open areas (away from forest)
      const drakeCount = 1 + Math.floor(rng() * 2)
      for (let i = 0; i < drakeCount; i++) {
        const spot = findTile()
        this.enemies.push(this.makeEnemy(id++, 'drake', spot.x * TILE + TILE / 2, spot.y * TILE + TILE / 2))
      }
      // bear boss (Maou Ursão): in a random far clearing, kept away from spawn
      const bossSpot = findTile({ x: 32, y: 32 }, 18)
      const bear = this.makeEnemy(id++, 'bear_boss', bossSpot.x * TILE + TILE / 2, bossSpot.y * TILE + TILE / 2)
      bear.isBoss = true
      bear.leash = 9999
      // clear a little arena around the bear
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const t = this.tiles.plains[bossSpot.y + dy]?.[bossSpot.x + dx]
          if (t && t.solid && t.type !== 'water') {
            this.tiles.plains[bossSpot.y + dy][bossSpot.x + dx] = T('grass', false, Math.floor(rng() * 1000))
          }
        }
      }
      this.tileCacheDirty.plains = true
      this.enemies.push(bear)

      // spawn guards for rescue encounters (elf & dog trapped by enemies)
      for (const enc of this.rescueEncounters) {
        if (enc.guardKilled) continue
        enc.guardIds = []
        const guardKinds: EnemyKind[] = ['goblin', 'goblin', 'skeleton', 'wolf']
        const guardCount = 2 + Math.floor(rng() * 2)
        for (let i = 0; i < guardCount; i++) {
          const a = (i / guardCount) * Math.PI * 2
          const gx = Math.floor((enc.x + Math.cos(a) * 60) / TILE)
          const gy = Math.floor((enc.y + Math.sin(a) * 60) / TILE)
          const t = this.tiles.plains[gy]?.[gx]
          if (t && !t.solid && t.type !== 'water') {
            const guard = this.makeEnemy(id++, guardKinds[i % guardKinds.length], gx * TILE + 16, gy * TILE + 16)
            guard.leash = 999 // guards stay near the prisoner
            guard.noRespawn = true // guards stay dead when killed
            this.enemies.push(guard)
            enc.guardIds.push(guard.id)
          }
        }
      }
    } else {
      // dungeon: scatter enemies on carved floor tiles, boss in arena center
      const isFloor = (tx: number, ty: number) => {
        const t = this.tiles.dungeon[ty]?.[tx]
        return t && !t.solid && t.type !== 'wall'
      }
      const findFloor = (minDistFrom?: { x: number; y: number }, d?: number): { x: number; y: number } => {
        for (let tries = 0; tries < 50; tries++) {
          const tx = Math.floor(rng() * DUNGEON_W)
          const ty = 3 + Math.floor(rng() * (DUNGEON_H - 6))
          if (!isFloor(tx, ty)) continue
          if (minDistFrom && d && Math.hypot(tx - minDistFrom.x, ty - minDistFrom.y) < d) continue
          // avoid the entrance
          if (Math.hypot(tx - this.dungeonEntrancePos.x, ty - this.dungeonEntrancePos.y) < 4) continue
          return { x: tx, y: ty }
        }
        return { x: this.dungeonEntrancePos.x, y: this.dungeonEntrancePos.y + 4 }
      }
      // enemy composition: random mix
      const mobs: EnemyKind[] = ['skeleton', 'skeleton', 'goblin', 'goblin', 'wraith', 'jaguar', 'vampire']
      const mobCount = 7 + Math.floor(rng() * 4)
      for (let i = 0; i < mobCount; i++) {
        const kind = mobs[Math.floor(rng() * mobs.length)]
        const spot = findFloor(this.dungeonBossPos, 6)
        this.enemies.push(this.makeEnemy(id++, kind, spot.x * TILE + TILE / 2, spot.y * TILE + TILE / 2))
      }
      // boss in arena center
      const boss = this.makeEnemy(id++, 'boss', this.dungeonBossPos.x * TILE, this.dungeonBossPos.y * TILE)
      boss.isBoss = true
      boss.leash = 9999
      this.enemies.push(boss)
      this.bossRef = boss
    }
  }

  private makeEnemy(id: number, kind: EnemyKind, x: number, y: number): Enemy {
    const def: EnemyDef = ENEMIES[kind]
    // poise threshold: how much stagger damage before the enemy is stunned
    const poise = kind === 'boss' ? 200 : kind === 'wraith' ? 40 : kind === 'skeleton' ? 70 : 50
    return {
      id, kind, x, y, vx: 0, vy: 0,
      hp: def.hp, maxHp: def.hp,
      state: 'idle', stateTimer: 0, dir: 'down',
      spawnX: x, spawnY: y, leash: kind === 'boss' ? 9999 : 260,
      animTime: Math.random() * 10, hitFlash: 0, respawnAt: 0, alive: true,
      attackTargetX: 0, attackTargetY: 0, knockX: 0, knockY: 0,
      isBoss: kind === 'boss',
      stagger: 0, staggerMax: poise,
      attackCd: 0, rangedCd: 2 + Math.random() * 2, lungeCd: 2 + Math.random() * 2,
    }
  }

  // ---- game start / load --------------------------------------------------
  startGame(heroName: string, cls: HeroClassId) {
    this.heroName = heroName || 'Herói'
    this.cls = cls
    this.seed = (Date.now() & 0xffff) + Math.floor(Math.random() * 9999)
    this.genPlains(this.seed)
    this.genDungeon(this.seed)
    this.zone = 'plains'
    this.farmPlots = []
    this.bossKilled = false
    this.timeOfDay = 0.3
    this.playtime = 0
    this.craftLevels = { cooking: 1, crafting: 1, alchemy: 1, construction: 1 }
    this.craftXp = { cooking: 0, crafting: 0, alchemy: 0, construction: 0 }
    this.inventory = []
    this.drops = []
    this.projectiles = []
    this.floats = []
    this.particles = []
    this.killFeed = []

    const base = CLASSES[cls]
    const stats = statsForClass(cls, 1)
    this.player = {
      x: 32 * TILE + 16, y: 34 * TILE, vx: 0, vy: 0, dir: 'down',
      cls, level: 1, xp: 0, xpNext: xpForLevel(1),
      hp: stats.maxHp, maxHp: stats.maxHp,
      stamina: stats.maxStamina, maxStamina: stats.maxStamina,
      mana: stats.maxMana, maxMana: stats.maxMana,
      hunger: 100, thirst: 100, gold: 20,
      attacking: 0, attackType: null, attackCd: 0,
      dodgeTimer: 0, dodgeCd: 0, iframes: 0, blocking: false, blockHeldTime: 0, parryTimer: 0, hitFlash: 0,
      animTime: 0, moving: false, kills: 0, deaths: 0, playtime: 0, invuln: 0,
      comboCount: 0, comboTimer: 0, chargeTime: 0, lockTarget: -1, poise: 60, stagger: 0,
      ascension: 'none', holyCd: 0, fireballCd: 0, frostCd: 0, holyAura: 0,
    }
    this.equipped = base.startWeapon
    this.inventory = [...base.startItems.map((s) => ({ ...s }))]
    // everyone gets a hoe to farm
    this.addItem('hoe', 1)
    this.addItem('torch', 1)
    // reset companions & rescue encounters
    this.companions = []
    this.elfRescued = false
    this.dogRescued = false
    this.rescueEncounters = []
    this.wasNight = false
    this.spawnStructures()
    this.spawnEnemies()
    this.screen = 'game'
    this.paused = false
    this.toast = { id: this.nextId++, text: 'Você desperta em Eldoria... sobreviva.', kind: 'info' }
    this.startMusic()
  }

  loadSave(data: SaveData) {
    this.genPlains(data.seed || 12345)
    this.genDungeon(data.seed || 12345)
    this.zone = data.zone
    this.farmPlots = data.farmPlots || []
    this.bossKilled = data.bossKilled
    this.heroName = data.heroName
    this.cls = data.cls
    this.playtime = data.playtime
    this.equipped = data.equipped
    this.inventory = data.inventory || []
    this.craftLevels = data.craftLevels || { cooking: 1, crafting: 1, alchemy: 1, construction: 1 }
    this.craftXp = data.craftXp || { cooking: 0, crafting: 0, alchemy: 0, construction: 0 }
    this.timeOfDay = 0.3
    const stats = statsForClass(data.cls, data.level)
    this.player = {
      x: data.px, y: data.py, vx: 0, vy: 0, dir: 'down',
      cls: data.cls, level: data.level, xp: data.xp, xpNext: xpForLevel(data.level),
      hp: Math.min(data.hp, stats.maxHp), maxHp: stats.maxHp,
      stamina: Math.min(data.stamina, stats.maxStamina), maxStamina: stats.maxStamina,
      mana: Math.min(data.mana, stats.maxMana), maxMana: stats.maxMana,
      hunger: data.hunger, thirst: data.thirst, gold: data.gold,
      attacking: 0, attackType: null, attackCd: 0,
      dodgeTimer: 0, dodgeCd: 0, iframes: 0, blocking: false, blockHeldTime: 0, parryTimer: 0, hitFlash: 0,
      animTime: 0, moving: false, kills: data.kills, deaths: data.deaths, playtime: data.playtime, invuln: 0,
      comboCount: 0, comboTimer: 0, chargeTime: 0, lockTarget: -1, poise: 60, stagger: 0,
      ascension: data.ascension || 'none', holyCd: 0, fireballCd: 0, frostCd: 0, holyAura: 0,
    }
    this.spawnStructures()
    // restore structure used-state from save
    if (data.chapelUsed) { const c = this.structures.find((s) => s.type === 'chapel'); if (c) c.used = true }
    if (data.towerUsed) { const tw = this.structures.find((s) => s.type === 'tower'); if (tw) tw.used = true }
    // restore companion rescue state
    this.elfRescued = data.elfRescued || false
    this.dogRescued = data.dogRescued || false
    this.companions = []
    this.wasNight = false
    this.spawnEnemies()
    if (this.bossKilled && this.bossRef) {
      this.bossRef.alive = false
      this.bossRef.respawnAt = 0
    }
    this.screen = 'game'
    this.paused = false
    this.toast = { id: this.nextId++, text: 'Jornada retomada.', kind: 'info' }
    this.startMusic()
  }

  exportSave(): SaveData {
    const p = this.player
    return {
      version: 1,
      heroName: this.heroName,
      cls: this.cls,
      level: p.level,
      xp: p.xp,
      hp: p.hp,
      stamina: p.stamina,
      mana: p.mana,
      hunger: p.hunger,
      thirst: p.thirst,
      gold: p.gold,
      kills: p.kills,
      deaths: p.deaths,
      playtime: this.playtime,
      zone: this.zone,
      px: p.x,
      py: p.y,
      inventory: this.inventory,
      equipped: this.equipped,
      craftLevels: this.craftLevels,
      craftXp: this.craftXp,
      farmPlots: this.farmPlots,
      bossKilled: this.bossKilled,
      seed: this.seed,
      ascension: p.ascension,
      chapelUsed: this.structures.some((s) => s.type === 'chapel' && s.used),
      towerUsed: this.structures.some((s) => s.type === 'tower' && s.used),
      elfRescued: this.elfRescued,
      dogRescued: this.dogRescued,
    }
  }

  // ---- inventory helpers --------------------------------------------------
  addItem(id: string, qty: number): boolean {
    const def = ITEMS[id]
    if (!def) return false
    let remaining = qty
    for (const s of this.inventory) {
      if (s.id === id && s.qty < def.max) {
        const add = Math.min(def.max - s.qty, remaining)
        s.qty += add
        remaining -= add
        if (remaining <= 0) return true
      }
    }
    while (remaining > 0) {
      const add = Math.min(def.max, remaining)
      this.inventory.push({ id, qty: add })
      remaining -= add
    }
    return true
  }

  removeItem(id: string, qty: number): boolean {
    let need = qty
    for (const s of this.inventory) {
      if (s.id === id) {
        const take = Math.min(s.qty, need)
        s.qty -= take
        need -= take
        if (need <= 0) break
      }
    }
    this.inventory = this.inventory.filter((s) => s.qty > 0)
    return need <= 0
  }

  countItem(id: string): number {
    return this.inventory.filter((s) => s.id === id).reduce((a, s) => a + s.qty, 0)
  }

  hasItems(stacks: ItemStack[]): boolean {
    return stacks.every((s) => this.countItem(s.id) >= s.qty)
  }

  // ---- actions ------------------------------------------------------------
  toggleInventory() {
    this.showInventory = !this.showInventory
    if (this.showInventory) this.showCrafting = false
  }
  toggleCrafting() {
    if (this.nearStation) {
      this.showCrafting = !this.showCrafting
      if (this.showCrafting) this.showInventory = false
    } else {
      this.flashToast('Aproxime-se de uma bancada/fogueira', 'bad')
    }
  }
  togglePause() {
    this.paused = !this.paused
    this.showInventory = false
    this.showCrafting = false
  }

  useItem(index: number) {
    const stack = this.inventory[index]
    if (!stack) return
    const def = ITEMS[stack.id]
    if (!def) return
    if (def.category === 'food' || def.category === 'drink') {
      const p = this.player
      if (def.hunger) p.hunger = Math.min(100, p.hunger + def.hunger)
      if (def.thirst) p.thirst = Math.min(100, p.thirst + def.thirst)
      if (def.heal) {
        const mul = this.cls === 'healer' && def.heal > 0 ? 1.5 : 1
        p.hp = Math.min(p.maxHp, p.hp + def.heal * mul)
      }
      this.removeItem(stack.id, 1)
      this.spawnFloat(p.x, p.y - 20, def.heal && def.heal > 0 ? `+${def.heal} HP` : '+', '#7cb342')
      this.flashToast(`Consumiu ${def.name}`, 'good')
    } else if (def.category === 'potion') {
      const p = this.player
      if (def.effect === 'heal') {
        const mul = this.cls === 'healer' ? 1.5 : 1
        p.hp = Math.min(p.maxHp, p.hp + (def.effectAmount || 0) * mul)
        this.spawnFloat(p.x, p.y - 20, `+${Math.round((def.effectAmount || 0) * mul)} HP`, '#e74c3c')
      } else if (def.effect === 'mana') {
        p.mana = Math.min(p.maxMana, p.mana + (def.effectAmount || 0))
        this.spawnFloat(p.x, p.y - 20, `+${def.effectAmount} MP`, '#3498db')
      }
      this.removeItem(stack.id, 1)
      this.flashToast(`Usou ${def.name}`, 'good')
    } else if (def.category === 'weapon' || def.category === 'tool') {
      this.equipItem(index)
    } else if (def.category === 'seed') {
      this.plantSeed()
    }
  }

  useEquippedPotion() {
    const idx = this.inventory.findIndex((s) => ITEMS[s.id]?.category === 'potion')
    if (idx >= 0) this.useItem(idx)
    else this.flashToast('Sem poções', 'bad')
  }

  equipItem(index: number) {
    const stack = this.inventory[index]
    if (!stack) return
    const def = ITEMS[stack.id]
    if (!def || (def.category !== 'weapon' && def.category !== 'tool')) return
    // swap equipped with this
    const old = this.equipped
    this.equipped = stack.id
    // remove one from stack
    stack.qty -= 1
    this.inventory = this.inventory.filter((s) => s.qty > 0)
    if (old && ITEMS[old]) this.addItem(old, 1)
    this.flashToast(`Equipou ${def.name}`, 'good')
  }

  dropItem(index: number) {
    const stack = this.inventory[index]
    if (!stack) return
    this.drops.push({
      id: this.nextId++, x: this.player.x, y: this.player.y + 14,
      vx: (Math.random() - 0.5) * 60, vy: -40, stack: { id: stack.id, qty: 1 },
      life: 60, bob: 0,
    })
    stack.qty -= 1
    this.inventory = this.inventory.filter((s) => s.qty > 0)
  }

  craft(recipeId: string) {
    const r = RECIPES.find((x) => x.id === recipeId)
    if (!r) return
    if (r.station !== 'none' && this.nearStation !== r.station) {
      this.flashToast('Estação errada', 'bad')
      return
    }
    if (r.craftLevel && this.craftLevels[r.craftLevel.skill] < r.craftLevel.level) {
      this.flashToast(`Requer ${r.craftLevel.skill} nv ${r.craftLevel.level}`, 'bad')
      return
    }
    if (!this.hasItems(r.inputs)) {
      this.flashToast('Materiais insuficientes', 'bad')
      return
    }
    for (const inp of r.inputs) this.removeItem(inp.id, inp.qty)
    this.addItem(r.output.id, r.output.qty)
    // craft xp
    if (r.craftLevel) {
      const sk = r.craftLevel.skill
      this.craftXp[sk] += 10
      while (this.craftXp[sk] >= craftXpForLevel(this.craftLevels[sk])) {
        this.craftXp[sk] -= craftXpForLevel(this.craftLevels[sk])
        this.craftLevels[sk] += 1
        this.flashToast(`${sk} subiu para nv ${this.craftLevels[sk]}!`, 'good')
      }
    } else {
      // default to crafting skill
      this.craftXp.crafting += 4
      while (this.craftXp.crafting >= craftXpForLevel(this.craftLevels.crafting)) {
        this.craftXp.crafting -= craftXpForLevel(this.craftLevels.crafting)
        this.craftLevels.crafting += 1
      }
    }
    const def = ITEMS[r.output.id]
    this.flashToast(`Criou ${def.name}`, 'good')
    this.spawnFloat(this.player.x, this.player.y - 24, 'forjado!', '#f1c40f')
  }

  interact() {
    if (this.nearPortal) {
      this.changeZone()
      return
    }
    // special structures: chapel (paladin) & tower (mage)
    if (this.nearStructure) {
      this.interactStructure()
      return
    }
    const p = this.player
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE)
    const tile = this.tiles[this.zone][ty]?.[tx]

    // ---- rescue companions (elf / dog) guarded by enemies ----
    for (const enc of this.rescueEncounters) {
      if (enc.guardKilled) continue
      if (Math.hypot(enc.x - p.x, enc.y - p.y) < 40) {
        // check if guards are dead
        const guardsAlive = enc.guardIds.some((id) => this.enemies.find((e) => e.id === id && e.alive))
        if (!guardsAlive) {
          this.rescueCompanion(enc)
          return
        } else {
          this.flashToast('Derrote os guardas para libertar o prisioneiro!', 'bad')
          return
        }
      }
    }

    // ---- collect water from a lake/river tile you're standing NEXT to ----
    if (tile && tile.type === 'water') {
      const bottles = this.countItem('water_bottle')
      if (bottles < 99) {
        const fill = Math.min(5, 99 - bottles)
        this.addItem('water_bottle', fill)
        this.spawnFloat(p.x, p.y - 20, `+${fill} água`, '#3f7fb4')
        this.spawnParticles(p.x, p.y, 6, '#4a8fc4')
        this.flashToast(`Encheu ${fill} garrafas de água`, 'good')
      } else {
        this.flashToast('Inventário cheio de água', 'info')
      }
      return
    }
    // also check adjacent tiles for water (so you can fill from the shore)
    const adjacentWater = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
      { dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 },
    ]
    for (const a of adjacentWater) {
      const at = this.tiles[this.zone][ty + a.dy]?.[tx + a.dx]
      if (at && at.type === 'water') {
        const bottles = this.countItem('water_bottle')
        if (bottles < 99) {
          const fill = Math.min(5, 99 - bottles)
          this.addItem('water_bottle', fill)
          this.spawnFloat(p.x, p.y - 20, `+${fill} água`, '#3f7fb4')
          this.spawnParticles(p.x, p.y, 6, '#4a8fc4')
          this.flashToast(`Encheu ${fill} garrafas de água`, 'good')
          return
        }
      }
    }

    // ---- gather nearby resource (tree, rock, bush, herb, ore) ----
    let best: ResourceNode | null = null
    let bestD = 36 * 36
    for (const r of this.resources[this.zone]) {
      if (!r.alive) continue
      const dx = r.x - p.x, dy = r.y - p.y
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; best = r }
    }
    if (best) {
      this.gatherResource(best)
      return
    }
    this.flashToast('Nada para interagir aqui', 'info')
  }

  // ---- farming (T key): till / plant / water / harvest ----
  farmAction() {
    const p = this.player
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE)
    const tile = this.tiles[this.zone][ty]?.[tx]
    const plot = this.farmPlots.find((f) => f.tileX === tx && f.tileY === ty)

    // 1. harvest if crop is mature
    if (plot && plot.stage >= 3) {
      this.harvestCrop(plot)
      return
    }
    // 2. plant seed if plot exists but has no crop
    if (plot && !plot.crop) {
      const seedIdx = this.inventory.findIndex((s) => ITEMS[s.id]?.category === 'seed')
      if (seedIdx >= 0) {
        this.useItem(seedIdx) // plants the seed
        return
      }
      this.flashToast('Sem sementes para plantar', 'bad')
      return
    }
    // 3. water the plot if planted but dry
    if (plot && plot.crop && !plot.watered) {
      const wb = this.inventory.find((s) => s.id === 'water_bottle')
      if (wb) {
        plot.watered = true
        if (tile) { tile.type = 'soil_wet'; this.tileCacheDirty[this.zone] = true }
        this.removeItem('water_bottle', 1)
        this.flashToast('Regado! Crescimento acelerado.', 'good')
        this.spawnParticles(p.x, p.y, 4, '#4a8fc4')
        return
      }
      this.flashToast('Sem água (encha garrafas no lago com E)', 'bad')
      return
    }
    // 4. till soil if on grass with a hoe
    const hasHoe = this.inventory.some((s) => ITEMS[s.id]?.tool === 'hoe')
    if (tile && (tile.type === 'grass' || tile.type === 'grass2') && hasHoe) {
      this.farmPlots.push({ tileX: tx, tileY: ty, stage: 0, growth: 0, watered: false, crop: '' })
      tile.type = 'soil'
      this.tileCacheDirty[this.zone] = true
      this.flashToast('Terra arada! Pressione T de novo para plantar.', 'good')
      this.spawnParticles(p.x, p.y, 4, '#5a3d28')
      return
    }
    if (plot && plot.crop && plot.watered) {
      this.flashToast('A planta já está regada — espere crescer', 'info')
      return
    }
    if (!hasHoe) {
      this.flashToast('Precisa de uma enxada para arar (craft na bancada)', 'bad')
      return
    }
    this.flashToast('Fique em grama para arar (T)', 'info')
  }

  // ---- companion rescue ----
  private rescueCompanion(enc: { kind: CompanionKind; x: number; y: number; guardKilled: boolean; guardIds: number[] }) {
    enc.guardKilled = true
    const comp: Companion = {
      id: this.nextId++,
      kind: enc.kind,
      x: enc.x, y: enc.y, vx: 0, vy: 0, animTime: 0,
      rescued: true, cd: 0, target: -1, hp: 100, dir: 'down',
    }
    this.companions.push(comp)
    if (enc.kind === 'elf') {
      this.elfRescued = true
      this.flashToast('✦ Elfa resgatada! Ela vai te curar periodicamente.', 'good')
      this.message = 'A elfa Lirael foi liberta!\nEla te acompanha e lança curas periódicas quando sua vida está baixa.'
      this.spawnParticles(enc.x, enc.y, 24, '#2ecc71')
    } else {
      this.dogRescued = true
      this.flashToast('✦ Cachorro resgatado! Ele ataca o inimigo que você mirar (Tab).', 'good')
      this.message = 'O cachorro Fang foi liberto!\nEle ataca automaticamente o inimigo que você travar com Tab, causando dano e segurando a atenção dele.'
      this.spawnParticles(enc.x, enc.y, 24, '#e67e22')
    }
    this.spawnFloat(enc.x, enc.y - 30, 'RESGATE!', '#f1c40f')
  }

  // ---- ascension: chapel (paladin) & tower (mage) -------------------------
  interactStructure() {
    const p = this.player
    const s = this.structures.find((st) => Math.hypot(st.x - p.x, st.y - p.y) < 50)
    if (!s) return
    if (s.type === 'chapel') {
      if (p.ascension !== 'none') {
        this.flashToast(`Sua senda já está traçada: ${p.ascension === 'paladin' ? 'Paladino' : 'Mago'}`, 'info')
        return
      }
      if (s.used) {
        this.flashToast('A capela já concedeu sua bênção a outro.', 'info')
        return
      }
      s.used = true
      p.ascension = 'paladin'
      p.maxHp = Math.floor(p.maxHp * 1.2)
      p.hp = p.maxHp
      p.holyCd = 0
      p.holyAura = 0
      this.flashToast('⛪ Ajoelhando-se, a luz divina imbui seu espírito...', 'good')
      this.message = 'PADRINHO DA LUZ\n\nVocê foi abençoado pela Capela. Doravante é um PALADINO.\nPressione F para Golpe Sagrado (Smite Evil) — dano massivo a mortos-vivos e demônios.\nPressione G para Aura Sagrada — regenera HP e empurra inimigos por 8s.'
      this.spawnParticles(p.x, p.y, 30, '#fff3a0')
      this.spawnFloat(p.x, p.y - 30, 'ASCENSÃO: PALADINO!', '#f1c40f')
      this.shake(4, 0.4)
    } else {
      // tower — only works at night
      if (!this.isNight()) {
        this.flashToast('A torre dorme. Volte à noite...', 'info')
        return
      }
      if (p.ascension !== 'none') {
        this.flashToast(`Sua senda já está traçada: ${p.ascension === 'paladino' ? 'Paladino' : 'Mago'}`, 'info')
        return
      }
      if (s.used) {
        this.flashToast('A torre já revelou seus segredos a outro.', 'info')
        return
      }
      s.used = true
      p.ascension = 'mage'
      p.maxMana = Math.floor(p.maxMana * 1.5)
      p.mana = p.maxMana
      p.fireballCd = 0
      p.frostCd = 0
      this.flashToast('🔮 A torre pulsa com energia arcana...', 'good')
      this.message = 'ARTES SECRETAS DO URANISMO\n\nFostes introduzido às artes secretas do uranismo! Meus parabéns, és um MAGO.\nPressione F para Bola de Fogo — projétil explosivo (custa 25 de mana).\nPressione G para Nova de Gelo — congela inimigos próximos (custa 40 de mana).'
      this.spawnParticles(p.x, p.y, 30, '#9b59b6')
      this.spawnFloat(p.x, p.y - 30, 'ASCENSÃO: MAGO!', '#9b59b6')
      this.shake(4, 0.4)
    }
  }

  // ability key F
  useAbilityF() {
    const p = this.player
    if (this.screen !== 'game' || this.paused || p.stagger > 0) return
    if (p.ascension === 'paladin') this.castHolyStrike()
    else if (p.ascension === 'mage') this.castFireball()
  }
  // ability key G
  useAbilityG() {
    const p = this.player
    if (this.screen !== 'game' || this.paused || p.stagger > 0) return
    if (p.ascension === 'paladin') this.castHolyAura()
    else if (p.ascension === 'mage') this.castFrostNova()
  }

  private castHolyStrike() {
    const p = this.player
    if (p.holyCd > 0) { this.flashToast('Golpe Sagrado recarregando', 'bad'); return }
    if (p.mana < 20) { this.flashToast('Mana insuficiente (20)', 'bad'); return }
    p.mana -= 20
    p.holyCd = 4
    // radiant melee burst: damages all enemies in a wide arc, double vs undead
    const ang = this.dirAngle(p.dir)
    let hit = false
    for (const e of this.enemies) {
      if (!e.alive) continue
      const dx = e.x - p.x, dy = e.y - p.y
      const dist = Math.hypot(dx, dy)
      if (dist > 64) continue
      let a = Math.atan2(dy, dx)
      let diff = a - ang
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      if (Math.abs(diff) > 1.2) continue
      // undead (skeleton, wraith, vampire, boss) take double
      const undead = e.kind === 'skeleton' || e.kind === 'wraith' || e.kind === 'vampire' || e.kind === 'boss'
      const dmg = Math.round((50 + p.level * 4) * (undead ? 2 : 1))
      this.damageEnemy(e, dmg, dx, dy, true)
      hit = true
    }
    // holy beam visual
    this.spawnParticles(p.x + Math.cos(ang) * 30, p.y + Math.sin(ang) * 30, 20, '#fff3a0')
    this.spawnFloat(p.x, p.y - 28, 'GOLPE SAGRADO!', '#fff3a0')
    this.shake(5, 0.25)
    this.hitstop = 0.08
  }
  private castHolyAura() {
    const p = this.player
    if (p.holyAura > 0) { this.flashToast('Aura Sagrada ativa', 'info'); return }
    if (p.mana < 40) { this.flashToast('Mana insuficiente (40)', 'bad'); return }
    p.mana -= 40
    p.holyAura = 8 // 8 seconds of aura
    // push enemies back
    for (const e of this.enemies) {
      if (!e.alive) continue
      const dx = e.x - p.x, dy = e.y - p.y
      const dist = Math.hypot(dx, dy) || 1
      if (dist < 120) {
        e.knockX += (dx / dist) * 200
        e.knockY += (dy / dist) * 200
      }
    }
    this.spawnParticles(p.x, p.y, 30, '#fff3a0')
    this.spawnFloat(p.x, p.y - 28, 'AURA SAGRADA!', '#fff3a0')
    this.shake(3, 0.3)
  }
  private castFireball() {
    const p = this.player
    if (p.fireballCd > 0) { this.flashToast('Bola de Fogo recarregando', 'bad'); return }
    if (p.mana < 25) { this.flashToast('Mana insuficiente (25)', 'bad'); return }
    p.mana -= 25
    p.fireballCd = 1.5
    const ang = this.dirAngle(p.dir)
    const dmg = 45 + p.level * 3
    this.projectiles.push({
      id: this.nextId++,
      x: p.x + Math.cos(ang) * 18,
      y: p.y - 6 + Math.sin(ang) * 18,
      vx: Math.cos(ang) * 300,
      vy: Math.sin(ang) * 300,
      life: 1.4,
      damage: dmg,
      fromPlayer: true,
      kind: 'fireball',
    })
    this.spawnFloat(p.x, p.y - 28, 'BOLA DE FOGO!', '#e67e22')
  }
  private castFrostNova() {
    const p = this.player
    if (p.frostCd > 0) { this.flashToast('Nova de Gelo recarregando', 'bad'); return }
    if (p.mana < 40) { this.flashToast('Mana insuficiente (40)', 'bad'); return }
    p.mana -= 40
    p.frostCd = 6
    // AoE: damage + stagger all enemies in radius
    for (const e of this.enemies) {
      if (!e.alive) continue
      const dx = e.x - p.x, dy = e.y - p.y
      const dist = Math.hypot(dx, dy)
      if (dist > 140) continue
      this.damageEnemy(e, 30 + p.level * 2, dx, dy, false)
      // freeze: stagger them
      e.stagger = e.staggerMax
      e.state = 'hurt'
      e.stateTimer = 2
      this.spawnParticles(e.x, e.y, 8, '#74b9ff')
    }
    // ring visual
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2
      this.particles.push({
        x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10,
        vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
        life: 0.5, maxLife: 0.5, color: '#74b9ff', size: 3, gravity: 0,
      })
    }
    this.spawnFloat(p.x, p.y - 28, 'NOVA DE GELO!', '#74b9ff')
    this.shake(4, 0.3)
  }

  plantSeed() {
    const p = this.player
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE)
    const plot = this.farmPlots.find((f) => f.tileX === tx && f.tileY === ty)
    if (!plot) {
      this.flashToast('Arre a terra primeiro (E)', 'bad')
      return
    }
    if (plot.crop) {
      this.flashToast('Já plantado', 'info')
      return
    }
    plot.crop = 'crop'
    plot.stage = 0
    plot.growth = 0
    this.removeItem('seed_crop', 1)
    this.flashToast('Semente plantada', 'good')
  }

  harvestCrop(plot: FarmPlot) {
    this.addItem('berry', 2)
    if (Math.random() > 0.5) this.addItem('seed_crop', 1)
    this.spawnFloat(plot.tileX * TILE + 16, plot.tileY * TILE + 16, '+2 bagas', '#7cb342')
    // reset plot
    const tile = this.tiles[this.zone][plot.tileY]?.[plot.tileX]
    if (tile) {
      tile.type = 'soil'
      this.tileCacheDirty[this.zone] = true
    }
    plot.stage = 0
    plot.growth = 0
    plot.crop = ''
    plot.watered = false
  }

  gatherResource(r: ResourceNode) {
    const p = this.player
    // require correct tool for efficiency
    let dmg = 1
    if (r.type === 'tree') {
      if (this.inventory.some((s) => ITEMS[s.id]?.tool === 'axe')) dmg = 2
    } else if (r.type === 'rock' || r.type === 'iron' || r.type === 'coal') {
      if (this.inventory.some((s) => ITEMS[s.id]?.tool === 'pickaxe')) dmg = 2
    }
    r.hp -= dmg
    r.respawnAt = 0
    // yield partial
    if (r.type === 'tree') this.addItem('wood', 1)
    else if (r.type === 'rock') this.addItem('stone', 1)
    else if (r.type === 'iron') this.addItem('iron_ore', 1)
    else if (r.type === 'coal') this.addItem('coal', 1)
    else if (r.type === 'bush') this.addItem('berry', 1)
    else if (r.type === 'herb') this.addItem('herb', 1)
    const label = r.type === 'tree' ? 'madeira' : r.type === 'rock' ? 'pedra' : r.type === 'iron' ? 'ferro' : r.type === 'coal' ? 'carvão' : r.type === 'bush' ? 'baga' : r.type === 'herb' ? 'erva' : r.type
    this.spawnFloat(r.x, r.y - 16, `+1 ${label}`, '#c0a878')
    this.spawnParticles(r.x, r.y, 4, r.type === 'tree' ? '#6e4a30' : r.type === 'bush' ? '#7cb342' : '#9d9da5')
    if (r.hp <= 0) {
      r.alive = false
      // faster respawn: trees 20s, rocks 25s, bushes/herbs 15s
      const respawnTime = r.type === 'tree' ? 20 : r.type === 'rock' ? 25 : r.type === 'iron' ? 30 : r.type === 'coal' ? 30 : 15
      r.respawnAt = this.playtime + respawnTime
      // bonus drop
      if (r.type === 'tree') this.addItem('wood', 2)
      if (r.type === 'rock') this.addItem('stone', 2)
      this.spawnFloat(r.x, r.y - 28, 'Derrubado!', '#9d9da5')
      this.spawnParticles(r.x, r.y, 8, '#9d9da5')
      this.tileCacheDirty[this.zone] = true
    }
  }

  changeZone() {
    const portal = this.portals[this.zone].find((p) => {
      const ppx = this.player.x, ppy = this.player.y
      return ppx >= p.x - 8 && ppx <= p.x + p.w + 8 && ppy >= p.y - 16 && ppy <= p.y + p.h + 8
    })
    if (!portal) return
    const to = portal.to
    this.zone = to
    if (to === 'plains') {
      // return near the dungeon portal (procedural position)
      this.player.x = this.dungeonPortalPos.x * TILE + TILE / 2
      this.player.y = (this.dungeonPortalPos.y + 2) * TILE
    } else {
      // enter dungeon at its procedural entrance
      this.player.x = this.dungeonEntrancePos.x * TILE
      this.player.y = this.dungeonEntrancePos.y * TILE + 16
    }
    this.spawnEnemies()
    this.flashToast(to === 'plains' ? 'Planície Dourada' : 'Cripta do Silêncio', 'info')
  }

  // ---- combat -------------------------------------------------------------
  private weaponStats() {
    const def = ITEMS[this.equipped]
    if (def && def.category === 'weapon') return def
    // unarmed / tool equipped -> weak punch
    return {
      id: 'fist', name: 'Punho', category: 'weapon' as const, desc: '', sprite: 'wpn_sword',
      max: 1, damage: 5, attackSpeed: 2.4, reach: 30, arc: 1.3,
    }
  }

  // ---- combat: aim towards the mouse (like acclaimed action RPGs) ---------
  // Returns the world-space angle from the player to the mouse cursor.
  private mouseWorldAngle(): number {
    const mx = this.input.mouseX + this.camera.x
    const my = this.input.mouseY + this.camera.y
    return Math.atan2(my - this.player.y, mx - this.player.x)
  }

  // face the player towards the mouse (used for attack direction + sprite)
  private faceMouse(): void {
    const ang = this.mouseWorldAngle()
    this.player.dir = this.dirFromVec(Math.cos(ang), Math.sin(ang))
  }

  attack(type: 'light' | 'heavy') {
    const p = this.player
    if (this.screen !== 'game' || this.paused) return
    if (p.stagger > 0) return
    if (p.attackCd > 0 || p.attacking > 0 || p.dodgeTimer > 0) return
    const def = this.weaponStats()
    const cost = type === 'heavy' ? STAMINA_HEAVY : STAMINA_ATTACK
    if (p.stamina < cost) {
      this.flashToast('Stamina insuficiente', 'bad')
      return
    }
    p.stamina -= cost
    // AIM: attacks follow the mouse. If locked-on (Tab), prioritize the
    // locked target, otherwise aim at the cursor like a twin-stick / Diablo.
    if (p.lockTarget >= 0) {
      const tgt = this.enemies.find((e) => e.id === p.lockTarget && e.alive)
      if (tgt) p.dir = this.dirFromVec(tgt.x - p.x, tgt.y - p.y)
    } else {
      this.faceMouse()
    }
    p.attacking = type === 'heavy' ? 0.45 : 0.3
    p.attackType = type
    p.attackCd = 1 / (def.attackSpeed || 2)
    // combo system: chaining light attacks builds combo (up to 5), each hit
    // slightly increases damage. Combo resets if you stop attacking.
    if (type === 'light') {
      p.comboCount = Math.min(5, p.comboCount + 1)
      p.comboTimer = 1.4
    } else {
      // heavy resets combo but deals big damage
      p.comboCount = 0
    }
    // ranged weapons spawn projectile at the moment of swing — towards mouse
    if (this.equipped === 'bow' || this.equipped === 'staff') {
      // bow requires arrows (limited ammo)
      if (this.equipped === 'bow') {
        if (this.countItem('arrow') <= 0) {
          this.flashToast('Sem flechas! Fabrique na bancada', 'bad')
          // refund stamina so the player can immediately try a melee option
          p.stamina += cost
          p.attacking = 0
          p.attackType = null
          return
        }
        this.removeItem('arrow', 1)
      }
      const speed = this.equipped === 'bow' ? 460 : 380
      const ang = this.mouseWorldAngle()
      const comboMul = 1 + p.comboCount * 0.06
      const dmg = (def.damage || 10) * (type === 'heavy' ? 1.6 : 1) * comboMul
      this.projectiles.push({
        id: this.nextId++,
        x: p.x + Math.cos(ang) * 16,
        y: p.y - 6 + Math.sin(ang) * 16,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 1.0,
        damage: dmg,
        fromPlayer: true,
        kind: this.equipped === 'bow' ? 'arrow' : 'bolt',
      })
    }
  }

  // hold heavy to charge a stronger attack
  startCharge() {
    const p = this.player
    if (this.screen !== 'game' || this.paused) return
    if (p.chargeTime > 0) return // already charging — don't reset (key auto-repeat)
    if (p.attackCd > 0 || p.attacking > 0 || p.dodgeTimer > 0 || p.stagger > 0) return
    if (p.stamina < STAMINA_HEAVY) return
    p.chargeTime = 0.01
  }

  releaseCharge() {
    const p = this.player
    if (p.chargeTime <= 0) return
    const charged = p.chargeTime
    p.chargeTime = 0
    if (charged < 0.25) {
      // tap = normal heavy
      this.attack('heavy')
      return
    }
    // charged heavy: 1.5x..3x damage based on charge time (max ~1.2s)
    const p2 = this.player
    if (p2.stagger > 0 || p2.attackCd > 0 || p2.attacking > 0) return
    const def = this.weaponStats()
    const cost = STAMINA_HEAVY
    if (p2.stamina < cost) return
    p2.stamina -= cost
    p2.comboCount = 0
    p2.attacking = 0.55
    p2.attackType = 'heavy'
    p2.attackCd = 1 / ((def.attackSpeed || 2) * 0.7)
    // store charge bonus for the melee hit via a flag
    this._chargeBonus = Math.min(3, 1.5 + charged * 1.3)
    if (p2.lockTarget >= 0) {
      const tgt = this.enemies.find((e) => e.id === p2.lockTarget && e.alive)
      if (tgt) p2.dir = this.dirFromVec(tgt.x - p2.x, tgt.y - p2.y)
    }
    // screen shake on release
    this.shake(6, 0.3)
  }

  private _chargeBonus = 1

  // lock-on targeting: Tab cycles nearest alive enemies
  toggleLockOn() {
    const p = this.player
    if (this.screen !== 'game' || this.paused) return
    const alive = this.enemies.filter((e) => e.alive)
    if (alive.length === 0) { p.lockTarget = -1; return }
    if (p.lockTarget < 0) {
      // lock nearest
      let best = alive[0], bd = Infinity
      for (const e of alive) {
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d < bd) { bd = d; best = e }
      }
      p.lockTarget = best.id
    } else {
      // cycle to next
      const idx = alive.findIndex((e) => e.id === p.lockTarget)
      const next = alive[(idx + 1) % alive.length]
      p.lockTarget = next.id
    }
    const t = this.enemies.find((e) => e.id === p.lockTarget)
    if (t) {
      // immediately face the locked target so the player can attack without delay
      p.dir = this.dirFromVec(t.x - p.x, t.y - p.y)
      this.flashToast(`Mirando: ${ENEMIES[t.kind].name}`, 'info')
    }
  }

  private dirAngle(dir: Dir): number {
    switch (dir) {
      case 'right': return 0
      case 'dr': return Math.PI / 4
      case 'down': return Math.PI / 2
      case 'dl': return (3 * Math.PI) / 4
      case 'left': return Math.PI
      case 'ul': return (-3 * Math.PI) / 4
      case 'up': return -Math.PI / 2
      case 'ur': return -Math.PI / 4
    }
  }

  dodge() {
    const p = this.player
    if (this.screen !== 'game' || this.paused) return
    if (p.dodgeCd > 0 || p.dodgeTimer > 0) return
    let cost = STAMINA_DODGE
    if (this.cls === 'rogue') cost = Math.floor(cost * 0.6)
    if (p.stamina < cost) {
      this.flashToast('Stamina insuficiente', 'bad')
      return
    }
    p.stamina -= cost
    p.dodgeTimer = DODGE_TIME
    p.iframes = IFRAME_TIME
    p.dodgeCd = DODGE_CD
    // dust
    this.spawnParticles(p.x, p.y + 8, 6, '#d4c082')
  }

  private dealMeleeDamage() {
    const p = this.player
    const def = this.weaponStats()
    const ang = this.dirAngle(p.dir)
    const reach = def.reach || 38
    const arc = def.arc || 1.4
    const heavy = p.attackType === 'heavy'
    const comboMul = 1 + p.comboCount * 0.06
    const chargeMul = heavy ? this._chargeBonus : 1
    const baseDmg = (def.damage || 10) * (heavy ? 1.6 : 1) * comboMul * chargeMul
    // reset charge bonus after the hit lands
    if (heavy) this._chargeBonus = 1
    let hitAny = false
    for (const e of this.enemies) {
      if (!e.alive) continue
      const dx = e.x - p.x, dy = e.y - p.y
      const dist = Math.hypot(dx, dy)
      if (dist > reach + 10) continue
      let a = Math.atan2(dy, dx)
      let diff = a - ang
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      if (Math.abs(diff) > arc / 2) continue
      let dmg = baseDmg
      let crit = false
      // staggered enemies take crit (riposte window)
      if (e.stagger > 0) { dmg *= 1.6; crit = true }
      // backstab check (rogue behind enemy)
      if (this.cls === 'rogue' && Math.abs(diff) < 0.4) {
        dmg *= 1.5; crit = true
      } else if (Math.random() < 0.12) {
        dmg *= 1.5; crit = true
      }
      dmg = Math.round(dmg)
      this.damageEnemy(e, dmg, dx, dy, crit)
      hitAny = true
    }
    if (hitAny) {
      // hitstop: brief game freeze on connect for impact feel
      this.hitstop = Math.max(this.hitstop, heavy ? 0.09 : 0.05)
      this.shake(heavy ? 5 : 2.5, 0.15)
    }
  }

  damageEnemy(e: Enemy, dmg: number, kx: number, ky: number, crit: boolean) {
    e.hp -= dmg
    e.hitFlash = 0.15
    const k = crit ? 110 : 55
    const len = Math.hypot(kx, ky) || 1
    e.knockX += (kx / len) * k
    e.knockY += (ky / len) * k
    // poise damage -> stagger when threshold exceeded
    e.stagger += dmg
    if (e.stagger >= e.staggerMax && !e.isBoss) {
      e.stagger = e.staggerMax
      e.state = 'hurt'
      e.stateTimer = 0.8 // staggered for 0.8s, open to riposte
      this.spawnFloat(e.x, e.y - 30, 'ATORDOADO!', '#74b9ff')
      this.spawnParticles(e.x, e.y, 10, '#74b9ff')
    } else if (e.isBoss && e.stagger >= e.staggerMax) {
      // boss: brief stagger only, resets poise
      e.stagger = 0
      e.state = 'hurt'
      e.stateTimer = 0.6
      this.spawnFloat(e.x, e.y - 50, 'VULNERÁVEL!', '#f1c40f')
    }
    // aggro
    if (e.state === 'idle' || e.state === 'patrol') e.state = 'chase'
    this.spawnFloat(e.x, e.y - 16, `${dmg}${crit ? '!' : ''}`, crit ? '#f1c40f' : '#ffffff')
    this.spawnParticles(e.x, e.y, crit ? 8 : 4, '#e74c3c')
    if (e.hp <= 0) this.killEnemy(e)
  }

  killEnemy(e: Enemy) {
    e.alive = false
    e.state = 'dead'
    e.respawnAt = this.playtime + (e.isBoss ? 120 : 38)
    const def = ENEMIES[e.kind]
    // XP
    const p = this.player
    p.xp += def.xp
    p.kills += 1
    this.spawnFloat(e.x, e.y - 28, `+${def.xp} XP`, '#9b59b6')
    // level up
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext
      p.level += 1
      p.xpNext = xpForLevel(p.level)
      const st = statsForClass(this.cls, p.level)
      p.maxHp = st.maxHp
      p.maxStamina = st.maxStamina
      p.maxMana = st.maxMana
      p.hp = p.maxHp
      p.stamina = p.maxStamina
      p.mana = p.maxMana
      this.spawnFloat(p.x, p.y - 40, `NÍVEL ${p.level}!`, '#f1c40f')
      this.flashToast(`Subiu para o nível ${p.level}!`, 'good')
      this.spawnParticles(p.x, p.y, 20, '#f1c40f')
    }
    // gold
    const gold = def.gold[0] + Math.floor(Math.random() * (def.gold[1] - def.gold[0] + 1))
    p.gold += gold
    this.spawnFloat(e.x + 10, e.y - 20, `+${gold}🪙`, '#f1c40f')
    // loot drops
    for (const l of def.loot) {
      if (Math.random() < l.chance) {
        const q = l.min + Math.floor(Math.random() * (l.max - l.min + 1))
        this.dropItemWorld(e.x, e.y, l.id, q)
      }
    }
    this.spawnParticles(e.x, e.y, 14, def.color)
    this.killFeed.unshift({ id: this.nextId++, text: `${def.name} abatido`, life: 4 })
    if (this.killFeed.length > 5) this.killFeed.pop()
    if (e.kind === 'boss') {
      // dungeon boss = victory condition
      this.bossKilled = true
      this.bossRef = null
      this.flashToast('VOCÊ DERROTOU O CAVALEIRO SILENCIOSO!', 'good')
      this.message = 'VITÓRIA! O Silêncio se quebra. Você forjou seu destino em Eldoria.'
      this.screen = 'win'
      this.submitLeaderboard()
    } else if (e.kind === 'bear_boss') {
      // bear boss is a world boss — big reward but not victory
      this.flashToast('MAOU URSÃO TOMBA! Espólios lendários!', 'good')
      this.shake(8, 0.6)
      this.spawnParticles(e.x, e.y, 40, '#f1c40f')
    }
  }

  private dropItemWorld(x: number, y: number, id: string, qty: number) {
    this.drops.push({
      id: this.nextId++, x, y, vx: (Math.random() - 0.5) * 80, vy: -60,
      stack: { id, qty }, life: 90, bob: 0,
    })
  }

  damagePlayer(amount: number, sx: number, sy: number, _type?: string) {
    const p = this.player
    if (p.iframes > 0 || p.invuln > 0) return
    let dmg = amount
    let blocked = false
    let parried = false
    if (p.blocking && p.stamina > 0) {
      // PERFECT PARRY: block raised within the last 0.22s = parry.
      // Negates all damage, costs no stamina, staggers the attacker,
      // and opens a riposte window (enemy is stunned, crit-able).
      if (p.parryTimer > 0) {
        parried = true
        dmg = 0
        // find the attacking enemy and stagger it
        const atk = this.enemies.find((e) => e.alive && Math.hypot(e.x - sx, e.y - sy) < 40)
        if (atk) {
          atk.stagger = atk.staggerMax
          atk.state = 'hurt'
          atk.stateTimer = 1.2
          this.spawnFloat(atk.x, atk.y - 30, 'PARRY!', '#f1c40f')
          this.spawnParticles(atk.x, atk.y, 14, '#f1c40f')
          this.shake(4, 0.2)
          this.hitstop = Math.max(this.hitstop, 0.07)
          // parry spark
          this.spawnParticles(p.x, p.y - 6, 10, '#fff3a0')
        }
      } else {
        const reduce = this.cls === 'warrior' ? 0.7 : 0.5
        dmg = amount * (1 - reduce)
        p.stamina = Math.max(0, p.stamina - STAMINA_BLOCK_HIT)
        blocked = true
        if (p.stamina <= 0) {
          // guard break
          p.invuln = 0.6
          p.stagger = 0.5
          this.spawnFloat(p.x, p.y - 24, 'GUARDA QUEBRADA!', '#e74c3c')
        }
      }
    }
    if (parried) {
      // no damage taken, brief i-frames
      p.invuln = 0.2
      this.spawnFloat(p.x, p.y - 20, 'PARRY!', '#f1c40f')
      return
    }
    dmg = Math.round(dmg)
    p.hp -= dmg
    p.hitFlash = 0.2
    p.invuln = 0.4
    // stagger player if hit hard enough (reduces poise)
    p.poise -= dmg
    if (p.poise <= 0 && p.stagger <= 0) {
      p.stagger = 0.35
      p.poise = 60
      this.spawnFloat(p.x, p.y - 24, 'ATORDOADO!', '#e74c3c')
    }
    // knockback
    const dx = p.x - sx, dy = p.y - sy
    const len = Math.hypot(dx, dy) || 1
    p.vx += (dx / len) * (blocked ? 60 : 140)
    p.vy += (dy / len) * (blocked ? 60 : 140)
    this.spawnFloat(p.x, p.y - 20, blocked ? `Bloq ${dmg}` : `-${dmg}`, blocked ? '#3498db' : '#e74c3c')
    this.spawnParticles(p.x, p.y, 6, '#e74c3c')
    if (!blocked) this.shake(3, 0.18)
    if (p.hp <= 0) {
      p.hp = 0
      this.onPlayerDeath()
    }
  }

  onPlayerDeath() {
    const p = this.player
    p.deaths += 1
    // drop some gold as "blood echo"
    const lost = Math.floor(p.gold * 0.1)
    p.gold -= lost
    this.dropItemWorld(p.x, p.y, 'crown', lost)
    this.screen = 'dead'
    this.flashToast('Você caiu...', 'bad')
    this.submitLeaderboard()
  }

  respawn() {
    const p = this.player
    if (this.zone === 'dungeon') {
      this.zone = 'plains'
      this.spawnEnemies()
    }
    p.x = 32 * TILE + 16
    p.y = 34 * TILE
    p.hp = Math.floor(p.maxHp * 0.6)
    p.stamina = p.maxStamina
    p.mana = p.maxMana
    p.hunger = Math.max(0, p.hunger - 10)
    p.thirst = Math.max(0, p.thirst - 10)
    p.invuln = 2
    this.screen = 'game'
    this.flashToast('Renasceu na fogueira', 'info')
  }

  submitLeaderboard() {
    // best-effort; engine doesn't fetch but UI will POST
    // store a pending flag
    (this as unknown as { _pendingSubmit: boolean })._pendingSubmit = true
  }

  // ---- particles / floats -------------------------------------------------
  spawnFloat(x: number, y: number, text: string, color: string, size = 12) {
    this.floats.push({ id: this.nextId++, x, y, text, color, life: 1.1, vy: -28, size })
  }
  spawnParticles(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 40 + Math.random() * 90
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30,
        life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
        color, size: 1 + Math.random() * 2, gravity: 220,
      })
    }
  }
  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += p.gravity * dt
      p.life -= dt
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    for (const f of this.floats) {
      f.y += f.vy * dt
      f.life -= dt
    }
    this.floats = this.floats.filter((f) => f.life > 0)
    for (const k of this.killFeed) k.life -= dt
    this.killFeed = this.killFeed.filter((k) => k.life > 0)
  }

  // ---- update -------------------------------------------------------------
  private update(dt: number) {
    this.playtime += dt
    this.player.playtime = this.playtime
    this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1

    this.updatePlayer(dt)
    this.updateEnemies(dt)
    this.updateCompanions(dt)
    this.updateProjectiles(dt)
    this.updateDrops(dt)
    this.updateFarm(dt)
    this.updateResources(dt)
    this.updateProximity()
    this.updateParticles(dt)
    this.updateCamera(dt)
    this.updateShake(dt)
    this.updateMusicMood(dt)
    this.updateNightDay(dt)

    // toast expire
    if (this.toast) {
      this.toastTimer -= dt
      if (this.toastTimer <= 0) this.toast = null
    }

    // autosave every 25s
    this.autoSaveTimer += dt
    if (this.autoSaveTimer > 25) {
      this.autoSaveTimer = 0
      this.saveToServer()
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player
    // stagger: can't act while staggered
    if (p.stagger > 0) {
      p.stagger -= dt
      p.blocking = false
      p.chargeTime = 0
    }
    // input movement
    let ix = 0, iy = 0
    const k = this.input.keys
    if (k.has('a') || k.has('arrowleft')) ix -= 1
    if (k.has('d') || k.has('arrowright')) ix += 1
    if (k.has('w') || k.has('arrowup')) iy -= 1
    if (k.has('s') || k.has('arrowdown')) iy += 1
    const wasBlocking = p.blocking
    p.blocking = k.has('shift') && p.stamina > 0 && p.dodgeTimer <= 0 && p.stagger <= 0 && p.chargeTime <= 0
    // parry window: the first 0.22s after raising the shield counts as a perfect parry
    if (p.blocking && !wasBlocking) {
      p.parryTimer = 0.22
    }
    if (p.parryTimer > 0) p.parryTimer -= dt
    if (p.blocking) p.blockHeldTime += dt
    else p.blockHeldTime = 0
    // charging heavy attack (hold K/right mouse)
    const charging = (k.has('k') || this.input.rmb) && p.chargeTime > 0
    if (p.chargeTime > 0) {
      if (charging && p.chargeTime < 1.3) {
        p.chargeTime += dt
      } else if (!charging) {
        this.releaseCharge()
      }
    }
    const archerBoost = this.cls === 'archer' ? 1.15 : 1
    let speed = p.blocking ? PLAYER_SPEED * 0.4 : PLAYER_SPEED * archerBoost
    if (p.chargeTime > 0) speed *= 0.3 // slow while charging
    if (p.stagger > 0) speed *= 0.3 // slow while staggered
    // hunger/thirst slows
    if (p.hunger < 30) speed *= 0.8
    if (p.thirst < 20) speed *= 0.85

    // lock-on: auto-face the target and slow rotation
    if (p.lockTarget >= 0) {
      const tgt = this.enemies.find((e) => e.id === p.lockTarget && e.alive)
      if (!tgt) p.lockTarget = -1
      else {
        // face target when not actively moving (strafe feel)
        if (ix === 0 && iy === 0) p.dir = this.dirFromVec(tgt.x - p.x, tgt.y - p.y)
      }
    }

    if (p.dodgeTimer > 0) {
      p.dodgeTimer -= dt
      // roll in facing/last input dir
      const ang = this.dirAngle(p.dir)
      const ds = DODGE_SPEED * (p.dodgeTimer / DODGE_TIME + 0.4)
      p.vx = Math.cos(ang) * ds
      p.vy = Math.sin(ang) * ds
    } else if (p.stagger > 0) {
      // can't move while staggered
      p.vx *= 0.8
      p.vy *= 0.8
      p.moving = false
    } else {
      const moving = ix !== 0 || iy !== 0
      if (moving) {
        const len = Math.hypot(ix, iy) || 1
        p.vx = (ix / len) * speed
        p.vy = (iy / len) * speed
        p.dir = this.dirFromVec(ix, iy)
        p.moving = true
        p.animTime += dt
      } else {
        p.vx *= 0.7
        p.vy *= 0.7
        p.moving = false
      }
    }
    if (p.iframes > 0) p.iframes -= dt
    if (p.invuln > 0) p.invuln -= dt
    if (p.dodgeCd > 0) p.dodgeCd -= dt
    if (p.attackCd > 0) p.attackCd -= dt
    // combo timer decay
    if (p.comboTimer > 0) {
      p.comboTimer -= dt
      if (p.comboTimer <= 0) p.comboCount = 0
    }
    if (p.attacking > 0) {
      const was = p.attacking
      p.attacking -= dt
      // melee hit on the active midpoint (anything that isn't a ranged weapon)
      const isRanged = this.equipped === 'bow' || this.equipped === 'staff'
      if (!isRanged) {
        const mid = p.attackType === 'heavy' ? 0.27 : 0.18
        if (was > mid && p.attacking <= mid) this.dealMeleeDamage()
      }
      if (p.attacking <= 0) p.attackType = null
    }
    if (p.hitFlash > 0) p.hitFlash -= dt
    // poise slowly recovers
    if (p.poise < 60) p.poise = Math.min(60, p.poise + 15 * dt)
    // ability cooldowns tick down
    if (p.holyCd > 0) p.holyCd -= dt
    if (p.fireballCd > 0) p.fireballCd -= dt
    if (p.frostCd > 0) p.frostCd -= dt
    // paladin holy aura: regen HP + visual particles
    if (p.holyAura > 0) {
      p.holyAura -= dt
      if (p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 8 * dt)
      if (Math.random() < 0.3) this.spawnParticles(p.x, p.y - 4, 1, '#fff3a0')
    }

    // apply velocity with collision
    this.moveEntity(p, p.vx * dt, p.vy * dt, 7)
    // friction for knockback
    p.vx *= 0.86
    p.vy *= 0.86

    // survival decay
    p.hunger = Math.max(0, p.hunger - HUNGER_RATE * dt)
    p.thirst = Math.max(0, p.thirst - THIRST_RATE * dt)
    // stamina regen
    const regen = p.blocking ? STAMINA_REGEN_BLOCK : (p.attacking > 0 ? STAMINA_REGEN * 0.3 : STAMINA_REGEN)
    p.stamina = Math.min(p.maxStamina, p.stamina + regen * dt)
    // mana regen
    const mregen = MANA_REGEN * (this.cls === 'mage' ? 1.5 : 1) * (this.isNight() ? 0.7 : 1)
    p.mana = Math.min(p.maxMana, p.mana + mregen * dt)
    // hp regen if well fed
    if (p.hunger > 60 && p.thirst > 40 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + HP_REGEN_WELLFED * dt)
    }
    // starvation damage
    if (p.hunger <= 0) {
      p.hp -= 3 * dt
      if (p.hp <= 0) this.onPlayerDeath()
    }
    if (p.thirst <= 0) {
      p.hp -= 1.5 * dt
      if (p.hp <= 0) this.onPlayerDeath()
    }

    // bounds
    const mw = (this.zone === 'plains' ? MAP_W : DUNGEON_W) * TILE
    const mh = (this.zone === 'plains' ? MAP_H : DUNGEON_H) * TILE
    p.x = Math.max(8, Math.min(mw - 8, p.x))
    p.y = Math.max(8, Math.min(mh - 8, p.y))
  }

  private dirFromVec(x: number, y: number): Dir {
    if (x === 0 && y < 0) return 'up'
    if (x === 0 && y > 0) return 'down'
    if (x < 0 && y === 0) return 'left'
    if (x > 0 && y === 0) return 'right'
    if (x < 0 && y < 0) return 'ul'
    if (x > 0 && y < 0) return 'ur'
    if (x < 0 && y > 0) return 'dl'
    return 'dr'
  }

  private moveEntity(ent: { x: number; y: number; vx?: number; vy?: number }, dx: number, dy: number, rad: number) {
    // X axis
    let nx = ent.x + dx
    if (!this.solidAt(nx + Math.sign(dx) * rad, ent.y - 2, rad)) {
      // also check resource nodes
      if (!this.solidResourceAt(nx, ent.y, rad)) ent.x = nx
    }
    let ny = ent.y + dy
    if (!this.solidAt(ent.x, ny + Math.sign(dy) * rad - 2, rad)) {
      if (!this.solidResourceAt(ent.x, ny, rad)) ent.y = ny
    }
  }

  private solidAt(x: number, y: number, rad: number): boolean {
    const tiles = this.tiles[this.zone]
    if (!tiles) return false
    const minTx = Math.floor((x - rad) / TILE)
    const maxTx = Math.floor((x + rad) / TILE)
    const minTy = Math.floor((y - rad) / TILE)
    const maxTy = Math.floor((y + rad) / TILE)
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const t = tiles[ty]?.[tx]
        if (t && t.solid) return true
      }
    }
    return false
  }

  private solidResourceAt(x: number, y: number, rad: number): boolean {
    for (const r of this.resources[this.zone]) {
      if (!r.alive) continue
      if (r.type === 'bush' || r.type === 'herb' || r.type === 'water') continue
      const dx = r.x - x, dy = r.y - y + 4
      if (dx * dx + dy * dy < (rad + 10) * (rad + 10)) return true
    }
    return false
  }

  private updateEnemies(dt: number) {
    const p = this.player
    for (const e of this.enemies) {
      if (e.hitFlash > 0) e.hitFlash -= dt
      // respawn
      if (!e.alive) {
        if (e.isBoss && this.bossKilled) continue
        if (e.noRespawn) continue // guards stay dead permanently
        if (this.playtime >= e.respawnAt) {
          e.alive = true
          e.hp = e.maxHp
          e.x = e.spawnX
          e.y = e.spawnY
          e.state = 'idle'
          if (e.isBoss) this.bossRef = e
        } else continue
      }
      const def = ENEMIES[e.kind]
      const dx = p.x - e.x, dy = p.y - e.y
      const dist = Math.hypot(dx, dy)
      e.animTime += dt
      // cooldowns tick down
      if (e.attackCd > 0) e.attackCd -= dt
      if (e.rangedCd > 0) e.rangedCd -= dt
      if (e.lungeCd > 0) e.lungeCd -= dt

      // apply knockback
      e.x += e.knockX * dt
      e.y += e.knockY * dt
      e.knockX *= 0.82
      e.knockY *= 0.82

      // staggered: can't act, just recover
      if (e.state === 'hurt' || e.stagger >= e.staggerMax) {
        e.stateTimer -= dt
        e.vx *= 0.8
        e.vy *= 0.8
        if (e.stateTimer <= 0) {
          e.stagger = 0
          e.state = dist < def.sight ? 'chase' : 'patrol'
        }
        continue
      }

      switch (e.state) {
        case 'idle':
        case 'patrol': {
          if (dist < def.sight && this.hasLineOfSight(e, p)) {
            e.state = 'chase'
            e.stateTimer = 0
          } else {
            // wander
            e.stateTimer -= dt
            if (e.stateTimer <= 0) {
              e.stateTimer = 2 + Math.random() * 3
              e.vx = (Math.random() - 0.5) * def.speed * 0.4
              e.vy = (Math.random() - 0.5) * def.speed * 0.4
            }
            this.moveEntity(e, e.vx * dt, e.vy * dt, 6)
            // leash home
            const hdx = e.spawnX - e.x, hdy = e.spawnY - e.y
            if (hdx * hdx + hdy * hdy > e.leash * e.leash) {
              e.vx = Math.sign(hdx) * def.speed * 0.5
              e.vy = Math.sign(hdy) * def.speed * 0.5
            }
          }
          break
        }
        case 'chase': {
          // de-aggro if far
          const hdx = e.x - e.spawnX, hdy = e.y - e.spawnY
          if (!e.isBoss && hdx * hdx + hdy * hdy > e.leash * e.leash * 1.5 && dist > def.sight) {
            e.state = 'patrol'
            break
          }
          // WRAITH: keep distance and fire projectiles
          if (e.kind === 'wraith' && dist < 280 && dist > 120 && e.rangedCd <= 0) {
            e.state = 'windup'
            e.stateTimer = def.windup
            e.attackTargetX = p.x
            e.attackTargetY = p.y
            e.dir = this.dirFromVec(dx, dy)
            e.vx = 0; e.vy = 0
            break
          }
          // WOLF: lunge from medium range
          if (e.kind === 'wolf' && dist < 220 && dist > 60 && e.lungeCd <= 0) {
            e.state = 'windup'
            e.stateTimer = 0.35
            e.attackTargetX = p.x
            e.attackTargetY = p.y
            e.dir = this.dirFromVec(dx, dy)
            break
          }
          // BOSS: occasionally do a sweeping AoE when close-mid range
          if (e.isBoss && dist < 180 && e.attackCd <= 0 && Math.random() < 0.012) {
            e.state = 'windup'
            e.stateTimer = 0.8
            e.dir = this.dirFromVec(dx, dy)
            break
          }
          // DRAKE: fire breath cone from medium range
          if (e.kind === 'drake' && dist < 200 && dist > 50 && e.rangedCd <= 0) {
            e.state = 'windup'
            e.stateTimer = def.windup
            e.attackTargetX = p.x
            e.attackTargetY = p.y
            e.dir = this.dirFromVec(dx, dy)
            e.vx = 0; e.vy = 0
            break
          }
          // BEAR BOSS: big claw swipe when close
          if (e.kind === 'bear_boss' && dist < def.reach + 20 && e.attackCd <= 0) {
            e.state = 'windup'
            e.stateTimer = def.windup
            e.dir = this.dirFromVec(dx, dy)
            e.vx = 0; e.vy = 0
            break
          }
          if (dist <= def.reach + 6 && e.attackCd <= 0) {
            // melee attack
            e.state = 'windup'
            e.stateTimer = def.windup
            e.attackTargetX = p.x
            e.attackTargetY = p.y
            e.dir = this.dirFromVec(dx, dy)
            e.vx = 0
            e.vy = 0
          } else {
            const ang = Math.atan2(dy, dx)
            e.vx = Math.cos(ang) * def.speed
            e.vy = Math.sin(ang) * def.speed
            e.dir = this.dirFromVec(dx, dy)
            this.moveEntity(e, e.vx * dt, e.vy * dt, 6)
          }
          break
        }
        case 'windup': {
          e.stateTimer -= dt
          // face player slowly
          e.dir = this.dirFromVec(dx, dy)
          if (e.stateTimer <= 0) {
            e.state = 'attack'
            e.stateTimer = def.active
            const ang = Math.atan2(dy, dx)
            if (e.kind === 'wraith') {
              // fire 3 projectiles in a spread
              e.vx = 0; e.vy = 0
              for (let i = -1; i <= 1; i++) {
                const a = ang + i * 0.25
                this.projectiles.push({
                  id: this.nextId++, x: e.x, y: e.y - 6,
                  vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
                  life: 2.5, damage: def.damage, fromPlayer: false, kind: 'frost',
                })
              }
              e.rangedCd = 3.5
              e.state = 'recover'
              e.stateTimer = def.recovery
            } else if (e.kind === 'wolf') {
              // big lunge
              e.vx = Math.cos(ang) * 340
              e.vy = Math.sin(ang) * 340
              e.lungeCd = 3
            } else if (e.kind === 'drake') {
              // fire breath: spawn a spread of fire projectiles (cone)
              e.vx = 0; e.vy = 0
              for (let i = -2; i <= 2; i++) {
                const a = ang + i * 0.18
                this.projectiles.push({
                  id: this.nextId++, x: e.x + Math.cos(a) * 16, y: e.y - 6 + Math.sin(a) * 16,
                  vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
                  life: 1.2, damage: def.damage, fromPlayer: false, kind: 'fire',
                })
              }
              this.spawnParticles(e.x + Math.cos(ang) * 20, e.y + Math.sin(ang) * 20, 12, '#e67e22')
              e.rangedCd = 4
              e.state = 'recover'
              e.stateTimer = def.recovery
            } else if (e.isBoss) {
              // boss AoE slam — big lunge + shockwave
              e.vx = Math.cos(ang) * 220
              e.vy = Math.sin(ang) * 220
              this.shake(5, 0.3)
              this.spawnParticles(e.x, e.y, 16, '#e74c3c')
            } else {
              e.vx = Math.cos(ang) * (e.isBoss ? 180 : 120)
              e.vy = Math.sin(ang) * (e.isBoss ? 180 : 120)
            }
          }
          break
        }
        case 'attack': {
          e.stateTimer -= dt
          // active hit detection
          const adx = p.x - e.x, ady = p.y - e.y
          const reach = def.reach + (e.isBoss ? 24 : 12)
          if (Math.hypot(adx, ady) < reach) {
            const dmgMul = e.isBoss ? 1.15 : 1
            const hpBefore = p.hp
            this.damagePlayer(def.damage * dmgMul, e.x, e.y)
            // VAMPIRE lifesteal: heals for a portion of damage dealt
            if (e.kind === 'vampire' && p.hp < hpBefore) {
              const heal = Math.round((hpBefore - p.hp) * 0.6)
              e.hp = Math.min(e.maxHp, e.hp + heal)
              this.spawnFloat(e.x, e.y - 22, `+${heal}`, '#e74c3c')
              this.spawnParticles(e.x, e.y - 4, 4, '#8e1b1b')
            }
            // BEAR BOSS: heavy knockback + screen shake
            if (e.kind === 'bear_boss') {
              this.shake(7, 0.35)
              this.spawnParticles(p.x, p.y, 12, '#7e5109')
            }
          }
          this.moveEntity(e, e.vx * dt, e.vy * dt, 6)
          e.vx *= 0.9
          e.vy *= 0.9
          if (e.stateTimer <= 0) {
            e.state = 'recover'
            e.stateTimer = def.recovery
            e.attackCd = e.isBoss ? 1.5 : 0.8
          }
          break
        }
        case 'recover': {
          e.stateTimer -= dt
          e.vx *= 0.8
          e.vy *= 0.8
          if (e.stateTimer <= 0) {
            e.state = dist < def.sight ? 'chase' : 'patrol'
          }
          break
        }
        case 'hurt':
          e.stateTimer -= dt
          if (e.stateTimer <= 0) e.state = 'chase'
          break
      }
    }
  }

  private hasLineOfSight(_a: { x: number; y: number }, _b: { x: number; y: number }): boolean {
    // simple: always true in plains; in dungeon, check wall tiles along the line
    if (this.zone === 'plains') return true
    return true // keep it forgiving
  }

  private updateProjectiles(dt: number) {
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt
      pr.y += pr.vy * dt
      pr.life -= dt
      // tile collision
      if (this.solidAt(pr.x, pr.y, 2)) {
        pr.life = 0
        this.spawnParticles(pr.x, pr.y, 4, '#9d9da5')
        continue
      }
      if (pr.fromPlayer) {
        for (const e of this.enemies) {
          if (!e.alive) continue
          const dx = e.x - pr.x, dy = e.y - pr.y
          if (dx * dx + dy * dy < 14 * 14) {
            this.damageEnemy(e, Math.round(pr.damage), pr.vx, pr.vy, false)
            pr.life = 0
            break
          }
        }
      } else {
        const p = this.player
        const dx = p.x - pr.x, dy = p.y - pr.y
        if (dx * dx + dy * dy < 12 * 12) {
          this.damagePlayer(pr.damage, pr.x, pr.y)
          pr.life = 0
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0)
  }

  private updateDrops(dt: number) {
    const p = this.player
    for (const d of this.drops) {
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.vy += 180 * dt
      d.vx *= 0.9
      if (d.vy > 0 && this.solidAt(d.x, d.y + 4, 2)) d.vy = -d.vy * 0.3
      d.bob = Math.sin(this.playtime * 4 + d.id) * 2
      d.life -= dt
      // magnet pickup
      const dx = p.x - d.x, dy = p.y - d.y
      const dist = Math.hypot(dx, dy)
      if (dist < 60) {
        d.x += (dx / dist) * 120 * dt
        d.y += (dy / dist) * 120 * dt
      }
      if (dist < 16) {
        this.addItem(d.stack.id, d.stack.qty)
        const def = ITEMS[d.stack.id]
        this.spawnFloat(p.x, p.y - 20, `+${d.stack.qty} ${def?.name ?? d.stack.id}`, '#7cb342')
        d.life = 0
      }
    }
    this.drops = this.drops.filter((d) => d.life > 0)
  }

  private updateFarm(dt: number) {
    for (const plot of this.farmPlots) {
      if (!plot.crop) continue
      if (plot.stage >= 3) continue
      // watered plants grow 3x faster; 8s per stage when watered, 24s when dry
      const rate = plot.watered ? 0.125 : 0.042
      plot.growth += rate * dt
      if (plot.growth >= 1) {
        plot.stage += 1
        plot.growth = 0
        // visual feedback when a stage advances
        this.spawnFloat(plot.tileX * TILE + 16, plot.tileY * TILE + 10, '↑', '#7cb342')
        this.spawnParticles(plot.tileX * TILE + 16, plot.tileY * TILE + 16, 3, '#7cb342')
        if (plot.stage >= 3) {
          this.spawnFloat(plot.tileX * TILE + 16, plot.tileY * TILE - 6, 'Pronto para colher!', '#7cb342')
          this.spawnParticles(plot.tileX * TILE + 16, plot.tileY * TILE + 16, 8, '#f1c40f')
        }
      }
    }
  }

  private updateResources(_dt: number) {
    for (const r of this.resources[this.zone]) {
      if (!r.alive && this.playtime >= r.respawnAt) {
        r.alive = true
        r.hp = r.maxHp
      }
    }
  }

  private updateProximity() {
    const p = this.player
    // station
    this.nearStation = null
    for (const s of this.stations) {
      if (Math.hypot(s.x - p.x, s.y - p.y) < 48) {
        this.nearStation = s.type
        break
      }
    }
    // portal
    this.nearPortal = null
    for (const pt of this.portals[this.zone]) {
      if (p.x >= pt.x - 8 && p.x <= pt.x + pt.w + 8 && p.y >= pt.y - 16 && p.y <= pt.y + pt.h + 8) {
        this.nearPortal = pt.label
        break
      }
    }
    // interact hint
    this.nearInteract = null
    if (this.nearPortal) this.nearInteract = `Entrar: ${this.nearPortal}`
    else {
      // special structures (chapel/tower)
      this.nearStructure = null
      for (const s of this.structures) {
        if (Math.hypot(s.x - p.x, s.y - p.y) < 50) {
          this.nearStructure = s.type
          if (s.type === 'chapel') {
            this.nearInteract = p.ascension === 'none' && !s.used ? 'Ajoelhar na Capela (E) — Paladino' : 'Capela (E)'
          } else {
            if (!this.isNight()) this.nearInteract = 'Torre adormecida — volte à noite'
            else this.nearInteract = p.ascension === 'none' && !s.used ? 'Entrar na Torre (E) — Mago' : 'Torre (E)'
          }
          break
        }
      }
      if (!this.nearInteract) {
        for (const r of this.resources[this.zone]) {
          if (!r.alive) continue
          if (Math.hypot(r.x - p.x, r.y - p.y) < 36) {
            this.nearInteract = `Coletar (${r.type})`
            break
          }
        }
        if (!this.nearInteract) {
          const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE)
          const plot = this.farmPlots.find((f) => f.tileX === tx && f.tileY === ty)
          if (plot) this.nearInteract = plot.stage >= 3 ? 'Colher (E)' : 'Interagir (E)'
        }
      }
    }
  }

  // ---- companions: elf heals periodically, dog attacks locked enemy --------
  private updateCompanions(dt: number) {
    const p = this.player
    for (const c of this.companions) {
      if (!c.rescued) continue
      c.animTime += dt
      // follow the player, staying slightly behind
      const dx = p.x - c.x, dy = p.y - c.y
      const dist = Math.hypot(dx, dy)
      if (dist > 40) {
        const sp = c.kind === 'dog' ? 200 : 150
        c.vx = (dx / dist) * sp
        c.vy = (dy / dist) * sp
        c.dir = this.dirFromVec(dx, dy)
        this.moveEntity(c, c.vx * dt, c.vy * dt, 6)
      } else {
        c.vx *= 0.8; c.vy *= 0.8
      }
      if (c.cd > 0) c.cd -= dt

      if (c.kind === 'elf') {
        // heal the player when HP is below 60% and cooldown is ready
        if (c.cd <= 0 && p.hp < p.maxHp * 0.6 && p.hp > 0) {
          const heal = Math.round(p.maxHp * 0.15)
          p.hp = Math.min(p.maxHp, p.hp + heal)
          this.spawnFloat(p.x, p.y - 24, `+${heal} HP (elfa)`, '#2ecc71')
          this.spawnParticles(p.x, p.y, 12, '#2ecc71')
          c.cd = 12 // heal every 12s max
        }
      } else if (c.kind === 'dog') {
        // attack the player's locked target (Tab)
        const tgtId = p.lockTarget
        const tgt = tgtId >= 0 ? this.enemies.find((e) => e.id === tgtId && e.alive) : null
        if (tgt) {
          c.target = tgtId
          // move towards the target
          const tdx = tgt.x - c.x, tdy = tgt.y - c.y
          const tdist = Math.hypot(tdx, tdy)
          if (tdist > 20) {
            c.vx = (tdx / tdist) * 220
            c.vy = (tdy / tdist) * 220
            c.dir = this.dirFromVec(tdx, tdy)
            this.moveEntity(c, c.vx * dt, c.vy * dt, 6)
          }
          // bite: deal limited damage + hold (slow enemy) on cooldown
          if (c.cd <= 0 && tdist < 28) {
            const dmg = 8 + p.level
            this.damageEnemy(tgt, dmg, c.x - tgt.x, c.y - tgt.y, false)
            // "hold": stagger the enemy briefly so it focuses the dog
            tgt.stagger = Math.max(tgt.stagger, tgt.staggerMax * 0.5)
            tgt.state = 'hurt'
            tgt.stateTimer = Math.max(tgt.stateTimer, 0.4)
            this.spawnFloat(tgt.x, tgt.y - 16, `🐺 ${dmg}`, '#e67e22')
            this.spawnParticles(tgt.x, tgt.y, 4, '#e67e22')
            c.cd = 1.2
          }
        } else {
          c.target = -1
        }
      }
    }
  }

  // ---- night/day cycle: spawn extra creatures at night, despawn at dawn ---
  private nightSpawnAccum = 0
  private wasNight = false
  private updateNightDay(dt: number) {
    const night = this.isNight()
    if (this.zone !== 'plains') return
    // at dawn (transition night→day): nocturnal creatures vanish
    if (this.wasNight && !night) {
      this.wasNight = false
      for (const e of this.enemies) {
        if (e.alive && ENEMIES[e.kind]?.nocturnal && !e.isBoss) {
          e.alive = false
          e.respawnAt = 0
          this.spawnParticles(e.x, e.y, 8, '#6c5ce7')
          this.spawnFloat(e.x, e.y - 16, 'sumiu...', '#6c5ce7')
        }
      }
      this.flashToast('🌅 Amanhecer — as criaturas da noite recuaram.', 'info')
      return
    }
    if (!this.wasNight && night) {
      this.wasNight = true
      this.flashToast('🌙 A noite cai — criaturas sombrias surgem!', 'bad')
    }
    // during night: spawn extra nocturnal enemies periodically
    if (night) {
      this.nightSpawnAccum += dt
      if (this.nightSpawnAccum > 8) {
        this.nightSpawnAccum = 0
        // count existing nocturnal enemies
        const noctCount = this.enemies.filter((e) => e.alive && ENEMIES[e.kind]?.nocturnal).length
        if (noctCount < 8) {
          // spawn 2-3 nocturnal creatures near the player (but not too close)
          const kinds: EnemyKind[] = ['wraith', 'vampire', 'vampire', 'wraith']
          const count = 2 + Math.floor(Math.random() * 2)
          for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2
            const d = 200 + Math.random() * 200
            const ex = this.player.x + Math.cos(a) * d
            const ey = this.player.y + Math.sin(a) * d
            const tx = Math.floor(ex / TILE), ty = Math.floor(ey / TILE)
            const t = this.tiles.plains[ty]?.[tx]
            if (t && !t.solid && t.type !== 'water' && !this.inSpawnClearing(tx, ty)) {
              const k = kinds[Math.floor(Math.random() * kinds.length)]
              const e = this.makeEnemy(this.nextId++, k, ex, ey)
              e.leash = 600 // nocturnal enemies roam wider
              this.enemies.push(e)
              this.spawnParticles(ex, ey, 6, '#6c5ce7')
            }
          }
        }
      }
    }
  }

  private updateMusicMood(dt: number) {
    // determine mood: dungeon always tense; combat if a nearby enemy is
    // chasing/attacking; otherwise calm.
    let mood: 'calm' | 'combat' | 'dungeon' = this.zone === 'dungeon' ? 'dungeon' : 'calm'
    if (this.bossRef && this.bossRef.alive) mood = 'combat'
    else {
      const p = this.player
      let near = false
      for (const e of this.enemies) {
        if (!e.alive) continue
        if (e.state === 'chase' || e.state === 'windup' || e.state === 'attack') {
          if (Math.hypot(e.x - p.x, e.y - p.y) < 320) { near = true; break }
        }
      }
      if (near) {
        this.combatMusicTimer = 4 // stay combat for 4s after last aggro
        mood = 'combat'
      } else if (this.combatMusicTimer > 0) {
        this.combatMusicTimer -= dt
        mood = 'combat'
      }
    }
    if (mood !== this.musicMood) {
      this.musicMood = mood
      getMusic().setMood(mood)
    }
  }

  private updateCamera(dt: number) {
    const p = this.player
    const tx = p.x - this.vw / 2
    const ty = p.y - this.vh / 2
    this.camera.x += (tx - this.camera.x) * Math.min(1, dt * 8)
    this.camera.y += (ty - this.camera.y) * Math.min(1, dt * 8)
    const mw = (this.zone === 'plains' ? MAP_W : DUNGEON_W) * TILE
    const mh = (this.zone === 'plains' ? MAP_H : DUNGEON_H) * TILE
    this.camera.x = Math.max(0, Math.min(mw - this.vw, this.camera.x))
    this.camera.y = Math.max(0, Math.min(mh - this.vh, this.camera.y))
    if (mw < this.vw) this.camera.x = (mw - this.vw) / 2
    if (mh < this.vh) this.camera.y = (mh - this.vh) / 2
  }

  isNight(): boolean {
    return this.timeOfDay > 0.75 || this.timeOfDay < 0.2
  }

  // ---- flash toast --------------------------------------------------------
  private toastTimer = 0
  flashToast(text: string, kind: 'info' | 'good' | 'bad') {
    this.toast = { id: this.nextId++, text, kind }
    this.toastTimer = 2.6
  }

  private saveToServer() {
    if (this.screen !== 'game' && this.screen !== 'dead' && this.screen !== 'win') return
    const data = this.exportSave()
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('eldoria:save', JSON.stringify(data))
      }
    } catch { /* ignore quota errors */ }
  }

  // ---- render -------------------------------------------------------------
  private render() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.vw, this.vh)
    if (this.screen === 'title' || this.screen === 'class') {
      this.renderBackdrop()
      return
    }
    // screen shake offset
    let shx = 0, shy = 0
    if (this.shakeTime > 0) {
      const m = this.shakeAmt * (this.shakeTime > 0 ? 1 : 0)
      shx = (Math.random() - 0.5) * m
      shy = (Math.random() - 0.5) * m
    }
    // game world
    ctx.save()
    ctx.translate(-Math.round(this.camera.x) + shx, -Math.round(this.camera.y) + shy)
    this.renderTiles()
    this.renderResourcesBelow()
    this.renderFarm()
    this.renderStations()
    this.renderStructures()
    this.renderPortals()
    this.renderDrops()
    // entities sorted by y
    const ents: { y: number; draw: () => void }[] = []
    for (const e of this.enemies) {
      if (!e.alive) continue
      const def = ENEMIES[e.kind]
      ents.push({
        y: e.y, draw: () => {
          // telegraph indicator
          if (e.state === 'windup') {
            ctx.fillStyle = 'rgba(231,76,60,0.35)'
            ctx.beginPath()
            ctx.arc(e.x, e.y, def.reach + 8, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = '#e74c3c'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(e.x, e.y, def.reach + 8, 0, Math.PI * 2)
            ctx.stroke()
          }
          drawEnemy(ctx, e.kind, e.x, e.y, e.state, e.stateTimer, e.dir, e.animTime, e.hitFlash, def.scale, def.color)
          // staggered indicator (riposte window)
          if (e.stagger >= e.staggerMax || e.state === 'hurt') {
            ctx.strokeStyle = '#74b9ff'
            ctx.lineWidth = 2
            ctx.setLineDash([3, 3])
            ctx.beginPath()
            ctx.arc(e.x, e.y - 6, 18, 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash([])
          }
          // lock-on marker
          if (this.player.lockTarget === e.id) {
            ctx.strokeStyle = '#f1c40f'
            ctx.lineWidth = 2
            const r = 16 + Math.sin(this.playtime * 8) * 2
            ctx.beginPath()
            ctx.arc(e.x, e.y - 4, r, 0, Math.PI * 2)
            ctx.stroke()
            // corner brackets
            ctx.beginPath()
            ctx.moveTo(e.x - r, e.y - 4 - r + 4); ctx.lineTo(e.x - r, e.y - 4 - r); ctx.lineTo(e.x - r + 4, e.y - 4 - r)
            ctx.moveTo(e.x + r, e.y - 4 - r + 4); ctx.lineTo(e.x + r, e.y - 4 - r); ctx.lineTo(e.x + r - 4, e.y - 4 - r)
            ctx.moveTo(e.x - r, e.y - 4 + r - 4); ctx.lineTo(e.x - r, e.y - 4 + r); ctx.lineTo(e.x - r + 4, e.y - 4 + r)
            ctx.moveTo(e.x + r, e.y - 4 + r - 4); ctx.lineTo(e.x + r, e.y - 4 + r); ctx.lineTo(e.x + r - 4, e.y - 4 + r)
            ctx.stroke()
          }
          // hp bar
          if (e.hp < e.maxHp && !e.isBoss) {
            const w = 24
            ctx.fillStyle = 'rgba(0,0,0,0.6)'
            ctx.fillRect(e.x - w / 2, e.y - 22, w, 3)
            ctx.fillStyle = '#e74c3c'
            ctx.fillRect(e.x - w / 2, e.y - 22, w * (e.hp / e.maxHp), 3)
          }
        },
      })
    }
    ents.push({
      y: this.player.y, draw: () => {
        drawPlayer(ctx, this.player.x, this.player.y, this.cls, this.player.dir, this.player.moving,
          this.player.animTime, this.player.attacking, this.player.attackType, this.player.dodgeTimer,
          this.player.blocking, this.player.hitFlash, ITEMS[this.equipped]?.sprite || 'wpn_sword')
        // parry-ready glow on shield
        if (this.player.parryTimer > 0) {
          ctx.fillStyle = 'rgba(241,196,15,0.35)'
          ctx.beginPath()
          ctx.arc(this.player.x, this.player.y - 2, 14, 0, Math.PI * 2)
          ctx.fill()
        }
        // charge effect (growing aura + sparks)
        if (this.player.chargeTime > 0) {
          const t = this.player.chargeTime
          const r = 8 + Math.min(20, t * 16)
          ctx.fillStyle = `rgba(241,196,15,${0.2 + Math.min(0.4, t * 0.3)})`
          ctx.beginPath()
          ctx.arc(this.player.x, this.player.y - 2, r, 0, Math.PI * 2)
          ctx.fill()
          // charge sparks
          if (Math.random() < 0.5) {
            this.spawnParticles(this.player.x, this.player.y - 4, 1, '#fff3a0')
          }
        }
        // staggered tint
        if (this.player.stagger > 0) {
          ctx.fillStyle = 'rgba(231,76,60,0.3)'
          ctx.beginPath()
          ctx.arc(this.player.x, this.player.y - 2, 12, 0, Math.PI * 2)
          ctx.fill()
        }
        // iframe shimmer
        if (this.player.iframes > 0 || this.player.dodgeTimer > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)'
          ctx.beginPath()
          ctx.arc(this.player.x, this.player.y - 2, 12, 0, Math.PI * 2)
          ctx.fill()
        }
      },
    })
    // companions (elf & dog) — drawn as entities so they sort by Y
    for (const c of this.companions) {
      if (!c.rescued) continue
      ents.push({
        y: c.y, draw: () => this.drawCompanion(ctx, c),
      })
    }
    // rescue encounters (caged prisoners) drawn on the ground
    for (const enc of this.rescueEncounters) {
      if (enc.guardKilled) continue
      ents.push({
        y: enc.y, draw: () => this.drawRescueEncounter(ctx, enc),
      })
    }
    ents.sort((a, b) => a.y - b.y)
    for (const e of ents) e.draw()
    // projectiles
    for (const pr of this.projectiles) {
      drawProjectile(ctx, pr.kind, pr.x, pr.y, Math.atan2(pr.vy, pr.vx))
    }
    // particles
    for (const pt of this.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife)
      ctx.fillStyle = pt.color
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size)
    }
    ctx.globalAlpha = 1
    // float texts
    for (const f of this.floats) {
      ctx.globalAlpha = Math.min(1, f.life)
      ctx.font = `bold ${f.size}px monospace`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#000'
      ctx.fillText(f.text, f.x + 1, f.y + 1)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, f.x, f.y)
    }
    ctx.globalAlpha = 1
    ctx.restore()

    // day/night overlay
    this.renderDayNight()
    // interact hint
    if (this.nearInteract) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'
      ctx.fillRect(this.vw / 2 - 90, this.vh - 90, 180, 26)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 13px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(this.nearInteract, this.vw / 2, this.vh - 72)
    }
  }

  private renderBackdrop() {
    const ctx = this.ctx
    // dark gradient backdrop for menus
    const g = ctx.createLinearGradient(0, 0, 0, this.vh)
    g.addColorStop(0, '#1a1326')
    g.addColorStop(1, '#0d0a14')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, this.vw, this.vh)
  }

  private renderTiles() {
    const ctx = this.ctx
    const tiles = this.tiles[this.zone]
    const mw = tiles[0].length * TILE
    const mh = tiles.length * TILE

    // Build / rebuild the off-screen tile cache for this zone if needed.
    // This turns ~1000 tiles × ~6 fillRects/frame (6000+ ops, ~156ms) into
    // a single drawImage blit (~1ms). The cache is invalidated whenever a
    // tile type changes at runtime (tilling soil, watering, harvesting).
    let cache = this.tileCache[this.zone]
    if (!cache || this.tileCacheDirty[this.zone]) {
      if (!cache) {
        cache = document.createElement('canvas')
        cache.width = mw
        cache.height = mh
        this.tileCache[this.zone] = cache
      }
      const cctx = cache.getContext('2d')!
      cctx.imageSmoothingEnabled = false
      cctx.clearRect(0, 0, mw, mh)
      for (let y = 0; y < tiles.length; y++) {
        for (let x = 0; x < tiles[0].length; x++) {
          const t = tiles[y][x]
          drawTile(cctx, t.type, x * TILE, y * TILE, t.v)
        }
      }
      this.tileCacheDirty[this.zone] = false
    }

    // Blit just the visible viewport from the cache (one drawImage call).
    const sx = Math.max(0, Math.round(this.camera.x))
    const sy = Math.max(0, Math.round(this.camera.y))
    const sw = Math.min(mw - sx, Math.round(this.vw))
    const sh = Math.min(mh - sy, Math.round(this.vh))
    if (sw > 0 && sh > 0) {
      ctx.drawImage(cache, sx, sy, sw, sh, sx, sy, sw, sh)
    }
  }

  private renderResourcesBelow() {
    const ctx = this.ctx
    for (const r of this.resources[this.zone]) {
      if (!r.alive) continue
      if (r.x < this.camera.x - 40 || r.x > this.camera.x + this.vw + 40) continue
      if (r.y < this.camera.y - 40 || r.y > this.camera.y + this.vh + 40) continue
      drawResourceNode(ctx, r.type, r.x - 16, r.y - 16, r.v, r.hp < r.maxHp ? 0.1 : 0)
    }
  }

  private renderFarm() {
    const ctx = this.ctx
    for (const plot of this.farmPlots) {
      if (plot.crop && plot.stage >= 0) {
        drawCrop(ctx, plot.tileX * TILE, plot.tileY * TILE, plot.stage, plot.watered)
      }
    }
  }

  private renderStations() {
    for (const s of this.stations) {
      drawStation(this.ctx, s.type, s.x, s.y, this.playtime)
    }
  }

  private renderStructures() {
    const ctx = this.ctx
    for (const s of this.structures) {
      // tower only visible/interactable at night; during day show faint silhouette
      if (s.type === 'tower' && !this.isNight()) {
        ctx.globalAlpha = 0.25
      }
      drawSpecialStructure(ctx, s.type, s.x, s.y, this.playtime, s.used)
      ctx.globalAlpha = 1
      // label
      ctx.fillStyle = s.type === 'chapel' ? '#f1c40f' : '#9b59b6'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      const label = s.type === 'chapel' ? 'Capela' : 'Torre Arcana'
      ctx.fillText(label, s.x, s.y - (s.type === 'chapel' ? 34 : 50))
      // "kneel/enter" prompt beacon when near & unused
      if (Math.hypot(s.x - this.player.x, s.y - this.player.y) < 50 && !s.used && this.player.ascension === 'none') {
        const canUse = s.type === 'chapel' || this.isNight()
        if (canUse) {
          ctx.fillStyle = `rgba(241,196,15,${0.5 + Math.sin(this.playtime * 6) * 0.3})`
          ctx.font = 'bold 11px monospace'
          ctx.fillText(s.type === 'chapel' ? '↓ Ajoelhar (E) ↓' : '↓ Entrar (E) ↓', s.x, s.y - (s.type === 'chapel' ? 46 : 62))
        }
      }
    }
  }

  private renderPortals() {
    for (const p of this.portals[this.zone]) {
      drawPortal(this.ctx, p.x, p.y, p.w, p.h, this.playtime, p.label)
      // label
      this.ctx.fillStyle = '#fff'
      this.ctx.font = 'bold 11px monospace'
      this.ctx.textAlign = 'center'
      this.ctx.fillText(p.label, p.x + p.w / 2, p.y - p.h - 6)
    }
  }

  // draw a companion (elf or dog) following the player
  private drawCompanion(ctx: CanvasRenderingContext2D, c: Companion) {
    const P = (x: number, y: number, w: number, h: number, col: string) => {
      ctx.fillStyle = col
      ctx.fillRect(Math.round(c.x + x), Math.round(c.y + y), w, h)
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.beginPath()
    ctx.ellipse(c.x, c.y + 12, 8, 3, 0, 0, Math.PI * 2)
    ctx.fill()
    if (c.kind === 'elf') {
      // elf: green robe, pale skin, pointed ears
      const bob = Math.sin(c.animTime * 6) * 1
      const cy = c.y - bob
      // legs
      P(-3, 6, 6, 6, '#27ae60')
      // robe
      P(-5, -4, 10, 12, '#2ecc71')
      P(-5, -4, 10, 2, '#58d68d')
      // head
      P(-4, -14, 8, 8, '#fadbd8')
      // ears (pointed)
      P(-5, -13, 1, 3, '#fadbd8')
      P(4, -13, 1, 3, '#fadbd8')
      // hair
      P(-5, -15, 10, 3, '#196f3d')
      // eyes
      P(-3, -10, 1, 1, '#1a1a1a')
      P(2, -10, 1, 1, '#1a1a1a')
      // healing glow when cd is low (ready to heal)
      if (c.cd < 2) {
        ctx.fillStyle = `rgba(46,204,113,${0.2 + Math.sin(this.playtime * 6) * 0.1})`
        ctx.beginPath()
        ctx.arc(c.x, c.y - 4, 14, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      // dog: brown, four-legged, tail wagging
      const wag = Math.sin(c.animTime * 10) * 2
      // body
      P(-6, -2, 12, 6, '#a04000')
      P(-6, -2, 12, 1, '#ca6f1e')
      // head
      P(4, -6, 6, 6, '#a04000')
      P(8, -4, 2, 2, '#1a1a1a') // snout
      // ear
      P(4, -7, 2, 3, '#7e5109')
      // eye
      P(7, -5, 1, 1, '#1a1a1a')
      // legs
      P(-5, 4, 2, 4, '#7e5109')
      P(-1, 4, 2, 4, '#7e5109')
      P(3, 4, 2, 4, '#7e5109')
      // tail (wagging)
      P(-8, -2 + wag, 3, 2, '#a04000')
    }
  }

  // draw a rescue encounter: caged prisoner with a glow beacon
  private drawRescueEncounter(ctx: CanvasRenderingContext2D, enc: { kind: CompanionKind; x: number; y: number; guardKilled: boolean; guardIds: number[] }) {
    const P = (x: number, y: number, w: number, h: number, col: string) => {
      ctx.fillStyle = col
      ctx.fillRect(Math.round(enc.x + x), Math.round(enc.y + y), w, h)
    }
    // cage base
    P(-10, 2, 20, 12, '#4a4a55')
    P(-10, 2, 20, 2, '#6a6a75')
    // cage bars
    ctx.fillStyle = '#3a3a44'
    for (let i = -8; i <= 8; i += 4) P(i, -16, 1, 20, '#5a5a65')
    // glowing beacon above (beckons the player)
    const glow = 0.4 + Math.sin(this.playtime * 3) * 0.2
    ctx.fillStyle = `rgba(241,196,15,${glow})`
    ctx.beginPath()
    ctx.arc(enc.x, enc.y - 20, 14, 0, Math.PI * 2)
    ctx.fill()
    // prisoner inside
    if (enc.kind === 'elf') {
      P(-3, -6, 6, 8, '#2ecc71') // elf robe
      P(-3, -12, 6, 6, '#fadbd8') // head
    } else {
      P(-4, -4, 8, 6, '#a04000') // dog body
      P(2, -8, 4, 4, '#a04000') // head
    }
    // label
    ctx.fillStyle = '#f1c40f'
    ctx.font = 'bold 9px monospace'
    ctx.textAlign = 'center'
    const guardsAlive = enc.guardIds.some((id) => this.enemies.find((e) => e.id === id && e.alive))
    ctx.fillText(enc.kind === 'elf' ? 'Elfa presa!' : 'Cachorro preso!', enc.x, enc.y - 36)
    if (guardsAlive && Math.hypot(enc.x - this.player.x, enc.y - this.player.y) < 80) {
      ctx.fillStyle = '#e74c3c'
      ctx.font = 'bold 9px monospace'
      ctx.fillText('⚠ Derrote os guardas (E)', enc.x, enc.y + 22)
    }
  }

  private renderDrops() {
    for (const d of this.drops) {
      const def = ITEMS[d.stack.id]
      drawDroppedItem(this.ctx, def?.sprite || 'it_wood', d.x, d.y + d.bob)
    }
  }

  private renderDayNight() {
    const ctx = this.ctx
    const t = this.timeOfDay
    let alpha = 0
    let color = '10,12,30'
    if (t < 0.2) { alpha = 0.55; color = '8,10,28' } // night
    else if (t < 0.3) { alpha = 0.55 - (t - 0.2) * 5.5; color = '8,10,28' } // dawn fading
    else if (t < 0.7) { alpha = 0 } // day
    else if (t < 0.8) { alpha = (t - 0.7) * 5.5; color = '40,20,40' } // dusk rising
    else { alpha = 0.55; color = '8,10,28' } // night
    if (alpha > 0) {
      ctx.fillStyle = `rgba(${color},${alpha})`
      ctx.fillRect(0, 0, this.vw, this.vh)
    }
    // torch light glow in dungeon / night
    if (this.zone === 'dungeon' || this.isNight()) {
      const hasTorch = this.inventory.some((s) => s.id === 'torch')
      const r = hasTorch ? 180 : 90
      const g = ctx.createRadialGradient(this.player.x - this.camera.x, this.player.y - this.camera.y, 0,
        this.player.x - this.camera.x, this.player.y - this.camera.y, r)
      g.addColorStop(0, 'rgba(255,220,140,0.0)')
      g.addColorStop(0.6, 'rgba(255,220,140,0.0)')
      g.addColorStop(1, 'rgba(0,0,0,0.65)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, this.vw, this.vh)
    }
    // vignette
    const v = ctx.createRadialGradient(this.vw / 2, this.vh / 2, this.vh * 0.4, this.vw / 2, this.vh / 2, this.vh * 0.8)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.45)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, this.vw, this.vh)
  }

  // ---- snapshot -----------------------------------------------------------
  private snapshot(): HudSnapshot {
    const p = this.player
    // show boss bar for the nearest alive boss (dungeon boss or bear boss) within sight
    let boss: Enemy | null = this.bossRef && this.bossRef.alive ? this.bossRef : null
    if (!boss) {
      for (const e of this.enemies) {
        if (!e.alive || !e.isBoss) continue
        if (Math.hypot(e.x - p.x, e.y - p.y) < 500) { boss = e; break }
      }
    }
    return {
      screen: this.screen,
      cls: this.cls,
      heroName: this.heroName,
      level: p?.level ?? 1,
      xp: p?.xp ?? 0,
      xpNext: p?.xpNext ?? 60,
      hp: p?.hp ?? 0,
      maxHp: p?.maxHp ?? 0,
      stamina: p?.stamina ?? 0,
      maxStamina: p?.maxStamina ?? 0,
      mana: p?.mana ?? 0,
      maxMana: p?.maxMana ?? 0,
      hunger: p?.hunger ?? 0,
      thirst: p?.thirst ?? 0,
      gold: p?.gold ?? 0,
      zone: this.zone,
      zoneName: ZONE_NAMES[this.zone],
      timeOfDay: this.timeOfDay,
      isNight: this.isNight(),
      inventory: this.inventory,
      equipped: this.equipped,
      nearStation: this.nearStation,
      nearPortal: this.nearPortal,
      nearInteract: this.nearInteract,
      bossHp: boss ? boss.hp / boss.maxHp : null,
      bossName: boss ? ENEMIES[boss.kind].name : null,
      kills: p?.kills ?? 0,
      deaths: p?.deaths ?? 0,
      craftLevels: this.craftLevels,
      toast: this.toast,
      paused: this.paused,
      showInventory: this.showInventory,
      showCrafting: this.showCrafting,
      message: this.message,
      killFeed: this.killFeed.map((k) => ({ id: k.id, text: k.text })),
      comboCount: p?.comboCount ?? 0,
      comboTimer: p?.comboTimer ?? 0,
      lockTarget: p?.lockTarget ?? -1,
      musicEnabled: this.musicEnabled,
      musicMood: this.musicMood,
      parryReady: (p?.parryTimer ?? 0) > 0,
      ascension: p?.ascension ?? 'none',
      arrows: this.countItem('arrow'),
      holyCd: p?.holyCd ?? 0,
      fireballCd: p?.fireballCd ?? 0,
      frostCd: p?.frostCd ?? 0,
      holyAura: p?.holyAura ?? 0,
      nearStructure: this.nearStructure,
      elfRescued: this.elfRescued,
      dogRescued: this.dogRescued,
      elfCd: this.companions.find((c) => c.kind === 'elf')?.cd ?? 0,
      dogCd: this.companions.find((c) => c.kind === 'dog')?.cd ?? 0,
      dogTarget: this.companions.find((c) => c.kind === 'dog')?.target ?? -1,
      isNight: this.isNight(),
    }
  }
}
