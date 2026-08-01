import { useState, useRef, useMemo } from "react";
import { Landscape3D } from "@/components/Landscape3D";
import { DEMO_CONTOURS, computeEffectiveValues } from "@/lib/demoContours";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpdateSegment } from "@/hooks/use-segments";
import { useTheme } from "@/hooks/use-theme";
import { ProjectSettingsDrawer } from "@/components/ProjectSettings";
import { Loader2, Save, Info, RefreshCw, Settings, Sun, Moon, Monitor, Upload, Database, CheckCircle2, Layers, Wrench } from "lucide-react";
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
  const [surfMode, setSurfMode] = useState(false);
  const [activeContourIds, setActiveContourIds] = useState<string[]>([]);
  const isAdmin = import.meta.env.DEV;

  const effectiveValues = useMemo(() => {
    const active = DEMO_CONTOURS.filter(c => activeContourIds.includes(c.id));
    return active.length > 0 ? computeEffectiveValues(active) : undefined;
  }, [activeContourIds]);

  const toggleContour = (id: string) =>
    setActiveContourIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

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
        <div className="px-3 py-2 border-b border-border bg-black/20 relative">
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
                  className="h-8 w-8 text-primary/60 hover:text-primary"
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
                className="h-8 w-8"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="w-4 h-4" />
              </Button>
              {showSettings && (
                <div className="absolute right-0 top-10 z-50 bg-card border border-border rounded-lg shadow-2xl p-3 min-w-[180px] animate-in fade-in slide-in-from-top-2 duration-200">
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
                </div>
              )}
            </div>
            </div>{/* end flex items-center gap-1 */}
          </div>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
            Hover or click a data node to view details.
          </p>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">

          {/* ConTour Layers — always visible */}
          <div className="shrink-0">
            <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-2">Contour Layers</p>
            <div className="space-y-1.5">
              {DEMO_CONTOURS.map(c => {
                const on = activeContourIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleContour(c.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors border ${on ? 'border-transparent' : 'border-border hover:bg-muted/50'}`}
                    style={on ? { backgroundColor: c.color + '22', borderColor: c.color + '66' } : {}}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className={`font-mono ${on ? 'text-foreground' : 'text-muted-foreground'}`}>{c.name}</span>
                    </span>
                    <span className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${on ? '' : 'bg-muted'}`} style={on ? { backgroundColor: c.color } : {}}>
                      <span className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} />
                    </span>
                  </button>
                );
              })}
            </div>
            {activeContourIds.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                {activeContourIds.length} layer{activeContourIds.length > 1 ? 's' : ''} active — terrain shows summed values
              </p>
            )}
          </div>

          {selectedSegment ? (
            <div className="flex flex-col flex-1 gap-4 animate-in slide-in-from-right-4 duration-300 min-h-0">
              
              {/* Fixed cards */}
              <div className="flex flex-col gap-3 shrink-0">
                {/* Coordinates Badge */}
                <div className="flex items-center">
                  <Badge variant="outline" className="font-mono text-xs">
                    ID: {selectedSegment.id}
                  </Badge>
                  <div className="flex-1 flex justify-center">
                    <Badge className="bg-primary/20 text-primary border-primary/50 font-mono text-xs">
                      PopDensity: {selectedSegment.value}
                    </Badge>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    POS: [{selectedSegment.xIndex}, {selectedSegment.zIndex}]
                  </Badge>
                </div>

                {/* Data Display */}
                <div className="space-y-3">
                  <div className="bg-muted p-3 rounded-lg border border-border">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5 block">
                      Political Domain (X)
                    </Label>
                    <div className="text-xs font-medium leading-snug">
                      <span className="font-bold" style={{ color: theme === 'dark' ? `hsl(${Math.round(240 - (selectedSegment.xIndex / 24) * 240)}, 90%, 60%)` : '#000000' }}>
                        {X_LABELS[selectedSegment.xIndex] || selectedSegment.xLabel}
                      </span>
                      : {X_MIDDLE_NAMES[selectedSegment.xIndex] || ''}
                    </div>
                  </div>

                  <div className="bg-muted p-3 rounded-lg border border-border">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5 block">
                      Income / Education (Z)
                    </Label>
                    <div className="text-sm font-medium leading-snug">
                      <span className="font-bold" style={{ color: theme === 'dark' ? '#e6c040' : '#000000' }}>
                        {Z_LABELS[selectedSegment.zIndex] || selectedSegment.zLabel}
                      </span>
                      : {Z_MIDDLE_NAMES[selectedSegment.zIndex] || ''}
                    </div>
                  </div>
                </div>
              </div>{/* end fixed cards */}

              {/* Results — purple box, fills remaining space */}
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-3 rounded-lg border border-primary/20 flex-1 flex flex-col min-h-0">
                <Label className="text-[10px] uppercase tracking-wider text-primary mb-1.5 block shrink-0">
                  Results
                </Label>
                <div className="text-xs text-muted-foreground italic">
                  — no results yet —
                </div>
              </div>

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-4">
              <div className="w-16 h-16 rounded-full border-2 border-dashed border-current flex items-center justify-center">
                <Info className="w-8 h-8" />
              </div>
              <p className="text-center text-sm px-8">
                Select a segment in the 3D grid to view and edit its properties.
              </p>
            </div>
          )}
        </div>

        {/* Global Controls Footer */}
        <div className="p-3 border-t border-border bg-card/50 backdrop-blur-md flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 text-[10px] font-mono"
            onClick={() => queryClient.invalidateQueries({ queryKey: [api.segments.list.path] })}
          >
            <RefreshCw className="w-3 h-3 mr-1.5" />
            Refresh Stream
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-[10px] font-mono border-primary/40 text-primary hover:bg-primary/10"
          >
            <span className="mr-1.5">＋</span>
            New Project
          </Button>
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
