'use client'

import { formatRupiah, formatNumber } from '@/lib/parseData'
import { CATEGORY_OPTIONS, UNCATEGORIZED } from './CategoryAssign'
import CategoryCharts from './CategoryCharts'

export default function CategorySummary({ data, categories }) {
  const groups = {}
  for (const opt of CATEGORY_OPTIONS) groups[opt] = []
  groups[UNCATEGORIZED] = []

  for (const c of data.rankedCustomers) {
    const key = categories[c] || UNCATEGORIZED
    groups[key].push(c)
  }

  const grandOmset = data.totalOmset

  function statsFor(customerList) {
    let omset = 0
    let order = 0
    for (const c of customerList) {
      omset += data.customerTotals[c]
      order += data.customerCounts[c]
    }
    return { omset, order, aov: order > 0 ? omset / order : 0 }
  }

  const orderedKeys = [...CATEGORY_OPTIONS, UNCATEGORIZED]

  return (
    <div className="category-summary">
      <h2 className="section-title">Ringkasan per kategori</h2>
      <div className="card-grid">
        {orderedKeys.map((key) => {
          const list = groups[key]
          if (key === UNCATEGORIZED && list.length === 0) return null
          const { omset, order, aov } = statsFor(list)
          const pct = grandOmset > 0 ? (omset / grandOmset) * 100 : 0
          return (
            <div className="metric-card category-card" key={key}>
              <p className="metric-label">{key}</p>
              <p className="metric-value">{formatRupiah(omset)}</p>
              <p className="category-subline">
                {formatNumber(order)} order &middot; AOV {formatRupiah(aov)} &middot; {pct.toFixed(1)}% omset
              </p>
              <p className="category-subline muted">{list.length} pelanggan penagihan</p>
            </div>
          )
        })}
      </div>

      <CategoryCharts data={data} categories={categories} />

      {CATEGORY_OPTIONS.map((key) => {
        const list = groups[key]
        if (list.length === 0) return null
        const sorted = [...list].sort((a, b) => data.customerTotals[b] - data.customerTotals[a])
        const { omset: catOmset } = statsFor(list)
        const catOrder = sorted.reduce((s, c) => s + data.customerCounts[c], 0)
        return (
          <div className="table-block category-detail" key={key}>
            <h3 className="block-title">{key} — rincian per pelanggan</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pelanggan penagihan</th>
                    <th className="num">Total omset</th>
                    <th className="num">Total order</th>
                    <th className="num">AOV</th>
                    <th className="num">% dari kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => {
                    const omset = data.customerTotals[c]
                    const order = data.customerCounts[c]
                    const aov = order > 0 ? omset / order : 0
                    const pct = catOmset > 0 ? (omset / catOmset) * 100 : 0
                    return (
                      <tr key={c}>
                        <td>{c}</td>
                        <td className="num mono">{formatRupiah(omset)}</td>
                        <td className="num mono">{formatNumber(order)}</td>
                        <td className="num mono">{formatRupiah(aov)}</td>
                        <td className="num mono">{pct.toFixed(1)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total {key}</td>
                    <td className="num mono">{formatRupiah(catOmset)}</td>
                    <td className="num mono">{formatNumber(catOrder)}</td>
                    <td className="num mono">{formatRupiah(catOrder > 0 ? catOmset / catOrder : 0)}</td>
                    <td className="num mono">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
