'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { GameEngine, type EngineCommand } from '@/lib/game/engine'
import type { HudSnapshot, SaveData, HeroClassId } from '@/lib/game/types'

const initialSnap: HudSnapshot = {
  screen: 'title', cls: 'warrior', heroName: 'Herói', level: 1, xp: 0, xpNext: 60,
  hp: 0, maxHp: 0, stamina: 0, maxStamina: 0, mana: 0, maxMana: 0,
  hunger: 0, thirst: 0, gold: 0, zone: 'plains', zoneName: 'Planície Dourada',
  timeOfDay: 0.3, isNight: false, inventory: [], equipped: 'rusty_sword',
  nearStation: null, nearPortal: null, nearInteract: null, bossHp: null, bossName: null,
  kills: 0, deaths: 0, craftLevels: { cooking: 1, crafting: 1, alchemy: 1, construction: 1 },
  toast: null, paused: false, showInventory: false, showCrafting: false, message: null, killFeed: [],
}

export function useGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const [snap, setSnap] = useState<HudSnapshot>(initialSnap)
  const [hasSave, setHasSave] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = new GameEngine(canvasRef.current)
    engineRef.current = engine
    const unsub = engine.subscribe(setSnap)
    engine.start()
    // check for existing save
    fetch('/api/save')
      .then((r) => r.json())
      .then((d) => { if (d?.data) setHasSave(true) })
      .catch(() => {})
    return () => {
      unsub()
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  const cmd = useCallback((c: EngineCommand) => engineRef.current?.command(c), [])

  const startGame = useCallback((heroName: string, cls: HeroClassId) => {
    engineRef.current?.command({ type: 'start', heroName, cls })
  }, [])

  const continueGame = useCallback(async () => {
    try {
      const r = await fetch('/api/save')
      const d = await r.json()
      if (d?.data) {
        const { GameEngine } = await import('@/lib/game/engine')
        engineRef.current?.loadSave(d.data as SaveData)
      }
    } catch { /* ignore */ }
  }, [])

  const deleteSave = useCallback(async () => {
    await fetch('/api/save', { method: 'DELETE' })
    setHasSave(false)
  }, [])

  const submitRun = useCallback(async () => {
    const e = engineRef.current
    if (!e) return
    const s = e.exportSave()
    await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heroName: s.heroName, heroClass: s.cls, level: s.level,
        maxZone: s.zone, kills: s.kills, deaths: s.deaths, playtime: Math.floor(s.playtime),
      }),
    })
  }, [])

  return { canvasRef, snap, cmd, hasSave, startGame, continueGame, deleteSave, submitRun }
}
