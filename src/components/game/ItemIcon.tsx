'use client'

import { useEffect, useRef } from 'react'
import { drawItemIcon } from '@/lib/game/sprites'

/** Map an item id to its pixel sprite key. */
export function spriteFor(id: string): string {
  const map: Record<string, string> = {
    berry: 'it_berry', bread: 'it_bread', cooked_meat: 'it_meat', raw_meat: 'it_rawmeat',
    stew: 'it_stew', water_bottle: 'it_water', hp_potion: 'it_hppot', mp_potion: 'it_mppot',
    antidote: 'it_antidote', wood: 'it_wood', stone: 'it_stone', fiber: 'it_fiber', herb: 'it_herb',
    iron_ore: 'it_iron', coal: 'it_coal', iron_bar: 'it_ironbar', hide: 'it_hide', bone: 'it_bone',
    essence: 'it_essence', seed_crop: 'it_seed', torch: 'it_torch', crown: 'it_crown',
    rusty_sword: 'wpn_sword', iron_sword: 'wpn_sword2', bone_axe: 'wpn_axe', staff: 'wpn_staff',
    bow: 'wpn_bow', dagger: 'wpn_dagger', legendary_blade: 'wpn_legend',
    hoe: 'tool_hoe', axe: 'tool_axe', pickaxe: 'tool_pick',
  }
  return map[id] || 'it_wood'
}

export function ItemIcon({ sprite, size = 36 }: { sprite: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    c.width = size * dpr
    c.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, size, size)
    drawItemIcon(ctx, sprite, 2, 2, size - 4)
  }, [sprite, size])
  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className="pointer-events-none"
    />
  )
}
