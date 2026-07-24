'use client'

import { useMemo, useState } from 'react'
import { formatNumber } from '@/lib/parseData'
import { buildDefaultCategories } from '@/lib/defaultCategories'
import { CATEGORY_OPTIONS } from '@/components/CategoryAssign'

const ALL = '__ALL__'

function pillClassFor(option) {
  if (option === ALL) return 'pill-all'
  return option === 'Online Underwear' ? 'pill-underwear' : 'pill-sport'
}

export default function ProdukRankingTable({ data }) {
  const [categoryFilter, setCategoryFilter] = useState(ALL)
  const [tokoFilter, setTokoFilter] = useState(ALL)

  // Kategori toko dipetakan otomatis dari nama brand (sama seperti di halaman
  // penjualan) — bukan sesuatu yang diatur ulang khusus untuk produk terlaris.
  const tokoCategories = useMemo(() => buildDefaultCategories(data.tokoList), [data.tokoList])

  const activeCategories = useMemo(
    () => CATEGORY_OPTIONS.filter((opt) => data.tokoList.some((t) => tokoCategories[t] === opt)),
    [data.tokoList, tokoCategories]
  )

  const tokoOptions = useMemo(() => {
    if (categoryFilter === ALL) return data.tokoList
    return data.tokoList.filter((t) => tokoCategories[t] === categoryFilter)
  }, [data.tokoList, categoryFilter, tokoCategories])

  function handleCategoryChange(cat) {
    setCategoryFilter(cat)
    setTokoFilter(ALL) // reset toko saat ganti kategori, supaya tidak "nyangkut" di toko kategori lama
  }

  const activeTokoList = useMemo(() => {
    if (tokoFilter !== ALL) return [tokoFilter]
    return tokoOptions
  }, [tokoFilter, tokoOptions])

  const ranked = useMemo(() => {
    const withQty = data.products.map((p) => {
      const qty = activeTokoList.reduce((s, t) => s + (p.qtyByToko[t] || 0), 0)
      return { ...p, qty }
    })
    return withQty.filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty)
  }, [data.products, activeTokoList])

  const totalQty = ranked.reduce((s, p) => s + p.qty, 0)

  return (
    <div className="table-block">
      <div className="produk-filter-block">
        <div className="produk-filter-row">
          <div className="pill-group" role="group" aria-label="Filter kategori">
            <button
              type="button"
              className={`pill-btn ${categoryFilter === ALL ? `is-active ${pillClassFor(ALL)}` : ''}`}
              onClick={() => handleCategoryChange(ALL)}
            >
              Semua
            </button>
            {activeCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`pill-btn ${categoryFilter === cat ? `is-active ${pillClassFor(cat)}` : ''}`}
                onClick={() => handleCategoryChange(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="produk-filter-row">
          <label className="period-picker-label" htmlFor="toko-filter">Toko</label>
          <select
            id="toko-filter"
            className="category-select"
            value={tokoFilter}
            onChange={(e) => setTokoFilter(e.target.value)}
          >
            <option value={ALL}>
              Semua toko{categoryFilter !== ALL ? ` (${categoryFilter})` : ''}
            </option>
            {tokoOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <h3 className="block-title">Peringkat produk terlaris</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Kode</th>
              <th>Nama produk</th>
              <th className="num">Qty terjual</th>
              <th className="num">% dari total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p, i) => (
              <tr key={p.kode}>
                <td className="num muted">{i + 1}</td>
                <td className="mono">{p.kode}</td>
                <td>{p.nama || <span className="muted">Kode {p.kode} — tidak ditemukan di master barang</span>}</td>
                <td className="num mono">{formatNumber(p.qty)}</td>
                <td className="num mono">{totalQty > 0 ? ((p.qty / totalQty) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            ))}
            {ranked.length === 0 && (
              <tr><td colSpan={5} className="muted">Tidak ada produk terjual untuk filter ini.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="num"></td>
              <td></td>
              <td>Total</td>
              <td className="num mono">{formatNumber(totalQty)}</td>
              <td className="num mono">100.0%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
