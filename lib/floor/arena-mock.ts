/**
 * lib/floor/arena-mock.ts
 *
 * PHASE 1 ONLY. Mock data and helpers for The Read, the skill contest that sits
 * beside Backings on the Floor. No chain, no funds, no network. Everything here
 * is fake and local so the whole flow can be felt and shown.
 *
 * The model (locked): you pay a small Ammo entry to compete, you forecast what
 * the app's own listening does, points add up across a Season, and the five
 * highest totals win a fixed USDC prize the house or a sponsor puts up. The
 * subjects are the artists and their Node Power and streams. $ONUS is never used
 * here. BONK appears only as the public buy and burn target.
 *
 * The Floor pays people for listening (Node Power times Embers, a share of the
 * drop). The Read pays people for calling it. Two prizes, kept separate, so
 * spending never buys the skill prize.
 *
 * Scoring runs on the fraction of each call's lock window that has passed, so
 * one curve fits every tempo. Lock at the open for the full points, lock at the
 * buzzer for the floor, a wrong call scores zero, same Ammo paid either way.
 *
 * Revenue is secret. Nothing here feeds a total take, a house cut, or a burn
 * spend to a player surface. Players see the prize, points, standings, their
 * winnings, and the BONK that was burned.
 */

export type Stage = "filter" | "grind" | "gauntlet"
export type CallType = "pumpdump" | "number" | "hit"
export type Bracket = "pump" | "diamond" | "dump"
export type ArenaView = "signups" | "filter" | "grind" | "gauntlet" | "results" | "board"

/* Admin dials (Phase 2 moves these into the Season console). */
export const SPLIT = [40, 25, 15, 12, 8] // top five share, percent
export const BAND_PCT = 2 // Node Power band around the open, percent
export const SPEED_MAX = 100 // points for a correct call at the open
export const SPEED_FLOOR = 10 // points for a correct call at the buzzer

export const SEASON = {
  id: "S07",
  title: "SEASON 07",
  kind: "DAILY",
  sponsor: "BONK", // null means house funded
  entryAmmo: 250, // Ammo entry, ~2.50 at 100 Ammo per dollar
  prizeFloorUsd: 50,
  prizeCapUsd: 200,
  prizeNowUsd: 130, // climbs with entries, player visible
  entrants: 284,
  schedule: "Today · Filter 11:00 · Grind 14:00 · Gauntlet 20:00 GMT",
}

export interface Artist {
  id: string
  name: string
  ticker: string
  color: string
  np: number // current Node Power
  streams: number // streams so far in the current window
}

export const ARTISTS: Artist[] = [
  { id: "lola-likwidity", name: "Lola Likwidity", ticker: "LOLA", color: "#ff2e7e", np: 18400, streams: 2120 },
  { id: "mcbagholder", name: "McBagholder", ticker: "BAGS", color: "#ffc847", np: 16950, streams: 1880 },
  { id: "satosheek", name: "Satosheek", ticker: "SATO", color: "#7af5c0", np: 21240, streams: 2670 },
  { id: "chartnobyl-bro", name: "Chartnobyl", ticker: "CHRT", color: "#c6ff2e", np: 14110, streams: 1540 },
  { id: "coinalisa", name: "Coinalisa", ticker: "COIN", color: "#5ac8fa", np: 12030, streams: 1290 },
  { id: "dj-dustwallet", name: "DJ Dustwallet", ticker: "DUST", color: "#a855f7", np: 9880, streams: 1015 },
  { id: "shilliam-dafoe", name: "Shilliam Dafoe", ticker: "SHIL", color: "#ff8a3d", np: 8460, streams: 870 },
]
export const artistById = (id: string): Artist => ARTISTS.find((a) => a.id === id) as Artist

export interface StageConfig {
  key: Stage
  step: number
  name: string
  tagline: string
  blurb: string
  calls: number
  lockWindowSec: number
  types: CallType[]
}

export const STAGES: StageConfig[] = [
  {
    key: "filter",
    step: 1,
    name: "The Filter",
    tagline: "fast reads on the board",
    blurb:
      "Quick Pump or Dump calls on where an artist's Node Power closes the window. Read the board, call the move, lock early. The opener that gets the whole field reading.",
    calls: 8,
    lockWindowSec: 8 * 60,
    types: ["pumpdump"],
  },
  {
    key: "grind",
    step: 2,
    name: "The Grind",
    tagline: "call the number",
    blurb:
      "Call the exact streams a track lands by close. Points for how close you get, multiplied by how early you lock it. The patient, precise stage where the deep readers pull ahead.",
    calls: 4,
    lockWindowSec: 30 * 60,
    types: ["number"],
  },
  {
    key: "gauntlet",
    step: 3,
    name: "The Gauntlet",
    tagline: "live, on the clock",
    blurb:
      "A live hour with the clock shifting under you, the whole field on one board. Fast Pump or Dump and Hit calls in short windows. Because points carry across all three stages, the standings settle right here.",
    calls: 8,
    lockWindowSec: 75,
    types: ["pumpdump", "hit"],
  },
]
export const stageByKey = (k: Stage): StageConfig => STAGES.find((s) => s.key === k) as StageConfig

export interface RoundSpec {
  n: number
  type: CallType
  artistId: string
  kind: "np" | "streams" // what the number measures
  open: number // value at the open
  settle: number // value at close (revealed after)
  lockWindowSec: number
  settleLabel: string // the window in words
  hitTarget?: number // for hit calls
}

const GAUNTLET_WINDOWS: { sec: number; label: string }[] = [
  { sec: 60, label: "the next 15 minutes" },
  { sec: 90, label: "the next 30 minutes" },
  { sec: 45, label: "the next 5 minutes" },
  { sec: 75, label: "the next 15 minutes" },
  { sec: 60, label: "the next 10 minutes" },
  { sec: 90, label: "the next 30 minutes" },
  { sec: 45, label: "the next 5 minutes" },
  { sec: 75, label: "the next 15 minutes" },
]

function buildRounds(stage: Stage): RoundSpec[] {
  const cfg = stageByKey(stage)
  const out: RoundSpec[] = []
  for (let i = 0; i < cfg.calls; i++) {
    const artist = ARTISTS[i % ARTISTS.length]
    const phase = stage === "grind" ? 0.6 : stage === "gauntlet" ? 1.25 : 0
    if (stage === "grind") {
      const open = artist.streams
      // deterministic close, varied direction and size
      const delta = Math.round(380 * Math.sin(i * 1.7 + phase) + 90 * Math.cos(i * 0.85))
      out.push({
        n: i + 1,
        type: "number",
        artistId: artist.id,
        kind: "streams",
        open,
        settle: Math.max(0, open + delta),
        lockWindowSec: cfg.lockWindowSec,
        settleLabel: "by 5pm",
      })
    } else if (stage === "gauntlet") {
      const win = GAUNTLET_WINDOWS[i % GAUNTLET_WINDOWS.length]
      const open = artist.np
      const delta = Math.round(620 * Math.sin(i * 1.9 + phase) + 140 * Math.cos(i * 0.9))
      const settle = open + delta
      const isHit = i % 3 === 2
      out.push({
        n: i + 1,
        type: isHit ? "hit" : "pumpdump",
        artistId: artist.id,
        kind: "np",
        open,
        settle,
        lockWindowSec: win.sec,
        settleLabel: win.label,
        hitTarget: isHit ? Math.round(open + (delta >= 0 ? 1 : -1) * Math.abs(delta) * 0.6) : undefined,
      })
    } else {
      const open = artist.np
      const delta = Math.round(540 * Math.sin(i * 1.7 + phase) + 120 * Math.cos(i * 0.85))
      out.push({
        n: i + 1,
        type: "pumpdump",
        artistId: artist.id,
        kind: "np",
        open,
        settle: open + delta,
        lockWindowSec: cfg.lockWindowSec,
        settleLabel: "this hour",
      })
    }
  }
  return out
}

export const ROUNDS: Record<Stage, RoundSpec[]> = {
  filter: buildRounds("filter"),
  grind: buildRounds("grind"),
  gauntlet: buildRounds("gauntlet"),
}

/* The band around the open. Pump is above it, Dump below, Diamond Hands inside. */
export function bandFor(open: number, bandPct: number = BAND_PCT): { lo: number; hi: number } {
  const half = open * (bandPct / 100)
  return { lo: open - half, hi: open + half }
}
export function bracketOf(settle: number, open: number, bandPct: number = BAND_PCT): Bracket {
  const { lo, hi } = bandFor(open, bandPct)
  if (settle > hi) return "pump"
  if (settle < lo) return "dump"
  return "diamond"
}
export const BRACKET: Record<Bracket, { label: string; cssVar: string }> = {
  pump: { label: "PUMP", cssVar: "var(--up)" },
  diamond: { label: "DIAMOND HANDS", cssVar: "var(--gold)" },
  dump: { label: "DUMP", cssVar: "var(--down)" },
}

/* Speed score on the fraction of the lock window elapsed. */
export function speedPoints(frac: number, max: number = SPEED_MAX, floor: number = SPEED_FLOOR): number {
  const f = Math.min(1, Math.max(0, frac))
  return Math.round(floor + (max - floor) * (1 - f))
}
export const speedMult = (frac: number): number => {
  const f = Math.min(1, Math.max(0, frac))
  return 0.1 + 0.9 * (1 - f)
}

/* Number closeness, 0 to 100, full inside half a percent, zero beyond five. */
export function closenessScore(estimate: number, actual: number): number {
  if (actual <= 0) return 0
  const off = (Math.abs(estimate - actual) / actual) * 100
  if (off <= 0.5) return 100
  if (off >= 5) return 0
  return Math.round(100 * (1 - (off - 0.5) / (5 - 0.5)))
}

export const prizeForExact = (place: number): number => SEASON.prizeNowUsd * ((SPLIT[place - 1] ?? 0) / 100)

/* Formatters */
export const num = (n: number): string => Math.round(n).toLocaleString("en-US")
export const ammo = (n: number): string => Math.round(n).toLocaleString("en-US") + " Ammo"
export const usd0 = (n: number): string => "$" + Math.round(n).toLocaleString("en-US")
export const usd2 = (n: number): string =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pts = (n: number): string => Math.round(n).toLocaleString("en-US")
export const clockText = (s: number): string => {
  const t = Math.max(0, Math.floor(s))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  const mm = m < 10 ? "0" + m : "" + m
  const ss = sec < 10 ? "0" + sec : "" + sec
  return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss
}
export const compactBonk = (n: number): string => {
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B"
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  if (n >= 1e3) return Math.round(n / 1e3) + "k"
  return Math.round(n).toLocaleString("en-US")
}
export const shortTx = (tx: string): string => tx.slice(0, 4) + "…" + tx.slice(-4)

export interface Row {
  handle: string
  color: string
  points: number
  you?: boolean
}

const RIVALS: { handle: string; color: string; skill: number }[] = [
  { handle: "0xVesper", color: "#5ac8fa", skill: 1.0 },
  { handle: "candlewick", color: "#7af5c0", skill: 0.94 },
  { handle: "toptickterry", color: "#ffc847", skill: 0.9 },
  { handle: "jpegdealer", color: "#ff2e7e", skill: 0.86 },
  { handle: "gmfren", color: "#c6ff2e", skill: 0.82 },
  { handle: "hopium.exe", color: "#a855f7", skill: 0.78 },
  { handle: "degenmara", color: "#ff8a3d", skill: 0.74 },
  { handle: "rugmuncher", color: "#5ac8fa", skill: 0.7 },
  { handle: "paperhandz", color: "#ffc847", skill: 0.66 },
  { handle: "wenlambo", color: "#ff2e7e", skill: 0.62 },
  { handle: "ngmi.eth", color: "#7af5c0", skill: 0.58 },
  { handle: "redcandled", color: "#ff5470", skill: 0.54 },
]
const ceilingFor = (v: ArenaView): number =>
  v === "filter" ? 1700 : v === "grind" ? 3200 : v === "gauntlet" ? 4400 : 4700
const youBase = (v: ArenaView): number =>
  v === "filter" ? 720 : v === "grind" ? 2360 : v === "gauntlet" ? 3540 : 4180

export function standings(view: ArenaView, myPoints: number): Row[] {
  const ceil = ceilingFor(view)
  const rivals: Row[] = RIVALS.map((r, i) => ({
    handle: r.handle,
    color: r.color,
    points: Math.round(r.skill * ceil - (i % 3) * 41),
  }))
  const you: Row = { handle: "you", color: "#ffffff", points: youBase(view) + Math.max(0, myPoints), you: true }
  return [...rivals, you].sort((a, b) => b.points - a.points)
}

export function finalStandings(): Row[] {
  return [
    { handle: "0xVesper", color: "#5ac8fa", points: 4720 },
    { handle: "candlewick", color: "#7af5c0", points: 4540 },
    { handle: "toptickterry", color: "#ffc847", points: 4360 },
    { handle: "you", color: "#ffffff", points: 4180, you: true },
    { handle: "jpegdealer", color: "#ff2e7e", points: 3990 },
    { handle: "gmfren", color: "#c6ff2e", points: 3810 },
    { handle: "hopium.exe", color: "#a855f7", points: 3590 },
    { handle: "degenmara", color: "#ff8a3d", points: 3380 },
    { handle: "rugmuncher", color: "#5ac8fa", points: 3160 },
    { handle: "paperhandz", color: "#ffc847", points: 2960 },
  ]
}

export const YOUR_RUN = {
  rank: 4,
  points: 4180,
  stages: [
    { name: "The Filter", correct: 7, total: 8 },
    { name: "The Grind", correct: 3, total: 4 },
    { name: "The Gauntlet", correct: 6, total: 8 },
  ],
}

export const PUBLIC_BURN = {
  bonkBurned: 1_284_000_000,
  tx: "5xQ9fK2mJ7nB4pR8sT1vW3yZ6aD0cE9hG",
  when: "20:42 GMT",
}

export interface BoardRow {
  handle: string
  color: string
  points: number
  seasons: number
  best: string
  you?: boolean
}
export const BOARD_ALLTIME: BoardRow[] = [
  { handle: "0xVesper", color: "#5ac8fa", points: 29840, seasons: 7, best: "1st" },
  { handle: "candlewick", color: "#7af5c0", points: 26110, seasons: 7, best: "1st" },
  { handle: "toptickterry", color: "#ffc847", points: 24770, seasons: 6, best: "2nd" },
  { handle: "jpegdealer", color: "#ff2e7e", points: 21430, seasons: 7, best: "2nd" },
  { handle: "you", color: "#ffffff", points: 17260, seasons: 4, best: "4th", you: true },
  { handle: "gmfren", color: "#c6ff2e", points: 16040, seasons: 5, best: "3rd" },
  { handle: "hopium.exe", color: "#a855f7", points: 13880, seasons: 5, best: "5th" },
  { handle: "degenmara", color: "#ff8a3d", points: 11920, seasons: 4, best: "6th" },
]
