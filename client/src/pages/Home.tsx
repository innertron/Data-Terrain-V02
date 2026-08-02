import { useState, useRef, useEffect, useMemo } from "react";
import { Landscape3D } from "@/components/Landscape3D";
import { type LayerDef, fetchLayers, computeLayerValues } from "@/lib/layers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpdateSegment } from "@/hooks/use-segments";
import { useTheme } from "@/hooks/use-theme";
import { ProjectSettingsDrawer } from "@/components/ProjectSettings";
import { Loader2, Save, Info, RefreshCw, Settings, Sun, Moon, Monitor, Upload, Database, CheckCircle2, Layers, Wrench, Eye, SlidersHorizontal, X } from "lucide-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// --- Types ---
type GridSegment = {
  id: number;
  xIndex: number;
  zIndex: number;
  xLabel: string;
  zLabel: string;
  value: number;
  description: string | null;
};

const X_LABELS = [
  'DEM-4','DEM-3','DEM-2','DEM-1','DEM 0',
  'DEM+1','DEM+2','DEM+3','DEM+4','Swng/z',
  'Swng/y','Swng/x','Swng 0','Swng\\x','Swng\\y',
  'Swng\\z','GOP+4','GOP+3','GOP+2','GOP+1',
  'GOP 0','GOP-1','GOP-2','GOP-3','GOP-4'
];

const X_MIDDLE_NAMES = [
  '+bttry,bttry,hamas,t',
  'bttry,hamas,trnsK12',
  'hamas,trnsK12,trans',
  'trnsK12,transSpt,C',
  'transSpt,CRT,DEI,s',
  'CRT,DEI,socilst,ope',
  'DEI,socilst,openBrd',
  'socilst,openBrdr,prc',
  'openBrdr,progDem,',
  'progDem,cncrSoc,m',
  'cncrSoc,modDem,u',
  'modDem,usFlag,isra',
  'usFlag,israel,lawFar',
  'israel,lawFare,china',
  'lawFare,china,vtrID',
  'china,vtrID,MSM,mr',
  'vtrID,MSM,mrtocrc',
  'MSM,mrtocrcry,mod',
  'mrtocrcry,modRep,lv',
  'modRep,lwHamas,ji',
  'lwHamas,jdoChrst,2',
  'jdoChrst,2020,gvtAc',
  '2020,gvtAcbty,proJa',
  'gvtAcbty,proJan6,qa',
  'proJan6,qanon,bttry'
];

const Z_LABELS = [
  '$20B+ Luck2','$1B Luck1','$50M MDPhD3','$1M MDPhD2','$500K MDPhD1',
  '$400K MD2','$300K MD1','$250K BSJD2','$200K BSJD1','$175K BSPhD2',
  '$150K BSPhD1','$120K BSMS','$100K Trade3','$90K BS2','$80K BS1',
  '$77K BAPhD','$70K Trade2','$65K Trade1','$60K BAMS','$55K BA2',
  '$50K BA1','$45K AS','$40K GED','$35K GED','<$34K GED'
];

const Z_MIDDLE_NAMES = [
  'Luck',
  'Luck',
  'MDPhD, BAJD, BSJD',
  'MD, MDPhD',
  'MD, MDPhD',
  'MDPhD, DDS/DMD, BAJD, MD, BSJD',
  'MD, MDPhD, MDPhD',
  'BSJD, MD, DVM/VDM, MDPhD',
  'BAJD, BSPhD, DVM/VDM, DDS/DMD',
  'BAJD, BSPhD, BSMS, BSJD',
  'Barch, BSMS, BSMS, BSMS',
  'DNP, ITTrade, PharmD, BSMS, BSMS, finMBA',
  'ITTrade, BS, PhDmath, finMBA, BSMS, PhDmath',
  'BAMS, MSN, ITTrade, BS',
  'ITTrade, BSN, BAfin, BA| BS',
  'BA, Trade, BAJD, ITTrade',
  'BA, Trade, BA, ITTrade, BAJD',
  'Trade, ITTrade, BA, AS',
  'BA, ITTrade, AS, Trade',
  'BA, AS, Trade, ITTrade',
  'BA, AS, ITTrade, Trade',
  'ITTrade, Trade, AS, BA',
  'GED, AS, BA, Trade',
  'n/a, GED, AS, BA',
  'GED, n/a'
];

export default function Home() {
  const [selectedSegment, setSelectedSegment] = useState<GridSegment | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showAdjustSkew, setShowAdjustSkew] = useState(false);
  const [skewLayerId, setSkewLayerId] = useState<number | null>(null);
  const [skewInB, setSkewInB] = useState(0);
  const [skewInT, setSkewInT] = useState(5);
  const [skewOutB, setSkewOutB] = useState(0);
  const [skewOutT, setSkewOutT] = useState(5);
  const [skewApplying, setSkewApplying] = useState(false);
  const [surfMode, setSurfMode] = useState(false);
  const [layerMode, setLayerMode] = useState<'layers' | 'details'>('layers');
  const [layerDefs, setLayerDefs] = useState<LayerDef[]>([]);
  const [activeLayers, setActiveLayers] = useState<number[]>([]);
  const isAdmin = import.meta.env.DEV;

  // Fetch layers from API once on mount
  useEffect(() => {
    fetchLayers()
      .then(defs => {
        setLayerDefs(defs);
        setActiveLayers(defs.filter(l => l.active).map(l => l.id));
      })
      .catch(console.error);
  }, []);

  const effectiveValues = useMemo(() => {
    if (layerDefs.length === 0) return undefined; // not yet loaded — use raw DB values
    const grids = activeLayers
      .map(id => layerDefs.find(l => l.id === id)?.gridValues)
      .filter((g): g is number[][] => !!g);
    if (grids.length === 0) {
      // All layers off — terrain flat (all zero)
      const zeros = new Map<string, number>();
      for (let x = 0; x < 25; x++) for (let z = 0; z < 25; z++) zeros.set(`${x},${z}`, 0);
      return zeros;
    }
    return computeLayerValues(grids);
  }, [activeLayers, layerDefs]);

  const toggleLayer = (id: number) =>
    setActiveLayers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const { data: projectSettingsData = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings").then(r => r.json()),
  });

  const projectTitle = projectSettingsData["project_title"] || "";
  const formatDate = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${m}/${d}/${y}`;
  };
  const dateStart = projectSettingsData["date_range_start"] || "";
  const dateEnd = projectSettingsData["date_range_end"] || "";
  const dateLabel = dateStart || dateEnd
    ? [dateStart, dateEnd].filter(Boolean).map(formatDate).join(" – ")
    : "";
  const updateMutation = useUpdateSegment();
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch this segment's dedicated dataset
  const segmentDataQuery = useQuery<{ segmentId: number; rows: { response_category: string; count: number }[]; total: number }>({
    queryKey: ['/api/segments', selectedSegment?.id, 'data'],
    enabled: !!selectedSegment,
  });

  // Upload CSV data mutation
  const uploadDataMutation = useMutation({
    mutationFn: async (rows: { response_category: string; count: number }[]) => {
      if (!selectedSegment) throw new Error("No segment selected");
      return apiRequest("POST", `/api/segments/${selectedSegment.id}/data`, { rows });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/segments', selectedSegment?.id, 'data'] });
      queryClient.invalidateQueries({ queryKey: [api.segments.list.path] });
      toast({ title: "Dataset uploaded", description: `Block ${selectedSegment?.id} data updated successfully.` });
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Could not save the dataset. Check CSV format.", variant: "destructive" });
    },
  });

  // Parse a CSV file into rows
  const parseCSV = (text: string): { response_category: string; count: number }[] => {
    const lines = text.trim().split(/\r?\n/);
    const rows: { response_category: string; count: number }[] = [];
    for (const line of lines) {
      if (!line.trim() || line.startsWith('#')) continue;
      const parts = line.split(',');
      if (parts.length < 2) continue;
      const count = parseInt(parts[parts.length - 1].trim(), 10);
      const response_category = parts.slice(0, parts.length - 1).join(',').trim();
      if (response_category && !isNaN(count)) {
        rows.push({ response_category, count });
      }
    }
    return rows;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        toast({ title: "No data found", description: "CSV must have rows like: category name, count", variant: "destructive" });
        return;
      }
      uploadDataMutation.mutate(rows);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Handle selection from 3D view
  const handleSelect = (segment: GridSegment) => {
    setSelectedSegment(segment);
    setEditValue(segment.value.toString());
  };

  const handleSave = () => {
    if (!selectedSegment) return;
    const newValue = parseInt(editValue, 10);
    if (isNaN(newValue)) return;

    updateMutation.mutate(
      { id: selectedSegment.id, value: newValue },
      {
        onSuccess: () => {}
      }
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row overflow-hidden bg-background text-foreground">
      
      {/* 3D Viewport - Takes dominant space */}
      <div className="flex-1 relative h-[60vh] md:h-auto order-2 md:order-1">
        <Landscape3D onSelectSegment={handleSelect} isDark={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)} surfMode={surfMode} effectiveValues={effectiveValues} />
        
        {/* Header Overlay — left: minedICE logo, right: project title + dates */}
        <div className="absolute top-4 left-6 right-6 z-10 pointer-events-none flex items-start justify-between">
          {/* Left — brand */}
          <div>
            {(() => {
              const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
              return (
                <img
                  src={isDarkMode ? '/minedice-logo-dark.png' : '/minedice-logo-light.png'}
                  alt="minedICE"
                  className="h-6 md:h-8 w-auto object-contain"
                />
              );
            })()}
            <p className={`font-mono mt-1 text-xs tracking-widest uppercase ${theme === 'light' ? 'text-gray-500' : 'text-white/50'}`}>
              Module Interaction & Visualization
            </p>
          </div>

          {/* Right — project title + date range (only when set) */}
          {projectTitle && (
            <div className="text-right">
              <img
                src={theme === 'light' ? '/minedice-logo-light.png' : '/minedice-logo-dark.png'}
                alt={projectTitle}
                className="h-6 md:h-8 w-auto object-contain opacity-0 absolute"
                aria-hidden
              />
              <p className={`font-mono text-base md:text-lg font-bold tracking-widest uppercase ${theme === 'light' ? 'text-gray-700' : 'text-white/90'}`}>
                {projectTitle}
              </p>
              {dateLabel && (
                <p className={`font-mono mt-1 text-xs tracking-widest uppercase ${theme === 'light' ? 'text-gray-500' : 'text-white/50'}`}>
                  {dateLabel}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Control Panel */}
      <div className="w-full md:w-[350px] lg:w-[400px] h-full bg-card border-l border-border flex flex-col shadow-2xl z-20 order-1 md:order-2">
        <div className="px-3 py-1.5 border-b border-border bg-black/20 relative">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-primary" />
              Inspector
            </h2>
            <div className="flex items-center gap-1">
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${showAdjustSkew ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Adjust Skew (admin only)"
                  onClick={() => { setShowAdjustSkew(v => !v); setSkewLayerId(null); }}  
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Project Settings (admin only)"
                  onClick={() => setShowProjectSettings(true)}
                >
                  <Wrench className="w-3.5 h-3.5" />
                </Button>
              )}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-settings"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="w-4 h-4" />
              </Button>
              {showSettings && (
                <div className="absolute right-0 top-10 z-50 bg-card border border-border rounded-lg shadow-2xl p-3 min-w-[200px] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
                    <div className="flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm font-semibold">Settings</span>
                    </div>
                    <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">Theme</p>
                  <div className="space-y-1">
                    <button
                      data-testid="button-theme-dark"
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${theme === 'dark' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'}`}
                      onClick={() => { setTheme('dark'); setShowSettings(false); }}
                    >
                      <Moon className="w-4 h-4" /> Dark
                    </button>
                    <button
                      data-testid="button-theme-light"
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${theme === 'light' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'}`}
                      onClick={() => { setTheme('light'); setShowSettings(false); }}
                    >
                      <Sun className="w-4 h-4" /> Light
                    </button>
                    <button
                      data-testid="button-theme-system"
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${theme === 'system' ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'}`}
                      onClick={() => { setTheme('system'); setShowSettings(false); }}
                    >
                      <Monitor className="w-4 h-4" /> System
                    </button>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">View</p>
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors"
                      onClick={() => setSurfMode(v => !v)}
                    >
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4" /> Surf Mode</span>
                      <span className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${surfMode ? 'bg-primary' : 'bg-muted'}`}>
                        <span className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${surfMode ? 'translate-x-5' : 'translate-x-0'}`} />
                      </span>
                    </button>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">Panel</p>
                    <div className="flex items-center bg-muted rounded-lg p-0.5 text-[10px] font-semibold tracking-wider">
                      <button
                        onClick={() => setLayerMode('layers')}
                        className={`flex-1 py-1 rounded-md transition-colors ${layerMode === 'layers' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >LAYERS</button>
                      <button
                        onClick={() => setLayerMode('details')}
                        className={`flex-1 py-1 rounded-md transition-colors ${layerMode === 'details' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                      >DETAILS</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            </div>{/* end flex items-center gap-1 */}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-3">

          {/* Adjust Skew panel — admin only, replaces normal content when open */}
          {isAdmin && showAdjustSkew && (
            <div className="flex flex-col gap-3 animate-in slide-in-from-right-4 duration-200">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold">Adjust Skew</span>
                </div>
                <button onClick={() => { setShowAdjustSkew(false); setSkewLayerId(null); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Layer list */}
              <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                {layerDefs.length === 0 && <p className="text-[10px] text-muted-foreground font-mono px-1">No layers found.</p>}
                {layerDefs.map(layer => {
                  const selected = skewLayerId === layer.id;
                  return (
                    <button
                      key={layer.id}
                      onClick={() => {
                        setSkewLayerId(layer.id);
                        // Populate inputs from stored params; always reset first
                        try {
                          const p = layer.params ? JSON.parse(layer.params) : null;
                          setSkewOutB(p?.outsideBottom ?? 0);
                          setSkewOutT(p?.outsideTop    ?? 5);
                          setSkewInB(p?.insideBottom   ?? 0);
                          setSkewInT(p?.insideTop      ?? 5);
                        } catch {
                          setSkewOutB(0); setSkewOutT(5);
                          setSkewInB(0);  setSkewInT(5);
                        }
                      }}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-left transition-colors ${selected ? 'border-primary/50 bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#a8d4d2' }} />
                      <span className="text-[10px] uppercase tracking-wider font-medium flex-1 truncate">{layer.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Bounds inputs — shown when a layer is selected */}
              {skewLayerId !== null && (
                <div className="flex flex-col gap-3 border border-border rounded-lg p-3 bg-muted/30">
                  {/* Outside shape */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Outside Shape — RANDBETWEEN</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label className="text-[9px] text-muted-foreground uppercase">Bottom</Label>
                        <Input type="number" min={0} step="any" value={skewOutB} onChange={e => setSkewOutB(Number(e.target.value))} className="h-7 text-xs font-mono" />
                      </div>
                      <div className="flex-1">
                        <Label className="text-[9px] text-muted-foreground uppercase">Top</Label>
                        <Input type="number" min={0} step="any" value={skewOutT} onChange={e => setSkewOutT(Number(e.target.value))} className="h-7 text-xs font-mono" />
                      </div>
                    </div>
                  </div>
                  {/* Inside shape */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Inside Shape — RANDBETWEEN</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label className="text-[9px] text-muted-foreground uppercase">Bottom</Label>
                        <Input type="number" min={0} step="any" value={skewInB} onChange={e => setSkewInB(Number(e.target.value))} className="h-7 text-xs font-mono" />
                      </div>
                      <div className="flex-1">
                        <Label className="text-[9px] text-muted-foreground uppercase">Top</Label>
                        <Input type="number" min={0} step="any" value={skewInT} onChange={e => setSkewInT(Number(e.target.value))} className="h-7 text-xs font-mono" />
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={skewApplying}
                    className="w-full h-7 text-[10px] uppercase tracking-wider"
                    onClick={async () => {
                      setSkewApplying(true);
                      try {
                        const res = await fetch(`/api/layers/${skewLayerId}/skew`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ insideBottom: skewInB, insideTop: skewInT, outsideBottom: skewOutB, outsideTop: skewOutT }),
                        });
                        const updated = await res.json();
                        setLayerDefs(prev => prev.map(l => l.id === skewLayerId ? { ...l, gridValues: updated.gridValues } : l));
                      } finally {
                        setSkewApplying(false);
                      }
                    }}
                  >
                    {skewApplying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Apply
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Segment cards — always visible when a bar is selected */}
          {selectedSegment && (
            <div className="flex flex-col gap-3 shrink-0 animate-in slide-in-from-right-4 duration-300">
              <div className="flex items-center">
                <Badge variant="outline" className="font-mono text-xs">ID: {selectedSegment.id}</Badge>
                <div className="flex-1 flex justify-center">
                  <Badge className="bg-primary/20 text-primary border-primary/50 font-mono text-xs">
                    PopDensity: {selectedSegment.value}
                  </Badge>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  POS: [{selectedSegment.xIndex}, {selectedSegment.zIndex}]
                </Badge>
              </div>
              <div className="space-y-3">
                <div className="bg-muted p-2.5 rounded-lg border border-border">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5 block">Political Domain (X)</Label>
                  <div className="text-xs font-medium leading-snug">
                    <span className="font-bold" style={{ color: theme === 'dark' ? `hsl(${Math.round(240 - (selectedSegment.xIndex / 24) * 240)}, 90%, 60%)` : '#000000' }}>
                      {X_LABELS[selectedSegment.xIndex] || selectedSegment.xLabel}
                    </span>
                    : {X_MIDDLE_NAMES[selectedSegment.xIndex] || ''}
                  </div>
                </div>
                <div className="bg-muted p-2.5 rounded-lg border border-border">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5 block">Income / Education (Z)</Label>
                  <div className="text-sm font-medium leading-snug">
                    <span className="font-bold" style={{ color: theme === 'dark' ? '#e6c040' : '#000000' }}>
                      {Z_LABELS[selectedSegment.zIndex] || selectedSegment.zLabel}
                    </span>
                    : {Z_MIDDLE_NAMES[selectedSegment.zIndex] || ''}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Switching content */}
          {layerMode === 'layers' ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
                Layers ({layerDefs.length})
              </p>
              {layerDefs.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono px-1">No layers found — try refreshing.</p>
              ) : (
                layerDefs.map(layer => {
                  const on = activeLayers.includes(layer.id);
                  return (
                    <div
                      key={layer.id}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-md border transition-colors ${on ? 'border-transparent' : 'border-border'}`}
                      style={on ? { backgroundColor: '#a8d4d218', borderColor: '#a8d4d255' } : {}}
                    >
                      {/* Toggle button — takes full remaining width */}
                      <button
                        onClick={() => toggleLayer(layer.id)}
                        className="flex-1 flex items-center justify-between min-w-0"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#a8d4d2' }} />
                          <span className="text-[10px] uppercase tracking-wider text-black dark:text-white truncate">{layer.name}</span>
                        </span>
                        <span className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors shrink-0 ml-2 ${on ? '' : 'bg-muted'}`} style={on ? { backgroundColor: '#a8d4d2' } : {}}>
                          <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
                        </span>
                      </button>
                    </div>
                  );
                })
              )}
              <p className="text-[10px] text-muted-foreground font-mono mt-1">
                {activeLayers.length > 0 && effectiveValues
                  ? `${activeLayers.length} layer${activeLayers.length > 1 ? 's' : ''} active · normalized 0–100`
                  : 'No layers active — terrain zeroed'}
              </p>
            </div>
          ) : (
            selectedSegment ? (
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-3 rounded-lg border border-primary/20 flex-1 flex flex-col min-h-0">
                <Label className="text-[10px] uppercase tracking-wider text-primary mb-1.5 block shrink-0">Results</Label>
                <div className="text-xs text-muted-foreground italic">— no results yet —</div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-4">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-current flex items-center justify-center">
                  <Info className="w-8 h-8" />
                </div>
                <p className="text-center text-sm px-8">Select a segment in the 3D grid to view its details.</p>
              </div>
            )
          )}
        </div>

      </div>

      {/* Admin-only Project Settings drawer — never rendered in production builds */}
      {isAdmin && (
        <ProjectSettingsDrawer
          open={showProjectSettings}
          onClose={() => setShowProjectSettings(false)}
        />
      )}
    </div>
  );
}