'use client'

import { useMemo } from 'react'
import { formatRupiah, formatNumber } from '@/lib/parseData'
import { CATEGORY_OPTIONS, UNCATEGORIZED } from './CategoryAssign'

const ORDERED_CATEGORIES = [...CATEGORY_OPTIONS, UNCATEGORIZED]

function diff(a, b) {
  if (!b || b === 0) return null
  return ((a - b) / b) * 100
}

function DiffBadge({ pct }) {
  if (pct === null) return null
  const up = pct >= 0
  return (
    <span className={`diff-badge ${up ? 'diff-up' : 'diff-down'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function MetricCompareCard({ label, valA, valB, format }) {
  const pct = diff(valA, valB)
  return (
    <div className="metric-card compare-card">
      <p className="metric-label">{label}</p>
      <div className="compare-values">
        <span className="compare-val compare-val--a">{format(valA)}</span>
        <span className="compare-sep">vs</span>
        <span className="compare-val compare-val--b">{format(valB)}</span>
      </div>
      <DiffBadge pct={pct} />
    </div>
  )
}

export default function CompareView({ payloadA, payloadB, labelA, labelB }) {
  const a = payloadA?.analysis
  const b = payloadB?.analysis
  const catA = payloadA?.categories || {}
  const catB = payloadB?.categories || {}

  const customersByCategory = useMemo(() => {
    const all = Array.from(new Set([...(a?.rankedCustomers || []), ...(b?.rankedCustomers || [])]))
    const groups = {}
    for (const key of ORDERED_CATEGORIES) groups[key] = []
    for (const c of all) {
      const key = catA[c] || catB[c] || UNCATEGORIZED
      if (!groups[key].includes(c)) groups[key].push(c)
    }
    return groups
  }, [a, b, catA, catB])

  if (!a || !b) return null

  const aovA = a.totalOrder > 0 ? a.totalOmset / a.totalOrder : 0
  const aovB = b.totalOrder > 0 ? b.totalOmset / b.totalOrder : 0

  return (
    <main className="dashboard">
      {/* Label periode */}
      <div className="compare-period-labels">
        <span className="compare-period-label compare-period-label--a">{labelA}</span>
        <span className="compare-period-sep">vs</span>
        <span className="compare-period-label compare-period-label--b">{labelB}</span>
      </div>

      {/* Kartu metrik utama */}
      <div className="card-grid">
        <MetricCompareCard label="Total omset" valA={a.totalOmset} valB={b.totalOmset} format={formatRupiah} />
        <MetricCompareCard label="Total order" valA={a.totalOrder} valB={b.totalOrder} format={formatNumber} />
        <MetricCompareCard label="Rata-rata nilai order" valA={aovA} valB={aovB} format={formatRupiah} />
        <MetricCompareCard label="Hari aktif" valA={a.dateKeys.length} valB={b.dateKeys.length} format={formatNumber} />
      </div>

      {/* Perbandingan per platform */}
      <section>
        <h2 className="section-title">Omset per platform</h2>
        <div className="table-block">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th className="num">{labelA}</th>
                  <th className="num">{labelB}</th>
                  <th className="num">Selisih</th>
                  <th className="num">Pertumbuhan</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(new Set([...Object.keys(a.platformTotals), ...Object.keys(b.platformTotals)])).map((platform) => {
                  const vA = a.platformTotals[platform] || 0
                  const vB = b.platformTotals[platform] || 0
                  const pct = diff(vA, vB)
                  return (
                    <tr key={platform}>
                      <td>{platform}</td>
                      <td className="num mono">{formatRupiah(vA)}</td>
                      <td className="num mono">{formatRupiah(vB)}</td>
                      <td className="num mono">{formatRupiah(vA - vB)}</td>
                      <td className="num"><DiffBadge pct={pct} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Perbandingan per kategori */}
      {CATEGORY_OPTIONS.some(key => customersByCategory[key]?.length > 0) && (
        <section>
          <h2 className="section-title">Omset per kategori</h2>
          <div className="table-block">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Kategori</th>
                    <th className="num">{labelA}</th>
                    <th className="num">{labelB}</th>
                    <th className="num">Selisih</th>
                    <th className="num">Pertumbuhan</th>
                  </tr>
                </thead>
                <tbody>
                  {ORDERED_CATEGORIES.map((key) => {
                    const members = customersByCategory[key]
                    if (members.length === 0) return null
                    const vA = members.reduce((s, c) => s + (a.customerTotals?.[c] || 0), 0)
                    const vB = members.reduce((s, c) => s + (b.customerTotals?.[c] || 0), 0)
                    const pct = diff(vA, vB)
                    return (
                      <tr key={key}>
                        <td>{key}</td>
                        <td className="num mono">{formatRupiah(vA)}</td>
                        <td className="num mono">{formatRupiah(vB)}</td>
                        <td className="num mono">{formatRupiah(vA - vB)}</td>
                        <td className="num"><DiffBadge pct={pct} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Perbandingan per pelanggan penagihan */}
      <section>
        <h2 className="section-title">Omset per pelanggan penagihan</h2>
        <div className="table-block">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pelanggan penagihan</th>
                  <th className="num">{labelA}</th>
                  <th className="num">{labelB}</th>
                  <th className="num">Selisih</th>
                  <th className="num">Pertumbuhan</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(new Set([...(a.rankedCustomers || []), ...(b.rankedCustomers || [])])).sort((x, y) => {
                  const vXA = a.customerTotals?.[x] || 0
                  const vYA = a.customerTotals?.[y] || 0
                  return vYA - vXA
                }).map((c) => {
                  const vA = a.customerTotals?.[c] || 0
                  const vB = b.customerTotals?.[c] || 0
                  const pct = diff(vA, vB)
                  return (
                    <tr key={c}>
                      <td>{c}</td>
                      <td className="num mono">{vA > 0 ? formatRupiah(vA) : <span className="muted">–</span>}</td>
                      <td className="num mono">{vB > 0 ? formatRupiah(vB) : <span className="muted">–</span>}</td>
                      <td className="num mono">{vA !== 0 || vB !== 0 ? formatRupiah(vA - vB) : <span className="muted">–</span>}</td>
                      <td className="num"><DiffBadge pct={pct} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}
