'use client'

import { useState } from 'react'

export default function KpiCard({ label, value, sub, color = '#ea580c', raw, onCopy }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e) => {
    e.stopPropagation()
    if (!raw && raw !== 0) return

    const textToCopy = String(raw)
    const onSuccess = () => {
      setCopied(true)
      if (onCopy) onCopy(`Disalin: ${textToCopy}`)
      setTimeout(() => setCopied(false), 1500)
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy).then(onSuccess).catch(() => {
        fallbackCopy(textToCopy, onSuccess)
      })
    } else {
      fallbackCopy(textToCopy, onSuccess)
    }
  }

  function fallbackCopy(text, cb) {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.top = '0'
      ta.style.left = '0'
      ta.style.opacity = '0'
      ta.setAttribute('readonly', '')
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok && cb) cb()
    } catch {
      // ignore
    }
  }

  return (
    <div className="aff-kpi-card" style={{ '--kc': color }}>
      <button
        type="button"
        className={`kpi-copy-btn ${copied ? 'copied' : ''}`}
        title="Salin nilai tanpa pemisah ribuan atau mata uang"
        onClick={handleCopy}
      >
        {copied ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <div className="aff-kpi-label">{label}</div>
      <div className="aff-kpi-val">{value}</div>
      {sub && <div className="aff-kpi-sub">{sub}</div>}
    </div>
  )
}
