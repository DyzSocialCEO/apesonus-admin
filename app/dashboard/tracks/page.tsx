"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Music } from "lucide-react"

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

export default function TracksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tracks</h1>
        <p className="text-gray-400">Manage your music catalog (10 tracks)</p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-400">Track</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-400">Artist</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-400">Mood</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-gray-400">Duration</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((track) => (
                  <tr key={track.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                          <Music className="w-5 h-5 text-gray-600" />
                        </div>
                        <span className="text-white font-medium">{track.title}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-gray-300">{track.artist}</td>
                    <td className="py-4 px-6">
                      <Badge variant={track.mood as any}>{track.mood.toUpperCase()}</Badge>
                    </td>
                    <td className="py-4 px-6 text-gray-400">
                      {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, "0")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
