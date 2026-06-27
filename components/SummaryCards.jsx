'use client'

import { formatRupiah, formatNumber } from '@/lib/parseData'

export default function SummaryCards({ data }) {
  const aov = data.totalOrder > 0 ? data.totalOmset / data.totalOrder : 0
  const cards = [
    { label: 'Total omset', value: formatRupiah(data.totalOmset) },
    { label: 'Total order', value: formatNumber(data.totalOrder) },
    { label: 'Rata-rata nilai order', value: formatRupiah(aov) },
    { label: 'Jumlah pelanggan penagihan', value: formatNumber(data.customers.length) },
    { label: 'Periode', value: `${data.dateKeys.length} hari aktif` },
  ]

  return (
    <div className="card-grid">
      {cards.map((c) => (
        <div className="metric-card" key={c.label}>
          <p className="metric-label">{c.label}</p>
          <p className="metric-value">{c.value}</p>
        </div>
      ))}
    </div>
  )
}
