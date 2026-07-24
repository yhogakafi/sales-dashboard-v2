'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="12" width="4" height="9" rx="1" fill={active ? '#3B3A8C' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="10" y="7" width="4" height="14" rx="1" fill={active ? '#3B3A8C' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <rect x="17" y="3" width="4" height="18" rx="1" fill={active ? '#3B3A8C' : 'none'} stroke="currentColor" strokeWidth="1.8" />
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
          fill={active ? '#3B3A8C' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
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
    href: '/admin',
    label: 'Admin',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="3" fill={active ? '#3B3A8C' : 'none'} stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
        />
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="bottom-nav" aria-label="Navigasi utama">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-item ${isActive ? 'is-active' : ''}`}
          >
            <span className="bottom-nav-icon">{item.icon(isActive)}</span>
            <span className="bottom-nav-label">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
