import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAxisData } from "@/lib/axisData";

type ParsedRow = { label: string; description: string };

/**
 * Parse an axis CSV: 25 rows of `label,description`.
 * Description may contain commas — only the FIRST comma splits the row.
 * An optional header row starting with "label" is skipped.
 * Row order = index 0→24 (Z axis: highest income first, matching current display order).
 */
function parseAxisCsv(text: string): { rows: ParsedRow[]; error?: string } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  const rows: ParsedRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && /^label\s*,/i.test(line.trim())) continue; // header
    const comma = line.indexOf(",");
    if (comma === -1) {
      rows.push({ label: line.trim(), description: "" });
      continue;
    }
    let label = line.slice(0, comma).trim();
    let description = line.slice(comma + 1).trim();
    // Strip surrounding quotes if present
    if (label.startsWith('"') && label.endsWith('"')) label = label.slice(1, -1);
    if (description.startsWith('"') && description.endsWith('"')) description = description.slice(1, -1).replace(/""/g, '"');
    if (!label) return { rows: [], error: `Row ${i + 1} has an empty label.` };
    rows.push({ label, description });
  }
  if (rows.length !== 25) {
    return { rows: [], error: `Expected 25 data rows, found ${rows.length}.` };
  }
  return { rows };
}

export function AxisTools() {
  const [axis, setAxis] = useState<"x" | "z">("z");
  const [csvText, setCsvText] = useState("");
  const [applying, setApplying] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { xLabels, xDescriptions, zLabels, zDescriptions } = useAxisData();

  const currentLabels = axis === "x" ? xLabels : zLabels;
  const currentDescriptions = axis === "x" ? xDescriptions : zDescriptions;

  const applyCsv = async (text: string) => {
    const { rows, error } = parseAxisCsv(text);
    if (error) {
      toast({ title: "CSV format error", description: error, variant: "destructive" });
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/axis/${axis}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labels: rows.map(r => r.label),
          descriptions: rows.map(r => r.description),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Save failed", description: data.message ?? "Unknown error", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/axis"] });
      setCsvText("");
      toast({ title: `${axis.toUpperCase()} axis updated`, description: "Labels and descriptions saved — 3D view and summaries now use the new data." });
    } catch {
      toast({ title: "Save failed", description: "Network error — check connection.", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const downloadCurrent = () => {
    const esc = (v: string) => (v.includes(",") || v.includes('"') || v.includes("\n")) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv = "label,description\n" + currentLabels.map((l, i) => `${esc(l)},${esc(currentDescriptions[i] ?? "")}`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `axis_${axis}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2 border border-border rounded-lg p-2.5 bg-muted/30" data-testid="axis-tools">
      {/* Axis picker */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setAxis("z")}
          data-testid="button-axis-z"
          className={`flex-1 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider border transition-colors ${axis === "z" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          Z — Income / Education
        </button>
        <button
          onClick={() => setAxis("x")}
          data-testid="button-axis-x"
          className={`flex-1 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider border transition-colors ${axis === "x" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          X — Political Domain
        </button>
      </div>

      <p className="text-[9px] text-muted-foreground font-mono leading-snug">
        CSV format: 25 rows of <span className="text-foreground">label,description</span> (only the first comma splits; optional
        header "label,description"). Row order = current display order{axis === "z" ? " — highest income first ($20B+ … <$34K)" : " — DEM-4 … GOP-4"}.
      </p>

      {/* Download current as template */}
      <Button size="sm" variant="outline" className="h-7 text-[10px] uppercase tracking-wider" onClick={downloadCurrent} data-testid="button-download-axis">
        Download current {axis.toUpperCase()} CSV (template)
      </Button>

      {/* Upload file */}
      <label className="flex items-center justify-center gap-1.5 h-7 rounded-md border border-dashed border-border bg-background cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        <Upload className="w-3 h-3" /> Upload CSV file
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          data-testid="input-axis-csv-file"
          onChange={e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => applyCsv(ev.target?.result as string);
            reader.readAsText(file);
            e.target.value = "";
          }}
        />
      </label>

      {/* Paste CSV */}
      <textarea
        value={csvText}
        onChange={e => setCsvText(e.target.value)}
        rows={4}
        placeholder={`…or paste CSV here (25 rows)\n$20B+ Luck2,description text…`}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-[10px] font-mono resize-y focus:outline-none focus:ring-1 focus:ring-ring"
        data-testid="textarea-axis-csv"
      />
      <Button
        size="sm"
        disabled={applying || !csvText.trim()}
        className="h-7 text-[10px] uppercase tracking-wider"
        onClick={() => applyCsv(csvText)}
        data-testid="button-apply-axis-csv"
      >
        {applying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
        Apply pasted CSV to {axis.toUpperCase()} axis
      </Button>
    </div>
  );
}
