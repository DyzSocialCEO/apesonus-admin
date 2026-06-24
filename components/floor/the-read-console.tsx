"use client"

/**
 * components/floor/the-read-console.tsx
 *
 * PHASE 2 — The Read, the operator's console, on mock data. Build a Season, run
 * it through every state, and read the private money view. No chain, no funds,
 * no writes. This is the admin mirror of the player Arena, and it reads the same
 * world from lib/floor/arena-mock so the two never drift.
 *
 * Three tabs. Build sets every dial and shows the player-facing result live. Run
 * walks the Season from draft to paid with the right control at each step. The
 * Ledger is the private money view, entries in versus prize and burn out, the
 * revenue held. The Ledger is admin only and never reaches a player.
 *
 * Revenue is secret. Nothing here computes a take onto a player surface. $ONUS
 * never appears. BONK is only the public buy and burn target.
 *
 * React 19 / Next 16 safe: no <style> or font <link> in the tree, the style
 * block is injected into <head> on mount, fonts are the app's global Anton,
 * Space Mono, and Archivo.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  ARTISTS,
  ROUNDS,
  bandFor,
  bracketOf,
  BRACKET,
  standings,
  finalStandings,
  prizeForExact,
  artistById,
  num,
  ammo,
  usd0,
  usd2,
  pts,
  compactBonk,
  type Bracket,
  type Stage,
  type Row,
} from "@/lib/floor/arena-mock"
import {
  defaultConfig,
  STATE_FLOW,
  stateIndex,
  NEXT_ACTION,
  NEXT_STATE,
  CALL_TYPES,
  prizeCommitted,
  computeLedger,
  type SeasonConfig,
  type SeasonState,
  type StageDial,
  type SettleRow,
} from "@/lib/floor/console-mock"

function useConsoleStyles() {
  useEffect(() => {
    if (!document.getElementById("read-console-styles")) {
      const st = document.createElement("style")
      st.id = "read-console-styles"
      st.textContent = CSS
      document.head.appendChild(st)
    }
  }, [])
}

type Tab = "build" | "run" | "ledger"
const lockLabel = (sec: number): string => (sec < 120 ? sec + "s" : Math.round(sec / 60) + "m")

export function TheReadConsole() {
  useConsoleStyles()
  const [tab, setTab] = useState<Tab>("build")
  const [cfg, setCfg] = useState<SeasonConfig>({ ...defaultConfig(), entrants: 0 })
  const [state, setState] = useState<SeasonState>("draft")
  const [settledStages, setSettledStages] = useState<Stage[]>([])
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [liveStandings, setLiveStandings] = useState<any[]>([])
  const [liveCalls, setLiveCalls] = useState<any[]>([])

  // Full hydrate once, so the console resumes the live Season (and its dials)
  // on reload.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch("/api/admin/the-read", { cache: "no-store" })
        if (!r.ok) return
        const d = await r.json()
        if (!alive) return
        if (d?.season) {
          setSeasonId(d.season.id)
          setState(d.season.state)
          setCfg((c) => ({ ...c, ...d.season.config, entrants: d.season.entrants ?? 0 }))
        }
        setLiveStandings(Array.isArray(d?.standings) ? d.standings : [])
        setLiveCalls(Array.isArray(d?.stage_calls) ? d.stage_calls : [])
      } catch {
        // leave the defaults in place
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Light poll: refresh the live board, the stage's calls, the state, and the
  // entrant count. Never the dials, so an in-progress Build edit is safe.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/admin/the-read", { cache: "no-store" })
        if (!r.ok) return
        const d = await r.json()
        if (d?.season) {
          setState(d.season.state)
          setCfg((c) => ({ ...c, entrants: d.season.entrants ?? 0 }))
        }
        setLiveStandings(Array.isArray(d?.standings) ? d.standings : [])
        setLiveCalls(Array.isArray(d?.stage_calls) ? d.stage_calls : [])
      } catch {
        // keep last known
      }
    }, 5000)
    return () => clearInterval(t)
  }, [])

  const set = <K extends keyof SeasonConfig>(k: K, v: SeasonConfig[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const setStage = (key: Stage, patch: Partial<StageDial>) =>
    setCfg((c) => ({ ...c, [key]: { ...c[key], ...patch } }))

  const splitSum = cfg.split.reduce((a, b) => a + b, 0)
  const idx = stateIndex(state)

  async function post(action: string, extra: Record<string, unknown>) {
    const r = await fetch("/api/admin/the-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action, season_id: seasonId, ...extra }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d?.ok === false) throw new Error(d?.error || "request failed")
    return d
  }

  async function saveDraft() {
    if (busy) return
    setBusy(true)
    setNote(null)
    try {
      const d = await post("save", { config: cfg })
      setSeasonId(d.id)
      setNote("Draft saved")
    } catch (e: any) {
      setNote(e?.message || "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function advance() {
    if (busy) return
    const next = NEXT_STATE[state]
    if (!next) return
    setBusy(true)
    setNote(null)
    try {
      let newState: SeasonState
      if (state === "draft") {
        const d = await post("open_signups", { config: cfg })
        setSeasonId(d.id)
        newState = d.state
      } else {
        const d = await post("advance", { to: next })
        newState = d.state
      }
      if (state === "filter" || state === "grind" || state === "gauntlet") {
        const cur: Stage = state
        setSettledStages((s) => (s.includes(cur) ? s : [...s, cur]))
      }
      setState(newState)
      if (newState === "signups" || newState === "filter") setTab("run")
    } catch (e: any) {
      setNote(e?.message || "Action failed")
    } finally {
      setBusy(false)
    }
  }

  async function discard() {
    if (busy) return
    if (!seasonId) {
      setState("draft")
      setCfg({ ...defaultConfig(), entrants: 0 })
      setSettledStages([])
      setTab("build")
      setNote("Fresh draft ready")
      return
    }
    if (!window.confirm("Discard this Season? It is archived and removed from players, and you start a fresh draft. This can't be undone.")) return
    setBusy(true)
    setNote(null)
    try {
      await post("discard", {})
      setSeasonId(null)
      setState("draft")
      setCfg({ ...defaultConfig(), entrants: 0 })
      setSettledStages([])
      setLiveStandings([])
      setLiveCalls([])
      setTab("build")
      setNote("Season discarded. Fresh draft ready.")
    } catch (e: any) {
      setNote(e?.message || "Discard failed")
    } finally {
      setBusy(false)
    }
  }

  async function reopenWindow() {
    if (busy || !seasonId) return
    setBusy(true)
    setNote(null)
    try {
      await post("reopen_window", {})
      setNote("Lock window reopened. Players can lock this stage again.")
    } catch (e: any) {
      setNote(e?.message || "Reopen failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rc">
      <style id="read-console-styles" dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="rc-wrap">
        <header className="rc-head">
          <div className="rc-head-l">
            <span className="rc-kicker">APESONUS · ADMIN</span>
            <h1 className="rc-title">THE READ · SEASON CONSOLE</h1>
          </div>
          <div className="rc-head-r">
            <span className="rc-season">{cfg.title}</span>
            <span className={"rc-state s-" + state}>
              <i /> {STATE_FLOW[idx].label}
            </span>
            <button
              onClick={discard}
              disabled={busy}
              title="Archive this Season and start a fresh draft"
              style={{ marginLeft: 10, padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#ef9a9a", fontFamily: "monospace", fontSize: 11, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}
            >
              {!seasonId ? "Reset draft" : "Discard Season"}
            </button>
          </div>
        </header>

        <nav className="rc-tabs">
          {(["build", "run", "ledger"] as Tab[]).map((t) => (
            <button key={t} className={"rc-tab" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>
              {t === "build" ? "Build" : t === "run" ? "Run" : "Ledger"}
              {t === "ledger" && <span className="rc-tab-lock">private</span>}
            </button>
          ))}
        </nav>

        {tab === "build" && (
          <BuildTab cfg={cfg} set={set} setStage={setStage} splitSum={splitSum} onOpen={advance} onSave={saveDraft} busy={busy} note={note} state={state} />
        )}
        {tab === "run" && (
          <RunTab cfg={cfg} state={state} idx={idx} settledStages={settledStages} onAdvance={advance} onReopen={reopenWindow} busy={busy} liveBoard={liveStandings} liveCalls={liveCalls} />
        )}
        {tab === "ledger" && <LedgerTab cfg={cfg} />}
      </div>
    </div>
  )
}

/* ---------- small inputs ---------- */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="rc-field">
      <span className="rc-field-lbl">{label}</span>
      {children}
      {hint && <span className="rc-field-hint">{hint}</span>}
    </label>
  )
}
function NumIn({ value, onChange, suffix, step = 1, min = 0 }: { value: number; onChange: (n: number) => void; suffix?: string; step?: number; min?: number }) {
  return (
    <span className="rc-num">
      <input type="number" value={value} step={step} min={min} onChange={(e) => onChange(Number(e.target.value))} />
      {suffix && <em>{suffix}</em>}
    </span>
  )
}
function Seg<T extends string>({ value, opts, onChange }: { value: T; opts: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <span className="rc-seg">
      {opts.map((o) => (
        <button key={o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </span>
  )
}

function BuildTab({
  cfg,
  set,
  setStage,
  splitSum,
  onOpen,
  onSave,
  busy,
  note,
  state,
}: {
  cfg: SeasonConfig
  set: <K extends keyof SeasonConfig>(k: K, v: SeasonConfig[K]) => void
  setStage: (key: Stage, patch: Partial<StageDial>) => void
  splitSum: number
  onOpen: () => void
  onSave: () => void
  busy: boolean
  note: string | null
  state: SeasonState
}) {
  const prize = prizeCommitted(cfg)
  const stageRows: { key: Stage; name: string }[] = [
    { key: "filter", name: "The Filter" },
    { key: "grind", name: "The Grind" },
    { key: "gauntlet", name: "The Gauntlet" },
  ]
  return (
    <div className="rc-grid">
      <div className="rc-col">
        <section className="rc-card">
          <h3 className="rc-card-h">Identity</h3>
          <Field label="Season title">
            <input className="rc-text" value={cfg.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Cadence">
            <Seg value={cfg.kind} onChange={(v) => set("kind", v)} opts={[{ v: "DAILY", l: "Daily" }, { v: "WEEKLY", l: "Weekly" }, { v: "SPONSORED", l: "Sponsored" }]} />
          </Field>
          <Field label="Sponsor" hint="shows on the player tape and the foot">
            <span className="rc-inline">
              <Seg value={cfg.sponsored ? "y" : "n"} onChange={(v) => set("sponsored", v === "y")} opts={[{ v: "y", l: "On" }, { v: "n", l: "Off" }]} />
              {cfg.sponsored && <input className="rc-text" placeholder="BONK" value={cfg.sponsor} onChange={(e) => set("sponsor", e.target.value)} />}
            </span>
          </Field>
        </section>

        <section className="rc-card">
          <h3 className="rc-card-h">Entry and prize</h3>
          <Field label="Entry" hint={"players pay this in Ammo · " + usd2(cfg.entryAmmo / 100)}>
            <NumIn value={cfg.entryAmmo} onChange={(n) => set("entryAmmo", n)} suffix="Ammo" step={10} />
          </Field>
          <Field label="Prize shape">
            <Seg value={cfg.prizeMode} onChange={(v) => set("prizeMode", v)} opts={[{ v: "climbing", l: "Climbing" }, { v: "fixed", l: "Fixed" }]} />
          </Field>
          {cfg.prizeMode === "climbing" ? (
            <span className="rc-inline">
              <Field label="Floor"><NumIn value={cfg.prizeFloor} onChange={(n) => set("prizeFloor", n)} suffix="$" step={10} /></Field>
              <Field label="Cap"><NumIn value={cfg.prizeCap} onChange={(n) => set("prizeCap", n)} suffix="$" step={10} /></Field>
            </span>
          ) : (
            <Field label="Fixed prize"><NumIn value={cfg.prizeFixed} onChange={(n) => set("prizeFixed", n)} suffix="$" step={50} /></Field>
          )}
          <Field label="Funded by" hint="who covers the prize wallet">
            <Seg value={cfg.funder} onChange={(v) => set("funder", v)} opts={[{ v: "house", l: "House" }, { v: "sponsor", l: "Sponsor" }, { v: "split", l: "Split" }]} />
          </Field>
        </section>

        <section className="rc-card">
          <h3 className="rc-card-h">
            Top five split
            <span className={"rc-sum" + (splitSum === 100 ? " ok" : " bad")}>{splitSum}%</span>
          </h3>
          <div className="rc-split">
            {cfg.split.map((v, i) => (
              <Field key={i} label={i + 1 + (i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th")}>
                <NumIn value={v} onChange={(n) => set("split", cfg.split.map((x, j) => (j === i ? n : x)))} suffix="%" />
              </Field>
            ))}
          </div>
          {splitSum !== 100 && <p className="rc-warn">Split has to total 100. It is at {splitSum}.</p>}
        </section>

        <section className="rc-card">
          <h3 className="rc-card-h">Slate in play</h3>
          <div className="rc-slate">
            {ARTISTS.map((a) => {
              const on = cfg.slate.includes(a.id)
              return (
                <button
                  key={a.id}
                  className={"rc-art" + (on ? " on" : "")}
                  style={on ? { borderColor: a.color, color: a.color } : undefined}
                  onClick={() => set("slate", on ? cfg.slate.filter((x) => x !== a.id) : [...cfg.slate, a.id])}
                >
                  {a.ticker}
                </button>
              )
            })}
          </div>
          <p className="rc-card-note">{cfg.slate.length} of {ARTISTS.length} artists. Calls only draw from these.</p>
        </section>
      </div>

      <div className="rc-col">
        <section className="rc-card">
          <h3 className="rc-card-h">Stages</h3>
          {stageRows.map((s) => {
            const d = cfg[s.key]
            return (
              <div key={s.key} className="rc-stagecfg">
                <div className="rc-stagecfg-top">
                  <span className="rc-stagecfg-name">{s.name}</span>
                  <span className="rc-stagecfg-meta">{d.calls} calls · {lockLabel(d.lockSec)} to lock</span>
                </div>
                <div className="rc-stagecfg-row">
                  <Field label="Calls"><NumIn value={d.calls} onChange={(n) => setStage(s.key, { calls: n })} /></Field>
                  <Field label={"Lock (" + (s.key === "gauntlet" ? "sec" : "min") + ")"}>
                    <NumIn
                      value={s.key === "gauntlet" ? d.lockSec : Math.round(d.lockSec / 60)}
                      onChange={(n) => setStage(s.key, { lockSec: s.key === "gauntlet" ? n : n * 60 })}
                    />
                  </Field>
                </div>
                <div className="rc-stage-kind" style={{ marginTop: 10, fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
                  {s.key === "filter" && "Direction calls · pump, hold, or dump · on Node Power"}
                  {s.key === "grind" && "Number calls · name the exact streams"}
                  {s.key === "gauntlet" && "Mixed finale · direction + hit calls · on the clock"}
                </div>
              </div>
            )
          })}
        </section>

        <section className="rc-card">
          <h3 className="rc-card-h">Scoring dials</h3>
          <div className="rc-dials">
            <Field label="Pump or Dump band" hint="± around the open"><NumIn value={cfg.bandPct} onChange={(n) => set("bandPct", n)} suffix="%" step={0.5} /></Field>
            <Field label="Number full credit" hint="bullseye inside"><NumIn value={cfg.closeFull} onChange={(n) => set("closeFull", n)} suffix="%" step={0.1} /></Field>
            <Field label="Number zero past"><NumIn value={cfg.closeZero} onChange={(n) => set("closeZero", n)} suffix="%" step={0.5} /></Field>
            <Field label="Points at the open"><NumIn value={cfg.ptsMax} onChange={(n) => set("ptsMax", n)} suffix="pts" step={5} /></Field>
            <Field label="Points at the buzzer"><NumIn value={cfg.ptsFloor} onChange={(n) => set("ptsFloor", n)} suffix="pts" step={5} /></Field>
          </div>
        </section>

        <section className="rc-card">
          <h3 className="rc-card-h">Schedule</h3>
          <div className="rc-dials">
            <Field label="Filter opens"><input className="rc-text" value={cfg.scheduleFilter} onChange={(e) => set("scheduleFilter", e.target.value)} /></Field>
            <Field label="Grind opens"><input className="rc-text" value={cfg.scheduleGrind} onChange={(e) => set("scheduleGrind", e.target.value)} /></Field>
            <Field label="Gauntlet opens"><input className="rc-text" value={cfg.scheduleGauntlet} onChange={(e) => set("scheduleGauntlet", e.target.value)} /></Field>
          </div>
        </section>

        <section className="rc-card">
          <h3 className="rc-card-h">Buy and burn <span className="rc-priv">private</span></h3>
          <div className="rc-dials">
            <Field label="Burn share" hint="share of the take bought as BONK and burned"><NumIn value={cfg.burnPct} onChange={(n) => set("burnPct", n)} suffix="%" /></Field>
          </div>
        </section>

        <section className="rc-card rc-preview">
          <h3 className="rc-card-h">Player preview <span className="rc-pub">what they see</span></h3>
          <div className="rc-pv">
            <div className="rc-pv-row"><span>Entry</span><b>{ammo(cfg.entryAmmo)}</b></div>
            <div className="rc-pv-row"><span>Prize</span><b className="gold">{cfg.prizeMode === "climbing" ? usd0(prize) + " climbing" : usd0(cfg.prizeFixed)}</b></div>
            <div className="rc-pv-row"><span>Stages</span><b>{cfg.filter.calls + cfg.grind.calls + cfg.gauntlet.calls} calls over 3</b></div>
            <div className="rc-pv-row"><span>In play</span><b>{cfg.slate.length} artists</b></div>
            <div className="rc-pv-row"><span>Sponsor</span><b>{cfg.sponsored ? cfg.sponsor || "set a name" : "house"}</b></div>
          </div>
          {state === "draft" ? (
            <>
              <button className="rc-go" disabled={busy || splitSum !== 100 || cfg.slate.length < 2} onClick={onOpen}>
                {busy ? "Working…" : splitSum !== 100 ? "Fix the split to open" : cfg.slate.length < 2 ? "Pick at least two artists" : "Open signups ▸"}
              </button>
              <button
                className="rc-go"
                disabled={busy}
                onClick={onSave}
                style={{ marginTop: 8, background: "transparent", border: "1px solid rgba(255,255,255,0.22)", color: "rgba(255,255,255,0.82)" }}
              >
                {busy ? "Saving…" : "Save draft"}
              </button>
              {note && <p className="rc-card-note">{note}</p>}
            </>
          ) : (
            <>
              <p className="rc-card-note">Season is live in Run. Dials lock once signups open.</p>
              {note && <p className="rc-card-note">{note}</p>}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

const STAGE_NEXT_LABEL: Record<string, string> = {
  filter: "Start The Grind ▸",
  grind: "Start The Gauntlet ▸",
  gauntlet: "Settle the Season ▸",
}
const isStageState = (s: SeasonState): s is Stage => s === "filter" || s === "grind" || s === "gauntlet"

function settleRows(stage: Stage, slate: string[]): SettleRow[] {
  const rounds = ROUNDS[stage].filter((r) => slate.includes(r.artistId))
  const src = rounds.length ? rounds : ROUNDS[stage]
  return src.map((r, i) => {
    const a = artistById(r.artistId)
    let result = ""
    if (r.type === "pumpdump") result = BRACKET[bracketOf(r.settle, r.open)].label
    else if (r.type === "number") result = "landed " + num(r.settle)
    else {
      const target = r.hitTarget && r.hitTarget > r.open ? r.hitTarget : Math.round(r.open * 1.012)
      result = r.settle >= target ? "passed " + num(target) : "held under " + num(target)
    }
    return { ticker: a.ticker, color: a.color, subject: a.name, open: r.open, close: r.settle, result, fieldPct: 38 + ((i * 17) % 38) }
  })
}

const READ_TICKERS: Record<string, { ticker: string; color: string }> = {
  "lola-likwidity": { ticker: "LOLA", color: "#ff2e7e" },
  mcbagholder: { ticker: "BAGS", color: "#ffc847" },
  satosheek: { ticker: "SATO", color: "#7af5c0" },
  "chartnobyl-bro": { ticker: "CHRT", color: "#c6ff2e" },
  coinalisa: { ticker: "COIN", color: "#5ac8fa" },
  "dj-dustwallet": { ticker: "DUST", color: "#a855f7" },
  "shilliam-dafoe": { ticker: "SHIL", color: "#ff8a3d" },
}
function readChip(id: string): { ticker: string; color: string } {
  return READ_TICKERS[id] || { ticker: (id || "").slice(0, 4).toUpperCase() || "—", color: "#7af5c0" }
}

function RunTab({
  cfg,
  state,
  idx,
  settledStages,
  onAdvance,
  onReopen,
  busy,
  liveBoard,
  liveCalls,
}: {
  cfg: SeasonConfig
  state: SeasonState
  idx: number
  settledStages: Stage[]
  onAdvance: () => void
  onReopen: () => void
  busy: boolean
  liveBoard: any[]
  liveCalls: any[]
}) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const stage = isStageState(state) ? state : null
  const stageRevealed = stage ? !!revealed[stage] : false
  const board: Row[] = liveBoard.map((s: any) => ({
    rank: s.rank,
    handle: s.display_name,
    color: "#c6ff2e",
    points: Number(s.points) || 0,
    you: false,
  })) as Row[]
  const ledger = computeLedger(cfg)

  function primary() {
    onAdvance()
  }
  const primaryLabel = !NEXT_ACTION[state]
    ? null
    : stage
      ? "Settle " + (stage === "filter" ? "The Filter" : stage === "grind" ? "The Grind" : "The Gauntlet") + " ▸"
      : NEXT_ACTION[state] + " ▸"

  return (
    <div className="rc-run">
      <div className="rc-flow">
        {STATE_FLOW.map((s, i) => (
          <div key={s.key} className={"rc-step" + (i < idx ? " done" : "") + (i === idx ? " now" : "")}>
            <span className="rc-step-no">{i < idx ? "✓" : i + 1}</span>
            <span className="rc-step-lbl">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="rc-grid2">
        <div className="rc-col">
          <section className="rc-card rc-stagepanel">
            {state === "draft" && <Panel title="Not open yet" body="Open signups from the Build tab to begin the Season." />}

            {state === "signups" && (
              <Panel
                title="Signups open"
                body={"The field is filling. " + pts(cfg.entrants) + " in so far, each paying " + ammo(cfg.entryAmmo) + ". Lock the field when you are ready to start the calls."}
                stat={[{ l: "entered", v: pts(cfg.entrants) }, { l: "entry", v: ammo(cfg.entryAmmo) }, { l: "prize", v: usd0(prizeCommitted(cfg)) }]}
              />
            )}

            {state === "locked" && (
              <Panel
                title="Field locked"
                body={"Entries closed at " + pts(cfg.entrants) + ". The prize is set. Start The Filter to put the first calls live."}
                stat={[{ l: "field", v: pts(cfg.entrants) }, { l: "prize", v: usd0(prizeCommitted(cfg)) }, { l: "calls", v: String(cfg.filter.calls + cfg.grind.calls + cfg.gauntlet.calls) }]}
              />
            )}

            {stage && (
              <>
                <div className="rc-stagepanel-head">
                  <div>
                    <span className="rc-card-h" style={{ margin: 0 }}>
                      {stage === "filter" ? "The Filter" : stage === "grind" ? "The Grind" : "The Gauntlet"} is live
                    </span>
                    <span className="rc-stagepanel-sub">{cfg[stage].calls} calls · {lockLabel(cfg[stage].lockSec)} to lock each</span>
                  </div>
                  {stage === "gauntlet" && <span className="rc-livebadge"><i /> LIVE</span>}
                </div>
                <div className="rc-settle">
                  <div className="rc-settle-head">
                    <span>artist</span><span>type</span><span>open</span><span>status</span><span></span>
                  </div>
                  {liveCalls.slice(0, cfg[stage].calls).map((r: any, i: number) => {
                    const ch = readChip(r.artist_id)
                    return (
                      <div key={i} className={"rc-settle-row" + (r.settle_value != null ? " done" : "")}>
                        <span className="rc-settle-tk" style={{ color: ch.color }}>{ch.ticker}</span>
                        <span className="rc-settle-open">{r.type}</span>
                        <span className="rc-settle-close">{r.open_value != null ? num(r.open_value) : "·"}</span>
                        <span className="rc-settle-res">{r.settle_value != null ? "settled" : r.open_value != null ? "open" : "opening"}</span>
                        <span className="rc-settle-fld"></span>
                      </div>
                    )
                  })}
                  {liveCalls.length === 0 && (
                    <div className="rc-settle-row">
                      <span className="rc-settle-tk">—</span><span /><span /><span className="rc-settle-res">opening…</span><span />
                    </div>
                  )}
                </div>
                <p className="rc-card-note">Calls are open. The board on the right fills as scores land. Settle and start the next stage when the window closes.</p>
                <button
                  onClick={onReopen}
                  disabled={busy}
                  title="Restart the lock clock for this stage so players can lock again"
                  style={{ marginTop: 8, padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.8)", fontFamily: "monospace", fontSize: 12, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}
                >
                  ↻ Reopen the window
                </button>
              </>
            )}

            {state === "settled" && (
              <>
                <div className="rc-card-h">The five who read it right</div>
                <div className="rc-winners">
                  {board.slice(0, 5).map((r, i) => (
                    <div key={r.handle + "-" + i} className={"rc-winrow" + (i === 0 ? " first" : "")}>
                      <span className="rc-win-rk">{i + 1}</span>
                      <span className="rc-win-dot" style={{ background: r.color }} />
                      <span className="rc-win-nm">{r.handle}</span>
                      <span className="rc-win-pts">{pts(r.points)} pts</span>
                      <span className="rc-win-prize gold">{usd2(prizeCommitted(cfg) * (([40, 25, 15, 12, 8][i] ?? 0) / 100))}</span>
                    </div>
                  ))}
                  {board.length === 0 && <p className="rc-card-note" style={{ margin: 0 }}>No entrants scored yet.</p>}
                </div>
                <p className="rc-card-note">Declaring pays these five in USDC from the prize wallet and posts the public BONK burn.</p>
              </>
            )}

            {state === "paid" && (
              <>
                <Panel title="Season closed" body={"The five were paid " + usd0(prizeCommitted(cfg)) + " in USDC. The receipts are written. Spin up the next one in Build."} />
                <div className="rc-paidrow">
                  <div><span className="l">paid out</span><span className="v gold">{usd0(prizeCommitted(cfg))}</span></div>
                  <div><span className="l">BONK burned</span><span className="v">{compactBonk(ledger.bonkBurned)}</span></div>
                  <div><span className="l">held</span><span className="v">{usd2(ledger.held)}</span></div>
                </div>
              </>
            )}

            {primaryLabel && (
              <button className={"rc-go" + (stage === "gauntlet" && !stageRevealed ? " live" : "")} disabled={busy} onClick={primary}>
                {primaryLabel}
              </button>
            )}
          </section>
        </div>

        <div className="rc-col">
          <section className="rc-card">
            <h3 className="rc-card-h">{state === "settled" || state === "paid" ? "Final standings" : "Live field"}</h3>
            {state === "draft" || state === "signups" || state === "locked" ? (
              <div className="rc-runboard">
                <p className="rc-card-note" style={{ margin: 0 }}>
                  {pts(cfg.entrants)} entered so far. The board fills as the stages run, and the five highest totals take the prize.
                </p>
              </div>
            ) : (
              <div className="rc-runboard">
                {board.slice(0, 7).map((r, i) => (
                  <div key={r.handle + "-" + i} className={"rc-rb" + (i < 5 ? " paid" : "")}>
                    <span className="rc-rb-rk">{i + 1}</span>
                    <span className="rc-rb-dot" style={{ background: r.color }} />
                    <span className="rc-rb-nm">{r.handle}</span>
                    {i < 5 && <span className="rc-rb-prize gold">{usd2(prizeCommitted(cfg) * (([40, 25, 15, 12, 8][i] ?? 0) / 100))}</span>}
                    <span className="rc-rb-pts">{pts(r.points)}</span>
                  </div>
                ))}
                {board.length === 0 && (
                  <p className="rc-card-note" style={{ margin: 0 }}>Calls are live. The board fills the moment a stage settles.</p>
                )}
              </div>
            )}
            <p className="rc-card-note">Players see this board and the prize. They never see the take. That is in the Ledger.</p>
          </section>

          <section className="rc-card rc-mini">
            <h3 className="rc-card-h">At a glance</h3>
            <div className="rc-pv">
              <div className="rc-pv-row"><span>State</span><b>{STATE_FLOW[idx].label}</b></div>
              <div className="rc-pv-row"><span>Field</span><b>{pts(cfg.entrants)}</b></div>
              <div className="rc-pv-row"><span>Prize</span><b className="gold">{usd0(prizeCommitted(cfg))}</b></div>
              <div className="rc-pv-row"><span>Funded by</span><b>{cfg.funder}</b></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, body, stat }: { title: string; body: string; stat?: { l: string; v: string }[] }) {
  return (
    <div className="rc-panel">
      <h3 className="rc-card-h" style={{ marginTop: 0 }}>{title}</h3>
      <p className="rc-panel-body">{body}</p>
      {stat && (
        <div className="rc-panel-stat">
          {stat.map((s) => (
            <div key={s.l}><span className="l">{s.l}</span><span className="v">{s.v}</span></div>
          ))}
        </div>
      )}
    </div>
  )
}

function LedgerTab({ cfg }: { cfg: SeasonConfig }) {
  const L = computeLedger(cfg)
  const funderLabel = cfg.funder === "house" ? "house wallet" : cfg.funder === "sponsor" ? "sponsor" : "house and sponsor"
  return (
    <div className="rc-ledger">
      <div className="rc-ledger-banner">
        <span className="rc-ledger-lock">PRIVATE</span>
        Admin only. None of these numbers ever reach a player. They show entries in against prize and burn out, so you always know the real funds held.
      </div>

      <div className="rc-stats">
        <div className="rc-stat">
          <span className="rc-stat-l">Entries collected</span>
          <span className="rc-stat-v">{usd2(L.grossUsd)}</span>
          <span className="rc-stat-sub">{pts(L.entrants)} × {ammo(cfg.entryAmmo)} · {num(L.grossAmmo)} Ammo</span>
        </div>
        <div className="rc-stat">
          <span className="rc-stat-l">Prize committed</span>
          <span className="rc-stat-v gold">{usd0(L.prize)}</span>
          <span className="rc-stat-sub">{cfg.prizeMode} · {funderLabel} pays {usd0(L.funderPays)}</span>
        </div>
        <div className="rc-stat">
          <span className="rc-stat-l">Buy and burn</span>
          <span className="rc-stat-v">{usd2(L.burnUsd)}</span>
          <span className="rc-stat-sub">{cfg.burnPct}% of take · {compactBonk(L.bonkBurned)} BONK burned</span>
        </div>
        <div className={"rc-stat hero" + (L.held < 0 ? " neg" : "")}>
          <span className="rc-stat-l">Revenue held</span>
          <span className="rc-stat-v">{usd2(L.held)}</span>
          <span className="rc-stat-sub">{L.margin}% of entries · after prize and burn</span>
        </div>
      </div>

      <div className="rc-card">
        <h3 className="rc-card-h">Season P&amp;L</h3>
        <div className="rc-waterfall">
          <div className="rc-wf in"><span>Entries in</span><b>{usd2(L.grossUsd)}</b></div>
          <div className="rc-wf out"><span>Prize, {funderLabel} share</span><b>− {usd2(L.funderPays)}</b></div>
          <div className="rc-wf out"><span>Buy and burn spend</span><b>− {usd2(L.burnUsd)}</b></div>
          <div className="rc-wf net"><span>Held</span><b>{usd2(L.held)}</b></div>
        </div>
        <p className="rc-card-note">
          When a sponsor funds the prize, the house share drops to zero and the whole entry take, less the burn, is held. The
          burn is a real cost, a public BONK buy that gets burned. Every figure here is the real field, entries in against prize and burn out.
        </p>
      </div>

      <div className="rc-ledger-foot">
        Players see the prize, the board, and the BONK that was burned. The take, the cut, and this view stay yours.
      </div>
    </div>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');
.rc{ --ink:#0a0a0f; --ink2:#0f0f17; --ink3:#15151f;
  --line:rgba(255,255,255,0.08); --line2:rgba(255,255,255,0.15);
  --acid:#c6ff2e; --gold:#ffc847; --pink:#ff2e7e; --up:#7af5c0; --down:#ff5470;
  --txt:#e9ebf1; --dim:#8a90a2; --faint:#565b6b;
  --mono:"Space Mono",ui-monospace,monospace; --disp:"Anton",sans-serif; --sans:"Archivo",system-ui,sans-serif;
  background:var(--ink); color:var(--txt); font-family:var(--sans); min-height:100%;
  -webkit-font-smoothing:antialiased; padding-bottom:60px;
}
.rc *{ box-sizing:border-box; }
.rc-wrap{ max-width:1120px; margin:0 auto; padding:22px 18px 60px; }
.gold{ color:var(--gold); }

.rc-head{ display:flex; align-items:flex-end; justify-content:space-between; gap:16px; padding-bottom:16px; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.rc-kicker{ font-family:var(--mono); font-size:9px; letter-spacing:.26em; text-transform:uppercase; color:var(--faint); }
.rc-title{ font-family:var(--disp); font-size:clamp(24px,4vw,38px); line-height:.96; margin:6px 0 0; letter-spacing:.01em; }
.rc-head-r{ display:flex; align-items:center; gap:12px; }
.rc-season{ font-family:var(--mono); font-size:11px; color:var(--dim); letter-spacing:.08em; }
.rc-state{ display:inline-flex; align-items:center; gap:7px; font-family:var(--mono); font-size:10px; letter-spacing:.12em; text-transform:uppercase; padding:6px 11px; border-radius:999px; border:1px solid var(--line2); color:var(--dim); }
.rc-state i{ width:7px; height:7px; border-radius:50%; background:var(--dim); }
.rc-state.s-signups i,.rc-state.s-filter i,.rc-state.s-grind i,.rc-state.s-gauntlet i{ background:var(--acid); box-shadow:0 0 8px var(--acid); animation:rcpulse 1.4s infinite; }
.rc-state.s-paid i,.rc-state.s-settled i{ background:var(--gold); }
@keyframes rcpulse{ 0%,100%{opacity:1} 50%{opacity:.35} }

.rc-tabs{ display:flex; gap:6px; margin:16px 0 18px; }
.rc-tab{ font-family:var(--mono); font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--dim); background:transparent; border:1px solid var(--line); border-radius:10px; padding:9px 15px; cursor:pointer; display:inline-flex; align-items:center; gap:8px; transition:.15s; }
.rc-tab:hover{ color:var(--txt); border-color:var(--line2); }
.rc-tab.on{ color:var(--ink); background:var(--txt); border-color:var(--txt); font-weight:700; }
.rc-tab-lock{ font-size:8px; letter-spacing:.14em; padding:2px 6px; border-radius:5px; background:rgba(255,84,112,.16); color:#ff869a; }
.rc-tab.on .rc-tab-lock{ background:rgba(255,84,112,.22); }

.rc-grid{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.rc-grid2{ display:grid; grid-template-columns:1.4fr 1fr; gap:16px; margin-top:16px; }
.rc-col{ display:flex; flex-direction:column; gap:16px; min-width:0; }
@media (max-width:860px){ .rc-grid,.rc-grid2{ grid-template-columns:1fr; } }

.rc-card{ background:var(--ink2); border:1px solid var(--line); border-radius:15px; padding:16px 16px 18px; }
.rc-card-h{ font-family:var(--mono); font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--dim); margin:0 0 14px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
.rc-card-note{ font-family:var(--mono); font-size:10px; line-height:1.6; color:var(--faint); margin:12px 0 0; letter-spacing:.01em; }
.rc-priv,.rc-pub{ font-size:8px; letter-spacing:.14em; padding:2px 6px; border-radius:5px; }
.rc-priv{ background:rgba(255,84,112,.14); color:#ff869a; }
.rc-pub{ background:rgba(122,245,192,.14); color:var(--up); }

.rc-field{ display:flex; flex-direction:column; gap:6px; margin-bottom:13px; }
.rc-field:last-child{ margin-bottom:0; }
.rc-field-lbl{ font-family:var(--mono); font-size:10px; letter-spacing:.06em; color:var(--dim); text-transform:uppercase; }
.rc-field-hint{ font-family:var(--mono); font-size:9px; color:var(--faint); letter-spacing:.01em; }
.rc-text{ font-family:var(--sans); font-size:14px; color:var(--txt); background:var(--ink3); border:1px solid var(--line); border-radius:9px; padding:9px 11px; width:100%; outline:none; transition:.15s; }
.rc-text:focus{ border-color:var(--acid); }
.rc-num{ display:flex; align-items:center; background:var(--ink3); border:1px solid var(--line); border-radius:9px; padding:0 11px; transition:.15s; }
.rc-num:focus-within{ border-color:var(--acid); }
.rc-num input{ font-family:var(--mono); font-size:14px; color:var(--txt); background:transparent; border:none; outline:none; padding:9px 0; width:100%; }
.rc-num em{ font-family:var(--mono); font-size:11px; color:var(--faint); font-style:normal; padding-left:6px; }
.rc-num input::-webkit-outer-spin-button,.rc-num input::-webkit-inner-spin-button{ -webkit-appearance:none; margin:0; }
.rc-inline{ display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; }
.rc-inline .rc-field{ flex:1; margin-bottom:0; min-width:120px; }

.rc-seg{ display:inline-flex; background:var(--ink3); border:1px solid var(--line); border-radius:9px; padding:3px; gap:3px; }
.rc-seg button{ font-family:var(--mono); font-size:11px; letter-spacing:.04em; color:var(--dim); background:transparent; border:none; border-radius:6px; padding:7px 12px; cursor:pointer; transition:.12s; text-transform:capitalize; }
.rc-seg button:hover{ color:var(--txt); }
.rc-seg button.on{ background:var(--acid); color:var(--ink); font-weight:700; }

.rc-sum{ font-family:var(--mono); font-size:12px; padding:2px 8px; border-radius:6px; }
.rc-sum.ok{ color:var(--up); background:rgba(122,245,192,.12); }
.rc-sum.bad{ color:var(--down); background:rgba(255,84,112,.14); }
.rc-split{ display:grid; grid-template-columns:repeat(5,1fr); gap:8px; }
.rc-split .rc-field{ margin-bottom:0; }
.rc-warn{ font-family:var(--mono); font-size:10px; color:var(--down); margin:10px 0 0; }

.rc-slate{ display:flex; flex-wrap:wrap; gap:7px; }
.rc-art{ font-family:var(--mono); font-size:11px; font-weight:700; letter-spacing:.06em; color:var(--faint); background:var(--ink3); border:1px solid var(--line); border-radius:8px; padding:7px 11px; cursor:pointer; transition:.12s; }
.rc-art:hover{ color:var(--txt); }
.rc-art.on{ background:rgba(255,255,255,.04); }

.rc-stagecfg{ border:1px solid var(--line); border-radius:11px; padding:12px; margin-bottom:11px; }
.rc-stagecfg:last-child{ margin-bottom:0; }
.rc-stagecfg-top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:11px; }
.rc-stagecfg-name{ font-family:var(--disp); font-size:18px; letter-spacing:.01em; }
.rc-stagecfg-meta{ font-family:var(--mono); font-size:9.5px; color:var(--faint); letter-spacing:.04em; }
.rc-stagecfg-row{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px; }
.rc-stagecfg-row .rc-field{ margin-bottom:0; }
.rc-types{ display:flex; gap:6px; flex-wrap:wrap; }
.rc-type{ font-family:var(--mono); font-size:10px; letter-spacing:.03em; color:var(--faint); background:var(--ink3); border:1px solid var(--line); border-radius:7px; padding:6px 10px; cursor:pointer; transition:.12s; }
.rc-type:hover{ color:var(--txt); }
.rc-type.on{ color:var(--acid); border-color:rgba(198,255,46,.4); background:rgba(198,255,46,.08); }

.rc-dials{ display:grid; grid-template-columns:1fr 1fr; gap:11px; }
.rc-dials .rc-field{ margin-bottom:0; }

.rc-preview{ border-color:rgba(198,255,46,.22); background:linear-gradient(180deg,rgba(198,255,46,.05),var(--ink2) 60%); position:sticky; top:14px; }
.rc-pv{ display:flex; flex-direction:column; gap:0; }
.rc-pv-row{ display:flex; align-items:center; justify-content:space-between; padding:9px 0; border-bottom:1px dashed var(--line); font-size:13px; }
.rc-pv-row:last-child{ border-bottom:none; }
.rc-pv-row span{ font-family:var(--mono); font-size:11px; color:var(--dim); letter-spacing:.04em; text-transform:uppercase; }
.rc-pv-row b{ font-family:var(--sans); font-weight:700; font-size:14px; }

.rc-go{ width:100%; margin-top:14px; font-family:var(--mono); font-size:13px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--ink); background:var(--acid); border:none; border-radius:11px; padding:14px; cursor:pointer; transition:.15s; }
.rc-go:hover:not(:disabled){ filter:brightness(1.08); }
.rc-go:disabled{ background:var(--ink3); color:var(--faint); cursor:not-allowed; }
.rc-go.live{ background:var(--pink); color:#fff; }

/* run */
.rc-flow{ display:flex; gap:0; overflow-x:auto; border:1px solid var(--line); border-radius:12px; padding:4px; background:var(--ink2); }
.rc-step{ display:flex; align-items:center; gap:8px; padding:9px 13px; border-radius:9px; white-space:nowrap; flex:0 0 auto; opacity:.5; }
.rc-step.done{ opacity:.8; }
.rc-step.now{ opacity:1; background:rgba(198,255,46,.1); }
.rc-step-no{ font-family:var(--mono); font-size:10px; width:18px; height:18px; border-radius:50%; border:1px solid var(--line2); display:flex; align-items:center; justify-content:center; color:var(--dim); }
.rc-step.done .rc-step-no{ background:var(--up); color:var(--ink); border-color:var(--up); }
.rc-step.now .rc-step-no{ background:var(--acid); color:var(--ink); border-color:var(--acid); }
.rc-step-lbl{ font-family:var(--mono); font-size:10px; letter-spacing:.04em; color:var(--dim); text-transform:uppercase; }
.rc-step.now .rc-step-lbl{ color:var(--txt); }

.rc-stagepanel{ min-height:240px; }
.rc-stagepanel-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:14px; }
.rc-stagepanel-sub{ display:block; font-family:var(--mono); font-size:10px; color:var(--faint); letter-spacing:.04em; margin-top:5px; }
.rc-livebadge{ display:inline-flex; align-items:center; gap:6px; font-family:var(--mono); font-size:9px; letter-spacing:.14em; color:var(--pink); border:1px solid rgba(255,46,126,.4); border-radius:999px; padding:4px 9px; }
.rc-livebadge i{ width:6px; height:6px; border-radius:50%; background:var(--pink); animation:rcpulse 1.2s infinite; }

.rc-settle-head,.rc-settle-row{ display:grid; grid-template-columns:64px 1fr 1fr 1.4fr 52px; gap:8px; align-items:center; padding:9px 4px; }
.rc-settle-head{ font-family:var(--mono); font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:var(--faint); border-bottom:1px solid var(--line); }
.rc-settle-row{ border-bottom:1px solid var(--line); font-size:13px; }
.rc-settle-row:last-child{ border-bottom:none; }
.rc-settle-tk{ font-family:var(--mono); font-weight:700; font-size:12px; }
.rc-settle-open,.rc-settle-close{ font-family:var(--mono); font-size:12px; color:var(--dim); }
.rc-settle-res{ font-family:var(--mono); font-size:11px; color:var(--txt); }
.rc-settle-fld{ font-family:var(--mono); font-size:11px; color:var(--acid); text-align:right; }
.rc-settle-row.done .rc-settle-close{ color:var(--txt); }

.rc-winners,.rc-runboard{ display:flex; flex-direction:column; gap:2px; }
.rc-winrow{ display:grid; grid-template-columns:24px 14px 1fr auto auto; gap:10px; align-items:center; padding:11px 8px; border-radius:9px; }
.rc-winrow.first{ background:linear-gradient(90deg,rgba(255,200,71,.12),transparent); }
.rc-win-rk{ font-family:var(--disp); font-size:16px; color:var(--dim); }
.rc-winrow.first .rc-win-rk{ color:var(--gold); }
.rc-win-dot{ width:9px; height:9px; border-radius:50%; }
.rc-win-nm{ font-family:var(--mono); font-size:13px; }
.rc-win-pts{ font-family:var(--mono); font-size:11px; color:var(--faint); }
.rc-win-prize{ font-family:var(--mono); font-weight:700; font-size:13px; }

.rc-paidrow,.rc-panel-stat{ display:flex; gap:22px; margin-top:14px; padding-top:14px; border-top:1px solid var(--line); }
.rc-paidrow div,.rc-panel-stat div{ display:flex; flex-direction:column; gap:3px; }
.rc-paidrow .l,.rc-panel-stat .l{ font-family:var(--mono); font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:var(--faint); }
.rc-paidrow .v,.rc-panel-stat .v{ font-family:var(--disp); font-size:24px; }

.rc-panel-body{ font-size:14px; line-height:1.6; color:var(--dim); margin:0; max-width:62ch; }
.rc-runboard .rc-rb{ display:grid; grid-template-columns:22px 12px 1fr auto auto; gap:9px; align-items:center; padding:9px 6px; border-bottom:1px solid var(--line); }
.rc-runboard .rc-rb:last-child{ border-bottom:none; }
.rc-rb-rk{ font-family:var(--mono); font-size:11px; color:var(--faint); }
.rc-rb.paid .rc-rb-rk{ color:var(--gold); }
.rc-rb-dot{ width:8px; height:8px; border-radius:50%; }
.rc-rb-nm{ font-family:var(--mono); font-size:12px; }
.rc-rb-prize{ font-family:var(--mono); font-size:11px; font-weight:700; }
.rc-rb-pts{ font-family:var(--mono); font-size:12px; color:var(--dim); }
.rc-mini .rc-pv-row{ padding:7px 0; }

/* ledger */
.rc-ledger-banner{ display:flex; align-items:center; gap:12px; font-family:var(--mono); font-size:11px; line-height:1.6; color:#ffb3c0; background:rgba(255,84,112,.08); border:1px solid rgba(255,84,112,.28); border-radius:12px; padding:13px 15px; margin-bottom:16px; letter-spacing:.01em; }
.rc-ledger-lock{ flex:0 0 auto; font-size:9px; font-weight:700; letter-spacing:.16em; color:#fff; background:var(--down); border-radius:6px; padding:4px 9px; }
.rc-stats{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }
@media (max-width:860px){ .rc-stats{ grid-template-columns:1fr 1fr; } }
.rc-stat{ background:var(--ink2); border:1px solid var(--line); border-radius:13px; padding:15px; display:flex; flex-direction:column; gap:7px; }
.rc-stat.hero{ border-color:rgba(198,255,46,.3); background:linear-gradient(180deg,rgba(198,255,46,.07),var(--ink2)); }
.rc-stat.hero.neg{ border-color:rgba(255,84,112,.4); background:linear-gradient(180deg,rgba(255,84,112,.09),var(--ink2)); }
.rc-stat-l{ font-family:var(--mono); font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); }
.rc-stat-v{ font-family:var(--disp); font-size:30px; line-height:1; }
.rc-stat.hero.neg .rc-stat-v{ color:var(--down); }
.rc-stat-sub{ font-family:var(--mono); font-size:9.5px; color:var(--faint); letter-spacing:.02em; line-height:1.5; }

.rc-waterfall{ display:flex; flex-direction:column; }
.rc-wf{ display:flex; align-items:center; justify-content:space-between; padding:12px 2px; border-bottom:1px solid var(--line); }
.rc-wf span{ font-family:var(--mono); font-size:12px; color:var(--dim); letter-spacing:.02em; }
.rc-wf b{ font-family:var(--mono); font-size:15px; }
.rc-wf.out b{ color:var(--down); }
.rc-wf.in b{ color:var(--up); }
.rc-wf.net{ border-bottom:none; border-top:1.5px solid var(--line2); margin-top:2px; }
.rc-wf.net span{ color:var(--txt); text-transform:uppercase; font-size:11px; letter-spacing:.12em; }
.rc-wf.net b{ font-family:var(--disp); font-size:26px; color:var(--gold); }
.rc-ledger-foot{ font-family:var(--mono); font-size:10px; color:var(--faint); letter-spacing:.02em; line-height:1.6; margin-top:16px; text-align:center; }

@media (prefers-reduced-motion: reduce){ .rc *{ animation:none !important; transition:none !important; } }
`
