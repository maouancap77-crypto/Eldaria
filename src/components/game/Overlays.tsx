'use client'

import type { HudSnapshot } from '@/lib/game/types'
import { CLASSES } from '@/lib/game/data'

interface Props {
  s: HudSnapshot
  onResume: () => void
  onQuit: () => void
  onSave: () => void
}

export function PauseMenu({ s, onResume, onQuit, onSave }: Props) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 pointer-events-auto" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
      <div className="pix-panel w-80 p-5 anim-in text-center">
        <h2 className="text-lg font-bold text-amber-300 tracking-widest title-glow mb-1">PAUSADO</h2>
        <p className="text-[10px] text-amber-100/50 mb-4">O Silêncio aguarda...</p>

        <div className="pix-slot p-3 mb-4 text-left text-[10px] space-y-1">
          <Line k="Herói" v={`${s.heroName} · ${CLASSES[s.cls].name}`} />
          <Line k="Nível" v={String(s.level)} />
          <Line k="Zona" v={s.zoneName} />
          <Line k="Abates" v={String(s.kills)} />
          <Line k="Mortes" v={String(s.deaths)} />
          <Line k="Ouro" v={String(s.gold)} />
        </div>

        <div className="space-y-2">
          <button className="pix-btn w-full py-2 text-xs" onClick={onResume}>▶ Continuar</button>
          <button className="pix-btn w-full py-2 text-xs" onClick={onSave}>💾 Salvar</button>
          <button className="pix-btn w-full py-2 text-xs !border-red-900 !text-red-300" onClick={onQuit}>Sair para o Menu</button>
        </div>
      </div>
    </div>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-amber-100/50">{k}</span>
      <span className="text-amber-200 font-bold">{v}</span>
    </div>
  )
}

export function DeathScreen({ s, onRespawn, onQuit }: { s: HudSnapshot; onRespawn: () => void; onQuit: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-red-950/60 pointer-events-auto" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
      <div className="pix-panel w-96 p-6 anim-in text-center" style={{ borderColor: '#7a1a1a' }}>
        <div className="text-5xl mb-2">💀</div>
        <h2 className="text-2xl font-black text-red-400 tracking-widest title-glow mb-1">VOCÊ CAIU</h2>
        <p className="text-[11px] text-amber-100/60 mb-4">
          A morte em Eldoria não é o fim. A fogueira o chama de volta — mas o Silêncio cobra seu preço.
        </p>
        <div className="pix-slot p-3 mb-4 text-left text-[10px] space-y-1">
          <Line k="Herói" v={`${s.heroName} · Nv${s.level}`} />
          <Line k="Abates" v={String(s.kills)} />
          <Line k="Mortes" v={String(s.deaths)} />
          <Line k="Zona" v={s.zoneName} />
        </div>
        <div className="space-y-2">
          <button className="pix-btn w-full py-2 text-xs" onClick={onRespawn}>🔥 Renascer na fogueira</button>
          <button className="pix-btn w-full py-2 text-xs !border-red-900 !text-red-300" onClick={onQuit}>Desistir</button>
        </div>
      </div>
    </div>
  )
}

export function WinScreen({ s, onQuit, onSubmit }: { s: HudSnapshot; onQuit: () => void; onSubmit: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-amber-950/50 pointer-events-auto" style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
      <div className="pix-panel w-[28rem] p-6 anim-in text-center" style={{ borderColor: '#f1c40f' }}>
        <div className="text-5xl mb-2">👑</div>
        <h2 className="text-2xl font-black text-amber-300 tracking-widest title-glow mb-1">VITÓRIA</h2>
        <p className="text-[11px] text-amber-100/70 mb-4 leading-relaxed">
          O Cavaleiro Silencioso tomba. O Silêncio se quebra sobre Eldoria.
          Você forjou sua lenda — mas o mundo ainda respira, e novas criptas aguardam.
        </p>
        <div className="pix-slot p-3 mb-4 text-left text-[10px] space-y-1">
          <Line k="Herói" v={`${s.heroName} · ${CLASSES[s.cls].name}`} />
          <Line k="Nível final" v={String(s.level)} />
          <Line k="Abates" v={String(s.kills)} />
          <Line k="Mortes" v={String(s.deaths)} />
          <Line k="Ouro" v={String(s.gold)} />
        </div>
        <div className="space-y-2">
          <button className="pix-btn w-full py-2 text-xs" onClick={onSubmit}>🏆 Registrar no Ranking</button>
          <button className="pix-btn w-full py-2 text-xs" onClick={onQuit}>Continuar Explorando</button>
        </div>
      </div>
    </div>
  )
}
