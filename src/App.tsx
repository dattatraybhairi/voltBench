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
  McuProgramMode,
  solveCircuitStep,
  getComponentTerminals,
  runAutomatedLabSuite,
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
  category: 'MCUs' | 'Sensors & I/O' | 'Passives' | 'Semis' | 'Sources & Meters';
  defaultVal: number;
  unitSummary: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'arduino_uno', label: 'Arduino Uno R3', category: 'MCUs', defaultVal: 5.0, unitSummary: '5V · C++ / .ino PCB' },
  { type: 'esp32_devkit', label: 'ESP32 DevKit V1', category: 'MCUs', defaultVal: 3.3, unitSummary: '3.3V · Wi-Fi / 12-Bit ADC' },
  { type: 'rpi_pico', label: 'Raspberry Pi Pico', category: 'MCUs', defaultVal: 3.3, unitSummary: 'RP2040 · Python / C++' },
  { type: 'ne555_timer', label: 'NE555 Timer IC', category: 'MCUs', defaultVal: 5.0, unitSummary: 'Astable / PWM Clock' },
  { type: 'ultrasonic_hcsr04', label: 'HC-SR04 Sonar', category: 'Sensors & I/O', defaultVal: 65, unitSummary: 'Radar 2–400 cm' },
  { type: 'ldr_sensor', label: 'LDR Light Sensor', category: 'Sensors & I/O', defaultVal: 500, unitSummary: 'Ambient 10–1000 lux' },
  { type: 'dht22_sensor', label: 'DHT22 Temp/Humid', category: 'Sensors & I/O', defaultVal: 25, unitSummary: '-20..80°C & %RH' },
  { type: 'ssd1306_oled', label: 'SSD1306 OLED', category: 'Sensors & I/O', defaultVal: 3.3, unitSummary: '128×64 I2C Display' },
  { type: 'dc_motor', label: 'DC Hobby Motor', category: 'Sensors & I/O', defaultVal: 36, unitSummary: 'Live RPM & Stall Test' },
  { type: 'servo_motor', label: 'SG90 Micro Servo', category: 'Sensors & I/O', defaultVal: 90, unitSummary: '0°–180° PWM Actuator' },
  { type: 'relay_module', label: '5V Relay Module', category: 'Sensors & I/O', defaultVal: 5.0, unitSummary: 'Opto NO/NC Switch' },
  { type: 'piezo_buzzer', label: 'Piezo Buzzer', category: 'Sensors & I/O', defaultVal: 5.0, unitSummary: 'Acoustic Tone Alarm' },
  { type: 'led', label: 'Indicator LED', category: 'Sensors & I/O', defaultVal: 2.0, unitSummary: 'Red/Grn/Amb/Cyan' },
  { type: 'resistor', label: 'Resistor', category: 'Passives', defaultVal: 1000, unitSummary: '1Ω – 1MΩ' },
  { type: 'potentiometer', label: 'Potentiometer', category: 'Passives', defaultVal: 1000, unitSummary: 'Wiper 0–100%' },
  { type: 'capacitor', label: 'Capacitor', category: 'Passives', defaultVal: 4.7e-6, unitSummary: '10nF – 1mF' },
  { type: 'inductor', label: 'Inductor', category: 'Passives', defaultVal: 0.1, unitSummary: '1mH – 5H' },
  { type: 'diode', label: 'Si Diode (1N4007)', category: 'Semis', defaultVal: 0.7, unitSummary: 'Vf = 0.7V' },
  { type: 'zener', label: 'Zener Diode', category: 'Semis', defaultVal: 5.1, unitSummary: 'Vz = 5.1V' },
  { type: 'npn_bjt', label: 'NPN BJT (2N3904)', category: 'Semis', defaultVal: 100, unitSummary: '3-Pin β=100' },
  { type: 'nmos', label: 'N-MOSFET (2N7000)', category: 'Semis', defaultVal: 2.0, unitSummary: '3-Pin Vth=2V' },
  { type: 'opamp', label: 'Op-Amp (LM741)', category: 'Semis', defaultVal: 12, unitSummary: '3-Pin Diff Amp' },
  { type: 'dc_source', label: 'DC Source', category: 'Sources & Meters', defaultVal: 9.0, unitSummary: '0.5V – 48V' },
  { type: 'ac_source', label: 'AC Function Gen', category: 'Sources & Meters', defaultVal: 5.0, unitSummary: 'Sine / Sq / Tri' },
  { type: 'ground', label: 'Ground (0V)', category: 'Sources & Meters', defaultVal: 0, unitSummary: '0V Reference' },
  { type: 'switch', label: 'SPST Switch', category: 'Sources & Meters', defaultVal: 0, unitSummary: 'Open / Closed' },
  { type: 'voltmeter', label: 'Inline Voltmeter', category: 'Sources & Meters', defaultVal: 0, unitSummary: '10MΩ DMM' },
  { type: 'ammeter', label: 'Inline Ammeter', category: 'Sources & Meters', defaultVal: 0, unitSummary: '10mΩ Shunt' },
  { type: 'probe_ch1', label: 'Scope Probe CH1', category: 'Sources & Meters', defaultVal: 0, unitSummary: 'Cyan Trace' },
  { type: 'probe_ch2', label: 'Scope Probe CH2', category: 'Sources & Meters', defaultVal: 0, unitSummary: 'Amber Trace' },
];

const CODE_TEMPLATES: { label: string; code: string }[] = [
  {
    label: 'Sonar + OLED + Motor',
    code: `void loop() {
  int cm = readDistance();
  bool btn = readButton();
  bool closeAlert = (cm < 100) || btn;
  digitalWrite(13, closeAlert ? HIGH : LOW);

  int pwmSpeed = closeAlert ? 60 : 220;
  analogWrite(9, pwmSpeed);

  display.clearDisplay();
  display.println("SONAR RADAR LAB");
  display.println("Dist: " + cm + " cm");
  display.println(closeAlert ? "STATUS: BRAKE!" : "MOTOR: CRUISE");
  Serial.println("Sonar=" + cm + "cm | BTN=" + btn + " | PWM=" + pwmSpeed);
}`,
  },
  {
    label: 'LDR Light + Servo',
    code: `# RPi Pico / ESP32 / Arduino Light Servo Logic
let currentLux = readLight();
let nightAlert = currentLux < 300;
digitalWrite(13, nightAlert ? HIGH : LOW);

let angle = round((currentLux / 1000) * 180);
servo.write(angle);

oled.fill(0);
oled.text("SOLAR TRACKER");
oled.text("Lux: " + currentLux + " lx");
oled.text("Servo: " + angle + " deg");
print("Lux=" + currentLux + " | Angle=" + angle + "deg");`,
  },
  {
    label: 'DHT22 + Relay + Cmd',
    code: `void loop() {
  float t = readTempC();
  float h = readHumidity();
  String cmd = Serial.readString();
  bool fanOn = (t > 32) || (cmd == "FAN_ON") || readButton();
  digitalWrite(13, fanOn ? HIGH : LOW);
  analogWrite(9, fanOn ? 240 : 40);

  display.clearDisplay();
  display.println("ENV CONTROLLER");
  display.println("T:" + t + "C H:" + h + "%");
  display.println(fanOn ? "RELAY: ACTIVE" : "RELAY: STANDBY");
  Serial.println("Temp=" + t + "C | Hum=" + h + "% | Fan=" + fanOn);
}`,
  },
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
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(
    PRESET_CIRCUITS[0].components[0]?.id ?? null
  );
  const [activeTool, setActiveTool] = useState<CanvasTool>('select');
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [paletteCategory, setPaletteCategory] = useState<'All' | PaletteItem['category']>('All');

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('voltbench_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
    try {
      localStorage.setItem('voltbench_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const [isSimRunning, setIsSimRunning] = useState<boolean>(true);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState<number>(1.0);
  const [inspectorTab, setInspectorTab] = useState<'studio' | 'debugger'>('studio');
  const [serialCmdInput, setSerialCmdInput] = useState<string>('FAN_ON');
  const [hilSweepRunning, setHilSweepRunning] = useState<boolean>(false);
  const [showCurrentParticles, setShowCurrentParticles] = useState<boolean>(true);
  const [showVoltageLabels, setShowVoltageLabels] = useState<boolean>(true);

  const [simTime, setSimTime] = useState<number>(0);
  const [scopeSamples, setScopeSamples] = useState<ScopeSample[]>([]);
  const [showHtmlModal, setShowHtmlModal] = useState<boolean>(false);
  const [copiedHtml, setCopiedHtml] = useState<boolean>(false);
  const [copiedWorkflow, setCopiedWorkflow] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const labTestResults = useMemo(() => {
    return runAutomatedLabSuite(components, wires, simTime);
  }, [components, wires, simTime]);

  const handleStepSimulation = useCallback((stepSec = 0.01) => {
    const nextT = simTimeRef.current + stepSec;
    simTimeRef.current = nextT;
    const sol = solveCircuitStep(componentsRef.current, wiresRef.current, nextT, stepSec);
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
  }, []);

  useEffect(() => {
    if (!isSimRunning) return;
    let animId: number;
    const dt = 0.0008 * simSpeedMultiplier;

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
  }, [isSimRunning, simSpeedMultiplier]);

  const prefixMap: Record<ComponentType, string> = {
    arduino_uno: 'UNO',
    esp32_devkit: 'ESP32',
    rpi_pico: 'PICO',
    ne555_timer: 'U555',
    ultrasonic_hcsr04: 'SONAR',
    ldr_sensor: 'LDR',
    dht22_sensor: 'DHT22',
    ssd1306_oled: 'OLED',
    dc_motor: 'MOT',
    servo_motor: 'SERVO',
    relay_module: 'RLY',
    piezo_buzzer: 'BUZ',
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

    const isMcu =
      type === 'arduino_uno' || type === 'esp32_devkit' || type === 'rpi_pico';
    const is555 = type === 'ne555_timer';

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
      switchClosed: type === 'switch' || type === 'relay_module' ? true : undefined,
      wiperPosition: type === 'potentiometer' ? 0.5 : undefined,
      distanceCm: type === 'ultrasonic_hcsr04' ? 65 : undefined,
      lightLux: type === 'ldr_sensor' ? 500 : undefined,
      tempC: type === 'dht22_sensor' ? 25 : undefined,
      humidityPct: type === 'dht22_sensor' ? 48 : undefined,
      servoAngleDeg: type === 'servo_motor' ? 90 : undefined,
      mcuProgram: isMcu ? 'custom_code' : undefined,
      mcuCustomCode: isMcu ? CODE_TEMPLATES[0].code : undefined,
      mcuPwmDuty: isMcu || is555 ? 60 : undefined,
      mcuBlinkHz: isMcu || is555 ? 25 : undefined,
      mcuAdcThresholdV: type === 'arduino_uno' ? 2.5 : isMcu ? 1.65 : undefined,
      maxPowerW: type === 'resistor' ? 0.25 : type === 'zener' ? 0.5 : undefined,
      maxCurrentA: type === 'led' ? 0.03 : undefined,
      maxVoltageV: type === 'capacitor' ? 25 : undefined,
    };

    // Automatically add short bridge wires if any terminal of the newly placed component
    // lands within 1.5 grid units of an existing component pin or wire endpoint
    const newTerms = getComponentTerminals(newComp);
    const existingCoords: Array<{ x: number; y: number }> = [];
    for (const c of components) {
      for (const t of getComponentTerminals(c)) {
        existingCoords.push({ x: t.x, y: t.y });
      }
    }
    for (const w of wires) {
      existingCoords.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
    }

    const autoBridgeWires: WireSegment[] = [];
    newTerms.forEach((t, idx) => {
      let nearest: { x: number; y: number } | null = null;
      let bestDist = 1.6;
      for (const pt of existingCoords) {
        const d = Math.hypot(t.x - pt.x, t.y - pt.y);
        if (d > 0.01 && d <= bestDist) {
          bestDist = d;
          nearest = pt;
        }
      }
      if (nearest) {
        const wid = `w_snap_${Date.now()}_${idx}`;
        if (t.x !== nearest.x && t.y !== nearest.y) {
          autoBridgeWires.push(
            { id: `${wid}_h`, x1: t.x, y1: t.y, x2: nearest.x, y2: t.y },
            { id: `${wid}_v`, x1: nearest.x, y1: t.y, x2: nearest.x, y2: nearest.y }
          );
        } else {
          autoBridgeWires.push({
            id: wid,
            x1: t.x,
            y1: t.y,
            x2: nearest.x,
            y2: nearest.y,
          });
        }
      }
    });

    setComponents((prev) => [...prev, newComp]);
    if (autoBridgeWires.length > 0) {
      setWires((prev) => [...prev, ...autoBridgeWires]);
    }
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
        document.activeElement?.tagName === 'SELECT' ||
        document.activeElement?.tagName === 'TEXTAREA'
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
    setCustomTitle('Custom Programmable Circuit');
    if (completelyEmpty) {
      setComponents([]);
      setWires([]);
      setSelectedId(null);
    } else {
      const starterComps: CircuitComponent[] = [
        {
          id: 'UNO_START',
          type: 'arduino_uno',
          label: 'ARDUINO_UNO',
          x: 12,
          y: 8,
          rotation: 0,
          value: 5.0,
          mcuProgram: 'custom_code',
          mcuCustomCode: CODE_TEMPLATES[0].code,
          mcuPwmDuty: 65,
          mcuBlinkHz: 25,
        },
        {
          id: 'GND_REF',
          type: 'ground',
          label: 'GND',
          x: 9,
          y: 12,
          rotation: 0,
          value: 0,
        },
      ];
      const starterWires: WireSegment[] = [
        { id: 'w_init_1', x1: 9, y1: 10, x2: 9, y2: 12 },
      ];
      setComponents(starterComps);
      setWires(starterWires);
      setSelectedId('UNO_START');
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

  // Helper to route orthogonal L-shaped wires between two points
  const createOrthogonalWires = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    prefix: string
  ): WireSegment[] => {
    if (x1 === x2 && y1 === y2) return [];
    if (x1 === x2 || y1 === y2) {
      return [{ id: `${prefix}_s`, x1, y1, x2, y2 }];
    }
    return [
      { id: `${prefix}_h`, x1, y1, x2, y2: y1 },
      { id: `${prefix}_v`, x1: x2, y1, x2, y2 },
    ];
  };

  // Smart Auto-Wire helper: connects any unconnected pins of the selected (or all) components
  // to the active MCU board (if present) or nearest circuit terminals
  const handleAutoConnectPins = useCallback(() => {
    pushHistory();
    const mcu = components.find(
      (c) =>
        c.type === 'arduino_uno' ||
        c.type === 'esp32_devkit' ||
        c.type === 'rpi_pico'
    );
    const gndComp = components.find((c) => c.type === 'ground');
    const mcuTerms = mcu ? getComponentTerminals(mcu) : [];
    const gndTerm = gndComp
      ? getComponentTerminals(gndComp)[0]
      : mcuTerms[2] ?? null;

    // Build set of currently connected coordinates
    const pointCount = new Map<string, number>();
    const inc = (x: number, y: number) => {
      const k = `${Math.round(x)},${Math.round(y)}`;
      pointCount.set(k, (pointCount.get(k) ?? 0) + 1);
    };
    for (const c of components) {
      for (const t of getComponentTerminals(c)) inc(t.x, t.y);
    }
    for (const w of wires) {
      const dx = Math.sign(w.x2 - w.x1);
      const dy = Math.sign(w.y2 - w.y1);
      const steps = Math.max(Math.abs(w.x2 - w.x1), Math.abs(w.y2 - w.y1));
      if (steps === 0) {
        inc(w.x1, w.y1);
      } else {
        for (let s = 0; s <= steps; s++) {
          inc(w.x1 + dx * s, w.y1 + dy * s);
        }
      }
    }

    const targets = selectedId
      ? components.filter((c) => c.id === selectedId)
      : components;

    const newSegments: WireSegment[] = [];
    const stamp = Date.now().toString().slice(-4);

    targets.forEach((comp, cIdx) => {
      if (
        comp.type === 'arduino_uno' ||
        comp.type === 'esp32_devkit' ||
        comp.type === 'rpi_pico'
      ) {
        return;
      }
      const terms = getComponentTerminals(comp);
      terms.forEach((term, tIdx) => {
        const key = `${Math.round(term.x)},${Math.round(term.y)}`;
        if ((pointCount.get(key) ?? 0) > 1) return; // Already connected!

        // Determine smart target pin on MCU or circuit
        let dest: { x: number; y: number } | null = null;
        if (mcu && mcuTerms.length >= 6) {
          if (
            comp.type === 'ultrasonic_hcsr04' ||
            comp.type === 'ldr_sensor'
          ) {
            // Pin 0 -> A0 (mcuTerms[1]), Pin 1 -> GND (mcuTerms[2])
            dest = tIdx === 0 ? mcuTerms[1] : gndTerm ?? mcuTerms[2];
          } else if (
            comp.type === 'ssd1306_oled' ||
            comp.type === 'dc_motor' ||
            comp.type === 'servo_motor'
          ) {
            // Pin 0 -> PWM D9/GPIO (mcuTerms[4]), Pin 1 -> GND (mcuTerms[2])
            dest = tIdx === 0 ? mcuTerms[4] : gndTerm ?? mcuTerms[2];
          } else if (comp.type === 'led') {
            // Pin 0 -> D13/GPIO (mcuTerms[3]), Pin 1 -> GND
            dest = tIdx === 0 ? mcuTerms[3] : gndTerm ?? mcuTerms[2];
          } else if (comp.type === 'ground') {
            dest = mcuTerms[2];
          }
        }

        // Fallback: connect to nearest other terminal in the circuit
        if (!dest) {
          let bestD = Infinity;
          for (const other of components) {
            if (other.id === comp.id) continue;
            for (const ot of getComponentTerminals(other)) {
              const d = Math.hypot(term.x - ot.x, term.y - ot.y);
              if (d > 0.1 && d < bestD) {
                bestD = d;
                dest = { x: ot.x, y: ot.y };
              }
            }
          }
        }

        if (dest) {
          newSegments.push(
            ...createOrthogonalWires(
              term.x,
              term.y,
              dest.x,
              dest.y,
              `w_auto_${stamp}_${cIdx}_${tIdx}`
            )
          );
        }
      });
    });

    if (newSegments.length > 0) {
      setWires((prev) => [...prev, ...newSegments]);
      setSaveFeedback(`Wired ${newSegments.length} net(s)`);
      setTimeout(() => setSaveFeedback(null), 2000);
    } else {
      setSaveFeedback('All pins connected');
      setTimeout(() => setSaveFeedback(null), 2000);
    }
  }, [components, wires, selectedId, pushHistory]);

  const handleInsertSubcircuit = (
    blockType: 'sonar_oled_stage' | 'motor_stage' | 'led_stage'
  ) => {
    pushHistory();
    const suffix = Date.now().toString().slice(-3);
    const mcu = components.find(
      (c) =>
        c.type === 'arduino_uno' ||
        c.type === 'esp32_devkit' ||
        c.type === 'rpi_pico'
    );
    const mcuTerms = mcu ? getComponentTerminals(mcu) : [];

    if (blockType === 'sonar_oled_stage') {
      const sonarId = `SONAR_${suffix}`;
      const oledId = `OLED_${suffix}`;
      const sonarComp: CircuitComponent = {
        id: sonarId,
        type: 'ultrasonic_hcsr04',
        label: 'HC-SR04',
        x: 5,
        y: 8,
        rotation: 0,
        value: 55,
        distanceCm: 55,
      };
      const oledComp: CircuitComponent = {
        id: oledId,
        type: 'ssd1306_oled',
        label: 'SSD1306',
        x: 13,
        y: 3,
        rotation: 0,
        value: 3.3,
      };
      setComponents((prev) => [...prev, sonarComp, oledComp]);
      if (mcuTerms.length >= 6) {
        const sTerms = getComponentTerminals(sonarComp);
        const oTerms = getComponentTerminals(oledComp);
        setWires((prev) => [
          ...prev,
          ...createOrthogonalWires(sTerms[0].x, sTerms[0].y, mcuTerms[1].x, mcuTerms[1].y, `w_so1_${suffix}`),
          ...createOrthogonalWires(sTerms[1].x, sTerms[1].y, mcuTerms[2].x, mcuTerms[2].y, `w_so2_${suffix}`),
          ...createOrthogonalWires(oTerms[0].x, oTerms[0].y, mcuTerms[4].x, mcuTerms[4].y, `w_so3_${suffix}`),
          ...createOrthogonalWires(oTerms[1].x, oTerms[1].y, mcuTerms[2].x, mcuTerms[2].y, `w_so4_${suffix}`),
        ]);
      }
      setSelectedId(sonarId);
    } else if (blockType === 'motor_stage') {
      const motId = `MOT_${suffix}`;
      const servoId = `SERVO_${suffix}`;
      const motComp: CircuitComponent = {
        id: motId,
        type: 'dc_motor',
        label: 'DC_MOT',
        x: 20,
        y: 10,
        rotation: 90,
        value: 36,
      };
      const servoComp: CircuitComponent = {
        id: servoId,
        type: 'servo_motor',
        label: 'SG90',
        x: 22,
        y: 5,
        rotation: 0,
        value: 90,
      };
      setComponents((prev) => [...prev, motComp, servoComp]);
      if (mcuTerms.length >= 6) {
        const mTerms = getComponentTerminals(motComp);
        const svTerms = getComponentTerminals(servoComp);
        setWires((prev) => [
          ...prev,
          ...createOrthogonalWires(mTerms[0].x, mTerms[0].y, mcuTerms[4].x, mcuTerms[4].y, `w_ms1_${suffix}`),
          ...createOrthogonalWires(mTerms[1].x, mTerms[1].y, mcuTerms[2].x, mcuTerms[2].y, `w_ms2_${suffix}`),
          ...createOrthogonalWires(svTerms[0].x, svTerms[0].y, mcuTerms[4].x, mcuTerms[4].y, `w_ms3_${suffix}`),
          ...createOrthogonalWires(svTerms[1].x, svTerms[1].y, mcuTerms[2].x, mcuTerms[2].y, `w_ms4_${suffix}`),
        ]);
      }
      setSelectedId(motId);
    } else if (blockType === 'led_stage') {
      const rId = `R_LIM_${suffix}`;
      const ledId = `LED_${suffix}`;
      const gndId = `GND_${suffix}`;
      setComponents((prev) => [
        ...prev,
        {
          id: rId,
          type: 'resistor',
          label: 'R_LIM',
          x: 19,
          y: 6,
          rotation: 0,
          value: 220,
          maxPowerW: 0.25,
        },
        {
          id: ledId,
          type: 'led',
          label: 'LED1',
          x: 24,
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
          x: 24,
          y: 12,
          rotation: 0,
          value: 0,
        },
      ]);
      setWires((prev) => [
        ...prev,
        ...(mcuTerms.length >= 4
          ? createOrthogonalWires(17, 6, mcuTerms[3].x, mcuTerms[3].y, `w_sub0_${suffix}`)
          : []),
        { id: `w_sub1_${suffix}`, x1: 21, y1: 6, x2: 24, y2: 6 },
        { id: `w_sub2_${suffix}`, x1: 24, y1: 10, x2: 24, y2: 12 },
      ]);
      setSelectedId(ledId);
    }
  };

  const handleUpdateSelected = (patch: Partial<CircuitComponent>) => {
    if (!selectedId) return;
    setComponents((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, ...patch } : c))
    );
  };

  const handleUpdateComponentById = (id: string, patch: Partial<CircuitComponent>) => {
    setComponents((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const handleCodeFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      handleUpdateSelected({
        mcuProgram: 'custom_code',
        mcuCustomCode: content,
      });
      setUploadFeedback(`Loaded ${file.name} (${content.length} chars)`);
      setTimeout(() => setUploadFeedback(null), 3500);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleToggleSwitch = (id: string) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, switchClosed: !c.switchClosed } : c))
    );
  };

  // Interactive on-canvas & inspector Module Action handler
  const handleModuleAction = useCallback(
    (
      compId: string,
      action:
        | 'toggle_boot_btn'
        | 'reset_mcu'
        | 'toggle_radar_sweep'
        | 'toggle_motor_stall'
        | 'toggle_relay'
        | 'step_sensor'
    ) => {
      setSelectedId(compId);
      if (action === 'reset_mcu') {
        simTimeRef.current = 0;
        setSimTime(0);
        setScopeSamples([]);
        setSaveFeedback('MCU Reset (t=0s)');
        setTimeout(() => setSaveFeedback(null), 1800);
        return;
      }

      setComponents((prev) =>
        prev.map((c) => {
          if (c.id !== compId) return c;
          if (action === 'toggle_boot_btn') {
            return { ...c, mcuBootButtonPressed: !c.mcuBootButtonPressed };
          }
          if (action === 'toggle_radar_sweep') {
            return { ...c, radarAutoSweep: !c.radarAutoSweep };
          }
          if (action === 'toggle_motor_stall') {
            return { ...c, motorStallLoad: !c.motorStallLoad };
          }
          if (action === 'toggle_relay') {
            return { ...c, switchClosed: !c.switchClosed };
          }
          if (action === 'step_sensor') {
            if (c.type === 'ldr_sensor') {
              const nextLux = ((c.lightLux ?? 450) + 250) % 1000;
              const clamped = Math.max(40, nextLux);
              return { ...c, lightLux: clamped, value: clamped };
            }
            if (c.type === 'dht22_sensor') {
              const nextTemp = (c.tempC ?? 25) >= 60 ? 18 : (c.tempC ?? 25) + 15;
              const nextHum = ((c.humidityPct ?? 48) + 20) % 95;
              return { ...c, tempC: nextTemp, humidityPct: Math.max(25, nextHum) };
            }
            if (c.type === 'servo_motor') {
              const nextDeg = ((c.servoAngleDeg ?? 90) + 45) % 185;
              return { ...c, servoAngleDeg: nextDeg, value: nextDeg };
            }
          }
          return c;
        })
      );
    },
    []
  );

  // Automated Hardware-in-the-Loop (HIL) Live Stimulus Sweep Runner
  const handleRunLiveHilSweep = useCallback(() => {
    if (hilSweepRunning) return;
    setHilSweepRunning(true);
    setInspectorTab('debugger');
    const steps = [
      { dist: 25, lux: 120, temp: 26, btn: true },
      { dist: 75, lux: 450, temp: 38, btn: false },
      { dist: 190, lux: 880, temp: 52, btn: false },
      { dist: 40, lux: 220, temp: 24, btn: false },
    ];
    steps.forEach((st, idx) => {
      setTimeout(() => {
        setComponents((prev) =>
          prev.map((c) => {
            if (c.type === 'ultrasonic_hcsr04') {
              return { ...c, distanceCm: st.dist, value: st.dist, radarAutoSweep: false };
            }
            if (c.type === 'ldr_sensor') {
              return { ...c, lightLux: st.lux, value: st.lux };
            }
            if (c.type === 'dht22_sensor') {
              return { ...c, tempC: st.temp };
            }
            if (
              c.type === 'arduino_uno' ||
              c.type === 'esp32_devkit' ||
              c.type === 'rpi_pico'
            ) {
              return { ...c, mcuBootButtonPressed: st.btn };
            }
            return c;
          })
        );
        if (idx === steps.length - 1) {
          setHilSweepRunning(false);
          setSaveFeedback('HIL Sweep Passed!');
          setTimeout(() => setSaveFeedback(null), 2200);
        }
      }, idx * 550);
    });
  }, [hilSweepRunning]);

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

  // Find any active sensors in the circuit for quick-scrubbing from the MCU IDE
  const activeSonar = useMemo(
    () => components.find((c) => c.type === 'ultrasonic_hcsr04') ?? null,
    [components]
  );
  const activeLdr = useMemo(
    () => components.find((c) => c.type === 'ldr_sensor') ?? null,
    [components]
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
            className="bg-slate-900/90 border border-slate-700/80 focus:border-cyan-400 rounded px-2 py-0.5 text-xs font-semibold text-slate-100 w-60 outline-none"
          />
          <button
            onClick={handleSaveCustomCircuit}
            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {saveFeedback ?? 'Save Circuit'}
          </button>

          {/* Live Environment Sensor Quick Sliders right in the ribbon if Sonar or LDR is in circuit */}
          {activeSonar && (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded px-2 py-0.5">
              <span className="text-[11px] font-mono text-cyan-300">
                Sonar: {activeSonar.distanceCm ?? 65}cm
              </span>
              <input
                type="range"
                min={5}
                max={350}
                step={5}
                value={activeSonar.distanceCm ?? 65}
                onChange={(e) =>
                  handleUpdateComponentById(activeSonar.id, {
                    distanceCm: Number(e.target.value),
                    value: Number(e.target.value),
                  })
                }
                className="w-20 accent-cyan-400 cursor-pointer"
              />
            </div>
          )}

          {activeLdr && (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded px-2 py-0.5">
              <span className="text-[11px] font-mono text-amber-300">
                Light: {activeLdr.lightLux ?? 500}lx
              </span>
              <input
                type="range"
                min={20}
                max={1000}
                step={20}
                value={activeLdr.lightLux ?? 500}
                onChange={(e) =>
                  handleUpdateComponentById(activeLdr.id, {
                    lightLux: Number(e.target.value),
                    value: Number(e.target.value),
                  })
                }
                className="w-20 accent-amber-400 cursor-pointer"
              />
            </div>
          )}
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
              ? `▲ ${healthCounts.warning} Warning`
              : `● ${healthCounts.nominal} Nominal`}
          </span>

          <span aria-hidden="true" className="text-slate-600">·</span>

          <button
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className="px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded font-sans font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Toggle Light / Dark CAD Theme"
          >
            {theme === 'light' ? '☾ Dark Theme' : '☀ Light Theme'}
          </button>

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
              <optgroup label="Built-In Reference Circuits (MCU, Sensors & Analog)">
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
                    Boards, Sensors & Parts Bin
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Click any board, sensor, OLED, or motor to place
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
                {(
                  [
                    'All',
                    'MCUs',
                    'Sensors & I/O',
                    'Passives',
                    'Semis',
                    'Sources & Meters',
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setPaletteCategory(cat)}
                    className={`px-1.5 py-1 text-[10px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                  const isSpecial =
                    item.category === 'MCUs' || item.category === 'Sensors & I/O';
                  return (
                    <button
                      key={item.type}
                      onClick={() => handleStartPlacement(item.type, item.defaultVal)}
                      className={`text-left px-2.5 py-2 rounded-lg border transition-colors group cursor-pointer ${
                        isPlacingThis
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                          : isSpecial
                          ? 'bg-cyan-950/30 hover:bg-cyan-900/40 border-cyan-500/30 hover:border-cyan-400/60'
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
                Quick-Stamp Hardware Kits
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => handleInsertSubcircuit('sonar_oled_stage')}
                  className="px-2 py-1.5 text-[10px] font-medium bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  + Sonar+OLED
                </button>
                <button
                  onClick={() => handleInsertSubcircuit('motor_stage')}
                  className="px-2 py-1.5 text-[10px] font-medium bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  + Motor+Servo
                </button>
                <button
                  onClick={() => handleInsertSubcircuit('led_stage')}
                  className="px-2 py-1.5 text-[10px] font-medium bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  + LED+220Ω
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
                  onClick={handleAutoConnectPins}
                  className="px-2 py-1 text-[11px] font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Automatically route wires from any open component pins to the MCU or nearest circuit nodes"
                >
                  ⚡ Auto-Wire Pins
                </button>
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
              theme={theme}
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
              onModuleAction={handleModuleAction}
            />
          </section>

          {/* COLUMN 3 (RIGHT, 4 COLS): SIDE-BY-SIDE LIVE OSCILLOSCOPE + CODE STUDIO / REALTIME DEBUG & HIL LAB TESTING */}
          <aside className="lg:col-span-4 flex flex-col min-h-0 gap-3">
            {/* Top Half: Real-Time Dual-Channel Oscilloscope Docked Side-by-Side */}
            <div className="shrink-0">
              <OscilloscopeTray
                samples={scopeSamples}
                isRunning={isSimRunning}
                theme={theme}
                onToggleRun={() => setIsSimRunning((r) => !r)}
                onClearTrace={() => setScopeSamples([])}
              />
            </div>

            {/* Bottom Half: Tabbed MCU Code & Module Actions + Real-Time Debugger & HIL Lab Testing */}
            <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5 flex-1 min-h-0 overflow-y-auto flex flex-col justify-between">
              <div>
                {/* 2-Tab Mode Switcher: Code & Module Actions vs Realtime Debug & Lab Testing */}
                <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-800">
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg">
                    <button
                      onClick={() => setInspectorTab('studio')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                        inspectorTab === 'studio'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Code & Module Actions
                    </button>
                    <button
                      onClick={() => setInspectorTab('debugger')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors cursor-pointer ${
                        inspectorTab === 'debugger'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Debug & Lab Testing ({labTestResults.filter((t) => t.status === 'pass').length}/
                      {labTestResults.length})
                    </button>
                  </div>

                  {selectedComp && inspectorTab === 'studio' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleRotateSelected}
                        className="px-2 py-1 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Rotate
                      </button>
                      <button
                        onClick={() => handleDeleteItem(selectedComp.id, 'component')}
                        className="px-2 py-1 text-[10px] font-mono bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 rounded border border-rose-500/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Del
                      </button>
                    </div>
                  )}
                </div>

                {inspectorTab === 'debugger' ? (
                  /* TAB 2: REAL-TIME MCU DEBUGGER & HARDWARE-IN-THE-LOOP (HIL) LAB TEST SUITE */
                  <div className="space-y-3">
                    {/* Real-Time Clock & Single-Step Execution Bar */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-semibold text-cyan-300">
                          REAL-TIME CLOCK & STEP DEBUGGER
                        </span>
                        <span className="text-[11px] font-mono text-slate-300 tabular-nums">
                          t = {(simTime * 1000).toFixed(1)} ms
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setIsSimRunning((r) => !r)}
                            className={`px-2.5 py-1 text-[10px] font-mono font-semibold rounded border cursor-pointer ${
                              isSimRunning
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                            }`}
                          >
                            {isSimRunning ? '⏸ Pause Clock' : '▶ Resume'}
                          </button>
                          <button
                            onClick={() => {
                              setIsSimRunning(false);
                              handleStepSimulation(0.01);
                            }}
                            className="px-2 py-1 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded cursor-pointer"
                          >
                            ⏭ Step +10ms
                          </button>
                          <button
                            onClick={() => {
                              simTimeRef.current = 0;
                              setSimTime(0);
                              setScopeSamples([]);
                            }}
                            className="px-2 py-1 text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded cursor-pointer"
                          >
                            ↺ Reset
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          {[0.1, 0.5, 1.0, 2.0].map((spd) => (
                            <button
                              key={spd}
                              onClick={() => setSimSpeedMultiplier(spd)}
                              className={`px-1.5 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${
                                simSpeedMultiplier === spd
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                                  : 'bg-slate-950 border-slate-800 text-slate-400'
                              }`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Live MCU Register & Pin State Watch Table */}
                    {(() => {
                      const activeMcu = components.find(
                        (c) =>
                          c.type === 'arduino_uno' ||
                          c.type === 'esp32_devkit' ||
                          c.type === 'rpi_pico'
                      );
                      const mcuTel = activeMcu
                        ? currentSolution.componentResults.get(activeMcu.id)?.mcuTelemetry
                        : undefined;
                      if (!activeMcu || !mcuTel) return null;
                      return (
                        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 space-y-2 font-mono text-[10px]">
                          <div className="flex items-center justify-between text-slate-300 border-b border-slate-800 pb-1">
                            <span className="font-bold text-cyan-300">
                              {activeMcu.label} REGISTER WATCH
                            </span>
                            <span>{mcuTel.clockCycles.toLocaleString()} cycles</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 tabular-nums">
                            <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1">
                              <div className="text-slate-400 text-[9px]">VCC RAIL</div>
                              <div className="text-emerald-300 font-bold">
                                {mcuTel.vcc.toFixed(2)} V
                              </div>
                            </div>
                            <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1">
                              <div className="text-slate-400 text-[9px]">ADC (A0)</div>
                              <div className="text-cyan-300 font-bold">
                                {mcuTel.adcRawCount} ({mcuTel.adcVoltage.toFixed(2)}V)
                              </div>
                            </div>
                            <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1">
                              <div className="text-slate-400 text-[9px]">PWM (D9~)</div>
                              <div className="text-amber-300 font-bold">
                                {mcuTel.pwmDutyOut}% ({mcuTel.out2Voltage.toFixed(2)}V)
                              </div>
                            </div>
                            <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1">
                              <div className="text-slate-400 text-[9px]">DOUT (D13)</div>
                              <div
                                className={
                                  mcuTel.out1High
                                    ? 'text-emerald-300 font-bold'
                                    : 'text-slate-400'
                                }
                              >
                                {mcuTel.out1High ? 'HIGH (1)' : 'LOW (0)'}
                              </div>
                            </div>
                            <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1">
                              <div className="text-slate-400 text-[9px]">BOOT / D2 IN</div>
                              <div
                                className={
                                  mcuTel.digitalInHigh
                                    ? 'text-amber-300 font-bold'
                                    : 'text-slate-400'
                                }
                              >
                                {mcuTel.digitalInHigh ? 'HIGH (PRESSED)' : 'LOW (0)'}
                              </div>
                            </div>
                            <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1">
                              <div className="text-slate-400 text-[9px]">I2C OLED</div>
                              <div className="text-cyan-300 truncate">
                                {mcuTel.oledLines[0] ?? '0x3C OK'}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Automated Hardware-in-the-Loop (HIL) Lab Test Suite */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-slate-100">
                            Automated HIL Lab Verification Suite
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Real-time netlist, SOA thermal & closed-loop stimulus assertions
                          </div>
                        </div>
                        <button
                          onClick={handleRunLiveHilSweep}
                          disabled={hilSweepRunning}
                          className="px-2.5 py-1 text-[10px] font-mono font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {hilSweepRunning ? '⟳ Sweeping...' : '▶ Run HIL Sweep'}
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {labTestResults.map((test) => (
                          <div
                            key={test.id}
                            className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-semibold text-slate-100">
                                {test.name}
                              </span>
                              <span
                                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${
                                  test.status === 'pass'
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : test.status === 'warn'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                }`}
                              >
                                {test.status === 'pass'
                                  ? '✓ PASS'
                                  : test.status === 'warn'
                                  ? '▲ WARN'
                                  : '✖ FAIL'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300">
                              <span>Measured: {test.measured}</span>
                              <span className="text-slate-400">Target: {test.expected}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 leading-snug">
                              {test.detail}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : selectedComp && selectedRes ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-mono font-bold text-slate-100">
                          {selectedComp.label}
                        </span>
                        <span className="text-[11px] text-slate-400 ml-1.5">
                          · {selectedComp.type.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-mono font-semibold ${
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
                          ? '▲ Warning'
                          : '● Running Live'}
                      </span>
                    </div>

                    {/* PROGRAMMABLE MICROCONTROLLER STUDIO (ARDUINO UNO, ESP32, RPi PICO) */}
                    {(selectedComp.type === 'arduino_uno' ||
                      selectedComp.type === 'esp32_devkit' ||
                      selectedComp.type === 'rpi_pico') && (
                      <div className="space-y-2">
                        {/* Interactive On-Board Module Action Deck */}
                        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-semibold text-cyan-300 uppercase">
                              Board Hardware Actions ({selectedComp.label})
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() =>
                                  handleModuleAction(selectedComp.id, 'toggle_boot_btn')
                                }
                                className={`px-2 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${
                                  selectedComp.mcuBootButtonPressed
                                    ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                                    : 'bg-slate-800 text-cyan-300 border-slate-700 hover:bg-slate-700'
                                }`}
                              >
                                {selectedComp.mcuBootButtonPressed
                                  ? '● BOOT/D2: HIGH'
                                  : '○ Press BOOT/D2'}
                              </button>
                              <button
                                onClick={() =>
                                  handleModuleAction(selectedComp.id, 'reset_mcu')
                                }
                                className="px-2 py-0.5 text-[10px] font-mono bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/40 rounded cursor-pointer"
                              >
                                ↺ Reset Board
                              </button>
                            </div>
                          </div>

                          {/* Inject UART Serial / Wi-Fi Command into MCU */}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={serialCmdInput}
                              onChange={(e) => setSerialCmdInput(e.target.value)}
                              placeholder="Serial/Wi-Fi RX Command (e.g. FAN_ON)"
                              className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-[10px] font-mono text-slate-100 outline-none"
                            />
                            <button
                              onClick={() =>
                                handleUpdateSelected({ mcuSerialRxCommand: serialCmdInput })
                              }
                              className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded cursor-pointer"
                            >
                              Send RX
                            </button>
                          </div>
                        </div>
                        {/* Mode & Upload Action Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1">
                            {(
                              [
                                { id: 'custom_code', label: 'Code IDE' },
                                { id: 'adc_threshold', label: 'ADC Alarm' },
                                { id: 'blink_pwm', label: 'PWM Clock' },
                                { id: 'sine_lut_dac', label: 'Sine DAC' },
                              ] as { id: McuProgramMode; label: string }[]
                            ).map((m) => (
                              <button
                                key={m.id}
                                onClick={() => handleUpdateSelected({ mcuProgram: m.id })}
                                className={`px-2 py-1 text-[10px] font-mono rounded border cursor-pointer ${
                                  (selectedComp.mcuProgram ?? 'custom_code') === m.id
                                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-semibold'
                                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>

                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".ino,.cpp,.c,.py,.js,.txt"
                            onChange={handleCodeFileUpload}
                            className="hidden"
                          />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-2.5 py-1 text-[10px] font-mono font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Upload .ino / .py File
                          </button>
                        </div>

                        {uploadFeedback && (
                          <div className="text-[11px] font-mono text-emerald-300 bg-emerald-950/50 border border-emerald-500/40 rounded px-2 py-1">
                            ✓ {uploadFeedback}
                          </div>
                        )}

                        {(selectedComp.mcuProgram ?? 'custom_code') === 'custom_code' ? (
                          <div className="space-y-1.5">
                            {/* Quick Code Snippet Switcher */}
                            <div className="flex items-center justify-between gap-1 text-[10px]">
                              <span className="text-slate-400 font-mono">Example Logic:</span>
                              <div className="flex gap-1">
                                {CODE_TEMPLATES.map((tpl) => (
                                  <button
                                    key={tpl.label}
                                    onClick={() =>
                                      handleUpdateSelected({
                                        mcuProgram: 'custom_code',
                                        mcuCustomCode: tpl.code,
                                      })
                                    }
                                    className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 rounded font-mono cursor-pointer"
                                  >
                                    {tpl.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Live Code Editor Textarea */}
                            <textarea
                              value={selectedComp.mcuCustomCode ?? CODE_TEMPLATES[0].code}
                              onChange={(e) =>
                                handleUpdateSelected({
                                  mcuProgram: 'custom_code',
                                  mcuCustomCode: e.target.value,
                                })
                              }
                              rows={7}
                              spellCheck={false}
                              placeholder="Write Arduino C++ (analogRead, digitalWrite, analogWrite, display.println) or MicroPython..."
                              className="w-full bg-[#07090E] border border-slate-700 focus:border-cyan-400 rounded-lg p-2.5 text-[11px] font-mono text-cyan-200 leading-relaxed outline-none resize-y"
                            />

                            <div className="text-[10px] font-mono text-slate-400">
                              API: <code className="text-slate-200">readDistance()</code>,{' '}
                              <code className="text-slate-200">readLight()</code>,{' '}
                              <code className="text-slate-200">analogRead(A0)</code>,{' '}
                              <code className="text-slate-200">digitalWrite(13, HIGH)</code>,{' '}
                              <code className="text-slate-200">analogWrite(9, 0..255)</code>,{' '}
                              <code className="text-slate-200">servo.write(0..180)</code>,{' '}
                              <code className="text-slate-200">display.println(...)</code>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="text-slate-300">PWM Duty</span>
                                <span className="font-mono text-cyan-400">
                                  {selectedComp.mcuPwmDuty ?? 60}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={5}
                                max={95}
                                step={5}
                                value={selectedComp.mcuPwmDuty ?? 60}
                                onChange={(e) =>
                                  handleUpdateSelected({ mcuPwmDuty: Number(e.target.value) })
                                }
                                className="w-full accent-cyan-400 cursor-pointer"
                              />
                            </div>
                            <div>
                              <div className="flex justify-between text-[11px] mb-1">
                                <span className="text-slate-300">Clock Freq</span>
                                <span className="font-mono text-amber-400">
                                  {selectedComp.mcuBlinkHz ?? 25} Hz
                                </span>
                              </div>
                              <input
                                type="range"
                                min={2}
                                max={80}
                                step={1}
                                value={selectedComp.mcuBlinkHz ?? 25}
                                onChange={(e) =>
                                  handleUpdateSelected({ mcuBlinkHz: Number(e.target.value) })
                                }
                                className="w-full accent-amber-400 cursor-pointer"
                              />
                            </div>
                          </div>
                        )}

                        {/* Live UART Serial Monitor & Pin Telemetry */}
                        {selectedRes.mcuTelemetry && (
                          <div className="bg-[#07090E] border border-slate-800 rounded-lg p-2.5 space-y-1.5 font-mono text-[11px]">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-800 pb-1">
                              <span>
                                ADC: {selectedRes.mcuTelemetry.adcRawCount}/
                                {selectedRes.mcuTelemetry.adcMaxCount} (
                                {selectedRes.mcuTelemetry.adcVoltage.toFixed(2)}V)
                              </span>
                              <span className="text-cyan-300">
                                DOUT: {selectedRes.mcuTelemetry.out1High ? 'HIGH' : 'LOW'} · PWM:{' '}
                                {selectedRes.mcuTelemetry.pwmDutyOut}%
                              </span>
                            </div>
                            <div
                              className={`rounded px-2 py-1 text-[10px] truncate ${
                                selectedRes.mcuTelemetry.codeError
                                  ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                                  : 'bg-slate-950 text-emerald-300 border border-slate-800'
                              }`}
                            >
                              &gt; {selectedRes.mcuTelemetry.serialLine}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* HC-SR04 ULTRASONIC SONAR DISTANCE SENSOR INSPECTOR */}
                    {selectedComp.type === 'ultrasonic_hcsr04' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">Obstacle Distance (cm)</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                handleModuleAction(selectedComp.id, 'toggle_radar_sweep')
                              }
                              className={`px-2 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${
                                selectedComp.radarAutoSweep
                                  ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-bold'
                                  : 'bg-slate-900 text-cyan-300 border-slate-700'
                              }`}
                            >
                              {selectedComp.radarAutoSweep ? '● Auto-Sweep ON' : '⟳ Auto-Sweep'}
                            </button>
                            <span className="font-mono text-cyan-400 font-bold tabular-nums">
                              {selectedRes.sensorValue ?? selectedComp.distanceCm ?? 65} cm
                            </span>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={2}
                          max={400}
                          step={1}
                          value={selectedComp.distanceCm ?? 65}
                          onChange={(e) =>
                            handleUpdateSelected({
                              distanceCm: Number(e.target.value),
                              value: Number(e.target.value),
                              radarAutoSweep: false,
                            })
                          }
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                        <div className="flex gap-1.5">
                          {[15, 45, 90, 180, 320].map((cm) => (
                            <button
                              key={cm}
                              onClick={() =>
                                handleUpdateSelected({
                                  distanceCm: cm,
                                  value: cm,
                                  radarAutoSweep: false,
                                })
                              }
                              className="flex-1 py-1 text-[10px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 cursor-pointer"
                            >
                              {cm}cm
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* DHT22 TEMPERATURE & HUMIDITY SENSOR INSPECTOR */}
                    {selectedComp.type === 'dht22_sensor' && (
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Temperature (°C)</span>
                            <span className="font-mono text-cyan-400 font-bold">
                              {selectedComp.tempC ?? 25} °C
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-10}
                            max={80}
                            step={1}
                            value={selectedComp.tempC ?? 25}
                            onChange={(e) =>
                              handleUpdateSelected({
                                tempC: Number(e.target.value),
                                value: Number(e.target.value),
                              })
                            }
                            className="w-full accent-cyan-400 cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Relative Humidity (%RH)</span>
                            <span className="font-mono text-amber-400 font-bold">
                              {selectedComp.humidityPct ?? 48}% RH
                            </span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={95}
                            step={1}
                            value={selectedComp.humidityPct ?? 48}
                            onChange={(e) =>
                              handleUpdateSelected({ humidityPct: Number(e.target.value) })
                            }
                            className="w-full accent-amber-400 cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    {/* 5V OPTO RELAY MODULE INSPECTOR */}
                    {selectedComp.type === 'relay_module' && (
                      <button
                        onClick={() => handleModuleAction(selectedComp.id, 'toggle_relay')}
                        className="w-full py-1.5 text-xs font-mono font-semibold bg-emerald-500/15 border border-emerald-500/50 text-emerald-300 rounded-lg hover:bg-emerald-500/25 transition-colors cursor-pointer"
                      >
                        Toggle Relay Contact ({selectedRes.relayClosed ? 'NO CLOSED' : 'NC OPEN'})
                      </button>
                    )}

                    {/* LDR PHOTORESISTOR AMBIENT LIGHT SENSOR INSPECTOR */}
                    {selectedComp.type === 'ldr_sensor' && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300">Ambient Illumination (lux)</span>
                          <span className="font-mono text-amber-400 font-bold tabular-nums">
                            {selectedComp.lightLux ?? 500} lux
                          </span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={1000}
                          step={10}
                          value={selectedComp.lightLux ?? 500}
                          onChange={(e) =>
                            handleUpdateSelected({
                              lightLux: Number(e.target.value),
                              value: Number(e.target.value),
                            })
                          }
                          className="w-full accent-amber-400 cursor-pointer"
                        />
                        <div className="flex gap-1.5">
                          {[50, 200, 500, 850].map((lx) => (
                            <button
                              key={lx}
                              onClick={() =>
                                handleUpdateSelected({ lightLux: lx, value: lx })
                              }
                              className="flex-1 py-1 text-[10px] font-mono bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-slate-300 cursor-pointer"
                            >
                              {lx} lx
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SSD1306 OLED DISPLAY INSPECTOR */}
                    {selectedComp.type === 'ssd1306_oled' && (
                      <div className="bg-[#030712] border border-cyan-500/40 rounded-lg p-3 font-mono space-y-1">
                        <div className="text-[10px] text-amber-300 font-bold border-b border-slate-800 pb-1">
                          {(selectedRes.oledDisplayLines?.[0] ?? 'SSD1306 128x64 OLED')}
                        </div>
                        <div className="text-xs text-cyan-300">
                          {selectedRes.oledDisplayLines?.[1] ?? 'Waiting for I2C data...'}
                        </div>
                        <div className="text-xs text-emerald-300">
                          {selectedRes.oledDisplayLines?.[2] ?? ''}
                        </div>
                      </div>
                    )}

                    {/* DC MOTOR & SERVO MOTOR INSPECTOR */}
                    {selectedComp.type === 'dc_motor' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">Armature Resistance</span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                handleModuleAction(selectedComp.id, 'toggle_motor_stall')
                              }
                              className={`px-2 py-0.5 text-[10px] font-mono rounded border cursor-pointer ${
                                selectedComp.motorStallLoad
                                  ? 'bg-rose-500 text-white border-rose-400 font-bold'
                                  : 'bg-slate-900 text-amber-300 border-slate-700'
                              }`}
                            >
                              {selectedComp.motorStallLoad ? '⚠ Stalled' : '⚙ Apply Stall Load'}
                            </button>
                            <span className="font-mono text-cyan-400">
                              {selectedComp.value} Ω · {Math.abs(selectedRes.motorRpm ?? 0)} RPM
                            </span>
                          </div>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={120}
                          step={2}
                          value={selectedComp.value}
                          onChange={(e) =>
                            handleUpdateSelected({ value: Number(e.target.value) })
                          }
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>
                    )}

                    {selectedComp.type === 'ne555_timer' && (
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Oscillator Frequency (f_OUT)</span>
                            <span className="font-mono text-cyan-400 tabular-nums">
                              {selectedComp.mcuBlinkHz ?? 25} Hz
                            </span>
                          </div>
                          <input
                            type="range"
                            min={2}
                            max={100}
                            step={1}
                            value={selectedComp.mcuBlinkHz ?? 25}
                            onChange={(e) =>
                              handleUpdateSelected({ mcuBlinkHz: Number(e.target.value) })
                            }
                            className="w-full accent-cyan-400 cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Output Duty Cycle (%)</span>
                            <span className="font-mono text-amber-400 tabular-nums">
                              {selectedComp.mcuPwmDuty ?? 50}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={10}
                            max={90}
                            step={5}
                            value={selectedComp.mcuPwmDuty ?? 50}
                            onChange={(e) =>
                              handleUpdateSelected({ mcuPwmDuty: Number(e.target.value) })
                            }
                            className="w-full accent-amber-400 cursor-pointer"
                          />
                        </div>
                      </div>
                    )}

                    {selectedComp.type === 'resistor' && (
                      <div className="space-y-2">
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
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-300">Wiper Position (%)</span>
                            <span className="font-mono text-cyan-400 tabular-nums">
                              {Math.round((selectedComp.wiperPosition ?? 0.5) * 100)}%
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
                      <div className="space-y-2">
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

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-xs font-mono tabular-nums">
                      <div className="bg-slate-900/80 border border-slate-800 rounded p-1.5">
                        <div className="text-[9px] text-slate-400">VOLTAGE</div>
                        <div className="font-bold text-slate-100">
                          {selectedRes.vDrop.toFixed(2)} V
                        </div>
                      </div>
                      <div className="bg-slate-900/80 border border-slate-800 rounded p-1.5">
                        <div className="text-[9px] text-slate-400">CURRENT</div>
                        <div className="font-bold text-cyan-400">
                          {(selectedRes.current * 1000).toFixed(2)} mA
                        </div>
                      </div>
                      <div className="bg-slate-900/80 border border-slate-800 rounded p-1.5">
                        <div className="text-[9px] text-slate-400">POWER</div>
                        <div className="font-bold text-amber-400">
                          {(selectedRes.power * 1000).toFixed(1)} mW
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-400">
                    Click any board, sensor, OLED, motor, or component on the schematic canvas to write code or tune parameters.
                  </div>
                )}
              </div>

              {/* Compact Active Circuit Formula Footer */}
              <div className="pt-2 mt-2 border-t border-slate-800 flex items-center justify-between gap-2 text-[11px]">
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
                    Verified Electronic & Microcontroller Reference Topologies
                  </h2>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Load any pre-calibrated Arduino Uno, Raspberry Pi Pico, ESP32, Sonar, OLED, or analog circuit into the live simulator.
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
                                  : comp.type === 'ultrasonic_hcsr04'
                                  ? `${comp.distanceCm ?? 65} cm`
                                  : comp.type === 'ldr_sensor'
                                  ? `${comp.lightLux ?? 500} lux`
                                  : comp.type === 'ssd1306_oled'
                                  ? '128×64 I2C'
                                  : comp.type === 'dc_motor'
                                  ? `${Math.abs(res?.motorRpm ?? 0)} RPM`
                                  : comp.type === 'servo_motor'
                                  ? `${res?.servoAngle ?? 90}°`
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
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      GitHub Pages CI/CD Workflow (.github/workflows/deploy.yml)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Configured with relative asset resolution (--base=./) for automatic GitHub Pages hosting on push to main.
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
