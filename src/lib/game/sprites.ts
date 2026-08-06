// ============================================================================
// Eldoria Online — procedural pixel-art sprite rendering
// All sprites are composed from small rectangles to give an authentic
// chunky pixel-art look. Coordinates are in world space (camera already
// applied). A helper `px` rounds to integers for crispness.
// ============================================================================
import type { Dir, HeroClassId, EnemyKind, TileType } from './types'
import { CLASSES } from './data'

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

// shade a hex color by amt (-1..1)
export function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '')
  let r = parseInt(h.substring(0, 2), 16)
  let g = parseInt(h.substring(2, 4), 16)
  let b = parseInt(h.substring(4, 6), 16)
  if (amt < 0) {
    r = Math.round(r * (1 + amt))
    g = Math.round(g * (1 + amt))
    b = Math.round(b * (1 + amt))
  } else {
    r = Math.round(r + (255 - r) * amt)
    g = Math.round(g + (255 - g) * amt)
    b = Math.round(b + (255 - b) * amt)
  }
  return `rgb(${r},${g},${b})`
}

// ---------------------------------------------------------------------------
// TILES — 32x32, drawn with subtle variation via seed v
// ---------------------------------------------------------------------------
export function drawTile(ctx: CanvasRenderingContext2D, t: TileType, x: number, y: number, v: number) {
  const s = 32
  switch (t) {
    case 'grass': {
      px(ctx, x, y, s, s, '#6aa84f')
      // tufts
      const n = (v * 4) | 0
      for (let i = 0; i < n; i++) {
        const tx = x + ((v * (i + 1) * 13) % s)
        const ty = y + ((v * (i + 2) * 17) % s)
        px(ctx, tx, ty, 2, 2, '#7cb342')
      }
      break
    }
    case 'grass2': {
      px(ctx, x, y, s, s, '#5b8c3e')
      for (let i = 0; i < 3; i++) {
        const tx = x + ((v * (i + 1) * 11) % s)
        const ty = y + ((v * (i + 3) * 19) % s)
        px(ctx, tx, ty, 3, 2, '#6fa045')
      }
      break
    }
    case 'dirt': {
      px(ctx, x, y, s, s, '#8d6e52')
      for (let i = 0; i < 4; i++) {
        const tx = x + ((v * (i + 1) * 7) % s)
        const ty = y + ((v * (i + 2) * 23) % s)
        px(ctx, tx, ty, 2, 2, '#7a5d44')
      }
      break
    }
    case 'path': {
      px(ctx, x, y, s, s, '#bfa57a')
      for (let i = 0; i < 3; i++) {
        const tx = x + ((v * (i + 1) * 9) % s)
        const ty = y + ((v * (i + 2) * 13) % s)
        px(ctx, tx, ty, 3, 3, '#a88d5e')
      }
      break
    }
    case 'sand': {
      px(ctx, x, y, s, s, '#e6d59a')
      for (let i = 0; i < 4; i++) {
        const tx = x + ((v * (i + 1) * 11) % s)
        const ty = y + ((v * (i + 2) * 17) % s)
        px(ctx, tx, ty, 2, 2, '#d4c082')
      }
      break
    }
    case 'water': {
      px(ctx, x, y, s, s, '#3f7fb4')
      px(ctx, x, y, s, s / 2, '#4a8fc4')
      // ripples
      const off = (v * 7) % s
      px(ctx, x + off, y + 8, 6, 1, '#6fa9d8')
      px(ctx, x + (off + 12) % s, y + 20, 8, 1, '#6fa9d8')
      break
    }
    case 'soil': {
      px(ctx, x, y, s, s, '#5a3d28')
      px(ctx, x, y, s, 2, '#6e4a30')
      for (let i = 0; i < 5; i++) {
        const tx = x + ((v * (i + 1) * 7) % s)
        const ty = y + 4 + ((v * (i + 2) * 11) % (s - 6))
        px(ctx, tx, ty, 3, 2, '#4a3019')
      }
      break
    }
    case 'soil_wet': {
      px(ctx, x, y, s, s, '#3a2818')
      px(ctx, x, y, s, 2, '#523724')
      for (let i = 0; i < 5; i++) {
        const tx = x + ((v * (i + 1) * 7) % s)
        const ty = y + 4 + ((v * (i + 2) * 11) % (s - 6))
        px(ctx, tx, ty, 3, 2, '#241509')
      }
      break
    }
    case 'flower': {
      px(ctx, x, y, s, s, '#6aa84f')
      const fx = x + 10, fy = y + 10
      px(ctx, fx, fy, 2, 2, '#fff3a0')
      px(ctx, fx - 2, fy, 2, 2, '#fff3a0')
      px(ctx, fx + 2, fy, 2, 2, '#fff3a0')
      px(ctx, fx, fy - 2, 2, 2, '#fff3a0')
      px(ctx, fx, fy + 2, 2, 2, '#fff3a0')
      px(ctx, fx, fy, 2, 2, '#f4a830')
      break
    }
    case 'bush': {
      px(ctx, x, y, s, s, '#6aa84f')
      px(ctx, x + 4, y + 6, 24, 20, '#3f6e2a')
      px(ctx, x + 6, y + 4, 8, 6, '#4f8234')
      px(ctx, x + 18, y + 6, 8, 6, '#4f8234')
      px(ctx, x + 10, y + 16, 4, 4, '#e74c3c')
      px(ctx, x + 20, y + 18, 4, 4, '#e74c3c')
      break
    }
    case 'wall': {
      px(ctx, x, y, s, s, '#3a3a44')
      // brick lines
      px(ctx, x, y + 10, s, 2, '#222229')
      px(ctx, x, y + 20, s, 2, '#222229')
      px(ctx, x + 8, y, 2, 10, '#222229')
      px(ctx, x + 22, y + 10, 2, 10, '#222229')
      px(ctx, x + 4, y + 20, 2, 12, '#222229')
      px(ctx, x, y, s, 2, '#4a4a55')
      break
    }
    case 'floor': {
      px(ctx, x, y, s, s, '#4a4036')
      px(ctx, x, y, s, 1, '#5a4f44')
      px(ctx, x, y + 16, s, 1, '#3a3128')
      const n = (v * 3) | 0
      for (let i = 0; i < n; i++) {
        const tx = x + ((v * (i + 1) * 13) % s)
        const ty = y + ((v * (i + 2) * 17) % s)
        px(ctx, tx, ty, 2, 2, '#3a3128')
      }
      break
    }
    case 'rubble': {
      px(ctx, x, y, s, s, '#4a4036')
      px(ctx, x + 6, y + 10, 8, 8, '#6a6056')
      px(ctx, x + 18, y + 16, 8, 6, '#5a5046')
      px(ctx, x + 10, y + 20, 6, 4, '#3a3128')
      break
    }
    case 'altar': {
      px(ctx, x, y, s, s, '#4a4036')
      px(ctx, x + 6, y + 12, 20, 16, '#2d2d38')
      px(ctx, x + 8, y + 6, 16, 8, '#4a4a55')
      px(ctx, x + 14, y + 2, 4, 6, '#9b59b6')
      break
    }
    case 'door': {
      px(ctx, x, y, s, s, '#2d2d38')
      px(ctx, x + 4, y + 2, 24, 28, '#6e4a30')
      px(ctx, x + 6, y + 4, 20, 24, '#5a3d28')
      px(ctx, x + 20, y + 16, 3, 3, '#f1c40f')
      break
    }
    case 'crop':
    case 'tree':
    case 'rock':
      // handled elsewhere (resource nodes)
      px(ctx, x, y, s, s, '#6aa84f')
      break
  }
}

// ---------------------------------------------------------------------------
// RESOURCE NODES (trees, rocks, ore, herbs, water) drawn on top of tiles
// ---------------------------------------------------------------------------
export function drawResourceNode(
  ctx: CanvasRenderingContext2D,
  type: 'tree' | 'rock' | 'bush' | 'iron' | 'coal' | 'herb' | 'water',
  x: number,
  y: number,
  v: number,
  hitFlash: number
) {
  const fl = hitFlash > 0 ? '#ffffff' : null
  const set = (c: string) => fl || c
  switch (type) {
    case 'tree': {
      // shadow
      px(ctx, x + 6, y + 26, 20, 5, 'rgba(0,0,0,0.25)')
      // trunk
      px(ctx, x + 14, y + 18, 4, 12, set('#6e4a30'))
      px(ctx, x + 14, y + 18, 2, 12, set('#5a3d28'))
      // canopy
      px(ctx, x + 4, y + 2, 24, 18, set('#3f6e2a'))
      px(ctx, x + 6, y, 20, 6, set('#4f8234'))
      px(ctx, x + 2, y + 6, 8, 10, set('#356022'))
      px(ctx, x + 22, y + 6, 8, 10, set('#356022'))
      px(ctx, x + 10, y + 4, 12, 10, set('#5e9636'))
      break
    }
    case 'rock': {
      px(ctx, x + 4, y + 26, 24, 4, 'rgba(0,0,0,0.25)')
      px(ctx, x + 4, y + 10, 24, 18, set('#8a8a92'))
      px(ctx, x + 6, y + 8, 18, 6, set('#9d9da5'))
      px(ctx, x + 8, y + 16, 6, 6, set('#6e6e76'))
      px(ctx, x + 20, y + 18, 4, 4, set('#6e6e76'))
      break
    }
    case 'bush': {
      px(ctx, x + 4, y + 8, 24, 20, set('#3f6e2a'))
      px(ctx, x + 8, y + 6, 10, 8, set('#4f8234'))
      px(ctx, x + 18, y + 8, 10, 8, set('#4f8234'))
      px(ctx, x + 12, y + 14, 4, 4, set('#e74c3c'))
      px(ctx, x + 20, y + 16, 4, 4, set('#e74c3c'))
      break
    }
    case 'iron': {
      px(ctx, x + 4, y + 10, 24, 18, set('#8a8a92'))
      px(ctx, x + 8, y + 12, 6, 5, set('#c08a5a'))
      px(ctx, x + 18, y + 16, 6, 5, set('#c08a5a'))
      px(ctx, x + 14, y + 20, 5, 4, set('#b3744a'))
      break
    }
    case 'coal': {
      px(ctx, x + 4, y + 10, 24, 18, set('#5a5046'))
      px(ctx, x + 8, y + 12, 6, 5, set('#1a1a1a'))
      px(ctx, x + 18, y + 16, 6, 5, set('#1a1a1a'))
      px(ctx, x + 14, y + 20, 5, 4, set('#333333'))
      break
    }
    case 'herb': {
      px(ctx, x + 14, y + 20, 4, 8, set('#3f6e2a'))
      px(ctx, x + 10, y + 14, 4, 6, set('#5e9636'))
      px(ctx, x + 18, y + 16, 4, 6, set('#5e9636'))
      px(ctx, x + 14, y + 10, 4, 6, set('#5e9636'))
      px(ctx, x + 12, y + 8, 8, 4, set('#d6e8a0'))
      break
    }
    case 'water': {
      px(ctx, x, y, 32, 32, '#3f7fb4')
      px(ctx, x, y, 32, 16, '#4a8fc4')
      const off = (v * 7) % 32
      px(ctx, x + off, y + 10, 8, 1, '#7fb6dc')
      px(ctx, x + (off + 14) % 32, y + 22, 10, 1, '#7fb6dc')
      break
    }
  }
}

// ---------------------------------------------------------------------------
// CROP — growth stages 0..3
// ---------------------------------------------------------------------------
export function drawCrop(ctx: CanvasRenderingContext2D, x: number, y: number, stage: number, watered: boolean) {
  if (stage === 0) {
    px(ctx, x + 14, y + 22, 4, 4, '#5e9636')
  } else if (stage === 1) {
    px(ctx, x + 14, y + 16, 4, 10, '#5e9636')
    px(ctx, x + 10, y + 18, 4, 4, '#7cb342')
    px(ctx, x + 18, y + 18, 4, 4, '#7cb342')
  } else if (stage === 2) {
    px(ctx, x + 14, y + 10, 4, 16, '#4f8234')
    px(ctx, x + 8, y + 12, 6, 6, '#5e9636')
    px(ctx, x + 18, y + 12, 6, 6, '#5e9636')
    px(ctx, x + 12, y + 8, 8, 4, '#7cb342')
  } else {
    // harvestable golden wheat
    px(ctx, x + 14, y + 8, 4, 18, '#9b7b3a')
    px(ctx, x + 8, y + 10, 6, 6, '#e6c860')
    px(ctx, x + 18, y + 10, 6, 6, '#e6c860')
    px(ctx, x + 11, y + 6, 10, 6, '#f4d870')
    px(ctx, x + 13, y + 4, 6, 4, '#fff3a0')
  }
  if (watered) {
    px(ctx, x + 12, y + 28, 3, 2, '#3f7fb4')
  }
}

// ---------------------------------------------------------------------------
// PLAYER — composed humanoid, class-themed
// ---------------------------------------------------------------------------
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cls: HeroClassId,
  dir: Dir,
  moving: boolean,
  animTime: number,
  attacking: number,
  attackType: 'light' | 'heavy' | null,
  dodgeTimer: number,
  blocking: boolean,
  hitFlash: number,
  weaponSprite: string
) {
  const base = CLASSES[cls]
  const body = hitFlash > 0 ? '#ffffff' : base.color
  const accent = hitFlash > 0 ? '#ffffff' : base.accent
  const skin = '#f0c8a0'
  const dark = '#2c2c34'
  const legC = '#3a3a44'

  // walk bob
  const step = moving ? Math.sin(animTime * 10) : 0
  const bob = moving ? Math.abs(Math.sin(animTime * 10)) * 1.5 : 0
  const legSwap = moving ? Math.sin(animTime * 10) > 0 : false

  // dodge: squish + rotate-ish (just offset)
  const dodge = dodgeTimer > 0

  const cx = x
  const cy = y - bob - (dodge ? 2 : 0)

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.beginPath()
  ctx.ellipse(x, y + 14, 9, 4, 0, 0, Math.PI * 2)
  ctx.fill()

  // legs
  if (dir === 'left' || dir === 'right' || dir === 'up' || dir === 'down' || dir.startsWith('u') || dir.startsWith('d')) {
    if (legSwap) {
      px(ctx, cx - 5, cy + 6, 4, 8, legC)
      px(ctx, cx + 1, cy + 6, 4, 6, legC)
    } else {
      px(ctx, cx - 5, cy + 6, 4, 6, legC)
      px(ctx, cx + 1, cy + 6, 4, 8, legC)
    }
  }

  // body
  px(ctx, cx - 6, cy - 4, 12, 12, body)
  px(ctx, cx - 6, cy - 4, 12, 3, accent) // shoulder trim
  // belt
  px(ctx, cx - 6, cy + 4, 12, 2, dark)

  // arms
  const armSwing = moving ? Math.sin(animTime * 10) * 2 : 0
  px(ctx, cx - 8, cy - 2 + armSwing, 3, 7, body)
  px(ctx, cx + 5, cy - 2 - armSwing, 3, 7, body)

  // head
  px(ctx, cx - 5, cy - 14, 10, 10, skin)
  // hair / hood (class color)
  px(ctx, cx - 6, cy - 15, 12, 5, body)
  px(ctx, cx - 6, cy - 15, 12, 2, shade(base.color, 0.15))

  // face direction markers
  if (dir === 'down' || dir === 'dl' || dir === 'dr') {
    px(ctx, cx - 3, cy - 10, 2, 2, dark) // eyes
    px(ctx, cx + 1, cy - 10, 2, 2, dark)
  } else if (dir === 'up' || dir === 'ul' || dir === 'ur') {
    // back of head — more hair
    px(ctx, cx - 5, cy - 14, 10, 8, body)
  } else if (dir === 'left') {
    px(ctx, cx - 4, cy - 10, 2, 2, dark)
  } else if (dir === 'right') {
    px(ctx, cx + 2, cy - 10, 2, 2, dark)
  }

  // shield when blocking
  if (blocking) {
    const sx = dir === 'left' ? cx - 12 : cx + 7
    px(ctx, sx, cy - 4, 4, 12, '#8a6a2a')
    px(ctx, sx, cy - 4, 4, 2, accent)
    px(ctx, sx, cy + 1, 4, 2, '#5a4520')
  }

  // weapon — drawn based on attack state
  drawWeapon(ctx, cx, cy, dir, attacking, attackType, weaponSprite, animTime, blocking)
}

function drawWeapon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: Dir,
  attacking: number,
  attackType: 'light' | 'heavy' | null,
  weaponSprite: string,
  animTime: number,
  blocking: boolean
) {
  if (blocking) return
  const isAttacking = attacking > 0 && attackType
  // swing angle
  let angle = 0
  if (isAttacking) {
    // 0..1 progress
    const total = attackType === 'heavy' ? 0.45 : 0.3
    const p = 1 - attacking / total
    angle = (p - 0.5) * 2.4 // sweep
  }

  const facingRight = dir === 'right' || dir === 'ur' || dir === 'dr'
  const facingLeft = dir === 'left' || dir === 'ul' || dir === 'dl'
  const facingUp = dir === 'up'
  const facingDown = dir === 'down'

  ctx.save()
  ctx.translate(cx, cy)
  // base angle from facing
  let base = 0
  if (facingRight) base = 0
  else if (facingLeft) base = Math.PI
  else if (facingUp) base = -Math.PI / 2
  else if (facingDown) base = Math.PI / 2
  else base = 0
  ctx.rotate(base + angle * (facingLeft ? -1 : 1))

  // draw weapon pointing right in local space
  switch (weaponSprite) {
    case 'wpn_sword':
    case 'wpn_sword2':
    case 'wpn_legend': {
      const blade = weaponSprite === 'wpn_legend' ? '#f4d870' : weaponSprite === 'wpn_sword2' ? '#cfd8dc' : '#b0a890'
      px(ctx, 6, -1, 12, 2, blade)
      px(ctx, 4, -2, 2, 4, '#6e4a30') // guard
      px(ctx, 2, -1, 2, 2, '#3a3a44') // handle
      if (weaponSprite === 'wpn_legend') {
        px(ctx, 14, -1, 4, 2, '#fff3a0')
      }
      break
    }
    case 'wpn_axe': {
      px(ctx, 2, -1, 14, 2, '#6e4a30')
      px(ctx, 12, -5, 6, 10, '#9d9da5')
      px(ctx, 14, -4, 4, 8, '#cfd8dc')
      break
    }
    case 'wpn_dagger': {
      px(ctx, 5, -1, 8, 2, '#cfd8dc')
      px(ctx, 4, -2, 1, 4, '#3a3a44')
      break
    }
    case 'wpn_staff': {
      px(ctx, 2, -1, 16, 2, '#6e4a30')
      px(ctx, 16, -4, 6, 8, '#8e44ad')
      px(ctx, 18, -2, 3, 4, '#c39bd3')
      if (isAttacking) {
        // glow
        px(ctx, 18, -1, 4, 2, '#e8daef')
      }
      break
    }
    case 'wpn_bow': {
      px(ctx, 6, -6, 2, 12, '#6e4a30')
      px(ctx, 8, -6, 1, 12, '#3a3a44') // string
      if (isAttacking) {
        px(ctx, 10, -1, 8, 2, '#cfd8dc') // arrow
      }
      break
    }
  }
  ctx.restore()

  // slash arc effect
  if (isAttacking && (weaponSprite === 'wpn_sword' || weaponSprite === 'wpn_sword2' || weaponSprite === 'wpn_legend' || weaponSprite === 'wpn_axe' || weaponSprite === 'wpn_dagger')) {
    drawSlashArc(ctx, cx, cy, base + angle * (facingLeft ? -1 : 1), attackType === 'heavy')
  }
}

function drawSlashArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number, heavy: boolean) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(angle)
  ctx.strokeStyle = heavy ? 'rgba(255,180,60,0.85)' : 'rgba(255,255,255,0.85)'
  ctx.lineWidth = heavy ? 4 : 2.5
  ctx.beginPath()
  ctx.arc(0, 0, 26, -0.7, 0.7)
  ctx.stroke()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// ENEMIES
// ---------------------------------------------------------------------------
export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  kind: EnemyKind,
  x: number,
  y: number,
  state: string,
  stateTimer: number,
  dir: Dir,
  animTime: number,
  hitFlash: number,
  scale: number,
  color: string
) {
  const fl = hitFlash > 0
  const c = (col: string) => (fl ? '#ffffff' : col)
  const dark = shade(color, -0.35)
  const light = shade(color, 0.2)

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.beginPath()
  ctx.ellipse(x, y + 13 * scale, 9 * scale, 4 * scale, 0, 0, Math.PI * 2)
  ctx.fill()

  switch (kind) {
    case 'slime': {
      const squash = state === 'windup' ? 1 - stateTimer * 0.3 : state === 'attack' ? 0.7 : 1
      const w = 18 * scale * (2 - squash)
      const h = 12 * scale * squash
      px(ctx, x - w / 2, y + 4 - h / 2, w, h, c(color))
      px(ctx, x - w / 2 + 2, y + 4 - h / 2, w - 4, 3, c(light))
      px(ctx, x - 3, y - 1, 2, 2, '#1a1a1a') // eyes
      px(ctx, x + 1, y - 1, 2, 2, '#1a1a1a')
      break
    }
    case 'goblin': {
      const step = Math.sin(animTime * 8) > 0
      px(ctx, x - 4, y + 6, 3, 6, c(dark))
      px(ctx, x + 1, y + 6, 3, 6, c(dark))
      px(ctx, x - 5, y - 2, 10, 9, c(color))
      px(ctx, x - 5, y - 2, 10, 2, c(light))
      // head
      px(ctx, x - 4, y - 11, 8, 8, c(color))
      px(ctx, x - 6, y - 10, 2, 3, c(color)) // ear
      px(ctx, x + 4, y - 10, 2, 3, c(color))
      px(ctx, x - 2, y - 8, 2, 2, '#f1c40f') // eye
      px(ctx, x + 1, y - 8, 2, 2, '#f1c40f')
      // weapon (club)
      if (state === 'windup' || state === 'attack') {
        const swing = state === 'attack' ? 6 : 2
        px(ctx, x + 4, y - 6 - swing, 3, 8, '#6e4a30')
        px(ctx, x + 3, y - 10 - swing, 5, 4, '#8a8a92')
      } else {
        px(ctx, x + 4, y - 4, 3, 8, '#6e4a30')
        px(ctx, x + 3, y - 8, 5, 4, '#8a8a92')
      }
      break
    }
    case 'skeleton': {
      const step = Math.sin(animTime * 9)
      px(ctx, x - 4, y + 6, 3, 6, c('#dfe6e9'))
      px(ctx, x + 1, y + 6, 3, 6, c('#dfe6e9'))
      // ribcage
      px(ctx, x - 4, y - 3, 8, 9, c('#e8eef0'))
      px(ctx, x - 4, y - 1, 8, 1, c('#9aa6ab'))
      px(ctx, x - 4, y + 2, 8, 1, c('#9aa6ab'))
      // skull
      px(ctx, x - 4, y - 12, 8, 8, c('#f4f8f9'))
      px(ctx, x - 3, y - 9, 2, 2, '#1a1a1a')
      px(ctx, x + 1, y - 9, 2, 2, '#1a1a1a')
      px(ctx, x - 1, y - 6, 2, 1, '#1a1a1a')
      // sword
      const swing = state === 'attack' ? -8 : state === 'windup' ? -4 : 0
      px(ctx, x + 4, y - 2 + swing, 2, 10, c('#cfd8dc'))
      break
    }
    case 'wolf': {
      const step = Math.sin(animTime * 12)
      px(ctx, x - 10, y + 4, 20, 8, c(color))
      px(ctx, x - 12, y, 6, 8, c(color)) // head
      px(ctx, x - 13, y - 2, 2, 3, c(color)) // ear
      px(ctx, x + 8, y + 2, 4, 6, c(dark)) // tail
      // legs
      px(ctx, x - 8, y + 10 + (step > 0 ? 0 : 1), 2, 4, c(dark))
      px(ctx, x - 2, y + 10 + (step < 0 ? 0 : 1), 2, 4, c(dark))
      px(ctx, x + 2, y + 10 + (step > 0 ? 0 : 1), 2, 4, c(dark))
      px(ctx, x + 7, y + 10 + (step < 0 ? 0 : 1), 2, 4, c(dark))
      px(ctx, x - 14, y + 1, 2, 2, '#f1c40f') // eye
      // fangs
      if (state === 'attack') {
        px(ctx, x - 13, y + 5, 1, 2, '#fff')
        px(ctx, x - 11, y + 5, 1, 2, '#fff')
      }
      break
    }
    case 'wraith': {
      const float = Math.sin(animTime * 4) * 2
      // tattered cloak
      px(ctx, x - 6, y - 10 + float, 12, 16, c(color))
      px(ctx, x - 7, y + 4 + float, 4, 6, c(shade(color, -0.2)))
      px(ctx, x + 3, y + 4 + float, 4, 6, c(shade(color, -0.2)))
      px(ctx, x - 5, y - 14 + float, 10, 8, c(shade(color, 0.1)))
      // glowing eyes
      px(ctx, x - 3, y - 10 + float, 2, 2, '#fff')
      px(ctx, x + 1, y - 10 + float, 2, 2, '#fff')
      // wisps
      if (state === 'attack') {
        ctx.fillStyle = 'rgba(108,92,231,0.5)'
        ctx.beginPath()
        ctx.arc(x, y - 4 + float, 10, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'boss': {
      const step = Math.sin(animTime * 6)
      const s = scale
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.beginPath()
      ctx.ellipse(x, y + 24 * s, 22 * s, 6 * s, 0, 0, Math.PI * 2)
      ctx.fill()
      // legs (armored)
      px(ctx, x - 10 * s, y + 10 * s, 7 * s, 16 * s, c('#2d3436'))
      px(ctx, x + 3 * s, y + 10 * s, 7 * s, 16 * s, c('#2d3436'))
      // body
      px(ctx, x - 12 * s, y - 12 * s, 24 * s, 24 * s, c(color))
      px(ctx, x - 12 * s, y - 12 * s, 24 * s, 4 * s, c('#4a4a55')) // pauldron
      px(ctx, x - 12 * s, y + 6 * s, 24 * s, 3 * s, c('#1a1a1a')) // belt
      // glowing core
      px(ctx, x - 3 * s, y - 4 * s, 6 * s, 6 * s, '#9b59b6')
      px(ctx, x - 2 * s, y - 3 * s, 4 * s, 4 * s, '#e0aef0')
      // head/helm
      px(ctx, x - 7 * s, y - 26 * s, 14 * s, 14 * s, c('#3a3a44'))
      px(ctx, x - 7 * s, y - 26 * s, 14 * s, 3 * s, c('#5a5a65'))
      // horns
      px(ctx, x - 9 * s, y - 30 * s, 3 * s, 5 * s, c('#1a1a1a'))
      px(ctx, x + 6 * s, y - 30 * s, 3 * s, 5 * s, c('#1a1a1a'))
      // glowing eyes
      px(ctx, x - 4 * s, y - 21 * s, 3 * s, 2 * s, '#e74c3c')
      px(ctx, x + 1 * s, y - 21 * s, 3 * s, 2 * s, '#e74c3c')
      // greatsword
      const swing = state === 'attack' ? -20 * s : state === 'windup' ? 10 * s : 0
      px(ctx, x + 12 * s, y - 8 * s + swing, 4 * s, 30 * s, c('#cfd8dc'))
      px(ctx, x + 11 * s, y + 18 * s + swing, 6 * s, 3 * s, '#8a6a2a')
      break
    }
    case 'jaguar': {
      // Onça humanóide: corpo peludo dourado, cabeça de onça com manchas, lança
      const stp = Math.sin(animTime * 9)
      // legs
      px(ctx, x - 4, y + 6 + (stp > 0 ? 0 : 1), 3, 6, c(dark))
      px(ctx, x + 1, y + 6 + (stp < 0 ? 0 : 1), 3, 6, c(dark))
      // loincloth body
      px(ctx, x - 5, y - 3, 10, 10, c(color))
      px(ctx, x - 5, y + 3, 10, 3, c('#7e5109')) // belt
      // arms
      px(ctx, x - 8, y - 1, 3, 6, c(color))
      px(ctx, x + 5, y - 1, 3, 6, c(color))
      // head (jaguar)
      px(ctx, x - 5, y - 12, 10, 9, c(color))
      // ears
      px(ctx, x - 6, y - 14, 2, 3, c(color))
      px(ctx, x + 4, y - 14, 2, 3, c(color))
      // spots
      px(ctx, x - 3, y - 11, 2, 2, c(dark))
      px(ctx, x + 2, y - 9, 2, 2, c(dark))
      // eyes (fierce)
      px(ctx, x - 3, y - 8, 2, 2, '#f1c40f')
      px(ctx, x + 1, y - 8, 2, 2, '#f1c40f')
      // snout
      px(ctx, x - 1, y - 5, 3, 2, c(dark))
      // spear (held forward when windup/attack)
      const sp = state === 'attack' ? 4 : state === 'windup' ? -2 : 0
      px(ctx, x + 4 + sp, y - 6, 2, 14, c('#6e4a30'))
      px(ctx, x + 3 + sp, y - 10, 4, 4, c('#cfd8dc'))
      break
    }
    case 'drake': {
      // Dragonar: drako vermelho com asas, cavaleiro montado
      const flap = Math.sin(animTime * 5) * 3
      const s = scale
      // wings (behind, flapping)
      ctx.fillStyle = c(shade(color, -0.3))
      ctx.beginPath()
      ctx.moveTo(x - 6 * s, y - 8 * s)
      ctx.lineTo(x - 20 * s, y - 16 * s - flap)
      ctx.lineTo(x - 16 * s, y - 2 * s)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(x + 6 * s, y - 8 * s)
      ctx.lineTo(x + 20 * s, y - 16 * s - flap)
      ctx.lineTo(x + 16 * s, y - 2 * s)
      ctx.fill()
      // body
      px(ctx, x - 8 * s, y - 4 * s, 16 * s, 14 * s, c(color))
      px(ctx, x - 8 * s, y - 4 * s, 16 * s, 3 * s, c(light)) // belly highlight
      // tail
      px(ctx, x - 14 * s, y + 2 * s, 8 * s, 3 * s, c(color))
      px(ctx, x - 18 * s, y + 4 * s, 4 * s, 2 * s, c('#f1c40f')) // tail tip
      // legs
      px(ctx, x - 6 * s, y + 8 * s, 4 * s, 6 * s, c(dark))
      px(ctx, x + 2 * s, y + 8 * s, 4 * s, 6 * s, c(dark))
      // head
      px(ctx, x - 4 * s, y - 14 * s, 10 * s, 8 * s, c(color))
      // horns
      px(ctx, x - 5 * s, y - 18 * s, 2 * s, 4 * s, c('#3a1a1a'))
      px(ctx, x + 3 * s, y - 18 * s, 2 * s, 4 * s, c('#3a1a1a'))
      // eye
      px(ctx, x - 1 * s, y - 11 * s, 2 * s, 2 * s, '#f1c40f')
      // mouth/jaw with fire when windup
      px(ctx, x - 3 * s, y - 7 * s, 8 * s, 2 * s, c('#3a1a1a'))
      if (state === 'windup' || state === 'attack') {
        ctx.fillStyle = '#e67e22'
        ctx.beginPath()
        ctx.arc(x + 6 * s, y - 6 * s, 4 * s, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#f1c40f'
        ctx.beginPath()
        ctx.arc(x + 6 * s, y - 6 * s, 2 * s, 0, Math.PI * 2)
        ctx.fill()
      }
      // rider (small knight on back)
      px(ctx, x - 2 * s, y - 12 * s, 5 * s, 6 * s, c('#4a4a55'))
      break
    }
    case 'vampire': {
      // Vampiro: capa vermelha, pálido, olhos vermelhos, presas
      const float = Math.sin(animTime * 4) * 1.5
      // cape (flowing)
      px(ctx, x - 8, y - 8 + float, 16, 18, c(color))
      px(ctx, x - 9, y + 4 + float, 5, 8, c(shade(color, -0.3)))
      px(ctx, x + 4, y + 4 + float, 5, 8, c(shade(color, -0.3)))
      // body (pale)
      px(ctx, x - 4, y - 4 + float, 8, 10, c('#dfe6e9'))
      // collar
      px(ctx, x - 6, y - 8 + float, 12, 3, c(color))
      // head (pale)
      px(ctx, x - 4, y - 14 + float, 8, 8, c('#ecf0f1'))
      // hair (black slicked)
      px(ctx, x - 5, y - 15 + float, 10, 4, c('#1a1a1a'))
      // glowing red eyes
      px(ctx, x - 3, y - 10 + float, 2, 2, '#e74c3c')
      px(ctx, x + 1, y - 10 + float, 2, 2, '#e74c3c')
      // fangs
      px(ctx, x - 1, y - 5 + float, 1, 2, '#fff')
      px(ctx, x + 1, y - 5 + float, 1, 2, '#fff')
      // clawed hands
      px(ctx, x - 7, y - 1 + float, 3, 5, c('#ecf0f1'))
      px(ctx, x + 4, y - 1 + float, 3, 5, c('#ecf0f1'))
      break
    }
    case 'lizard_bard': {
      // Lagarto Bardo: azul-esverdeado, com pequena flauta/lira, barriga clara
      const stp = Math.sin(animTime * 7)
      // legs
      px(ctx, x - 4, y + 6 + (stp > 0 ? 0 : 1), 3, 6, c(dark))
      px(ctx, x + 1, y + 6 + (stp < 0 ? 0 : 1), 3, 6, c(dark))
      // body
      px(ctx, x - 5, y - 3, 10, 10, c(color))
      px(ctx, x - 5, y + 2, 10, 4, c('#aed6f1')) // belly
      // arms
      px(ctx, x - 8, y - 1, 3, 6, c(color))
      px(ctx, x + 5, y - 1, 3, 6, c(color))
      // head
      px(ctx, x - 5, y - 13, 10, 9, c(color))
      // snout
      px(ctx, x - 3, y - 7, 6, 3, c(color))
      // eye
      px(ctx, x - 3, y - 10, 2, 2, '#f1c40f')
      px(ctx, x + 1, y - 10, 2, 2, '#f1c40f')
      // crest/spikes on head
      px(ctx, x - 1, y - 15, 2, 2, c(dark))
      // tail
      px(ctx, x + 4, y + 4, 6, 2, c(color))
      // lute/instrument
      px(ctx, x - 9, y, 4, 6, c('#6e4a30'))
      px(ctx, x - 10, y - 2, 2, 2, c('#f1c40f'))
      // musical notes when idle/patrol
      if (state === 'idle' || state === 'patrol') {
        ctx.fillStyle = '#fff3a0'
        ctx.font = 'bold 8px monospace'
        ctx.fillText('♪', x + 8, y - 8 + Math.sin(animTime * 3) * 2)
      }
      break
    }
    case 'bear_boss': {
      // Boss Urso: enorme, marrom, garras, focinho
      const s = scale
      const stp = Math.sin(animTime * 4)
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.beginPath()
      ctx.ellipse(x, y + 24 * s, 26 * s, 7 * s, 0, 0, Math.PI * 2)
      ctx.fill()
      // legs (massive)
      px(ctx, x - 14 * s, y + 12 * s + (stp > 0 ? 0 : 2), 8 * s, 14 * s, c(dark))
      px(ctx, x + 6 * s, y + 12 * s + (stp < 0 ? 0 : 2), 8 * s, 14 * s, c(dark))
      // claws on feet
      px(ctx, x - 14 * s, y + 24 * s, 2 * s, 2 * s, '#fff')
      px(ctx, x - 10 * s, y + 24 * s, 2 * s, 2 * s, '#fff')
      px(ctx, x + 6 * s, y + 24 * s, 2 * s, 2 * s, '#fff')
      px(ctx, x + 10 * s, y + 24 * s, 2 * s, 2 * s, '#fff')
      // body (huge, furry)
      px(ctx, x - 16 * s, y - 10 * s, 32 * s, 24 * s, c(color))
      px(ctx, x - 16 * s, y - 10 * s, 32 * s, 4 * s, c(light)) // back highlight
      px(ctx, x - 10 * s, y + 6 * s, 20 * s, 6 * s, c(dark)) // belly shadow
      // head (big snout)
      px(ctx, x - 12 * s, y - 26 * s, 24 * s, 18 * s, c(color))
      // ears (round)
      px(ctx, x - 13 * s, y - 30 * s, 5 * s, 5 * s, c(color))
      px(ctx, x + 8 * s, y - 30 * s, 5 * s, 5 * s, c(color))
      px(ctx, x - 12 * s, y - 29 * s, 3 * s, 3 * s, c(dark))
      px(ctx, x + 9 * s, y - 29 * s, 3 * s, 3 * s, c(dark))
      // snout
      px(ctx, x - 6 * s, y - 18 * s, 12 * s, 8 * s, c(light))
      // nose
      px(ctx, x - 2 * s, y - 18 * s, 4 * s, 3 * s, '#1a1a1a')
      // eyes (fierce, glowing)
      px(ctx, x - 6 * s, y - 24 * s, 3 * s, 2 * s, '#f1c40f')
      px(ctx, x + 3 * s, y - 24 * s, 3 * s, 2 * s, '#f1c40f')
      // claws on paws (raised when windup)
      const cw = state === 'windup' || state === 'attack' ? -8 * s : 0
      px(ctx, x - 22 * s, y - 4 * s + cw, 6 * s, 8 * s, c(dark))
      px(ctx, x + 16 * s, y - 4 * s + cw, 6 * s, 8 * s, c(dark))
      px(ctx, x - 24 * s, y + 4 * s + cw, 2 * s, 3 * s, '#fff') // claw
      px(ctx, x - 21 * s, y + 4 * s + cw, 2 * s, 3 * s, '#fff')
      px(ctx, x + 17 * s, y + 4 * s + cw, 2 * s, 3 * s, '#fff')
      px(ctx, x + 20 * s, y + 4 * s + cw, 2 * s, 3 * s, '#fff')
      break
    }
  }
}

// ---------------------------------------------------------------------------
// PROJECTILES
// ---------------------------------------------------------------------------
export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  kind: string,
  x: number,
  y: number,
  angle: number
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  switch (kind) {
    case 'arrow':
      px(ctx, -8, -1, 12, 2, '#6e4a30')
      px(ctx, 4, -2, 4, 4, '#cfd8dc')
      px(ctx, -8, -2, 3, 4, '#e8eef0')
      break
    case 'bolt':
      px(ctx, -6, -1, 10, 2, '#9b59b6')
      px(ctx, 4, -2, 4, 4, '#e0aef0')
      break
    case 'fire':
      ctx.fillStyle = '#e67e22'
      ctx.beginPath()
      ctx.arc(0, 0, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f1c40f'
      ctx.beginPath()
      ctx.arc(0, 0, 3, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'frost':
      ctx.fillStyle = '#74b9ff'
      ctx.beginPath()
      ctx.arc(0, 0, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#dfe6e9'
      ctx.beginPath()
      ctx.arc(0, 0, 2, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'fireball':
      ctx.fillStyle = '#c0392b'
      ctx.beginPath()
      ctx.arc(0, 0, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#e67e22'
      ctx.beginPath()
      ctx.arc(0, 0, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f1c40f'
      ctx.beginPath()
      ctx.arc(0, 0, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff3a0'
      ctx.beginPath()
      ctx.arc(0, 0, 1.5, 0, Math.PI * 2)
      ctx.fill()
      break
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// SPECIAL STRUCTURES — chapel (paladin) & tower (mage)
// ---------------------------------------------------------------------------
export function drawSpecialStructure(
  ctx: CanvasRenderingContext2D,
  type: 'chapel' | 'tower',
  x: number,
  y: number,
  t: number,
  used: boolean
) {
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(x, y + 14, 18, 5, 0, 0, Math.PI * 2)
  ctx.fill()

  if (type === 'chapel') {
    // small stone chapel with a cross and glowing altar
    // base
    px(ctx, x - 14, y - 4, 28, 18, '#6e5230')
    px(ctx, x - 14, y - 4, 28, 2, '#8a6a40')
    px(ctx, x - 14, y + 12, 28, 2, '#4a3826')
    // roof (pointed)
    px(ctx, x - 16, y - 14, 32, 4, '#3a2d1a')
    px(ctx, x - 12, y - 18, 24, 4, '#3a2d1a')
    // door
    px(ctx, x - 4, y + 2, 8, 12, '#2a1a0a')
    px(ctx, x - 3, y + 3, 6, 10, '#4a3018')
    // cross on top
    px(ctx, x - 1, y - 28, 2, 10, '#f1c40f')
    px(ctx, x - 4, y - 24, 8, 2, '#f1c40f')
    // stained glass glow (if not used yet — beckons)
    if (!used) {
      const glow = 0.4 + Math.sin(t * 2) * 0.2
      ctx.fillStyle = `rgba(241,196,15,${glow})`
      ctx.beginPath()
      ctx.arc(x, y + 2, 16, 0, Math.PI * 2)
      ctx.fill()
      // halo on cross
      ctx.fillStyle = `rgba(255,243,160,${glow})`
      ctx.beginPath()
      ctx.arc(x, y - 22, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  } else {
    // wizard tower: tall, dark, with glowing crystal apex (only visible at night)
    // base
    px(ctx, x - 10, y - 4, 20, 18, '#3a2d4a')
    px(ctx, x - 10, y - 4, 20, 2, '#4a3d5a')
    // tower shaft (tall)
    px(ctx, x - 8, y - 30, 16, 28, '#2a1d3a')
    px(ctx, x - 8, y - 30, 16, 2, '#3a2d4a')
    // window slits
    px(ctx, x - 6, y - 22, 3, 4, '#9b59b6')
    px(ctx, x + 3, y - 22, 3, 4, '#9b59b6')
    px(ctx, x - 6, y - 14, 3, 4, '#9b59b6')
    px(ctx, x + 3, y - 14, 3, 4, '#9b59b6')
    // conical roof
    px(ctx, x - 10, y - 36, 20, 6, '#1a0d2a')
    px(ctx, x - 6, y - 40, 12, 4, '#1a0d2a')
    // glowing crystal on top
    const glow = 0.5 + Math.sin(t * 3) * 0.3
    ctx.fillStyle = `rgba(155,89,182,${glow})`
    ctx.beginPath()
    ctx.arc(x, y - 42, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e0aef0'
    px(ctx, x - 2, y - 44, 4, 4, '#e0aef0')
    px(ctx, x - 1, y - 45, 2, 2, '#fff')
    if (!used) {
      // swirling arcane particles beckoning
      ctx.fillStyle = `rgba(192,132,252,${glow * 0.5})`
      ctx.beginPath()
      ctx.arc(x, y - 42, 20, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ---------------------------------------------------------------------------
// DROPPED ITEMS (world) + INVENTORY ICONS
// ---------------------------------------------------------------------------
export function drawItemIcon(ctx: CanvasRenderingContext2D, sprite: string, x: number, y: number, size: number) {
  const s = size / 16 // scale factor (sprite is 16x16 base)
  const P = (ix: number, iy: number, iw: number, ih: number, col: string) =>
    px(ctx, x + ix * s, y + iy * s, iw * s, ih * s, col)
  switch (sprite) {
    case 'wpn_sword':
      P(7, 1, 2, 12, '#b0a890'); P(7, 13, 4, 2, '#6e4a30'); P(7, 15, 2, 1, '#3a3a44'); break
    case 'wpn_sword2':
      P(7, 1, 2, 12, '#cfd8dc'); P(6, 13, 4, 2, '#8a6a2a'); P(7, 15, 2, 1, '#3a3a44'); break
    case 'wpn_legend':
      P(7, 1, 2, 12, '#f4d870'); P(6, 13, 4, 2, '#8a6a2a'); P(7, 0, 2, 1, '#fff3a0'); P(6, 7, 4, 1, '#fff3a0'); break
    case 'wpn_axe':
      P(7, 1, 2, 14, '#6e4a30'); P(9, 3, 4, 8, '#cfd8dc'); P(9, 4, 3, 2, '#fff'); break
    case 'wpn_dagger':
      P(7, 3, 2, 9, '#cfd8dc'); P(6, 12, 4, 1, '#3a3a44'); P(7, 13, 2, 2, '#6e4a30'); break
    case 'wpn_staff':
      P(7, 1, 2, 14, '#6e4a30'); P(5, 1, 6, 5, '#9b59b6'); P(6, 2, 4, 2, '#e0aef0'); break
    case 'wpn_bow':
      P(4, 1, 2, 14, '#6e4a30'); P(6, 2, 1, 12, '#3a3a44'); P(6, 8, 6, 1, '#cfd8dc'); break
    case 'tool_hoe':
      P(7, 1, 2, 13, '#6e4a30'); P(4, 1, 6, 2, '#9d9da5'); break
    case 'tool_axe':
      P(7, 1, 2, 14, '#6e4a30'); P(9, 1, 4, 6, '#9d9da5'); break
    case 'tool_pick':
      P(7, 2, 2, 13, '#6e4a30'); P(3, 1, 10, 2, '#9d9da5'); break
    case 'it_berry':
      P(6, 7, 4, 4, '#e74c3c'); P(7, 6, 2, 2, '#fff3a0'); P(5, 5, 2, 2, '#27ae60'); break
    case 'it_bread':
      P(3, 6, 10, 6, '#d4a356'); P(3, 5, 10, 2, '#e8c074'); P(5, 7, 1, 1, '#8a6a2a'); P(9, 9, 1, 1, '#8a6a2a'); break
    case 'it_meat':
      P(4, 5, 8, 8, '#9b4a3a'); P(4, 4, 8, 2, '#c0614a'); P(6, 7, 2, 2, '#fff3a0'); P(3, 10, 2, 3, '#f4f4f4'); break
    case 'it_stew':
      P(4, 6, 8, 7, '#6e4a30'); P(5, 5, 6, 2, '#9b4a3a'); P(6, 8, 2, 2, '#e74c3c'); P(9, 9, 2, 2, '#27ae60'); break
    case 'it_rawmeat':
      P(4, 6, 8, 6, '#c0614a'); P(4, 5, 8, 2, '#d97a5a'); break
    case 'it_water':
      P(5, 3, 6, 11, '#4a8fc4'); P(5, 3, 6, 2, '#3f7fb4'); P(5, 5, 6, 6, '#6fa9d8'); break
    case 'it_hppot':
      P(5, 3, 6, 11, '#c0392b'); P(5, 2, 6, 2, '#8a2a20'); P(4, 13, 8, 1, '#e8eef0'); break
    case 'it_mppot':
      P(5, 3, 6, 11, '#8e44ad'); P(5, 2, 6, 2, '#5a2a70'); P(4, 13, 8, 1, '#e8eef0'); break
    case 'it_antidote':
      P(5, 3, 6, 11, '#27ae60'); P(5, 2, 6, 2, '#1a7040'); P(4, 13, 8, 1, '#e8eef0'); break
    case 'it_wood':
      P(3, 6, 10, 4, '#6e4a30'); P(3, 6, 10, 1, '#8a6a40'); P(3, 9, 10, 1, '#5a3d28'); P(2, 7, 1, 2, '#3a2818'); P(13, 7, 1, 2, '#3a2818'); break
    case 'it_stone':
      P(4, 6, 8, 7, '#8a8a92'); P(5, 5, 6, 2, '#9d9da5'); P(6, 9, 3, 3, '#6e6e76'); break
    case 'it_fiber':
      P(4, 5, 3, 8, '#a89060'); P(8, 6, 3, 7, '#a89060'); P(6, 7, 2, 5, '#c0a878'); break
    case 'it_herb':
      P(7, 4, 2, 9, '#3f8a2a'); P(4, 6, 3, 3, '#5e9636'); P(9, 7, 3, 3, '#5e9636'); P(6, 4, 4, 2, '#d6e8a0'); break
    case 'it_iron':
      P(4, 6, 8, 7, '#8a8a92'); P(6, 7, 3, 2, '#c08a5a'); P(9, 10, 2, 2, '#c08a5a'); break
    case 'it_coal':
      P(4, 6, 8, 7, '#3a3a3a'); P(6, 7, 3, 2, '#1a1a1a'); P(9, 10, 2, 2, '#1a1a1a'); break
    case 'it_ironbar':
      P(3, 7, 10, 3, '#cfd8dc'); P(3, 7, 10, 1, '#e8eef0'); P(3, 9, 10, 1, '#9aa6ab'); break
    case 'it_hide':
      P(4, 5, 8, 8, '#8a5a3a'); P(4, 5, 8, 1, '#a86a4a'); P(5, 7, 2, 2, '#6a4a2a'); P(9, 9, 2, 2, '#6a4a2a'); break
    case 'it_bone':
      P(4, 7, 8, 2, '#f4f8f9'); P(3, 6, 2, 4, '#f4f8f9'); P(11, 6, 2, 4, '#f4f8f9'); break
    case 'it_essence':
      ctx.fillStyle = '#9b59b6'; ctx.beginPath(); ctx.arc(x + 8 * s, y + 8 * s, 6 * s, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#e0aef0'; ctx.beginPath(); ctx.arc(x + 8 * s, y + 8 * s, 3 * s, 0, Math.PI * 2); ctx.fill()
      break
    case 'it_seed':
      P(6, 7, 4, 4, '#9b7b3a'); P(7, 6, 2, 1, '#f4d870'); P(5, 8, 1, 1, '#6e4a30'); break
    case 'it_torch':
      P(7, 6, 2, 9, '#6e4a30'); P(5, 2, 6, 5, '#f1c40f'); P(6, 0, 4, 3, '#e67e22'); P(7, 4, 2, 1, '#fff3a0'); break
    case 'it_arrow':
      P(2, 7, 9, 2, '#6e4a30'); P(11, 5, 4, 6, '#cfd8dc'); P(11, 7, 4, 1, '#fff'); P(1, 6, 3, 4, '#e8eef0'); break
    case 'it_crown':
      P(4, 8, 8, 5, '#f1c40f'); P(4, 6, 2, 3, '#f1c40f'); P(7, 5, 2, 4, '#f1c40f'); P(10, 6, 2, 3, '#f1c40f'); P(6, 10, 1, 1, '#e74c3c'); P(9, 10, 1, 1, '#3498db'); break
    default:
      P(4, 4, 8, 8, '#888')
  }
}

// world-space dropped item (slightly bigger + bob)
export function drawDroppedItem(ctx: CanvasRenderingContext2D, sprite: string, x: number, y: number, bob: number) {
  drawItemIcon(ctx, sprite, x - 10, y - 10 + bob, 20)
}

// ---------------------------------------------------------------------------
// CRAFTING STATIONS
// ---------------------------------------------------------------------------
export function drawStation(ctx: CanvasRenderingContext2D, type: 'campfire' | 'workbench', x: number, y: number, t: number) {
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(x, y + 12, 14, 4, 0, 0, Math.PI * 2)
  ctx.fill()
  if (type === 'campfire') {
    px(ctx, x - 12, y + 4, 24, 4, '#3a2818')
    px(ctx, x - 10, y + 2, 4, 4, '#6e4a30')
    px(ctx, x + 6, y + 2, 4, 4, '#6e4a30')
    // logs
    px(ctx, x - 8, y + 6, 16, 3, '#5a3d28')
    // flame (animated)
    const f = Math.sin(t * 12) * 1.5
    px(ctx, x - 4, y - 6 + f, 8, 8, '#e67e22')
    px(ctx, x - 2, y - 9 + f, 4, 6, '#f1c40f')
    px(ctx, x - 1, y - 11 + f, 2, 3, '#fff3a0')
    // glow
    ctx.fillStyle = 'rgba(241,196,15,0.15)'
    ctx.beginPath()
    ctx.arc(x, y, 36, 0, Math.PI * 2)
    ctx.fill()
  } else {
    px(ctx, x - 14, y + 4, 28, 6, '#6e4a30')
    px(ctx, x - 14, y + 4, 28, 2, '#8a6a40')
    px(ctx, x - 12, y - 2, 24, 6, '#5a3d28')
    // legs
    px(ctx, x - 12, y + 10, 3, 4, '#4a3019')
    px(ctx, x + 9, y + 10, 3, 4, '#4a3019')
    // tool on top
    px(ctx, x - 4, y - 4, 8, 2, '#9d9da5')
    px(ctx, x + 2, y - 6, 2, 2, '#6e4a30')
  }
}

// ---------------------------------------------------------------------------
// PORTAL
// ---------------------------------------------------------------------------
export function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, label: string) {
  const cx = x + w / 2
  // glow
  ctx.fillStyle = 'rgba(155,89,182,0.25)'
  ctx.beginPath()
  ctx.ellipse(cx, y, w * 0.8, h, 0, 0, Math.PI * 2)
  ctx.fill()
  // arch
  px(ctx, cx - 3, y - h, 6, h, '#2d2d38')
  px(ctx, cx - 16, y - h, 4, 6, '#6e4a30')
  px(ctx, cx + 12, y - h, 4, 6, '#6e4a30')
  // swirling
  const o = Math.sin(t * 3) * 3
  px(ctx, cx - 10 + o, y - h + 8, 20, h - 14, '#6c5ce7')
  px(ctx, cx - 7 - o, y - h + 12, 14, h - 22, '#9b59b6')
  px(ctx, cx - 4 + o, y - h + 16, 8, h - 30, '#e0aef0')
}
