'use client'

import type { HudSnapshot } from '@/lib/game/types'
import { ITEMS } from '@/lib/game/data'
import { ItemIcon, spriteFor } from './ItemIcon'
import { useState } from 'react'

interface Props {
  s: HudSnapshot
  onUseItem: (i: number) => void
  onEquip: (i: number) => void
  onDrop: (i: number) => void
  onClose: () => void
}

const rarityColor: Record<string, string> = {
  common: '#e8d8b0',
  uncommon: '#27ae60',
  rare: '#3498db',
  epic: '#9b59b6',
  legendary: '#f1c40f',
}

export function InventoryPanel({ s, onUseItem, onEquip, onDrop, onClose }: Props) {
  const [sel, setSel] = useState(0)
  const stack = s.inventory[sel]
  const def = stack ? ITEMS[stack.id] : null

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 pointer-events-auto" onClick={onClose}>
      <div
        className="pix-panel w-[92%] max-w-3xl max-h-[88vh] flex flex-col anim-in"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-amber-900/40">
          <h2 className="text-sm font-bold text-amber-300 tracking-widest">⚒ INVENTÁRIO</h2>
          <div className="flex items-center gap-3 text-[10px] text-amber-100/60">
            <span>Equipado:</span>
            <span className="text-amber-200 font-bold">{def2name(s.equipped)}</span>
            <button className="pix-btn px-3 py-1 text-[10px]" onClick={onClose}>ESC</button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* grid */}
<div className="flex-1 p-3 overflow-y-auto eldoria-scroll">
            {/* Fixed 12-slot grid so the player always sees their capacity */}
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {Array.from({ length: 12 }).map((_, i) => {
                const st = s.inventory[i]
                const d = st ? ITEMS[st.id] : null
                const active = i === sel
                const equipped = st && s.equipped === st.id
                return (
                  <button
                    key={i}
                    onClick={() => st && setSel(i)}
                    className={`pix-slot aspect-square flex flex-col items-center justify-center relative ${st ? '' : 'opacity-30'} ${active ? 'ring-2 ring-amber-400' : ''} ${equipped ? 'equipped' : ''}`}
                    title={st ? (d?.name || '') : 'Slot vazio'}
                  >
                    {st && d ? (
                      <>
                        <ItemIcon sprite={d.sprite || 'it_wood'} size={30} />
                        {st.qty > 1 && (
                          <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-amber-200 text-glow">
                            {st.qty}
                          </span>
                        )}
                        {equipped && (
                          <span className="absolute top-0.5 left-1 text-[8px] text-amber-300">E</span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] text-amber-100/20">{i + 1}</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 text-[9px] text-amber-100/40 text-center">
              {s.inventory.length}/12 slots · A barra de acesso rápido (1–6) usa os primeiros itens
            </div>
          </div>

          {/* detail */}
          <div className="w-56 border-l border-amber-900/40 p-3 flex flex-col">
            {def && stack ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className="pix-slot w-12 h-12 flex items-center justify-center">
                    <ItemIcon sprite={def.sprite} size={36} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold leading-tight" style={{ color: rarityColor[def.rarity || 'common'] }}>
                      {def.name}
                    </div>
                    <div className="text-[9px] text-amber-100/50 uppercase tracking-wider">{def.category}</div>
                  </div>
                </div>
                <p className="text-[10px] text-amber-100/70 leading-relaxed mb-2">{def.desc}</p>
                <div className="text-[10px] space-y-0.5 mb-3">
                  {def.damage && <Row k="Dano" v={String(def.damage)} />}
                  {def.attackSpeed && <Row k="Vel. Atq" v={`${def.attackSpeed}/s`} />}
                  {def.hunger && <Row k="Fome" v={`+${def.hunger}`} c="#e67e22" />}
                  {def.thirst && <Row k="Sede" v={`+${def.thirst}`} c="#3f7fb4" />}
                  {def.heal && <Row k="HP" v={`${def.heal > 0 ? '+' : ''}${def.heal}`} c={def.heal > 0 ? '#e74c3c' : '#888'} />}
                  {def.mana && <Row k="Mana" v={`+${def.mana}`} c="#9b59b6" />}
                  {def.effectAmount && <Row k="Efeito" v={`+${def.effectAmount}`} />}
                  {def.tool && <Row k="Ferramenta" v={def.tool} />}
                </div>
                <div className="mt-auto space-y-1.5">
                  {(def.category === 'food' || def.category === 'drink' || def.category === 'potion') && (
                    <button className="pix-btn w-full py-1.5 text-[10px]" onClick={() => onUseItem(sel)}>
                      Usar
                    </button>
                  )}
                  {(def.category === 'weapon' || def.category === 'tool') && (
                    <button className="pix-btn w-full py-1.5 text-[10px]" onClick={() => onEquip(sel)}>
                      {s.equipped === stack.id ? 'Equipado' : 'Equipar'}
                    </button>
                  )}
                  {def.category === 'seed' && (
                    <div className="text-[9px] text-amber-100/50 text-center">Plante em terra arada (E)</div>
                  )}
                  <button className="pix-btn w-full py-1.5 text-[10px] !border-red-900 !text-red-300" onClick={() => { onDrop(sel); setSel(Math.max(0, sel - 1)) }}>
                    Descartar 1
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[10px] text-amber-100/40 text-center">
                Selecione um item
              </div>
            )}
          </div>
        </div>

        {/* craft skills footer */}
        <div className="px-4 py-2 border-t border-amber-900/40 flex items-center gap-4 text-[9px]">
          <span className="text-amber-100/40 uppercase tracking-wider">Ofícios:</span>
          {(Object.keys(s.craftLevels) as Array<keyof typeof s.craftLevels>).map((k) => (
            <span key={k} className="text-amber-100/70">
              {k === 'cooking' ? '🍳' : k === 'crafting' ? '⚒' : k === 'alchemy' ? '⚗' : '🔨'} {k} <b className="text-amber-300">nv{s.craftLevels[k]}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-amber-100/50">{k}</span>
      <span className="font-bold" style={{ color: c || '#e8d8b0' }}>{v}</span>
    </div>
  )
}

function def2name(id: string): string {
  return ITEMS[id]?.name || id
}
