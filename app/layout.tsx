import type { Metadata } from "next"
import "./globals.css"

// Inter is a file in public/fonts, declared in globals.css. next/font fetches
// from Google AT BUILD TIME, so one failed fetch fails the whole build and the
// previous image keeps serving with nothing to show for the push.

export const metadata: Metadata = {
  title: "APESONUS Admin",
  description: "Admin panel for APESONUS",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans">{children}</body>
    </html>
  )
}
