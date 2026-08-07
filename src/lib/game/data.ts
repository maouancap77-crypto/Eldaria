// ============================================================================
// Eldoria Online — game data: items, recipes, classes, enemies, constants
// ============================================================================
import type {
  ItemDef,
  Recipe,
  HeroClassDef,
  EnemyDef,
  CraftSkill,
} from './types'

// ---- World constants ------------------------------------------------------
export const TILE = 32
export const MAP_W = 96
export const MAP_H = 96
export const DUNGEON_W = 40
export const DUNGEON_H = 40
export const PLAYER_SPEED = 132 // px/s walk
export const PLAYER_SPRINT = 196
export const DODGE_SPEED = 320
export const DODGE_TIME = 0.32 // seconds
export const IFRAME_TIME = 0.28
export const DODGE_CD = 0.6
export const STAMINA_DODGE = 28
export const STAMINA_ATTACK = 10
export const STAMINA_HEAVY = 22
export const STAMINA_BLOCK_HIT = 14
export const STAMINA_REGEN = 22 // per second when not acting
export const STAMINA_REGEN_BLOCK = 6
export const MANA_REGEN = 4 // per second
export const HUNGER_RATE = 0.18 // per second
export const THIRST_RATE = 0.26
export const HP_REGEN_WELLFED = 0.6
export const DAY_LENGTH = 180 // seconds for full day/night cycle

// ---- Items ----------------------------------------------------------------
export const ITEMS: Record<string, ItemDef> = {
  // Weapons
  rusty_sword: { id: 'rusty_sword', name: 'Espada Enferrujada', category: 'weapon', desc: 'Lâmina gasta mas confiável. Dano 12.', sprite: 'wpn_sword', max: 1, damage: 12, attackSpeed: 2.2, reach: 38, arc: 1.4, rarity: 'common' },
  iron_sword: { id: 'iron_sword', name: 'Espada de Ferro', category: 'weapon', desc: 'Forjada na Forja. Dano 20.', sprite: 'wpn_sword2', max: 1, damage: 20, attackSpeed: 2.0, reach: 42, arc: 1.5, rarity: 'uncommon' },
  bone_axe: { id: 'bone_axe', name: 'Machado de Osso', category: 'weapon', desc: 'Lento e brutal. Dano 30 pesado.', sprite: 'wpn_axe', max: 1, damage: 30, attackSpeed: 1.3, reach: 40, arc: 1.7, rarity: 'rare' },
  staff: { id: 'staff', name: 'Cajado Arcano', category: 'weapon', desc: 'Dispara bolts arcanos. Dano 16.', sprite: 'wpn_staff', max: 1, damage: 16, attackSpeed: 1.6, reach: 320, arc: 0, rarity: 'uncommon' },
  bow: { id: 'bow', name: 'Arco Curto', category: 'weapon', desc: 'Flechas velozes à distância. Dano 14. Requer flechas.', sprite: 'wpn_bow', max: 1, damage: 14, attackSpeed: 1.8, reach: 340, arc: 0, rarity: 'uncommon' },
  dagger: { id: 'dagger', name: 'Adaga Sombria', category: 'weapon', desc: 'Rápida. Backstab +50%. Dano 10.', sprite: 'wpn_dagger', max: 1, damage: 10, attackSpeed: 3.2, reach: 32, arc: 1.0, rarity: 'uncommon' },
  legendary_blade: { id: 'legendary_blade', name: 'Lâmina de Eldoria', category: 'weapon', desc: 'Forjada com o núcleo do chefe. Dano 42.', sprite: 'wpn_legend', max: 1, damage: 42, attackSpeed: 1.8, reach: 48, arc: 1.6, rarity: 'legendary' },

  // Ammo
  arrow: { id: 'arrow', name: 'Flecha', category: 'misc', desc: 'Munição para o arco. Craft com madeira + fibra.', sprite: 'it_arrow', max: 99 },

  // Tools
  hoe: { id: 'hoe', name: 'Enxada', category: 'tool', desc: 'Arar a terra para plantar.', sprite: 'tool_hoe', max: 1, tool: 'hoe', power: 1 },
  axe: { id: 'axe', name: 'Machado de Lenha', category: 'tool', desc: 'Derruba árvores mais rápido.', sprite: 'tool_axe', max: 1, tool: 'axe', power: 1 },
  pickaxe: { id: 'pickaxe', name: 'Picareta', category: 'tool', desc: 'Minera pedra, ferro e carvão.', sprite: 'tool_pick', max: 1, tool: 'pickaxe', power: 1 },

  // Food
  berry: { id: 'berry', name: 'Baga Silvestre', category: 'food', desc: 'Fome +8.', sprite: 'it_berry', max: 40, hunger: 8 },
  bread: { id: 'bread', name: 'Pão', category: 'food', desc: 'Fome +24.', sprite: 'it_bread', max: 20, hunger: 24 },
  cooked_meat: { id: 'cooked_meat', name: 'Carne Assada', category: 'food', desc: 'Fome +36, HP +15.', sprite: 'it_meat', max: 20, hunger: 36, heal: 15 },
  stew: { id: 'stew', name: 'Ensopado de Raízes', category: 'food', desc: 'Fome +44, HP +30, regen 60s.', sprite: 'it_stew', max: 10, hunger: 44, heal: 30 },
  raw_meat: { id: 'raw_meat', name: 'Carne Crua', category: 'food', desc: 'Comer cru? Fome +10, risco.', sprite: 'it_rawmeat', max: 20, hunger: 10, heal: -8 },

  // Drink
  water_bottle: { id: 'water_bottle', name: 'Garrafa de Água', category: 'drink', desc: 'Sede +30.', sprite: 'it_water', max: 20, thirst: 30 },

  // Potion
  hp_potion: { id: 'hp_potion', name: 'Poção de Vida', category: 'potion', desc: 'Restaura 60 HP.', sprite: 'it_hppot', max: 10, effect: 'heal', effectAmount: 60 },
  mp_potion: { id: 'mp_potion', name: 'Poção de Mana', category: 'potion', desc: 'Restaura 50 de mana.', sprite: 'it_mppot', max: 10, effect: 'mana', effectAmount: 50 },
  antidote: { id: 'antidote', name: 'Antídoto', category: 'potion', desc: 'Cura envenenamento.', sprite: 'it_antidote', max: 10, effect: 'cure', effectAmount: 0 },

  // Materials
  wood: { id: 'wood', name: 'Madeira', category: 'material', desc: 'Material de construção básico.', sprite: 'it_wood', max: 99 },
  stone: { id: 'stone', name: 'Pedra', category: 'material', desc: 'Material sólido para forjar.', sprite: 'it_stone', max: 99 },
  fiber: { id: 'fiber', name: 'Fibra', category: 'material', desc: 'Colhida de arbustos.', sprite: 'it_fiber', max: 99 },
  herb: { id: 'herb', name: 'Erva Curativa', category: 'material', desc: 'Base de poções e ataduras.', sprite: 'it_herb', max: 99 },
  iron_ore: { id: 'iron_ore', name: 'Minério de Ferro', category: 'material', desc: 'Fundir na forja.', sprite: 'it_iron', max: 99 },
  coal: { id: 'coal', name: 'Carvão', category: 'material', desc: 'Combustível de forja.', sprite: 'it_coal', max: 99 },
  iron_bar: { id: 'iron_bar', name: 'Barra de Ferro', category: 'material', desc: 'Ferro refinado.', sprite: 'it_ironbar', max: 99 },
  hide: { id: 'hide', name: 'Couro Bruto', category: 'material', desc: 'Pele de monstro.', sprite: 'it_hide', max: 99 },
  bone: { id: 'bone', name: 'Osso', category: 'material', desc: 'Restos de esqueletos.', sprite: 'it_bone', max: 99 },
  essence: { id: 'essence', name: 'Essência Arcana', category: 'material', desc: 'Energia do chefe. Cria lenda.', sprite: 'it_essence', max: 99, rarity: 'epic' },

  // Seeds
  seed_crop: { id: 'seed_crop', name: 'Semente de Cereais', category: 'seed', desc: 'Plante em terra arada.', sprite: 'it_seed', max: 30, crop: 'crop' },

  // Misc
  torch: { id: 'torch', name: 'Tocha', category: 'misc', desc: 'Ilumina a noite e masmorras.', sprite: 'it_torch', max: 5 },
  crown: { id: 'crown', name: 'Coroa de Eldoria', category: 'misc', desc: 'Moeda do reino.', sprite: 'it_crown', max: 99999 },
}

// ---- Recipes --------------------------------------------------------------
export const RECIPES: Recipe[] = [
  // Cooking (campfire)
  { id: 'r_bread', name: 'Assar Pão', station: 'campfire', inputs: [{ id: 'wood', qty: 1 }, { id: 'fiber', qty: 2 }], output: { id: 'bread', qty: 2 } },
  { id: 'r_meat', name: 'Assar Carne', station: 'campfire', inputs: [{ id: 'raw_meat', qty: 1 }, { id: 'wood', qty: 1 }], output: { id: 'cooked_meat', qty: 1 } },
  { id: 'r_stew', name: 'Ensopado', station: 'campfire', inputs: [{ id: 'raw_meat', qty: 1 }, { id: 'berry', qty: 2 }, { id: 'water_bottle', qty: 1 }], output: { id: 'stew', qty: 1 }, craftLevel: { skill: 'cooking', level: 2 } },
  { id: 'r_torch', name: 'Fazer Tocha', station: 'campfire', inputs: [{ id: 'wood', qty: 2 }, { id: 'fiber', qty: 1 }], output: { id: 'torch', qty: 1 } },
  // Workbench
  { id: 'r_hoe', name: 'Fabricar Enxada', station: 'workbench', inputs: [{ id: 'wood', qty: 3 }, { id: 'stone', qty: 1 }], output: { id: 'hoe', qty: 1 } },
  { id: 'r_axe', name: 'Fabricar Machado', station: 'workbench', inputs: [{ id: 'wood', qty: 3 }, { id: 'stone', qty: 2 }], output: { id: 'axe', qty: 1 } },
  { id: 'r_pick', name: 'Fabricar Picareta', station: 'workbench', inputs: [{ id: 'wood', qty: 3 }, { id: 'stone', qty: 3 }], output: { id: 'pickaxe', qty: 1 } },
  { id: 'r_iron', name: 'Fundir Ferro', station: 'workbench', inputs: [{ id: 'iron_ore', qty: 2 }, { id: 'coal', qty: 1 }], output: { id: 'iron_bar', qty: 1 } },
  { id: 'r_ironsword', name: 'Forjar Espada de Ferro', station: 'workbench', inputs: [{ id: 'iron_bar', qty: 3 }, { id: 'wood', qty: 1 }], output: { id: 'iron_sword', qty: 1 }, craftLevel: { skill: 'crafting', level: 2 } },
  { id: 'r_bow', name: 'Construir Arco', station: 'workbench', inputs: [{ id: 'wood', qty: 4 }, { id: 'fiber', qty: 3 }], output: { id: 'bow', qty: 1 } },
  { id: 'r_arrows', name: 'Fabricar Flechas (x10)', station: 'workbench', inputs: [{ id: 'wood', qty: 2 }, { id: 'fiber', qty: 1 }], output: { id: 'arrow', qty: 10 } },
  { id: 'r_hppot', name: 'Preparar Poção de Vida', station: 'workbench', inputs: [{ id: 'herb', qty: 2 }, { id: 'berry', qty: 1 }, { id: 'water_bottle', qty: 1 }], output: { id: 'hp_potion', qty: 1 }, craftLevel: { skill: 'alchemy', level: 1 } },
  { id: 'r_mppot', name: 'Preparar Poção de Mana', station: 'workbench', inputs: [{ id: 'herb', qty: 1 }, { id: 'essence', qty: 1 }], output: { id: 'mp_potion', qty: 1 }, craftLevel: { skill: 'alchemy', level: 2 } },
  { id: 'r_seed', name: 'Separar Sementes', station: 'workbench', inputs: [{ id: 'berry', qty: 3 }], output: { id: 'seed_crop', qty: 2 } },
  // Hand (none) — basic
  { id: 'r_water', name: 'Encher Garrafa (água)', station: 'none', inputs: [{ id: 'fiber', qty: 2 }], output: { id: 'water_bottle', qty: 1 } },
  { id: 'r_legend', name: 'Forjar Lâmina de Eldoria', station: 'workbench', inputs: [{ id: 'essence', qty: 3 }, { id: 'iron_bar', qty: 5 }, { id: 'bone', qty: 4 }], output: { id: 'legendary_blade', qty: 1 }, craftLevel: { skill: 'crafting', level: 4 } },
]

// ---- Hero classes ---------------------------------------------------------
export const CLASSES: Record<string, HeroClassDef> = {
  warrior: {
    id: 'warrior', name: 'Guerreiro', title: 'Tanque de Aço',
    desc: 'Alto HP e armadura. Bloqueio eficaz. Combate corpo-a-corpo robusto.',
    baseHp: 140, baseStamina: 120, baseMana: 30, baseDamage: 0,
    startWeapon: 'rusty_sword',
    startItems: [{ id: 'berry', qty: 3 }, { id: 'wood', qty: 2 }],
    passive: 'Bloqueio reduz 70% do dano (vs 50%).',
    color: '#c0392b', accent: '#f1c40f',
  },
  archer: {
    id: 'archer', name: 'Arqueiro', title: 'Olho de Falcão',
    desc: 'Dano à distância com arco. Mobilidade e armadilhas. Backstab de longe.',
    baseHp: 95, baseStamina: 110, baseMana: 50, baseDamage: 0,
    startWeapon: 'bow',
    startItems: [{ id: 'berry', qty: 3 }, { id: 'arrow', qty: 30 }],
    passive: '+15% velocidade de movimento.',
    color: '#27ae60', accent: '#f39c12',
  },
  mage: {
    id: 'mage', name: 'Mago', title: 'Aprendiz Arcano',
    desc: 'Dano mágico devastador, defesa frágil. Cajado dispara bolts.',
    baseHp: 80, baseStamina: 90, baseMana: 130, baseDamage: 0,
    startWeapon: 'staff',
    startItems: [{ id: 'berry', qty: 3 }, { id: 'mp_potion', qty: 1 }],
    passive: 'Regeneração de mana +50%.',
    color: '#8e44ad', accent: '#3498db',
  },
  healer: {
    id: 'healer', name: 'Curandeiro', title: 'Mão da Vida',
    desc: 'Suporte e cura. Único que cura ferimentos graves em combate.',
    baseHp: 100, baseStamina: 100, baseMana: 120, baseDamage: 0,
    startWeapon: 'rusty_sword',
    startItems: [{ id: 'hp_potion', qty: 2 }, { id: 'herb', qty: 3 }],
    passive: 'Poções curam +50%.',
    color: '#16a085', accent: '#ecf0f1',
  },
  rogue: {
    id: 'rogue', name: 'Ladino', title: 'Sombra Silenciosa',
    desc: 'Stealth, backstab +50%, venenos. Adaga veloz.',
    baseHp: 90, baseStamina: 130, baseMana: 50, baseDamage: 0,
    startWeapon: 'dagger',
    startItems: [{ id: 'berry', qty: 3 }, { id: 'antidote', qty: 1 }],
    passive: 'Backstab causa +50% de dano. Esquiva mais barata.',
    color: '#34495e', accent: '#e74c3c',
  },
}

// ---- Enemy definitions ----------------------------------------------------
export const ENEMIES: Record<string, EnemyDef> = {
  slime: {
    kind: 'slime', name: 'Limo Verde', hp: 30, damage: 8, speed: 36, xp: 12,
    gold: [1, 3], sight: 150, reach: 26, windup: 0.45, active: 0.18, recovery: 0.6,
    loot: [{ id: 'fiber', chance: 0.5, min: 1, max: 2 }, { id: 'berry', chance: 0.25, min: 1, max: 1 }],
    color: '#6ab04c', scale: 1,
  },
  goblin: {
    kind: 'goblin', name: 'Goblin Batedor', hp: 55, damage: 14, speed: 70, xp: 22,
    gold: [3, 8], sight: 240, reach: 34, windup: 0.38, active: 0.14, recovery: 0.55,
    loot: [{ id: 'hide', chance: 0.5, min: 1, max: 2 }, { id: 'stone', chance: 0.3, min: 1, max: 2 }, { id: 'iron_ore', chance: 0.1, min: 1, max: 1 }],
    color: '#7f8c4a', scale: 1,
  },
  skeleton: {
    kind: 'skeleton', name: 'Esqueleto', hp: 75, damage: 18, speed: 60, xp: 32,
    gold: [5, 12], sight: 280, reach: 36, windup: 0.42, active: 0.16, recovery: 0.5,
    loot: [{ id: 'bone', chance: 0.7, min: 1, max: 3 }, { id: 'stone', chance: 0.4, min: 1, max: 2 }, { id: 'iron_ore', chance: 0.15, min: 1, max: 1 }],
    color: '#dfe6e9', scale: 1,
  },
  wolf: {
    kind: 'wolf', name: 'Lobo Selvagem', hp: 50, damage: 16, speed: 120, xp: 26,
    gold: [2, 6], sight: 320, reach: 30, windup: 0.28, active: 0.12, recovery: 0.4,
    loot: [{ id: 'hide', chance: 0.6, min: 1, max: 2 }, { id: 'raw_meat', chance: 0.4, min: 1, max: 1 }],
    color: '#636e72', scale: 1,
  },
  wraith: {
    kind: 'wraith', name: 'Espectro Arcano', hp: 110, damage: 24, speed: 78, xp: 55,
    gold: [10, 20], sight: 300, reach: 40, windup: 0.5, active: 0.2, recovery: 0.6,
    loot: [{ id: 'essence', chance: 0.2, min: 1, max: 1 }, { id: 'bone', chance: 0.5, min: 1, max: 2 }],
    color: '#6c5ce7', scale: 1.1, nocturnal: true,
  },
  boss: {
    kind: 'boss', name: 'O Cavaleiro Silencioso', hp: 700, damage: 34, speed: 70, xp: 400,
    gold: [120, 180], sight: 600, reach: 60, windup: 0.7, active: 0.3, recovery: 0.8,
    loot: [{ id: 'essence', chance: 1, min: 3, max: 3 }, { id: 'iron_bar', chance: 1, min: 5, max: 5 }, { id: 'bone', chance: 1, min: 4, max: 4 }, { id: 'hp_potion', chance: 1, min: 2, max: 2 }],
    color: '#2d3436', scale: 2.2,
  },
  // ---- New enemies ----
  jaguar: {
    // Onça humanóide — guerreiro ágil com lança, ataca em investida rápida
    kind: 'jaguar', name: 'Guerreiro Onça', hp: 90, damage: 20, speed: 95, xp: 38,
    gold: [6, 14], sight: 300, reach: 38, windup: 0.32, active: 0.16, recovery: 0.45,
    loot: [{ id: 'hide', chance: 0.6, min: 1, max: 2 }, { id: 'bone', chance: 0.3, min: 1, max: 1 }, { id: 'iron_ore', chance: 0.15, min: 1, max: 1 }],
    color: '#d68910', scale: 1.05,
  },
  drake: {
    // Dragonar — drako montado que cospe fogo em cone, voador (ignora lentidão)
    kind: 'drake', name: 'Dragonar', hp: 140, damage: 26, speed: 85, xp: 60,
    gold: [12, 24], sight: 340, reach: 46, windup: 0.55, active: 0.25, recovery: 0.7,
    loot: [{ id: 'hide', chance: 0.5, min: 1, max: 2 }, { id: 'essence', chance: 0.15, min: 1, max: 1 }, { id: 'coal', chance: 0.4, min: 1, max: 2 }],
    color: '#c0392b', scale: 1.25,
  },
  vampire: {
    // Vampiro — rápido, drena vida (cura a si mesmo ao acertar), telegrafa
    kind: 'vampire', name: 'Vampiro', hp: 120, damage: 24, speed: 110, xp: 52,
    gold: [10, 22], sight: 360, reach: 36, windup: 0.4, active: 0.18, recovery: 0.5,
    loot: [{ id: 'essence', chance: 0.18, min: 1, max: 1 }, { id: 'hide', chance: 0.5, min: 1, max: 2 }, { id: 'hp_potion', chance: 0.2, min: 1, max: 1 }],
    color: '#8e1b1b', scale: 1.1, nocturnal: true,
  },
  lizard_bard: {
    // Lagarto Bardo — toca música que buffa inimigos próximos, frágil mas fugaz
    kind: 'lizard_bard', name: 'Lagarto Bardo', hp: 65, damage: 12, speed: 75, xp: 30,
    gold: [5, 12], sight: 280, reach: 30, windup: 0.5, active: 0.2, recovery: 0.6,
    loot: [{ id: 'fiber', chance: 0.4, min: 1, max: 2 }, { id: 'berry', chance: 0.5, min: 1, max: 2 }, { id: 'essence', chance: 0.08, min: 1, max: 1 }],
    color: '#2e86c1', scale: 1,
  },
  bear_boss: {
    // Boss Urso — tanque brutal com ataque de garra em área e investida
    kind: 'bear_boss', name: 'Maou Ursão', hp: 900, damage: 38, speed: 60, xp: 450,
    gold: [150, 220], sight: 500, reach: 70, windup: 0.65, active: 0.32, recovery: 0.75,
    loot: [{ id: 'hide', chance: 1, min: 6, max: 6 }, { id: 'raw_meat', chance: 1, min: 5, max: 5 }, { id: 'essence', chance: 1, min: 4, max: 4 }, { id: 'hp_potion', chance: 1, min: 3, max: 3 }, { id: 'bone', chance: 1, min: 6, max: 6 }],
    color: '#7e5109', scale: 2.4,
  },
}

// ---- XP curve -------------------------------------------------------------
export function xpForLevel(level: number): number {
  return Math.floor(60 * Math.pow(level, 1.5))
}

// ---- Stat growth ----------------------------------------------------------
export function statsForClass(cls: string, level: number) {
  const base = CLASSES[cls]
  const mul = 1 + (level - 1) * 0.12
  return {
    maxHp: Math.floor(base.baseHp * mul),
    maxStamina: Math.floor(base.baseStamina * (1 + (level - 1) * 0.04)),
    maxMana: Math.floor(base.baseMana * (1 + (level - 1) * 0.08)),
  }
}

export const CRAFT_SKILLS: CraftSkill[] = ['cooking', 'crafting', 'alchemy', 'construction']

export function craftXpForLevel(level: number): number {
  return 20 + level * 15
}

export const ZONE_NAMES: Record<string, string> = {
  plains: 'Planície Dourada',
  dungeon: 'Cripta do Silêncio',
}
