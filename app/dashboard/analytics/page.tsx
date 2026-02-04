"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Play, TrendingUp, Activity } from "lucide-react"

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-gray-400">Track your app performance</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg bg-blue-400/10 w-fit mb-3">
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-white">0</p>
            <p className="text-xs text-gray-500 mt-1">Total Users</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg bg-green-400/10 w-fit mb-3">
              <TrendingUp className="w-4 h-4 text-green-400" />
            </div>
            <p className="text-2xl font-bold text-white">0</p>
            <p className="text-xs text-gray-500 mt-1">New Users (7d)</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg bg-purple-400/10 w-fit mb-3">
              <Activity className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-bold text-white">0</p>
            <p className="text-xs text-gray-500 mt-1">Active Users (7d)</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <div className="p-2 rounded-lg bg-primary/10 w-fit mb-3">
              <Play className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-white">0</p>
            <p className="text-xs text-gray-500 mt-1">Total Plays</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg text-white">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400">
            Detailed analytics charts and metrics will be available here once you have more user data.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
