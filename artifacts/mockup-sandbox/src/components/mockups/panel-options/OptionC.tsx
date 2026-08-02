import { useState } from "react";
import { Moon, Sun, Monitor, Layers, AlignJustify, SlidersHorizontal } from "lucide-react";

// Option C — Inline Icon Pair
// Two compact icon+label buttons side by side; more minimal/icon-forward.
// Active option gets a teal tint matching the app's layer color.
export function OptionC() {
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
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-2 px-1">Panel</p>
          {/* Two icon tiles side by side — active gets teal fill */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setPanel("layers")}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-[10px] font-semibold tracking-wider transition-colors ${
                panel === "layers"
                  ? "text-[#5a8f8d]"
                  : "text-zinc-400 hover:bg-zinc-50"
              }`}
              style={panel === "layers" ? { backgroundColor: "#a8d4d218", border: "1px solid #a8d4d255" } : { border: "1px solid transparent" }}
            >
              <AlignJustify className="w-4 h-4" />
              LAYERS
            </button>
            <button
              onClick={() => setPanel("details")}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-[10px] font-semibold tracking-wider transition-colors ${
                panel === "details"
                  ? "text-[#5a8f8d]"
                  : "text-zinc-400 hover:bg-zinc-50"
              }`}
              style={panel === "details" ? { backgroundColor: "#a8d4d218", border: "1px solid #a8d4d255" } : { border: "1px solid transparent" }}
            >
              <SlidersHorizontal className="w-4 h-4" />
              DETAILS
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
