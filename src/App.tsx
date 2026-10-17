/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  CircuitComponent,
  WireSegment,
  ComponentType,
  WaveformType,
  solveCircuitStep,
  formatEngineeringUnit,
} from './engine/circuitSolver';
import { PRESET_CIRCUITS, PresetCircuit } from './engine/presetCircuits';
import {
  SchematicCanvas,
  CanvasTool,
  PendingPlacement,
} from './components/SchematicCanvas';
import { OscilloscopeTray, ScopeSample } from './components/OscilloscopeTray';
import { ComponentVerifierBench } from './components/ComponentVerifierBench';
import {
  generateStandaloneCircuitHtml,
  GITHUB_PAGES_WORKFLOW_YAML,
} from './utils/htmlExporter';

type WorkspaceSection = 'lab' | 'verifier' | 'presets' | 'bom';

interface PaletteItem {
  type: ComponentType;
  label: string;
  category: 'Sources' | 'Passives' | 'Semis' | 'Meters';
  defaultVal: number;
  unitSummary: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'dc_source', label: 'DC Source', category: 'Sources', defaultVal: 9.0, unitSummary: '0.5V – 48V' },
  { type: 'ac_source', label: 'AC Function Gen', category: 'Sources', defaultVal: 5.0, unitSummary: 'Sine / Sq / Tri' },
  { type: 'ground', label: 'Ground (0V)', category: 'Sources', defaultVal: 0, unitSummary: '0V Reference' },
  { type: 'resistor', label: 'Resistor', category: 'Passives', defaultVal: 1000, unitSummary: '1Ω – 1MΩ' },
  { type: 'potentiometer', label: 'Potentiometer', category: 'Passives', defaultVal: 1000, unitSummary: 'Wiper 0–100%' },
  { type: 'capacitor', label: 'Capacitor', category: 'Passives', defaultVal: 4.7e-6, unitSummary: '10nF – 1mF' },
  { type: 'inductor', label: 'Inductor', category: 'Passives', defaultVal: 0.1, unitSummary: '1mH – 5H' },
  { type: 'diode', label: 'Si Diode (1N4007)', category: 'Semis', defaultVal: 0.7, unitSummary: 'Vf = 0.7V' },
  { type: 'zener', label: 'Zener Diode', category: 'Semis', defaultVal: 5.1, unitSummary: 'Vz = 5.1V' },
  { type: 'led', label: 'Indicator LED', category: 'Semis', defaultVal: 2.0, unitSummary: '30mA Max' },
  { type: 'npn_bjt', label: 'NPN BJT (2N3904)', category: 'Semis', defaultVal: 100, unitSummary: '3-Pin β=100' },
  { type: 'nmos', label: 'N-MOSFET (2N7000)', category: 'Semis', defaultVal: 2.0, unitSummary: '3-Pin Vth=2V' },
  { type: 'opamp', label: 'Op-Amp (LM741)', category: 'Semis', defaultVal: 12, unitSummary: '3-Pin Diff Amp' },
  { type: 'switch', label: 'SPST Switch', category: 'Meters', defaultVal: 0, unitSummary: 'Open / Closed' },
  { type: 'voltmeter', label: 'Inline Voltmeter', category: 'Meters', defaultVal: 0, unitSummary: '10MΩ DMM' },
  { type: 'ammeter', label: 'Inline Ammeter', category: 'Meters', defaultVal: 0, unitSummary: '10mΩ Shunt' },
  { type: 'probe_ch1', label: 'Scope Probe CH1', category: 'Meters', defaultVal: 0, unitSummary: 'Cyan Trace' },
  { type: 'probe_ch2', label: 'Scope Probe CH2', category: 'Meters', defaultVal: 0, unitSummary: 'Amber Trace' },
];

interface HistorySnapshot {
  components: CircuitComponent[];
  wires: WireSegment[];
}

export default function App() {
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('lab');
  const [activePreset, setActivePreset] = useState<PresetCircuit>(PRESET_CIRCUITS[0]);
  const [customTitle, setCustomTitle] = useState<string>(PRESET_CIRCUITS[0].name);

  const [components, setComponents] = useState<CircuitComponent[]>(() =>
    PRESET_CIRCUITS[0].components.map((c) => ({ ...c }))
  );
  const [wires, setWires] = useState<WireSegment[]>(() =>
    PRESET_CIRCUITS[0].wires.map((w) => ({ ...w }))
  );

  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const [savedCircuits, setSavedCircuits] = useState<PresetCircuit[]>(() => {
    try {
      const raw = localStorage.getItem('voltbench_custom_circuits_v1');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>('R1');
  const [activeTool, setActiveTool] = useState<CanvasTool>('select');
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [paletteCategory, setPaletteCategory] = useState<'All' | PaletteItem['category']>('All');

  const [isSimRunning, setIsSimRunning] = useState<boolean>(true);
  const [showCurrentParticles, setShowCurrentParticles] = useState<boolean>(true);
  const [showVoltageLabels, setShowVoltageLabels] = useState<boolean>(true);

  const [simTime, setSimTime] = useState<number>(0);
  const [scopeSamples, setScopeSamples] = useState<ScopeSample[]>([]);
  const [showHtmlModal, setShowHtmlModal] = useState<boolean>(false);
  const [copiedHtml, setCopiedHtml] = useState<boolean>(false);
  const [copiedWorkflow, setCopiedWorkflow] = useState<boolean>(false);

  const componentsRef = useRef<CircuitComponent[]>(components);
  const wiresRef = useRef<WireSegment[]>(wires);
  const simTimeRef = useRef<number>(0);

  useEffect(() => {
    componentsRef.current = components;
  }, [components]);

  useEffect(() => {
    wiresRef.current = wires;
  }, [wires]);

  const pushHistory = useCallback(() => {
    setHistory((prev) => [
      ...prev.slice(-24),
      {
        components: componentsRef.current.map((c) => ({ ...c })),
        wires: wiresRef.current.map((w) => ({ ...w })),
      },
    ]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [
        ...r,
        {
          components: componentsRef.current.map((c) => ({ ...c })),
          wires: wiresRef.current.map((w) => ({ ...w })),
        },
      ]);
      setComponents(last.components);
      setWires(last.wires);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = prev[prev.length - 1];
      setHistory((h) => [
        ...h,
        {
          components: componentsRef.current.map((c) => ({ ...c })),
          wires: wiresRef.current.map((w) => ({ ...w })),
        },
      ]);
      setComponents(next.components);
      setWires(next.wires);
      return prev.slice(0, -1);
    });
  }, []);

  const currentSolution = useMemo(() => {
    return solveCircuitStep(components, wires, simTime, 0.001);
  }, [components, wires, simTime]);

  useEffect(() => {
    if (!isSimRunning) return;
    let animId: number;
    const dt = 0.0008;

    const tick = () => {
      const nextT = simTimeRef.current + dt;
      simTimeRef.current = nextT;
      const sol = solveCircuitStep(componentsRef.current, wiresRef.current, nextT, dt);

      setSimTime(nextT);
      setScopeSamples((prev) => {
        const sample: ScopeSample = {
          t: nextT,
          ch1: sol.ch1Voltage ?? 0,
          ch2: sol.ch2Voltage ?? 0,
        };
        const next = [...prev, sample];
        return next.length > 220 ? next.slice(next.length - 220) : next;
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isSimRunning]);

  const prefixMap: Record<ComponentType, string> = {
    dc_source: 'V_DC',
    ac_source: 'V_AC',
    resistor: 'R',
    potentiometer: 'VR',
    capacitor: 'C',
    inductor: 'L',
    diode: 'D',
    zener: 'DZ',
    led: 'LED',
    npn_bjt: 'Q',
    nmos: 'M',
    opamp: 'U',
    switch: 'SW',
    voltmeter: 'VM',
    ammeter: 'AM',
    ground: 'GND',
    probe_ch1: 'CH1',
    probe_ch2: 'CH2',
  };

  const handleStartPlacement = (type: ComponentType, defaultVal: number) => {
    setPendingPlacement({
      type,
      labelPrefix: prefixMap[type],
      defaultVal,
      rotation: type === 'dc_source' || type === 'ac_source' ? 270 : 0,
    });
    setActiveTool('place');
  };

  const handlePlaceComponentAt = (x: number, y: number) => {
    if (!pendingPlacement) return;
    pushHistory();
    const { type, defaultVal, rotation } = pendingPlacement;
    const count = components.filter((c) => c.type === type).length + 1;
    const id = `${prefixMap[type]}${count}_${Date.now().toString().slice(-3)}`;
    const label = `${prefixMap[type]}${count}`;

    const newComp: CircuitComponent = {
      id,
      type,
      label,
      x,
      y,
      rotation,
      value: defaultVal,
      frequency: type === 'ac_source' ? 30 : undefined,
      waveform: type === 'ac_source' ? 'sine' : undefined,
      forwardVoltage:
        type === 'led' ? 2.0 : type === 'diode' || type === 'zener' ? 0.7 : undefined,
      zenerVoltage: type === 'zener' ? 5.1 : undefined,
      bjtBeta: type === 'npn_bjt' ? 100 : undefined,
      mosfetVth: type === 'nmos' ? 2.0 : undefined,
      opampSupplyV: type === 'opamp' ? 12 : undefined,
      ledColor: type === 'led' ? 'emerald' : undefined,
      switchClosed: type === 'switch' ? true : undefined,
      wiperPosition: type === 'potentiometer' ? 0.5 : undefined,
      maxPowerW: type === 'resistor' ? 0.25 : type === 'zener' ? 0.5 : undefined,
      maxCurrentA: type === 'led' ? 0.03 : undefined,
      maxVoltageV: type === 'capacitor' ? 25 : undefined,
    };

    setComponents((prev) => [...prev, newComp]);
    setSelectedId(id);
  };

  const handleRotatePlacement = useCallback(() => {
    setPendingPlacement((prev) =>
      prev
        ? { ...prev, rotation: (((prev.rotation + 90) % 360) as 0 | 90 | 180 | 270) }
        : null
    );
  }, []);

  const handleRotateSelected = useCallback(() => {
    if (activeTool === 'place' && pendingPlacement) {
      handleRotatePlacement();
      return;
    }
    if (!selectedId) return;
    pushHistory();
    setComponents((prev) =>
      prev.map((c) =>
        c.id === selectedId
          ? { ...c, rotation: (((c.rotation + 90) % 360) as 0 | 90 | 180 | 270) }
          : c
      )
    );
  }, [activeTool, pendingPlacement, selectedId, handleRotatePlacement, pushHistory]);

  const handleDeleteItem = useCallback(
    (id: string, kind: 'component' | 'wire') => {
      pushHistory();
      if (kind === 'component') {
        setComponents((prev) => prev.filter((c) => c.id !== id));
        if (selectedId === id) setSelectedId(null);
      } else {
        setWires((prev) => prev.filter((w) => w.id !== id));
      }
    },
    [pushHistory, selectedId]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'SELECT'
      ) {
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleRotateSelected();
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        setPendingPlacement(null);
        setActiveTool('wire');
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setPendingPlacement(null);
        setActiveTool('select');
      } else if (e.key === 'Escape') {
        setPendingPlacement(null);
        setActiveTool('select');
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        handleDeleteItem(selectedId, 'component');
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRotateSelected, handleDeleteItem, selectedId, handleUndo, handleRedo]);

  const loadPresetCircuit = (preset: PresetCircuit) => {
    pushHistory();
    setActivePreset(preset);
    setCustomTitle(preset.name);
    const clonedComps = preset.components.map((c) => ({
      ...c,
      prevVoltage: 0,
      prevCurrent: 0,
    }));
    const clonedWires = preset.wires.map((w) => ({ ...w }));
    setComponents(clonedComps);
    setWires(clonedWires);
    simTimeRef.current = 0;
    setSimTime(0);
    setScopeSamples([]);
    setSelectedId(clonedComps[0]?.id ?? null);
    setPendingPlacement(null);
    setActiveTool('select');
    setActiveSection('lab');
  };

  const handleNewBlankCircuit = (completelyEmpty = false) => {
    pushHistory();
    setCustomTitle('Custom Breadboard Circuit');
    if (completelyEmpty) {
      setComponents([]);
      setWires([]);
      setSelectedId(null);
    } else {
      const starterComps: CircuitComponent[] = [
        {
          id: 'V_SRC1',
          type: 'dc_source',
          label: 'V_SUP',
          x: 5,
          y: 7,
          rotation: 270,
          value: 9.0,
        },
        {
          id: 'GND_REF',
          type: 'ground',
          label: 'GND',
          x: 5,
          y: 11,
          rotation: 0,
          value: 0,
        },
        {
          id: 'CH1_P',
          type: 'probe_ch1',
          label: 'CH1',
          x: 8,
          y: 5,
          rotation: 0,
          value: 0,
        },
      ];
      const starterWires: WireSegment[] = [
        { id: 'w_init_1', x1: 5, y1: 9, x2: 5, y2: 11 },
        { id: 'w_init_2', x1: 5, y1: 5, x2: 8, y2: 5 },
      ];
      setComponents(starterComps);
      setWires(starterWires);
      setSelectedId('V_SRC1');
    }
    setScopeSamples([]);
    setPendingPlacement(null);
    setActiveTool('select');
  };

  const handleSaveCustomCircuit = () => {
    const newSaved: PresetCircuit = {
      id: `custom_${Date.now()}`,
      name: customTitle.trim() || `Custom Circuit #${savedCircuits.length + 1}`,
      category: 'User Created',
      summary: `Custom schematic with ${components.length} components and ${wires.length} wire nets.`,
      theoryNote: 'Created interactively in VoltBench Schematic Lab.',
      keyFormula: `${components.length} Parts · ${wires.length} Nets`,
      components: components.map((c) => ({ ...c })),
      wires: wires.map((w) => ({ ...w })),
    };
    const updated = [newSaved, ...savedCircuits.slice(0, 11)];
    setSavedCircuits(updated);
    try {
      localStorage.setItem('voltbench_custom_circuits_v1', JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
    setSaveFeedback('Saved!');
    setTimeout(() => setSaveFeedback(null), 2000);
  };

  const handleInsertSubcircuit = (blockType: 'led_stage' | 'divider_stage') => {
    pushHistory();
    const suffix = Date.now().toString().slice(-3);
    if (blockType === 'led_stage') {
      const rId = `R_LIM_${suffix}`;
      const ledId = `LED_${suffix}`;
      const gndId = `GND_${suffix}`;
      setComponents((prev) => [
        ...prev,
        {
          id: rId,
          type: 'resistor',
          label: 'R_LIM',
          x: 12,
          y: 5,
          rotation: 0,
          value: 330,
          maxPowerW: 0.25,
        },
        {
          id: ledId,
          type: 'led',
          label: 'LED1',
          x: 16,
          y: 8,
          rotation: 90,
          value: 2.0,
          forwardVoltage: 2.0,
          ledColor: 'emerald',
          maxCurrentA: 0.03,
        },
        {
          id: gndId,
          type: 'ground',
          label: 'GND',
          x: 16,
          y: 11,
          rotation: 0,
          value: 0,
        },
      ]);
      setWires((prev) => [
        ...prev,
        { id: `w_sub1_${suffix}`, x1: 14, y1: 5, x2: 16, y2: 5 },
        { id: `w_sub2_${suffix}`, x1: 16, y1: 5, x2: 16, y2: 6 },
        { id: `w_sub3_${suffix}`, x1: 16, y1: 10, x2: 16, y2: 11 },
      ]);
    } else if (blockType === 'divider_stage') {
      const r1Id = `R_A_${suffix}`;
      const r2Id = `R_B_${suffix}`;
      const ch2Id = `CH2_${suffix}`;
      setComponents((prev) => [
        ...prev,
        {
          id: r1Id,
          type: 'resistor',
          label: 'R_UPPER',
          x: 13,
          y: 6,
          rotation: 90,
          value: 1000,
          maxPowerW: 0.25,
        },
        {
          id: r2Id,
          type: 'resistor',
          label: 'R_LOWER',
          x: 13,
          y: 10,
          rotation: 90,
          value: 1000,
          maxPowerW: 0.25,
        },
        {
          id: ch2Id,
          type: 'probe_ch2',
          label: 'CH2 (Mid)',
          x: 15,
          y: 8,
          rotation: 0,
          value: 0,
        },
      ]);
      setWires((prev) => [
        ...prev,
        { id: `w_div_${suffix}`, x1: 13, y1: 8, x2: 15, y2: 8 },
      ]);
    }
  };

  const handleUpdateSelected = (patch: Partial<CircuitComponent>) => {
    if (!selectedId) return;
    setComponents((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, ...patch } : c))
    );
  };

  const handleToggleSwitch = (id: string) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, switchClosed: !c.switchClosed } : c))
    );
  };

  const handleMoveComponent = (id: string, newX: number, newY: number) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, x: newX, y: newY } : c))
    );
  };

  const handleAddWire = (x1: number, y1: number, x2: number, y2: number) => {
    pushHistory();
    const id = `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (x1 !== x2 && y1 !== y2) {
      setWires((prev) => [
        ...prev,
        { id: `${id}_h`, x1, y1, x2, y2: y1 },
        { id: `${id}_v`, x1: x2, y1, x2, y2 },
      ]);
    } else {
      setWires((prev) => [...prev, { id, x1, y1, x2, y2 }]);
    }
  };

  const selectedComp = useMemo(
    () => components.find((c) => c.id === selectedId) ?? null,
    [components, selectedId]
  );

  const selectedRes = useMemo(
    () => (selectedComp ? currentSolution.componentResults.get(selectedComp.id) ?? null : null),
    [selectedComp, currentSolution]
  );

  const generatedHtmlString = useMemo(
    () =>
      generateStandaloneCircuitHtml(
        customTitle || activePreset.name,
        components,
        wires,
        currentSolution
      ),
    [customTitle, activePreset.name, components, wires, currentSolution]
  );

  const handleCopyHtml = () => {
    navigator.clipboard.writeText(generatedHtmlString);
    setCopiedHtml(true);
    setTimeout(() => setCopiedHtml(false), 2000);
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([generatedHtmlString], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(customTitle || 'circuit').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-voltbench.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const healthCounts = useMemo(() => {
    let nominal = 0;
    let warning = 0;
    let fault = 0;
    for (const res of currentSolution.componentResults.values()) {
      if (res.status === 'fault') fault++;
      else if (res.status === 'warning') warning++;
      else nominal++;
    }
    return { nominal, warning, fault };
  }, [currentSolution]);

  const filteredPalette = useMemo(
    () =>
      paletteCategory === 'All'
        ? PALETTE_ITEMS
        : PALETTE_ITEMS.filter((item) => item.category === paletteCategory),
    [paletteCategory]
  );

  return (
    <div
      className={`min-h-screen flex flex-col bg-[#0B0E17] text-slate-100 ${
        activeSection === 'lab' ? 'lg:h-screen lg:overflow-hidden' : ''
      }`}
    >
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="flex items-center justify-between gap-8 px-5 py-2.5 border-b border-slate-800 bg-[#0B0E17] shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#lab"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('lab');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          VoltBench
        </a>

        {/* Zone 2: 4 clean single-line navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400">
          <a
            href="#lab"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('lab');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'lab'
                ? 'text-cyan-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-100'
            }`}
          >
            Schematic Lab
          </a>
          <a
            href="#verifier"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('verifier');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'verifier'
                ? 'text-cyan-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-100'
            }`}
          >
            Component Verifier
          </a>
          <a
            href="#presets"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('presets');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'presets'
                ? 'text-cyan-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-100'
            }`}
          >
            Preset Library
          </a>
          <a
            href="#bom"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('bom');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              activeSection === 'bom'
                ? 'text-cyan-400 underline underline-offset-8 decoration-2'
                : 'hover:text-slate-100'
            }`}
          >
            BOM & HTML Export
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            onClick={() => setShowHtmlModal(true)}
            className="px-4 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Generate HTML
          </button>
        </div>
      </header>

      {/* Compact Telemetry & Circuit Selector Ribbon */}
      <div className="px-5 py-1.5 bg-[#111827] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex flex-wrap items-center gap-2.5 text-slate-300">
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            aria-label="Circuit Title"
            className="bg-slate-900/90 border border-slate-700/80 focus:border-cyan-400 rounded px-2 py-0.5 text-xs font-semibold text-slate-100 w-56 outline-none"
          />
          <button
            onClick={handleSaveCustomCircuit}
            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {saveFeedback ?? 'Save Circuit'}
          </button>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="font-mono tabular-nums text-slate-400">
            {components.length} Parts · {wires.length} Nets · P_TOTAL:{' '}
            {(currentSolution.totalPowerW * 1000).toFixed(2)} mW
          </span>
        </div>

        <div className="flex items-center gap-3 font-mono">
          <span
            className={
              healthCounts.fault > 0
                ? 'text-rose-400 font-semibold'
                : healthCounts.warning > 0
                ? 'text-amber-400 font-semibold'
                : 'text-emerald-400 font-semibold'
            }
          >
            {healthCounts.fault > 0
              ? `✖ ${healthCounts.fault} Over-Spec Fault`
              : healthCounts.warning > 0
              ? `▲ ${healthCounts.warning} Thermal Warning`
              : `● ${healthCounts.nominal} Components Nominal`}
          </span>

          <span aria-hidden="true" className="text-slate-600">·</span>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Circuit:</span>
            <select
              value={activePreset.id}
              onChange={(e) => {
                const allPresets = [...PRESET_CIRCUITS, ...savedCircuits];
                const found = allPresets.find((p) => p.id === e.target.value);
                if (found) loadPresetCircuit(found);
              }}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-100 font-sans cursor-pointer"
            >
              <optgroup label="Built-In Reference Circuits">
                {PRESET_CIRCUITS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
              {savedCircuits.length > 0 && (
                <optgroup label="My Saved Circuits">
                  {savedCircuits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* MAIN WORKSPACE CONTENT */}
      {activeSection === 'lab' ? (
        /* 3-COLUMN SIDE-BY-SIDE ZERO-SCROLL WORKBENCH FOR SCHEMATIC LAB */
        <main className="flex-1 min-h-0 w-full px-4 py-3 grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
          {/* COLUMN 1 (LEFT, 3 COLS): PARTS BIN & SUBCIRCUIT STAMPER */}
          <aside className="lg:col-span-3 bg-[#111827] border border-slate-800 rounded-xl p-3.5 flex flex-col min-h-0 justify-between">
            <div className="flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800 shrink-0">
                <div>
                  <h2 className="text-xs font-semibold text-slate-100">
                    Create Circuit · Parts Bin
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Click part to stamp onto schematic
                  </p>
                </div>
                <button
                  onClick={() => handleNewBlankCircuit(false)}
                  className="px-2 py-1 text-[11px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  + New Blank
                </button>
              </div>

              {/* Compact Category Tabs */}
              <div className="flex flex-wrap gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg my-2.5 shrink-0">
                {(['All', 'Sources', 'Passives', 'Semis', 'Meters'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setPaletteCategory(cat)}
                    className={`flex-1 px-1.5 py-1 text-[10px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      paletteCategory === cat
                        ? 'bg-slate-700 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Scrollable Parts Grid */}
              <div className="grid grid-cols-2 gap-1.5 overflow-y-auto pr-1 flex-1 min-h-0 content-start">
                {filteredPalette.map((item) => {
                  const isPlacingThis =
                    activeTool === 'place' && pendingPlacement?.type === item.type;
                  return (
                    <button
                      key={item.type}
                      onClick={() => handleStartPlacement(item.type, item.defaultVal)}
                      className={`text-left px-2.5 py-2 rounded-lg border transition-colors group cursor-pointer ${
                        isPlacingThis
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-[11px] font-medium text-slate-100 group-hover:text-cyan-300 truncate">
                        + {item.label}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {item.unitSummary}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick-Stamp Subcircuit Blocks Footer */}
            <div className="pt-2.5 mt-2.5 border-t border-slate-800 space-y-1.5 shrink-0">
              <div className="text-[10px] font-mono text-slate-400 uppercase">
                Quick-Stamp Subcircuit Stages
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleInsertSubcircuit('led_stage')}
                  className="px-2 py-1.5 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  + LED + 330Ω
                </button>
                <button
                  onClick={() => handleInsertSubcircuit('divider_stage')}
                  className="px-2 py-1.5 text-[11px] font-medium bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  + 1kΩ Divider
                </button>
              </div>
            </div>
          </aside>

          {/* COLUMN 2 (CENTER, 5 COLS): INTERACTIVE SCHEMATIC CANVAS & CAD TOOLBAR */}
          <section className="lg:col-span-5 flex flex-col min-h-0 gap-2.5">
            {/* Compact CAD Toolbar */}
            <div className="bg-[#111827] border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => {
                    setPendingPlacement(null);
                    setActiveTool('select');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTool === 'select'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Select (V)
                </button>
                <button
                  onClick={() => {
                    setPendingPlacement(null);
                    setActiveTool('wire');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTool === 'wire'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Wire (W)
                </button>
                <button
                  onClick={() => {
                    setPendingPlacement(null);
                    setActiveTool('delete');
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTool === 'delete'
                      ? 'bg-rose-500 text-white font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Eraser
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={handleUndo}
                  disabled={history.length === 0}
                  className="px-2 py-1 text-[11px] font-mono text-slate-300 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Undo
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="px-2 py-1 text-[11px] font-mono text-slate-300 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-800 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Redo
                </button>
                <button
                  onClick={() => setShowCurrentParticles((v) => !v)}
                  className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showCurrentParticles
                      ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  Flow: {showCurrentParticles ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => setShowVoltageLabels((v) => !v)}
                  className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showVoltageLabels
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  Nodes: {showVoltageLabels ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => handleNewBlankCircuit(true)}
                  className="px-2 py-1 text-[11px] font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Full-Height Interactive Schematic Canvas */}
            <SchematicCanvas
              components={components}
              wires={wires}
              solution={currentSolution}
              selectedId={selectedId}
              activeTool={activeTool}
              pendingPlacement={pendingPlacement}
              showCurrentParticles={showCurrentParticles}
              showVoltageLabels={showVoltageLabels}
              simTime={simTime}
              onSelectComponent={setSelectedId}
              onToggleSwitch={handleToggleSwitch}
              onMoveComponent={handleMoveComponent}
              onPlaceComponentAt={handlePlaceComponentAt}
              onRotatePlacement={handleRotatePlacement}
              onCancelTool={() => {
                setPendingPlacement(null);
                setActiveTool('select');
              }}
              onAddWire={handleAddWire}
              onDeleteItem={handleDeleteItem}
            />
          </section>

          {/* COLUMN 3 (RIGHT, 4 COLS): SIDE-BY-SIDE LIVE OSCILLOSCOPE + PARAMETER INSPECTOR */}
          <aside className="lg:col-span-4 flex flex-col min-h-0 gap-3">
            {/* Top Half: Real-Time Dual-Channel Oscilloscope Docked Side-by-Side */}
            <div className="shrink-0">
              <OscilloscopeTray
                samples={scopeSamples}
                isRunning={isSimRunning}
                onToggleRun={() => setIsSimRunning((r) => !r)}
                onClearTrace={() => setScopeSamples([])}
              />
            </div>

            {/* Bottom Half: Selected Component Parameter Inspector & Live Nodal Readout */}
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 flex-1 min-h-0 overflow-y-auto flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-800">
                  <div>
                    <h2 className="text-xs font-semibold text-slate-100">
                      Component Parameter Inspector
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Real-time tuning & thermal stress verification
                    </p>
                  </div>
                  {selectedComp && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleRotateSelected}
                        className="px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Rotate (R)
                      </button>
                      <button
                        onClick={() => handleDeleteItem(selectedComp.id, 'component')}
                        className="px-2 py-1 text-[11px] font-mono bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded border border-rose-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {selectedComp && selectedRes ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-mono font-bold text-slate-100">
                          {selectedComp.label}
                        </span>
                        <span className="text-xs text-slate-400 ml-1.5">
                          · {selectedComp.type.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-mono font-semibold ${
                          selectedRes.status === 'fault'
                            ? 'text-rose-400'
                            : selectedRes.status === 'warning'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {selectedRes.status === 'fault'
                          ? '✖ Over-Spec Fault'
                          : selectedRes.status === 'warning'
                          ? '▲ Thermal Warning'
                          : '● Nominal'}
                      </span>
                    </div>

                    {selectedComp.type === 'resistor' && (
                      <div className="space-y-2.5">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Resistance (R)</span>
                            <span className="font-mono text-cyan-400 tabular-nums">
                              {formatEngineeringUnit(selectedComp.value, 'Ω')}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={10000}
                            step={10}
                            value={selectedComp.value}
                            onChange={(e) =>
                              handleUpdateSelected({ value: Number(e.target.value) })
                            }
                            className="w-full accent-cyan-400 cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Power Rating (P_MAX)</span>
                            <span className="font-mono text-slate-200 tabular-nums">
                              {selectedComp.maxPowerW ?? 0.25} W
                            </span>
                          </div>
                          <div className="flex gap-1.5">
                            {[0.125, 0.25, 0.5, 1.0].map((w) => (
                              <button
                                key={w}
                                onClick={() => handleUpdateSelected({ maxPowerW: w })}
                                className={`flex-1 py-1 text-[11px] font-mono rounded border cursor-pointer ${
                                  (selectedComp.maxPowerW ?? 0.25) === w
                                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                                    : 'bg-slate-900 border-slate-800 text-slate-400'
                                }`}
                              >
                                {w}W
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedComp.type === 'npn_bjt' && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300">Current Gain (β / h_FE)</span>
                          <span className="font-mono text-cyan-400 tabular-nums">
                            {selectedComp.bjtBeta ?? 100}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={300}
                          step={10}
                          value={selectedComp.bjtBeta ?? 100}
                          onChange={(e) =>
                            handleUpdateSelected({
                              bjtBeta: Number(e.target.value),
                              value: Number(e.target.value),
                            })
                          }
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>
                    )}

                    {selectedComp.type === 'nmos' && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300">Gate Threshold (V_GS(th))</span>
                          <span className="font-mono text-cyan-400 tabular-nums">
                            {(selectedComp.mosfetVth ?? 2.0).toFixed(2)} V
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.8}
                          max={4.5}
                          step={0.1}
                          value={selectedComp.mosfetVth ?? 2.0}
                          onChange={(e) =>
                            handleUpdateSelected({
                              mosfetVth: Number(e.target.value),
                              value: Number(e.target.value),
                            })
                          }
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>
                    )}

                    {selectedComp.type === 'potentiometer' && (
                      <div className="space-y-2.5">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Wiper Position (%)</span>
                            <span className="font-mono text-cyan-400 tabular-nums">
                              {Math.round((selectedComp.wiperPosition ?? 0.5) * 100)}% (
                              {formatEngineeringUnit(
                                selectedComp.value * (selectedComp.wiperPosition ?? 0.5),
                                'Ω'
                              )}
                              )
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.05}
                            max={1.0}
                            step={0.01}
                            value={selectedComp.wiperPosition ?? 0.5}
                            onChange={(e) =>
                              handleUpdateSelected({ wiperPosition: Number(e.target.value) })
                            }
                            className="w-full accent-cyan-400 cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Track Resistance</span>
                            <span className="font-mono text-slate-200 tabular-nums">
                              {formatEngineeringUnit(selectedComp.value, 'Ω')}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={100}
                            max={10000}
                            step={100}
                            value={selectedComp.value}
                            onChange={(e) =>
                              handleUpdateSelected({ value: Number(e.target.value) })
                            }
                            className="w-full accent-cyan-400 cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    {selectedComp.type === 'dc_source' && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300">DC Supply Voltage (V_DC)</span>
                          <span className="font-mono text-cyan-400 tabular-nums">
                            {selectedComp.value.toFixed(1)} V
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={36}
                          step={0.5}
                          value={selectedComp.value}
                          onChange={(e) =>
                            handleUpdateSelected({ value: Number(e.target.value) })
                          }
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>
                    )}

                    {selectedComp.type === 'ac_source' && (
                      <div className="space-y-2.5">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Peak Amplitude (V_PK)</span>
                            <span className="font-mono text-cyan-400 tabular-nums">
                              {selectedComp.value.toFixed(1)} V
                            </span>
                          </div>
                          <input
                            type="range"
                            min={1}
                            max={24}
                            step={0.5}
                            value={selectedComp.value}
                            onChange={(e) =>
                              handleUpdateSelected({ value: Number(e.target.value) })
                            }
                            className="w-full accent-cyan-400 cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Frequency (f)</span>
                            <span className="font-mono text-amber-400 tabular-nums">
                              {selectedComp.frequency ?? 30} Hz
                            </span>
                          </div>
                          <input
                            type="range"
                            min={5}
                            max={120}
                            step={1}
                            value={selectedComp.frequency ?? 30}
                            onChange={(e) =>
                              handleUpdateSelected({ frequency: Number(e.target.value) })
                            }
                            className="w-full accent-amber-400 cursor-pointer"
                          />
                        </div>
                        <div className="flex gap-1.5">
                          {(['sine', 'square', 'triangle'] as WaveformType[]).map((wf) => (
                            <button
                              key={wf}
                              onClick={() => handleUpdateSelected({ waveform: wf })}
                              className={`flex-1 py-1 text-[11px] font-mono uppercase rounded border cursor-pointer ${
                                (selectedComp.waveform ?? 'sine') === wf
                                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                                  : 'bg-slate-900 border-slate-800 text-slate-400'
                              }`}
                            >
                              {wf}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedComp.type === 'capacitor' && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300">Capacitance (C)</span>
                          <span className="font-mono text-cyan-400 tabular-nums">
                            {formatEngineeringUnit(selectedComp.value, 'F')}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={47}
                          step={0.5}
                          value={selectedComp.value * 1e6}
                          onChange={(e) =>
                            handleUpdateSelected({ value: Number(e.target.value) * 1e-6 })
                          }
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>
                    )}

                    {selectedComp.type === 'inductor' && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300">Inductance (L)</span>
                          <span className="font-mono text-cyan-400 tabular-nums">
                            {formatEngineeringUnit(selectedComp.value, 'H')}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={500}
                          step={10}
                          value={selectedComp.value * 1000}
                          onChange={(e) =>
                            handleUpdateSelected({ value: Number(e.target.value) / 1000 })
                          }
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>
                    )}

                    {selectedComp.type === 'zener' && (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-300">Zener Breakdown (V_Z)</span>
                          <span className="font-mono text-amber-400 tabular-nums">
                            {(selectedComp.zenerVoltage ?? 5.1).toFixed(1)} V
                          </span>
                        </div>
                        <div className="flex gap-1.5">
                          {[3.3, 5.1, 9.1, 12.0].map((vz) => (
                            <button
                              key={vz}
                              onClick={() =>
                                handleUpdateSelected({ zenerVoltage: vz, value: vz })
                              }
                              className={`flex-1 py-1 text-[11px] font-mono rounded border cursor-pointer ${
                                (selectedComp.zenerVoltage ?? 5.1) === vz
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                                  : 'bg-slate-900 border-slate-800 text-slate-400'
                              }`}
                            >
                              {vz}V
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedComp.type === 'led' && (
                      <div className="flex gap-1.5">
                        {(
                          [
                            { c: 'red', vf: 1.85 },
                            { c: 'amber', vf: 2.0 },
                            { c: 'emerald', vf: 2.15 },
                            { c: 'cyan', vf: 2.8 },
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.c}
                            onClick={() =>
                              handleUpdateSelected({
                                ledColor: item.c,
                                forwardVoltage: item.vf,
                                value: item.vf,
                              })
                            }
                            className={`flex-1 py-1 text-[11px] font-mono uppercase rounded border cursor-pointer ${
                              (selectedComp.ledColor ?? 'emerald') === item.c
                                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            {item.c}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedComp.type === 'switch' && (
                      <button
                        onClick={() => handleToggleSwitch(selectedComp.id)}
                        className="w-full py-1.5 text-xs font-mono font-semibold bg-cyan-500/15 border border-cyan-500/50 text-cyan-300 rounded-lg hover:bg-cyan-500/25 transition-colors cursor-pointer"
                      >
                        Toggle Switch ({selectedComp.switchClosed ? 'CLOSED' : 'OPEN'})
                      </button>
                    )}

                    <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-800 text-xs font-mono tabular-nums">
                      <div className="bg-slate-900/80 border border-slate-800 rounded p-2">
                        <div className="text-[9px] text-slate-400">VOLTAGE DROP</div>
                        <div className="font-bold text-slate-100 mt-0.5">
                          {selectedRes.vDrop.toFixed(2)} V
                        </div>
                      </div>
                      <div className="bg-slate-900/80 border border-slate-800 rounded p-2">
                        <div className="text-[9px] text-slate-400">CURRENT</div>
                        <div className="font-bold text-cyan-400 mt-0.5">
                          {(selectedRes.current * 1000).toFixed(2)} mA
                        </div>
                      </div>
                      <div className="bg-slate-900/80 border border-slate-800 rounded p-2">
                        <div className="text-[9px] text-slate-400">DISSIPATION</div>
                        <div className="font-bold text-amber-400 mt-0.5">
                          {(selectedRes.power * 1000).toFixed(1)} mW
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] font-mono text-slate-400">
                      Status: <span className="text-slate-200">{selectedRes.statusMessage}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-400">
                    Click any component on the schematic canvas to tune parameters and inspect nodal telemetry.
                  </div>
                )}
              </div>

              {/* Compact Active Circuit Formula Footer */}
              <div className="pt-2.5 mt-2.5 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-400 truncate">{activePreset.category}</span>
                <span className="font-mono text-cyan-400 truncate">{activePreset.keyFormula}</span>
              </div>
            </div>
          </aside>
        </main>
      ) : (
        /* STANDARD CONTAINER FOR VERIFIER, PRESETS, AND BOM TABS */
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
          {activeSection === 'verifier' && <ComponentVerifierBench />}

          {activeSection === 'presets' && (
            <div className="space-y-8">
              {savedCircuits.length > 0 && (
                <div className="space-y-4">
                  <div className="border-b border-slate-800 pb-3">
                    <h2 className="text-lg font-semibold text-slate-100">
                      My Custom Saved Circuits
                    </h2>
                    <p className="text-xs text-slate-400">
                      Circuits you designed and saved in the Schematic Lab.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedCircuits.map((custom) => (
                      <div
                        key={custom.id}
                        className="bg-[#111827] border border-cyan-500/40 rounded-xl p-5 flex flex-col justify-between space-y-4"
                      >
                        <div className="space-y-2">
                          <div className="text-xs text-cyan-400 font-mono">
                            Custom Build · {custom.components.length} Parts · {custom.wires.length} Nets
                          </div>
                          <h3 className="text-base font-semibold text-slate-100">{custom.name}</h3>
                          <p className="text-xs text-slate-400">{custom.summary}</p>
                        </div>
                        <button
                          onClick={() => loadPresetCircuit(custom)}
                          className="w-full py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors cursor-pointer"
                        >
                          Open Custom Circuit
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="border-b border-slate-800 pb-4">
                  <h2 className="text-xl font-semibold text-slate-100">
                    Verified Electronic Reference Topologies
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Load any pre-calibrated circuit directly into the side-by-side MNA simulator and oscilloscope.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {PRESET_CIRCUITS.map((preset, index) => (
                    <div
                      key={preset.id}
                      className="bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-5 hover:border-slate-700 transition-colors"
                    >
                      <div className="space-y-2.5">
                        <div className="text-xs text-slate-400 font-mono">
                          0{index + 1} · {preset.category} · {preset.components.length} Parts
                        </div>
                        <h3 className="text-base font-semibold text-slate-100">
                          {preset.name}
                        </h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {preset.summary}
                        </p>
                      </div>

                      <div className="space-y-3 pt-3 border-t border-slate-800">
                        <div className="text-xs font-mono text-cyan-400 bg-slate-900/90 border border-slate-800 rounded px-3 py-2">
                          {preset.keyFormula}
                        </div>
                        <button
                          onClick={() => loadPresetCircuit(preset)}
                          className="w-full py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors cursor-pointer"
                        >
                          Load into Live Simulator
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'bom' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-100">
                    Real-Time Bill of Materials (BOM) & Standalone HTML Lab Generator
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Live electrical stress verification table and self-contained runnable HTML export for {customTitle}.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopyHtml}
                    className="px-4 py-2 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedHtml ? 'Copied HTML to Clipboard' : 'Copy Standalone HTML'}
                  </button>
                  <button
                    onClick={handleDownloadHtml}
                    className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Download .HTML Lab File
                  </button>
                </div>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase bg-slate-900/50">
                        <th className="py-3 px-4">Designator</th>
                        <th className="py-3 px-4">Component Type</th>
                        <th className="py-3 px-4">Value / Rating</th>
                        <th className="py-3 px-4">Voltage Drop (ΔV)</th>
                        <th className="py-3 px-4">Branch Current (I)</th>
                        <th className="py-3 px-4">Power (P)</th>
                        <th className="py-3 px-4">Real-Time Verification</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-mono tabular-nums">
                      {components
                        .filter((c) => c.type !== 'ground')
                        .map((comp) => {
                          const res = currentSolution.componentResults.get(comp.id);
                          return (
                            <tr key={comp.id} className="hover:bg-slate-900/40">
                              <td className="py-3 px-4 font-bold text-slate-100">{comp.label}</td>
                              <td className="py-3 px-4 font-sans text-slate-300">
                                {comp.type.replace('_', ' ').toUpperCase()}
                              </td>
                              <td className="py-3 px-4 text-cyan-400">
                                {comp.type === 'resistor' || comp.type === 'potentiometer'
                                  ? formatEngineeringUnit(comp.value, 'Ω')
                                  : comp.type === 'capacitor'
                                  ? formatEngineeringUnit(comp.value, 'F')
                                  : comp.type === 'inductor'
                                  ? formatEngineeringUnit(comp.value, 'H')
                                  : comp.type === 'dc_source' || comp.type === 'ac_source'
                                  ? `${comp.value.toFixed(1)} V`
                                  : comp.type === 'npn_bjt'
                                  ? `β = ${comp.bjtBeta ?? 100}`
                                  : comp.type === 'nmos'
                                  ? `Vth = ${comp.mosfetVth ?? 2.0}V`
                                  : 'Standard'}
                              </td>
                              <td className="py-3 px-4 text-slate-200">
                                {res ? `${res.vDrop.toFixed(2)} V` : '0.00 V'}
                              </td>
                              <td className="py-3 px-4 text-slate-200">
                                {res ? `${(res.current * 1000).toFixed(2)} mA` : '0.00 mA'}
                              </td>
                              <td className="py-3 px-4 text-amber-400">
                                {res ? `${(res.power * 1000).toFixed(2)} mW` : '0.00 mW'}
                              </td>
                              <td
                                className={`py-3 px-4 font-semibold ${
                                  res?.status === 'fault'
                                    ? 'text-rose-400'
                                    : res?.status === 'warning'
                                    ? 'text-amber-400'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {res ? res.statusMessage : '● Nominal'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Generated Self-Contained HTML Source Code
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    Single-file HTML5 + Canvas + BOM ({generatedHtmlString.length.toLocaleString()} bytes)
                  </span>
                </div>
                <pre className="bg-[#07090E] border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[360px]">
                  <code>{generatedHtmlString}</code>
                </pre>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      GitHub Pages CI/CD Workflow (.github/workflows/deploy.yml)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Configured in the repository with relative asset resolution (--base=./) for automatic GitHub Pages hosting on push to main.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(GITHUB_PAGES_WORKFLOW_YAML);
                      setCopiedWorkflow(true);
                      setTimeout(() => setCopiedWorkflow(false), 2000);
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedWorkflow ? 'Copied deploy.yml!' : 'Copy deploy.yml'}
                  </button>
                </div>
                <pre className="bg-[#07090E] border border-slate-800 rounded-lg p-4 text-xs font-mono text-cyan-300 overflow-x-auto max-h-[300px]">
                  <code>{GITHUB_PAGES_WORKFLOW_YAML}</code>
                </pre>
              </div>
            </div>
          )}
        </main>
      )}

      {/* STANDALONE HTML EXPORT MODAL */}
      {showHtmlModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setShowHtmlModal(false)}
        >
          <div
            className="bg-[#111827] border border-slate-700 rounded-xl max-w-3xl w-full p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Standalone HTML Circuit Lab Generator
                </h3>
                <p className="text-xs text-slate-400">
                  Self-contained HTML file with live oscilloscope simulation and verified Bill of Materials
                </p>
              </div>
              <button
                onClick={() => setShowHtmlModal(false)}
                className="px-2.5 py-1 text-xs font-mono text-slate-400 hover:text-white bg-slate-800 rounded"
              >
                Close
              </button>
            </div>

            <pre className="bg-[#07090E] border border-slate-800 rounded-lg p-4 text-xs font-mono text-cyan-300 overflow-x-auto max-h-[340px]">
              <code>{generatedHtmlString}</code>
            </pre>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleCopyHtml}
                className="px-4 py-2 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                {copiedHtml ? 'Copied to Clipboard!' : 'Copy Raw HTML'}
              </button>
              <button
                onClick={handleDownloadHtml}
                className="px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors cursor-pointer"
              >
                Download .HTML File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
