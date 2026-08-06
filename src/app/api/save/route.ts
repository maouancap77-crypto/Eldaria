import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/save  -> load the default save slot (may be empty)
export async function GET() {
  try {
    const row = await db.saveGame.findUnique({ where: { id: 'default' } })
    if (!row) return NextResponse.json({ data: null })
    return NextResponse.json({ data: JSON.parse(row.data) })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    )
  }
}

// POST /api/save  -> persist game state
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const json = JSON.stringify(body.data ?? {})
    await db.saveGame.upsert({
      where: { id: 'default' },
      update: { data: json },
      create: { id: 'default', data: json },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    )
  }
}

// DELETE /api/save  -> wipe save
export async function DELETE() {
  try {
    await db.saveGame.deleteMany({ where: { id: 'default' } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
