import { useState } from "react";
import { Landscape3D } from "@/components/Landscape3D";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUpdateSegment } from "@/hooks/use-segments";
import { Loader2, Save, Info, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

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
  '<$34K GED','$35K GED','$40K GED','$45K AS','$50K BA1',
  '$55K BA2','$60K BAMS','$65K Trade1','$70K Trade2','$77K BAPhD',
  '$80K BS1','$90K BS2','$100K Trade3','$120K BSMS','$150K BSPhD1',
  '$175K BSPhD2','$200K BSJD1','$250K BSJD2','$300K MD1','$400K MD2',
  '$500K MDPhD1','$1M MDPhD2','$50M MDPhD3','$1B Luck1','$20B+ Luck2'
];

const Z_MIDDLE_NAMES = [
  'GED, n/a',
  'n/a, GED, AS, BA',
  'GED, AS, BA, Trade',
  'ITTrade, Trade, AS, BA',
  'BA, AS, ITTrade, Trade',
  'BA, AS, Trade, ITTrade',
  'BA, ITTrade, AS, Trade',
  'Trade, ITTrade, BA, AS',
  'BA, Trade, BA, ITTrade, BAJD',
  'BA, Trade, BAJD, ITTrade',
  'ITTrade, BSN, BAfin, BA| BS',
  'BAMS, MSN, ITTrade, BS',
  'ITTrade, BS, PhDmath, finMBA, BSMS, PhDmath',
  'DNP, ITTrade, PharmD, BSMS, BSMS, finMBA',
  'Barch, BSMS, BSMS, BSMS',
  'BAJD, BSPhD, BSMS, BSJD',
  'BAJD, BSPhD, DVM/VDM, DDS/DMD',
  'BSJD, MD, DVM/VDM, MDPhD',
  'MD, MDPhD, MDPhD',
  'MDPhD, DDS/DMD, BAJD, MD, BSJD',
  'MD, MDPhD',
  'MD, MDPhD',
  'MDPhD, BAJD, BSJD',
  'Luck',
  'Luck'
];

export default function Home() {
  const [selectedSegment, setSelectedSegment] = useState<GridSegment | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const updateMutation = useUpdateSegment();
  const queryClient = useQueryClient();

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
        onSuccess: () => {
          // Optimistic update locally for immediate feedback if needed, 
          // but react-query invalidation handles it mostly.
        }
      }
    );
  };

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row overflow-hidden bg-background text-foreground">
      
      {/* 3D Viewport - Takes dominant space */}
      <div className="flex-1 relative h-[60vh] md:h-auto order-2 md:order-1">
        <Landscape3D onSelectSegment={handleSelect} />
        
        {/* Header Overlay */}
        <div className="absolute top-6 left-6 z-10 pointer-events-none">
          <h1 className="text-4xl md:text-5xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-accent drop-shadow-lg">
            DemoScape 4.0
          </h1>
          <p className="text-muted-foreground font-mono mt-2 text-sm bg-black/40 backdrop-blur-sm px-2 py-1 rounded inline-block border border-white/5">
            Module Interaction & Visualization
          </p>
        </div>
      </div>

      {/* Sidebar Control Panel */}
      <div className="w-full md:w-[350px] lg:w-[400px] h-full bg-card border-l border-border flex flex-col shadow-2xl z-20 order-1 md:order-2">
        <div className="p-6 border-b border-border bg-black/20">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            Inspector
          </h2>
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
                <div className="bg-muted/30 p-4 rounded-xl border border-white/5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">
                    Political Domain (X)
                  </Label>
                  <div className="text-lg font-medium">{X_LABELS[selectedSegment.xIndex] || selectedSegment.xLabel}: {X_MIDDLE_NAMES[selectedSegment.xIndex] || ''}</div>
                </div>

                <div className="bg-muted/30 p-4 rounded-xl border border-white/5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">
                    Income / Education (Z)
                  </Label>
                  <div className="text-lg font-medium">{Z_LABELS[selectedSegment.zIndex] || selectedSegment.zLabel}: {Z_MIDDLE_NAMES[selectedSegment.zIndex] || ''}</div>
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
