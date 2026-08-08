'use client'

import { useMemo } from 'react'
import { formatRupiah, formatNumber } from '@/lib/parseData'
import { CATEGORY_OPTIONS, UNCATEGORIZED } from './CategoryAssign'
import { alignForComparison, getSpanDays, trimAnalysisToSpan } from '@/lib/trimAnalysis'
import AccountChart from './AccountChart'

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

export default function CompareView({ payloadA, payloadB, labelA, labelB, alignMode = 'aligned' }) {
  const rawA = payloadA?.analysis
  const rawB = payloadB?.analysis
  const catA = payloadA?.categories || {}
  const catB = payloadB?.categories || {}

  // Dua mode:
  // - 'aligned' (default): selaraskan berdasarkan jumlah hari sejak awal masing-masing
  //   periode -- supaya periode yang belum penuh sebulan (misal baru 1-10 Jul)
  //   dibandingkan dengan hari yang setara di periode lain (1-10 Jun), bukan sebulan penuh.
  // - 'full': bandingkan kedua periode apa adanya, walau jumlah harinya beda
  //   (mis. Juli 31 hari penuh vs Juni 30 hari penuh) -- dipilih user lewat toggle
  //   saat kedua periode sudah sama-sama selesai/lengkap.
  const aligned = useMemo(() => {
    if (!rawA || !rawB) return null
    if (alignMode === 'full') {
      const spanA = getSpanDays(rawA)
      const spanB = getSpanDays(rawB)
      return {
        a: trimAnalysisToSpan(rawA, spanA), // no-op trim, cuma buat samain shape dgn effectiveSpanDays
        b: trimAnalysisToSpan(rawB, spanB),
        spanDays: Math.max(spanA, spanB),
      }
    }
    return alignForComparison(rawA, rawB)
  }, [rawA, rawB, alignMode])

  const customersByCategory = useMemo(() => {
    if (!rawA || !rawB) return {}
    const all = Array.from(new Set([...(rawA.rankedCustomers || []), ...(rawB.rankedCustomers || [])]))
    const groups = {}
    for (const key of ORDERED_CATEGORIES) groups[key] = []
    for (const c of all) {
      const key = catA[c] || catB[c] || UNCATEGORIZED
      if (!groups[key].includes(c)) groups[key].push(c)
    }
    return groups
  }, [rawA, rawB, catA, catB])

  if (!rawA || !rawB || !aligned) return null

  const { a, b, spanDays } = aligned
  const wasTrimmed = a.trimmed || b.trimmed
  const spansDiffer = a.effectiveSpanDays !== b.effectiveSpanDays

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

      {wasTrimmed && (
        <p className="compare-align-note">
          Dibandingkan hanya {spanDays} hari pertama tiap periode (mengikuti periode yang paling pendek), supaya adil.
        </p>
      )}
      {!wasTrimmed && spansDiffer && (
        <p className="compare-align-note">
          Membandingkan periode penuh apa adanya — {labelA} ({a.effectiveSpanDays} hari) vs {labelB} ({b.effectiveSpanDays} hari). Selisih jumlah hari bisa mempengaruhi hasil total.
        </p>
      )}

      {/* Kartu metrik utama */}
      <div className="card-grid">
        <MetricCompareCard label="Total omset" valA={a.totalOmset} valB={b.totalOmset} format={formatRupiah} />
        <MetricCompareCard label="Total order" valA={a.totalOrder} valB={b.totalOrder} format={formatNumber} />
        <MetricCompareCard label="Rata-rata nilai order" valA={aovA} valB={aovB} format={formatRupiah} />
        <MetricCompareCard label="Hari yang dibandingkan" valA={a.effectiveSpanDays} valB={b.effectiveSpanDays} format={formatNumber} />
      </div>

      {/* Grafik per akun */}
      <section>
        <AccountChart mode="compare" dataA={a} dataB={b} labelA={labelA} labelB={labelB} spanDays={spanDays} />
      </section>

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
                    if (!members || members.length === 0) return null
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
