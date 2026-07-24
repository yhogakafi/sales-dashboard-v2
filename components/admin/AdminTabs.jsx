'use client'

const TABS = [
  { key: 'penjualan', label: 'Data Penjualan' },
  { key: 'master-barang', label: 'Master Barang' },
  { key: 'produk-terlaris', label: 'Produk Terlaris' },
]

export default function AdminTabs({ active, onChange }) {
  return (
    <div className="admin-tabs" role="tablist" aria-label="Bagian admin">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={`admin-tab-btn ${active === tab.key ? 'is-active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
