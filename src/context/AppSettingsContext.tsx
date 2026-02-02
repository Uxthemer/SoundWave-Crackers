import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

interface AppSettings {
  id: string;
  site_title: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  base_font_size: string;
  button_style: string;
  card_style: string;
  hero_banners: string[] | null;
}

interface AppSettingsContextType {
  settings: AppSettings | null;
  loading: boolean;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(
  undefined
);

// Constants for default colors (fallback)
const DEFAULTS = {
  primary_orange: "#FF5722",
  primary_red: "#FF0000",
  primary_yellow: "#FFC107",
  secondary_purple: "#8A2BE2",
  secondary_blue: "#0D1B2A",
  font_family: "Montserrat",
};

export function AppSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .single();
      
      if (error && error.code !== "PGRST116") {
          console.error("Failed to fetch settings:", error);
      }
      
      if (data) {
        setSettings(data);
        applyTheme(data);
      } else {
        // Fallback or create default? 
        // We generally rely on migration to insert default row, but if missing:
        applyDefaultTheme();
      }
    } catch (e) {
      console.error(e);
      applyDefaultTheme();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    if (!settings) return;
    try {
      const { error } = await supabase
        .from("app_settings")
        .update(newSettings)
        .eq("id", settings.id);
      
      if (error) throw error;
      
      // Optimistic update
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      applyTheme(updated);
    } catch (err) {
      console.error("Failed to update settings:", err);
      throw err;
    }
  };

  const applyTheme = (s: AppSettings) => {
    try {
      const root = document.documentElement;
      
      console.log("Applying Theme Settings:", s);

      // Helper to convert hex to rgb channels (Robust)
      const hexToRgb = (hex: string): string | null => {
        if (!hex) return null;
        hex = hex.trim();
        // Handle shorthand #fff
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, (m, r, g, b) => {
          return r + r + g + g + b + b;
        });

        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
          ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(
              result[3],
              16
            )}`
          : null;
      };

      // Apply Colors with Fallbacks
      if (s.primary_color) {
          const rgb = hexToRgb(s.primary_color);
          console.log("Primary Color:", s.primary_color, "-> RGB:", rgb);
          if (rgb) {
            root.style.setProperty("--primary-orange", rgb);
            root.style.setProperty("--primary-red", rgb); // Map to Red too
          } else {
             // Fallback if invalid hex
             console.warn("Invalid Primary Color Hex");
          }
      }
      
      if (s.secondary_color) {
          const rgb = hexToRgb(s.secondary_color);
           console.log("Secondary Color:", s.secondary_color, "-> RGB:", rgb);
          if (rgb) root.style.setProperty("--secondary-purple", rgb);
      }
      
      if (s.accent_color) {
          const rgb = hexToRgb(s.accent_color);
           console.log("Accent Color:", s.accent_color, "-> RGB:", rgb);
          if (rgb) root.style.setProperty("--primary-yellow", rgb);
      }

      // Font Family
      if (s.font_family) {
        root.style.setProperty("--font-montserrat", s.font_family);
        
        // Dynamic Font Loading (Google Fonts)
        const fontName = s.font_family.replace(/['"]/g, "").trim();
        const fontId = "dynamic-font-link";
        if (fontName !== "Montserrat" && fontName !== "sans-serif") {
           let link = document.getElementById(fontId) as HTMLLinkElement;
           if (!link) {
             link = document.createElement("link");
             link.id = fontId;
             link.rel = "stylesheet";
             document.head.appendChild(link);
           }
           // Basic mapping for known fonts or fallback to generic
           // 'Playfair Display' -> 'Playfair+Display'
           const query = fontName.replace(/ /g, "+");
           link.href = `https://fonts.googleapis.com/css2?family=${query}:wght@400;700&display=swap`;
        }
        
        // FORCE Body Font
        document.body.style.fontFamily = s.font_family;
      }
      
      // Button Style
      if (s.button_style) {
          const radii: Record<string, string> = {
              "rounded": "0.5rem",
              "pill": "9999px",
              "sharp": "0px"
          };
          root.style.setProperty("--btn-radius", radii[s.button_style] || "0.5rem");
      }
      
      // Card Style
      if (s.card_style) {
          const radii: Record<string, string> = {
              "rounded": "0.75rem",
              "sharp": "0px"
          };
          root.style.setProperty("--card-radius", radii[s.card_style] || "0.75rem");
      }
      
      // Site Title
      if (s.site_title) {
          document.title = s.site_title;
      }
      
      // Favicon
      if (s.favicon_url) {
          const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
          if (link) {
              link.href = s.favicon_url;
          }
      }
    } catch (e) {
      console.error("Error applying theme:", e);
    }
  };

  const applyDefaultTheme = () => {
      // Don't need to do anything as index.css has defaults, but good for safety
  };

  return (
    <AppSettingsContext.Provider
      value={{ settings, loading, updateSettings, refreshSettings: fetchSettings }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error("useAppSettings must be used within AppSettingsProvider");
  }
  return context;
}
