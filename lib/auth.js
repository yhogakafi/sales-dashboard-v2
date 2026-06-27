// Autentikasi admin sederhana: satu password yang disimpan di environment
// variable ADMIN_PASSWORD (diset di Vercel, jangan ditaruh di kode).
// Cocok untuk kasus "cuma saya yang upload" — bukan sistem login multi-user.

export function checkAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) {
    // Kalau env var belum diset sama sekali, tolak semua percobaan login
    // supaya tidak ada celah "password kosong = lolos".
    return false
  }
  return password === expected
}

export const ADMIN_COOKIE_NAME = 'admin_session'

export function checkAdminCookie(cookieValue) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return false
  return cookieValue === expected
}
