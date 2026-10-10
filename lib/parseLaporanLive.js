import * as XLSX from 'xlsx'

export const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

export function slugifyCustomerId(name = '') {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/\s*\/\s*/g, '-')
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'default'
  )
}

export function slugifyPeriodId(label = '') {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'default-period'
  )
}

export function findCol(headers, needle) {
  if (!Array.isArray(headers)) return -1
  const norm = (s) => (s || '').toString().trim().toLowerCase()
  const target = norm(needle)
  let idx = headers.findIndex((h) => norm(h) === target)
  if (idx === -1) idx = headers.findIndex((h) => norm(h).includes(target))
  return idx
}

export function excelSerialToDate(serial) {
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const dateInfo = new Date(utcValue * 1000)
  const fractionalDay = serial - Math.floor(serial) + 0.0000001
  let totalSeconds = Math.floor(86400 * fractionalDay)
  const seconds = totalSeconds % 60
  totalSeconds -= seconds
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60
  return new Date(dateInfo.getFullYear(), dateInfo.getMonth(), dateInfo.getDate(), hours, minutes, seconds)
}

export function parseStartTime(val) {
  if (val == null || val === '') return null
  if (val instanceof Date) return val
  if (typeof val === 'number') return excelSerialToDate(val)

  const str = val.toString().trim()
  // Matches dd-mm-yyyy HH:MM(:SS) or dd/mm/yyyy HH:MM(:SS)
  const m1 = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (m1) {
    const [, dd, mm, yyyy, HH, MM, SS] = m1
    return new Date(+yyyy, +mm - 1, +dd, +HH, +MM, +(SS || 0))
  }

  // Matches yyyy-mm-dd HH:MM(:SS)
  const m2 = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (m2) {
    const [, yyyy, mm, dd, HH, MM, SS] = m2
    return new Date(+yyyy, +mm - 1, +dd, +HH, +MM, +(SS || 0))
  }

  const d = new Date(str)
  return isNaN(d.getTime()) ? null : d
}

export function parseDurationSeconds(val) {
  if (val == null || val === '') return 0
  if (typeof val === 'number') {
    // If it's a fraction of day in Excel
    if (val < 10) return Math.round(val * 86400)
    return Math.round(val)
  }
  const str = val.toString().trim()
  const parts = str.split(':').map(Number)
  if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }
  if (parts.length === 2 && parts.every((p) => !isNaN(p))) {
    return parts[0] * 60 + parts[1]
  }
  const num = Number(str)
  return isNaN(num) ? 0 : num
}

export function parseRupiah(val) {
  if (val == null || val === '') return 0
  if (typeof val === 'number') return Math.round(val)
  const str = val.toString().trim()
  if (!str) return 0
  const cleaned = str.replace(/[^0-9-]/g, '')
  const n = parseInt(cleaned, 10)
  return isNaN(n) ? 0 : n
}

export function pad2(n) {
  return String(n).padStart(2, '0')
}

export function formatDateKey(d) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function formatTimeHM(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatDurationHM(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}j ${pad2(m)}m`
}

export const ID_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
]

export function formatDayDateIndo(d) {
  if (!d) return ''
  const dateObj = d instanceof Date ? d : new Date(d)
  if (isNaN(dateObj.getTime())) return String(d)
  const dayName = INDONESIAN_DAYS[dateObj.getDay()]
  const dayNum = dateObj.getDate()
  const monthName = ID_MONTHS_SHORT[dateObj.getMonth()]
  const year = dateObj.getFullYear()
  return `${dayName}, ${dayNum} ${monthName} ${year}`
}

export function parseGridRows(grid, filename = '') {
  if (!Array.isArray(grid) || grid.length < 2) return []

  const headers = grid[0]
  const col = {
    periode: findCol(headers, 'Periode Data'),
    userId: findCol(headers, 'User Id'),
    nama: findCol(headers, 'Nama Livestream'),
    start: findCol(headers, 'Start Time'),
    durasi: findCol(headers, 'Durasi'),
    penontonAktif: findCol(headers, 'Penonton Aktif'),
    komentar: findCol(headers, 'Komentar'),
    atc: findCol(headers, 'Tambah ke Keranjang'),
    avgWatch: findCol(headers, 'Rata-rata durasi ditonton'),
    penonton: findCol(headers, 'Penonton'),
    pesananDibuat: findCol(headers, 'Pesanan(Pesanan Dibuat)'),
    pesananSiap: findCol(headers, 'Pesanan(Pesanan Siap Dikirim)'),
    produkDibuat: findCol(headers, 'Produk Terjual(Pesanan Dibuat)'),
    produkSiap: findCol(headers, 'Produk Terjual(Pesanan Siap Dikirim)'),
    penjualanDibuat: findCol(headers, 'Penjualan(Pesanan Dibuat)'),
    penjualanSiap: findCol(headers, 'Penjualan(Pesanan Siap Dikirim)'),
  }

  const out = []

  for (let i = 1; i < grid.length; i++) {
    const r = grid[i]
    if (!r || col.start === -1 || r[col.start] == null) continue

    const start = parseStartTime(r[col.start])
    if (!start) continue

    const durSec = parseDurationSeconds(r[col.durasi])
    const end = new Date(start.getTime() + durSec * 1000)

    const endHour = end.getHours() + end.getMinutes() / 60
    const autoHost = endHour >= 6 && endHour < 17 ? 'Astrid' : 'Fifi'

    const dayName = INDONESIAN_DAYS[start.getDay()]
    const dateKey = formatDateKey(start)
    const dayDateFormatted = formatDayDateIndo(start)
    const nama = col.nama > -1 ? String(r[col.nama] || '').trim() : ''

    const id = `${dateKey}__${start.getTime()}__${nama.slice(0, 40)}`

    out.push({
      id,
      autoHost,
      host: autoHost,
      overrideSource: 'auto',
      dayName,
      dateKey,
      dayDateFormatted,
      startTimestamp: start.getTime(),
      endTimestamp: end.getTime(),
      startTime: formatTimeHM(start),
      endTime: formatTimeHM(end),
      durSec,
      nama,
      penontonAktif: Number(r[col.penontonAktif]) || 0,
      komentar: Number(r[col.komentar]) || 0,
      atc: Number(r[col.atc]) || 0,
      penonton: Number(r[col.penonton]) || 0,
      pesananDibuat: Number(r[col.pesananDibuat]) || 0,
      pesananSiap: Number(r[col.pesananSiap]) || 0,
      produkDibuat: Number(r[col.produkDibuat]) || 0,
      produkSiap: Number(r[col.produkSiap]) || 0,
      penjualanDibuat: parseRupiah(r[col.penjualanDibuat]),
      penjualanSiap: parseRupiah(r[col.penjualanSiap]),
      periode: col.periode > -1 ? String(r[col.periode] || '').trim() : '',
      sourceFiles: filename ? [filename] : [],
    })
  }

  return out
}

export function parseLiveWorkbook(buffer, filename = '') {
  const wb = XLSX.read(buffer, { type: buffer instanceof ArrayBuffer ? 'array' : 'buffer' })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
  return parseGridRows(grid, filename)
}

export function mergeLiveSessions(fileResults = []) {
  const merged = new Map()

  fileResults.forEach(({ grid, name, rows }) => {
    const list = rows || (grid ? parseGridRows(grid, name) : [])
    list.forEach((r) => {
      const existing = merged.get(r.id)
      if (existing) {
        existing.sourceFiles = Array.from(new Set(existing.sourceFiles.concat(r.sourceFiles)))
      } else {
        merged.set(r.id, { ...r })
      }
    })
  })

  const mergedRows = Array.from(merged.values())
  mergedRows.sort((a, b) => a.startTimestamp - b.startTimestamp)
  return mergedRows
}

export function applyHostOverrides(rows, dayOverrides = {}, sessionOverrides = {}) {
  return rows.map((r) => {
    let host = r.autoHost
    let overrideSource = 'auto'

    if (sessionOverrides && sessionOverrides[r.id]) {
      host = sessionOverrides[r.id]
      overrideSource = 'session'
    } else if (dayOverrides && dayOverrides[r.dateKey]) {
      host = dayOverrides[r.dateKey]
      overrideSource = 'day'
    }

    return {
      ...r,
      host,
      overrideSource,
    }
  })
}

export function summarizeSessions(list = []) {
  const s = {
    totalSessions: list.length,
    durSec: 0,
    penontonAktif: 0,
    komentar: 0,
    atc: 0,
    penonton: 0,
    pesananDibuat: 0,
    pesananSiap: 0,
    produkDibuat: 0,
    produkSiap: 0,
    penjualanDibuat: 0,
    penjualanSiap: 0,
  }

  list.forEach((r) => {
    s.durSec += r.durSec || 0
    s.penontonAktif += r.penontonAktif || 0
    s.komentar += r.komentar || 0
    s.atc += r.atc || 0
    s.penonton += r.penonton || 0
    s.pesananDibuat += r.pesananDibuat || 0
    s.pesananSiap += r.pesananSiap || 0
    s.produkDibuat += r.produkDibuat || 0
    s.produkSiap += r.produkSiap || 0
    s.penjualanDibuat += r.penjualanDibuat || 0
    s.penjualanSiap += r.penjualanSiap || 0
  })

  return s
}
