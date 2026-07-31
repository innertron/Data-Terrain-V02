import { useState, useRef } from "react";
import { Landscape3D } from "@/components/Landscape3D";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpdateSegment } from "@/hooks/use-segments";
import { useTheme } from "@/hooks/use-theme";
import { Loader2, Save, Info, RefreshCw, Settings, Sun, Moon, Monitor, Upload, Database, CheckCircle2, Layers } from "lucide-react";
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
  const [surfMode, setSurfMode] = useState(false);
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
        <Landscape3D onSelectSegment={handleSelect} isDark={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)} surfMode={surfMode} />
        
        {/* Header Overlay — minedICE logo */}
        <div className="absolute top-6 left-6 z-10 pointer-events-none">
          <div className="flex items-baseline gap-0 leading-none">
            <span className={`text-3xl md:text-4xl font-bold tracking-tight ${theme === 'light' ? 'text-gray-800' : 'text-white'}`}>
              mined
            </span>
            <span className="relative mx-1">
              <span className="text-xs font-bold text-primary" style={{ position: 'relative', top: '-6px' }}>v</span>
            </span>
            <span className="text-3xl md:text-4xl font-bold tracking-tight text-primary">
              ICE
            </span>
          </div>
          <p className={`font-mono mt-1 text-xs tracking-widest uppercase ${theme === 'light' ? 'text-gray-500' : 'text-white/50'}`}>
            Module Interaction & Visualization
          </p>
        </div>
      </div>

      {/* Sidebar Control Panel */}
      <div className="w-full md:w-[350px] lg:w-[400px] h-full bg-card border-l border-border flex flex-col shadow-2xl z-20 order-1 md:order-2">
        <div className="p-6 border-b border-border bg-black/20 relative">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" />
              Inspector
            </h2>
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
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Hover or click a data node to view details.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {selectedSegment ? (
            <div className="animate-in slide-in-from-right-4 duration-300 space-y-6">
              
              {/* Coordinates Badge */}
              <div className="flex items-center justify-between">
                 <Badge variant="outline" className="font-mono text-xs">
                   ID: {selectedSegment.id}
                 </Badge>
                 <Badge className="bg-primary/20 text-primary border-primary/50 hover:bg-primary/30">
                   POS: [{selectedSegment.xIndex}, {selectedSegment.zIndex}]
                 </Badge>
              </div>

              {/* Data Display */}
              <div className="space-y-4">
                <div className="bg-muted p-4 rounded-xl border border-border">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">
                    Political Domain (X)
                  </Label>
                  <div className="text-lg font-medium">
                    <span className="font-bold" style={{ color: theme === 'dark' ? `hsl(${Math.round(240 - (selectedSegment.xIndex / 24) * 240)}, 90%, 60%)` : '#000000' }}>
                      {X_LABELS[selectedSegment.xIndex] || selectedSegment.xLabel}
                    </span>
                    : {X_MIDDLE_NAMES[selectedSegment.xIndex] || ''}
                  </div>
                </div>

                <div className="bg-muted p-4 rounded-xl border border-border">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">
                    Income / Education (Z)
                  </Label>
                  <div className="text-lg font-medium">
                    <span className="font-bold" style={{ color: theme === 'dark' ? '#e6c040' : '#000000' }}>
                      {Z_LABELS[selectedSegment.zIndex] || selectedSegment.zLabel}
                    </span>
                    : {Z_MIDDLE_NAMES[selectedSegment.zIndex] || ''}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-4 rounded-xl border border-primary/20">
                   <Label className="text-xs uppercase tracking-wider text-primary mb-1 block">
                    Population Density (Y)
                  </Label>
                  <div className="flex items-center gap-4 mt-2">
                    <Input 
                      type="number" 
                      value={editValue} 
                      onChange={(e) => setEditValue(e.target.value)}
                      className="text-2xl font-bold font-mono h-12 bg-background/50 border-primary/30 focus:border-primary"
                    />
                  </div>
                   <div className="mt-4 flex justify-end">
                    <Button 
                      onClick={handleSave} 
                      disabled={updateMutation.isPending || editValue === String(selectedSegment.value)}
                      className="w-full bg-primary hover:bg-primary/80 text-white shadow-lg shadow-primary/25"
                    >
                      {updateMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Update Value
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <Separator className="bg-border/50" />

              {/* Dataset Upload */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dataset — Block {selectedSegment.id}</Label>
                </div>

                {/* CSV Upload Button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  data-testid="input-csv-upload"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed border-primary/40 hover:border-primary hover:bg-primary/5"
                  data-testid="button-upload-csv"
                  disabled={uploadDataMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadDataMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" />Upload CSV for Block {selectedSegment.id}</>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground font-mono">
                  CSV format: <span className="text-primary">category name, count</span> (one per line)
                </p>

                {/* Display current dataset */}
                {segmentDataQuery.isLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />Loading dataset...
                  </div>
                )}
                {segmentDataQuery.data && segmentDataQuery.data.rows.length > 0 && (
                  <div className="bg-muted/30 rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
                      <span className="text-xs font-mono text-muted-foreground">Current Dataset</span>
                      <div className="flex items-center gap-1 text-xs text-green-500">
                        <CheckCircle2 className="w-3 h-3" />
                        Total: {segmentDataQuery.data.total.toLocaleString()}
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {segmentDataQuery.data.rows.map((row, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 last:border-0 hover:bg-muted/40">
                          <span className="text-xs text-foreground truncate flex-1 mr-2">{row.response_category}</span>
                          <span className="text-xs font-mono font-bold text-primary shrink-0">{row.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {segmentDataQuery.data && segmentDataQuery.data.rows.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2 italic">No data uploaded yet for this block.</p>
                )}
              </div>

              <Separator className="bg-border/50" />

              {/* Meta Info */}
              {selectedSegment.description && (
                <div className="text-sm text-muted-foreground italic bg-muted/20 p-3 rounded-lg border border-white/5">
                  "{selectedSegment.description}"
                </div>
              )}

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
        <div className="p-4 border-t border-border bg-card/50 backdrop-blur-md">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full text-xs font-mono"
            onClick={() => queryClient.invalidateQueries({ queryKey: [api.segments.list.path] })}
          >
            <RefreshCw className="w-3 h-3 mr-2" />
            Refresh Data Stream
          </Button>
        </div>
      </div>
    </div>
  );
}
