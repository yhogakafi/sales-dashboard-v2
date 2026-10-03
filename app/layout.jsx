import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata = {
  title: 'TMS Online',
  description: 'Dashboard penjualan toko online — khusus tim, perlu password untuk melihat.',
  icons: {
    icon: [
      { url: '/lemon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/lemon.svg',
    apple: '/lemon.svg',
  },
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="icon" href="/lemon.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/lemon.svg" />
        <link rel="apple-touch-icon" href="/lemon.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Sidebar />
        {children}
      </body>
    </html>
  )
}
