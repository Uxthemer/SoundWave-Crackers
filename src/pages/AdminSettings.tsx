import React, { useEffect, useState } from "react";
import { useAppSettings } from "../context/AppSettingsContext";
import toast from "react-hot-toast";
import { PushNotificationManager } from "../components/PushNotificationManager";

export function AdminSettings() {
  const { settings, updateSettings, refreshSettings } = useAppSettings();
  const [formData, setFormData] = useState<any>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData({ ...settings });
    }
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateSettings(formData);
      toast.success("Settings updated successfully");
      await refreshSettings();
    } catch (err: any) {
      toast.error("Failed to update settings");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Are you sure you want to reset to defaults?")) return;
    const defaults = {
      primary_color: "#FF5722",
      secondary_color: "#6B46C1",
      accent_color: "#FFC107",
      font_family: "Montserrat",
      site_title: "SoundWave Crackers",
      button_style: "rounded",
      card_style: "shadow",
    };
    setLoading(true);
    try {
      await updateSettings(defaults);
      setFormData((prev: any) => ({ ...prev, ...defaults }));
      toast.success("Reset to defaults");
    } catch (err) {
      toast.error("Failed to reset");
    } finally {
      setLoading(false);
    }
  };

  if (!settings) return <div className="p-8 text-center">Loading settings...</div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Admin Settings & White Labeling</h1>
        <button
          type="button"
          onClick={handleReset}
          className="text-red-600 hover:text-red-800 text-sm underline"
        >
          Reset to Defaults
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        
        {/* Branding Section */}
        <div className="bg-card p-6 rounded-xl shadow border border-card-border/10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            🎨 Branding
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-1">Site Title</label>
              <input
                type="text"
                name="site_title"
                value={formData.site_title || ""}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Logo URL</label>
              <input
                type="text"
                name="logo_url"
                value={formData.logo_url || ""}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 bg-background"
                placeholder="https://..."
              />
              {formData.logo_url && (
                  <img src={formData.logo_url} alt="Logo Preview" className="h-10 mt-2 object-contain" />
              )}
            </div>
          </div>
        </div>

        {/* Colors Section */}
        <div className="bg-card p-6 rounded-xl shadow border border-card-border/10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            🌈 Colors
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium mb-1">Primary Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  name="primary_color"
                  value={formData.primary_color || "#FF5722"}
                  onChange={handleChange}
                  className="h-10 w-10 p-0 border-0 rounded cursor-pointer"
                />
                <input
                  type="text"
                  name="primary_color"
                  value={formData.primary_color || ""}
                  onChange={handleChange}
                  className="flex-1 border rounded px-3 py-2 bg-background uppercase"
                />
              </div>
              <p className="text-xs text-text/60 mt-1">Main buttons, highlights</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Secondary Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  name="secondary_color"
                  value={formData.secondary_color || "#6B46C1"}
                  onChange={handleChange}
                  className="h-10 w-10 p-0 border-0 rounded cursor-pointer"
                />
                <input
                  type="text"
                  name="secondary_color"
                  value={formData.secondary_color || ""}
                  onChange={handleChange}
                  className="flex-1 border rounded px-3 py-2 bg-background uppercase"
                />
              </div>
              <p className="text-xs text-text/60 mt-1">Accents, gradients</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Accent Color</label>
              <div className="flex gap-2">
                <input
                  type="color"
                  name="accent_color"
                  value={formData.accent_color || "#FFC107"}
                  onChange={handleChange}
                  className="h-10 w-10 p-0 border-0 rounded cursor-pointer"
                />
                <input
                  type="text"
                  name="accent_color"
                  value={formData.accent_color || ""}
                  onChange={handleChange}
                  className="flex-1 border rounded px-3 py-2 bg-background uppercase"
                />
              </div>
              <p className="text-xs text-text/60 mt-1">Star ratings, special tags</p>
            </div>
          </div>
        </div>

        {/* Typography & Style Section */}
        <div className="bg-card p-6 rounded-xl shadow border border-card-border/10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            🔤 Typography & Style
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-1">Font Family</label>
              <select
                name="font_family"
                value={formData.font_family || "Montserrat"}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 bg-background"
              >
                <option value="Montserrat">Montserrat (Modern)</option>
                <option value="Inter">Inter (Clean)</option>
                <option value="Roboto">Roboto (Classic)</option>
                <option value="Lora">Lora (Serif)</option>
                <option value="Open Sans">Open Sans</option>
              </select>
            </div>
             <div>
              <label className="block text-sm font-medium mb-1">Button Style</label>
              <select
                name="button_style"
                value={formData.button_style || "rounded"}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 bg-background"
              >
                <option value="rounded">Rounded Details</option>
                <option value="pill">Pill Shape</option>
                <option value="sharp">Sharp Corners</option>
              </select>
            </div>
            <div>
                <label className="block text-sm font-medium mb-1">Card Style</label>
                 <select
                name="card_style"
                value={formData.card_style || "shadow"}
                onChange={handleChange}
                className="w-full border rounded px-3 py-2 bg-background"
              >
                <option value="shadow">Shadow (Elevated)</option>
                <option value="border">Border Only (Flat)</option>
                <option value="flat">Minimal (No Shadow)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notification Channels Section */}
        <div className="bg-card p-6 rounded-xl shadow border border-card-border/10">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            📢 Notification Channels
          </h2>
          <div className="space-y-4">
             {/* Email */}
             <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                <div>
                   <label className="font-semibold block">Email Notifications</label>
                   <p className="text-xs text-text/60">Receive order updates via Email (via Resend)</p>
                </div>
                <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out">
                    <input
                        type="checkbox"
                        name="enable_email_notifications"
                        id="toggle-email"
                        className="peer absolute opacity-0 w-0 h-0"
                        checked={formData.enable_email_notifications ?? true}
                        onChange={(e) => setFormData((prev: any) => ({ ...prev, enable_email_notifications: e.target.checked }))}
                    />
                    <label 
                        htmlFor="toggle-email"
                        className="block cursor-pointer overflow-hidden h-6 rounded-full bg-gray-300 dark:bg-zinc-700 peer-checked:bg-green-500 transition-colors"
                    >
                        <span className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-6"></span>
                    </label>
                </div>
             </div>

             {/* WhatsApp */}
             <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                <div>
                   <label className="font-semibold block">WhatsApp Notifications</label>
                   <p className="text-xs text-text/60">Send updates via WhatsApp Cloud API</p>
                </div>
                <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out">
                    <input
                        type="checkbox"
                        name="enable_whatsapp_notifications"
                        id="toggle-whatsapp"
                        className="peer absolute opacity-0 w-0 h-0"
                        checked={formData.enable_whatsapp_notifications ?? false}
                        onChange={(e) => setFormData((prev: any) => ({ ...prev, enable_whatsapp_notifications: e.target.checked }))}
                    />
                    <label 
                        htmlFor="toggle-whatsapp"
                        className="block cursor-pointer overflow-hidden h-6 rounded-full bg-gray-300 dark:bg-zinc-700 peer-checked:bg-green-500 transition-colors"
                    >
                        <span className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-6"></span>
                    </label>
                </div>
             </div>

              {/* Push Config (Global Switch) */}
             <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                <div>
                   <label className="font-semibold block">Push Notifications (Admin)</label>
                   <p className="text-xs text-text/60">Enable sending Push Notifications for new orders</p>
                </div>
                <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out">
                    <input
                        type="checkbox"
                        name="enable_push_notifications"
                        id="toggle-push"
                        className="peer absolute opacity-0 w-0 h-0"
                        checked={formData.enable_push_notifications ?? false}
                        onChange={(e) => setFormData((prev: any) => ({ ...prev, enable_push_notifications: e.target.checked }))}
                    />
                    <label 
                        htmlFor="toggle-push"
                        className="block cursor-pointer overflow-hidden h-6 rounded-full bg-gray-300 dark:bg-zinc-700 peer-checked:bg-green-500 transition-colors"
                    >
                        <span className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-6"></span>
                    </label>
                </div>
             </div>
          </div>
        </div>

        {/* Device Push Management */}
        <PushNotificationManager />

        <div className="flex justify-end pt-6">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-primary-orange text-white font-bold rounded-lg hover:shadow-lg disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
