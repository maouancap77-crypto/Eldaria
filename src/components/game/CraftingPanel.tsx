'use client'

import type { HudSnapshot } from '@/lib/game/types'
import { RECIPES, ITEMS } from '@/lib/game/data'
import { ItemIcon, spriteFor } from './ItemIcon'

interface Props {
  s: HudSnapshot
  onCraft: (id: string) => void
  onClose: () => void
}

const stationName: Record<string, string> = {
  campfire: '🔥 Fogueira',
  workbench: '⚒ Bancada',
  none: '✋ Mãos',
}

export function CraftingPanel({ s, onCraft, onClose }: Props) {
  // recipes available at current station (or none)
  const available = RECIPES.filter((r) => r.station === s.nearStation || (s.nearStation === null && r.station === 'none'))

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 pointer-events-auto" onClick={onClose}>
      <div
        className="pix-panel w-[92%] max-w-2xl max-h-[88vh] flex flex-col anim-in"
        onClick={(e) => e.stopPropagation()}
        style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-amber-900/40">
          <h2 className="text-sm font-bold text-amber-300 tracking-widest">⚒ CRIAÇÃO</h2>
          <div className="text-[10px] text-amber-100/60">
            {s.nearStation ? stationName[s.nearStation] : 'Sem estação'}
          </div>
          <button className="pix-btn px-3 py-1 text-[10px]" onClick={onClose}>ESC</button>
        </div>

        <div className="flex-1 overflow-y-auto eldoria-scroll p-3 space-y-1.5">
          {available.length === 0 ? (
            <div className="text-center text-amber-100/40 text-xs py-12">
              Aproxime-se de uma <span className="text-amber-300">Fogueira</span> ou <span className="text-amber-300">Bancada</span> e pressione C.
            </div>
          ) : (
            available.map((r) => {
              const out = ITEMS[r.output.id]
              const canMake = r.inputs.every((inp) => s.inventory.some((st) => st.id === inp.id && st.qty >= inp.qty))
              const skillOk = !r.craftLevel || s.craftLevels[r.craftLevel.skill] >= r.craftLevel.level
              const ok = canMake && skillOk
              return (
                <div
                  key={r.id}
                  className={`pix-slot p-2 flex items-center gap-3 ${ok ? '' : 'opacity-60'}`}
                >
                  <div className="pix-slot w-11 h-11 flex items-center justify-center shrink-0">
                    <ItemIcon sprite={out?.sprite || 'it_wood'} size={30} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-200">{r.name}</span>
                      {r.output.qty > 1 && <span className="text-[9px] text-amber-100/50">×{r.output.qty}</span>}
                      {r.craftLevel && (
                        <span className={`text-[8px] px-1 ${skillOk ? 'text-green-400' : 'text-red-400'}`}>
                          {r.craftLevel.skill} nv{r.craftLevel.level}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {r.inputs.map((inp, i) => {
                        const have = s.inventory.filter((st) => st.id === inp.id).reduce((a, st) => a + st.qty, 0)
                        const enough = have >= inp.qty
                        return (
                          <span key={i} className={`text-[9px] flex items-center gap-0.5 ${enough ? 'text-amber-100/70' : 'text-red-400'}`}>
                            <ItemIcon sprite={spriteFor(inp.id)} size={12} />
                            {have}/{inp.qty}
                          </span>
                        )
                      })}
                      <span className="text-[9px] text-amber-100/30">→</span>
                      <span className="text-[9px] flex items-center gap-0.5 text-green-400">
                        <ItemIcon sprite={spriteFor(r.output.id)} size={12} /> ×{r.output.qty}
                      </span>
                    </div>
                  </div>
                  <button
                    disabled={!ok}
                    onClick={() => onCraft(r.id)}
                    className="pix-btn px-3 py-1.5 text-[10px] shrink-0"
                  >
                    Criar
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
