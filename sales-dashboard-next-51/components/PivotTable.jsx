'use client'

import { useState } from 'react'
import { formatRupiah, formatNumber } from '@/lib/parseData'

export default function PivotTable({ data }) {
  const [mode, setMode] = useState('omset') // 'omset' | 'order'
  const pivot = mode === 'omset' ? data.pivotOmset : data.pivotCount
  const fmt = mode === 'omset' ? formatRupiah : formatNumber
  const customers = data.rankedCustomers
  const missingSet = new Set(data.missingDates.map((m) => m.dateKey))

  const colTotals = {}
  for (const c of customers) colTotals[c] = 0
  for (const d of data.dateKeys) for (const c of customers) colTotals[c] += pivot[d][c]
  const grandTotal = customers.reduce((s, c) => s + colTotals[c], 0)

  return (
    <div className="table-block">
      <div className="table-block-header">
        <h3 className="block-title">Rincian harian per pelanggan penagihan</h3>
        <div className="toggle-group" role="group" aria-label="Pilih tampilan data">
          <button
            className={mode === 'omset' ? 'is-active' : ''}
            onClick={() => setMode('omset')}
          >
            Omset (Rp)
          </button>
          <button
            className={mode === 'order' ? 'is-active' : ''}
            onClick={() => setMode('order')}
          >
            Jumlah order
          </button>
        </div>
      </div>
      <div className="table-scroll table-scroll--pivot">
        <table className="data-table data-table--pivot">
          <thead>
            <tr>
              <th className="sticky-col">Tanggal</th>
              {customers.map((c) => (
                <th key={c} className="num">{c}</th>
              ))}
              <th className="num total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.dateKeys.map((d) => {
              const rowTotal = customers.reduce((s, c) => s + pivot[d][c], 0)
              const dayInfo = data.daily.find((x) => x.dateKey === d)
              return (
                <tr key={d}>
                  <td className="sticky-col mono">
                    {dayInfo.label} <span className="muted">({dayInfo.day.slice(0, 3)})</span>
                  </td>
                  {customers.map((c) => (
                    <td key={c} className="num mono">
                      {pivot[d][c] > 0 ? fmt(pivot[d][c]) : <span className="muted">–</span>}
                    </td>
                  ))}
                  <td className="num mono total-col">{fmt(rowTotal)}</td>
                </tr>
              )
            })}
            {data.missingDates.map((m) => (
              <tr key={m.dateKey} className="row-gap">
                <td className="sticky-col mono">
                  {m.label} <span className="muted">({m.day.slice(0, 3)})</span>
                </td>
                <td colSpan={customers.length + 1} className="gap-note">
                  Tidak ada transaksi tercatat (toko kemungkinan tutup)
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky-col">Total</td>
              {customers.map((c) => (
                <td key={c} className="num mono">{fmt(colTotals[c])}</td>
              ))}
              <td className="num mono total-col">{fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {missingSet.size > 0 && (
        <p className="table-footnote">
          Baris bertanda abu-abu menunjukkan tanggal di dalam rentang data yang tidak punya transaksi sama sekali.
        </p>
      )}
    </div>
  )
}
