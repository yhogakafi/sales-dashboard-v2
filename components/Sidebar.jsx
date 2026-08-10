'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="12" width="4" height="9" rx="1" fill={active ? '#8886F0' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="10" y="7" width="4" height="14" rx="1" fill={active ? '#8886F0' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="17" y="3" width="4" height="18" rx="1" fill={active ? '#8886F0' : 'none'} stroke="currentColor" strokeWidth="1.8" />
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
          fill={active ? '#8886F0' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
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
    href: '/app',
    label: 'App',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" fill={active ? '#8886F0' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" fill={active ? '#8886F0' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" fill={active ? '#8886F0' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" fill={active ? '#8886F0' : 'none'} stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: '/admin',
    label: 'Admin',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="3" fill={active ? '#8886F0' : 'none'} stroke="currentColor" strokeWidth="1.8" />
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

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

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
        className="sidebar-mobile-toggle"
        aria-label="Buka menu navigasi"
        onClick={() => setMobileOpen(true)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-open' : ''}`}
        aria-label="Navigasi utama"
      >
        <div className="sidebar-top">
          <span className="sidebar-brand">{collapsed ? 'TMS' : 'TMS Online'}</span>
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
      </aside>
    </>
  )
}
