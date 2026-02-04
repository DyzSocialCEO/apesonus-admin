import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tracks = [
      { id: 15, title: "To The Moon", artist: "Chartnobyl Bro", mood: "moon", duration: 168 },
      { id: 29, title: "Risk Management", artist: "Down Bad Dave", mood: "moon", duration: 172 },
      { id: 36, title: "Digital Gold Rush", artist: "Shilliam Dafoe", mood: "moon", duration: 174 },
      { id: 1, title: "Exit Liquidity", artist: "Lola Likwidity", mood: "rekt", duration: 167 },
      { id: 7, title: "Selling Everything", artist: "Satoshi Deluxe", mood: "rekt", duration: 198 },
      { id: 13, title: "Cryptos Finest", artist: "Aunty Rugsy", mood: "rekt", duration: 159 },
      { id: 5, title: "Just One Coin", artist: "Miss Candlesticker", mood: "cope", duration: 172 },
      { id: 27, title: "Why Not Me", artist: "Coinalisa Murado", mood: "cope", duration: 164 },
      { id: 18, title: "We Are Gamblers", artist: "Shill Shady", mood: "cope", duration: 154 },
      { id: 23, title: "Apes Together Strong", artist: "Shilliam Dafoe", mood: "degen", duration: 171 },
    ]

    return NextResponse.json({ tracks })
  } catch (error) {
    console.error("Error fetching tracks:", error)
    return NextResponse.json({ error: "Failed to fetch tracks" }, { status: 500 })
  }
}
