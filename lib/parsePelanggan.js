import * as XLSX from 'xlsx'

/**
 * Flexible Date Parser
 * Handles DMY string ('22 Sep 2026', '15 Mei 2026'), YMD ('2026-09-22'),
 * DD/MM/YYYY, and Excel serial numbers.
 */
export function parseDateFlexible(val) {
  if (val === null || val === undefined || val === '') {
    return { raw: '', iso: '', ts: 0 }
  }

  // Handle Excel serial date numbers
  if (typeof val === 'number') {
    // 25569 = days between 1899-12-30 and 1970-01-01
    const ms = Math.round((val - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear()
      const mon = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      const iso = `${year}-${mon}-${day}`
      return { raw: d.toLocaleDateString('id-ID'), iso, ts: d.getTime() }
    }
  }

  const s = String(val).trim()

  // Match: DD Mon YYYY e.g. "22 Sep 2026" or "5 Mei 2026"
  const dmyMatch = s.match(/^(\d{1,2})\s+([a-zA-Z]{3,4})\s+(\d{4})$/)
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0')
    const monStr = dmyMatch[2].toLowerCase()
    const monthMap = {
      jan: '01', feb: '02', mar: '03', apr: '04', mei: '05', may: '05',
      jun: '06', jul: '07', agu: '08', ags: '08', aug: '08', sep: '09',
      okt: '10', oct: '10', nov: '11', nop: '11', des: '12', dec: '12',
    }
    const mon = monthMap[monStr.slice(0, 3)]
    if (mon) {
      const year = dmyMatch[3]
      const iso = `${year}-${mon}-${day}`
      const ts = new Date(Number(year), Number(mon) - 1, Number(day), 12, 0, 0).getTime()
      return { raw: s, iso, ts }
    }
  }

  // Match ISO YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const year = isoMatch[1]
    const mon = isoMatch[2]
    const day = isoMatch[3]
    const ts = new Date(Number(year), Number(mon) - 1, Number(day), 12, 0, 0).getTime()
    return { raw: s, iso: `${year}-${mon}-${day}`, ts }
  }

  // Standard fallback
  const parsedTs = Date.parse(s)
  if (!isNaN(parsedTs)) {
    const d = new Date(parsedTs)
    const year = d.getFullYear()
    const mon = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return { raw: s, iso: `${year}-${mon}-${day}`, ts: parsedTs }
  }

  return { raw: s, iso: s, ts: 0 }
}

/**
 * Parses customer data from an Excel file buffer or Uint8Array.
 * Expected structure from PELANGGAN 2.xls:
 * Col A: Tgl DO (Tanggal Order)
 * Col B: Nama Pelanggan (Channel/Toko/Marketplace)
 * Col C: kirim ke#1 (Username Pelanggan)
 * Col D: Count / Extra formula
 */
export function parsePelangganWorkbook(bufferOrArray) {
  const wb = XLSX.read(bufferOrArray, { type: 'array', cellDates: false })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('File excel tidak memiliki lembar kerja (sheet).')
  }

  const sheet = wb.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (!rows || rows.length === 0) {
    throw new Error('Sheet kosong atau tidak memiliki data.')
  }

  // Auto-detect header row within first 10 rows
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i].map((c) => String(c).trim().toLowerCase())
    if (
      r.some((c) => c.includes('tgl') || c.includes('tanggal') || c.includes('date')) &&
      r.some((c) => c.includes('kirim') || c.includes('pelanggan') || c.includes('user'))
    ) {
      headerRowIdx = i
      break
    }
  }

  const headerRow = rows[headerRowIdx].map((c) => String(c).trim())
  let dateCol = headerRow.findIndex((h) => /tgl|tanggal|date/i.test(h))
  let channelCol = headerRow.findIndex((h) => /nama pelanggan|channel|toko|platform|marketplace/i.test(h))
  let usernameCol = headerRow.findIndex((h) => /kirim ke|username|pembeli|customer/i.test(h))
  let resiCol = headerRow.findIndex((h) => /resi|no\.?\s*resi|tracking|awb|connote/i.test(h))

  // Fallbacks if header labels did not match
  if (dateCol === -1) dateCol = 0
  if (channelCol === -1) channelCol = 1
  if (usernameCol === -1) usernameCol = 2
  if (resiCol === -1) resiCol = 3 // Column D (index 3)

  const userMap = new Map()
  const channelTotals = {}
  let totalValidOrders = 0
  let earliestTs = Infinity
  let latestTs = -Infinity
  let earliestDateLabel = ''
  let latestDateLabel = ''

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    const rawDate = row[dateCol] !== undefined ? String(row[dateCol]).trim() : ''
    const rawChannel = row[channelCol] !== undefined ? String(row[channelCol]).trim() : ''
    const rawUser = row[usernameCol] !== undefined ? String(row[usernameCol]).trim() : ''
    const rawResi = row[resiCol] !== undefined && row[resiCol] !== null ? String(row[resiCol]).trim() : ''

    // Skip blank or footer rows
    if (!rawUser && !rawDate) continue
    if (!rawUser) continue

    totalValidOrders++
    const dateObj = parseDateFlexible(rawDate)

    if (dateObj.ts > 0) {
      if (dateObj.ts < earliestTs) {
        earliestTs = dateObj.ts
        earliestDateLabel = dateObj.raw || dateObj.iso
      }
      if (dateObj.ts > latestTs) {
        latestTs = dateObj.ts
        latestDateLabel = dateObj.raw || dateObj.iso
      }
    }

    const channel = rawChannel || 'Lainnya'
    channelTotals[channel] = (channelTotals[channel] || 0) + 1

    if (!userMap.has(rawUser)) {
      userMap.set(rawUser, {
        username: rawUser,
        orderCount: 0,
        channels: new Set(),
        orders: [],
      })
    }

    const entry = userMap.get(rawUser)
    entry.orderCount++
    if (channel) entry.channels.add(channel)
    entry.orders.push({
      date: dateObj.raw || rawDate,
      iso: dateObj.iso,
      ts: dateObj.ts,
      channel,
      resi: rawResi,
    })
  }

  if (totalValidOrders === 0) {
    throw new Error('Tidak ditemukan baris pesanan yang valid di file Excel ini.')
  }

  // Process customers & sort each customer's orders from newest to oldest
  const customers = Array.from(userMap.values()).map((c) => {
    // Sort individual customer orders newest first
    const sortedOrders = c.orders.sort((a, b) => b.ts - a.ts)
    const lastOrder = sortedOrders[0] || null
    const firstOrder = sortedOrders[sortedOrders.length - 1] || null
    const latestResi = lastOrder ? lastOrder.resi : ''
    const firstResi = firstOrder ? firstOrder.resi : ''
    const allResi = Array.from(new Set(sortedOrders.map((o) => o.resi).filter(Boolean)))

    return {
      username: c.username,
      orderCount: c.orderCount,
      channels: Array.from(c.channels),
      latestResi,
      firstResi,
      allResi,
      firstOrder: firstOrder ? firstOrder.date : '',
      firstOrderIso: firstOrder ? firstOrder.iso : '',
      lastOrder: lastOrder ? lastOrder.date : '',
      lastOrderIso: lastOrder ? lastOrder.iso : '',
      orders: sortedOrders.map((o) => ({
        date: o.date,
        iso: o.iso,
        channel: o.channel,
        resi: o.resi,
      })),
    }
  })

  // Default sorting: Order count DESCENDING, then username ASCENDING
  customers.sort((a, b) => {
    if (b.orderCount !== a.orderCount) {
      return b.orderCount - a.orderCount
    }
    return a.username.localeCompare(b.username)
  })

  // Calculate repeat metrics
  let repeatCustomers = 0
  let singleOrderCustomers = 0
  let repeatOrdersTotal = 0
  const distribution = {
    '2': 0,
    '3': 0,
    '4': 0,
    '5-9': 0,
    '10+': 0,
  }

  customers.forEach((c) => {
    if (c.orderCount === 1) {
      singleOrderCustomers++
    } else {
      repeatCustomers++
      repeatOrdersTotal += c.orderCount

      if (c.orderCount === 2) distribution['2']++
      else if (c.orderCount === 3) distribution['3']++
      else if (c.orderCount === 4) distribution['4']++
      else if (c.orderCount >= 5 && c.orderCount <= 9) distribution['5-9']++
      else if (c.orderCount >= 10) distribution['10+']++
    }
  })

  const uniqueCustomers = customers.length
  const repeatCustomerRate = uniqueCustomers > 0 ? Number(((repeatCustomers / uniqueCustomers) * 100).toFixed(2)) : 0
  const repeatOrderRate = totalValidOrders > 0 ? Number(((repeatOrdersTotal / totalValidOrders) * 100).toFixed(2)) : 0
  const avgRepeatOrders = repeatCustomers > 0 ? Number((repeatOrdersTotal / repeatCustomers).toFixed(2)) : 0
  const topCustomer = customers[0] ? { username: customers[0].username, count: customers[0].orderCount } : null

  // Channel metrics
  const channelBreakdown = Object.entries(channelTotals).map(([name, count]) => {
    const percentage = totalValidOrders > 0 ? Number(((count / totalValidOrders) * 100).toFixed(1)) : 0
    return { name, count, percentage }
  }).sort((a, b) => b.count - a.count)

  return {
    summary: {
      totalOrders: totalValidOrders,
      uniqueCustomers,
      repeatCustomers,
      singleOrderCustomers,
      repeatOrdersTotal,
      repeatCustomerRate,
      repeatOrderRate,
      avgRepeatOrders,
      topCustomer,
      distribution: {
        '2': { count: distribution['2'], percent: repeatCustomers > 0 ? Number(((distribution['2'] / repeatCustomers) * 100).toFixed(1)) : 0 },
        '3': { count: distribution['3'], percent: repeatCustomers > 0 ? Number(((distribution['3'] / repeatCustomers) * 100).toFixed(1)) : 0 },
        '4': { count: distribution['4'], percent: repeatCustomers > 0 ? Number(((distribution['4'] / repeatCustomers) * 100).toFixed(1)) : 0 },
        '5-9': { count: distribution['5-9'], percent: repeatCustomers > 0 ? Number(((distribution['5-9'] / repeatCustomers) * 100).toFixed(1)) : 0 },
        '10+': { count: distribution['10+'], percent: repeatCustomers > 0 ? Number(((distribution['10+'] / repeatCustomers) * 100).toFixed(1)) : 0 },
      },
      channels: channelBreakdown,
      dateRange: {
        earliest: earliestDateLabel,
        latest: latestDateLabel,
      },
    },
    customers,
  }
}
