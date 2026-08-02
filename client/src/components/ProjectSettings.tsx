import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Wrench, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Settings = Record<string, string>;

const DEFAULTS: Settings = {
  project_title: "DemoScape",
  date_range_start: "",
  date_range_end: "",
  x_axis_label: "Political Domain (X)",
  z_axis_label: "Income / Education (Z)",
};

function Field({
  label,
  settingKey,
  settings,
  onSave,
  type = "text",
}: {
  label: string;
  settingKey: string;
  settings: Settings;
  onSave: (key: string, value: string) => void;
  type?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const current = settings[settingKey] ?? DEFAULTS[settingKey] ?? "";
  const display = draft ?? current;

  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex gap-1.5">
        <Input
          type={type}
          value={display}
          onChange={e => setDraft(e.target.value)}
          className="h-7 text-xs font-mono"
          onBlur={() => {
            if (draft !== null && draft !== current) {
              onSave(settingKey, draft);
              setDraft(null);
            }
          }}
          onKeyDown={e => {
            if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") setDraft(null);
          }}
        />
      </div>
    </div>
  );
}

export function ProjectSettingsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings = {} } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then(r => r.json()),
  });

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiRequest("PUT", `/api/settings/${key}`, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: () => {
      toast({ title: "Save failed", variant: "destructive" });
    },
  });

  const handleSave = (key: string, value: string) => {
    saveMutation.mutate({ key, value });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 pointer-events-auto"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="relative pointer-events-auto w-[300px] h-full bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5">
          <div className="flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-bold">Project Settings</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Identity */}
          <section>
            <p className="text-[10px] uppercase tracking-widest text-primary mb-3 font-semibold">Identity</p>
            <div className="space-y-3">
              <Field label="Project Title" settingKey="project_title" settings={settings} onSave={handleSave} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date From" settingKey="date_range_start" settings={settings} onSave={handleSave} type="date" />
                <Field label="Date To" settingKey="date_range_end" settings={settings} onSave={handleSave} type="date" />
              </div>
            </div>
          </section>

          {/* Axis Labels */}
          <section>
            <p className="text-[10px] uppercase tracking-widest text-primary mb-3 font-semibold">Axis Labels</p>
            <div className="space-y-3">
              <Field label="X-Axis Title" settingKey="x_axis_label" settings={settings} onSave={handleSave} />
              <Field label="Z-Axis Title" settingKey="z_axis_label" settings={settings} onSave={handleSave} />
            </div>
          </section>

          {/* Actions */}
          <section>
            <p className="text-[10px] uppercase tracking-widest text-primary mb-3 font-semibold">Actions</p>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs font-mono"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/segments"] });
                  onClose();
                }}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-2" />
                Refresh Stream
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs font-mono border-primary/40 text-primary hover:bg-primary/10"
              >
                <span className="mr-2 font-bold">＋</span>
                New Project
              </Button>
            </div>
          </section>
        </div>

        {/* Footer note */}
        <div className="px-4 py-3 border-t border-border bg-muted/30">
          <p className="text-[10px] text-muted-foreground italic">
            Admin only — never visible to end users. Changes save on blur / Enter.
          </p>
        </div>
      </div>
    </div>
  );
}
