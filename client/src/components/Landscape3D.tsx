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
const BAR_SIZE = 0.864; // Width/Depth of each bar
const GAP = 0.136; // Space between bars
const MAX_HEIGHT = 6.6; // Maximum visual height for the highest value (66% of original 10)

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
  onSelect,
  isSelected,
  isDark = true,
  overrideValue,
}: { 
  data: GridSegment; 
  maxValue: number; 
  onHover: (data: GridSegment | null) => void;
  onSelect: (data: GridSegment) => void;
  isSelected: boolean;
  isDark?: boolean;
  overrideValue?: number;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const [hovered, setHover] = useState(false);

  const effectiveVal = overrideValue ?? data.value;
  const height = Math.max((effectiveVal / maxValue) * MAX_HEIGHT, 0.1); 
  
  const xPos = (data.xIndex - GRID_SIZE / 2) * (BAR_SIZE + GAP);
  const zPos = (data.zIndex - GRID_SIZE / 2) * (BAR_SIZE + GAP);
  const yPos = height / 2;

  const color = useMemo(() => getBarColor(effectiveVal, maxValue, data.xIndex, isDark), [effectiveVal, maxValue, data.xIndex, isDark]);

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
        onSelect(data);
      }}
    >
      <boxGeometry args={[BAR_SIZE, height, BAR_SIZE]} />
      <meshStandardMaterial 
        color={isSelected ? "#ffffff" : color} 
        emissive={isSelected ? "#ffffff" : color}
        emissiveIntensity={isDark ? (isSelected ? 0.8 : hovered ? 0.5 : 0.2) : (isSelected ? 0.9 : hovered ? 0.15 : 0)}
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
  '$20B+ Luck2','$1B Luck1','$50M MDPhD3','$1M MDPhD2','$500K MDPhD1',
  '$400K MD2','$300K MD1','$250K BSJD2','$200K BSJD1','$175K BSPhD2',
  '$150K BSPhD1','$120K BSMS','$100K Trade3','$90K BS2','$80K BS1',
  '$77K BAPhD','$70K Trade2','$65K Trade1','$60K BAMS','$55K BA2',
  '$50K BA1','$45K AS','$40K GED','$35K GED','<$34K GED'
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

function SurfaceTerrain({ segments, maxValue, isDark, onHover, onSelectSegment, effectiveValues }: {
  segments: GridSegment[];
  maxValue: number;
  isDark: boolean;
  onHover: (s: GridSegment | null) => void;
  onSelectSegment: (s: GridSegment) => void;
  effectiveValues?: Map<string, number>;
}) {
  const segMap = useMemo(() => new Map(segments.map(s => [`${s.xIndex},${s.zIndex}`, s])), [segments]);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(
      GRID_SIZE * (BAR_SIZE + GAP),
      GRID_SIZE * (BAR_SIZE + GAP),
      GRID_SIZE - 1,
      GRID_SIZE - 1
    );

    const positions = geo.attributes.position.array as Float32Array;
    const colorArr = new Float32Array(positions.length);

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const vi = row * GRID_SIZE + col;
        const xi = col;
        const zi = row;
        const seg = segMap.get(`${xi},${zi}`);
        const effectiveVal = effectiveValues
          ? (effectiveValues.get(`${xi},${zi}`) ?? 0)
          : (seg?.value ?? 0);
        const height = (effectiveVal / maxValue) * MAX_HEIGHT;
        positions[vi * 3 + 2] = height;

        const cssColor = getBarColor(effectiveVal, maxValue, xi, isDark);
        const color = new THREE.Color(cssColor);
        colorArr[vi * 3] = color.r;
        colorArr[vi * 3 + 1] = color.g;
        colorArr[vi * 3 + 2] = color.b;
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colorArr, 3));
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [segments, maxValue, isDark, segMap, effectiveValues]);

  // Edge walls — vertical quads dropping to y=0 on any perimeter edge with height > 0
  const wallGeometry = useMemo(() => {
    const step = BAR_SIZE + GAP;
    const totalSize = GRID_SIZE * step;

    const getH = (row: number, col: number) => {
      const seg = segMap.get(`${col},${row}`);
      const ev = effectiveValues ? (effectiveValues.get(`${col},${row}`) ?? 0) : (seg?.value ?? 0);
      return (ev / maxValue) * MAX_HEIGHT;
    };
    const getWX = (col: number) => (col / (GRID_SIZE - 1) - 0.5) * totalSize;
    const getWZ = (row: number) => (row / (GRID_SIZE - 1) - 0.5) * totalSize;
    const getRGB = (row: number, col: number): [number, number, number] => {
      const seg = segMap.get(`${col},${row}`);
      const ev = effectiveValues ? (effectiveValues.get(`${col},${row}`) ?? 0) : (seg?.value ?? 0);
      const c = new THREE.Color(getBarColor(ev, maxValue, col, isDark));
      return [c.r, c.g, c.b];
    };

    const positions: number[] = [];
    const colors: number[] = [];

    const addQuad = (r0: number, c0: number, r1: number, c1: number) => {
      const h0 = getH(r0, c0), h1 = getH(r1, c1);
      if (h0 <= 0 && h1 <= 0) return;
      const x0 = getWX(c0), z0 = getWZ(r0);
      const x1 = getWX(c1), z1 = getWZ(r1);
      const col0 = getRGB(r0, c0), col1 = getRGB(r1, c1);
      positions.push(x0, h0, z0,  x1, h1, z1,  x0, 0, z0);
      colors.push(...col0, ...col1, ...col0);
      positions.push(x1, h1, z1,  x1, 0,  z1,  x0, 0, z0);
      colors.push(...col1, ...col1, ...col0);
    };

    const N = GRID_SIZE - 1;
    for (let r = 0; r < N; r++) addQuad(r, 0,  r + 1, 0);           // left
    for (let r = 0; r < N; r++) addQuad(r, N,  r + 1, N);           // right
    for (let c = 0; c < N; c++) addQuad(0, c,  0,     c + 1);       // front
    for (let c = 0; c < N; c++) addQuad(N, c,  N,     c + 1);       // back

    if (positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(colors),    3));
    geo.computeVertexNormals();
    return geo;
  }, [segments, maxValue, isDark, segMap, effectiveValues]);

  const faceGeoRef = useRef<THREE.BufferGeometry>(null!);
  const [showFace, setShowFace] = useState(false);

  const getSegFromPoint = (point: THREE.Vector3) => {
    const xi = Math.max(0, Math.min(24, Math.round(point.x / (BAR_SIZE + GAP) + GRID_SIZE / 2)));
    const zi = Math.max(0, Math.min(24, Math.round(point.z / (BAR_SIZE + GAP) + GRID_SIZE / 2)));
    return segMap.get(`${xi},${zi}`) || null;
  };

  const updateFaceHighlight = (faceIndex: number) => {
    if (!faceGeoRef.current) return;
    const pos = geometry.attributes.position;
    const wSeg = GRID_SIZE - 1;
    const qi = Math.floor(faceIndex / 2);
    const row = Math.floor(qi / wSeg);
    const col = qi % wSeg;
    const v0i = row * (wSeg + 1) + col;
    const v1i = row * (wSeg + 1) + col + 1;
    const v2i = (row + 1) * (wSeg + 1) + col;
    const v3i = (row + 1) * (wSeg + 1) + col + 1;
    const lift = 0.08;
    const v0 = new THREE.Vector3().fromBufferAttribute(pos, v0i); v0.z += lift;
    const v1 = new THREE.Vector3().fromBufferAttribute(pos, v1i); v1.z += lift;
    const v2 = new THREE.Vector3().fromBufferAttribute(pos, v2i); v2.z += lift;
    const v3 = new THREE.Vector3().fromBufferAttribute(pos, v3i); v3.z += lift;
    const arr = new Float32Array([
      v0.x, v0.y, v0.z,  v1.x, v1.y, v1.z,  v2.x, v2.y, v2.z,
      v1.x, v1.y, v1.z,  v3.x, v3.y, v3.z,  v2.x, v2.y, v2.z,
    ]);
    faceGeoRef.current.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    faceGeoRef.current.computeVertexNormals();
  };

  return (
    <group>
      <mesh
        geometry={geometry}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
        onPointerMove={(e) => {
          e.stopPropagation();
          const seg = getSegFromPoint(e.point);
          onHover(seg);
          if (e.faceIndex != null) {
            updateFaceHighlight(e.faceIndex);
            setShowFace(true);
          }
        }}
        onPointerOut={() => {
          setShowFace(false);
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          const seg = getSegFromPoint(e.point);
          if (seg) onSelectSegment(seg);
        }}
      >
        <meshStandardMaterial
          vertexColors
          roughness={isDark ? 0.3 : 0.5}
          metalness={isDark ? 0.3 : 0.05}
        />
      </mesh>

      {/* Edge walls */}
      {wallGeometry && (
        <mesh geometry={wallGeometry}>
          <meshStandardMaterial
            vertexColors
            roughness={isDark ? 0.3 : 0.5}
            metalness={isDark ? 0.3 : 0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Hover face highlight — uses actual terrain quad geometry */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} visible={showFace} renderOrder={1}>
        <bufferGeometry ref={faceGeoRef} />
        <meshBasicMaterial
          color="white"
          transparent
          opacity={isDark ? 0.55 : 0.7}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

function FloatingLabel({ data, maxValue, isDark = true, displayValue, peopleValue }: { data: GridSegment; maxValue: number; isDark?: boolean; displayValue?: number; peopleValue?: number }) {
  const xPos = (data.xIndex - GRID_SIZE / 2) * (BAR_SIZE + GAP);
  const zPos = (data.zIndex - GRID_SIZE / 2) * (BAR_SIZE + GAP);
  const effectiveVal = displayValue ?? data.value;
  const barHeight = Math.max((effectiveVal / maxValue) * MAX_HEIGHT, 0.1);
  const yPos = barHeight + 6;

  const domainLabel = X_LABELS[data.xIndex] || data.xLabel;
  const incomeLabel = Z_LABELS[data.zIndex] || data.zLabel;

  return (
    <Html position={[xPos, yPos, zPos]} center style={{ pointerEvents: 'none' }}>
      <div className={`backdrop-blur-md p-2 rounded-lg shadow-2xl min-w-[147px] transform transition-all duration-200 ${isDark ? 'bg-black/60 border border-primary/50' : 'bg-gray-900/85 border border-gray-600'}`}>
        <div className="space-y-0.5 font-mono text-gray-300" style={{ fontSize: '11px' }}>
          <div className="flex justify-between gap-4"><span className="text-white font-bold">Domain:</span><span>{domainLabel}</span></div>
          <div className="flex justify-between gap-4"><span className="text-white font-bold">Income/Edu:</span><span>{incomeLabel}</span></div>
          <div className="flex justify-between gap-4"><span className="text-white font-bold">People:</span><span>{(peopleValue ?? effectiveVal).toLocaleString()}</span></div>
          <div className="flex justify-between gap-4"><span className="text-white font-bold">Segment:</span><span>[{data.xIndex},{data.zIndex}]</span></div>
        </div>
      </div>
    </Html>
  );
}

function CameraTracker({ onCameraChange }: { onCameraChange?: (x: number, y: number, z: number) => void }) {
  const lastRef = useRef({ x: 0, y: 0, z: 0 });
  useFrame(({ camera }) => {
    const x = Math.round(camera.position.x * 10) / 10;
    const y = Math.round(camera.position.y * 10) / 10;
    const z = Math.round(camera.position.z * 10) / 10;
    if (x !== lastRef.current.x || y !== lastRef.current.y || z !== lastRef.current.z) {
      lastRef.current = { x, y, z };
      onCameraChange?.(x, y, z);
    }
  });
  return null;
}

export function Landscape3D({ onSelectSegment, isDark = true, surfMode = false, effectiveValues, onCameraChange, rawLayerValues }: { onSelectSegment: (s: GridSegment) => void; isDark?: boolean; surfMode?: boolean; effectiveValues?: Map<string, number>; onCameraChange?: (x: number, y: number, z: number) => void; rawLayerValues?: Map<string, number>; }) {
  const { data: segments, isLoading, error } = useSegments();
  const [hoveredSegment, setHoveredSegment] = useState<GridSegment | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownSegmentRef = useRef<number | null>(null);
  const isLockedRef = useRef(false);
  const [isLocked, setIsLocked] = useState(false);
  const [hoverCountdown, setHoverCountdown] = useState<number | null>(null);

  // Only show the full-screen loader on first load (no data yet).
  // On subsequent refetches keepPreviousData keeps segments defined, so the
  // Canvas stays mounted and the WebGL context is never destroyed.
  if (isLoading && !segments) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm animate-in fade-in">
        <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground font-mono animate-pulse">Initializing minedICE Terrain...</p>
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

  const maxValue = effectiveValues
    ? Math.max(...Array.from(effectiveValues.values()), 1)
    : Math.max(...segments.map(s => s.value), 1);

  return (
    <div className="w-full h-full relative group">
      <Canvas 
        shadows 
        camera={{ position: [-25, 30, 25], fov: 45 }}
        className={isDark ? "canvas-container" : "canvas-container-light"}
      >
        <color attach="background" args={[isDark ? '#050505' : '#f5f5f5']} />
        <fog attach="fog" args={[isDark ? '#050505' : '#f5f5f5', 30, 120]} />
        
        {/* Lights */}
        <ambientLight intensity={isDark ? 0.5 : 0.4} />
        <directionalLight 
          position={[10, 20, 10]} 
          intensity={isDark ? 1 : 2} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
        />
        {isDark && <pointLight position={[-10, 10, -10]} color="#f0f" intensity={0.5} />}
        {isDark && <pointLight position={[10, 10, 10]} color="#0ff" intensity={0.5} />}

        {/* Environment */}
        {isDark && <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />}
        
        {/* Helper Grid on floor — hidden in surf mode to prevent z-fighting */}
        {!surfMode && <gridHelper args={[GRID_SIZE * 1.5, GRID_SIZE, isDark ? 0x333333 : 0xcccccc, isDark ? 0x111111 : 0xe0e0e0]} position={[0, -0.1, 0]} />}

        {/* The Data Landscape */}
        <group>
          {surfMode ? (
            <SurfaceTerrain
              segments={segments}
              maxValue={maxValue}
              isDark={isDark}
              onHover={(s) => {
                setHoveredSegment(s);
                if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
                if (s) {
                  if (!isLockedRef.current) {
                    onSelectSegment(s);
                    setHoverCountdown(null);
                  } else {
                    if (countdownSegmentRef.current === s.id) return; // already counting for this segment
                    countdownSegmentRef.current = s.id;
                    setHoverCountdown(3);
                    let remaining = 3;
                    countdownIntervalRef.current = setInterval(() => {
                      remaining -= 1;
                      if (remaining <= 0) {
                        clearInterval(countdownIntervalRef.current!);
                        countdownIntervalRef.current = null;
                        countdownSegmentRef.current = null;
                        isLockedRef.current = false;
                        setIsLocked(false);
                        setHoverCountdown(null);
                        onSelectSegment(s);
                      } else {
                        setHoverCountdown(remaining);
                      }
                    }, 1000);
                  }
                } else {
                  setHoverCountdown(null);
                }
              }}
              onSelectSegment={onSelectSegment}
              effectiveValues={effectiveValues}
            />
          ) : (
            segments.map((seg) => (
              <Bar
                key={seg.id}
                data={seg}
                maxValue={maxValue}
                onHover={(s) => {
                  setHoveredSegment(s);
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
                  if (s) {
                    if (!isLockedRef.current) {
                      onSelectSegment(s);
                      setHoverCountdown(null);
                    } else {
                      if (countdownSegmentRef.current === s.id) return; // already counting for this segment
                      countdownSegmentRef.current = s.id;
                      setHoverCountdown(3);
                      let remaining = 3;
                      countdownIntervalRef.current = setInterval(() => {
                        remaining -= 1;
                        if (remaining <= 0) {
                          clearInterval(countdownIntervalRef.current!);
                          countdownIntervalRef.current = null;
                          countdownSegmentRef.current = null;
                          isLockedRef.current = false;
                          setIsLocked(false);
                          setHoverCountdown(null);
                          onSelectSegment(s);
                        } else {
                          setHoverCountdown(remaining);
                        }
                      }, 1000);
                    }
                  } else {
                    setHoverCountdown(null);
                  }
                }}
                onSelect={(s) => {
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
                  countdownSegmentRef.current = null;
                  isLockedRef.current = true;
                  setIsLocked(true);
                  setHoverCountdown(null);
                  onSelectSegment(s);
                }}
                isSelected={hoveredSegment?.id === seg.id}
                isDark={isDark}
                overrideValue={effectiveValues?.get(`${seg.xIndex},${seg.zIndex}`)}
              />
            ))
          )}
          <AxisLabels isDark={isDark} />
        </group>

        {/* Hover Label */}
        {hoveredSegment && (
          <FloatingLabel
            data={hoveredSegment}
            maxValue={maxValue}
            isDark={isDark}
            displayValue={effectiveValues?.get(`${hoveredSegment.xIndex},${hoveredSegment.zIndex}`)}
            peopleValue={rawLayerValues?.get(`${hoveredSegment.xIndex},${hoveredSegment.zIndex}`)}
          />
        )}

        <OrbitControls 
          enableDamping 
          dampingFactor={0.05} 
          minPolarAngle={0} 
          maxPolarAngle={Math.PI / 2 - 0.1} // Prevent going below ground
          maxDistance={60}
          minDistance={10}
          target={[0, 0, 0]}
        />
        <CameraTracker onCameraChange={onCameraChange} />
      </Canvas>
      
      {/* Overlay UI hints */}
      <div className={`absolute bottom-1 left-4 right-4 pointer-events-none transition-opacity flex items-center justify-between ${isLocked ? 'opacity-100' : 'opacity-40'}`}>
        <div className={`flex gap-2 text-xs font-mono px-3 py-1 rounded-full ${isDark ? 'text-white bg-black/40 border border-white/10' : 'text-black font-bold bg-gray-200 border border-gray-300'}`}>
          <span>LMB: Rotate</span>
          <span>•</span>
          <span>RMB: Pan</span>
          <span>•</span>
          <span>Scroll: Zoom</span>
        </div>
        <div className={`flex gap-3 text-xs font-mono px-3 py-1 rounded-full ${isLocked ? (isDark ? 'bg-black/60 border border-red-800' : 'bg-gray-200 border border-red-400') : (isDark ? 'bg-black/40 border border-white/10' : 'bg-gray-200 border border-gray-300')}`}>
          <span className={isDark ? 'text-white' : 'text-black font-bold'}>Hover — live</span>
          <span className={isDark ? 'text-white' : 'text-black font-bold'}>•</span>
          <span className={isDark ? 'text-white' : 'text-black font-bold'}>Click on area to scroll below</span>
          <span className={isDark ? 'text-white' : 'text-black font-bold'}>•</span>
          <span className={isLocked ? 'text-red-500 font-bold' : (isDark ? 'text-white' : 'text-black font-bold')}>
            {isLocked && hoverCountdown !== null ? `Hover ${hoverCountdown}s — unlock` : 'Hover 3s — unlock'}
          </span>
        </div>
      </div>
    </div>
  );
}
