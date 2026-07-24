'use client'

import { useCallback, useState } from 'react'
import AdminTabs from '@/components/admin/AdminTabs'
import PenjualanAdminPanel from '@/components/admin/PenjualanAdminPanel'
import MasterBarangAdminPanel from '@/components/admin/MasterBarangAdminPanel'
import ProdukTerlarisAdminPanel from '@/components/admin/ProdukTerlarisAdminPanel'

const TAB_TITLES = {
  penjualan: 'Unggah & publikasikan data penjualan',
  'master-barang': 'Kelola master barang (katalog produk)',
  'produk-terlaris': 'Unggah & publikasikan produk terlaris',
}

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('penjualan')

  const handleLogin = useCallback(async (e) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Password salah.')
      setLoggedIn(true)
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }, [password])

  if (!loggedIn) {
    return (
      <div className="app-shell admin-login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <p className="eyebrow">Halaman admin</p>
          <h1>Masuk untuk unggah data</h1>
          <input type="password" placeholder="Password admin" value={password}
            onChange={(e) => setPassword(e.target.value)} className="login-input" autoFocus />
          {loginError && <p className="upload-error">{loginError}</p>}
          <button type="submit" className="btn-export" disabled={loginLoading}>
            {loginLoading ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Halaman admin</p>
          <h1>{TAB_TITLES[activeTab]}</h1>
        </div>
      </header>

      <AdminTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === 'penjualan' && <PenjualanAdminPanel />}
      {activeTab === 'master-barang' && <MasterBarangAdminPanel />}
      {activeTab === 'produk-terlaris' && <ProdukTerlarisAdminPanel />}
    </div>
  )
}
