import { useState, useRef, useEffect, useMemo } from "react";
import { Landscape3D } from "@/components/Landscape3D";
import { type LayerDef, fetchLayers, computeLayerValues } from "@/lib/layers";
import { useAxisData } from "@/lib/axisData";
import { AxisTools } from "@/components/AxisTools";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpdateSegment } from "@/hooks/use-segments";
import { useTheme } from "@/hooks/use-theme";
import { ProjectSettingsDrawer } from "@/components/ProjectSettings";
import { Loader2, Save, Info, RefreshCw, Settings, Sun, Moon, Monitor, Upload, Database, CheckCircle2, Layers, Wrench, Eye, SlidersHorizontal, X, Trash2, Search } from "lucide-react";
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
function getXLabelColor(xIndex: number): string {
  const hue = 240 - (xIndex / 24) * 240;
  return `hsl(${hue.toFixed(1)}, 90%, 62%)`;
}

function renderConverged(text: string) {
  const parts = text.split(/(Educational\/training profile:|Outcome →|Observed Cases →)/g);
  return (
    <>
      {parts.map((part, i) =>
        i === 0
          ? <strong key={i}>{part}</strong>
          : part === 'Educational/training profile:' || part === 'Outcome →' || part === 'Observed Cases →'
            ? <strong key={i}>{part}</strong>
            : <span key={i}>{part}</span>
      )}
    </>
  );
}

function AnimatedMagnifier({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {/* animated translucent glass lens */}
      <circle cx="11" cy="11" r="7" className="glass-lens" />
      {/* moving glint highlight */}
      <circle cx="8.5" cy="8.5" r="2" fill="white" className="glass-glint" />
      {/* rim + handle */}
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.5" />
      <line x1="16.2" y1="16.2" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function renderPolitical(text: string) {
  const phrases = ['Cluster Summary →', 'Key Identifiers →', 'Network Profile →'];
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    let earliestIdx = -1;
    let earliestPhrase = '';
    for (const phrase of phrases) {
      const idx = remaining.indexOf(phrase);
      if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
        earliestIdx = idx;
        earliestPhrase = phrase;
      }
    }
    if (earliestIdx === -1) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
    if (earliestIdx > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, earliestIdx)}</span>);
    }
    parts.push(<strong key={key++}>{earliestPhrase}</strong>);
    remaining = remaining.slice(earliestIdx + earliestPhrase.length);
  }
  return parts;
}

export default function Home() {
  const [selectedSegment, setSelectedSegment] = useState<GridSegment | null>(null);
  const [cameraPos, setCameraPos] = useState<{x:number,y:number,z:number}>({ x: -25, y: 30, z: 25 });
  const [editValue, setEditValue] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [showPoliticalPopup, setShowPoliticalPopup] = useState(false);
  const [showIncomePopup, setShowIncomePopup] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showAdjustSkew, setShowAdjustSkew] = useState(false);
  const [skewLayerId, setSkewLayerId] = useState<number | null>(null);
  const [skewInB, setSkewInB] = useState(0.01);
  const [skewInT, setSkewInT] = useState(0.05);
  const [skewOutB, setSkewOutB] = useState(0.00);
  const [skewOutT, setSkewOutT] = useState(0.01);
  const [skewApplying, setSkewApplying] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameName2, setRenameName2] = useState("");
  const [renameDesc, setRenameDesc] = useState("");
  const [renameIcon, setRenameIcon] = useState<string | null>(null);
  const [renameIconOn, setRenameIconOn] = useState(false);
  const [renameApplying, setRenameApplying] = useState(false);
  const [renameRank, setRenameRank] = useState<number | "">("");
  const [renameAffiliation, setRenameAffiliation] = useState("");
  const [renameMedium, setRenameMedium] = useState("");
  const [renameGender, setRenameGender] = useState("");
  const [mediumFilter, setMediumFilter] = useState<string[]>([]); // empty = show all
  const [genderFilter, setGenderFilter] = useState<string[]>([]); // empty = show all
  const [affiliationFilter, setAffiliationFilter] = useState<string[]>([]); // empty = show all
  const [nameSearch, setNameSearch] = useState("");
  const [surfMode, setSurfMode] = useState(false);
  const [layerMode, setLayerMode] = useState<'layers' | 'details'>('details');
  const [layerDefs, setLayerDefs] = useState<LayerDef[]>([]);
  const [activeLayers, setActiveLayers] = useState<number[]>([]);

  const { xLabels, xDescriptions, zLabels, zDescriptions } = useAxisData();

  const ALL_MEDIA = ["Cable TV", "Broadcast TV", "Podcast / YouTube", "Radio", "Print / Digital", "Digital Video", "Podcast / Social"] as const;
  const ALL_AFFILIATIONS = ["Fox News", "NewsNation", "CNN", "ABC", "NBC", "CBS", "NYT"] as const;
  const ALL_LAYERS_ID = -1; // sentinel skewLayerId: randomize applies to ALL layers
  // DB affiliation strings are inconsistent ("FOX" vs "Fox News", "NEWSNATION" vs "NewsNation") — normalize before matching
  const normAffil = (s: string) => {
    const k = s.toUpperCase().replace(/[^A-Z]/g, "");
    return k === "FOX" ? "FOXNEWS" : k;
  };
  const affilMatches = (l: LayerDef) =>
    affiliationFilter.length === 0 ||
    (!!(l as any).affiliation && affiliationFilter.some(a => normAffil(a) === normAffil((l as any).affiliation)));

  const visibleLayers = layerDefs.filter(l =>
    (mediumFilter.length === 0 || (l.primaryMedium && mediumFilter.includes(l.primaryMedium))) &&
    (genderFilter.length === 0 || ((l as any).gender && genderFilter.includes((l as any).gender))) &&
    affilMatches(l) &&
    (nameSearch.trim() === "" || l.name.toLowerCase().includes(nameSearch.trim().toLowerCase()))
  ).sort((a, b) => {
    const ra = (a as any).rank, rb = (b as any).rank;
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
  // Filters also zero out non-matching layers in the terrain (name search only narrows the list, not the terrain):
  const filterMatchedLayers = layerDefs.filter(l =>
    (mediumFilter.length === 0 || (l.primaryMedium && mediumFilter.includes(l.primaryMedium))) &&
    (genderFilter.length === 0 || ((l as any).gender && genderFilter.includes((l as any).gender))) &&
    affilMatches(l)
  );
  const effectiveActiveIds = (mediumFilter.length === 0 && genderFilter.length === 0 && affiliationFilter.length === 0)
    ? activeLayers
    : activeLayers.filter(id => filterMatchedLayers.some(l => l.id === id));
  const isAdmin = import.meta.env.DEV;

  // Medium filter pills — shared between the Layers list and the Results panel
  const mediumFilterPills = layerDefs.some(l => l.primaryMedium) ? (
    <div className="flex flex-col gap-1">
      <div className="relative px-1">
        <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={nameSearch}
          onChange={e => setNameSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full pl-6 pr-6 py-1 rounded border border-border bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
          data-testid="input-name-search"
        />
        {nameSearch && (
          <button
            onClick={() => setNameSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            title="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold px-1">Filter by medium</p>
      <div className="flex flex-wrap gap-1 px-1">
        {isAdmin && showAdjustSkew && (() => {
          const allRandActive = skewLayerId === ALL_LAYERS_ID;
          return (
            <button
              onClick={() => {
                if (allRandActive) { setSkewLayerId(null); return; }
                setShowAdjustSkew(true);
                setSkewLayerId(ALL_LAYERS_ID);
              }}
              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border transition-colors ${allRandActive ? 'border-transparent text-black' : 'border-border text-muted-foreground hover:text-foreground'}`}
              style={allRandActive ? { backgroundColor: '#a8d4d2' } : {}}
              data-testid="button-all-rand"
            >
              All Rand
            </button>
          );
        })()}
        {ALL_MEDIA.filter(m => layerDefs.some(l => l.primaryMedium === m)).map(m => {
          const active = mediumFilter.includes(m);
          return (
            <button
              key={m}
              onClick={() => setMediumFilter(prev => active ? prev.filter(x => x !== m) : [...prev, m])}
              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border transition-colors text-black ${active ? 'border-transparent' : 'border-border'}`}
              style={{ backgroundColor: active ? '#a8d4d2' : '#ede4f7' }}
            >
              {m}
            </button>
          );
        })}
        {["Male", "Female"].map(g => {
          const active = genderFilter.includes(g);
          return (
            <button
              key={g}
              onClick={() => setGenderFilter(prev => active ? prev.filter(x => x !== g) : [...prev, g])}
              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border transition-colors text-black ${active ? 'border-transparent' : 'border-border'}`}
              style={{ backgroundColor: active ? '#a8d4d2' : (g === 'Male' ? '#cfe6f9' : '#fbd9e4') }}
            >
              {g}
            </button>
          );
        })}
        {ALL_AFFILIATIONS.filter(a => layerDefs.some(l => (l as any).affiliation && normAffil((l as any).affiliation) === normAffil(a))).map(a => {
          const active = affiliationFilter.includes(a);
          return (
            <button
              key={a}
              onClick={() => setAffiliationFilter(prev => active ? prev.filter(x => x !== a) : [...prev, a])}
              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border transition-colors text-black ${active ? 'border-transparent' : 'border-border'}`}
              style={{ backgroundColor: active ? '#a8d4d2' : '#d6f2d6' }}
            >
              {a}
            </button>
          );
        })}
        <button
          onClick={() => setActiveLayers(activeLayers.length === 0 ? layerDefs.map(l => l.id) : [])}
          className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-border transition-colors"
          style={{ backgroundColor: '#f0f0f0', color: activeLayers.length === 0 ? '#16a34a' : '#dc2626' }}
          data-testid="button-clear-all"
        >
          {activeLayers.length === 0 ? 'Turn All ON' : 'Turn All OFF'}
        </button>
        {(mediumFilter.length > 0 || genderFilter.length > 0 || affiliationFilter.length > 0) && (
          <button onClick={() => { setMediumFilter([]); setGenderFilter([]); setAffiliationFilter([]); }} className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-dashed border-border" style={{ color: '#dc2626' }}>
            CLEAR
          </button>
        )}
      </div>
    </div>
  ) : null;

  // Sort: ranked layers first (rank ascending), unranked last (by name)
  const sortByRank = (defs: LayerDef[]) =>
    [...defs].sort((a, b) => {
      const ra = a.rank ?? Infinity, rb = b.rank ?? Infinity;
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });

  // Fetch layers from API once on mount
  useEffect(() => {
    fetchLayers()
      .then(defs => {
        setLayerDefs(sortByRank(defs));
        setActiveLayers(defs.filter(l => l.active).map(l => l.id));
      })
      .catch(console.error);
  }, []);

  // Reset skew inputs to safe defaults whenever a different layer is selected
  useEffect(() => {
    setSkewOutB(0.00);
    setSkewOutT(0.02);
  }, [skewLayerId]);

  const effectiveValues = useMemo(() => {
    if (layerDefs.length === 0) return undefined; // not yet loaded — use raw DB values
    const allGrids = layerDefs.map(l => l.gridValues);
    // Solo preview: while a layer is selected in Layer Tools, show only that layer
    const soloGrid = showAdjustSkew && skewLayerId !== null
      ? layerDefs.find(l => l.id === skewLayerId)?.gridValues
      : undefined;
    const activeGrids = soloGrid
      ? [soloGrid]
      : effectiveActiveIds
          .map(id => layerDefs.find(l => l.id === id)?.gridValues)
          .filter((g): g is number[][] => !!g);
    if (activeGrids.length === 0) {
      // All layers off — terrain flat (all zero)
      const zeros = new Map<string, number>();
      for (let x = 0; x < 25; x++) for (let z = 0; z < 25; z++) zeros.set(`${x},${z}`, 0);
      return zeros;
    }
    // allGrids provides the fixed normalization reference so single-layer
    // views show proportional heights, not re-normalized to full 0-100.
    return computeLayerValues(activeGrids, allGrids);
  }, [effectiveActiveIds, layerDefs, showAdjustSkew, skewLayerId]);

  // Raw (un-normalized) sum of active layer values per cell — used for People count display.
  // During solo preview, counts reflect only the soloed layer (matching the terrain).
  const rawLayerValues = useMemo(() => {
    if (layerDefs.length === 0) return undefined;
    const soloGrid = showAdjustSkew && skewLayerId !== null
      ? layerDefs.find(l => l.id === skewLayerId)?.gridValues
      : undefined;
    if (!soloGrid && effectiveActiveIds.length === 0) return undefined;
    const activeGrids = soloGrid
      ? [soloGrid]
      : effectiveActiveIds
          .map(id => layerDefs.find(l => l.id === id)?.gridValues)
          .filter((g): g is number[][] => !!g);
    if (activeGrids.length === 0) return undefined;
    const result = new Map<string, number>();
    for (let r = 0; r < 25; r++) {
      const zIndex = 24 - r;
      for (let c = 0; c < 25; c++) {
        const sum = activeGrids.reduce((a, g) => a + (g[r]?.[c] ?? 0), 0);
        result.set(`${c},${zIndex}`, sum);
      }
    }
    return result;
  }, [effectiveActiveIds, layerDefs, showAdjustSkew, skewLayerId]);

  // Per-layer ViewerScore totals — computed once per layerDefs update
  const layerTotals = useMemo(() => {
    const m = new Map<number, string>();
    for (const l of layerDefs) m.set(l.id, l.gridValues.flat().reduce((a, v) => a + v, 0).toFixed(3));
    return m;
  }, [layerDefs]);

  const toggleLayer = (id: number) =>
    setActiveLayers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Ranked layer values at the selected block — used in Results panel
  const layerResultsAtBlock = useMemo(() => {
    if (!selectedSegment || layerDefs.length === 0) return [];
    // During solo preview, Results show only the soloed layer (matching the terrain)
    const soloActive = showAdjustSkew && skewLayerId !== null && layerDefs.some(l => l.id === skewLayerId);
    // Show all filter-visible layers; toggled-off ones appear dimmed with a switch to re-enable
    const sourceIds = soloActive ? [skewLayerId as number] : visibleLayers.map(l => l.id);
    if (sourceIds.length === 0) return [];
    const row = 24 - selectedSegment.zIndex;
    const col = selectedSegment.xIndex;
    const entries = sourceIds.map(id => {
      const layer = layerDefs.find(l => l.id === id);
      if (!layer) return null;
      const active = soloActive || effectiveActiveIds.includes(id);
      return { id, active, name: layer.name, name2: layer.name2 ?? null, description: layer.description ?? null, icon: layer.icon ?? null, rank: (layer as any).rank ?? null, affiliation: (layer as any).affiliation ?? null, value: active ? (layer.gridValues[row]?.[col] ?? 0) : 0 };
    }).filter((r): r is { id: number; active: boolean; name: string; name2: string|null; description: string|null; icon: string|null; rank: number|null; affiliation: string|null; value: number } => !!r);
    const total = entries.reduce((s, r) => s + (r.active ? r.value : 0), 0);
    return entries
      .map(r => ({ ...r, pct: r.active && total > 0 ? r.value / total * 100 : 0 }))
      .sort((a, b) => (Number(b.active) - Number(a.active)) || (b.value - a.value));
  }, [selectedSegment, effectiveActiveIds, layerDefs, showAdjustSkew, skewLayerId, mediumFilter, genderFilter, nameSearch, affiliationFilter]);

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
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const blockBarColor = selectedSegment
    ? isDark
      ? `hsl(${Math.round(240 - (selectedSegment.xIndex / 24) * 240)}, 90%, 60%)`
      : `hsl(${Math.round(240 - (selectedSegment.xIndex / 24) * 240)}, 100%, 48%)`
    : '#a8d4d2';
  const detailBgStyle: React.CSSProperties = {
    backgroundImage: `linear-gradient(${isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)'}, ${isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)'}), url(/detail-bg.png)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
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
      <div className="flex-1 flex flex-col min-h-0 order-2 md:order-1">
       <div className="flex-1 relative min-h-0">
        <Landscape3D onSelectSegment={handleSelect} isDark={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)} surfMode={surfMode} effectiveValues={effectiveValues} rawLayerValues={rawLayerValues} onCameraChange={(x,y,z) => setCameraPos({x,y,z})} />
        
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
       </div>{/* end inner terrain */}

       {/* ── Bottom Bar — only when a segment is selected */}
       {selectedSegment && (
         <div className="flex border-t border-border bg-card shrink-0">
           {/* Left: LAYERS/DETAILS tabs + controls + stats pills */}
            <div className="flex flex-col p-2 justify-between border-r border-border" style={{ width: '28%' }}>
              {/* Row 1 — Tabs (pinned top) */}
              <div className="flex items-center bg-muted rounded-lg p-0.5 text-[10px] font-semibold tracking-wider shrink-0">
                <button
                  onClick={() => setLayerMode('layers')}
                  className={`flex-1 py-1 rounded-md transition-colors ${layerMode === 'layers' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >LAYERS</button>
                <button
                  onClick={() => setLayerMode('details')}
                  className={`flex-1 py-1 rounded-md transition-colors ${layerMode === 'details' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >DETAILS</button>
              </div>
              {/* Row 2 — Dark / Light */}
              <div className="flex gap-1">
                <button onClick={() => setTheme('dark')} className={`flex-1 flex items-center justify-center gap-0.5 text-[9px] font-mono py-0.5 px-1 rounded border transition-colors ${theme === 'dark' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  <Moon className="w-2.5 h-2.5" /> Dark
                </button>
                <button onClick={() => setTheme('light')} className={`flex-1 flex items-center justify-center gap-0.5 text-[9px] font-mono py-0.5 px-1 rounded border transition-colors ${theme === 'light' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  <Sun className="w-2.5 h-2.5" /> Light
                </button>
              </div>
              {/* Row 3 — Surf Mode / Sys */}
              <div className="flex gap-1">
                <button onClick={() => setSurfMode(v => !v)} className={`flex-1 flex items-center justify-between text-[9px] font-mono py-0.5 px-1.5 rounded border transition-colors ${surfMode ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  <span className="flex items-center gap-0.5"><Layers className="w-2.5 h-2.5" /> Surf Mode</span>
                  <span className={`w-6 h-3 rounded-full flex items-center px-0.5 transition-colors ${surfMode ? 'bg-primary' : 'bg-muted'}`}>
                    <span className={`w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${surfMode ? 'translate-x-3' : 'translate-x-0'}`} />
                  </span>
                </button>
                <button onClick={() => setTheme('system')} className={`flex-1 flex items-center justify-center gap-0.5 text-[9px] font-mono py-0.5 px-1 rounded border transition-colors ${theme === 'system' ? 'border-primary text-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  <Monitor className="w-2.5 h-2.5" /> Sys
                </button>
              </div>
              {/* Row 4 — ID:SEG / People */}
              <div className="flex gap-1">
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5 flex-1 justify-center">ID:SEG {selectedSegment.id}:[{selectedSegment.xIndex},{selectedSegment.zIndex}]</Badge>
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5 flex-1 justify-center">ViewerScore© {parseFloat(Number(rawLayerValues?.get(`${selectedSegment.xIndex},${selectedSegment.zIndex}`) ?? selectedSegment.value).toFixed(3))}M</Badge>
              </div>
              {/* Row 5 — POS / CamPos (pinned bottom) */}
              <div className="flex gap-1">
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5 flex-1 justify-center">POS:[{selectedSegment.xIndex},{selectedSegment.zIndex}]</Badge>
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0.5 flex-1 justify-center">CamPos:[{cameraPos.x},{cameraPos.y},{cameraPos.z}]</Badge>
              </div>
            </div>
           {/* Right: Political Domain + Income/Education */}
           <div className="flex flex-col gap-2 p-3 flex-1">
             <div className="p-3 rounded-lg border border-border/40 flex-1 flex flex-col min-h-0 relative" style={detailBgStyle}>
               <button
                 onClick={() => setShowPoliticalPopup(true)}
                 className="absolute top-1.5 right-1.5 p-1 text-foreground/70 hover:text-foreground transition-colors z-10"
                 title="Magnify political domain text"
                 data-testid="button-magnify-political"
               >
                 <AnimatedMagnifier className="w-6 h-6" />
               </button>
               <div className="text-xs leading-snug overflow-y-auto pr-4" style={{ maxHeight: '64px' }}>
                 <span className="uppercase tracking-wider font-bold text-muted-foreground">Political Domain (X)</span>{' '} 
                 <span className="text-foreground/80"><strong style={{ color: getXLabelColor(selectedSegment.xIndex) }}>{xLabels[selectedSegment.xIndex] || selectedSegment.xLabel}</strong>{' → '}{renderPolitical(xDescriptions[selectedSegment.xIndex] || '')}</span>
               </div>
             </div>
             <div className="p-3 rounded-lg border border-border/40 flex-1 flex flex-col min-h-0 relative" style={detailBgStyle}>
               <button
                 onClick={() => setShowIncomePopup(true)}
                 className="absolute top-1.5 right-1.5 p-1 text-foreground/70 hover:text-foreground transition-colors z-10"
                 title="Magnify income/education text"
                 data-testid="button-magnify-income"
               >
                 <AnimatedMagnifier className="w-6 h-6" />
               </button>
               <div className="text-xs leading-snug overflow-y-auto pr-4" style={{ maxHeight: '64px' }}>
                 <span className="uppercase tracking-wider font-bold text-muted-foreground">Income / Education (Z)</span>{' '}
                 <span className="text-foreground/80">{renderConverged(zDescriptions[selectedSegment.zIndex] || '')}</span>
               </div>
             </div>
             {showPoliticalPopup && (
               <div
                 className={`fixed z-50 rounded-lg shadow-2xl border ${isDark ? 'border-white/25' : 'border-black/30'}`}
                 style={{ backgroundColor: isDark ? '#000' : '#fff', color: isDark ? '#fff' : '#000', width: '420px', maxWidth: '90vw', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                 data-testid="popup-political"
               >
                 <button
                   onClick={() => setShowPoliticalPopup(false)}
                   className={`absolute top-1.5 right-1.5 p-0.5 transition-colors ${isDark ? 'text-white/70 hover:text-white' : 'text-black/60 hover:text-black'}`}
                   title="Close"
                   data-testid="button-close-political-popup"
                 >
                   <X className="w-3.5 h-3.5" />
                 </button>
                 <div className="p-3 pr-6 overflow-y-auto" style={{ fontSize: '11pt', lineHeight: 1.45, maxHeight: '70vh' }}>
                   <span className="uppercase tracking-wider font-bold">Political Domain (X)</span>{' '}
                   <strong style={{ color: getXLabelColor(selectedSegment.xIndex) }}>{xLabels[selectedSegment.xIndex] || selectedSegment.xLabel}</strong>{' → '}
                   {renderPolitical(xDescriptions[selectedSegment.xIndex] || '')}
                 </div>
               </div>
             )}
             {showIncomePopup && (
               <div
                 className="fixed z-50 rounded-lg border border-black/30 shadow-2xl"
                 style={{ backgroundColor: '#fff', color: '#000', width: '420px', maxWidth: '90vw', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                 data-testid="popup-income"
               >
                 <button
                   onClick={() => setShowIncomePopup(false)}
                   className="absolute top-1.5 right-1.5 p-0.5 text-black/60 hover:text-black transition-colors"
                   title="Close"
                   data-testid="button-close-income-popup"
                 >
                   <X className="w-3.5 h-3.5" />
                 </button>
                 <div className="p-3 pr-6 overflow-y-auto" style={{ fontSize: '11pt', lineHeight: 1.45, maxHeight: '70vh' }}>
                   <span className="uppercase tracking-wider font-bold">Income / Education (Z)</span>{' '}
                   {renderConverged(zDescriptions[selectedSegment.zIndex] || '')}
                 </div>
               </div>
             )}
           </div>
         </div>
       )}
      </div>{/* end left column */}

      {/* Sidebar Control Panel */}
      <div className="w-full md:w-[460px] lg:w-[530px] h-full bg-card border-l border-border flex flex-col shadow-2xl z-20 order-1 md:order-2">
        <div className="px-3 py-1.5 border-b border-border bg-black/20 relative">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-primary" />
              Inspector
            </h2>
            <div className="flex items-center gap-1">
              {(
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${showAdjustSkew ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Layer & Axis Tools"
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
                <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
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
                </div>
                </>
              )}
            </div>
            </div>{/* end flex items-center gap-1 */}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-3">

          {/* Sliders panel — Adjust Skew + Rename Layers side by side */}
          {showAdjustSkew && (
            <div className="flex flex-col gap-3 animate-in slide-in-from-right-4 duration-200">
              {isAdmin && (<>
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold">Layer Tools</span>
                </div>
                <button onClick={() => { setShowAdjustSkew(false); setSkewLayerId(null); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Search + filter tools on top for quick find */}
              {mediumFilterPills}

              {/* Shared layer list */}
              <div className="flex flex-col gap-1 max-h-[45vh] overflow-y-auto">
                {visibleLayers.length === 0 && <p className="text-[10px] text-muted-foreground font-mono px-1">No layers found.</p>}
                {visibleLayers.map(layer => {
                  const selected = skewLayerId === layer.id;
                  return (
                    <button
                      key={layer.id}
                      onClick={() => {
                        setSkewLayerId(layer.id);
                        setRenameValue(layer.name);
                        setRenameName2((layer as any).name2 ?? "");
                        setRenameDesc((layer as any).description ?? "");
                        const ic = (layer as any).icon ?? null;
                        setRenameIcon(ic);
                        setRenameIconOn(!!ic);
                        setRenameRank((layer as any).rank ?? "");
                        setRenameAffiliation((layer as any).affiliation ?? "");
                        setRenameMedium((layer as any).primaryMedium ?? "");
                        setRenameGender((layer as any).gender ?? "");
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

              {/* Controls — shown when a layer is selected */}
              {skewLayerId !== null && (
                <div className="flex flex-col gap-2">
                  {/* Adjust Skew — full width */}
                  <div className="flex flex-col gap-2 border border-border rounded-lg p-2.5 bg-muted/30">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Randomize{skewLayerId === ALL_LAYERS_ID ? " — ALL layers" : ""} <span className="normal-case font-normal opacity-60">(fraction · 0.05 = ±5%)</span></p>
                    <div className="flex items-end gap-2">
                      <div className="w-16">
                        <Label className="text-[9px] text-zinc-700 dark:text-zinc-300 uppercase">Bottom</Label>
                        <Input type="number" min={0} step="0.01" value={skewOutB} onChange={e => setSkewOutB(Number(e.target.value))} className="h-7 text-xs font-mono" />
                      </div>
                      <div className="w-16">
                        <Label className="text-[9px] text-zinc-700 dark:text-zinc-300 uppercase">Top</Label>
                        <Input type="number" min={0} step="0.01" value={skewOutT} onChange={e => setSkewOutT(Number(e.target.value))} className="h-7 text-xs font-mono" />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 h-7 text-[10px] uppercase tracking-wider"
                        onClick={async () => {
                          setSkewOutB(0.00); setSkewOutT(0.02);
                          if (skewLayerId === null) return;
                          const ids = skewLayerId === ALL_LAYERS_ID ? layerDefs.map(l => l.id) : [skewLayerId];
                          for (const id of ids) {
                            const res = await fetch(`/api/layers/${id}/restore`, { method: 'POST' });
                            if (res.ok) {
                              const data = await res.json();
                              setLayerDefs(prev => prev.map(l => l.id === id ? { ...l, gridValues: data.gridValues } : l));
                            }
                          }
                        }}
                      >
                        Reset
                      </Button>
                      <Button
                        size="sm"
                        disabled={skewApplying}
                        className="flex-1 h-7 text-[10px] uppercase tracking-wider"
                        onClick={async () => {
                          setSkewApplying(true);
                          try {
                            const ids = skewLayerId === ALL_LAYERS_ID ? layerDefs.map(l => l.id) : [skewLayerId];
                            for (const id of ids) {
                              const res = await fetch(`/api/layers/${id}/skew`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ insideBottom: skewOutB, insideTop: skewOutT, outsideBottom: skewOutB, outsideTop: skewOutT }),
                              });
                              if (res.ok) {
                                const updated = await res.json();
                                setLayerDefs(prev => prev.map(l => l.id === id ? { ...l, gridValues: updated.gridValues } : l));
                              }
                            }
                          } finally {
                            setSkewApplying(false);
                          }
                        }}
                      >
                        {skewApplying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                        Apply
                      </Button>
                    </div>
                  </div>

                  {/* Rename Layer — full width, below (hidden in ALL mode) */}
                  {skewLayerId !== ALL_LAYERS_ID && (
                  <div className="flex flex-col gap-2 border border-border rounded-lg p-2.5 bg-muted/30">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Rename Layer</p>

                    {/* Icon + Name (1) + Name (2) — one line */}
                    <div className="flex items-end gap-2">
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Label className="text-[9px] text-zinc-700 dark:text-zinc-300 uppercase">Icon</Label>
                          <button
                            type="button"
                            onClick={() => setRenameIconOn(v => !v)}
                            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${renameIconOn ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                          >
                            <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${renameIconOn ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                        {renameIconOn && (
                          <label
                            className="flex flex-col items-center justify-center w-12 h-12 rounded-full border-2 border-dashed border-border bg-background cursor-pointer overflow-hidden shrink-0"
                            title="Click to upload — JPG or PNG only · max 300×300 px · square images work best"
                          >
                            {renameIcon
                              ? <img src={renameIcon} className="w-full h-full object-cover rounded-full" />
                              : <span className="text-[9px] text-muted-foreground text-center leading-tight">Upload</span>}
                            <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (!['image/jpeg', 'image/png'].includes(file.type)) {
                                alert('Only JPG or PNG files are allowed.');
                                e.target.value = '';
                                return;
                              }
                              const img = new Image();
                              const url = URL.createObjectURL(file);
                              img.onload = () => {
                                URL.revokeObjectURL(url);
                                if (img.width > 300 || img.height > 300) {
                                  alert(`Image must be 300×300 px or smaller (yours is ${img.width}×${img.height}).`);
                                  e.target.value = '';
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = ev => setRenameIcon(ev.target?.result as string);
                                reader.readAsDataURL(file);
                              };
                              img.src = url;
                            }} />
                          </label>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Label className="text-[9px] text-zinc-700 dark:text-zinc-300 uppercase">Name (1) — Main</Label>
                        <Input
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          className="h-7 text-xs font-mono uppercase"
                          placeholder="LAYER NAME…"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Label className="text-[9px] text-zinc-700 dark:text-zinc-300 uppercase">Name (2) — Subtitle</Label>
                        <Input
                          value={renameName2}
                          onChange={e => setRenameName2(e.target.value.slice(0, 20))}
                          className="h-7 text-xs font-mono"
                          placeholder="Short subtitle…"
                          maxLength={20}
                        />
                      </div>
                    </div>
                    {renameIconOn && (
                      <p className="text-[9px] font-semibold" style={{ color: '#8b0000' }}>
                        JPG or PNG only · max 300×300 px · square images work best
                      </p>
                    )}

                    {/* Rank · Affiliation · Gender · Primary Medium — one line */}
                    <div className="grid grid-cols-4 gap-2">
                    <div>
                      <Label className="text-[9px] text-zinc-700 dark:text-zinc-300 uppercase">Rank</Label>
                      <Input
                        type="number"
                        min={1}
                        max={200}
                        value={renameRank}
                        onChange={e => setRenameRank(e.target.value === "" ? "" : Number(e.target.value))}
                        className="h-7 text-xs font-mono"
                        placeholder="e.g. 2"
                      />
                    </div>

                    {/* Affiliation */}
                    <div>
                      <Label className="text-[9px] text-zinc-700 dark:text-zinc-300 uppercase">Affiliation</Label>
                      <Input
                        value={renameAffiliation}
                        onChange={e => setRenameAffiliation(e.target.value)}
                        className="h-7 text-xs font-mono uppercase"
                        placeholder="e.g. FOX, NBC, NPR…"
                      />
                    </div>

                    {/* Gender */}
                    <div>
                      <Label className="text-[9px] text-zinc-700 dark:text-zinc-300 uppercase">Gender</Label>
                      <select
                        value={renameGender}
                        onChange={e => setRenameGender(e.target.value)}
                        className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— select —</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>

                    {/* Primary Medium */}
                    <div>
                      <Label className="text-[9px] text-zinc-700 dark:text-zinc-300 uppercase">Primary Medium</Label>
                      <select
                        value={renameMedium}
                        onChange={e => setRenameMedium(e.target.value)}
                        className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— select —</option>
                        {ALL_MEDIA.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    </div>{/* end 4-col grid */}

                    <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={renameApplying || !renameValue.trim()}
                      className="flex-1 h-7 text-[10px] uppercase tracking-wider"
                      onClick={async () => {
                        setRenameApplying(true);
                        try {
                          const res = await fetch(`/api/layers/${skewLayerId}/rename`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              name: renameValue.trim(),
                              name2: renameName2.trim() || undefined,
                              description: renameDesc.trim() || undefined,
                              icon: renameIcon ?? undefined,
                              rank: renameRank !== "" ? Number(renameRank) : undefined,
                              affiliation: renameAffiliation.trim() || undefined,
                              primaryMedium: renameMedium || undefined,
                              gender: renameGender || undefined,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            toast({ title: "Save failed", description: data.message ?? "Unknown error", variant: "destructive" });
                            return;
                          }
                          setLayerDefs(prev => sortByRank(prev.map(l => l.id === skewLayerId ? { ...l, name: data.name, name2: data.name2, description: data.description, icon: data.icon, rank: data.rank, affiliation: data.affiliation, primaryMedium: data.primaryMedium, gender: data.gender } : l)));
                          toast({ title: "Layer saved", description: `"${data.name}" updated successfully.` });
                        } catch (err) {
                          toast({ title: "Save failed", description: "Network error — check connection.", variant: "destructive" });
                        } finally {
                          setRenameApplying(false);
                        }
                      }}
                    >
                      {renameApplying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Save
                    </Button>

                    {/* Delete layer */}
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 h-7 text-[10px] uppercase tracking-wider"
                      onClick={async () => {
                        const layerName = layerDefs.find(l => l.id === skewLayerId)?.name ?? "this layer";
                        if (!window.confirm(`Delete "${layerName}"? This cannot be undone.`)) return;
                        try {
                          const res = await fetch(`/api/layers/${skewLayerId}`, { method: 'DELETE' });
                          if (!res.ok) {
                            toast({ title: "Delete failed", description: "Server error — try again.", variant: "destructive" });
                            return;
                          }
                          setLayerDefs(prev => prev.filter(l => l.id !== skewLayerId));
                          setActiveLayers(prev => prev.filter(id => id !== skewLayerId));
                          setSkewLayerId(null);
                          toast({ title: "Layer deleted", description: `"${layerName}" has been removed.` });
                        } catch {
                          toast({ title: "Delete failed", description: "Network error — check connection.", variant: "destructive" });
                        }
                      }}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Delete This Layer
                    </Button>
                    </div>
                  </div>
                  )}
                </div>
              )}
              </>)}

              {/* ── X and Z Axis Tools ── */}
              <div className="flex items-center justify-between pb-2 border-b border-border mt-2">
                <div className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold">X and Z Axis Tools</span>
                </div>
                {!isAdmin && (
                  <button onClick={() => { setShowAdjustSkew(false); setSkewLayerId(null); }} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <AxisTools />
            </div>
          )}

          {/* Switching content — hidden while Layer Tools is open to give the list more room */}
          {!showAdjustSkew && (layerMode === 'layers' ? (
            <div className="flex flex-col gap-2">
              {/* Media type filter pills */}
              {mediumFilterPills}

              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
                Layers ({visibleLayers.length}{(mediumFilter.length > 0 || genderFilter.length > 0) ? ` of ${layerDefs.length}` : ''})
              </p>
              {layerDefs.length === 0 ? (
                <p className="text-xs text-muted-foreground font-mono px-1">No layers found — try refreshing.</p>
              ) : (
                visibleLayers.map(layer => {
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
                        <span className="flex items-start gap-1.5 min-w-0">
                          {layer.icon ? (
                            <img
                              src={layer.icon}
                              alt=""
                              className="w-4 h-4 rounded-full shrink-0 object-cover mt-0.5"
                            />
                          ) : (
                            <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: '#a8d4d2' }} />
                          )}
                          <span className="flex items-baseline gap-2 min-w-0 flex-1 text-left">
                            <span className="text-sm uppercase tracking-wider text-black dark:text-white truncate min-w-0">{layer.name}</span>
                            {layer.name2 && (
                              <span className="text-xs text-muted-foreground truncate">{layer.name2}</span>
                            )}
                            {(layer as any).rank != null && (
                              <span className="text-xs text-muted-foreground font-mono whitespace-nowrap shrink-0">Rank {(layer as any).rank}</span>
                            )}
                            <span className="text-xs text-muted-foreground font-mono whitespace-nowrap shrink-0">
                              ViewerScore<sup className="text-[8px]">©</sup> {layerTotals.get(layer.id) ?? '0.000'}M
                            </span>
                          </span>
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
                {effectiveActiveIds.length > 0 && effectiveValues
                  ? `${effectiveActiveIds.length} layer${effectiveActiveIds.length > 1 ? 's' : ''} active · normalized 0–100`
                  : 'No layers active — terrain zeroed'}
              </p>
            </div>
          ) : (
            selectedSegment ? (
              <div className="p-3 rounded-lg border border-border/40 flex-1 flex flex-col min-h-0" style={detailBgStyle}>
                <Label className="text-sm uppercase tracking-wider text-primary mb-2 block shrink-0">
                  Results — [{selectedSegment.xIndex},{selectedSegment.zIndex}]
                </Label>
                <div className="mb-2 shrink-0">{mediumFilterPills}</div>
                {layerResultsAtBlock.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">— no active layers —</div>
                ) : (
                  <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-1">
                    {layerResultsAtBlock.map((r, i) => (
                      <div key={r.id} className={`rounded-lg border-[1.5px] border-black dark:border-zinc-300 px-3 py-1.5 transition-opacity ${r.active ? '' : 'opacity-40'}`}>
                        {/* Large icon spans name row + bar row */}
                        <div className="flex items-start gap-3">
                          <span className="text-sm font-mono text-foreground/60 shrink-0 pt-4">{r.active ? `${i + 1}.` : '—'}</span>
                          {r.icon && (
                            <img src={r.icon} alt="" className="w-16 h-16 rounded-full object-cover shrink-0" />
                          )}
                          <div className="flex flex-col min-w-0 flex-1 gap-1.5 -mt-1">
                            {/* Text row: name · rank · pct */}
                            <div className="flex items-baseline gap-3 min-w-0">
                              <span className="text-xl font-semibold text-foreground truncate">{r.name}</span>
                              <span className="flex-1" />
                              {r.rank != null && (
                                <span className="text-sm font-mono text-foreground/50 shrink-0 whitespace-nowrap">Rank → {String(r.rank).padStart(2, '0')}</span>
                              )}
                              <span className="text-xl font-mono font-bold text-foreground shrink-0">{r.pct.toFixed(2)}%</span>
                            </div>
                            {/* Percentage bar — starts at text indent */}
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${r.pct}%`, backgroundColor: blockBarColor }}
                              />
                            </div>
                            {/* Below the bar: affiliation left · on/off switch right */}
                            <div className="flex items-center justify-between pt-0.5 min-w-0 gap-2">
                              <span className="text-base font-semibold text-foreground/90 truncate">{r.affiliation ?? ''}</span>
                              <span className="flex-1" />
                              <span className="text-sm font-mono text-foreground/50 whitespace-nowrap shrink-0">
                                ViewerScore<sup className="text-[9px]">©</sup> {layerTotals.get(r.id) ?? '0.000'}M
                              </span>
                              <button
                                onClick={() => toggleLayer(r.id)}
                                title={r.active ? 'Turn layer off' : 'Turn layer on'}
                                className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${r.active ? '' : 'bg-muted'}`}
                                style={r.active ? { backgroundColor: '#a8d4d2' } : {}}
                              >
                                <span className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${r.active ? 'translate-x-5' : 'translate-x-0'}`} />
                              </button>
                            </div>
                          </div>
                        </div>
                        {/* Description — inside the card, below bar */}
                        {r.description && (
                          <p className="text-base text-foreground/80 leading-snug pt-1.5">{r.description}</p>
                        )}
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      total · {layerResultsAtBlock.reduce((s, r) => s + r.value, 0).toFixed(4)}M · {layerResultsAtBlock.filter(r => r.active).length} layer{layerResultsAtBlock.filter(r => r.active).length !== 1 ? 's' : ''}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-4">
                <div className="w-16 h-16 rounded-full border-2 border-dashed border-current flex items-center justify-center">
                  <Info className="w-8 h-8" />
                </div>
                <p className="text-center text-sm px-8">Select a segment in the 3D grid to view its details.</p>
              </div>
            )
          ))}
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
