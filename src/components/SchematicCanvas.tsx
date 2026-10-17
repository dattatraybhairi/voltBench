import React, { useState, useRef, useMemo } from 'react';
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
  theme?: 'dark' | 'light';
  onSelectComponent: (id: string | null) => void;
  onToggleSwitch: (id: string) => void;
  onMoveComponent: (id: string, newX: number, newY: number) => void;
  onPlaceComponentAt: (x: number, y: number) => void;
  onRotatePlacement: () => void;
  onCancelTool: () => void;
  onAddWire: (x1: number, y1: number, x2: number, y2: number) => void;
  onDeleteItem: (id: string, kind: 'component' | 'wire') => void;
  onModuleAction?: (
    compId: string,
    action:
      | 'toggle_boot_btn'
      | 'reset_mcu'
      | 'toggle_radar_sweep'
      | 'toggle_motor_stall'
      | 'toggle_relay'
      | 'step_sensor'
  ) => void;
}

const GRID_STEP = 32;
const GRID_COLS = 28;
const GRID_ROWS = 15;

interface PinEndpoint {
  compId: string;
  compLabel: string;
  name: string;
  x: number;
  y: number;
}

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
  theme = 'dark',
  onSelectComponent,
  onToggleSwitch,
  onMoveComponent,
  onPlaceComponentAt,
  onRotatePlacement,
  onCancelTool,
  onAddWire,
  onDeleteItem,
  onModuleAction,
}) => {
  const isLight = theme === 'light';
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverGrid, setHoverGrid] = useState<{ x: number; y: number } | null>(null);
  const [snappedPin, setSnappedPin] = useState<PinEndpoint | null>(null);
  const [wireStart, setWireStart] = useState<{ x: number; y: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoveredCompId, setHoveredCompId] = useState<string | null>(null);

  // Precompute all component terminal pin locations for magnetic snapping & connection status
  const allPins = useMemo<PinEndpoint[]>(() => {
    const list: PinEndpoint[] = [];
    for (const c of components) {
      const terms = getComponentTerminals(c);
      for (const t of terms) {
        list.push({
          compId: c.id,
          compLabel: c.label,
          name: t.name,
          x: t.x,
          y: t.y,
        });
      }
    }
    return list;
  }, [components]);

  // Determine which grid coordinates have an active electrical connection (wire or >=2 pins)
  const connectedCoords = useMemo<Set<string>>(() => {
    const counts = new Map<string, number>();
    for (const p of allPins) {
      const k = `${p.x},${p.y}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const w of wires) {
      const steps = Math.max(Math.abs(w.x2 - w.x1), Math.abs(w.y2 - w.y1));
      for (let s = 0; s <= steps; s++) {
        const gx = Math.round(w.x1 + ((w.x2 - w.x1) * s) / Math.max(1, steps));
        const gy = Math.round(w.y1 + ((w.y2 - w.y1) * s) / Math.max(1, steps));
        const k = `${gx},${gy}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    const connected = new Set<string>();
    for (const [k, c] of counts.entries()) {
      if (c >= 2) connected.add(k);
    }
    return connected;
  }, [allPins, wires]);

  /**
   * Uses the SVG's exact screen CTM inverse matrix so letterboxing/scaling never shifts coordinates,
   * and magnetically snaps to the nearest component terminal pin when within 0.85 grid units.
   */
  const clientToGrid = (
    clientX: number,
    clientY: number,
    enablePinSnap = true
  ): { x: number; y: number; pin: PinEndpoint | null } => {
    if (!svgRef.current) return { x: 14, y: 8, pin: null };

    let rawX = 14;
    let rawY = 8;

    const ctm = svgRef.current.getScreenCTM();
    if (ctm) {
      const pt = svgRef.current.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const svgP = pt.matrixTransform(ctm.inverse());
      rawX = svgP.x / GRID_STEP;
      rawY = svgP.y / GRID_STEP;
    } else {
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = (GRID_COLS * GRID_STEP) / rect.width;
      const scaleY = (GRID_ROWS * GRID_STEP) / rect.height;
      rawX = ((clientX - rect.left) * scaleX) / GRID_STEP;
      rawY = ((clientY - rect.top) * scaleY) / GRID_STEP;
    }

    if (enablePinSnap) {
      let bestPin: PinEndpoint | null = null;
      let bestDist = 0.88; // Magnetic snap radius in grid units (~28px)
      for (const p of allPins) {
        const d = Math.hypot(rawX - p.x, rawY - p.y);
        if (d < bestDist) {
          bestDist = d;
          bestPin = p;
        }
      }
      if (bestPin) {
        return { x: bestPin.x, y: bestPin.y, pin: bestPin };
      }
    }

    return {
      x: Math.max(1, Math.min(GRID_COLS - 1, Math.round(rawX))),
      y: Math.max(1, Math.min(GRID_ROWS - 1, Math.round(rawY))),
      pin: null,
    };
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const isWiring = activeTool === 'wire' || wireStart !== null;
    const pt = clientToGrid(e.clientX, e.clientY, isWiring || activeTool === 'select');
    setHoverGrid({ x: pt.x, y: pt.y });
    setSnappedPin(pt.pin);

    if (draggingId && activeTool === 'select' && !wireStart) {
      const movePt = clientToGrid(e.clientX, e.clientY, false);
      onMoveComponent(draggingId, movePt.x, movePt.y);
    }
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 2) {
      setWireStart(null);
      onCancelTool();
      return;
    }

    if (activeTool === 'place' && pendingPlacement) {
      const placePt = clientToGrid(e.clientX, e.clientY, false);
      onPlaceComponentAt(placePt.x, placePt.y);
      return;
    }

    const pt = clientToGrid(e.clientX, e.clientY, true);

    if (activeTool === 'wire' || wireStart || pt.pin) {
      if (!wireStart) {
        setWireStart({ x: pt.x, y: pt.y });
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

  const handleSvgMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingId) {
      setDraggingId(null);
    }
    if (wireStart) {
      const pt = clientToGrid(e.clientX, e.clientY, true);
      // If user clicked and dragged from wireStart to another grid point/pin, finish the wire on release!
      if (wireStart.x !== pt.x || wireStart.y !== pt.y) {
        onAddWire(wireStart.x, wireStart.y, pt.x, pt.y);
        setWireStart(null);
      }
    }
  };

  const handleTerminalMouseDown = (e: React.MouseEvent, gx: number, gy: number) => {
    e.stopPropagation();
    if (e.button === 2) {
      setWireStart(null);
      return;
    }
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

  const handleTerminalMouseUp = (e: React.MouseEvent, gx: number, gy: number) => {
    e.stopPropagation();
    if (wireStart && (wireStart.x !== gx || wireStart.y !== gy)) {
      onAddWire(wireStart.x, wireStart.y, gx, gy);
      setWireStart(null);
    }
  };

  const renderComponentSymbol = (comp: CircuitComponent, isGhost = false) => {
    const res = isGhost ? undefined : solution.componentResults.get(comp.id);
    const isSelected = !isGhost && selectedId === comp.id;
    const status = res?.status ?? 'nominal';

    const defaultInk = isLight ? '#0F172A' : '#E2E8F0';
    const bodyFill = isLight ? '#FFFFFF' : '#0B0E17';

    const strokeColor = isGhost
      ? '#0284C7'
      : status === 'fault'
      ? '#E11D48'
      : status === 'warning'
      ? '#D97706'
      : isSelected
      ? '#06B6D4'
      : defaultInk;

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
    else if (comp.type === 'dc_motor') {
      const rpm = res?.motorRpm ?? 0;
      valText = `${Math.abs(rpm)} RPM`;
    } else if (comp.type === 'voltmeter') valText = res ? `${res.vDrop.toFixed(2)}V` : 'DMM V';
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
            fill={isLight ? '#0F172A' : '#0B0E17'}
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

    // 6-Pin Realistic Microcontroller Boards: Arduino Uno R3, ESP32 DevKit V1, Raspberry Pi Pico RP2040
    if (
      comp.type === 'arduino_uno' ||
      comp.type === 'esp32_devkit' ||
      comp.type === 'rpi_pico'
    ) {
      const isArduino = comp.type === 'arduino_uno';
      const isPico = comp.type === 'rpi_pico';
      const mcu = res?.mcuTelemetry;
      const pcbFill = isArduino ? '#005C69' : isPico ? '#0A5C36' : '#161B26';
      const pcbStroke = isSelected
        ? '#06B6D4'
        : status === 'fault'
        ? '#F43F5E'
        : isArduino
        ? '#00979C'
        : isPico
        ? '#10B981'
        : '#64748B';
      const out1Active = mcu?.out1High ?? false;
      const bootPressed = Boolean(comp.mcuBootButtonPressed);

      const leftLabels = isArduino
        ? ['5V', 'A0', 'GND']
        : isPico
        ? ['3V3', 'ADC26', 'GND']
        : ['3V3', 'ADC34', 'GND'];
      const rightLabels = isArduino
        ? ['D13', 'D9~', 'D2']
        : isPico
        ? ['GP15', 'GP16~', 'GP14']
        : ['IO2', 'IO4~', 'IO15'];
      const pinYs = [-64, 0, 64];

      return (
        <g opacity={isGhost ? 0.65 : 1}>
          {/* Terminal Lead Traces */}
          {pinYs.map((py, i) => (
            <React.Fragment key={i}>
              <line x1={-96} y1={py} x2={-74} y2={py} stroke={strokeColor} strokeWidth={2.5} />
              <line x1={74} y1={py} x2={96} y2={py} stroke={strokeColor} strokeWidth={2.5} />
            </React.Fragment>
          ))}

          {/* Realistic FR4 PCB Substrate */}
          <rect
            x={-74}
            y={-84}
            width={148}
            height={168}
            rx={8}
            fill={pcbFill}
            stroke={pcbStroke}
            strokeWidth={isSelected ? 2.8 : 2}
          />

          {/* Corner M3 Mounting Holes */}
          {[
            [-64, -74],
            [64, -74],
            [-64, 74],
            [64, 74],
          ].map(([hx, hy], idx) => (
            <circle
              key={idx}
              cx={hx}
              cy={hy}
              r={3.5}
              fill="#07090E"
              stroke="#D97706"
              strokeWidth={1.3}
            />
          ))}

          {/* Board-Specific Realistic Hardware Features */}
          {isArduino ? (
            <>
              {/* Silver USB-B Port (Top Left) & Black Barrel Jack (Bottom Left) */}
              <rect
                x={-48}
                y={-91}
                width={30}
                height={18}
                rx={2}
                fill="#CBD5E1"
                stroke="#64748B"
                strokeWidth={1.2}
              />
              <text x={-33} y={-80} textAnchor="middle" fill="#0F172A" className="text-[6.5px] font-mono font-bold">
                USB
              </text>
              <rect
                x={18}
                y={-90}
                width={26}
                height={16}
                rx={2}
                fill="#0F172A"
                stroke="#475569"
                strokeWidth={1.2}
              />
              <text x={31} y={-80} textAnchor="middle" fill="#94A3B8" className="text-[6px] font-mono">
                9V DC
              </text>
              {/* Metallic 16MHz Crystal Can */}
              <rect
                x={-42}
                y={-22}
                width={10}
                height={22}
                rx={4}
                fill="#E2E8F0"
                stroke="#64748B"
                strokeWidth={1}
              />
              {/* Socketed DIP-28 ATmega328P Package */}
              <rect
                x={-26}
                y={-32}
                width={62}
                height={58}
                rx={3}
                fill="#0F172A"
                stroke="#334155"
                strokeWidth={1.5}
              />
              {/* DIP IC legs */}
              {[-24, -14, -4, 6, 16].map((ly, li) => (
                <React.Fragment key={li}>
                  <rect x={-29} y={ly} width={3} height={4} fill="#94A3B8" />
                  <rect x={36} y={ly} width={3} height={4} fill="#94A3B8" />
                </React.Fragment>
              ))}
            </>
          ) : isPico ? (
            <>
              {/* Micro-USB Connector at Top */}
              <rect
                x={-16}
                y={-90}
                width={32}
                height={13}
                rx={2}
                fill="#E2E8F0"
                stroke="#64748B"
                strokeWidth={1.2}
              />
              {/* Gold Castellated Edge Pads along left & right PCB edges */}
              {[-50, -34, -18, 18, 34, 50].map((cy, ci) => (
                <React.Fragment key={ci}>
                  <circle cx={-73} cy={cy} r={2.3} fill="#F59E0B" />
                  <circle cx={73} cy={cy} r={2.3} fill="#F59E0B" />
                </React.Fragment>
              ))}
              {/* Square QFN RP2040 Dual-Core ARM Chip */}
              <rect
                x={-28}
                y={-28}
                width={56}
                height={54}
                rx={3}
                fill="#090D16"
                stroke="#334155"
                strokeWidth={1.5}
              />
            </>
          ) : (
            <>
              {/* ESP32 Gold Meander Wi-Fi/BT 2.4GHz PCB Antenna at Top */}
              <rect
                x={-36}
                y={-82}
                width={72}
                height={18}
                rx={2}
                fill="#0B0E17"
                stroke="#475569"
                strokeWidth={1}
              />
              <polyline
                fill="none"
                stroke="#F59E0B"
                strokeWidth={1.5}
                points="-30,-67 -30,-78 -22,-78 -22,-69 -14,-69 -14,-78 -6,-78 -6,-69 2,-69 2,-78 10,-78 10,-69 18,-69 18,-78 28,-78"
              />
              {/* Metallic Silver ESP-WROOM-32 RF Shield Can */}
              <rect
                x={-36}
                y={-34}
                width={72}
                height={60}
                rx={4}
                fill="#334155"
                stroke="#94A3B8"
                strokeWidth={1.6}
              />
              <rect
                x={-32}
                y={-30}
                width={64}
                height={52}
                rx={2}
                fill="#1E293B"
              />
            </>
          )}

          {/* Chip Silkscreen & Live Register Telemetry */}
          <text
            x={isArduino ? 5 : 0}
            y={-12}
            textAnchor="middle"
            fill="#67E8F9"
            className="text-[8.5px] font-mono font-bold"
          >
            {isArduino ? 'ATmega328P' : isPico ? 'RP2040 ARM' : 'ESP-WROOM-32'}
          </text>
          <text
            x={isArduino ? 5 : 0}
            y={1}
            textAnchor="middle"
            fill="#CBD5E1"
            className="text-[7.5px] font-mono"
          >
            {isArduino ? '5V · 16MHz' : isPico ? '3.3V · 133MHz' : 'WiFi+BT · 240MHz'}
          </text>
          <text
            x={isArduino ? 5 : 0}
            y={14}
            textAnchor="middle"
            fill="#FCD34D"
            className="text-[8px] font-mono font-semibold"
          >
            {mcu ? `ADC:${mcu.adcRawCount} PWM:${mcu.pwmDutyOut}%` : 'READY'}
          </text>

          {/* Board Header Silkscreen */}
          <text
            x={0}
            y={-54}
            textAnchor="middle"
            fill="#F8FAFC"
            className="text-[9.5px] font-mono font-bold"
          >
            {isArduino ? 'ARDUINO UNO R3' : isPico ? 'RPi PICO RP2040' : 'ESP32 DEVKIT V1'}
          </text>

          {/* Onboard SMD LEDs: Power (ON), TX/RX, and User GPIO LED */}
          <circle cx={-34} cy={38} r={3.5} fill="#10B981" />
          <text x={-27} y={41} fill="#CBD5E1" className="text-[7.5px] font-mono">
            ON
          </text>

          {/* Pulsing TX LED when serial telemetry is active */}
          <circle
            cx={-6}
            cy={38}
            r={3.2}
            fill={(Math.floor(simTime * 8) % 2 === 0) ? '#38BDF8' : '#1E293B'}
            stroke="#64748B"
            strokeWidth={0.8}
          />
          <text x={0} y={41} fill="#CBD5E1" className="text-[7.5px] font-mono">
            TX
          </text>

          {out1Active && (
            <circle
              cx={24}
              cy={38}
              r={8.5}
              fill={isArduino ? '#F59E0B' : isPico ? '#10B981' : '#38BDF8'}
              opacity={0.4}
            />
          )}
          <circle
            cx={24}
            cy={38}
            r={3.8}
            fill={
              out1Active
                ? isArduino
                  ? '#F59E0B'
                  : isPico
                  ? '#10B981'
                  : '#38BDF8'
                : '#1E293B'
            }
            stroke="#94A3B8"
            strokeWidth={1}
          />
          <text x={31} y={41} fill="#F8FAFC" className="text-[7.5px] font-mono font-bold">
            {isArduino ? 'L13' : isPico ? 'GP15' : 'IO2'}
          </text>

          {/* INTERACTIVE ON-BOARD TACTILE BUTTONS (BOOT/USR & RESET) */}
          {!isGhost && (
            <>
              {/* Clickable BOOT / USR Button (Toggles digitalRead(2) HIGH/LOW) */}
              <g
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onModuleAction?.(comp.id, 'toggle_boot_btn');
                }}
              >
                <rect
                  x={-48}
                  y={48}
                  width={46}
                  height={16}
                  rx={3}
                  fill={bootPressed ? '#F59E0B' : '#0F172A'}
                  stroke={bootPressed ? '#FDE68A' : '#38BDF8'}
                  strokeWidth={1.3}
                />
                <text
                  x={-25}
                  y={59}
                  textAnchor="middle"
                  fill={bootPressed ? '#0F172A' : '#67E8F9'}
                  className="text-[7.5px] font-mono font-bold"
                >
                  {bootPressed ? '● BTN:HI' : '○ BOOT/D2'}
                </text>
              </g>

              {/* Clickable Hardware RESET Button */}
              <g
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onModuleAction?.(comp.id, 'reset_mcu');
                }}
              >
                <rect
                  x={4}
                  y={48}
                  width={42}
                  height={16}
                  rx={3}
                  fill="#0F172A"
                  stroke="#F43F5E"
                  strokeWidth={1.2}
                />
                <text
                  x={25}
                  y={59}
                  textAnchor="middle"
                  fill="#FDA4AF"
                  className="text-[7.5px] font-mono font-bold"
                >
                  ↺ RESET
                </text>
              </g>
            </>
          )}

          {/* Gold Pin Header Silk Labels */}
          {pinYs.map((py, i) => (
            <React.Fragment key={`lbl-${i}`}>
              <rect x={-74} y={py - 5} width={6} height={10} fill="#F59E0B" />
              <text
                x={-65}
                y={py + 3}
                textAnchor="start"
                fill="#F8FAFC"
                className="text-[8.5px] font-mono font-bold"
              >
                {leftLabels[i]}
              </text>
              <rect x={68} y={py - 5} width={6} height={10} fill="#F59E0B" />
              <text
                x={65}
                y={py + 3}
                textAnchor="end"
                fill="#67E8F9"
                className="text-[8.5px] font-mono font-bold"
              >
                {rightLabels[i]}
              </text>
            </React.Fragment>
          ))}

          <text
            x={0}
            y={76}
            textAnchor="middle"
            fill="#6EE7B7"
            className="text-[8px] font-mono font-semibold"
          >
            {comp.mcuProgram === 'custom_code'
              ? '● LIVE FIRMWARE'
              : `PWM ${mcu?.pwmDutyOut ?? comp.mcuPwmDuty ?? 50}%`}
          </text>
        </g>
      );
    }

    // HC-SR04 Ultrasonic Sonar Distance Sensor Module (Realistic Blue PCB + Dual Mesh Cylinders + Radar Action)
    if (comp.type === 'ultrasonic_hcsr04') {
      const dist = res?.sensorValue ?? comp.distanceCm ?? 45;
      const autoSweep = Boolean(comp.radarAutoSweep);
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={-32} x2={-48} y2={-32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-64} y1={32} x2={-48} y2={32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={48} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />

          {/* Blue HC-SR04 PCB */}
          <rect
            x={-48}
            y={-46}
            width={96}
            height={92}
            rx={6}
            fill="#0A2E5C"
            stroke={isSelected ? '#06B6D4' : '#38BDF8'}
            strokeWidth={2}
          />

          {/* Silver Crystal at top center */}
          <rect x={-8} y={-42} width={16} height={7} rx={2} fill="#CBD5E1" />

          {/* Dual Metallic Mesh Transducer Cylinders (T & R) */}
          <circle cx={-18} cy={-8} r={15.5} fill="#CBD5E1" stroke="#64748B" strokeWidth={1.8} />
          <circle cx={-18} cy={-8} r={11} fill="#1E293B" />
          <circle cx={-18} cy={-8} r={5} fill="#475569" />
          <text x={-18} y={-5} textAnchor="middle" fill="#E2E8F0" className="text-[7px] font-mono font-bold">
            T
          </text>

          <circle cx={18} cy={-8} r={15.5} fill="#CBD5E1" stroke="#64748B" strokeWidth={1.8} />
          <circle cx={18} cy={-8} r={11} fill="#1E293B" />
          <circle cx={18} cy={-8} r={5} fill="#475569" />
          <text x={18} y={-5} textAnchor="middle" fill="#E2E8F0" className="text-[7px] font-mono font-bold">
            R
          </text>

          {/* Animated Acoustic Sonar Wave Cone */}
          <path
            d="M -10 -26 Q 0 -34 10 -26"
            fill="none"
            stroke="#38BDF8"
            strokeWidth={1.8}
            opacity={0.5 + 0.5 * Math.sin(simTime * 10)}
          />
          <path
            d="M -18 -32 Q 0 -42 18 -32"
            fill="none"
            stroke="#67E8F9"
            strokeWidth={1.5}
            opacity={0.5 + 0.5 * Math.cos(simTime * 10)}
          />

          <text x={0} y={20} textAnchor="middle" fill="#67E8F9" className="text-[9.5px] font-mono font-bold">
            {dist} cm
          </text>

          {/* Interactive On-Module Action Button: Toggle Auto Radar Sweep */}
          {!isGhost && (
            <g
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onModuleAction?.(comp.id, 'toggle_radar_sweep');
              }}
            >
              <rect
                x={-34}
                y={25}
                width={68}
                height={15}
                rx={3}
                fill={autoSweep ? '#06B6D4' : '#0F172A'}
                stroke="#38BDF8"
                strokeWidth={1}
              />
              <text
                x={0}
                y={35}
                textAnchor="middle"
                fill={autoSweep ? '#0F172A' : '#67E8F9'}
                className="text-[7.5px] font-mono font-bold"
              >
                {autoSweep ? '● SWEEPING' : '⟳ AUTO-SWEEP'}
              </text>
            </g>
          )}

          <text x={-43} y={-28} fill="#CBD5E1" className="text-[7.5px] font-mono">VCC</text>
          <text x={-43} y={36} fill="#94A3B8" className="text-[7.5px] font-mono">GND</text>
          <text x={43} y={3} textAnchor="end" fill="#FCD34D" className="text-[7.5px] font-mono">ECHO</text>
        </g>
      );
    }

    // LDR Photoresistor Light Sensor Module (Realistic CdS Cell + On-Module Step Action)
    if (comp.type === 'ldr_sensor') {
      const lux = comp.lightLux ?? 450;
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={-32} x2={-44} y2={-32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-64} y1={32} x2={-44} y2={32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={44} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />

          <rect
            x={-44}
            y={-44}
            width={88}
            height={88}
            rx={6}
            fill="#172033"
            stroke={isSelected ? '#06B6D4' : '#F59E0B'}
            strokeWidth={2}
          />

          <circle
            cx={0}
            cy={-10}
            r={16}
            fill="#3B1D1E"
            stroke="#F59E0B"
            strokeWidth={2}
          />
          <polyline
            fill="none"
            stroke="#FBBF24"
            strokeWidth={1.8}
            points="-9,-15 9,-15 -9,-10 9,-10 -9,-5 9,-5"
          />

          <text x={0} y={19} textAnchor="middle" fill="#FCD34D" className="text-[9.5px] font-mono font-bold">
            {lux} lux
          </text>

          {!isGhost && (
            <g
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onModuleAction?.(comp.id, 'step_sensor');
              }}
            >
              <rect
                x={-30}
                y={24}
                width={60}
                height={15}
                rx={3}
                fill="#0F172A"
                stroke="#F59E0B"
                strokeWidth={1}
              />
              <text x={0} y={34} textAnchor="middle" fill="#FCD34D" className="text-[7.5px] font-mono font-bold">
                ☀ STEP LUX
              </text>
            </g>
          )}

          <text x={-39} y={-28} fill="#CBD5E1" className="text-[7.5px] font-mono">VCC</text>
          <text x={-39} y={35} fill="#94A3B8" className="text-[7.5px] font-mono">GND</text>
          <text x={39} y={3} textAnchor="end" fill="#67E8F9" className="text-[7.5px] font-mono">AO</text>
        </g>
      );
    }

    // DHT22 Digital Temperature & Humidity Sensor Module
    if (comp.type === 'dht22_sensor') {
      const tempC = comp.tempC ?? 25;
      const hum = comp.humidityPct ?? 48;
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={-32} x2={-44} y2={-32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-64} y1={32} x2={-44} y2={32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={44} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />

          {/* Breakout PCB */}
          <rect
            x={-44}
            y={-44}
            width={88}
            height={88}
            rx={6}
            fill="#0F2937"
            stroke={isSelected ? '#06B6D4' : '#38BDF8'}
            strokeWidth={2}
          />

          {/* Sky-Blue Perforated DHT22 Lattice Housing */}
          <rect
            x={-22}
            y={-36}
            width={44}
            height={34}
            rx={3}
            fill="#0284C7"
            stroke="#BAE6FD"
            strokeWidth={1.3}
          />
          {[-14, -6, 2, 10].map((gx, gi) => (
            <line
              key={gi}
              x1={gx}
              y1={-32}
              x2={gx}
              y2={-8}
              stroke="#082F49"
              strokeWidth={2}
            />
          ))}

          <text x={0} y={13} textAnchor="middle" fill="#67E8F9" className="text-[9px] font-mono font-bold">
            {tempC}°C · {hum}%
          </text>

          {!isGhost && (
            <g
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onModuleAction?.(comp.id, 'step_sensor');
              }}
            >
              <rect
                x={-30}
                y={22}
                width={60}
                height={15}
                rx={3}
                fill="#0F172A"
                stroke="#38BDF8"
                strokeWidth={1}
              />
              <text x={0} y={32} textAnchor="middle" fill="#67E8F9" className="text-[7.5px] font-mono font-bold">
                🌡 STEP ENV
              </text>
            </g>
          )}

          <text x={-39} y={-28} fill="#CBD5E1" className="text-[7.5px] font-mono">VCC</text>
          <text x={-39} y={35} fill="#94A3B8" className="text-[7.5px] font-mono">GND</text>
          <text x={39} y={3} textAnchor="end" fill="#FCD34D" className="text-[7.5px] font-mono">DAT</text>
        </g>
      );
    }

    // SSD1306 128x64 I2C OLED Display Module (Realistic Blue PCB + 4-Pin I2C Header + Dual-Color Pixel Screen)
    if (comp.type === 'ssd1306_oled') {
      const lines = res?.oledDisplayLines ?? [
        'SSD1306 128x64',
        'I2C ADDR: 0x3C',
        'READY',
      ];
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={-32} x2={-54} y2={-32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-64} y1={32} x2={-54} y2={32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={54} y1={32} x2={64} y2={32} stroke={strokeColor} strokeWidth={2.2} />

          {/* Blue OLED Breakout PCB */}
          <rect
            x={-54}
            y={-44}
            width={108}
            height={88}
            rx={6}
            fill="#0A2744"
            stroke={isSelected ? '#06B6D4' : '#38BDF8'}
            strokeWidth={2}
          />

          {/* Top 4-Pin Gold I2C Header Pads */}
          {[-24, -8, 8, 24].map((px, pi) => (
            <circle key={pi} cx={px} cy={-38} r={2.5} fill="#F59E0B" stroke="#0F172A" strokeWidth={0.8} />
          ))}

          {/* OLED Glass Panel & Yellow/Cyan Pixel Matrix */}
          <rect
            x={-48}
            y={-28}
            width={96}
            height={54}
            rx={3}
            fill="#020617"
            stroke="#334155"
            strokeWidth={1.5}
          />
          {/* Yellow top status bar divider */}
          <line x1={-46} y1={-12} x2={46} y2={-12} stroke="#1E293B" strokeWidth={1} />

          <text x={-43} y={-16} fill="#FACC15" className="text-[8.5px] font-mono font-bold">
            {(lines[0] ?? 'SSD1306 OLED').slice(0, 18)}
          </text>
          <text x={-43} y={-1} fill="#38BDF8" className="text-[8.5px] font-mono">
            {(lines[1] ?? '').slice(0, 18)}
          </text>
          <text x={-43} y={11} fill="#34D399" className="text-[8.5px] font-mono">
            {(lines[2] ?? '').slice(0, 18)}
          </text>
          {lines[3] && (
            <text x={-43} y={22} fill="#A7F3D0" className="text-[7.5px] font-mono">
              {lines[3].slice(0, 18)}
            </text>
          )}

          {/* Amber Kapton Ribbon at Bottom */}
          <rect x={-18} y={26} width={36} height={6} fill="#D97706" rx={1} />

          <text x={-48} y={39} fill="#67E8F9" className="text-[7.5px] font-mono">SDA</text>
          <text x={48} y={39} textAnchor="end" fill="#94A3B8" className="text-[7.5px] font-mono">GND</text>
        </g>
      );
    }

    // 5V Opto-Isolated Relay Module (Songle Blue Relay Block + Screw Terminals + Clickable Toggle)
    if (comp.type === 'relay_module') {
      const closed = res?.relayClosed ?? Boolean(comp.switchClosed);
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={-32} x2={-46} y2={-32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-64} y1={32} x2={-46} y2={32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={46} y1={32} x2={64} y2={32} stroke={strokeColor} strokeWidth={2.2} />

          <rect
            x={-46}
            y={-42}
            width={92}
            height={84}
            rx={6}
            fill="#111827"
            stroke={isSelected ? '#06B6D4' : closed ? '#10B981' : '#64748B'}
            strokeWidth={2}
          />

          {/* Blue Songle SRD-05VDC Relay Cube */}
          <rect
            x={-36}
            y={-34}
            width={52}
            height={48}
            rx={3}
            fill="#0284C7"
            stroke="#7DD3FC"
            strokeWidth={1.3}
          />
          <text x={-10} y={-16} textAnchor="middle" fill="#F8FAFC" className="text-[7.5px] font-mono font-bold">
            SONGLE 5V
          </text>
          <text x={-10} y={-5} textAnchor="middle" fill="#E0F2FE" className="text-[7px] font-mono">
            10A 250VAC
          </text>
          <text
            x={-10}
            y={8}
            textAnchor="middle"
            fill={closed ? '#FEF08A' : '#BAE6FD'}
            className="text-[8px] font-mono font-bold"
          >
            {closed ? '● NO CLOSED' : '○ NC OPEN'}
          </text>

          {/* Green 3-Position Screw Terminal Block on Right */}
          <rect
            x={20}
            y={-32}
            width={18}
            height={44}
            rx={2}
            fill="#059669"
            stroke="#34D399"
            strokeWidth={1.2}
          />
          {[-20, -10, 0].map((sy, si) => (
            <circle key={si} cx={29} cy={sy} r={3.5} fill="#CBD5E1" stroke="#334155" strokeWidth={1} />
          ))}

          {/* Trigger Status LED & Clickable Manual Relay Override */}
          <circle cx={-34} cy={28} r={4} fill={closed ? '#F43F5E' : '#334155'} />
          {!isGhost && (
            <g
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onModuleAction?.(comp.id, 'toggle_relay');
              }}
            >
              <rect
                x={-22}
                y={20}
                width={56}
                height={15}
                rx={3}
                fill={closed ? '#10B981' : '#0F172A'}
                stroke="#10B981"
                strokeWidth={1}
              />
              <text
                x={6}
                y={30}
                textAnchor="middle"
                fill={closed ? '#0F172A' : '#6EE7B7'}
                className="text-[7.5px] font-mono font-bold"
              >
                {closed ? 'CLICK: ON' : 'CLICK: OFF'}
              </text>
            </g>
          )}
        </g>
      );
    }

    // Active / Passive Piezo Buzzer Module
    if (comp.type === 'piezo_buzzer') {
      const freqHz = res?.buzzerFreqHz ?? 0;
      const buzzing = freqHz > 0;
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={0} x2={-24} y2={0} stroke={strokeColor} strokeWidth={2.4} />
          <line x1={24} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.4} />

          {buzzing && (
            <>
              <circle
                cx={0}
                cy={0}
                r={28 + ((simTime * 20) % 10)}
                fill="none"
                stroke="#F59E0B"
                strokeWidth={1.8}
                opacity={0.65}
              />
              <circle
                cx={0}
                cy={0}
                r={34 + ((simTime * 20) % 10)}
                fill="none"
                stroke="#38BDF8"
                strokeWidth={1.3}
                opacity={0.45}
              />
            </>
          )}

          <circle
            cx={0}
            cy={0}
            r={24}
            fill="#0F172A"
            stroke={buzzing ? '#F59E0B' : strokeColor}
            strokeWidth={2.4}
          />
          <circle cx={0} cy={0} r={7} fill="#334155" stroke="#94A3B8" strokeWidth={1.5} />
          <text x={-12} y={-8} fill="#F59E0B" className="text-[9px] font-mono font-bold">+</text>

          <g transform={`rotate(${-comp.rotation})`}>
            <text x={0} y={-29} textAnchor="middle" fill={defaultInk} className="text-[9.5px] font-mono font-semibold">
              {comp.label}
            </text>
            <text x={0} y={37} textAnchor="middle" fill={buzzing ? '#F59E0B' : '#94A3B8'} className="text-[9px] font-mono font-bold">
              {buzzing ? `🔊 ${freqHz}Hz` : 'SILENT'}
            </text>
          </g>
        </g>
      );
    }

    // DC Geared Hobby Motor with Spinning Rotor + Clickable Stall Load Action
    if (comp.type === 'dc_motor') {
      const rpm = res?.motorRpm ?? 0;
      const stalled = Boolean(comp.motorStallLoad);
      const rotorAngle = stalled ? 15 : (simTime * (rpm / 60) * 360) % 360;
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={0} x2={-26} y2={0} stroke={strokeColor} strokeWidth={2.4} />
          <line x1={26} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.4} />

          <circle
            cx={0}
            cy={0}
            r={26}
            fill="#0F172A"
            stroke={stalled ? '#F43F5E' : isSelected ? '#06B6D4' : '#F59E0B'}
            strokeWidth={2.4}
          />

          <g transform={`rotate(${rotorAngle})`}>
            <line x1={-17} y1={0} x2={17} y2={0} stroke={stalled ? '#F43F5E' : '#38BDF8'} strokeWidth={3.2} />
            <line x1={0} y1={-17} x2={0} y2={17} stroke={stalled ? '#F43F5E' : '#38BDF8'} strokeWidth={3.2} />
            <circle cx={0} cy={0} r={5.5} fill="#F59E0B" />
          </g>

          <g transform={`rotate(${-comp.rotation})`}>
            <text
              x={0}
              y={-31}
              textAnchor="middle"
              fill={defaultInk}
              className="text-[9.5px] font-mono font-semibold"
            >
              {comp.label} ({Math.abs(rpm)} RPM)
            </text>
            {!isGhost && (
              <g
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onModuleAction?.(comp.id, 'toggle_motor_stall');
                }}
              >
                <rect
                  x={-28}
                  y={30}
                  width={56}
                  height={14}
                  rx={3}
                  fill={stalled ? '#F43F5E' : '#0F172A'}
                  stroke={stalled ? '#FDA4AF' : '#F59E0B'}
                  strokeWidth={1}
                />
                <text
                  x={0}
                  y={40}
                  textAnchor="middle"
                  fill={stalled ? '#FFFFFF' : '#FCD34D'}
                  className="text-[7.5px] font-mono font-bold"
                >
                  {stalled ? '⚠ STALLED' : '⚙ STALL TEST'}
                </text>
              </g>
            )}
          </g>
        </g>
      );
    }

    // SG90 Micro Servo Motor (Realistic Translucent Blue Body + Rotating White Horn + Step Action)
    if (comp.type === 'servo_motor') {
      const deg = res?.servoAngle ?? comp.servoAngleDeg ?? 90;
      const hornRot = deg - 90;
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={-32} x2={-42} y2={-32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-64} y1={32} x2={-42} y2={32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={42} y1={32} x2={64} y2={32} stroke={strokeColor} strokeWidth={2.2} />

          {/* Mounting Tabs */}
          <rect x={-48} y={-10} width={96} height={12} rx={2} fill="#1D4ED8" stroke="#60A5FA" strokeWidth={1} />

          <rect
            x={-42}
            y={-42}
            width={84}
            height={84}
            rx={6}
            fill="#1E3A8A"
            stroke={isSelected ? '#06B6D4' : '#60A5FA'}
            strokeWidth={2}
          />

          <circle cx={0} cy={-6} r={14} fill="#0F172A" stroke="#94A3B8" strokeWidth={1.5} />
          <g transform={`translate(0, -6) rotate(${hornRot})`}>
            <rect
              x={-4}
              y={-28}
              width={8}
              height={32}
              rx={4}
              fill="#F8FAFC"
              stroke="#06B6D4"
              strokeWidth={1.5}
            />
            <circle cx={0} cy={-22} r={2} fill="#0F172A" />
            <circle cx={0} cy={-15} r={1.5} fill="#0F172A" />
          </g>
          <circle cx={0} cy={-6} r={4} fill="#F59E0B" />

          <text x={0} y={20} textAnchor="middle" fill="#67E8F9" className="text-[10px] font-mono font-bold">
            {deg}°
          </text>

          {!isGhost && (
            <g
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onModuleAction?.(comp.id, 'step_sensor');
              }}
            >
              <rect
                x={-30}
                y={24}
                width={60}
                height={14}
                rx={3}
                fill="#0F172A"
                stroke="#60A5FA"
                strokeWidth={1}
              />
              <text x={0} y={34} textAnchor="middle" fill="#93C5FD" className="text-[7.5px] font-mono font-bold">
                ↻ STEP ANGLE
              </text>
            </g>
          )}
        </g>
      );
    }

    // 4-Pin NE555 Precision Timer IC
    if (comp.type === 'ne555_timer') {
      const mcu = res?.mcuTelemetry;
      const outHigh = mcu?.out1High ?? false;
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={-32} x2={-44} y2={-32} stroke={strokeColor} strokeWidth={2.4} />
          <line x1={-64} y1={32} x2={-44} y2={32} stroke={strokeColor} strokeWidth={2.4} />
          <line x1={44} y1={-32} x2={64} y2={-32} stroke={strokeColor} strokeWidth={2.4} />
          <line x1={44} y1={32} x2={64} y2={32} stroke={strokeColor} strokeWidth={2.4} />

          <rect
            x={-44}
            y={-48}
            width={88}
            height={96}
            rx={6}
            fill="#0F172A"
            stroke={isSelected ? '#06B6D4' : strokeColor}
            strokeWidth={2.2}
          />
          <path d="M -10 -48 A 10 10 0 0 0 10 -48" fill="#07090E" stroke={strokeColor} strokeWidth={1.5} />

          <text x={0} y={-12} textAnchor="middle" fill="#FBBF24" className="text-[11px] font-mono font-bold">
            NE555P
          </text>
          <text x={0} y={2} textAnchor="middle" fill="#CBD5E1" className="text-[8.5px] font-mono">
            {comp.mcuBlinkHz ?? 25}Hz · {comp.mcuPwmDuty ?? 50}%
          </text>

          <circle cx={0} cy={18} r={4} fill={outHigh ? '#10B981' : '#334155'} />

          <text x={-38} y={-29} fill="#CBD5E1" className="text-[8.5px] font-mono">VCC</text>
          <text x={-38} y={35} fill="#67E8F9" className="text-[8.5px] font-mono">TRIG</text>
          <text x={38} y={-29} textAnchor="end" fill="#FCD34D" className="text-[8.5px] font-mono">OUT</text>
          <text x={38} y={35} textAnchor="end" fill="#94A3B8" className="text-[8.5px] font-mono">GND</text>

          <text
            x={0}
            y={-55}
            textAnchor="middle"
            fill={defaultInk}
            className="text-[10px] font-mono font-semibold"
          >
            {comp.label}
          </text>
        </g>
      );
    }

    // 3-Terminal NPN BJT Symbol
    if (comp.type === 'npn_bjt') {
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <circle cx={4} cy={0} r={26} fill={bodyFill} stroke={strokeColor} strokeWidth={1.8} />
          <line x1={-64} y1={0} x2={-8} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-8} y1={-16} x2={-8} y2={16} stroke={strokeColor} strokeWidth={3} />
          <line x1={-8} y1={-8} x2={16} y2={-22} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={16} y1={-22} x2={32} y2={-22} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={32} y1={-22} x2={32} y2={-64} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-8} y1={8} x2={16} y2={22} stroke={strokeColor} strokeWidth={2.2} />
          <polygon points="16,22 6,21 11,13" fill="#06B6D4" />
          <line x1={16} y1={22} x2={32} y2={22} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={32} y1={22} x2={32} y2={64} stroke={strokeColor} strokeWidth={2.2} />
          <g transform={`rotate(${-comp.rotation})`}>
            <text x={-26} y={-28} fill={defaultInk} className="text-[10px] font-mono font-semibold">
              {comp.label}
            </text>
            <text x={-26} y={38} fill={isLight ? '#0284C7' : '#22D3EE'} className="text-[10px] font-mono">
              {valText}
            </text>
          </g>
        </g>
      );
    }

    // 3-Terminal N-Channel MOSFET Symbol
    if (comp.type === 'nmos') {
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <circle cx={4} cy={0} r={26} fill={bodyFill} stroke={strokeColor} strokeWidth={1.8} />
          <line x1={-64} y1={0} x2={-12} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-12} y1={-14} x2={-12} y2={14} stroke={strokeColor} strokeWidth={2.5} />
          <line x1={-5} y1={-16} x2={-5} y2={16} stroke="#06B6D4" strokeWidth={2.5} />
          <line x1={-5} y1={-12} x2={32} y2={-12} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={32} y1={-12} x2={32} y2={-64} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-5} y1={12} x2={32} y2={12} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={32} y1={12} x2={32} y2={64} stroke={strokeColor} strokeWidth={2.2} />
          <g transform={`rotate(${-comp.rotation})`}>
            <text x={-26} y={-28} fill={defaultInk} className="text-[10px] font-mono font-semibold">
              {comp.label}
            </text>
            <text x={-26} y={38} fill={isLight ? '#0284C7' : '#22D3EE'} className="text-[10px] font-mono">
              {valText}
            </text>
          </g>
        </g>
      );
    }

    // 3-Terminal Op-Amp Symbol
    if (comp.type === 'opamp') {
      return (
        <g opacity={isGhost ? 0.65 : 1}>
          <line x1={-64} y1={-32} x2={-28} y2={-32} stroke={strokeColor} strokeWidth={2.2} />
          <line x1={-64} y1={32} x2={-28} y2={32} stroke={strokeColor} strokeWidth={2.2} />
          <polygon
            points="-28,-44 -28,44 36,0"
            fill={bodyFill}
            stroke={strokeColor}
            strokeWidth={2.2}
          />
          <text x={-18} y={-28} fill="#06B6D4" className="text-[12px] font-mono font-bold">+</text>
          <text x={-18} y={36} fill="#F59E0B" className="text-[12px] font-mono font-bold">-</text>
          <line x1={36} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          <text x={0} y={-48} textAnchor="middle" fill={defaultInk} className="text-[10px] font-mono font-semibold">
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
              fill={isLight ? '#CBD5E1' : '#1E293B'}
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
              fill={isLight ? '#CBD5E1' : '#1E293B'}
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
                fill={intensity > 0.03 ? ledHex : isLight ? '#E2E8F0' : '#1E293B'}
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
            <circle cx={-20} cy={0} r={3.5} fill={bodyFill} stroke={strokeColor} strokeWidth={2} />
            <line
              x1={-17}
              y1={0}
              x2={18}
              y2={comp.switchClosed ? 0 : -16}
              stroke="#06B6D4"
              strokeWidth={2.6}
            />
            <circle cx={20} cy={0} r={3.5} fill={bodyFill} stroke={strokeColor} strokeWidth={2} />
            <line x1={20} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </g>
        )}

        {comp.type === 'voltmeter' && (
          <>
            <line x1={-64} y1={0} x2={-20} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <circle cx={0} cy={0} r={20} fill={bodyFill} stroke="#06B6D4" strokeWidth={2.2} />
            <text x={0} y={4} textAnchor="middle" fill="#06B6D4" className="text-[12px] font-mono font-bold">
              V
            </text>
            <line x1={20} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        {comp.type === 'ammeter' && (
          <>
            <line x1={-64} y1={0} x2={-20} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <circle cx={0} cy={0} r={20} fill={bodyFill} stroke="#F59E0B" strokeWidth={2.2} />
            <text x={0} y={4} textAnchor="middle" fill="#F59E0B" className="text-[12px] font-mono font-bold">
              A
            </text>
            <line x1={20} y1={0} x2={64} y2={0} stroke={strokeColor} strokeWidth={2.2} />
          </>
        )}

        {comp.type === 'dc_source' && (
          <>
            <line x1={-64} y1={0} x2={-20} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <circle cx={0} cy={0} r={20} fill={bodyFill} stroke={strokeColor} strokeWidth={2.2} />
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
            <circle cx={0} cy={0} r={20} fill={bodyFill} stroke={strokeColor} strokeWidth={2.2} />
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
            fill={defaultInk}
            className="text-[11px] font-mono font-semibold select-none"
          >
            {comp.label}
          </text>
          <text
            x={0}
            y={comp.rotation === 90 || comp.rotation === 270 ? 34 : 30}
            textAnchor="middle"
            fill={isLight ? '#0284C7' : '#22D3EE'}
            className="text-[10px] font-mono select-none"
          >
            {valText}
          </text>
        </g>
      </g>
    );
  };

  const hoveredComp = components.find((c) => c.id === hoveredCompId);
  const hoveredRes = hoveredComp ? solution.componentResults.get(hoveredComp.id) : null;

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
          activeTool === 'wire' || activeTool === 'place' || wireStart || snappedPin
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
            <circle cx={0} cy={0} r={1.3} fill={isLight ? '#CBD5E1' : '#1E293B'} />
          </pattern>
        </defs>

        <rect
          x={0}
          y={0}
          width={GRID_COLS * GRID_STEP}
          height={GRID_ROWS * GRID_STEP}
          fill={isLight ? '#F8FAFC' : '#07090E'}
        />
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
            vNode > 0.2
              ? isLight
                ? '#0284C7'
                : '#38BDF8'
              : vNode < -0.2
              ? '#D97706'
              : isLight
              ? '#475569'
              : '#64748B';

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
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth={14}
              />
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={wireColor}
                strokeWidth={2.6}
                strokeLinecap="round"
              />
              {showCurrentParticles &&
                Math.abs(current) > 1e-5 &&
                Array.from({ length: numDots }).map((_, idx) => {
                  const rawOffset = (idx / numDots + simTime * speed * dir) % 1;
                  const t = rawOffset < 0 ? rawOffset + 1 : rawOffset;
                  const px = x1 + (x2 - x1) * t;
                  const py = y1 + (y2 - y1) * t;
                  return (
                    <circle
                      key={idx}
                      cx={px}
                      cy={py}
                      r={3}
                      fill={isLight ? '#EA580C' : '#FACC15'}
                    />
                  );
                })}
            </g>
          );
        })}

        {/* Active Orthogonal L-Shape Wire Preview */}
        {wireStart && hoverGrid && (
          <g className="pointer-events-none">
            <polyline
              fill="none"
              stroke={snappedPin ? '#10B981' : '#06B6D4'}
              strokeWidth={2.6}
              strokeDasharray="6 4"
              points={`${wireStart.x * GRID_STEP},${wireStart.y * GRID_STEP} ${
                hoverGrid.x * GRID_STEP
              },${wireStart.y * GRID_STEP} ${hoverGrid.x * GRID_STEP},${
                hoverGrid.y * GRID_STEP
              }`}
            />
            <circle
              cx={wireStart.x * GRID_STEP}
              cy={wireStart.y * GRID_STEP}
              r={6}
              fill="#06B6D4"
            />
            <circle
              cx={hoverGrid.x * GRID_STEP}
              cy={hoverGrid.y * GRID_STEP}
              r={snappedPin ? 7.5 : 5}
              fill={snappedPin ? 'rgba(16, 185, 129, 0.25)' : 'none'}
              stroke={snappedPin ? '#10B981' : '#06B6D4'}
              strokeWidth={2.2}
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

              {/* Terminal Connection Nodes (Large Hit Target + Connected Status Ring) */}
              {terms.map((t, idx) => {
                const tx = t.x * GRID_STEP;
                const ty = t.y * GRID_STEP;
                const coordKey = `${t.x},${t.y}`;
                const isConnected = connectedCoords.has(coordKey);
                const vTerm = solution.nodeVoltages.get(coordKey) ?? 0;
                const isWireOrigin =
                  wireStart && wireStart.x === t.x && wireStart.y === t.y;
                const isSnappedHere =
                  snappedPin && snappedPin.x === t.x && snappedPin.y === t.y;

                return (
                  <g
                    key={`${comp.id}-term-${idx}`}
                    onMouseDown={(e) => handleTerminalMouseDown(e, t.x, t.y)}
                    onMouseUp={(e) => handleTerminalMouseUp(e, t.x, t.y)}
                    className="cursor-crosshair"
                  >
                    {/* Generous 24px invisible hit target so clicking/dragging a pin never misses */}
                    <circle cx={tx} cy={ty} r={12} fill="transparent" />

                    {isSnappedHere && (
                      <circle
                        cx={tx}
                        cy={ty}
                        r={9.5}
                        fill="rgba(16, 185, 129, 0.25)"
                        stroke="#10B981"
                        strokeWidth={1.8}
                      />
                    )}

                    <circle
                      cx={tx}
                      cy={ty}
                      r={isWireOrigin ? 6.5 : 5}
                      fill={
                        isWireOrigin
                          ? '#06B6D4'
                          : isConnected
                          ? '#10B981'
                          : isLight
                          ? '#FFFFFF'
                          : '#0B0E17'
                      }
                      stroke={isConnected ? '#10B981' : '#06B6D4'}
                      strokeWidth={2.2}
                    />

                    {showVoltageLabels &&
                      (idx === 0 ||
                        comp.type === 'arduino_uno' ||
                        comp.type === 'esp32_devkit' ||
                        comp.type === 'rpi_pico') && (
                        <text
                          x={tx + (t.x < comp.x ? -28 : 8)}
                          y={ty - 6}
                          fill={isLight ? '#334155' : '#94A3B8'}
                          className="text-[8.5px] font-mono pointer-events-none"
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
            {getComponentTerminals(ghostComp).map((t, idx) => {
              const willConnect = connectedCoords.has(`${t.x},${t.y}`) ||
                allPins.some((p) => p.x === t.x && p.y === t.y);
              return (
                <circle
                  key={`ghost-term-${idx}`}
                  cx={t.x * GRID_STEP}
                  cy={t.y * GRID_STEP}
                  r={willConnect ? 7 : 5.5}
                  fill={willConnect ? 'rgba(16, 185, 129, 0.35)' : 'none'}
                  stroke={willConnect ? '#10B981' : '#06B6D4'}
                  strokeWidth={2.2}
                  strokeDasharray={willConnect ? 'none' : '2 2'}
                />
              );
            })}
          </g>
        )}

        {/* Hover Grid Cursor Indicator */}
        {hoverGrid && !ghostComp && (
          <circle
            cx={hoverGrid.x * GRID_STEP}
            cy={hoverGrid.y * GRID_STEP}
            r={snappedPin ? 7 : 3.5}
            fill="none"
            stroke={snappedPin ? '#10B981' : '#06B6D4'}
            strokeWidth={1.6}
            className="pointer-events-none"
          />
        )}
      </svg>

      {/* Top-Left Coordinate & Magnetic Pin Snap Guidance HUD */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2.5 px-3 py-1.5 bg-[#111827]/95 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 shadow-sm">
        <span>
          GRID: ({hoverGrid?.x ?? 0}, {hoverGrid?.y ?? 0})
        </span>
        <span aria-hidden="true" className="text-slate-500">·</span>
        <span>
          NODE V:{' '}
          <strong className="text-cyan-400 tabular-nums">
            {hoverGrid && solution.nodeVoltages.has(`${hoverGrid.x},${hoverGrid.y}`)
              ? `${(solution.nodeVoltages.get(`${hoverGrid.x},${hoverGrid.y}`) ?? 0).toFixed(2)} V`
              : '—'}
          </strong>
        </span>

        {snappedPin && (
          <>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="text-emerald-400 font-semibold">
              ● PIN SNAP: {snappedPin.compLabel}.{snappedPin.name}
            </span>
          </>
        )}

        {activeTool === 'place' && pendingPlacement && (
          <>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="text-cyan-400 font-semibold">
              Placing {pendingPlacement.labelPrefix} ({pendingPlacement.rotation}°) — Click grid to place
            </span>
            <button
              onClick={onRotatePlacement}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded border border-slate-700 cursor-pointer"
            >
              Rotate (R)
            </button>
            <button
              onClick={onCancelTool}
              className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded border border-rose-500/40 cursor-pointer"
            >
              Done (Esc)
            </button>
          </>
        )}

        {wireStart && (
          <>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="text-amber-400 font-semibold">
              Wiring from ({wireStart.x},{wireStart.y}) — Click or release on target pin
            </span>
            <button
              onClick={() => setWireStart(null)}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 cursor-pointer"
            >
              Cancel (Esc)
            </button>
          </>
        )}
      </div>

      {/* Bottom-Left Quick Pin Legend */}
      <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-[#111827]/90 border border-slate-800 rounded-lg text-[11px] font-mono text-slate-400 pointer-events-none hidden sm:flex items-center gap-2.5">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" /> Connected Pin
        </span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-cyan-400" /> Open Pin (Click or Drag to Wire)
        </span>
      </div>

      {/* Live Component Hover Diagnostic Card */}
      {hoveredComp && hoveredRes && (
        <div className="absolute bottom-3 right-3 bg-[#111827]/95 border border-slate-700 rounded-lg p-3 shadow-lg pointer-events-none min-w-[245px]">
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
          {hoveredRes.mcuTelemetry ? (
            <div className="space-y-1 text-[11px] font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-400">ADC Input:</span>
                <span className="text-cyan-400 font-semibold">
                  {hoveredRes.mcuTelemetry.adcVoltage.toFixed(2)}V ({hoveredRes.mcuTelemetry.adcRawCount}/{hoveredRes.mcuTelemetry.adcMaxCount})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Digital / PWM Out:</span>
                <span className="text-amber-400 font-semibold">
                  {hoveredRes.mcuTelemetry.out1Voltage.toFixed(1)}V / {hoveredRes.mcuTelemetry.out2Voltage.toFixed(1)}V
                </span>
              </div>
              <div className="text-[10px] text-emerald-400 truncate pt-1 border-t border-slate-800">
                {hoveredRes.mcuTelemetry.serialLine}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
              <div>
                <div className="text-slate-400">ΔV / V_OUT</div>
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
          )}
          <div className="text-[11px] text-slate-400 mt-1.5 font-mono">
            {hoveredRes.statusMessage}
          </div>
        </div>
      )}
    </div>
  );
};
