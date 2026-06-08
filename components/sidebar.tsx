"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Music, Users, BarChart3, Settings, LogOut, Menu, X,
  Activity, Megaphone, Coins, TrendingUp, Disc3, Swords,
  ScrollText, UserCircle, Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState } from "react"

const navigation = [
  { name: "Dashboard",     href: "/dashboard",              icon: LayoutDashboard },
  { name: "Tracks",        href: "/dashboard/tracks",       icon: Music           },
  { name: "Artists",       href: "/dashboard/artists",      icon: UserCircle      },
  { name: "The Record",    href: "/dashboard/record",       icon: Disc3           },
  { name: "Chart",         href: "/dashboard/chart",        icon: TrendingUp      },
  { name: "Markets",       href: "/dashboard/markets",      icon: Swords          },
  { name: "Arena",         href: "/dashboard/arenas",       icon: Zap             },
  { name: "Culture Pulse", href: "/dashboard/pulse",        icon: Activity        },
  { name: "Users",         href: "/dashboard/users",        icon: Users           },
  { name: "Banners",       href: "/dashboard/banners",      icon: Megaphone       },
  { name: "$ONUS",         href: "/dashboard/onus",         icon: Coins           },
  { name: "Analytics",     href: "/dashboard/analytics",    icon: BarChart3       },
  { name: "Logs",          href: "/dashboard/logs",         icon: ScrollText      },
  { name: "Settings",      href: "/dashboard/settings",     icon: Settings        },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login"); router.refresh()
  }

  const NavContent = () => (
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
            <Link key={item.name} href={item.href} onClick={() => setMobileOpen(false)}
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
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors w-full">
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <>
      <button onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-gray-800 text-white">
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={cn(
        "lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800 flex flex-col transform transition-transform duration-200",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <NavContent />
      </aside>

      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-gray-900 border-r border-gray-800">
        <NavContent />
      </aside>
    </>
  )
}
