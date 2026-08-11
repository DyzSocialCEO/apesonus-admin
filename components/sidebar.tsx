"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Music, Users, BarChart3, Settings, LogOut, Menu, X,
    ScrollText, UserCircle, DollarSign, Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

/**
 * Only desks that do a job.
 *
 * Every row here points at a page that exists and is linked. Nothing sits in
 * the repo unlinked any more: the old cash Call desk, Ward Check, Chart,
 * Distribution, Partner Access, Payouts and Revenue were all removed rather
 * than left hidden.
 *
 * Spins was the one page worth keeping out of that sweep. It was already the
 * whole Spins desk, sitting unlinked under the old name, so it was linked
 * instead of rebuilt.
 *
 * AUG 8: the app became one song, one admission and one mission, so the Spins
 * desk and the Call desk stopped describing anything the app reads. The Ward
 * took their place: it holds the song, the target, the price and the length
 * of an admission. Both desks are now deleted outright, along with their API
 * routes, and the one thing worth keeping off the Spins desk, clearing stale
 * pending orders, moved onto Finance.
 *
 * AUG 11: Case Studies and the Waiting Room are unlinked. Case Studies ran
 * the mockumentary clips, which were cut. The Waiting Room moderated the
 * confessions wall, which The Records replaced. The pages and their routes
 * stay in the repo until after launch, because Case Studies owns a table and
 * a migration and that is a decision rather than a keystroke.
 */
const navigation = [
  { name: "Dashboard",       href: "/dashboard",                 icon: LayoutDashboard },
  { name: "Tracks",          href: "/dashboard/tracks",          icon: Music           },
  { name: "Artists",         href: "/dashboard/artists",         icon: UserCircle      },
  { name: "The Ward",        href: "/dashboard/ward",            icon: Activity        },
  { name: "Users",           href: "/dashboard/users",           icon: Users           },
  { name: "Finance",         href: "/dashboard/finance",         icon: DollarSign     },
  { name: "Analytics",       href: "/dashboard/analytics",       icon: BarChart3       },
  { name: "Logs",            href: "/dashboard/logs",            icon: ScrollText      },
  { name: "Settings",        href: "/dashboard/settings",        icon: Settings        },
]

/**
 * The nav lives outside the Sidebar function on purpose.
 *
 * When it was declared inside, every navigation changed the pathname, which
 * re-rendered Sidebar, which created a brand new NavContent function. React
 * reads a new function identity as a different component type, so it threw
 * away the nav element and built a fresh one. The scroll position went with
 * it, which is why clicking anything low in the list bounced the menu back
 * to the top.
 */
function NavContent({
  pathname,
  onNavigate,
  onLogout,
}: {
  pathname: string
  onNavigate: () => void
  onLogout: () => void
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Music className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="font-bold text-white">APESONUS</h1>
          <p className="text-xs text-gray-500">Admin Panel</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))
          return (
            <Link key={item.name} href={item.href} onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-primary/10 text-primary" : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}>
              <item.icon className="w-5 h-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-800">
        <button onClick={onLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors w-full">
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login"); router.refresh()
  }

  const closeMobile = () => setMobileOpen(false)

  return (
    <>
      <button onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-gray-800 text-white">
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={closeMobile} />
      )}

      <aside className={cn(
        "lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col transform transition-transform duration-200",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <NavContent pathname={pathname} onNavigate={closeMobile} onLogout={handleLogout} />
      </aside>

      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-gray-900 border-r border-gray-800">
        <NavContent pathname={pathname} onNavigate={closeMobile} onLogout={handleLogout} />
      </aside>
    </>
  )
}
