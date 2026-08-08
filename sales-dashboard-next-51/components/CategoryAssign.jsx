'use client'

import { formatRupiah, formatNumber } from '@/lib/parseData'

export const CATEGORY_OPTIONS = ['Online Underwear', 'Online Sport']
export const UNCATEGORIZED = 'Tidak dikategorikan'

export default function CategoryAssign({ data, categories, onChange }) {
  const total = data.rankedCustomers.length
  const assignedCount = data.rankedCustomers.filter((c) => categories[c]).length

  function handleClick(customer, option) {
    // Klik tombol yang sudah aktif -> batalkan (kembali ke tidak dikategorikan).
    // Klik tombol lain -> ganti kategori.
    const isActive = categories[customer] === option
    onChange(customer, isActive ? '' : option)
  }

  return (
    <div className="table-block">
      <div className="table-block-header">
        <h3 className="block-title">Tandai kategori pelanggan penagihan</h3>
        <span className="assign-progress">
          {assignedCount} / {total} sudah ditandai
        </span>
      </div>
      <p className="assign-hint">
        Kategori sudah ditandai otomatis berdasarkan nama brand. Klik tombol lain untuk mengubah, atau klik
        tombol yang sedang aktif untuk membatalkan. Yang tidak ditandai dianggap{' '}
        <em>{UNCATEGORIZED.toLowerCase()}</em> dan tidak masuk ringkasan kategori di bawah.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pelanggan penagihan</th>
              <th className="num">Total omset</th>
              <th className="num">Total order</th>
              <th>Kategori</th>
            </tr>
          </thead>
          <tbody>
            {data.rankedCustomers.map((c) => {
              const active = categories[c] || ''
              return (
                <tr key={c}>
                  <td>{c}</td>
                  <td className="num mono">{formatRupiah(data.customerTotals[c])}</td>
                  <td className="num mono">{formatNumber(data.customerCounts[c])}</td>
                  <td>
                    <div className="pill-group" role="group" aria-label={`Kategori untuk ${c}`}>
                      {CATEGORY_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={`pill-btn ${active === opt ? `is-active pill-${opt === 'Online Underwear' ? 'underwear' : 'sport'}` : ''}`}
                          aria-pressed={active === opt}
                          onClick={() => handleClick(c, opt)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
