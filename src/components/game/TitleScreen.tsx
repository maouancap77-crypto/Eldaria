'use client'

import { useState } from 'react'
import { CLASSES } from '@/lib/game/data'
import type { HeroClassId } from '@/lib/game/types'
import { ItemIcon, spriteFor } from './ItemIcon'

interface Props {
  hasSave: boolean
  onStart: (name: string, cls: HeroClassId) => void
  onContinue: () => void
  onDeleteSave: () => void
}

export function TitleScreen({ hasSave, onStart, onContinue, onDeleteSave }: Props) {
  const [view, setView] = useState<'menu' | 'class'>('menu')
  const [name, setName] = useState('')
  const [cls, setCls] = useState<HeroClassId>('warrior')

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center eldoria-root overflow-hidden">
      {/* background art */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: 'url(/game/title-art.png)',
          filter: 'brightness(0.55) saturate(1.1)',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0d0a14]/40 via-[#0d0a14]/30 to-[#0d0a14]" />
      {/* floating embers */}
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-amber-400/60"
          style={{
            width: 2 + (i % 3),
            height: 2 + (i % 3),
            left: `${(i * 53) % 100}%`,
            bottom: '-10px',
            animation: `floatUp ${6 + (i % 5)}s linear ${i * 0.4}s infinite`,
            opacity: 0.6,
          }}
        />
      ))}

      {view === 'menu' ? (
        <div className="relative z-10 flex flex-col items-center gap-8 anim-in">
          <div className="text-center">
            <h1
              className="text-5xl sm:text-7xl font-black tracking-wider title-glow"
              style={{ color: '#f1c40f', fontFamily: 'var(--font-geist-mono), monospace' }}
            >
              ELDORIA
            </h1>
            <h2
              className="text-2xl sm:text-4xl font-bold tracking-[0.4em] text-glow -mt-1"
              style={{ color: '#e8d8b0' }}
            >
              ONLINE
            </h2>
            <p className="mt-3 text-sm sm:text-base text-amber-200/80 tracking-widest uppercase">
              RPG · Sobrevivência · Souls-like
            </p>
          </div>

          <div className="flex flex-col gap-3 w-64">
            {hasSave && (
              <button className="pix-btn px-6 py-3 text-sm font-bold" onClick={onContinue}>
                ▶ Continuar Jornada
              </button>
            )}
            <button
              className="pix-btn px-6 py-3 text-sm font-bold"
              onClick={() => setView('class')}
            >
              ✦ Nova Aventura
            </button>
            {hasSave && (
              <button
                className="pix-btn px-4 py-2 text-xs"
                onClick={() => {
                  if (confirm('Apagar o save atual?')) onDeleteSave()
                }}
              >
                Apagar Save
              </button>
            )}
          </div>

          <div className="mt-2 max-w-md text-center text-[11px] text-amber-100/50 leading-relaxed">
            Você desperta em um mundo fragmentado pelo Grande Silêncio. Sem memória, sem aliados.
            Sobreviva à fome, à sede e à noite. Forje seu destino nas masmorras.
          </div>
        </div>
      ) : (
        <ClassSelect
          name={name}
          setName={setName}
          cls={cls}
          setCls={setCls}
          onBack={() => setView('menu')}
          onConfirm={() => onStart(name.trim() || 'Herói', cls)}
        />
      )}

      <div className="absolute bottom-3 text-[10px] text-amber-100/40 tracking-widest">
        v1.0 · WASD mover · J/K atacar · ESPAÇO esquiva · E interagir · I inventário
      </div>
    </div>
  )
}

function ClassSelect({
  name, setName, cls, setCls, onBack, onConfirm,
}: {
  name: string
  setName: (s: string) => void
  cls: HeroClassId
  setCls: (c: HeroClassId) => void
  onBack: () => void
  onConfirm: () => void
}) {
  const def = CLASSES[cls]
  return (
    <div className="relative z-10 w-full max-w-4xl px-4 anim-in">
      <h2 className="text-center text-2xl font-bold text-amber-300 title-glow mb-1 tracking-widest">
        ESCOLHA SEU DESTINO
      </h2>
      <p className="text-center text-xs text-amber-100/60 mb-4">
        Desperte como um dos heróis de Eldoria
      </p>

      <div className="flex justify-center mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 16))}
          placeholder="Nome do herói"
          className="pix-panel px-4 py-2 text-center text-amber-100 placeholder:text-amber-100/30 outline-none w-64 text-sm tracking-widest"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
        {(Object.keys(CLASSES) as HeroClassId[]).map((id) => {
          const c = CLASSES[id]
          const active = id === cls
          return (
            <button
              key={id}
              onClick={() => setCls(id)}
              className={`pix-panel p-3 text-left transition-all ${active ? 'ring-2 ring-amber-400 scale-[1.03]' : 'opacity-70 hover:opacity-100'}`}
              style={active ? { boxShadow: `0 0 16px ${c.color}88, inset 0 0 0 1px ${c.accent}` } : {}}
            >
              <div
                className="w-10 h-10 rounded mb-2 mx-auto"
                style={{ background: c.color, boxShadow: `inset 0 -4px 0 rgba(0,0,0,0.3), 0 0 0 2px ${c.accent}` }}
              />
              <div className="text-center font-bold text-sm" style={{ color: c.accent }}>
                {c.name}
              </div>
              <div className="text-center text-[9px] text-amber-100/50 uppercase tracking-wider">
                {c.title}
              </div>
            </button>
          )
        })}
      </div>

      <div className="pix-panel p-4 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-lg font-bold" style={{ color: def.accent }}>
              {def.name} <span className="text-xs text-amber-100/50">— {def.title}</span>
            </div>
            <p className="text-xs text-amber-100/70 mt-1 leading-relaxed">{def.desc}</p>
            <p className="text-[11px] mt-2 text-amber-300/80">✦ {def.passive}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            <Stat label="HP" value={def.baseHp} color="#e74c3c" />
            <Stat label="Stamina" value={def.baseStamina} color="#f1c40f" />
            <Stat label="Mana" value={def.baseMana} color="#9b59b6" />
            <Stat label="Arma" value={def.startWeapon.replace(/_/g, ' ')} color="#27ae60" small />
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-amber-900/40">
          <div className="text-[10px] text-amber-100/40 uppercase tracking-wider mb-1">Itens iniciais</div>
          <div className="flex gap-2 flex-wrap">
            {def.startItems.map((s, i) => (
              <div key={i} className="pix-slot px-2 py-1 flex items-center gap-1.5">
                <ItemIcon sprite={spriteFor(s.id)} size={20} />
                <span className="text-[10px] text-amber-100/70">×{s.qty}</span>
              </div>
            ))}
            <div className="pix-slot px-2 py-1 flex items-center gap-1.5">
              <ItemIcon sprite="tool_hoe" size={20} />
              <span className="text-[10px] text-amber-100/70">×1</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-3">
        <button className="pix-btn px-6 py-2 text-xs" onClick={onBack}>
          ← Voltar
        </button>
        <button
          className="pix-btn px-8 py-2 text-sm font-bold"
          style={{ borderColor: '#f1c40f', color: '#fff3a0' }}
          onClick={onConfirm}
        >
          ⚔ Despertar em Eldoria
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value, color, small }: { label: string; value: string | number; color: string; small?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-amber-100/50">{label}</span>
      <span className="font-bold capitalize" style={{ color, fontSize: small ? 9 : 12 }}>
        {value}
      </span>
    </div>
  )
}
