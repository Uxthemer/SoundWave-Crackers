import React, { useEffect, useState } from "react";
import { useAppSettings } from "../context/AppSettingsContext";

export function DebugSettings() {
  const { settings } = useAppSettings();
  const [computedColors, setComputedColors] = useState<any>({});

  useEffect(() => {
    const update = () => {
      const style = getComputedStyle(document.documentElement);
      setComputedColors({
        primaryOrange: style.getPropertyValue("--primary-orange"),
        primaryRed: style.getPropertyValue("--primary-red"),
        title: document.title,
      });
    };
    
    // Check every second
    const interval = setInterval(update, 1000);
    update();
    return () => clearInterval(interval);
  }, [settings]);

  if (!settings) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-black/80 text-white p-4 rounded z-[9999] text-xs max-w-xs overflow-auto">
      <h3 className="font-bold border-b mb-2">Debug Settings</h3>
      <div>DB Primary: {settings.primary_color}</div>
      <div>CSS --primary-orange: {computedColors.primaryOrange}</div>
      <div>CSS --primary-red: {computedColors.primaryRed}</div>
      
      <div className="mt-2 text-green-300">
         If CSS matches DB, then issue is Tailwind config not picking it up.
      </div>
    </div>
  );
}
