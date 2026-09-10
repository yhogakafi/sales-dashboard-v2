import { NextResponse } from 'next/server'
import { getAffiliateIndex } from '@/lib/blobAffiliate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const index = await getAffiliateIndex()

    // Aggregate unique months
    const monthMap = new Map()
    const accountSet = new Set()
    const shopeeAccountSet = new Set()
    const tiktokAccountSet = new Set()

    index.forEach(item => {
      const mKey = item.monthKey || item.periodId
      if (mKey && !monthMap.has(mKey)) {
        monthMap.set(mKey, {
          monthKey: mKey,
          label: item.periodLabel || mKey,
        })
      }
      if (item.account) {
        accountSet.add(item.account)
        if (item.platform === 'shopee') shopeeAccountSet.add(item.account)
        if (item.platform === 'tiktok') tiktokAccountSet.add(item.account)
      }
    })

    // Sort months descending (newest month first)
    const months = Array.from(monthMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey))

    return NextResponse.json({
      ok: true,
      index,
      months,
      accounts: Array.from(accountSet).sort(),
      shopeeAccounts: Array.from(shopeeAccountSet).sort(),
      tiktokAccounts: Array.from(tiktokAccountSet).sort(),
    })
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal memuat daftar periode affiliate.' }, { status: 500 })
  }
}
