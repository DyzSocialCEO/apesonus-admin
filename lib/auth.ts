import { cookies } from "next/headers"

const ADMIN_COOKIE_NAME = "stokmoji_admin_session"
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000

interface AdminSession {
  username: string
  loginAt: number
  expiresAt: number
}

export async function verifyCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const validUsername = process.env.ADMIN_USERNAME
  const validPassword = process.env.ADMIN_PASSWORD

  if (!validUsername || !validPassword) {
    console.error("Admin credentials not configured")
    return false
  }

  return username === validUsername && password === validPassword
}

export async function createSession(username: string): Promise<void> {
  const cookieStore = await cookies()
  const now = Date.now()

  const session: AdminSession = {
    username,
    loginAt: now,
    expiresAt: now + SESSION_DURATION,
  }

  const sessionToken = Buffer.from(JSON.stringify(session)).toString("base64")

  cookieStore.set(ADMIN_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION / 1000,
    path: "/",
  })
}

export async function getSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)

  if (!sessionCookie?.value) {
    return null
  }

  try {
    const session: AdminSession = JSON.parse(
      Buffer.from(sessionCookie.value, "base64").toString()
    )

    if (Date.now() > session.expiresAt) {
      await destroySession()
      return null
    }

    return session
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE_NAME)
}
