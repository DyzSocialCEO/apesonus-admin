import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { Sidebar } from "@/components/sidebar"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  )
}
