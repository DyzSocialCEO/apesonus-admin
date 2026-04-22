import Link from "next/link"
import { createAdminClient } from "@/lib/supabase"
import { Card, CardContent } from "@/components/ui/card"
import { Disc3, Users, Vote, ClipboardList, ArrowRight } from "lucide-react"
import { formatNumber } from "@/lib/utils"

export const dynamic = "force-dynamic"

/**
 * /dashboard/record — Record admin landing.
 *
 * Four tiles, one per sub-surface:
 *   - Entries             (songs in the Record, by zone)
 *   - Visiting Artists    (one-off characters per entry)
 *   - Vote Windows        (CoM + variable voting windows)
 *   - Nominations         (pending nominations from members)
 *
 * Each tile shows live counts so admin knows at a glance what needs
 * attention. Clicking a tile routes to the CRUD for that resource.
 */

interface RecordCounts {
  entries: {
    coinOfMonth: number
    celebrations: number
    graveyard: number
    total: number
  }
  visitingArtists: number
  voteWindows: {
    open: number
    total: number
  }
  nominations: {
    pending: number
    voting: number
    total: number
  }
}

async function getCounts(): Promise<RecordCounts> {
  const supabase = await createAdminClient()

  const [
    entriesRes,
    artistsRes,
    windowsOpenRes,
    windowsTotalRes,
    nomsPendingRes,
    nomsVotingRes,
    nomsTotalRes,
  ] = await Promise.all([
    supabase
      .from("record_entries")
      .select("zone", { count: "exact" })
      .eq("is_active", true),
    supabase
      .from("visiting_artists")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("vote_windows")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("vote_windows")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("nominations")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("nominations")
      .select("id", { count: "exact", head: true })
      .eq("status", "voting"),
    supabase
      .from("nominations")
      .select("id", { count: "exact", head: true }),
  ])

  // Group entries by zone
  const zoneCounts = { coin_of_month: 0, celebration: 0, funeral: 0 }
  if (entriesRes.data) {
    for (const row of entriesRes.data) {
      if (row.zone && row.zone in zoneCounts) {
        zoneCounts[row.zone as keyof typeof zoneCounts]++
      }
    }
  }

  return {
    entries: {
      coinOfMonth: zoneCounts.coin_of_month,
      celebrations: zoneCounts.celebration,
      graveyard: zoneCounts.funeral,
      total: entriesRes.count ?? 0,
    },
    visitingArtists: artistsRes.count ?? 0,
    voteWindows: {
      open: windowsOpenRes.count ?? 0,
      total: windowsTotalRes.count ?? 0,
    },
    nominations: {
      pending: nomsPendingRes.count ?? 0,
      voting: nomsVotingRes.count ?? 0,
      total: nomsTotalRes.count ?? 0,
    },
  }
}

export default async function RecordLandingPage() {
  const counts = await getCounts().catch(() => null)

  return (
    <div className="max-w-5xl">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
            <Disc3 className="w-5 h-5 text-yellow-500" />
          </div>
          <h1 className="text-3xl font-bold text-white">The Record</h1>
        </div>
        <p className="text-gray-400 leading-relaxed max-w-2xl">
          Crypto&apos;s memory, kept in song. Manage Record entries across
          the three zones, their visiting artists, voting windows, and
          incoming nominations from members.
        </p>
      </div>

      {!counts && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-5">
            <p className="text-sm text-red-400">
              Failed to load counts. Supabase may be unreachable — check
              the Settings page for connection health.
            </p>
          </CardContent>
        </Card>
      )}

      {counts && (
        <div className="grid gap-4 md:grid-cols-2">
          <TileLink
            href="/dashboard/record/entries"
            icon={<Disc3 className="w-5 h-5 text-yellow-500" />}
            title="Entries"
            description="Songs in the Record, across all three zones."
            rows={[
              { label: "Coin of the Month", value: counts.entries.coinOfMonth },
              { label: "Celebrations",      value: counts.entries.celebrations },
              { label: "Graveyard",         value: counts.entries.graveyard },
            ]}
          />

          <TileLink
            href="/dashboard/record/visiting-artists"
            icon={<Users className="w-5 h-5 text-purple-400" />}
            title="Visiting Artists"
            description="One-off characters who perform a single Record entry."
            rows={[
              { label: "Total on roster", value: counts.visitingArtists },
            ]}
          />

          <TileLink
            href="/dashboard/record/vote-windows"
            icon={<Vote className="w-5 h-5 text-green-500" />}
            title="Vote Windows"
            description="Coin-of-the-Month and variable-outcome votes."
            rows={[
              { label: "Currently open",     value: counts.voteWindows.open, highlight: counts.voteWindows.open > 0 },
              { label: "Lifetime created",   value: counts.voteWindows.total },
            ]}
          />

          <TileLink
            href="/dashboard/record/nominations"
            icon={<ClipboardList className="w-5 h-5 text-blue-400" />}
            title="Nominations"
            description="Member-proposed entries awaiting review or attached to a vote."
            rows={[
              { label: "Pending review",   value: counts.nominations.pending, highlight: counts.nominations.pending > 0 },
              { label: "On active ballot", value: counts.nominations.voting },
              { label: "Lifetime",         value: counts.nominations.total },
            ]}
          />
        </div>
      )}
    </div>
  )
}

interface TileLinkProps {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  rows: { label: string; value: number; highlight?: boolean }[]
}

function TileLink({ href, icon, title, description, rows }: TileLinkProps) {
  return (
    <Link href={href} className="block group">
      <Card className="hover:border-gray-600 transition-colors">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              {icon}
              <h2 className="text-lg font-semibold text-white">{title}</h2>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
          </div>
          <p className="text-sm text-gray-400 mb-4 leading-relaxed">{description}</p>
          <dl className="space-y-1.5 text-sm">
            {rows.map(row => (
              <div key={row.label} className="flex justify-between items-baseline">
                <dt className="text-gray-500">{row.label}</dt>
                <dd
                  className={`font-mono tabular-nums ${
                    row.highlight ? "text-yellow-500 font-bold" : "text-white"
                  }`}
                >
                  {formatNumber(row.value)}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </Link>
  )
}
