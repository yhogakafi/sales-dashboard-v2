import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function POST(request) {
  try {
    const { dataUrl, fileName, debugInfo } = await request.json()
    if (!dataUrl) return NextResponse.json({ ok: false, error: 'No dataUrl' }, { status: 400 })

    if (debugInfo) {
      fs.writeFileSync(path.join(process.cwd(), 'scratch', 'debug-info.json'), JSON.stringify(debugInfo, null, 2))
    }

    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    const outPath = path.join(process.cwd(), 'scratch', fileName || 'debug-exported.jpg')
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, buffer)

    return NextResponse.json({ ok: true, path: outPath, size: buffer.length })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
