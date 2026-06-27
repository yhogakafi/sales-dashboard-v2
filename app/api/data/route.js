import { NextResponse } from 'next/server'
import { getLatestAnalysis } from '@/lib/blob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET() {
  try {
    const result = await getLatestAnalysis()
    if (!result) {
      return NextResponse.json({ error: 'Belum ada data yang diunggah.' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Gagal mengambil data.' }, { status: 500 })
  }
}
