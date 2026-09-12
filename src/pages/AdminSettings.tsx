import React, { useEffect, useState } from "react";
import { useAppSettings } from "../context/AppSettingsContext";
import toast from "react-hot-toast";
import { PushNotificationManager } from "../components/PushNotificationManager";
import { useAuth } from "../context/AuthContext";

/** 2-digit state, 10-character PAN, entity number, "Z", check character. */
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function AdminSettings() {
  const { settings, updateSettings, refreshSettings } = useAppSettings();
  const { userRole } = useAuth();
  const isSuperadmin = userRole?.name === "superadmin";
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

  const gstin = String(formData.gstin ?? "").trim().toUpperCase();
  const gstinInvalid = gstin !== "" && !GSTIN_PATTERN.test(gstin);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // Same two rules the database enforces, said in words before it refuses.
    if (gstinInvalid) {
      toast.error("That GSTIN does not look right — it should be 15 characters, e.g. 33ABCDE1234F1Z5");
      return;
    }
    if (formData.gst_on_invoice && !gstin) {
      toast.error("Enter the GSTIN before switching GST on for invoices");
      return;
    }
    setLoading(true);
    try {
      await updateSettings({ ...formData, gstin: gstin || null });
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

        {/* Business & GST. Superadmin only: these details go on every
            invoice a customer receives. */}
        {isSuperadmin && (
          <div className="bg-card p-6 rounded-xl shadow border border-card-border/10">
            <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
              🧾 Business &amp; GST
            </h2>
            <p className="text-sm text-text/60 mb-4">
              Printed on invoices and quotations. The GSTIN appears on invoices
              only while the switch below is on.
            </p>

            <div className="flex items-center justify-between p-3 border rounded-lg bg-background mb-5">
              <div>
                <label htmlFor="toggle-gst" className="font-semibold block">
                  Show GST on invoice
                </label>
                <p className="text-xs text-text/60">
                  {formData.gst_on_invoice
                    ? `On — invoices print GSTIN ${gstin || "(not entered)"}`
                    : "Off — invoices are printed without a GSTIN"}
                </p>
              </div>
              <div className="relative inline-block w-12 h-6 transition duration-200 ease-in-out">
                <input
                  type="checkbox"
                  id="toggle-gst"
                  className="peer absolute opacity-0 w-0 h-0"
                  checked={formData.gst_on_invoice ?? false}
                  onChange={(e) =>
                    setFormData((prev: any) => ({ ...prev, gst_on_invoice: e.target.checked }))
                  }
                />
                <label
                  htmlFor="toggle-gst"
                  className="block cursor-pointer overflow-hidden h-6 rounded-full bg-gray-300 dark:bg-zinc-700 peer-checked:bg-green-500 transition-colors"
                >
                  <span className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-6"></span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium mb-1">
                  GSTIN {formData.gst_on_invoice && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  name="gstin"
                  value={formData.gstin || ""}
                  onChange={(e) =>
                    setFormData((prev: any) => ({ ...prev, gstin: e.target.value.toUpperCase() }))
                  }
                  maxLength={15}
                  placeholder="33ABCDE1234F1Z5"
                  className={`w-full border rounded px-3 py-2 bg-background font-mono tracking-wide ${
                    gstinInvalid ? "border-red-500" : ""
                  }`}
                />
                {gstinInvalid && (
                  <p className="text-xs text-red-500 mt-1">
                    15 characters: state code, PAN, entity number, Z, check character.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Legal business name</label>
                <input
                  type="text"
                  name="business_legal_name"
                  value={formData.business_legal_name || ""}
                  onChange={handleChange}
                  placeholder="As registered for GST"
                  className="w-full border rounded px-3 py-2 bg-background"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Business address</label>
                <textarea
                  value={formData.business_address || ""}
                  onChange={(e) =>
                    setFormData((prev: any) => ({ ...prev, business_address: e.target.value }))
                  }
                  rows={2}
                  placeholder="Door no, street, town, district, PIN"
                  className="w-full border rounded px-3 py-2 bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">State</label>
                <input
                  type="text"
                  name="business_state"
                  value={formData.business_state || ""}
                  onChange={handleChange}
                  placeholder="Tamil Nadu"
                  className="w-full border rounded px-3 py-2 bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input
                  type="text"
                  name="business_phone"
                  value={formData.business_phone || ""}
                  onChange={handleChange}
                  placeholder="+91 9789794518"
                  className="w-full border rounded px-3 py-2 bg-background"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  name="business_email"
                  value={formData.business_email || ""}
                  onChange={handleChange}
                  placeholder="soundwavecrackers@gmail.com"
                  className="w-full border rounded px-3 py-2 bg-background"
                />
              </div>
            </div>
          </div>
        )}

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
