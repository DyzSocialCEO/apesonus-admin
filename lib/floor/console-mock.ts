/**
 * lib/floor/console-mock.ts
 *
 * PHASE 2 ONLY. Admin side of The Read, the operator's console. No chain, no
 * funds, no network, no writes. This holds the things only the operator sees:
 * the editable Season config, the run state machine, and the private money view.
 *
 * It builds on lib/floor/arena-mock.ts so the operator and the player read the
 * same world. Change the config here and the player front would change with it.
 * That is the mirror rule, kept in one place.
 *
 * Revenue is secret. The ledger numbers in this file never reach a player
 * surface. They exist so the operator always knows entries in versus prize
 * paid out, and the revenue actually held.
 */

import { SEASON, STAGES, SPLIT, BAND_PCT, SPEED_MAX, SPEED_FLOOR, ARTISTS, type CallType } from "@/lib/floor/arena-mock"

export type SeasonState = "draft" | "signups" | "locked" | "filter" | "grind" | "gauntlet" | "settled" | "paid"

export const STATE_FLOW: { key: SeasonState; label: string; short: string }[] = [
  { key: "draft", label: "Draft", short: "building" },
  { key: "signups", label: "Signups open", short: "field filling" },
  { key: "locked", label: "Field locked", short: "entries closed" },
  { key: "filter", label: "The Filter", short: "stage 1 live" },
  { key: "grind", label: "The Grind", short: "stage 2 live" },
  { key: "gauntlet", label: "The Gauntlet", short: "stage 3 live" },
  { key: "settled", label: "Settled", short: "results in" },
  { key: "paid", label: "Paid", short: "closed out" },
]
export const stateIndex = (s: SeasonState): number => STATE_FLOW.findIndex((x) => x.key === s)

/* The action that moves the Season to the next state. */
export const NEXT_ACTION: Record<SeasonState, string | null> = {
  draft: "Open signups",
  signups: "Lock the field",
  locked: "Start The Filter",
  filter: "Settle Filter, start The Grind",
  grind: "Settle Grind, start The Gauntlet",
  gauntlet: "Close Gauntlet, settle the Season",
  settled: "Declare winners and pay",
  paid: null,
}
export const NEXT_STATE: Record<SeasonState, SeasonState | null> = {
  draft: "signups",
  signups: "locked",
  locked: "filter",
  filter: "grind",
  grind: "gauntlet",
  gauntlet: "settled",
  settled: "paid",
  paid: null,
}

export interface StageDial {
  calls: number
  lockSec: number
  settleLabel: string
  types: CallType[]
}
export interface SeasonConfig {
  title: string
  kind: "DAILY" | "WEEKLY" | "SPONSORED"
  sponsored: boolean
  sponsor: string
  entryAmmo: number
  prizeMode: "climbing" | "fixed"
  prizeFloor: number
  prizeCap: number
  prizeFixed: number
  payoutN: number // how many top ranks split the prize (proportional to points)
  funder: "house" | "sponsor" | "split"
  split: number[]
  slate: string[] // artist ids
  filter: StageDial
  grind: StageDial
  gauntlet: StageDial
  bandPct: number
  closeFull: number // closeness full credit inside this percent
  closeZero: number // closeness zero beyond this percent
  ptsMax: number
  ptsFloor: number
  entrants: number
  scheduleFilter: string
  scheduleGrind: string
  scheduleGauntlet: string
}

export function defaultConfig(): SeasonConfig {
  return {
    title: SEASON.title,
    kind: "DAILY",
    sponsored: !!SEASON.sponsor,
    sponsor: SEASON.sponsor || "",
    entryAmmo: SEASON.entryAmmo,
    prizeMode: "climbing",
    prizeFloor: SEASON.prizeFloorUsd,
    prizeCap: SEASON.prizeCapUsd,
    prizeFixed: 500,
    payoutN: 10,
    funder: "house",
    split: [...SPLIT],
    slate: ARTISTS.map((a) => a.id),
    filter: { calls: 8, lockSec: 8 * 60, settleLabel: "this hour", types: ["pumpdump"] },
    grind: { calls: 4, lockSec: 30 * 60, settleLabel: "by 5pm", types: ["number"] },
    gauntlet: { calls: 8, lockSec: 75, settleLabel: "the window", types: ["pumpdump", "hit"] },
    bandPct: BAND_PCT,
    closeFull: 0.5,
    closeZero: 5,
    ptsMax: SPEED_MAX,
    ptsFloor: SPEED_FLOOR,
    entrants: SEASON.entrants,
    scheduleFilter: "11:00",
    scheduleGrind: "14:00",
    scheduleGauntlet: "20:00",
  }
}

export const CALL_TYPES: { key: CallType; label: string }[] = [
  { key: "pumpdump", label: "Pump or Dump" },
  { key: "number", label: "The Number" },
  { key: "hit", label: "The Hit" },
]

export function prizeCommitted(c: SeasonConfig): number {
  if (c.prizeMode === "fixed") return c.prizeFixed
  const progress = Math.min(1, c.entrants / 400)
  return Math.round(c.prizeFloor + (c.prizeCap - c.prizeFloor) * progress)
}

export interface Ledger {
  entrants: number
  grossAmmo: number
  grossUsd: number
  prize: number
  funderPays: number // what the house actually pays from its own wallet
  held: number // net revenue kept after prize
  margin: number // held as a share of gross, percent
}

/* The private money view. Driven by the config so it is always honest. */
export function computeLedger(c: SeasonConfig): Ledger {
  const grossAmmo = c.entrants * c.entryAmmo
  const grossUsd = grossAmmo / 200 // $1 = 200 Ammo
  const prize = prizeCommitted(c)
  const funderPays = c.funder === "sponsor" ? 0 : c.funder === "split" ? Math.round(prize / 2) : prize
  const held = Math.round((grossUsd - funderPays) * 100) / 100
  const margin = grossUsd > 0 ? Math.round((held / grossUsd) * 100) : 0
  return { entrants: c.entrants, grossAmmo, grossUsd, prize, funderPays, held, margin }
}

/* Mock settle outcome for a stage, so the operator can run a dry pass. */
export interface SettleRow {
  ticker: string
  color: string
  subject: string
  open: number
  close: number
  result: string
  fieldPct: number // share of the field that got it right
}
