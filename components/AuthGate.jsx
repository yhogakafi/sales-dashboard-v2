'use client'

import { useCallback, useEffect, useState } from 'react'

// Auth gate generik: cek /api/session, kalau belum login tampilkan form
// viewer-login (pola yang sama persis dengan halaman Produk Terlaris).
// Dipakai oleh halaman /app dan sub-halamannya supaya tidak menduplikasi
// logic login di tiap file.
export default function AuthGate({ title = '', children }) {
  const [loggedIn, setLoggedIn]               = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [password, setPassword]               = useState('')
  const [loginError, setLoginError]           = useState(null)
  const [loginLoading, setLoginLoading]       = useState(false)

  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' })
      .then((res) => {
        setCheckingSession(false)
        if (res.ok) setLoggedIn(true)
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
          <p className="eyebrow">{title}</p>
          <h1>Masukkan password tim untuk melihat</h1>
          <input
            type="password"
            placeholder="Password tim"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="login-input"
            autoFocus
          />
          {loginError && <p className="upload-error">{loginError}</p>}
          <button type="submit" className="btn-export" disabled={loginLoading}>
            {loginLoading ? 'Memeriksa…' : 'Masuk'}
          </button>
        </form>
      </div>
    )
  }

  return children
}
