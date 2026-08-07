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
  comboCount: 0, comboTimer: 0, lockTarget: -1, musicEnabled: true, musicMood: 'calm', parryReady: false,
  ascension: 'none', arrows: 0, holyCd: 0, fireballCd: 0, frostCd: 0, holyAura: 0, nearStructure: null,
  elfRescued: false, dogRescued: false, elfCd: 0, dogCd: 0, dogTarget: -1,
}

// ---- localStorage persistence (no DB needed — works on Vercel) ------------
const SAVE_KEY = 'eldoria:save'
const LB_KEY = 'eldoria:leaderboard'

function readSave(): SaveData | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SaveData
  } catch { return null }
}

function writeSave(data: SaveData) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)) } catch { /* quota */ }
}

function clearSave() {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(SAVE_KEY) } catch { /* noop */ }
}

function readLeaderboard(): { heroName: string; heroClass: string; level: number; maxZone: string; kills: number; deaths: number; playtime: number; at: number }[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LB_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}

function appendLeaderboard(entry: { heroName: string; heroClass: string; level: number; maxZone: string; kills: number; deaths: number; playtime: number }) {
  if (typeof window === 'undefined') return
  try {
    const list = readLeaderboard()
    list.push({ ...entry, at: Date.now() })
    list.sort((a, b) => b.level - a.level || b.kills - a.kills)
    localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0, 20)))
  } catch { /* quota */ }
}

export function useGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const [snap, setSnap] = useState<HudSnapshot>(initialSnap)
  // check for existing save once on init (lazy initializer — no effect needed)
  const [hasSave, setHasSave] = useState<boolean>(() => !!readSave())

  useEffect(() => {
    if (!canvasRef.current) return
    const engine = new GameEngine(canvasRef.current)
    engineRef.current = engine
    const unsub = engine.subscribe(setSnap)
    engine.start()
    return () => {
      unsub()
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  const cmd = useCallback((c: EngineCommand) => {
    engineRef.current?.command(c)
    // when returning to title, re-check whether a save exists so the
    // "Continuar" button appears/disappears correctly.
    if (c.type === 'quitToTitle') {
      setTimeout(() => setHasSave(!!readSave()), 50)
    }
  }, [])

  const startGame = useCallback((heroName: string, cls: HeroClassId) => {
    engineRef.current?.command({ type: 'start', heroName, cls })
  }, [])

  const continueGame = useCallback(async () => {
    const data = readSave()
    if (data) {
      engineRef.current?.loadSave(data)
    }
  }, [])

  const deleteSave = useCallback(async () => {
    clearSave()
    setHasSave(false)
  }, [])

  const submitRun = useCallback(async () => {
    const e = engineRef.current
    if (!e) return
    const s = e.exportSave()
    appendLeaderboard({
      heroName: s.heroName, heroClass: s.cls, level: s.level,
      maxZone: s.zone, kills: s.kills, deaths: s.deaths, playtime: Math.floor(s.playtime),
    })
  }, [])

  return { canvasRef, snap, cmd, hasSave, startGame, continueGame, deleteSave, submitRun }
}
