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
import type {
  ZoneId, Tile, TileType, Player, Enemy, EnemyKind, Projectile, DroppedItem,
  FloatText, Particle, ResourceNode, FarmPlot, CraftingStation, Portal,
  ItemStack, SaveData, HudSnapshot, HeroClassId, Dir, EnemyDef, CraftSkill,
} from './types'
import {
  drawTile, drawResourceNode, drawCrop, drawPlayer, drawEnemy, drawProjectile,
  drawDroppedItem, drawStation, drawPortal, drawItemIcon,
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
  farmPlots: FarmPlot[] = []
  enemies: Enemy[] = []
  projectiles: Projectile[] = []
  drops: DroppedItem[] = []
  floats: FloatText[] = []
  particles: Particle[] = []
  killFeed: { id: number; text: string; life: number }[] = []

  player!: Player
  inventory: ItemStack[] = []
  equipped = 'rusty_sword'
  craftLevels: Record<CraftSkill, number> = { cooking: 1, crafting: 1, alchemy: 1, construction: 1 }
  craftXp: Record<CraftSkill, number> = { cooking: 0, crafting: 0, alchemy: 0, construction: 0 }

  heroName = 'Herói'
  cls: HeroClassId = 'warrior'
  bossKilled = false

  timeOfDay = 0.3 // 0=midnight,0.25 dawn,0.5 noon,0.75 dusk
  playtime = 0
  seed = 12345

  camera = { x: 0, y: 0 }
  input: InputState = { keys: new Set(), mouseX: 0, mouseY: 0, mouseDown: false, rmb: false }

  nearStation: 'campfire' | 'workbench' | null = null
  nearPortal: string | null = null
  nearInteract: string | null = null
  bossRef: Enemy | null = null

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

  private loop = () => {
    if (!this.running) return
    const now = performance.now()
    let dt = (now - this.lastTime) / 1000
    this.lastTime = now
    if (dt > 0.05) dt = 0.05
    if (!this.paused && this.screen === 'game') this.update(dt)
    else if (this.screen === 'dead' || this.screen === 'win') {
      // still animate particles
      this.updateParticles(dt)
    }
    this.render()
    this.emit()
    this.rafId = requestAnimationFrame(this.loop)
  }

  // ---- input binding ------------------------------------------------------
  private keydown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (this.screen === 'game' && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault()
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
    if (k === ' ') this.dodge()
    if (k === 'j') this.attack('light')
    if (k === 'k') this.attack('heavy')
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
      this.attack('heavy')
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
        break
    }
  }

  // ---- world generation ---------------------------------------------------
  private genPlains(seed: number) {
    const rng = mulberry32(seed)
    const tiles: Tile[][] = []
    for (let y = 0; y < MAP_H; y++) {
      const row: Tile[] = []
      for (let x = 0; x < MAP_W; x++) {
        const r = rng()
        row.push(T(r > 0.82 ? 'grass2' : 'grass', false, Math.floor(rng() * 1000)))
      }
      tiles.push(row)
    }
    // lake
    const lx = 48, ly = 10, lr = 7
    for (let y = -lr; y <= lr; y++) {
      for (let x = -lr; x <= lr; x++) {
        const tx = lx + x, ty = ly + y
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue
        if (x * x + y * y < lr * lr) tiles[ty][tx] = T('water', true, 0)
        else if (x * x + y * y < (lr + 1) * (lr + 1) && rng() > 0.4) tiles[ty][tx] = T('sand', false, Math.floor(rng() * 1000))
      }
    }
    // paths crossing the map
    for (let x = 0; x < MAP_W; x++) tiles[32][x] = T('path', false, Math.floor(rng() * 1000))
    for (let y = 0; y < MAP_H; y++) tiles[y][32] = T('path', false, Math.floor(rng() * 1000))

    // resources
    const resources: ResourceNode[] = []
    let rid = 1
    const place = (type: ResourceNode['type'], count: number, region?: { x: number; y: number; r: number }) => {
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
        } while ((tiles[ty]?.[tx]?.solid || tiles[ty]?.[tx]?.type === 'water' || (tx >= 28 && tx <= 36 && ty >= 28 && ty <= 36)) && tries < 30)
        if (!tiles[ty] || !tiles[ty][tx]) continue
        if (tiles[ty][tx].type === 'water') continue
        // keep spawn area clear
        if (tx >= 28 && tx <= 36 && ty >= 28 && ty <= 36) continue
        const hp = type === 'tree' ? 4 : type === 'rock' ? 5 : type === 'iron' ? 6 : type === 'coal' ? 6 : type === 'bush' ? 2 : 2
        resources.push({ id: rid++, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 + (type === 'tree' ? 4 : 0), type, hp, maxHp: hp, respawnAt: 0, alive: true, v: Math.floor(rng() * 1000) })
        // mark some tiles for trees/rocks as solid (handled via node collision)
      }
    }
    place('tree', 60)
    place('rock', 28)
    place('bush', 24)
    place('herb', 20)
    place('iron', 10, { x: 12, y: 52, r: 6 })
    place('coal', 10, { x: 52, y: 52, r: 6 })

    // flowers decoration (non-resource)
    for (let i = 0; i < 40; i++) {
      const tx = Math.floor(rng() * MAP_W), ty = Math.floor(rng() * MAP_H)
      if (tiles[ty]?.[tx]?.type === 'grass' && rng() > 0.5) tiles[ty][tx] = T('flower', false, Math.floor(rng() * 1000))
    }

    // stations near spawn (center)
    const stations: CraftingStation[] = [
      { id: 1, x: 30 * TILE + 16, y: 30 * TILE, type: 'campfire' },
      { id: 2, x: 34 * TILE + 16, y: 30 * TILE, type: 'workbench' },
    ]

    // portals: dungeon entrance in the north
    const portals: Portal[] = [
      { x: 32 * TILE - 20, y: 4 * TILE, w: 40, h: 56, to: 'dungeon', label: 'Cripta do Silêncio' },
    ]

    this.tiles.plains = tiles
    this.resources.plains = resources
    this.stations = stations
    this.portals.plains = portals
  }

  private genDungeon(seed: number) {
    const rng = mulberry32(seed ^ 0x9e37)
    const W = DUNGEON_W, H = DUNGEON_H
    const tiles: Tile[][] = []
    // start all walls
    for (let y = 0; y < H; y++) {
      const row: Tile[] = []
      for (let x = 0; x < W; x++) row.push(T('wall', true, Math.floor(rng() * 1000)))
      tiles.push(row)
    }
    // carve rooms + corridors
    const carve = (x0: number, y0: number, w: number, h: number) => {
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++)
          if (x >= 0 && y >= 0 && x < W && y < H) tiles[y][x] = T('floor', false, Math.floor(rng() * 1000))
    }
    // entrance room
    carve(18, 2, 4, 4)
    // corridor down
    carve(19, 6, 2, 6)
    // mid room
    carve(15, 12, 10, 6)
    carve(13, 14, 2, 2)
    carve(25, 14, 2, 2)
    // corridor to boss
    carve(19, 18, 2, 6)
    // boss arena
    carve(13, 24, 14, 12)
    // side chambers
    carve(4, 10, 6, 6)
    carve(30, 10, 6, 6)
    carve(4, 24, 6, 6)
    carve(30, 24, 6, 6)
    // connect side chambers
    carve(10, 12, 3, 2)
    carve(27, 12, 3, 2)
    carve(10, 27, 3, 2)
    carve(27, 27, 3, 2)
    // rubble decoration
    for (let i = 0; i < 24; i++) {
      const tx = Math.floor(rng() * W), ty = Math.floor(rng() * H)
      if (tiles[ty]?.[tx]?.type === 'floor' && rng() > 0.6) tiles[ty][tx] = T('rubble', false, Math.floor(rng() * 1000))
    }
    // altar in boss room center
    tiles[29][19] = T('altar', false, 0)
    tiles[29][20] = T('altar', false, 0)
    // exit door (back to plains) at entrance
    tiles[3][19] = T('door', false, 0)
    tiles[3][20] = T('door', false, 0)

    const portals: Portal[] = [
      { x: 19 * TILE, y: 3 * TILE, w: 2 * TILE, h: TILE, to: 'plains', label: 'Voltar à Planície' },
    ]
    this.tiles.dungeon = tiles
    this.portals.dungeon = portals
    this.resources.dungeon = []
  }

  private spawnEnemies() {
    this.enemies = []
    let id = 1
    if (this.zone === 'plains') {
      // farming packs scattered around (avoid spawn center)
      const packs: { kind: EnemyKind; x: number; y: number }[] = [
        { kind: 'slime', x: 12 * TILE, y: 12 * TILE },
        { kind: 'slime', x: 14 * TILE, y: 13 * TILE },
        { kind: 'slime', x: 50 * TILE, y: 14 * TILE },
        { kind: 'goblin', x: 16 * TILE, y: 50 * TILE },
        { kind: 'goblin', x: 18 * TILE, y: 52 * TILE },
        { kind: 'goblin', x: 48 * TILE, y: 50 * TILE },
        { kind: 'wolf', x: 40 * TILE, y: 18 * TILE },
        { kind: 'wolf', x: 42 * TILE, y: 20 * TILE },
        { kind: 'wolf', x: 20 * TILE, y: 40 * TILE },
        { kind: 'skeleton', x: 8 * TILE, y: 30 * TILE },
        { kind: 'skeleton', x: 56 * TILE, y: 30 * TILE },
        { kind: 'wraith', x: 32 * TILE, y: 56 * TILE },
      ]
      for (const p of packs) {
        const e = this.makeEnemy(id++, p.kind, p.x, p.y)
        this.enemies.push(e)
      }
    } else {
      // dungeon: tougher mobs + boss
      const packs: { kind: EnemyKind; x: number; y: number }[] = [
        { kind: 'skeleton', x: 7 * TILE, y: 13 * TILE },
        { kind: 'skeleton', x: 33 * TILE, y: 13 * TILE },
        { kind: 'skeleton', x: 7 * TILE, y: 27 * TILE },
        { kind: 'wraith', x: 33 * TILE, y: 27 * TILE },
        { kind: 'wraith', x: 20 * TILE, y: 15 * TILE },
        { kind: 'goblin', x: 17 * TILE, y: 9 * TILE },
        { kind: 'goblin', x: 23 * TILE, y: 9 * TILE },
      ]
      for (const p of packs) {
        this.enemies.push(this.makeEnemy(id++, p.kind, p.x, p.y))
      }
      // boss in arena
      const boss = this.makeEnemy(id++, 'boss', 20 * TILE, 30 * TILE)
      boss.isBoss = true
      boss.leash = 9999
      this.enemies.push(boss)
      this.bossRef = boss
    }
  }

  private makeEnemy(id: number, kind: EnemyKind, x: number, y: number): Enemy {
    const def: EnemyDef = ENEMIES[kind]
    return {
      id, kind, x, y, vx: 0, vy: 0,
      hp: def.hp, maxHp: def.hp,
      state: 'idle', stateTimer: 0, dir: 'down',
      spawnX: x, spawnY: y, leash: kind === 'boss' ? 9999 : 260,
      animTime: Math.random() * 10, hitFlash: 0, respawnAt: 0, alive: true,
      attackTargetX: 0, attackTargetY: 0, knockX: 0, knockY: 0,
      isBoss: kind === 'boss',
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
      dodgeTimer: 0, dodgeCd: 0, iframes: 0, blocking: false, hitFlash: 0,
      animTime: 0, moving: false, kills: 0, deaths: 0, playtime: 0, invuln: 0,
    }
    this.equipped = base.startWeapon
    this.inventory = [...base.startItems.map((s) => ({ ...s }))]
    // everyone gets a hoe to farm
    this.addItem('hoe', 1)
    this.addItem('torch', 1)
    this.spawnEnemies()
    this.screen = 'game'
    this.paused = false
    this.toast = { id: this.nextId++, text: 'Você desperta em Eldoria... sobreviva.', kind: 'info' }
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
      dodgeTimer: 0, dodgeCd: 0, iframes: 0, blocking: false, hitFlash: 0,
      animTime: 0, moving: false, kills: data.kills, deaths: data.deaths, playtime: data.playtime, invuln: 0,
    }
    this.spawnEnemies()
    if (this.bossKilled && this.bossRef) {
      this.bossRef.alive = false
      this.bossRef.respawnAt = 0
    }
    this.screen = 'game'
    this.paused = false
    this.toast = { id: this.nextId++, text: 'Jornada retomada.', kind: 'info' }
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
    // try gathering nearby resource
    const p = this.player
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
    // farm: till soil or harvest
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE)
    const plot = this.farmPlots.find((f) => f.tileX === tx && f.tileY === ty)
    if (plot) {
      if (plot.stage >= 3) {
        this.harvestCrop(plot)
      } else {
        this.flashToast('A planta ainda não cresceu', 'info')
      }
      return
    }
    // till soil if standing on grass with a hoe
    const tile = this.tiles[this.zone][ty]?.[tx]
    const hasHoe = this.inventory.some((s) => ITEMS[s.id]?.tool === 'hoe')
    if (tile && (tile.type === 'grass' || tile.type === 'grass2') && hasHoe) {
      this.farmPlots.push({ tileX: tx, tileY: ty, stage: 0, growth: 0, watered: false, crop: '' })
      tile.type = 'soil'
      this.flashToast('Terra arada. Plante sementes.', 'info')
      return
    }
    // water plot with water bottle
    if (tile && tile.type === 'soil') {
      const wb = this.inventory.find((s) => s.id === 'water_bottle')
      if (wb) {
        const plt = this.farmPlots.find((f) => f.tileX === tx && f.tileY === ty)
        if (plt && !plt.watered) {
          plt.watered = true
          tile.type = 'soil_wet'
          this.removeItem('water_bottle', 1)
          this.flashToast('Regado!', 'info')
          return
        }
      }
    }
    this.flashToast('Nada para interagir', 'info')
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
    if (tile) tile.type = 'soil'
    plot.stage = 0
    plot.growth = 0
    plot.crop = ''
    plot.watered = false
  }

  gatherResource(r: ResourceNode) {
    const p = this.player
    // require correct tool for efficiency
    const def: { tool?: string } = {}
    let dmg = 1
    if (r.type === 'tree') {
      if (this.inventory.some((s) => ITEMS[s.id]?.tool === 'axe')) dmg = 2
    } else if (r.type === 'rock' || r.type === 'iron' || r.type === 'coal') {
      if (this.inventory.some((s) => ITEMS[s.id]?.tool === 'pickaxe')) dmg = 2
      else dmg = 1
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
    this.spawnFloat(r.x, r.y - 16, `+${r.type === 'tree' ? 'madeira' : r.type === 'rock' ? 'pedra' : r.type}`, '#c0a878')
    this.spawnParticles(r.x, r.y, 4, r.type === 'tree' ? '#6e4a30' : r.type === 'bush' ? '#7cb342' : '#9d9da5')
    if (r.hp <= 0) {
      r.alive = false
      r.respawnAt = this.playtime + 40
      // bonus drop
      if (r.type === 'tree') this.addItem('wood', 2)
      if (r.type === 'rock') this.addItem('stone', 2)
      this.spawnParticles(r.x, r.y, 8, '#9d9da5')
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
      this.player.x = 32 * TILE + 16
      this.player.y = 8 * TILE
    } else {
      this.player.x = 20 * TILE
      this.player.y = 5 * TILE + 16
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

  attack(type: 'light' | 'heavy') {
    const p = this.player
    if (this.screen !== 'game' || this.paused) return
    if (p.attackCd > 0 || p.attacking > 0 || p.dodgeTimer > 0) return
    const def = this.weaponStats()
    const cost = type === 'heavy' ? STAMINA_HEAVY : STAMINA_ATTACK
    if (p.stamina < cost) {
      this.flashToast('Stamina insuficiente', 'bad')
      return
    }
    p.stamina -= cost
    p.attacking = type === 'heavy' ? 0.45 : 0.3
    p.attackType = type
    p.attackCd = 1 / (def.attackSpeed || 2)
    // ranged weapons spawn projectile at the moment of swing
    if (this.equipped === 'bow' || this.equipped === 'staff') {
      const speed = this.equipped === 'bow' ? 460 : 380
      const ang = this.dirAngle(p.dir)
      const dmg = (def.damage || 10) * (type === 'heavy' ? 1.6 : 1)
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
    const baseDmg = (def.damage || 10) * (heavy ? 1.6 : 1)
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
      // backstab check (rogue behind enemy)
      let dmg = baseDmg
      let crit = false
      // crit chance from agility-ish
      if (this.cls === 'rogue' && Math.abs(diff) < 0.4) {
        dmg *= 1.5
        crit = true
      } else if (Math.random() < 0.12) {
        dmg *= 1.5
        crit = true
      }
      dmg = Math.round(dmg)
      this.damageEnemy(e, dmg, dx, dy, crit)
    }
  }

  damageEnemy(e: Enemy, dmg: number, kx: number, ky: number, crit: boolean) {
    e.hp -= dmg
    e.hitFlash = 0.15
    const k = crit ? 90 : 50
    const len = Math.hypot(kx, ky) || 1
    e.knockX += (kx / len) * k
    e.knockY += (ky / len) * k
    // aggro
    if (e.state === 'idle' || e.state === 'patrol') e.state = 'chase'
    this.spawnFloat(e.x, e.y - 16, `${dmg}${crit ? '!' : ''}`, crit ? '#f1c40f' : '#ffffff')
    this.spawnParticles(e.x, e.y, 4, '#e74c3c')
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
    if (e.isBoss) {
      this.bossKilled = true
      this.bossRef = null
      this.flashToast('VOCÊ DERROTOU O CAVALEIRO SILENCIOSO!', 'good')
      this.message = 'VITÓRIA! O Silêncio se quebra. Você forjou seu destino em Eldoria.'
      this.screen = 'win'
      this.submitLeaderboard()
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
    if (p.blocking && p.stamina > 0) {
      const reduce = this.cls === 'warrior' ? 0.7 : 0.5
      dmg = amount * (1 - reduce)
      p.stamina = Math.max(0, p.stamina - STAMINA_BLOCK_HIT)
      blocked = true
      if (p.stamina <= 0) {
        // guard break
        p.invuln = 0.6
        this.spawnFloat(p.x, p.y - 24, 'GUARDA QUEBRADA!', '#e74c3c')
      }
    }
    dmg = Math.round(dmg)
    p.hp -= dmg
    p.hitFlash = 0.2
    p.invuln = 0.4
    // knockback
    const dx = p.x - sx, dy = p.y - sy
    const len = Math.hypot(dx, dy) || 1
    p.vx += (dx / len) * (blocked ? 60 : 140)
    p.vy += (dy / len) * (blocked ? 60 : 140)
    this.spawnFloat(p.x, p.y - 20, blocked ? `Bloq ${dmg}` : `-${dmg}`, blocked ? '#3498db' : '#e74c3c')
    this.spawnParticles(p.x, p.y, 6, '#e74c3c')
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
    this.updateProjectiles(dt)
    this.updateDrops(dt)
    this.updateFarm(dt)
    this.updateResources(dt)
    this.updateProximity()
    this.updateParticles(dt)
    this.updateCamera(dt)

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
    // input movement
    let ix = 0, iy = 0
    const k = this.input.keys
    if (k.has('a') || k.has('arrowleft')) ix -= 1
    if (k.has('d') || k.has('arrowright')) ix += 1
    if (k.has('w') || k.has('arrowup')) iy -= 1
    if (k.has('s') || k.has('arrowdown')) iy += 1
    p.blocking = k.has('shift') && p.stamina > 0 && p.dodgeTimer <= 0
    const archerBoost = this.cls === 'archer' ? 1.15 : 1
    let speed = p.blocking ? PLAYER_SPEED * 0.4 : PLAYER_SPEED * archerBoost
    // hunger/thirst slows
    if (p.hunger < 30) speed *= 0.8
    if (p.thirst < 20) speed *= 0.85

    if (p.dodgeTimer > 0) {
      p.dodgeTimer -= dt
      // roll in facing/last input dir
      const ang = this.dirAngle(p.dir)
      const ds = DODGE_SPEED * (p.dodgeTimer / DODGE_TIME + 0.4)
      p.vx = Math.cos(ang) * ds
      p.vy = Math.sin(ang) * ds
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

      // apply knockback
      e.x += e.knockX * dt
      e.y += e.knockY * dt
      e.knockX *= 0.82
      e.knockY *= 0.82

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
          if (dist <= def.reach + 6) {
            // attack
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
            // lunge
            const ang = Math.atan2(dy, dx)
            e.vx = Math.cos(ang) * (e.isBoss ? 180 : 120)
            e.vy = Math.sin(ang) * (e.isBoss ? 180 : 120)
          }
          break
        }
        case 'attack': {
          e.stateTimer -= dt
          // active hit detection
          const adx = p.x - e.x, ady = p.y - e.y
          if (Math.hypot(adx, ady) < def.reach + 12) {
            this.damagePlayer(def.damage, e.x, e.y)
          }
          this.moveEntity(e, e.vx * dt, e.vy * dt, 6)
          e.vx *= 0.9
          e.vy *= 0.9
          if (e.stateTimer <= 0) {
            e.state = 'recover'
            e.stateTimer = def.recovery
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
      const rate = plot.watered ? 0.05 : 0.025
      plot.growth += rate * dt
      if (plot.growth >= 1) {
        plot.stage += 1
        plot.growth = 0
        if (plot.stage >= 3) {
          plot.growth = 0
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
      fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      }).catch(() => {})
    } catch { /* ignore */ }
  }

  // ---- render -------------------------------------------------------------
  private render() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.vw, this.vh)
    if (this.screen === 'title' || this.screen === 'class') {
      this.renderBackdrop()
      return
    }
    // game world
    ctx.save()
    ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y))
    this.renderTiles()
    this.renderResourcesBelow()
    this.renderFarm()
    this.renderStations()
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
        // iframe shimmer
        if (this.player.iframes > 0 || this.player.dodgeTimer > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.25)'
          ctx.beginPath()
          ctx.arc(this.player.x, this.player.y - 2, 12, 0, Math.PI * 2)
          ctx.fill()
        }
      },
    })
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
    const x0 = Math.max(0, Math.floor(this.camera.x / TILE))
    const y0 = Math.max(0, Math.floor(this.camera.y / TILE))
    const x1 = Math.min(tiles[0].length - 1, Math.ceil((this.camera.x + this.vw) / TILE))
    const y1 = Math.min(tiles.length - 1, Math.ceil((this.camera.y + this.vh) / TILE))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = tiles[y][x]
        drawTile(ctx, t.type, x * TILE, y * TILE, t.v)
      }
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
    const boss = this.bossRef && this.bossRef.alive ? this.bossRef : null
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
      bossName: boss ? ENEMIES.boss.name : null,
      kills: p?.kills ?? 0,
      deaths: p?.deaths ?? 0,
      craftLevels: this.craftLevels,
      toast: this.toast,
      paused: this.paused,
      showInventory: this.showInventory,
      showCrafting: this.showCrafting,
      message: this.message,
      killFeed: this.killFeed.map((k) => ({ id: k.id, text: k.text })),
    }
  }
}
