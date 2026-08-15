/**
 * THE PRIVATE SESSION, its four numbers.
 *
 * Kept here rather than in the route, because a Next route file is only
 * allowed to export handlers and anything else there fails the build. The
 * booking screen, the buy route and the sessions desk all read the same row
 * through this, so there is one shape and one set of bounds.
 */

export interface SessionConfig {
  /** What one private session costs. Both rails derive from it. */
  price_cents: number
  /** Cases that can be opened in a clinic day. Booking closes when it is hit. */
  capacity_per_day: number
  /**
   * Cases one patient can open in a clinic day. Held at 1 for quality: the
   * desk owes a finished song for every case, and a patient who can book
   * five in an afternoon fills the queue with whatever comes to mind.
   */
  per_patient_per_day: number
  /** What the waiting room counts down from, per case, unless overridden. */
  estimate_minutes: number
  /** The master switch. False means the booking screen refuses politely. */
  booking_open: boolean
}

export const SESSION_FALLBACK: SessionConfig = {
  price_cents: 200,
  capacity_per_day: 10,
  per_patient_per_day: 1,
  estimate_minutes: 120,
  booking_open: false,
}

export function sessionNum(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function readSessionConfig(raw: unknown): SessionConfig {
  try {
    // app_settings.value arrives as text OR as an already-parsed object when
    // the column is jsonb. Parsing String(object) yields "[object Object]",
    // which throws and would silently drop everything saved here.
    const v =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : JSON.parse(String(raw ?? "{}"))
    return {
      price_cents: sessionNum(v.price_cents, SESSION_FALLBACK.price_cents, 1, 100000),
      capacity_per_day: sessionNum(v.capacity_per_day, SESSION_FALLBACK.capacity_per_day, 0, 1000),
      per_patient_per_day: sessionNum(v.per_patient_per_day, SESSION_FALLBACK.per_patient_per_day, 1, 50),
      estimate_minutes: sessionNum(v.estimate_minutes, SESSION_FALLBACK.estimate_minutes, 1, 10080),
      booking_open: v.booking_open === true,
    }
  } catch {
    return { ...SESSION_FALLBACK }
  }
}
