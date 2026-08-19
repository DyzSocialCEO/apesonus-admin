import { createAdminClient } from "@/lib/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Music, Play, TrendingUp, Activity, Crown } from "lucide-react"
import { formatNumber } from "@/lib/utils"
import { LiveSignups } from "@/components/live-signups"

/**
 * /dashboard, the admin home.
 *
 * THE BETA SCOREBOARD. Nothing is being sold, so revenue, admissions and
 * qualified doses were eight tiles reporting on a business that is switched
 * off. What this has to answer is narrower and more useful: did anybody come
 * in, did they come back, and what are they listening to. If those numbers do
 * not move there is no reason to build monetization at all.
 *
 * Every figure is counted in the database by ward_beta_scoreboard(), in one
 * read. Counting by pulling rows through PostgREST has already frozen a number
 * on this panel once, at the 1000 row page limit, and a count that quietly
 * stops climbing is worse than no count.
 *
 * The sessions and finance numbers are not deleted, they simply have no desk
 * pointing at them while the doors are shut.
 */

interface Scoreboard {
  patients: number
  patientsToday: number
  returning: number
  dosesToday: number
  doses: number
  prescriptions: number
  therapists: number
  topPrescription: { title: string; therapist: string; doses: number } | null
  topTherapist: { name: string; doses: number } | null
}

async function getStats() {
  const empty = {
    board: {
      patients: 0, patientsToday: 0, returning: 0, dosesToday: 0, doses: 0,
      prescriptions: 0, therapists: 0, topPrescription: null, topTherapist: null,
    } as Scoreboard,
    recentUsers: [] as Array<{
      id: string
      display_name: string | null
      email: string | null
      avatar_url: string | null
      created_at: string
      plays: number
    }>,
  }

  try {
    const supabase = await createAdminClient()

    const [{ data: raw }, { data: recentUsers }] = await Promise.all([
      supabase.rpc("ward_beta_scoreboard"),
      supabase
        .from("users")
        .select("id, display_name, email, avatar_url, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ])

    const b = (raw ?? {}) as Record<string, any>
    const board: Scoreboard = {
      patients: Number(b.patients ?? 0) || 0,
      patientsToday: Number(b.patientsToday ?? 0) || 0,
      returning: Number(b.returning ?? 0) || 0,
      dosesToday: Number(b.dosesToday ?? 0) || 0,
      doses: Number(b.doses ?? 0) || 0,
      prescriptions: Number(b.prescriptions ?? 0) || 0,
      therapists: Number(b.therapists ?? 0) || 0,
      topPrescription: b.topPrescription
        ? {
            title: String(b.topPrescription.title ?? ""),
            therapist: String(b.topPrescription.therapist ?? ""),
            doses: Number(b.topPrescription.doses ?? 0) || 0,
          }
        : null,
      topTherapist: b.topTherapist
        ? { name: String(b.topTherapist.name ?? ""), doses: Number(b.topTherapist.doses ?? 0) || 0 }
        : null,
    }

    const userIds = (recentUsers ?? []).map((u) => u.id)

    // Per-user play counts for the recent list only. Bounded to eight ids, so
    // this one cannot run into the page limit.
    const { data: playRows } = userIds.length
      ? await supabase.from("play_history").select("user_id").in("user_id", userIds)
      : { data: [] as { user_id: string }[] }

    const playCount = new Map<string, number>()
    for (const r of playRows ?? []) {
      playCount.set(r.user_id, (playCount.get(r.user_id) || 0) + 1)
    }

    return {
      board,
      recentUsers: (recentUsers ?? []).map((u) => ({
        id: u.id,
        display_name: u.display_name,
        email: u.email,
        avatar_url: u.avatar_url,
        created_at: u.created_at,
        plays: playCount.get(u.id) || 0,
      })),
    }
  } catch (error) {
    console.error("Error:", error)
    return empty
  }
}

function shortId(id: string | null | undefined): string {
  if (!id) return "none"
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id
}

export default async function DashboardPage() {
  const { board, recentUsers } = await getStats()

  // What the beta is trying to prove, and nothing else.
  const statCards = [
    { title: "Total patients",      value: formatNumber(board.patients),      icon: Users,      color: "text-blue-400",   bg: "bg-blue-400/10" },
    { title: "Patients today",      value: formatNumber(board.patientsToday), icon: TrendingUp, color: "text-green-400",  bg: "bg-green-400/10" },
    { title: "Returning patients",  value: formatNumber(board.returning),     icon: Crown,      color: "text-yellow-400", bg: "bg-yellow-400/10" },
    { title: "Doses today",         value: formatNumber(board.dosesToday),    icon: Play,       color: "text-primary",    bg: "bg-primary/10" },
    { title: "Total doses",         value: formatNumber(board.doses),         icon: Activity,   color: "text-cyan-400",   bg: "bg-cyan-400/10" },
    { title: "Active prescriptions",value: formatNumber(board.prescriptions), icon: Music,      color: "text-violet-400", bg: "bg-violet-400/10" },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400">The beta scoreboard. Nothing is being sold, so this is what counts.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <div className={"p-2 rounded-lg w-fit mb-2 " + stat.bg}>
                <stat.icon className={"w-4 h-4 " + stat.color} />
              </div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-1">{stat.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Top prescription</p>
            {board.topPrescription ? (
              <>
                <p className="mt-1 text-xl font-bold text-white">{board.topPrescription.title}</p>
                <p className="text-sm text-gray-400">
                  {board.topPrescription.therapist || "No therapist on it"} &middot;{" "}
                  {formatNumber(board.topPrescription.doses)} doses
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-500">Nothing is on the ward yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">Top therapist</p>
            {board.topTherapist ? (
              <>
                <p className="mt-1 text-xl font-bold text-white">{board.topTherapist.name || "Unnamed"}</p>
                <p className="text-sm text-gray-400">
                  {formatNumber(board.topTherapist.doses)} doses across {formatNumber(board.therapists)}{" "}
                  {board.therapists === 1 ? "therapist" : "therapists"} on the ward
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-500">Nobody is on the ward yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <LiveSignups />

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white">Recent Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left  py-3 px-4 text-sm font-medium text-gray-400">User</th>
                  <th className="text-left  py-3 px-4 text-sm font-medium text-gray-400">ID</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-400">Plays</th>
                  <th className="text-right  py-3 px-4 text-sm font-medium text-gray-400">Joined</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.map((user) => {
                  return (
                    <tr key={user.id} className="border-b border-gray-800/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-medium text-sm">
                            {user.display_name || user.email || "Unknown"}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500">{user.email || "none"}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400 font-mono">{shortId(user.id)}</td>
                      <td className="py-3 px-4 text-center text-white text-sm">{user.plays}</td>
                      <td className="py-3 px-4 text-right text-gray-400 text-xs">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })}
                {recentUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">No users yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
