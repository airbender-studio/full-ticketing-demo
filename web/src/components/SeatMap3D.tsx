import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Seat } from "../api/client";
import { useTheme } from "@mui/material";

export type SeatLayout = "grid" | "theater" | "oval";

type Props = {
  seats: Seat[];
  selected: string[];
  onToggle: (id: string) => void;
  rows: number;
  cols: number;
  layout?: SeatLayout;
};

function seatPosition(
  layout: SeatLayout,
  row: number,
  col: number,
  rows: number,
  cols: number
) {
  const rowT = rows <= 1 ? 0 : row / (rows - 1);
  const colT = cols <= 1 ? 0.5 : col / (cols - 1);

  if (layout === "grid") {
    const offsetX = (cols - 1) / 2;
    const offsetZ = (rows - 1) / 2;
    return {
      x: (col - offsetX) * 1.05,
      y: 0.08,
      z: (row - offsetZ) * 1.05 + 1.2,
      rotY: 0,
    };
  }

  if (layout === "theater") {
    // Classic proscenium: gentle fan facing a flat stage
    const sweep = Math.PI * 0.55; // ~100°
    const angle = -sweep / 2 + colT * sweep;
    const radius = 5.5 + rowT * (4.8 + cols * 0.04);
    return {
      x: Math.sin(angle) * radius,
      y: rowT * 0.95,
      z: Math.cos(angle) * radius * 0.92 + 0.5,
      rotY: angle,
    };
  }

  // Oval / arena bowl — wider horseshoe
  const sweep = Math.PI * (0.95 + rowT * 0.35);
  const angle = -sweep / 2 + colT * sweep;
  const radius = 5 + rowT * (7 + cols * 0.06);
  return {
    x: Math.sin(angle) * radius,
    y: rowT * 1.45,
    z: Math.cos(angle) * radius * 0.78 + 1.2,
    rotY: angle,
  };
}

/** Box with per-face brightness so sides read as hard edges, not a blob. */
function makeSeatGeometry(w: number, h: number, d: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  // BoxGeometry groups: 0 +x, 1 -x, 2 +y (top), 3 -y, 4 +z, 5 -z — 4 verts each in non-indexed… actually indexed
  // Paint via position: top verts brighter, sides darker
  const pos = geo.attributes.position;
  const shades = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let shade = 0.55;
    if (y > h * 0.2) shade = 1.15; // top — brightest face
    else if (y < -h * 0.2) shade = 0.22; // bottom
    else if (Math.abs(z) > Math.abs(x)) shade = z > 0 ? 0.78 : 0.4; // front/back
    else shade = x > 0 ? 0.58 : 0.48; // left/right
    shades[i * 3] = shade;
    shades[i * 3 + 1] = shade;
    shades[i * 3 + 2] = shade;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(shades, 3));
  return geo;
}

function SeatInstances({
  seats,
  selected,
  onToggle,
  rows,
  cols,
  layout,
  primary,
  secondary,
}: {
  seats: Seat[];
  selected: string[];
  onToggle: (id: string) => void;
  rows: number;
  cols: number;
  layout: SeatLayout;
  primary: string;
  secondary: string;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  // Leave visible gaps so neighbors don't melt into one mass
  const seatSize = layout === "grid" ? 0.78 : 0.42;
  const seatH = layout === "grid" ? 0.32 : 0.3;

  const bodyGeo = useMemo(() => makeSeatGeometry(seatSize, seatH, seatSize), [seatSize, seatH]);

  useEffect(() => {
    if (!mesh.current) return;
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    seats.forEach((seat, i) => {
      const { x, y, z, rotY } = seatPosition(layout, seat.row, seat.col, rows, cols);
      const lifted = selectedSet.has(seat.id);
      dummy.position.set(x, y + (lifted ? 0.22 : 0), z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(1, lifted ? 1.5 : 1, 1);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);

      if (selectedSet.has(seat.id)) c.set(secondary);
      else if (seat.status === "SOLD") c.set("#B0BACC");
      else if (seat.status === "HELD") c.set("#F5A524");
      else c.set(primary);
      c.offsetHSL(0, 0.04, 0.1);
      mesh.current!.setColorAt(i, c);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [seats, selectedSet, primary, secondary, rows, cols, layout]);

  return (
    <instancedMesh
      ref={mesh}
      args={[bodyGeo, undefined, seats.length]}
      castShadow
      onClick={(e) => {
        e.stopPropagation();
        const id = e.instanceId;
        if (id == null) return;
        const seat = seats[id];
        if (seat && seat.status !== "SOLD") onToggle(seat.id);
      }}
    >
      <meshStandardMaterial
        vertexColors
        roughness={0.35}
        metalness={0.05}
        flatShading
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </instancedMesh>
  );
}

/** Front face of row 0 (toward stage) for grid layout — keep stage apron clear of this. */
function gridRow0FrontZ(rows: number) {
  const offsetZ = (rows - 1) / 2;
  const row0Center = (0 - offsetZ) * 1.05 + 1.2;
  const seatHalfDepth = 0.39; // grid seatSize 0.78 / 2
  return row0Center - seatHalfDepth;
}

function Stage({
  layout,
  primary,
  secondary,
  rows,
}: {
  layout: SeatLayout;
  primary: string;
  secondary: string;
  rows: number;
}) {
  if (layout === "grid") {
    // Flat blue platform only — no sides, no crossbar, clear of row 1.
    const GAP = 1.35;
    const DECK_W = 7.2;
    const DECK_D = 2.2;
    const DECK_H = 0.28;
    const apronFrontZ = gridRow0FrontZ(rows) - GAP;
    const deckCenterZ = apronFrontZ - DECK_D / 2;

    return (
      <group>
        <mesh castShadow receiveShadow position={[0, DECK_H / 2, deckCenterZ]}>
          <boxGeometry args={[DECK_W, DECK_H, DECK_D]} />
          <meshStandardMaterial
            color={primary}
            emissive={secondary}
            emissiveIntensity={0.2}
            roughness={0.45}
          />
        </mesh>
        <Text
          position={[0, DECK_H + 0.35, deckCenterZ]}
          fontSize={0.36}
          color="#ffffff"
          anchorX="center"
          letterSpacing={0.12}
        >
          STAGE
        </Text>
      </group>
    );
  }

  if (layout === "theater") {
    return (
      <group position={[0, 0.05, -0.3]}>
        <mesh castShadow receiveShadow position={[0, 0.16, 0]}>
          <boxGeometry args={[10, 0.26, 2.4]} />
          <meshStandardMaterial
            color={primary}
            emissive={secondary}
            emissiveIntensity={0.18}
            roughness={0.42}
          />
        </mesh>
        <mesh position={[0, 0.18, 1.15]} scale={[1.55, 1, 0.42]} castShadow>
          <cylinderGeometry args={[3.4, 3.5, 0.2, 48]} />
          <meshStandardMaterial
            color={primary}
            emissive={secondary}
            emissiveIntensity={0.2}
            roughness={0.4}
          />
        </mesh>
        <Text position={[0, 0.7, 0.15]} fontSize={0.36} color="#fff" anchorX="center">
          STAGE
        </Text>
      </group>
    );
  }

  // Oval arena thrust — blue platform, pulled toward center so bowl seats clear it
  return (
    <group position={[0, 0.05, 0.2]}>
      <mesh castShadow position={[0, 0.22, 0]} scale={[1, 1, 0.85]}>
        <cylinderGeometry args={[2.1, 2.25, 0.3, 48]} />
        <meshStandardMaterial
          color={primary}
          emissive={secondary}
          emissiveIntensity={0.24}
          roughness={0.4}
          metalness={0.12}
        />
      </mesh>
      <Text position={[0, 0.78, 0]} fontSize={0.36} color="#fff" anchorX="center">
        STAGE
      </Text>
    </group>
  );
}

function Floor({ layout, dark }: { layout: SeatLayout; dark: boolean }) {
  // Studio house floor is charcoal; other layouts stay readable under seats
  if (layout === "grid") {
    const fill = dark ? "#1a1f2a" : "#2a303c";
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 1]} receiveShadow>
        <planeGeometry args={[18, 16]} />
        <meshStandardMaterial color={fill} roughness={0.95} />
      </mesh>
    );
  }
  const fill = dark ? "#243247" : "#D5E6F7";
  if (layout === "theater") {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 5]} receiveShadow>
        <circleGeometry args={[16, 64]} />
        <meshStandardMaterial color={fill} />
      </mesh>
    );
  }
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 4]} receiveShadow>
        <circleGeometry args={[18, 64]} />
        <meshStandardMaterial color={fill} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 4]}>
        <ringGeometry args={[14, 18, 64]} />
        <meshStandardMaterial color={dark ? "#334155" : "#b9d4ef"} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

export function layoutForSlug(slug: string): SeatLayout {
  if (slug === "arena-1000") return "oval";
  if (slug === "hall-500") return "theater";
  return "grid";
}

declare global {
  interface Window {
    /** Arena showcase: yaw far right + strong tilt → pause → reverse (no zoom). */
    __demoCameraTour?: (opts?: { durationMs?: number }) => Promise<void>;
    /** Brief left then right peek with light tilt (other venues). */
    __demoCameraPeek?: (opts?: { durationMs?: number }) => Promise<void>;
  }
}

export function SeatMap3D({
  seats,
  selected,
  onToggle,
  rows,
  cols,
  layout = "grid",
}: Props) {
  const theme = useTheme();
  const camDist =
    layout === "grid"
      ? Math.max(12, Math.max(rows, cols) * 0.85)
      : Math.max(16, 12 + rows * 0.4 + cols * 0.1);

  return (
    <div className="seat-canvas" data-testid="seat-canvas">
      <Canvas
        camera={{
          position:
            layout === "grid"
              ? [0, camDist * 0.75, camDist * 0.9]
              : [0, camDist * 0.5, camDist * 0.75],
          fov: 40,
        }}
        shadows
        dpr={[1, 1.75]}
      >
        <color attach="background" args={[theme.palette.mode === "dark" ? "#0B1220" : "#E8F1FB"]} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[10, 18, 8]} intensity={1.45} castShadow />
        <directionalLight position={[-8, 10, -6]} intensity={0.55} />
        <directionalLight position={[0, 6, 12]} intensity={0.4} />

        <Floor layout={layout} dark={theme.palette.mode === "dark"} />
        <Stage
          layout={layout}
          primary={theme.palette.primary.main}
          secondary={theme.palette.secondary.main}
          rows={rows}
        />

        <SeatInstances
          seats={seats}
          selected={selected}
          onToggle={onToggle}
          rows={rows}
          cols={cols}
          layout={layout}
          primary={theme.palette.primary.main}
          secondary={theme.palette.secondary.main}
        />

        <HouseControls layout={layout} />
      </Canvas>
    </div>
  );
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Slow demo spin on curved houses; keep camera in front of the stage, never upside down. */
function HouseControls({ layout }: { layout: SeatLayout }) {
  const ref = useRef<OrbitControlsImpl>(null);
  const stadium = layout === "theater" || layout === "oval";
  const [spin, setSpin] = useState(stadium);
  const minAz = stadium ? -Math.PI * 0.42 : -Math.PI * 0.55;
  const maxAz = stadium ? Math.PI * 0.42 : Math.PI * 0.55;
  const minPol = Math.PI * 0.18;
  const maxPol = Math.PI * 0.48;
  const minDist = layout === "grid" ? 9 : 14;
  const maxDist = layout === "grid" ? 28 : 38;

  // Resume gentle spin a few seconds after the user stops dragging
  useEffect(() => {
    if (!stadium) return;
    const ctrl = ref.current;
    if (!ctrl) return;

    let resumeTimer: number | undefined;
    const pause = () => {
      setSpin(false);
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => setSpin(true), 2800);
    };
    ctrl.addEventListener("start", pause);
    return () => {
      ctrl.removeEventListener("start", pause);
      window.clearTimeout(resumeTimer);
    };
  }, [stadium]);

  /**
   * Arena showcase: far RIGHT + strong tilt + zoom 3× (same timing) → pause → reverse home.
   * Brief peek: left then right once with light tilt (other venues, no zoom).
   */
  useEffect(() => {
    let cancel = false;
    let raf = 0;

    type Step = { az: number; pol: number; dist: number; holdMs?: number; moveMs: number };

    const runSphericalTour = (
      resolve: () => void,
      plan: Step[],
      startAz: number,
      startPol: number,
      startDist: number,
      startTarget: THREE.Vector3,
      ctrl: OrbitControlsImpl,
    ) => {
      const offset = new THREE.Vector3();
      const spherical = new THREE.Spherical();
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const apply = (az: number, pol: number, dist: number) => {
        spherical.set(dist, pol, az);
        offset.setFromSpherical(spherical);
        ctrl.object.position.copy(startTarget).add(offset);
        ctrl.target.copy(startTarget);
        ctrl.update();
      };

      type Seg =
        | {
            kind: "move";
            fromAz: number;
            fromPol: number;
            fromDist: number;
            toAz: number;
            toPol: number;
            toDist: number;
            ms: number;
          }
        | { kind: "hold"; az: number; pol: number; dist: number; ms: number };

      const segs: Seg[] = [];
      let curAz = startAz;
      let curPol = startPol;
      let curDist = startDist;
      for (const step of plan) {
        segs.push({
          kind: "move",
          fromAz: curAz,
          fromPol: curPol,
          fromDist: curDist,
          toAz: step.az,
          toPol: step.pol,
          toDist: step.dist,
          ms: step.moveMs,
        });
        if (step.holdMs && step.holdMs > 0) {
          segs.push({
            kind: "hold",
            az: step.az,
            pol: step.pol,
            dist: step.dist,
            ms: step.holdMs,
          });
        }
        curAz = step.az;
        curPol = step.pol;
        curDist = step.dist;
      }
      // Smooth home — same duration as last outbound move (no snap)
      segs.push({
        kind: "move",
        fromAz: curAz,
        fromPol: curPol,
        fromDist: curDist,
        toAz: startAz,
        toPol: startPol,
        toDist: startDist,
        ms: plan[plan.length - 1]?.moveMs ?? 1200,
      });

      const t0 = performance.now();
      let segStart = 0;
      let segIdx = 0;

      const finish = () => {
        // Already at start pose from last lerp — don't hard-copy (that causes a jump)
        apply(startAz, startPol, startDist);
        ctrl.enableDamping = true;
        ctrl.update();
        if (stadium) setSpin(true);
        resolve();
      };

      const frame = (now: number) => {
        if (cancel) {
          resolve();
          return;
        }
        if (segIdx >= segs.length) {
          finish();
          return;
        }
        const seg = segs[segIdx];
        const local = now - t0 - segStart;
        if (seg.kind === "hold") {
          apply(seg.az, seg.pol, seg.dist);
          if (local >= seg.ms) {
            segStart += seg.ms;
            segIdx += 1;
          }
        } else {
          const p = easeInOut(Math.min(1, local / Math.max(1, seg.ms)));
          apply(
            lerp(seg.fromAz, seg.toAz, p),
            lerp(seg.fromPol, seg.toPol, p),
            lerp(seg.fromDist, seg.toDist, p),
          );
          if (local >= seg.ms) {
            segStart += seg.ms;
            segIdx += 1;
          }
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    };

    const begin = (buildPlan: (s: {
      startAz: number;
      startPol: number;
      startDist: number;
    }) => Step[]) =>
      new Promise<void>((resolve) => {
        const ctrl = ref.current;
        if (!ctrl) {
          resolve();
          return;
        }
        setSpin(false);
        ctrl.autoRotate = false;
        ctrl.enableDamping = false;
        const startTarget = ctrl.target.clone();
        const startAz = ctrl.getAzimuthalAngle();
        const startPol = ctrl.getPolarAngle();
        const startDist = ctrl.getDistance();
        runSphericalTour(
          resolve,
          buildPlan({ startAz, startPol, startDist }),
          startAz,
          startPol,
          startDist,
          startTarget,
          ctrl,
        );
      });

    window.__demoCameraTour = (opts) => {
      const moveMs = Math.max(3500, Math.floor((opts?.durationMs ?? 8000) * 0.45));
      return begin(({ startAz, startPol, startDist }) => [
        {
          az: maxAz,
          pol: Math.min(1.45, startPol + 1.1),
          // 3× zoom in = one-third distance, same timing as tilt
          dist: Math.max(minDist * 0.85, startDist / 3),
          holdMs: 1000,
          moveMs,
        },
      ]);
    };

    window.__demoCameraPeek = (opts) => {
      const moveMs = Math.max(900, Math.floor((opts?.durationMs ?? 3200) / 4));
      return begin(({ startAz, startPol, startDist }) => {
        const tilt = Math.min(1.35, startPol + 0.55);
        return [
          { az: minAz, pol: tilt, dist: startDist, holdMs: 280, moveMs },
          { az: maxAz, pol: tilt, dist: startDist, holdMs: 280, moveMs },
        ];
      });
    };

    return () => {
      cancel = true;
      cancelAnimationFrame(raf);
      delete window.__demoCameraTour;
      delete window.__demoCameraPeek;
    };
  }, [layout, minAz, maxAz, minPol, maxPol, minDist, maxDist, stadium]);

  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.06}
      // Keep zoom calm during the demo spin — no runaway dolly
      enableZoom
      zoomSpeed={0.45}
      target={layout === "grid" ? [0, 0.2, 1.2] : [0, 0.7, 3.2]}
      // Stay above the floor — no flip under the house
      minPolarAngle={minPol}
      maxPolarAngle={maxPol}
      // Stay in the house / don’t swing behind the stage
      minAzimuthAngle={minAz}
      maxAzimuthAngle={maxAz}
      minDistance={minDist}
      maxDistance={maxDist}
      autoRotate={spin}
      autoRotateSpeed={layout === "oval" ? 0.55 : layout === "theater" ? 0.4 : 0}
    />
  );
}
