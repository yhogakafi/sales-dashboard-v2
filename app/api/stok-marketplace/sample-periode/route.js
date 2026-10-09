import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const candidates = [
      path.join(process.cwd(), '.data', 'Periode-1.xlsx'),
      path.join(process.cwd(), '.data', 'Periode 1.xlsx'),
    ]

    let foundPath = null
    let fileName = 'Periode-1.xlsx'

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        foundPath = p
        fileName = path.basename(p)
        break
      }
    }

    if (!foundPath) {
      return NextResponse.json(
        { ok: false, error: 'File sampel Periode-1.xlsx tidak ditemukan di folder .data' },
        { status: 404 }
      )
    }

    const buffer = await fs.promises.readFile(foundPath)
    return NextResponse.json({
      ok: true,
      fileName,
      base64: buffer.toString('base64'),
    })
  } catch (err) {
    console.error('[sample-periode GET] Error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
