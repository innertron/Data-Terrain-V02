import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Billboard, Stars, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import { useSegments } from "@/hooks/use-segments";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

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

// --- Constants ---
const GRID_SIZE = 25;
const BAR_SIZE = 0.8; // Width/Depth of each bar
const GAP = 0.2; // Space between bars
const MAX_HEIGHT = 10; // Maximum visual height for the highest value

// --- Helper: Color Gradient ---
// Returns a color based on value intensity and X-axis position (Political domain)
function getBarColor(value: number, maxValue: number, xIndex: number) {
  const intensity = Math.min(value / maxValue, 1);
  
  // Base hues: Left (0) = Red/Orange, Center (12) = Purple, Right (24) = Blue/Cyan
  const hue = THREE.MathUtils.lerp(0, 240, xIndex / 24); 
  const saturation = 80 + intensity * 20; // More intense values = more saturated
  const lightness = 30 + intensity * 40;  // Higher values = brighter

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// --- Components ---

function Bar({ 
  data, 
  maxValue, 
  onHover, 
  isSelected 
}: { 
  data: GridSegment; 
  maxValue: number; 
  onHover: (data: GridSegment | null) => void;
  isSelected: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [hovered, setHover] = useState(false);

  // Normalize height: Avoid 0 height for visibility
  const height = Math.max((data.value / maxValue) * MAX_HEIGHT, 0.1); 
  
  // Calculate position: Center the grid around (0,0,0)
  // xIndex 0..24 -> -12..12
  const xPos = (data.xIndex - GRID_SIZE / 2) * (BAR_SIZE + GAP);
  const zPos = (data.zIndex - GRID_SIZE / 2) * (BAR_SIZE + GAP);
  
  // Y position: BoxGeometry is centered, so we need to lift it up by height/2
  const yPos = height / 2;

  const color = useMemo(() => getBarColor(data.value, maxValue, data.xIndex), [data.value, maxValue, data.xIndex]);

  useFrame((state) => {
    if (!ref.current) return;
    // subtle pulsing animation if selected
    if (isSelected) {
      ref.current.scale.x = THREE.MathUtils.lerp(ref.current.scale.x, 1.1, 0.1);
      ref.current.scale.z = THREE.MathUtils.lerp(ref.current.scale.z, 1.1, 0.1);
    } else {
      ref.current.scale.x = THREE.MathUtils.lerp(ref.current.scale.x, hovered ? 1.05 : 1, 0.1);
      ref.current.scale.z = THREE.MathUtils.lerp(ref.current.scale.z, hovered ? 1.05 : 1, 0.1);
    }
  });

  return (
    <mesh
      ref={ref}
      position={[xPos, yPos, zPos]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        onHover(data);
      }}
      onPointerOut={() => {
        setHover(false);
        onHover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onHover(data); // Also select on click for mobile
      }}
    >
      <boxGeometry args={[BAR_SIZE, height, BAR_SIZE]} />
      <meshStandardMaterial 
        color={isSelected ? "#ffffff" : color} 
        emissive={color}
        emissiveIntensity={isSelected ? 0.8 : hovered ? 0.5 : 0.2}
        roughness={0.2}
        metalness={0.8}
      />
    </mesh>
  );
}

function AxisLabels() {
  const offset = (GRID_SIZE / 2) * (BAR_SIZE + GAP) + 2;

  const xLabels = [
    'DEM-4','DEM-3','DEM-2','DEM-1','DEM 0',
    'DEM+1','DEM+2','DEM+3','DEM+4','Swng/z',
    'Swng/y','Swng/x','Swng 0','Swng\\x','Swng\\y',
    'Swng\\z','GOP+4','GOP+3','GOP+2','GOP+1',
    'GOP 0','GOP-1','GOP-2','GOP-3','GOP-4'
  ];

  return (
    <group>
      {/* X-Axis Title */}
      <Billboard position={[0, -0.5, offset + 2]}>
        <Text fontSize={0.8} color="white" anchorX="center" anchorY="top">
          POLITICAL DOMAIN (X)
        </Text>
      </Billboard>

      {/* Individual X-Axis Labels */}
      {xLabels.map((label, i) => {
        const xPos = (i - GRID_SIZE / 2) * (BAR_SIZE + GAP);
        const zPos = (GRID_SIZE / 2) * (BAR_SIZE + GAP) + 1;
        const t = i / 24;
        const r = Math.round(255 * (1 - t));
        const b = Math.round(255 * t);
        const color = `rgb(${r}, 80, ${b})`;
        return (
          <Billboard key={i} position={[xPos, -0.3, zPos]}>
            <Text fontSize={0.35} color={color} anchorX="center" anchorY="top">
              {label}
            </Text>
          </Billboard>
        );
      })}

      {/* Z-Axis Label: Income/Education */}
      <Billboard position={[offset + 2, -0.5, 0]}>
        <Text fontSize={0.8} color="white" anchorX="center" anchorY="middle">
          INCOME / EDUCATION (Z)
        </Text>
      </Billboard>

      {/* Origin/Start Labels */}
      <Billboard position={[-offset + 2, 0, offset]}>
        <Text fontSize={0.5} color="#aaa">Left / Low</Text>
      </Billboard>
      <Billboard position={[offset - 2, 0, offset]}>
        <Text fontSize={0.5} color="#aaa">Right / Low</Text>
      </Billboard>
      
      <Billboard position={[offset, 0, -offset + 2]}>
        <Text fontSize={0.5} color="#aaa">High</Text>
      </Billboard>
    </group>
  );
}

function FloatingLabel({ data }: { data: GridSegment }) {
  // Use HTML for the tooltip so it's crisp and always on top
  // Position it slightly above the bar
  const height = (data.value / 100) * MAX_HEIGHT; // Approximate height ref
  const xPos = (data.xIndex - GRID_SIZE / 2) * (BAR_SIZE + GAP);
  const zPos = (data.zIndex - GRID_SIZE / 2) * (BAR_SIZE + GAP);
  
  return (
    <Html position={[xPos, MAX_HEIGHT + 2, zPos]} center style={{ pointerEvents: 'none' }}>
      <div className="bg-black/80 backdrop-blur-md border border-primary/50 p-3 rounded-lg shadow-2xl min-w-[200px] transform transition-all duration-200">
        <h4 className="text-primary font-bold text-lg font-display mb-1">{data.value.toLocaleString()} People</h4>
        <div className="text-xs text-muted-foreground space-y-1 font-mono">
          <p><span className="text-white">Domain:</span> {data.xLabel}</p>
          <p><span className="text-white">Level:</span> {data.zLabel}</p>
          {data.description && <p className="italic border-t border-white/10 pt-1 mt-1">{data.description}</p>}
        </div>
      </div>
    </Html>
  );
}

export function Landscape3D({ onSelectSegment }: { onSelectSegment: (s: GridSegment) => void }) {
  const { data: segments, isLoading, error } = useSegments();
  const [hoveredSegment, setHoveredSegment] = useState<GridSegment | null>(null);

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm animate-in fade-in">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground font-mono animate-pulse">Initializing DemoScape 4.0...</p>
      </div>
    );
  }

  if (error || !segments) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-destructive font-bold text-xl bg-destructive/10 p-8 rounded-2xl border border-destructive/20">
          Error loading simulation data.
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...segments.map(s => s.value), 1);

  return (
    <div className="w-full h-full relative group">
      <Canvas 
        shadows 
        camera={{ position: [25, 20, 25], fov: 45 }}
        className="canvas-container"
      >
        <color attach="background" args={['#050505']} />
        <fog attach="fog" args={['#050505', 20, 80]} />
        
        {/* Lights */}
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[10, 20, 10]} 
          intensity={1} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
        />
        <pointLight position={[-10, 10, -10]} color="#f0f" intensity={0.5} />
        <pointLight position={[10, 10, 10]} color="#0ff" intensity={0.5} />

        {/* Environment */}
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        {/* Helper Grid on floor */}
        <gridHelper args={[GRID_SIZE * 1.5, GRID_SIZE, 0x333333, 0x111111]} position={[0, -0.1, 0]} />

        {/* The Data Landscape */}
        <group>
          {segments.map((seg) => (
            <Bar 
              key={seg.id} 
              data={seg} 
              maxValue={maxValue} 
              onHover={(s) => {
                setHoveredSegment(s);
                if (s) onSelectSegment(s);
              }}
              isSelected={hoveredSegment?.id === seg.id}
            />
          ))}
          <AxisLabels />
        </group>

        {/* Hover Label */}
        {hoveredSegment && <FloatingLabel data={hoveredSegment} />}

        <OrbitControls 
          enableDamping 
          dampingFactor={0.05} 
          minPolarAngle={0} 
          maxPolarAngle={Math.PI / 2 - 0.1} // Prevent going below ground
          maxDistance={60}
          minDistance={10}
        />
      </Canvas>
      
      {/* Overlay UI hints */}
      <div className="absolute bottom-6 left-6 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
        <div className="flex gap-2 text-xs font-mono text-white/50 bg-black/50 px-3 py-1 rounded-full border border-white/10">
          <span>LMB: Rotate</span>
          <span>•</span>
          <span>RMB: Pan</span>
          <span>•</span>
          <span>Scroll: Zoom</span>
        </div>
      </div>
    </div>
  );
}
