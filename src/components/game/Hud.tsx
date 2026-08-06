'use client'

import type { HudSnapshot } from '@/lib/game/types'
import { CLASSES } from '@/lib/game/data'
import { ItemIcon, spriteFor } from './ItemIcon'

interface Props {
  s: HudSnapshot
  onUseItem: (i: number) => void
  onToggleMusic: () => void
}

function Bar({ value, max, color, label, h = 14 }: { value: number; max: number; color: string; label?: string; h?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className="pix-bar relative" style={{ height: h }}>
      <div
        className="h-full transition-all duration-150"
        style={{ width: `${pct}%`, background: `linear-gradient(180deg, ${color}, ${color}aa)`, boxShadow: `inset 0 1px 0 ${color}` }}
      />
      {label && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white text-glow tracking-wider">
          {label}
        </div>
      )}
    </div>
  )
}

export function Hud({ s, onUseItem, onToggleMusic }: Props) {
  const cls = CLASSES[s.cls]
  const timeLabel = timeStr(s.timeOfDay)
  const hotbar = s.inventory.slice(0, 6)

  return (
    <div className="absolute inset-0 pointer-events-none select-none" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
      {/* Top-left: vitals */}
      <div className="absolute top-3 left-3 w-64 sm:w-72 space-y-1">
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-sm flex items-center justify-center text-[10px] font-bold border-2"
            style={{ background: cls.color, borderColor: cls.accent, color: '#fff', boxShadow: '0 0 0 1px #000' }}
          >
            {s.level}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-[9px] w-6 text-red-400">HP</span>
              <div className="flex-1"><Bar value={s.hp} max={s.maxHp} color="#e74c3c" h={10} /></div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] w-6 text-amber-300">STA</span>
              <div className="flex-1"><Bar value={s.stamina} max={s.maxStamina} color="#f1c40f" h={7} /></div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] w-6 text-purple-300">MP</span>
              <div className="flex-1"><Bar value={s.mana} max={s.maxMana} color="#9b59b6" h={7} /></div>
            </div>
          </div>
        </div>
        {/* survival */}
        <div className="flex gap-1.5 mt-1">
          <Survival icon="🍖" label="Fome" value={s.hunger} color="#e67e22" warn={s.hunger < 30} />
          <Survival icon="💧" label="Sede" value={s.thirst} color="#3f7fb4" warn={s.thirst < 20} />
        </div>
        {/* XP */}
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-amber-100/50 w-6">XP</span>
          <div className="flex-1"><Bar value={s.xp} max={s.xpNext} color="#9b59b6" h={4} /></div>
        </div>
      </div>

      {/* Top-right: zone + time + gold */}
      <div className="absolute top-3 right-3 text-right space-y-1">
        <div className="pix-panel px-3 py-1.5 inline-block">
          <div className="text-[11px] font-bold text-amber-300 tracking-wider text-glow">{s.zoneName}</div>
          <div className="text-[9px] text-amber-100/50 flex items-center justify-end gap-1">
            <span>{timeLabel}</span>
            <span>{s.isNight ? '🌙' : '☀️'}</span>
          </div>
        </div>
        <div className="pix-panel px-3 py-1 inline-flex items-center gap-1.5">
          <ItemIcon sprite="it_crown" size={16} />
          <span className="text-sm font-bold text-amber-300">{s.gold}</span>
        </div>
        <div className="text-[10px] text-amber-100/40">
          Abates: <span className="text-amber-200">{s.kills}</span> · Mortes: <span className="text-red-300">{s.deaths}</span>
        </div>
      </div>

      {/* Kill feed */}
      {s.killFeed.length > 0 && (
        <div className="absolute top-28 right-3 space-y-1 text-right">
          {s.killFeed.map((k) => (
            <div key={k.id} className="pix-panel px-2 py-0.5 text-[10px] text-amber-200/80 anim-in">
              ☠ {k.text}
            </div>
          ))}
        </div>
      )}

      {/* Boss bar */}
      {s.bossHp !== null && s.bossName && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[80%] max-w-xl">
          <div className="text-center text-xs font-bold text-red-400 text-glow tracking-widest mb-1 pulse-red inline-block px-3 py-0.5 pix-panel">
            ⚔ {s.bossName}
          </div>
          <div className="pix-bar h-4 border-red-900" style={{ borderColor: '#7a1a1a' }}>
            <div
              className="h-full transition-all duration-200"
              style={{ width: `${(s.bossHp || 0) * 100}%`, background: 'linear-gradient(180deg,#e74c3c,#7a1a1a)' }}
            />
          </div>
        </div>
      )}

      {/* Combo counter */}
      {s.comboCount > 1 && (
        <div
          className="absolute top-28 left-1/2 -translate-x-1/2 anim-in pointer-events-none"
          key={s.comboCount}
        >
          <div
            className="pix-panel px-3 py-1 text-center"
            style={{ borderColor: s.comboCount >= 4 ? '#e67e22' : '#6e5230' }}
          >
            <span
              className="text-2xl font-black text-glow"
              style={{ color: s.comboCount >= 4 ? '#e67e22' : '#f1c40f', fontSize: 14 + s.comboCount * 2 }}
            >
              {s.comboCount}
            </span>
            <span className="text-[9px] text-amber-200/70 ml-1 tracking-widest">COMBO</span>
          </div>
        </div>
      )}

      {/* Parry-ready indicator */}
      {s.parryReady && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-12 pointer-events-none">
          <div className="pix-panel px-2 py-0.5 text-[10px] text-amber-300 font-bold tracking-widest pulse-red anim-in">
            ◈ PARRY ◈
          </div>
        </div>
      )}

      {/* Music toggle */}
      <button
        onClick={onToggleMusic}
        className="absolute bottom-3 left-1/2 -translate-x-1/2 pix-btn px-3 py-1 text-[10px] pointer-events-auto"
        title="Ligar/desligar música"
      >
        {s.musicEnabled ? '♪ Música ON' : '♪ Música OFF'} · {s.musicMood === 'combat' ? '⚔' : s.musicMood === 'dungeon' ? '🕯' : '🌲'}
      </button>

      {/* Toast */}
      {s.toast && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 anim-in">
          <div
            className="pix-panel px-5 py-2 text-sm font-bold tracking-wide"
            style={{
              color: s.toast.kind === 'good' ? '#7cb342' : s.toast.kind === 'bad' ? '#e74c3c' : '#f1c870',
            }}
          >
            {s.toast.text}
          </div>
        </div>
      )}

      {/* Bottom-left: hotbar */}
      <div className="absolute bottom-3 left-3 flex gap-1.5 pointer-events-auto">
        {hotbar.map((stack, i) => (
          <button
            key={i}
            onClick={() => onUseItem(i)}
            className={`pix-slot w-11 h-11 flex flex-col items-center justify-center relative hover:border-amber-400 transition-colors ${s.equipped === stack.id ? 'equipped' : ''}`}
            title="Clique para usar"
          >
            <ItemIcon sprite={spriteFor(stack.id)} size={26} />
            {stack.qty > 1 && (
              <span className="absolute bottom-0 right-0.5 text-[9px] font-bold text-amber-200 text-glow">
                {stack.qty}
              </span>
            )}
            <span className="absolute top-0 left-0.5 text-[8px] text-amber-100/40">{i + 1}</span>
          </button>
        ))}
        {Array.from({ length: Math.max(0, 6 - hotbar.length) }).map((_, i) => (
          <div key={`empty-${i}`} className="pix-slot w-11 h-11 opacity-40" />
        ))}
      </div>

      {/* Bottom-right: controls hint */}
      <div className="absolute bottom-3 right-3 pix-panel px-3 py-2 text-[9px] text-amber-100/60 leading-relaxed hidden sm:block">
        <div><span className="text-amber-300">WASD</span> mover · <span className="text-amber-300">J/Click</span> golpe</div>
        <div><span className="text-amber-300">K/Dir(segure)</span> pesado/carregar · <span className="text-amber-300">Espaço</span> esquiva</div>
        <div><span className="text-amber-300">Shift</span> bloquear/parry · <span className="text-amber-300">Tab</span> mirar</div>
        <div><span className="text-amber-300">E</span> interagir · <span className="text-amber-300">I</span> inventário · <span className="text-amber-300">C</span> criar</div>
      </div>

      {/* Station / portal hint */}
      {s.nearStation && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 pix-panel px-3 py-1 text-[11px] text-amber-300 anim-in">
          ⚒ {s.nearStation === 'campfire' ? 'Fogueira' : 'Bancada'} — pressione <span className="text-amber-100 font-bold">C</span> para criar
        </div>
      )}
    </div>
  )
}

function Survival({ icon, label, value, color, warn }: { icon: string; label: string; value: number; color: string; warn: boolean }) {
  return (
    <div className={`flex-1 pix-slot px-1.5 py-0.5 ${warn ? 'pulse-red' : ''}`}>
      <div className="flex items-center gap-1">
        <span className="text-[10px]">{icon}</span>
        <span className="text-[8px] text-amber-100/50">{label}</span>
        <span className="text-[8px] font-bold ml-auto" style={{ color: warn ? '#e74c3c' : '#e8d8b0' }}>{Math.round(value)}</span>
      </div>
      <div className="pix-bar mt-0.5" style={{ height: 3 }}>
        <div className="h-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}

function timeStr(t: number): string {
  // 0=midnight; map to 24h
  const hours = (t * 24 + 6) % 24 // start at 6am-ish
  const h = Math.floor(hours)
  const m = Math.floor((hours - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
