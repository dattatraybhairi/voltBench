import React, { useState, useRef } from 'react';
import {
  CircuitComponent,
  ComponentType,
  WireSegment,
  CircuitSolution,
  getComponentTerminals,
  formatEngineeringUnit,
} from '../engine/circuitSolver';

export type CanvasTool = 'select' | 'wire' | 'delete' | 'place';

export interface PendingPlacement {
  type: ComponentType;
  labelPrefix: string;
  defaultVal: number;
  rotation: 0 | 90 | 180 | 270;
}

interface SchematicCanvasProps {
  components: CircuitComponent[];
  wires: WireSegment[];
  solution: CircuitSolution;
  selectedId: string | null;
  activeTool: CanvasTool;
  pendingPlacement: PendingPlacement | null;
  showCurrentParticles: boolean;
  showVoltageLabels: boolean;
  simTime: number;
  onSelectComponent: (id: string | null) => void;
  onToggleSwitch: (id: string) => void;
  onMoveComponent: (id: string, newX: number, newY: number) => void;
  onPlaceComponentAt: (x: number, y: number) => void;
  onRotatePlacement: () => void;
  onCancelTool: () => void;
  onAddWire: (x1: number, y1: number, x2: number, y2: number) => void;
  onDeleteItem: (id: string, kind: 'component' | 'wire') => void;
}

const GRID_STEP = 32;
const GRID_COLS = 28;
const GRID_ROWS = 15;

export const SchematicCanvas: React.FC<SchematicCanvasProps> = ({
  components,
  wires,
  solution,
  selectedId,
  activeTool,
  pendingPlacement,
  showCurrentParticles,
  showVoltageLabels,
  simTime,
  onSelectComponent,
  onToggleSwitch,
  onMoveComponent,
  onPlaceComponentAt,
  onRotatePlacement,
  onCancelTool,
  onAddWire,
  onDeleteItem,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverGrid, setHoverGrid] = useState<{ x: number; y: number } | null>(null);
  const [wireStart, setWireStart] = useState<{ x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredCompId, setHoveredCompId] = useState<string | null>(null);

  const clientToGrid = (clientX: number, clientY: number): { x: number; y: number } => {
    if (!svgRef.current) return { x: 14, y: 8 };
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = (GRID_COLS * GRID_STEP) / rect.width;
    const scaleY = (GRID_ROWS * GRID_STEP) / rect.height;
    const rawX = ((clientX - rect.left) * scaleX) / GRID_STEP;
    const rawY = ((clientY - rect.top) * scaleY) / GRID_STEP;
    return {
      x: Math.max(1, Math.min(GRID_COLS - 1, Math.round(rawX))),
      y: Math.max(1, Math.min(GRID_ROWS - 1, Math.round(rawY))),
    };
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const pt = clientToGrid(e.clientX, e.clientY);
    setHoverGrid(pt);
    if (draggingId && activeTool === 'select' && !wireStart) {
      onMoveComponent(draggingId, pt.x, pt.y);
    }
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 2) {
      // Right-click cancels active wire or placement
      setWireStart(null);
      onCancelTool();
      return;
    }

    const pt = clientToGrid(e.clientX, e.clientY);

    if (activeTool === 'place' && pendingPlacement) {
      onPlaceComponentAt(pt.x, pt.y);
      return;
    }

    if (activeTool === 'wire' || wireStart) {
      if (!wireStart) {
        setWireStart(pt);
      } else {
        if (wireStart.x !== pt.x || wireStart.y !== pt.y) {
          onAddWire(wireStart.x, wireStart.y, pt.x, pt.y);
        }
        setWireStart(null);
      }
      return;
    }

    if (e.target === svgRef.current) {
      onSelectComponent(null);
    }
  };

  const handleSvgMouseUp = () => {
    if (draggingId) {
      setDraggingId(null);
    }
  };

  const handleTerminalClick = (e: React.MouseEvent, gx: number, gy: number) => {
    e.stopPropagation();
    if (activeTool === 'place' && pendingPlacement) {
      onPlaceComponentAt(gx, gy);
      return;
    }
    if (!wireStart) {
      setWireStart({ x: gx, y: gy });
    } else {
      if (wireStart.x !== gx || wireStart.y !== gy) {
        onAddWire(wireStart.x, wireStart.y, gx, gy);
      }
      setWireStart(null);
    }
  };

  const renderComponentSymbol = (comp: CircuitComponent, isGhost = false) => {
    const res = isGhost ? undefined : solution.componentResults.get(comp.id);
    const isSelected = !isGhost && selectedId === comp.id;
    const status = res?.status ?? 'nominal';

    const strokeColor = isGhost
      ? '#06B6D4'
      : status === 'fault'
      ? '#F43F5E'
      : status === 'warning'
      ? '#F59E0B'
      : isSelected
      ? '#06B6D4'
      : '#E2E8F0';

    let valText = '';
    if (comp.type === 'resistor') valText = formatEngineeringUnit(comp.value, 'Ω', 1);
    else if (comp.type === 'potentiometer') {
      const ratio = Math.round((comp.wiperPosition ?? 0.5) * 100);
      valText = `${formatEngineeringUnit(comp.value, 'Ω', 0)} (${ratio}%)`;
    } else if (comp.type === 'capacitor') valText = formatEngineeringUnit(comp.value, 'F', 1);
    else if (comp.type === 'inductor') valText = formatEngineeringUnit(comp.value, 'H', 1);
    else if (comp.type === 'dc_source') valText = `${comp.value.toFixed(1)}V`;
    else if (comp.type === 'ac_source') valText = `${comp.value.toFixed(1)}V ${comp.frequency ?? 50}Hz`;
    else if (comp.type === 'zener') valText = `Vz=${comp.zenerVoltage ?? 5.1}V`;
    else if (comp.type === 'led') valText = `Vf=${comp.forwardVoltage ?? 2.0}V`;
    else if (comp.type === 'diode') valText = '1N4007';
    else if (comp.type === 'npn_bjt') valText = `β=${comp.bjtBeta ?? 100}`;
    else if (comp.type === 'nmos') valText = `Vth=${comp.mosfetVth ?? 2.0}V`;
    else if (comp.type === 'opamp') valText = 'LM741';
    else if (comp.type === 'voltmeter') valText = res ? `${res.vDrop.toFixed(2)}V` : 'DMM V';
    else if (comp.type === 'ammeter') valText = res ? `${(res.current * 1000).toFixed(1)}mA` : 'DMM A';
    else if (comp.type === 'switch') valText = comp.switchClosed ? 'CLOSED' : 'OPEN';

    // Single-terminal symbols
    if (comp.type === 'ground') {
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={0} y1={0} x2={0} y2={14} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-14} y1={14} x2={14} y2={14} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-9} y1={20} x2={9} y2={20} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-4} y1={26} x2={4} y2={26} stroke={strokeColor} strokeWidth={2.2} />
        </g>
      );
    }

    if (comp.type === 'probe_ch1' || comp.type === 'probe_ch2') {
      const isCh1 = comp.type === 'probe_ch1';
      const badgeColor = isCh1 ? '#06B6D4' : '#F59E0B';
      const vRead = res ? `${res.vNode1.toFixed(2)}V` : '0.00V';
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={0} y1={0} x2={0} y2={-18} stroke={badgeColor} strokeWidth={2} />
          <rect
            x={-34}
            y={-42}
            width={68}
            height={24}
            rx={4}
            fill="#0B0E17"
            stroke={badgeColor}
            strokeWidth={1.5}
          />
          <text
            x={0}
            y={-31}
            textAnchor="middle"
            className="text-[9px] font-mono font-bold"
            fill={badgeColor}
          >
            {isCh1 ? 'CH1' : 'CH2'}
          </text>
          <text
            x={0}
            y={-22}
            textAnchor="middle"
            className="text-[9px] font-mono"
            fill="#F8FAFC"
          >
            {vRead}
          </text>
        </g>
      );
    }

    // 3-Terminal NPN BJT Symbol: Base at (-64, 0), Collector at (+32, -64), Emitter at (+32, +64)
    if (comp.type === 'npn_bjt') {
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <circle cx={4} cy={0} r={26} fill="#0B0E17" stroke={strokeColor} strokeWidth={1.8} />
          {/* Base lead & vertical bar */}
          <line x1={-64} y1={0} x2={-8} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-8} y1={-16} x2={-8} y2={16} stroke={strokeColor} strokeWidth={3} />
          {/* Collector path to (32, -64) */}
          <line x1={-8} y1={-8} x2={16} y2={-22} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={16} y1={-22} x2={32} y2={-22} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={32} y1={-22} x2={32} y2={-64} stroke={strokeColor} strokeWidth={2.2} />
          {/* Emitter path with outward arrow to (32, +64) */}
          <line x1={-8} y1={8} x2={16} y2={22} stroke={strokeColor} strokeWidth={2.2} />
          <polygon points="16,22 6,21 11,13" fill="#06B6D4" />
          <line x1={16} y1={22} x2={32} y2={22} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={32} y1={22} x2={32} y2={64} stroke={strokeColor} strokeWidth={2.2} />
          <g transform={`rotate(${-comp.rotation})`}>
            <text x={-26} y={-28} className="text-[10px] font-mono font-semibold fill-slate-200">
              {comp.label}
            </text>
            <text x={-26} y={38} className="text-[10px] font-mono fill-cyan-400">
              {valText}
            </text>
          </g>
        </g>
      );
    }

    // 3-Terminal N-Channel MOSFET Symbol: Gate at (-64, 0), Drain at (+32, -64), Source at (+32, +64)
    if (comp.type === 'nmos') {
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <circle cx={4} cy={0} r={26} fill="#0B0E17" stroke={strokeColor} strokeWidth={1.8} />
          {/* Gate lead & insulated plate */}
          <line x1={-64} y1={0} x2={-12} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-12} y1={-14} x2={-12} y2={14} stroke={strokeColor} strokeWidth={2.5} />
          {/* Channel bar */}
          <line x1={-5} y1={-16} x2={-5} y2={16} stroke="#06B6D4" strokeWidth={2.5} />
          {/* Drain path to (32, -64) */}
          <line x1={-5} y1={-12} x2={32} y2={-12} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={32} y1={-12} x2={32} y2={-64} stroke={strokeColor} strokeWidth={2.2} />
          {/* Source path to (32, +64) */}
          <line x1={-5} y1={12} x2={32} y2={12} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={32} y1={12} x2={32} y2={64} stroke={strokeColor} strokeWidth={2.2} />
          <g transform={`rotate(${-comp.rotation})`}>
            <text x={-26} y={-28} className="text-[10px] font-mono font-semibold fill-slate-200">
              {comp.label}
            </text>
            <text x={-26} y={38} className="text-[10px] font-mono fill-cyan-400">
              {valText}
            </text>
          </g>
        </g>
      );
    }

    // 3-Terminal Op-Amp Symbol: IN+ at (-64, -32), IN- at (-64, +32), OUT at (+64, 0)
    if (comp.type === 'opamp') {
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={-32} x2={-28} y2={-32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-64} y1={32} x2={-28} y2={32} stroke={strokeColor} strokeWidth={2.2} />
          <polygon
            points="-28,-44 -28,44 36,0"
            fill="#0B0E17"
            stroke={strokeColor}
            strokeWidth={2.2}
          />
          <text x={-18} y={-28} className="text-[12px] font-mono font-bold fill-cyan-400">+</text>
          <text x={-18} y={36} className="text-[12px] font-mono font-bold fill-amber-400">-</text>
          <line x1={36} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          <text x={0} y={-48} textAnchor="middle" className="text-[10px] font-mono font-semibold fill-slate-200">
            {comp.label}
          </text>
        </g>
      );
    }

    return (
      <g opacity={isGhost ? 0.65 : 1}>
        {(isSelected || status !== 'nominal') && !isGhost && (
          <rect
            x={-48}
            y={-24}
            width={96}
            height={48}
            rx={8}
            fill={
              status === 'fault'
                ? 'rgba(244, 63, 94, 0.12)'
                : status === 'warning'
                ? 'rgba(245, 158, 11, 0.10)'
                : 'rgba(6, 182, 212, 0.10)'
            }
            stroke={strokeColor}
            strokeDasharray={isSelected ? 'none' : '3 3'}
            strokeWidth={1}
          />
        )}

        {comp.type === 'resistor' && (
          <>
            <line x1={-64} y1={0} x2={-30} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.2}
              strokeLinejoin="round"
              points="-30,0 -25,-10 -15,10 -5,-10 5,10 15,-10 25,10 30,0"
            />
            <line x1={30} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        {comp.type === 'potentiometer' && (
          <>
            <line x1={-64} y1={0} x2={-30} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.2}
              strokeLinejoin="round"
              points="-30,0 -25,-10 -15,10 -5,-10 5,10 15,-10 25,10 30,0"
            />
            <line x1={30} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={-12} y1={16} x2={12} y2={-16} stroke="#06B6D4" strokeWidth={2} />
            <polygon points="14,-18 6,-15 11,-9" fill="#06B6D4" />
          </>
        )}

        {comp.type === 'capacitor' && (
          <>
            <line x1={-64} y1={0} x2={-6} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={-6} y1={-16} x2={-6} y2={16} stroke={strokeColor} strokeWidth={2.8} />
            <line x1={6} y1={-16} x2={6} y2={16} stroke={strokeColor} strokeWidth={2.8} />
            <line x1={6} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        {comp.type === 'inductor' && (
          <>
            <line x1={-64} y1={0} x2={-32} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <path
              d="M -32 0 A 8 10 0 0 1 -16 0 A 8 10 0 0 1 0 0 A 8 10 0 0 1 16 0 A 8 10 0 0 1 32 0"
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.2}
            />
            <line x1={32} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        {comp.type === 'diode' && (
          <>
            <line x1={-64} y1={0} x2={-14} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <polygon
              points="-14,-13 -14,13 14,0"
              fill="#1E293B"
              stroke={strokeColor}
              strokeWidth={2.2}
            />
            <line x1={14} y1={-13} x2={14} y2={13} stroke={strokeColor} strokeWidth={2.8} />
            <line x1={14} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        {comp.type === 'zener' && (
          <>
            <line x1={-64} y1={0} x2={-14} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <polygon
              points="-14,-13 -14,13 14,0"
              fill="#1E293B"
              stroke={strokeColor}
              strokeWidth={2.2}
            />
            <polyline
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.5}
              points="8,-15 14,-13 14,13 20,15"
            />
            <line x1={14} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        {comp.type === 'led' && (() => {
          const iMa = (res?.current ?? 0) * 1000;
          const intensity = Math.max(0, Math.min(1, iMa / 20));
          const ledHex =
            comp.ledColor === 'red'
              ? '#F43F5E'
              : comp.ledColor === 'amber'
              ? '#F59E0B'
              : comp.ledColor === 'cyan'
              ? '#06B6D4'
              : '#10B981';
          return (
            <>
              {intensity > 0.03 && (
                <circle
                  cx={0}
                  cy={0}
                  r={18 + intensity * 14}
                  fill={ledHex}
                  opacity={0.18 + intensity * 0.35}
                />
              )}
              <line x1={-64} y1={0} x2={-14} y2={0} stroke={strokeColor} strokeWidth={2.2} />
              <polygon
                points="-14,-13 -14,13 14,0"
                fill={intensity > 0.03 ? ledHex : '#1E293B'}
                stroke={strokeColor}
                strokeWidth={2.2}
              />
              <line x1={14} y1={-13} x2={14} y2={13} stroke={strokeColor} strokeWidth={2.8} />
              <line x1={14} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
              <line x1={-2} y1={-15} x2={8} y2={-25} stroke={ledHex} strokeWidth={1.6} />
              <line x1={8} y1={-12} x2={18} y2={-22} stroke={ledHex} strokeWidth={1.6} />
            </>
          );
        })()}

        {comp.type === 'switch' && (
          <g
            className="cursor-pointer"
            onClick={(e) => {
              if (isGhost) return;
              e.stopPropagation();
              onToggleSwitch(comp.id);
            }}
          >
            <line x1={-64} y1={0} x2={-20} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <circle cx={-20} cy={0} r={3.5} fill="#0B0E17" stroke={strokeColor} strokeWidth={2} />
            <line
              x1={-17}
              y1={0}
              x2={18}
              y2={comp.switchClosed ? 0 : -16}
              stroke="#06B6D4"
              strokeWidth={2.6}
            />
            <circle cx={20} cy={0} r={3.5} fill="#0B0E17" stroke={strokeColor} strokeWidth={2} />
            <line x1={20} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </g>
        )}

        {comp.type === 'voltmeter' && (
          <>
            <line x1={-64} y1={0} x2={-20} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <circle cx={0} cy={0} r={20} fill="#0B0E17" stroke="#06B6D4" strokeWidth={2.2} />
            <text x={0} y={4} textAnchor="middle" fill="#06B6D4" className="text-[12px] font-mono font-bold">
              V
            </text>
            <line x1={20} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        {comp.type === 'ammeter' && (
          <>
            <line x1={-64} y1={0} x2={-20} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <circle cx={0} cy={0} r={20} fill="#0B0E17" stroke="#F59E0B" strokeWidth={2.2} />
            <text x={0} y={4} textAnchor="middle" fill="#F59E0B" className="text-[12px] font-mono font-bold">
              A
            </text>
            <line x1={20} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        {comp.type === 'dc_source' && (
          <>
            <line x1={-64} y1={0} x2={-20} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <circle cx={0} cy={0} r={20} fill="#0B0E17" stroke={strokeColor} strokeWidth={2.2} />
            <text x={-9} y={4} textAnchor="middle" fill="#06B6D4" className="text-[13px] font-mono font-bold">
              +
            </text>
            <text x={9} y={4} textAnchor="middle" fill="#94A3B8" className="text-[13px] font-mono font-bold">
              -
            </text>
            <line x1={20} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        {comp.type === 'ac_source' && (
          <>
            <line x1={-64} y1={0} x2={-20} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <circle cx={0} cy={0} r={20} fill="#0B0E17" stroke={strokeColor} strokeWidth={2.2} />
            <path
              d="M -10 0 Q -5 -10 0 0 T 10 0"
              fill="none"
              stroke="#06B6D4"
              strokeWidth={2}
            />
            <line x1={20} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        <g transform={`rotate(${-comp.rotation})`}>
          <text
            x={0}
            y={comp.rotation === 90 || comp.rotation === 270 ? -28 : -22}
            textAnchor="middle"
            className="text-[11px] font-mono font-semibold fill-slate-200 select-none"
          >
            {comp.label}
          </text>
          <text
            x={0}
            y={comp.rotation === 90 || comp.rotation === 270 ? 34 : 30}
            textAnchor="middle"
            className="text-[10px] font-mono fill-cyan-400 select-none"
          >
            {valText}
          </text>
        </g>
      </g>
    );
  };

  const hoveredComp = components.find((c) => c.id === hoveredCompId);
  const hoveredRes = hoveredComp ? solution.componentResults.get(hoveredComp.id) : null;

  // Build Ghost Component if user is currently placing a part from the Parts Bin
  const ghostComp: CircuitComponent | null =
    activeTool === 'place' && pendingPlacement && hoverGrid
      ? {
          id: 'ghost_preview',
          type: pendingPlacement.type,
          label: `NEW ${pendingPlacement.labelPrefix}`,
          x: hoverGrid.x,
          y: hoverGrid.y,
          rotation: pendingPlacement.rotation,
          value: pendingPlacement.defaultVal,
          switchClosed: true,
        }
      : null;

  return (
    <div
      className="relative w-full flex-1 min-h-[380px] h-full bg-[#07090E] border border-slate-800 rounded-xl overflow-hidden select-none flex flex-col"
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${GRID_COLS * GRID_STEP} ${GRID_ROWS * GRID_STEP}`}
        preserveAspectRatio="xMidYMid meet"
        className={`w-full flex-1 h-full block ${
          activeTool === 'wire' || activeTool === 'place' || wireStart
            ? 'cursor-crosshair'
            : 'cursor-default'
        }`}
        onMouseMove={handleSvgMouseMove}
        onMouseDown={handleSvgMouseDown}
        onMouseUp={handleSvgMouseUp}
      >
        <defs>
          <pattern
            id="voltbench-grid"
            width={GRID_STEP}
            height={GRID_STEP}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={0} cy={0} r={1.2} fill="#1E293B" />
          </pattern>
        </defs>

        <rect
          x={0}
          y={0}
          width={GRID_COLS * GRID_STEP}
          height={GRID_ROWS * GRID_STEP}
          fill="url(#voltbench-grid)"
        />

        {/* Wire Segments + Animated Current Particles */}
        {wires.map((w) => {
          const x1 = w.x1 * GRID_STEP;
          const y1 = w.y1 * GRID_STEP;
          const x2 = w.x2 * GRID_STEP;
          const y2 = w.y2 * GRID_STEP;
          const current = solution.wireCurrents.get(w.id) ?? 0;
          const vNode = solution.nodeVoltages.get(`${w.x1},${w.y1}`) ?? 0;

          const wireColor =
            vNode > 0.2 ? '#38BDF8' : vNode < -0.2 ? '#F59E0B' : '#64748B';

          const length = Math.hypot(x2 - x1, y2 - y1);
          const numDots = Math.max(1, Math.floor(length / 28));
          const speed = Math.min(3.5, Math.max(0.2, Math.abs(current) * 80));
          const dir = current >= 0 ? 1 : -1;

          return (
            <g
              key={w.id}
              onClick={(e) => {
                e.stopPropagation();
                if (activeTool === 'delete') {
                  onDeleteItem(w.id, 'wire');
                }
              }}
              className={activeTool === 'delete' ? 'cursor-pointer hover:opacity-50' : ''}
            >
              {/* Invisible wider hit target for easier wire deletion/clicking */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth={12}
              />
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={wireColor}
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              {showCurrentParticles &&
                Math.abs(current) > 1e-5 &&
                Array.from({ length: numDots }).map((_, idx) => {
                  const rawOffset = (idx / numDots + simTime * speed * dir) % 1;
                  const t = rawOffset < 0 ? rawOffset + 1 : rawOffset;
                  const px = x1 + (x2 - x1) * t;
                  const py = y1 + (y2 - y1) * t;
                  return <circle key={idx} cx={px} cy={py} r={2.8} fill="#FACC15" />;
                })}
            </g>
          );
        })}

        {/* Active Orthogonal L-Shape Wire Preview */}
        {wireStart && hoverGrid && (
          <g className="pointer-events-none">
            <polyline
              fill="none"
              stroke="#06B6D4"
              strokeWidth={2.2}
              strokeDasharray="5 4"
              points={`${wireStart.x * GRID_STEP},${wireStart.y * GRID_STEP} ${
                hoverGrid.x * GRID_STEP
              },${wireStart.y * GRID_STEP} ${hoverGrid.x * GRID_STEP},${
                hoverGrid.y * GRID_STEP
              }`}
            />
            <circle
              cx={wireStart.x * GRID_STEP}
              cy={wireStart.y * GRID_STEP}
              r={5}
              fill="#06B6D4"
            />
            <circle
              cx={hoverGrid.x * GRID_STEP}
              cy={hoverGrid.y * GRID_STEP}
              r={5}
              fill="none"
              stroke="#06B6D4"
              strokeWidth={2}
            />
          </g>
        )}

        {/* Placed Circuit Components */}
        {components.map((comp) => {
          const cx = comp.x * GRID_STEP;
          const cy = comp.y * GRID_STEP;
          const terms = getComponentTerminals(comp);

          return (
            <g key={comp.id}>
              <g
                transform={`translate(${cx}, ${cy}) rotate(${comp.rotation})`}
                onMouseEnter={() => setHoveredCompId(comp.id)}
                onMouseLeave={() => setHoveredCompId(null)}
                onMouseDown={(e) => {
                  if (e.button === 2) return;
                  e.stopPropagation();
                  if (activeTool === 'delete') {
                    onDeleteItem(comp.id, 'component');
                  } else if (activeTool === 'place' && pendingPlacement) {
                    onPlaceComponentAt(comp.x, comp.y);
                  } else if (activeTool === 'select') {
                    onSelectComponent(comp.id);
                    setDraggingId(comp.id);
                  }
                }}
                className="cursor-pointer"
              >
                {renderComponentSymbol(comp, false)}
              </g>

              {/* Terminal Connection Nodes (Click any terminal at any time to start/finish wiring!) */}
              {terms.map((t, idx) => {
                const tx = t.x * GRID_STEP;
                const ty = t.y * GRID_STEP;
                const vTerm = solution.nodeVoltages.get(`${t.x},${t.y}`) ?? 0;
                const isWireOrigin =
                  wireStart && wireStart.x === t.x && wireStart.y === t.y;
                return (
                  <g key={`${comp.id}-term-${idx}`}>
                    <circle
                      cx={tx}
                      cy={ty}
                      r={isWireOrigin ? 6.5 : 4.8}
                      fill={isWireOrigin ? '#06B6D4' : '#0B0E17'}
                      stroke="#06B6D4"
                      strokeWidth={2}
                      className="cursor-crosshair hover:scale-125 transition-transform"
                      onClick={(e) => handleTerminalClick(e, t.x, t.y)}
                    />
                    {terms.length === 3 && (
                      <text
                        x={tx - 10}
                        y={ty + 3}
                        className="text-[8px] font-mono fill-slate-400 pointer-events-none"
                      >
                        {t.name}
                      </text>
                    )}
                    {showVoltageLabels && idx === 0 && (
                      <text
                        x={tx + 6}
                        y={ty - 6}
                        className="text-[9px] font-mono fill-slate-400 pointer-events-none"
                      >
                        {vTerm.toFixed(2)}V
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Ghost Component Preview When Stamping New Parts */}
        {ghostComp && (
          <g className="pointer-events-none">
            <g
              transform={`translate(${ghostComp.x * GRID_STEP}, ${
                ghostComp.y * GRID_STEP
              }) rotate(${ghostComp.rotation})`}
            >
              {renderComponentSymbol(ghostComp, true)}
            </g>
            {getComponentTerminals(ghostComp).map((t, idx) => (
              <circle
                key={`ghost-term-${idx}`}
                cx={t.x * GRID_STEP}
                cy={t.y * GRID_STEP}
                r={5.5}
                fill="none"
                stroke="#06B6D4"
                strokeWidth={2}
                strokeDasharray="2 2"
              />
            ))}
          </g>
        )}

        {/* Hover Grid Cursor Indicator */}
        {hoverGrid && !ghostComp && (
          <circle
            cx={hoverGrid.x * GRID_STEP}
            cy={hoverGrid.y * GRID_STEP}
            r={3.5}
            fill="none"
            stroke="#06B6D4"
            strokeWidth={1.2}
            className="pointer-events-none"
          />
        )}
      </svg>

      {/* Top-Left Coordinate & Interactive Guidance HUD */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-3 px-3 py-1.5 bg-[#111827]/95 border border-slate-800 rounded-lg text-xs font-mono text-slate-300">
        <span>
          GRID: ({hoverGrid?.x ?? 0}, {hoverGrid?.y ?? 0})
        </span>
        <span aria-hidden="true" className="text-slate-600">·</span>
        <span>
          NODE V:{' '}
          <strong className="text-cyan-400 tabular-nums">
            {hoverGrid && solution.nodeVoltages.has(`${hoverGrid.x},${hoverGrid.y}`)
              ? `${(solution.nodeVoltages.get(`${hoverGrid.x},${hoverGrid.y}`) ?? 0).toFixed(2)} V`
              : '—'}
          </strong>
        </span>

        {activeTool === 'place' && pendingPlacement && (
          <>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-cyan-300 font-semibold">
              Placing {pendingPlacement.labelPrefix} ({pendingPlacement.rotation}°) — Click grid to stamp
            </span>
            <button
              onClick={onRotatePlacement}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded border border-slate-700 cursor-pointer"
            >
              Rotate (R)
            </button>
            <button
              onClick={onCancelTool}
              className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded border border-rose-500/40 cursor-pointer"
            >
              Done (Esc)
            </button>
          </>
        )}

        {wireStart && (
          <>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="text-amber-400">
              Routing wire from ({wireStart.x},{wireStart.y}) — Click destination terminal or Esc to cancel
            </span>
            <button
              onClick={() => setWireStart(null)}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 cursor-pointer"
            >
              Cancel Wire
            </button>
          </>
        )}
      </div>

      {/* Bottom-Left Quick Creation Tips */}
      <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-[#111827]/85 border border-slate-800/90 rounded-lg text-[11px] font-mono text-slate-400 pointer-events-none hidden sm:flex items-center gap-2">
        <span>Tip: Click any blue pin circle to draw a wire</span>
        <span>·</span>
        <span>Drag parts to move</span>
        <span>·</span>
        <span>Press R to rotate</span>
      </div>

      {/* Live Component Hover Diagnostic Card */}
      {hoveredComp && hoveredRes && (
        <div className="absolute bottom-3 right-3 bg-[#111827]/95 border border-slate-700 rounded-lg p-3 shadow-lg pointer-events-none min-w-[235px]">
          <div className="flex items-center justify-between text-xs font-mono border-b border-slate-800 pb-1.5 mb-2">
            <span className="font-bold text-slate-100">{hoveredComp.label}</span>
            <span
              className={
                hoveredRes.status === 'fault'
                  ? 'text-rose-400 font-semibold'
                  : hoveredRes.status === 'warning'
                  ? 'text-amber-400 font-semibold'
                  : 'text-emerald-400'
              }
            >
              {hoveredRes.status === 'fault'
                ? '✖ OVER-SPEC'
                : hoveredRes.status === 'warning'
                ? '▲ WARNING'
                : '● NOMINAL'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
            <div>
              <div className="text-slate-400">ΔV / V_CE</div>
              <div className="text-slate-100 font-semibold">{hoveredRes.vDrop.toFixed(2)} V</div>
            </div>
            <div>
              <div className="text-slate-400">CURRENT</div>
              <div className="text-cyan-400 font-semibold">
                {(hoveredRes.current * 1000).toFixed(2)} mA
              </div>
            </div>
            <div>
              <div className="text-slate-400">POWER</div>
              <div className="text-amber-400 font-semibold">
                {(hoveredRes.power * 1000).toFixed(1)} mW
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-1.5 font-mono">
            {hoveredRes.statusMessage}
          </div>
        </div>
      )}
    </div>
  );
};
