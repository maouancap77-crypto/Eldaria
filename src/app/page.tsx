'use client'

import dynamic from 'next/dynamic'

// Canvas game has no SSR benefit and would cause hydration mismatches
// (browser extensions, preview URL rewriting, etc.). Load it client-only.
const GameCanvas = dynamic(() => import('@/components/game/GameCanvas').then((m) => m.GameCanvas), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0d0a14',
        color: '#f1c870',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontSize: 14,
        letterSpacing: '0.2em',
      }}
    >
      CARREGANDO ELDORIA...
    </div>
  ),
})

export default function Home() {
  return <GameCanvas />
}
