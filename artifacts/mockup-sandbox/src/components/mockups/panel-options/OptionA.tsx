import { useState } from "react";
import { Moon, Sun, Monitor, Layers } from "lucide-react";

// Option A — Segmented Pill
// Same pill-style toggle as the current LAYERS/DETAILS tab bar,
// embedded as a subsection in the gear modal below "View"
export function OptionA() {
  const [theme, setTheme] = useState<"dark" | "light" | "system">("system");
  const [surfMode, setSurfMode] = useState(false);
  const [panel, setPanel] = useState<"layers" | "details">("layers");

  return (
    <div className="min-h-screen bg-zinc-100 flex items-start justify-center pt-16 font-sans">
      {/* Gear modal */}
      <div className="bg-white border border-zinc-200 rounded-xl shadow-2xl p-3 w-[200px]">

        {/* Theme section */}
        <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5 px-1">Theme</p>
        <div className="space-y-0.5 mb-3">
          {[
            { label: "Dark", icon: <Moon className="w-3.5 h-3.5" />, val: "dark" as const },
            { label: "Light", icon: <Sun className="w-3.5 h-3.5" />, val: "light" as const },
            { label: "System", icon: <Monitor className="w-3.5 h-3.5" />, val: "system" as const },
          ].map(({ label, icon, val }) => (
            <button
              key={val}
              onClick={() => setTheme(val)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                theme === val ? "bg-violet-50 text-violet-600" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* View section */}
        <div className="border-t border-zinc-100 pt-3 mb-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5 px-1">View</p>
          <button
            onClick={() => setSurfMode(v => !v)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            <span className="flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> Surf Mode</span>
            <span className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors ${surfMode ? "bg-violet-500" : "bg-zinc-200"}`}>
              <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${surfMode ? "translate-x-4" : "translate-x-0"}`} />
            </span>
          </button>
        </div>

        {/* Panel section — NEW */}
        <div className="border-t border-zinc-100 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-2 px-1">Panel</p>
          {/* Same segmented pill as the current LAYERS/DETAILS tab bar */}
          <div className="flex items-center bg-zinc-100 rounded-lg p-0.5 text-[10px] font-semibold tracking-wider">
            <button
              onClick={() => setPanel("layers")}
              className={`flex-1 py-1 rounded-md transition-colors ${
                panel === "layers" ? "bg-white text-violet-600 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
              }`}
            >LAYERS</button>
            <button
              onClick={() => setPanel("details")}
              className={`flex-1 py-1 rounded-md transition-colors ${
                panel === "details" ? "bg-white text-violet-600 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
              }`}
            >DETAILS</button>
          </div>
        </div>
      </div>
    </div>
  );
}
