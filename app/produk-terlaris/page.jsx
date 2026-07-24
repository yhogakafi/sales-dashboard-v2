'use client'

import { useCallback, useEffect, useState } from 'react'

export default function ProdukTerlarisPage() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then((res) => {
        setLoggedIn(res.ok)
        setCheckingSession(false)
      })
      .catch(() => setCheckingSession(false))
  }, [])

  const handleLogin = useCallback(async (e) => {
    e.preventDefault()
    setLoginError(null)
    setLoginLoading(true)
    try {
      const res = await fetch('/api/viewer-login', {
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

  if (checkingSession) {
    return <div className="app-shell admin-login-shell"><p className="loading-text">Memeriksa sesi…</p></div>
  }

  if (!loggedIn) {
    return (
      <div className="app-shell admin-login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <p className="eyebrow">Produk Terlaris</p>
          <h1>Masukkan password tim untuk melihat</h1>
          <input type="password" placeholder="Password tim" value={password}
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
          <p className="eyebrow">Dashboard penjualan</p>
          <h1>Produk Terlaris</h1>
        </div>
      </header>

      <div className="placeholder-block">
        <div className="placeholder-icon">🚧</div>
        <p className="placeholder-title">Halaman ini sedang dikembangkan</p>
        <p className="placeholder-sub">
          Data produk terlaris akan tampil di sini. Untuk sementara, gunakan menu Dashboard
          untuk melihat analisa penjualan yang sudah tersedia.
        </p>
      </div>
    </div>
  )
}
