// Daftar "app" statis (HTML mandiri, biasanya berisi tool client-side yang
// pakai SheetJS/xlsx) yang ditaruh di lib/staticApps/ — sengaja DI LUAR
// folder public/ supaya tidak bisa diakses langsung tanpa login. Halaman
// /app/[slug] dan API /api/static-app/[slug] yang mengatur akses & auth-nya.

import fs from 'fs'
import path from 'path'
import { APPS } from './staticAppsList'

export function getStaticAppHtml(slug) {
  const meta = APPS[slug]
  if (!meta) return null
  const filePath = path.join(process.cwd(), 'lib', 'staticApps', meta.file)
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}
