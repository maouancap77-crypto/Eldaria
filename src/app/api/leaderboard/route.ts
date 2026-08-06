import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/leaderboard
export async function GET() {
  const rows = await db.leaderboard.findMany({
    orderBy: [{ level: 'desc' }, { kills: 'desc' }],
    take: 20,
  })
  return NextResponse.json({ rows })
}

// POST /api/leaderboard  -> submit a run
export async function POST(req: NextRequest) {
  const b = await req.json()
  const row = await db.leaderboard.create({
    data: {
      heroName: String(b.heroName ?? 'Hero').slice(0, 24),
      heroClass: String(b.heroClass ?? 'Wanderer').slice(0, 24),
      level: Number(b.level ?? 1),
      maxZone: String(b.maxZone ?? 'Plains').slice(0, 40),
      kills: Number(b.kills ?? 0),
      deaths: Number(b.deaths ?? 0),
      playtime: Number(b.playtime ?? 0),
    },
  })
  return NextResponse.json({ ok: true, id: row.id })
}
