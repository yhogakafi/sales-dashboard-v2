'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import LemonIcon from '@/components/LemonIcon'

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="12" width="4" height="9" rx="1" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="10" y="7" width="4" height="14" rx="1" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="17" y="3" width="4" height="18" rx="1" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: '/produk-terlaris',
    label: 'Produk Terlaris',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M7 4H17V9C17 11.7614 14.7614 14 12 14C9.23858 14 7 11.7614 7 9V4Z"
          fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
        />
        <path d="M7 5H4V7C4 8.65685 5.34315 10 7 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M17 5H20V7C20 8.65685 18.6569 10 17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 14V18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8.5 21H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9.5 18H14.5L15 21H9L9.5 18Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/stok-marketplace',
    label: 'Stok Marketplace',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"
          fill={active ? '#EAB308' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M16 10a4 4 0 0 1-8 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: '/affiliate',
    label: 'Affiliate',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="18" cy="5" r="3" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <circle cx="6" cy="12" r="3" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <circle cx="18" cy="19" r="3" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="currentColor" strokeWidth="1.8" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: '/laporan-affiliate',
    label: 'Laporan Affiliate',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 2V8H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 13H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M16 17H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M10 9H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/laporan-live',
    label: 'Laporan Live',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 10L20 6.5V17.5L15 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="6" width="12" height="12" rx="3" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <circle cx="9" cy="12" r="2.5" fill={active ? '#713F12' : 'currentColor'} />
      </svg>
    ),
  },
  {
    href: '/pelanggan',
    label: 'Pelanggan',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 21V19C16 17.9391 15.5786 16.9217 14.8284 16.1716C14.0783 15.4214 13.0609 15 12 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 11C10.433 11 12 9.433 12 7.5C12 5.567 10.433 4 8.5 4C6.567 4 5 5.567 5 7.5C5 9.433 6.567 11 8.5 11Z" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 21V19C19.9993 18.1137 19.7044 17.2528 19.1614 16.5523C18.6184 15.8519 17.8581 15.3516 17 15.13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 4.13C15.8604 4.35031 16.623 4.85071 17.1676 5.55232C17.7122 6.25392 18.0078 7.11683 18.0078 8.005C18.0078 8.89317 17.7122 9.75608 17.1676 10.4577C16.623 11.1593 15.8604 11.6597 15 11.88" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/app',
    label: 'App',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: '/admin',
    label: 'Admin',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="3" fill={active ? '#EAB308' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        />
      </svg>
    ),
  },
]

const STORAGE_KEY = 'sidebar-collapsed'

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Restore collapsed state after mount (avoids SSR/localStorage mismatch)
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved === '1') setCollapsed(true)
  }, [])

  // Reflect the sidebar's current width as a CSS var on <html>, so the page
  // content (a plain server-rendered layout) can react to it via CSS alone
  // without needing to become a client component itself.
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '68px' : '224px')
  }, [collapsed])

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Close the mobile menu on Escape key
  useEffect(() => {
    if (!mobileOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <>
      <button
        type="button"
        className={`sidebar-mobile-toggle ${mobileOpen ? 'is-active' : ''}`}
        aria-label={mobileOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
      >
        <LemonIcon size={20} />
        <span className="sidebar-mobile-toggle-text">Menu</span>
      </button>

      {mobileOpen && (
        <>
          <div
            className="mobile-floating-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="mobile-floating-menu" role="dialog" aria-label="Menu Navigasi">
            <div className="mobile-floating-header">
              <div className="mobile-floating-brand">
                <LemonIcon size={20} />
                <span className="mobile-floating-title">TMS Online</span>
              </div>
              <button
                type="button"
                className="mobile-floating-close"
                onClick={() => setMobileOpen(false)}
                aria-label="Tutup menu"
              >
                ✕
              </button>
            </div>

            <nav className="mobile-floating-nav">
              {NAV_ITEMS.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mobile-floating-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <span className="mobile-floating-icon">{item.icon(isActive)}</span>
                    <span className="mobile-floating-label">{item.label}</span>
                    {isActive && <span className="mobile-floating-active-dot" />}
                  </Link>
                )
              })}
            </nav>
          </div>
        </>
      )}

      <aside
        className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}
        aria-label="Navigasi utama"
      >
        <div className="sidebar-top">
          <div className="sidebar-brand-wrap">
            <LemonIcon size={22} className="sidebar-brand-icon" />
            <span className="sidebar-brand">{collapsed ? 'TMS' : 'TMS Online'}</span>
          </div>
          <div className="sidebar-top-actions">
            <button
              type="button"
              className="sidebar-collapse-btn"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
              title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            >
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
              >
                <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className="sidebar-close-mobile"
              aria-label="Tutup menu navigasi"
              onClick={() => setMobileOpen(false)}
            >
              ✕
            </button>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-nav-item ${isActive ? 'is-active' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span className="sidebar-nav-icon">{item.icon(isActive)}</span>
                <span className="sidebar-nav-label">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div
          className="sidebar-footer"
          title={collapsed ? 'TMS Online — Dashboard penjualan tim TMS Online' : undefined}
        >
          <div className="sidebar-footer-brand">
            <LemonIcon size={20} className="sidebar-footer-icon" />
            <span className="sidebar-footer-title">TMS Online</span>
          </div>
          <p className="sidebar-footer-desc">
            Dashboard penjualan tim TMS Online
          </p>
        </div>
      </aside>
    </>
  )
}

