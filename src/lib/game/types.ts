// ============================================================================
// Eldoria Online — core type definitions
// ============================================================================

export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Dir = 'up' | 'down' | 'left' | 'right' | 'ul' | 'ur' | 'dl' | 'dr'

export type ZoneId = 'plains' | 'dungeon'

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
export type ItemCategory =
  | 'weapon'
  | 'tool'
  | 'food'
  | 'drink'
  | 'potion'
  | 'material'
  | 'seed'
  | 'misc'

export interface ItemDef {
  id: string
  name: string
  category: ItemCategory
  desc: string
  sprite: string
  max: number
  hunger?: number
  thirst?: number
  heal?: number
  mana?: number
  damage?: number
  attackSpeed?: number
  reach?: number
  arc?: number
  effect?: 'heal' | 'mana' | 'cure'
  effectAmount?: number
  crop?: string
  tool?: 'hoe' | 'axe' | 'pickaxe'
  power?: number
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
}

export interface ItemStack {
  id: string
  qty: number
}

// ---------------------------------------------------------------------------
// Crafting
// ---------------------------------------------------------------------------
export interface Recipe {
  id: string
  name: string
  station: 'campfire' | 'workbench' | 'none'
  inputs: ItemStack[]
  output: ItemStack
  craftLevel?: { skill: CraftSkill; level: number }
}

export type CraftSkill =
  | 'cooking'
  | 'crafting'
  | 'alchemy'
  | 'construction'

// ---------------------------------------------------------------------------
// Hero classes
// ---------------------------------------------------------------------------
export type HeroClassId =
  | 'warrior'
  | 'archer'
  | 'mage'
  | 'healer'
  | 'rogue'

export interface HeroClassDef {
  id: HeroClassId
  name: string
  title: string
  desc: string
  baseHp: number
  baseStamina: number
  baseMana: number
  baseDamage: number
  startWeapon: string
  startItems: ItemStack[]
  passive: string
  color: string
  accent: string
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
export type EnemyKind =
  | 'slime'
  | 'goblin'
  | 'skeleton'
  | 'wolf'
  | 'wraith'
  | 'boss'

export interface EnemyDef {
  kind: EnemyKind
  name: string
  hp: number
  damage: number
  speed: number
  xp: number
  gold: [number, number]
  sight: number
  reach: number
  windup: number
  active: number
  recovery: number
  loot: { id: string; chance: number; min: number; max: number }[]
  color: string
  scale: number
}

// ---------------------------------------------------------------------------
// Tilemap
// ---------------------------------------------------------------------------
export type TileType =
  | 'grass'
  | 'grass2'
  | 'dirt'
  | 'path'
  | 'water'
  | 'sand'
  | 'tree'
  | 'rock'
  | 'flower'
  | 'bush'
  | 'soil'
  | 'soil_wet'
  | 'crop'
  | 'wall'
  | 'floor'
  | 'rubble'
  | 'altar'
  | 'door'

export interface Tile {
  type: TileType
  solid: boolean
  v: number
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
export interface Player {
  x: number
  y: number
  vx: number
  vy: number
  dir: Dir
  cls: HeroClassId
  level: number
  xp: number
  xpNext: number
  hp: number
  maxHp: number
  stamina: number
  maxStamina: number
  mana: number
  maxMana: number
  hunger: number
  thirst: number
  gold: number
  attacking: number
  attackType: 'light' | 'heavy' | null
  attackCd: number
  dodgeTimer: number
  dodgeCd: number
  iframes: number
  blocking: boolean
  blockHeldTime: number // how long block has been held (for parry window)
  parryTimer: number // >0 means in perfect-parry window (just raised shield)
  hitFlash: number
  animTime: number
  moving: boolean
  kills: number
  deaths: number
  playtime: number
  invuln: number
  comboCount: number
  comboTimer: number
  chargeTime: number // >0 while charging a heavy attack
  lockTarget: number // enemy id, -1 = none
  poise: number // player poise (stagger resistance)
  stagger: number // >0 means staggered (can't act)
}

export type EnemyState =
  | 'idle'
  | 'patrol'
  | 'chase'
  | 'windup'
  | 'attack'
  | 'recover'
  | 'hurt'
  | 'dead'

export interface Enemy {
  id: number
  kind: EnemyKind
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  maxHp: number
  state: EnemyState
  stateTimer: number
  dir: Dir
  spawnX: number
  spawnY: number
  leash: number
  animTime: number
  hitFlash: number
  respawnAt: number
  alive: boolean
  attackTargetX: number
  attackTargetY: number
  isBoss?: boolean
  knockX: number
  knockY: number
  stagger: number // >0 means staggered/stunned (can't act, open to crit)
  staggerMax: number // poise threshold before stagger
  attackCd: number // cooldown between attacks
  rangedCd: number // cooldown for ranged attacks (wraith)
  lungeCd: number // cooldown for wolf lunge
}

export interface Projectile {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  life: number
  damage: number
  fromPlayer: boolean
  kind: 'arrow' | 'bolt' | 'fire' | 'frost'
}

export interface DroppedItem {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  stack: ItemStack
  life: number
  bob: number
}

export interface FloatText {
  id: number
  x: number
  y: number
  text: string
  color: string
  life: number
  vy: number
  size: number
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
  gravity: number
}

export interface ResourceNode {
  id: number
  x: number
  y: number
  type: 'tree' | 'rock' | 'bush' | 'iron' | 'coal' | 'herb' | 'water'
  hp: number
  maxHp: number
  respawnAt: number
  alive: boolean
  v: number
}

export interface FarmPlot {
  tileX: number
  tileY: number
  stage: number
  growth: number
  watered: boolean
  crop: string
}

export interface CraftingStation {
  id: number
  x: number
  y: number
  type: 'campfire' | 'workbench'
}

export interface Portal {
  x: number
  y: number
  w: number
  h: number
  to: ZoneId
  label: string
}

// ---------------------------------------------------------------------------
// Save state
// ---------------------------------------------------------------------------
export interface SaveData {
  version: number
  heroName: string
  cls: HeroClassId
  level: number
  xp: number
  hp: number
  stamina: number
  mana: number
  hunger: number
  thirst: number
  gold: number
  kills: number
  deaths: number
  playtime: number
  zone: ZoneId
  px: number
  py: number
  inventory: ItemStack[]
  equipped: string
  craftLevels: Record<CraftSkill, number>
  craftXp: Record<CraftSkill, number>
  farmPlots: FarmPlot[]
  bossKilled: boolean
  seed: number
}

// ---------------------------------------------------------------------------
// HUD snapshot (what React reads each frame)
// ---------------------------------------------------------------------------
export interface HudSnapshot {
  screen: 'title' | 'class' | 'game' | 'dead' | 'win'
  cls: HeroClassId
  heroName: string
  level: number
  xp: number
  xpNext: number
  hp: number
  maxHp: number
  stamina: number
  maxStamina: number
  mana: number
  maxMana: number
  hunger: number
  thirst: number
  gold: number
  zone: ZoneId
  zoneName: string
  timeOfDay: number
  isNight: boolean
  inventory: ItemStack[]
  equipped: string
  nearStation: 'campfire' | 'workbench' | null
  nearPortal: string | null
  nearInteract: string | null
  bossHp: number | null
  bossName: string | null
  kills: number
  deaths: number
  craftLevels: Record<CraftSkill, number>
  toast: { id: number; text: string; kind: 'info' | 'good' | 'bad' } | null
  paused: boolean
  showInventory: boolean
  showCrafting: boolean
  message: string | null
  killFeed: { id: number; text: string }[]
  comboCount: number
  comboTimer: number
  lockTarget: number
  musicEnabled: boolean
  musicMood: 'calm' | 'combat' | 'dungeon'
  parryReady: boolean
}
