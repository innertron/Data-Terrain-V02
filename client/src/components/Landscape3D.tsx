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
function getBarColor(value: number, maxValue: number, xIndex: number, isDark: boolean) {
  const intensity = Math.min(value / maxValue, 1);
  
  const hue = THREE.MathUtils.lerp(240, 0, xIndex / 24); 
  if (isDark) {
    const saturation = 80 + intensity * 20;
    const lightness = 30 + intensity * 40;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  } else {
    const saturation = 100;
    const lightness = 40 + intensity * 15;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }
}

// --- Components ---

function Bar({ 
  data, 
  maxValue, 
  onHover, 
  isSelected,
  isDark = true
}: { 
  data: GridSegment; 
  maxValue: number; 
  onHover: (data: GridSegment | null) => void;
  isSelected: boolean;
  isDark?: boolean;
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

  const color = useMemo(() => getBarColor(data.value, maxValue, data.xIndex, isDark), [data.value, maxValue, data.xIndex, isDark]);

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
        emissiveIntensity={isDark ? (isSelected ? 0.8 : hovered ? 0.5 : 0.2) : (isSelected ? 0.3 : hovered ? 0.1 : 0)}
        roughness={isDark ? 0.2 : 0.6}
        metalness={isDark ? 0.8 : 0.1}
      />
    </mesh>
  );
}

const X_LABELS = [
  'DEM-4','DEM-3','DEM-2','DEM-1','DEM 0',
  'DEM+1','DEM+2','DEM+3','DEM+4','Swng/z',
  'Swng/y','Swng/x','Swng 0','Swng\\x','Swng\\y',
  'Swng\\z','GOP+4','GOP+3','GOP+2','GOP+1',
  'GOP 0','GOP-1','GOP-2','GOP-3','GOP-4'
];

const Z_LABELS = [
  '<$34K GED','$35K GED','$40K GED','$45K AS','$50K BA1',
  '$55K BA2','$60K BAMS','$65K Trade1','$70K Trade2','$77K BAPhD',
  '$80K BS1','$90K BS2','$100K Trade3','$120K BSMS','$150K BSPhD1',
  '$175K BSPhD2','$200K BSJD1','$250K BSJD2','$300K MD1','$400K MD2',
  '$500K MDPhD1','$1M MDPhD2','$50M MDPhD3','$1B Luck1','$20B+ Luck2'
];

function AxisLabels({ isDark = true }: { isDark?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const [xLabelSide, setXLabelSide] = useState<'front' | 'back'>('front');
  const [zLabelSide, setZLabelSide] = useState<'right' | 'left'>('right');

  const edge = (GRID_SIZE / 2) * (BAR_SIZE + GAP);
  const labelOffset = 2.5;

  useFrame(({ camera }) => {
    const camX = camera.position.x;
    const camZ = camera.position.z;

    setXLabelSide(camZ > 0 ? 'front' : 'back');
    setZLabelSide(camX > 0 ? 'right' : 'left');
  });

  const xZ = xLabelSide === 'front' ? edge + labelOffset : -(edge + labelOffset);
  const zX = zLabelSide === 'right' ? edge + labelOffset : -(edge + labelOffset);
  const xTitleZ = xLabelSide === 'front' ? edge + labelOffset + 2 : -(edge + labelOffset + 2);
  const zTitleX = zLabelSide === 'right' ? edge + labelOffset + 4 : -(edge + labelOffset + 4);

  return (
    <group ref={groupRef}>
      {/* X-Axis Title */}
      <Billboard position={[0, 1.5, xTitleZ]}>
        <Text fontSize={0.9} color={isDark ? 'white' : '#aaaaaa'} anchorX="center" anchorY="middle">
          POLITICAL DOMAIN (X)
        </Text>
      </Billboard>

      {/* Individual X-Axis Labels */}
      {X_LABELS.map((label, i) => {
        const xPos = (i - GRID_SIZE / 2) * (BAR_SIZE + GAP);
        const hue = THREE.MathUtils.lerp(240, 0, i / 24);
        const color = isDark ? `hsl(${hue}, 90%, 60%)` : 'black';
        return (
          <Billboard key={`x-${i}`} position={[xPos, 0.5, xZ]}>
            <Text fontSize={0.45} color={color} anchorX="center" anchorY="middle">
              {label}
            </Text>
          </Billboard>
        );
      })}

      {/* Z-Axis Title */}
      <Billboard position={[zTitleX, 1.5, 0]}>
        <Text fontSize={0.9} color={isDark ? 'white' : '#aaaaaa'} anchorX="center" anchorY="middle">
          INCOME / EDUCATION (Z)
        </Text>
      </Billboard>

      {/* Individual Z-Axis Labels */}
      {Z_LABELS.map((label, i) => {
        const zPos = (i - GRID_SIZE / 2) * (BAR_SIZE + GAP);
        return (
          <Billboard key={`z-${i}`} position={[zX, 0.5, zPos]}>
            <Text fontSize={0.35} color={isDark ? '#e6c040' : 'black'} anchorX={zLabelSide === 'right' ? 'left' : 'right'} anchorY="middle">
              {label}
            </Text>
          </Billboard>
        );
      })}
    </group>
  );
}

function FloatingLabel({ data }: { data: GridSegment }) {
  const xPos = (data.xIndex - GRID_SIZE / 2) * (BAR_SIZE + GAP);
  const zPos = (data.zIndex - GRID_SIZE / 2) * (BAR_SIZE + GAP);
  
  const domainLabel = X_LABELS[data.xIndex] || data.xLabel;
  const incomeLabel = Z_LABELS[data.zIndex] || data.zLabel;

  return (
    <Html position={[xPos, MAX_HEIGHT + 2, zPos]} center style={{ pointerEvents: 'none' }}>
      <div className="bg-black/80 backdrop-blur-md border border-primary/50 p-3 rounded-lg shadow-2xl min-w-[220px] transform transition-all duration-200">
        <h4 className="text-primary font-bold text-lg font-display mb-1">{data.value.toLocaleString()} People</h4>
        <div className="text-xs text-muted-foreground space-y-1 font-mono">
          <p><span className="text-white">Domain:</span> {domainLabel}</p>
          <p><span className="text-white">Income/Edu:</span> {incomeLabel}</p>
          <p className="italic border-t border-white/10 pt-1 mt-1 text-white/40">Segment [{data.xIndex},{data.zIndex}]</p>
        </div>
      </div>
    </Html>
  );
}

export function Landscape3D({ onSelectSegment, isDark = true }: { onSelectSegment: (s: GridSegment) => void; isDark?: boolean; }) {
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
        className={isDark ? "canvas-container" : "canvas-container-light"}
      >
        <color attach="background" args={[isDark ? '#050505' : '#f5f5f5']} />
        <fog attach="fog" args={[isDark ? '#050505' : '#f5f5f5', 30, 120]} />
        
        {/* Lights */}
        <ambientLight intensity={isDark ? 0.5 : 0.8} />
        <directionalLight 
          position={[10, 20, 10]} 
          intensity={isDark ? 1 : 1.5} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
        />
        {isDark && <pointLight position={[-10, 10, -10]} color="#f0f" intensity={0.5} />}
        {isDark && <pointLight position={[10, 10, 10]} color="#0ff" intensity={0.5} />}

        {/* Environment */}
        {isDark && <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />}
        
        {/* Helper Grid on floor */}
        <gridHelper args={[GRID_SIZE * 1.5, GRID_SIZE, isDark ? 0x333333 : 0xcccccc, isDark ? 0x111111 : 0xe0e0e0]} position={[0, -0.1, 0]} />

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
              isDark={isDark}
            />
          ))}
          <AxisLabels isDark={isDark} />
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
