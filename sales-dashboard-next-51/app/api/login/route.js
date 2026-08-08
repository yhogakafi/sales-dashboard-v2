import { NextResponse } from 'next/server'
import { checkAdminPassword, ADMIN_COOKIE_NAME } from '@/lib/auth'

export async function POST(request) {
  const { password } = await request.json()

  if (!checkAdminPassword(password)) {
    return NextResponse.json({ error: 'Password salah.' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE_NAME, password, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 hari
  })
  return res
}
