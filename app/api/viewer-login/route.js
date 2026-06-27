import { NextResponse } from 'next/server'
import { checkViewerPassword, VIEWER_COOKIE_NAME } from '@/lib/auth'

export async function POST(request) {
  const { password } = await request.json()

  if (!checkViewerPassword(password)) {
    return NextResponse.json({ error: 'Password salah.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(VIEWER_COOKIE_NAME, password, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 hari -- lebih panjang dari admin karena tim cuma lihat, tidak perlu sering re-login
  })
  return res
}
