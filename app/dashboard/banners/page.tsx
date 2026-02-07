"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Megaphone, Plus, Pencil, Trash2, Loader2, Eye, EyeOff, X, Save } from "lucide-react"

const BANNER_TYPES = [
  { id: "promo", label: "Promo", desc: "Go Premium, Refer & Earn", color: "text-primary" },
  { id: "motivation", label: "Motivation", desc: "Inspirational messages", color: "text-green-400" },
  { id: "sponsor", label: "Sponsor", desc: "Sponsored content", color: "text-purple-400" },
  { id: "info", label: "Info", desc: "App updates, announcements", color: "text-blue-400" },
]

export default function BannersPage() {
  const [banners, setBanners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editBanner, setEditBanner] = useState<any>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [msg, setMsg] = useState("")

  useEffect(() => { fetchBanners() }, [])

  const fetchBanners = async () => {
    try {
      const res = await fetch("/api/admin/banners")
      const data = await res.json()
      setBanners(data.banners || [])
    } catch { } finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!editBanner?.message) { setMsg("Message is required"); return }
    setSaving(true); setMsg("")
    try {
      const res = await fetch("/api/admin/banners", {
        method: editBanner.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editBanner),
      })
      if (!res.ok) throw new Error()
      setShowModal(false); setEditBanner(null)
      await fetchBanners()
      setMsg(editBanner.id ? "Banner updated!" : "Banner created!")
    } catch { setMsg("Failed to save") } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/admin/banners?id=${id}`, { method: "DELETE" })
      setDeleteConfirm(null); await fetchBanners()
    } catch { }
  }

  const toggleActive = async (banner: any) => {
    try {
      await fetch("/api/admin/banners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: banner.id, is_active: !banner.is_active }),
      })
      await fetchBanners()
    } catch { }
  }

  const openAdd = () => {
    setEditBanner({ message: "", type: "promo", cta_text: "", cta_link: "", is_active: true, bg_color: "", text_color: "" })
    setShowModal(true); setMsg("")
  }

  const activeCount = banners.filter((b) => b.is_active).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Banners</h1>
          <p className="text-gray-400">{banners.length} banners • {activeCount} active</p>
        </div>
        <Button onClick={openAdd} className="bg-primary text-black hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" /> Add Banner
        </Button>
      </div>

      {msg && (
        <div className={`p-3 rounded-lg text-sm ${msg.includes("Failed") || msg.includes("required") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
          {msg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : banners.length === 0 ? (
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-12 text-center">
            <Megaphone className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No banners yet. Create your first banner to show over the player.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {banners.map((banner) => (
            <Card key={banner.id} className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`border-0 text-xs ${
                        banner.type === "promo" ? "bg-primary/20 text-primary" :
                        banner.type === "sponsor" ? "bg-purple-500/20 text-purple-400" :
                        banner.type === "motivation" ? "bg-green-500/20 text-green-400" :
                        "bg-blue-500/20 text-blue-400"
                      }`}>
                        {banner.type?.toUpperCase()}
                      </Badge>
                      {banner.is_active ? (
                        <Badge className="bg-green-500/10 text-green-400 border-0 text-xs">ACTIVE</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">INACTIVE</Badge>
                      )}
                    </div>
                    <p className="text-white font-medium">{banner.message}</p>
                    {banner.cta_text && (
                      <p className="text-xs text-gray-500 mt-1">
                        CTA: &quot;{banner.cta_text}&quot; → {banner.cta_link || "no link"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => toggleActive(banner)} className="p-1.5 rounded-lg hover:bg-gray-700" title="Toggle active">
                      {banner.is_active ? <Eye className="w-4 h-4 text-green-400" /> : <EyeOff className="w-4 h-4 text-gray-500" />}
                    </button>
                    <button onClick={() => { setEditBanner({ ...banner }); setShowModal(true); setMsg("") }} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {deleteConfirm === banner.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleDelete(banner.id)} className="px-2 py-1 rounded bg-red-600 text-white text-xs">Yes</button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded bg-gray-700 text-white text-xs">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(banner.id)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-3 p-3 rounded-xl border border-gray-700/50"
                  style={{
                    background: banner.bg_color || "linear-gradient(135deg, #ffc847 0%, #ff9500 100%)",
                    color: banner.text_color || "#000",
                  }}>
                  <p className="text-xs font-bold text-center">{banner.message}</p>
                  {banner.cta_text && <p className="text-[10px] text-center mt-1 opacity-70">{banner.cta_text}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && editBanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">{editBanner.id ? "Edit Banner" : "New Banner"}</h2>
              <button onClick={() => { setShowModal(false); setEditBanner(null) }} className="p-1 rounded-lg hover:bg-gray-800 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Message *</label>
                <Input value={editBanner.message} onChange={(e) => setEditBanner({ ...editBanner, message: e.target.value })} placeholder="Go Premium — Zero ads, exclusive content!" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Type</label>
                <select
                  value={editBanner.type || "promo"}
                  onChange={(e) => setEditBanner({ ...editBanner, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
                >
                  {BANNER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label} — {t.desc}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">CTA Button Text</label>
                  <Input value={editBanner.cta_text || ""} onChange={(e) => setEditBanner({ ...editBanner, cta_text: e.target.value })} placeholder="Learn More" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">CTA Link</label>
                  <Input value={editBanner.cta_link || ""} onChange={(e) => setEditBanner({ ...editBanner, cta_link: e.target.value })} placeholder="/premium" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Background Color</label>
                  <Input value={editBanner.bg_color || ""} onChange={(e) => setEditBanner({ ...editBanner, bg_color: e.target.value })} placeholder="#ffc847 or gradient CSS" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">Text Color</label>
                  <Input value={editBanner.text_color || ""} onChange={(e) => setEditBanner({ ...editBanner, text_color: e.target.value })} placeholder="#000000" />
                </div>
              </div>
              <label className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 cursor-pointer">
                <input type="checkbox" checked={editBanner.is_active !== false} onChange={(e) => setEditBanner({ ...editBanner, is_active: e.target.checked })}
                  className="w-4 h-4 rounded accent-green-500" />
                <span className="text-sm text-white">Active (visible to users)</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-800">
              <Button variant="outline" onClick={() => { setShowModal(false); setEditBanner(null) }} className="border-gray-700 text-gray-300">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-primary text-black hover:bg-primary/90">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                {editBanner.id ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
