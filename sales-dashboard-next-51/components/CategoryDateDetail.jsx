'use client'

import { Fragment, useMemo, useState } from 'react'
import { formatRupiah, formatNumber } from '@/lib/parseData'
import { CATEGORY_OPTIONS, UNCATEGORIZED } from './CategoryAssign'

const ORDERED_CATEGORIES = [...CATEGORY_OPTIONS, UNCATEGORIZED]

export default function CategoryDateDetail({ data, categories }) {
  const [expandedDate, setExpandedDate] = useState(null)

  // Group customers by category once.
  const customersByCategory = useMemo(() => {
    const groups = {}
    for (const key of ORDERED_CATEGORIES) groups[key] = []
    for (const c of data.rankedCustomers) {
      const key = categories[c] || UNCATEGORIZED
      groups[key].push(c)
    }
    return groups
  }, [data.rankedCustomers, categories])

  // For each date, compute omset & order per category.
  const rows = useMemo(() => {
    return data.dateKeys.map((d) => {
      const dayInfo = data.daily.find((x) => x.dateKey === d)
      const perCategory = {}
      for (const key of ORDERED_CATEGORIES) {
        let omset = 0
        let order = 0
        for (const c of customersByCategory[key]) {
          omset += data.pivotOmset[d][c]
          order += data.pivotCount[d][c]
        }
        perCategory[key] = { omset, order }
      }
      return { dateKey: d, label: dayInfo.label, day: dayInfo.day, perCategory }
    })
  }, [data, customersByCategory])

  function toggleDate(d) {
    setExpandedDate((prev) => (prev === d ? null : d))
  }

  return (
    <div className="table-block">
      <h3 className="block-title">Detail per tanggal per kategori</h3>
      <p className="assign-hint">
        Klik baris tanggal untuk melihat rincian per pelanggan penagihan di tanggal tersebut.
      </p>
      <div className="table-scroll">
        <table className="data-table date-category-table">
          <thead>
            <tr>
              <th></th>
              {ORDERED_CATEGORIES.map((key) => (
                <th key={key} className="num" colSpan={2}>{key}</th>
              ))}
            </tr>
            <tr className="subheader-row">
              <th>Tanggal</th>
              {ORDERED_CATEGORIES.map((key) => (
                <Fragment key={key}>
                  <th className="num sub">Omset</th>
                  <th className="num sub">Order</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.dateKey}>
                <tr
                  className={`date-row ${expandedDate === row.dateKey ? 'is-expanded' : ''}`}
                  onClick={() => toggleDate(row.dateKey)}
                >
                  <td className="mono">
                    <span className="expand-caret">{expandedDate === row.dateKey ? '▾' : '▸'}</span>{' '}
                    {row.label} <span className="muted">({row.day.slice(0, 3)})</span>
                  </td>
                  {ORDERED_CATEGORIES.map((key) => {
                    const { omset, order } = row.perCategory[key]
                    return (
                      <Fragment key={key}>
                        <td className="num mono">
                          {omset > 0 ? formatRupiah(omset) : <span className="muted">–</span>}
                        </td>
                        <td className="num mono">
                          {order > 0 ? formatNumber(order) : <span className="muted">–</span>}
                        </td>
                      </Fragment>
                    )
                  })}
                </tr>
                {expandedDate === row.dateKey && (
                  <tr className="detail-row">
                    <td colSpan={1 + ORDERED_CATEGORIES.length * 2}>
                      <DateDetailPanel dateKey={row.dateKey} data={data} customersByCategory={customersByCategory} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DateDetailPanel({ dateKey, data, customersByCategory }) {
  return (
    <div className="date-detail-panel">
      {ORDERED_CATEGORIES.map((key) => {
        const members = customersByCategory[key].filter((c) => data.pivotCount[dateKey][c] > 0)
        if (members.length === 0) return null
        const sorted = [...members].sort((a, b) => data.pivotOmset[dateKey][b] - data.pivotOmset[dateKey][a])
        const catOmset = sorted.reduce((s, c) => s + data.pivotOmset[dateKey][c], 0)
        const catOrder = sorted.reduce((s, c) => s + data.pivotCount[dateKey][c], 0)
        return (
          <div className="date-detail-group" key={key}>
            <p className="date-detail-group-title">
              {key} <span className="muted">— {formatRupiah(catOmset)} / {formatNumber(catOrder)} order</span>
            </p>
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>Pelanggan penagihan</th>
                  <th className="num">Omset</th>
                  <th className="num">Order</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td className="num mono">{formatRupiah(data.pivotOmset[dateKey][c])}</td>
                    <td className="num mono">{formatNumber(data.pivotCount[dateKey][c])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
