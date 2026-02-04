"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Database, Key, Shield } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400">Configure your admin panel</p>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-400/10">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Database</CardTitle>
              <CardDescription>Connected to Supabase</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 text-sm">
            Your admin panel is connected to the same Supabase database as your STOKMOJI app.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-400/10">
              <Key className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Environment Variables</CardTitle>
              <CardDescription>Required configuration</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
              <code className="text-primary text-sm">NEXT_PUBLIC_SUPABASE_URL</code>
              <Badge>Required</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
              <code className="text-primary text-sm">SUPABASE_SERVICE_ROLE_KEY</code>
              <Badge>Required</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
              <code className="text-primary text-sm">ADMIN_USERNAME</code>
              <Badge>Required</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50">
              <code className="text-primary text-sm">ADMIN_PASSWORD</code>
              <Badge>Required</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-400/10">
              <Shield className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Security</CardTitle>
              <CardDescription>Best practices</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-400">
            <li>✓ Session-based authentication</li>
            <li>✓ HTTP-only cookies</li>
            <li>✓ Service role key server-side only</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="bg-gray-900/50 border-gray-800">
        <CardContent className="p-4 text-center">
          <p className="text-gray-500 text-sm">STOKMOJI Admin v1.0.0</p>
        </CardContent>
      </Card>
    </div>
  )
}
