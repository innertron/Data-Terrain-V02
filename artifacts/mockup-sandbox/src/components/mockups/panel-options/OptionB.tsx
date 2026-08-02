import { useState } from "react";
import { Moon, Sun, Monitor, Layers, List, Info } from "lucide-react";

// Option B — Radio Rows
// Two menu-item rows (like the Theme buttons) with a filled dot on the active one
export function OptionB() {
  const [theme, setTheme] = useState<"dark" | "light" | "system">("system");
  const [surfMode, setSurfMode] = useState(false);
  const [panel, setPanel] = useState<"layers" | "details">("layers");

  return (
    <div className="min-h-screen bg-zinc-100 flex items-start justify-center pt-16 font-sans">
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
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5 px-1">Panel</p>
          <div className="space-y-0.5">
            {[
              { label: "Layers", icon: <List className="w-3.5 h-3.5" />, val: "layers" as const },
              { label: "Details", icon: <Info className="w-3.5 h-3.5" />, val: "details" as const },
            ].map(({ label, icon, val }) => (
              <button
                key={val}
                onClick={() => setPanel(val)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                  panel === val ? "bg-violet-50 text-violet-600" : "text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                <span className="flex items-center gap-2">{icon} {label}</span>
                {/* Filled radio dot on the active choice */}
                <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center transition-colors ${
                  panel === val ? "border-violet-500 bg-violet-500" : "border-zinc-300"
                }`}>
                  {panel === val && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
