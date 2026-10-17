import React, { useState, useMemo } from 'react';
import { formatEngineeringUnit } from '../engine/circuitSolver';

type VerifierTab = 'iv_tracer' | 'resistor_decoder' | 'reactance_analyzer';

interface DiodeSpec {
  id: string;
  partNumber: string;
  category: string;
  vfNominal: number; // V at 10mA
  isSat: number; // Saturation current A
  nIdeality: number;
  vBreakdown: number; // Reverse breakdown V
  maxPowerW: number;
  maxCurrentA: number;
  colorHex: string;
}

const DIODE_MODELS: DiodeSpec[] = [
  {
    id: '1n4148',
    partNumber: '1N4148 Fast Switching Si',
    category: 'Silicon Signal Diode',
    vfNominal: 0.68,
    isSat: 2.5e-9,
    nIdeality: 1.75,
    vBreakdown: 75,
    maxPowerW: 0.5,
    maxCurrentA: 0.2,
    colorHex: '#06B6D4',
  },
  {
    id: '1n5819',
    partNumber: '1N5819 Schottky Barrier',
    category: 'Low-Drop Rectifier',
    vfNominal: 0.34,
    isSat: 1.2e-6,
    nIdeality: 1.15,
    vBreakdown: 40,
    maxPowerW: 1.0,
    maxCurrentA: 1.0,
    colorHex: '#38BDF8',
  },
  {
    id: 'bzx55c5v1',
    partNumber: 'BZX55C5V1 Zener (5.1V)',
    category: 'Voltage Reference Diode',
    vfNominal: 0.71,
    isSat: 1.0e-9,
    nIdeality: 1.7,
    vBreakdown: 5.1,
    maxPowerW: 0.5,
    maxCurrentA: 0.095,
    colorHex: '#F59E0B',
  },
  {
    id: 'bzx55c9v1',
    partNumber: 'BZX55C9V1 Zener (9.1V)',
    category: 'Voltage Reference Diode',
    vfNominal: 0.71,
    isSat: 1.0e-9,
    nIdeality: 1.7,
    vBreakdown: 9.1,
    maxPowerW: 0.5,
    maxCurrentA: 0.055,
    colorHex: '#FBBF24',
  },
  {
    id: 'led_red',
    partNumber: 'HLMP-EG08 AlInGaP Red LED',
    category: 'Optoelectronic Emitter (625 nm)',
    vfNominal: 1.85,
    isSat: 1e-18,
    nIdeality: 1.9,
    vBreakdown: 5.0,
    maxPowerW: 0.08,
    maxCurrentA: 0.03,
    colorHex: '#F43F5E',
  },
  {
    id: 'led_emerald',
    partNumber: 'InGaN True Green LED',
    category: 'Optoelectronic Emitter (525 nm)',
    vfNominal: 2.65,
    isSat: 1e-24,
    nIdeality: 2.1,
    vBreakdown: 5.0,
    maxPowerW: 0.1,
    maxCurrentA: 0.03,
    colorHex: '#10B981',
  },
];

const COLOR_BANDS = [
  { name: 'Black', digit: 0, mult: 1, tol: null, hex: '#1E293B', text: '#F8FAFC' },
  { name: 'Brown', digit: 1, mult: 10, tol: 1, hex: '#78350F', text: '#F8FAFC' },
  { name: 'Red', digit: 2, mult: 100, tol: 2, hex: '#DC2626', text: '#F8FAFC' },
  { name: 'Orange', digit: 3, mult: 1e3, tol: null, hex: '#EA580C', text: '#F8FAFC' },
  { name: 'Yellow', digit: 4, mult: 1e4, tol: null, hex: '#EAB308', text: '#0F172A' },
  { name: 'Green', digit: 5, mult: 1e5, tol: 0.5, hex: '#16A34A', text: '#F8FAFC' },
  { name: 'Blue', digit: 6, mult: 1e6, tol: 0.25, hex: '#2563EB', text: '#F8FAFC' },
  { name: 'Violet', digit: 7, mult: 1e7, tol: 0.1, hex: '#7C3AED', text: '#F8FAFC' },
  { name: 'Grey', digit: 8, mult: null, tol: 0.05, hex: '#64748B', text: '#F8FAFC' },
  { name: 'White', digit: 9, mult: null, tol: null, hex: '#F8FAFC', text: '#0F172A' },
  { name: 'Gold', digit: null, mult: 0.1, tol: 5, hex: '#D97706', text: '#0F172A' },
  { name: 'Silver', digit: null, mult: 0.01, tol: 10, hex: '#94A3B8', text: '#0F172A' },
];

export const ComponentVerifierBench: React.FC = () => {
  const [activeTab, setActiveTab] = useState<VerifierTab>('iv_tracer');

  // --- I-V Curve Tracer State ---
  const [selectedDiodeId, setSelectedDiodeId] = useState<string>('bzx55c5v1');
  const [testVoltage, setTestVoltage] = useState<number>(2.4);
  const [tempCelsius, setTempCelsius] = useState<number>(25);
  const [seriesResOhms, setSeriesResOhms] = useState<number>(220);

  // --- Resistor Decoder State ---
  const [bandCount, setBandCount] = useState<4 | 5>(4);
  const [b1, setB1] = useState<number>(4); // Yellow (4)
  const [b2, setB2] = useState<number>(7); // Violet (7)
  const [b3, setB3] = useState<number>(0); // Black (0) for 5-band
  const [bMult, setBMult] = useState<number>(2); // Red (x100) -> 4.7k
  const [bTol, setBTol] = useState<number>(1); // Brown (+/- 1%)
  const [measuredOhms, setMeasuredOhms] = useState<number>(4685);

  // --- Reactance & Filter Verifier State ---
  const [reactFreqHz, setReactFreqHz] = useState<number>(1000);
  const [reactCapUf, setReactCapUf] = useState<number>(0.47);
  const [reactIndMh, setReactIndMh] = useState<number>(47);
  const [reactResOhms, setReactResOhms] = useState<number>(100);

  const selectedDiode = useMemo(
    () => DIODE_MODELS.find((d) => d.id === selectedDiodeId) ?? DIODE_MODELS[0],
    [selectedDiodeId]
  );

  // Compute realistic diode current (in mA) as a function of applied voltage Vd and Temperature
  const computeDiodeCurrentMa = (vd: number, spec: DiodeSpec, tempC: number): number => {
    // Temperature shift: approx -2mV per degree C above 25C
    const deltaT = tempC - 25;
    const vfAdjusted = Math.max(0.15, spec.vfNominal - 0.002 * deltaT);
    const vzAdjusted = spec.vBreakdown + 0.0015 * deltaT;

    if (vd >= 0) {
      // Smooth exponential knee approaching vfAdjusted + dynamic series resistance
      const vKnee = vfAdjusted;
      const vt = 0.045 * spec.nIdeality;
      const iExp = 10 * Math.exp((vd - vKnee) / vt);
      // Softly transition to linear series bulk resistance at higher currents
      const iMa = iExp / (1 + iExp / 180);
      return Math.min(250, iMa);
    } else {
      // Reverse region
      const absV = Math.abs(vd);
      if (absV < vzAdjusted - 0.4) {
        return -0.005 * (absV / vzAdjusted); // Micro-leakage
      }
      const vOver = absV - vzAdjusted;
      const iZener = 12 * Math.exp(vOver / 0.08);
      return -Math.min(250, iZener / (1 + iZener / 180));
    }
  };

  // Generate SVG path points for the I-V Curve Tracer (-12V to +4V)
  const ivCurveData = useMemo(() => {
    const vMin = -12;
    const vMax = 4;
    const steps = 160;
    const points: Array<{ v: number; iMa: number }> = [];
    for (let idx = 0; idx <= steps; idx++) {
      const v = vMin + ((vMax - vMin) * idx) / steps;
      const iMa = computeDiodeCurrentMa(v, selectedDiode, tempCelsius);
      points.push({ v, iMa });
    }
    return points;
  }, [selectedDiode, tempCelsius]);

  const operatingPoint = useMemo(() => {
    // Solve operating point with series resistor or direct test voltage
    const iMa = computeDiodeCurrentMa(testVoltage, selectedDiode, tempCelsius);
    const powerMw = Math.abs(testVoltage * iMa);
    const maxPowerMw = selectedDiode.maxPowerW * 1000;
    const maxCurrMa = selectedDiode.maxCurrentA * 1000;
    const isOverCurrent = Math.abs(iMa) > maxCurrMa;
    const isOverPower = powerMw > maxPowerMw;

    let status: 'nominal' | 'warning' | 'fault' = 'nominal';
    let label = '● Nominal SOA';
    if (isOverCurrent || isOverPower) {
      status = 'fault';
      label = '✖ SOA Exceeded (Burnout Risk)';
    } else if (Math.abs(iMa) > maxCurrMa * 0.75 || powerMw > maxPowerMw * 0.75) {
      status = 'warning';
      label = '▲ High Thermal Stress';
    }
    return {
      v: testVoltage,
      iMa,
      powerMw,
      maxPowerMw,
      maxCurrMa,
      status,
      label,
      dynamicRd: Math.abs(iMa) > 0.1 ? Math.abs((testVoltage / (iMa / 1000))) : Infinity,
    };
  }, [testVoltage, selectedDiode, tempCelsius]);

  // Resistor Color Code calculation
  const resistorStats = useMemo(() => {
    const d1 = COLOR_BANDS[b1]?.digit ?? 0;
    const d2 = COLOR_BANDS[b2]?.digit ?? 0;
    const d3 = COLOR_BANDS[b3]?.digit ?? 0;
    const mult = COLOR_BANDS[bMult]?.mult ?? 1;
    const tol = COLOR_BANDS[bTol]?.tol ?? 5;

    const baseDigits = bandCount === 4 ? d1 * 10 + d2 : d1 * 100 + d2 * 10 + d3;
    const nominalOhms = baseDigits * mult;
    const minOhms = nominalOhms * (1 - tol / 100);
    const maxOhms = nominalOhms * (1 + tol / 100);
    const errorPct = nominalOhms > 0 ? ((measuredOhms - nominalOhms) / nominalOhms) * 100 : 0;
    const withinSpec = Math.abs(errorPct) <= tol;

    return {
      nominalOhms,
      minOhms,
      maxOhms,
      tol,
      errorPct,
      withinSpec,
    };
  }, [bandCount, b1, b2, b3, bMult, bTol, measuredOhms]);

  // Reactance & Resonance calculation
  const reactanceStats = useMemo(() => {
    const f = Math.max(1, reactFreqHz);
    const c = Math.max(1e-12, reactCapUf * 1e-6);
    const l = Math.max(1e-6, reactIndMh * 1e-3);
    const r = Math.max(0.1, reactResOhms);

    const xc = 1 / (2 * Math.PI * f * c);
    const xl = 2 * Math.PI * f * l;
    const xNet = xl - xc;
    const zTotal = Math.sqrt(r * r + xNet * xNet);
    const phaseDeg = (Math.atan2(xNet, r) * 180) / Math.PI;
    const fResonant = 1 / (2 * Math.PI * Math.sqrt(l * c));
    const qFactor = (1 / r) * Math.sqrt(l / c);

    return {
      xc,
      xl,
      xNet,
      zTotal,
      phaseDeg,
      fResonant,
      qFactor,
    };
  }, [reactFreqHz, reactCapUf, reactIndMh, reactResOhms]);

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar for Component Verifier Modes */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 tracking-tight">
            Real-Time Component Verification & Curve Tracer Bench
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Empirically test semiconductor I-V junctions, decode axial resistor tolerances, and verify reactive impedance profiles.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          <button
            onClick={() => setActiveTab('iv_tracer')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'iv_tracer'
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Semiconductor I-V Tracer
          </button>
          <button
            onClick={() => setActiveTab('resistor_decoder')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'resistor_decoder'
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Resistor Tolerance Verifier
          </button>
          <button
            onClick={() => setActiveTab('reactance_analyzer')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'reactance_analyzer'
                ? 'bg-cyan-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            RLC Impedance Analyzer
          </button>
        </div>
      </div>

      {/* TAB 1: SEMICONDUCTOR I-V CURVE TRACER */}
      {activeTab === 'iv_tracer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Parameter Deck */}
          <div className="lg:col-span-4 bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-5">
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Device Under Test (DUT)
                </label>
                <div className="space-y-1.5">
                  {DIODE_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedDiodeId(model.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center justify-between ${
                        selectedDiodeId === model.id
                          ? 'bg-slate-800/90 border-cyan-500/60 text-slate-100'
                          : 'bg-slate-900/50 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-100">{model.partNumber}</div>
                        <div className="text-[11px] text-slate-400">
                          {model.category} · Vf {model.vfNominal.toFixed(2)}V · Vbr {model.vBreakdown.toFixed(1)}V
                        </div>
                      </div>
                      <span className="text-xs font-mono text-cyan-400 tabular-nums">
                        {(model.maxPowerW * 1000).toFixed(0)} mW
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Test Voltage Slider */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Swept Junction Bias (V_D)</span>
                  <span className="font-mono font-semibold text-cyan-400 tabular-nums">
                    {testVoltage >= 0 ? `+${testVoltage.toFixed(2)}` : testVoltage.toFixed(2)} V
                  </span>
                </div>
                <input
                  type="range"
                  min={-11.5}
                  max={3.5}
                  step={0.05}
                  value={testVoltage}
                  onChange={(e) => setTestVoltage(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] font-mono text-slate-500">
                  <span>-11.5V (Reverse)</span>
                  <span>0.0V</span>
                  <span>+3.5V (Forward)</span>
                </div>
              </div>

              {/* Junction Temperature Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Junction Temperature (T_J)</span>
                  <span className="font-mono font-semibold text-amber-400 tabular-nums">
                    {tempCelsius} °C
                  </span>
                </div>
                <input
                  type="range"
                  min={-20}
                  max={110}
                  step={5}
                  value={tempCelsius}
                  onChange={(e) => setTempCelsius(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] font-mono text-slate-500">
                  <span>-20 °C</span>
                  <span>25 °C (Nominal)</span>
                  <span>+110 °C</span>
                </div>
              </div>

              {/* Series Current Limiting Resistor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">Load Line Resistor (R_LIMIT)</span>
                  <span className="font-mono font-semibold text-slate-200 tabular-nums">
                    {seriesResOhms} Ω
                  </span>
                </div>
                <input
                  type="range"
                  min={47}
                  max={1000}
                  step={10}
                  value={seriesResOhms}
                  onChange={(e) => setSeriesResOhms(parseInt(e.target.value, 10))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Safe Operating Area Diagnostic Readout */}
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Verification Status</span>
                <span
                  className={`font-mono font-semibold ${
                    operatingPoint.status === 'nominal'
                      ? 'text-emerald-400'
                      : operatingPoint.status === 'warning'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {operatingPoint.label}
                </span>
              </div>
              <div className="text-xs text-slate-400 leading-relaxed">
                Thermal drift shifts forward knee by <span className="font-mono text-slate-200">-2.0 mV/°C</span>.
                Current operating point dissipates{' '}
                <span className="font-mono text-slate-200 tabular-nums">
                  {operatingPoint.powerMw.toFixed(1)} mW
                </span>{' '}
                of <span className="font-mono text-slate-200 tabular-nums">{operatingPoint.maxPowerMw.toFixed(0)} mW</span> rated limit.
              </div>
            </div>
          </div>

          {/* Right I-V Curve Tracer Graph & Telemetry */}
          <div className="lg:col-span-8 bg-[#111827] border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Characteristic Curve: {selectedDiode.partNumber}
                </h3>
                <p className="text-xs text-slate-400">
                  Forward Conduction & Reverse Breakdown Trajectory at T_J = {tempCelsius} °C
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-[11px] text-slate-400">JUNCTION CURRENT (I_D)</div>
                  <div className="text-xl font-mono font-bold text-cyan-400 tabular-nums">
                    {operatingPoint.iMa.toFixed(2)} <span className="text-xs text-slate-400">mA</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">POWER DISSIPATION (P_D)</div>
                  <div className="text-xl font-mono font-bold text-amber-400 tabular-nums">
                    {operatingPoint.powerMw.toFixed(1)} <span className="text-xs text-slate-400">mW</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Coordinate SVG Graph */}
            <div className="relative flex-1 min-h-[340px] bg-[#0B0E17] border border-slate-800 rounded-lg overflow-hidden">
              <svg viewBox="0 0 720 340" className="w-full h-full select-none">
                {/* Grid lines */}
                {[-10, -8, -6, -4, -2, 0, 2].map((vTick) => {
                  const x = ((vTick - -12) / 16) * 660 + 40;
                  return (
                    <g key={`v-${vTick}`}>
                      <line
                        x1={x}
                        y1={20}
                        x2={x}
                        y2={300}
                        stroke={vTick === 0 ? '#475569' : '#1E293B'}
                        strokeWidth={vTick === 0 ? 1.5 : 1}
                      />
                      <text
                        x={x}
                        y={320}
                        textAnchor="middle"
                        className="fill-slate-500 text-[10px] font-mono"
                      >
                        {vTick}V
                      </text>
                    </g>
                  );
                })}
                {[-150, -100, -50, 0, 50, 100, 150].map((iTick) => {
                  const y = 160 - (iTick / 200) * 130;
                  return (
                    <g key={`i-${iTick}`}>
                      <line
                        x1={40}
                        y1={y}
                        x2={700}
                        y2={y}
                        stroke={iTick === 0 ? '#475569' : '#1E293B'}
                        strokeWidth={iTick === 0 ? 1.5 : 1}
                      />
                      <text
                        x={34}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-slate-500 text-[10px] font-mono"
                      >
                        {iTick}mA
                      </text>
                    </g>
                  );
                })}

                {/* Safe Operating Current Limit Bands */}
                {(() => {
                  const maxMa = Math.min(190, selectedDiode.maxCurrentA * 1000);
                  const yPos = 160 - (maxMa / 200) * 130;
                  const yNeg = 160 - (-maxMa / 200) * 130;
                  return (
                    <>
                      <line
                        x1={40}
                        y1={yPos}
                        x2={700}
                        y2={yPos}
                        stroke="#F43F5E"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                      />
                      <text x={695} y={yPos - 5} textAnchor="end" className="fill-rose-400 text-[10px] font-mono">
                        I_MAX (+{maxMa.toFixed(0)} mA)
                      </text>
                      <line
                        x1={40}
                        y1={yNeg}
                        x2={700}
                        y2={yNeg}
                        stroke="#F43F5E"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                      />
                    </>
                  );
                })()}

                {/* I-V Curve Polyline */}
                <polyline
                  fill="none"
                  stroke={selectedDiode.colorHex}
                  strokeWidth={2.5}
                  points={ivCurveData
                    .map((pt) => {
                      const x = ((pt.v - -12) / 16) * 660 + 40;
                      const clampedI = Math.max(-200, Math.min(200, pt.iMa));
                      const y = 160 - (clampedI / 200) * 130;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ')}
                />

                {/* Active Operating Point Crosshair */}
                {(() => {
                  const cx = ((operatingPoint.v - -12) / 16) * 660 + 40;
                  const clampedI = Math.max(-200, Math.min(200, operatingPoint.iMa));
                  const cy = 160 - (clampedI / 200) * 130;
                  return (
                    <g>
                      <line x1={cx} y1={20} x2={cx} y2={300} stroke="#06B6D4" strokeDasharray="2 3" strokeWidth={1} />
                      <line x1={40} y1={cy} x2={700} y2={cy} stroke="#06B6D4" strokeDasharray="2 3" strokeWidth={1} />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={operatingPoint.status === 'fault' ? '#F43F5E' : '#06B6D4'}
                        stroke="#0B0E17"
                        strokeWidth={2}
                      />
                      <rect
                        x={Math.min(545, Math.max(48, cx + 10))}
                        y={Math.max(25, Math.min(255, cy - 32))}
                        width={150}
                        height={38}
                        rx={4}
                        fill="#111827"
                        stroke="#334155"
                      />
                      <text
                        x={Math.min(545, Math.max(48, cx + 10)) + 8}
                        y={Math.max(25, Math.min(255, cy - 32)) + 15}
                        className="fill-slate-200 text-[10px] font-mono"
                      >
                        V_D: {operatingPoint.v.toFixed(2)} V
                      </text>
                      <text
                        x={Math.min(545, Math.max(48, cx + 10)) + 8}
                        y={Math.max(25, Math.min(255, cy - 32)) + 29}
                        className="fill-cyan-400 text-[10px] font-mono"
                      >
                        I_D: {operatingPoint.iMa.toFixed(2)} mA
                      </text>
                    </g>
                  );
                })()}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RESISTOR COLOR CODE & TOLERANCE VERIFIER */}
      {activeTab === 'resistor_decoder' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">Axial Band Configuration</h3>
              <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                <button
                  onClick={() => setBandCount(4)}
                  className={`px-2.5 py-1 text-xs font-mono rounded ${
                    bandCount === 4 ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400'
                  }`}
                >
                  4-Band
                </button>
                <button
                  onClick={() => setBandCount(5)}
                  className={`px-2.5 py-1 text-xs font-mono rounded ${
                    bandCount === 5 ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400'
                  }`}
                >
                  5-Band Precision
                </button>
              </div>
            </div>

            {/* Band Selectors */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">1st Significant Digit</label>
                <select
                  value={b1}
                  onChange={(e) => setB1(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
                >
                  {COLOR_BANDS.map((b, idx) =>
                    b.digit !== null && b.digit > 0 ? (
                      <option key={b.name} value={idx}>
                        {b.name} ({b.digit})
                      </option>
                    ) : null
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">2nd Significant Digit</label>
                <select
                  value={b2}
                  onChange={(e) => setB2(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
                >
                  {COLOR_BANDS.map((b, idx) =>
                    b.digit !== null ? (
                      <option key={b.name} value={idx}>
                        {b.name} ({b.digit})
                      </option>
                    ) : null
                  )}
                </select>
              </div>

              {bandCount === 5 && (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">3rd Significant Digit</label>
                  <select
                    value={b3}
                    onChange={(e) => setB3(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
                  >
                    {COLOR_BANDS.map((b, idx) =>
                      b.digit !== null ? (
                        <option key={b.name} value={idx}>
                          {b.name} ({b.digit})
                        </option>
                      ) : null
                    )}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1">Multiplier Band</label>
                <select
                  value={bMult}
                  onChange={(e) => setBMult(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
                >
                  {COLOR_BANDS.map((b, idx) =>
                    b.mult !== null ? (
                      <option key={b.name} value={idx}>
                        {b.name} (×{b.mult})
                      </option>
                    ) : null
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Tolerance Rating</label>
                <select
                  value={bTol}
                  onChange={(e) => setBTol(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono"
                >
                  {COLOR_BANDS.map((b, idx) =>
                    b.tol !== null ? (
                      <option key={b.name} value={idx}>
                        {b.name} (±{b.tol}%)
                      </option>
                    ) : null
                  )}
                </select>
              </div>
            </div>

            {/* Bench DMM Ohmmeter Verification Input */}
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Measured Bench Resistance (Ω)</span>
                <span className="font-mono text-cyan-400 tabular-nums">
                  {formatEngineeringUnit(measuredOhms, 'Ω')}
                </span>
              </div>
              <input
                type="number"
                value={measuredOhms}
                onChange={(e) => setMeasuredOhms(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-100"
              />
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-100 mb-1">
                Physical Package & Tolerance Window Verification
              </h3>
              <p className="text-xs text-slate-400">
                Compare decoded EIA color bands against actual DMM bench probe resistance.
              </p>
            </div>

            {/* SVG Axial Resistor Rendering */}
            <div className="my-6 bg-[#0B0E17] border border-slate-800 rounded-xl p-8 flex items-center justify-center">
              <svg viewBox="0 0 500 120" className="w-full max-w-lg h-28">
                {/* Leads */}
                <line x1={20} y1={60} x2={130} y2={60} stroke="#94A3B8" strokeWidth={6} strokeLinecap="round" />
                <line x1={370} y1={60} x2={480} y2={60} stroke="#94A3B8" strokeWidth={6} strokeLinecap="round" />
                {/* Ceramic Body */}
                <rect
                  x={120}
                  y={26}
                  width={260}
                  height={68}
                  rx={22}
                  fill="#334155"
                  stroke="#64748B"
                  strokeWidth={2}
                />
                {/* Color Bands */}
                <rect x={155} y={26} width={18} height={68} fill={COLOR_BANDS[b1]?.hex} />
                <rect x={195} y={26} width={18} height={68} fill={COLOR_BANDS[b2]?.hex} />
                {bandCount === 5 && (
                  <rect x={235} y={26} width={18} height={68} fill={COLOR_BANDS[b3]?.hex} />
                )}
                <rect
                  x={bandCount === 5 ? 275 : 245}
                  y={26}
                  width={18}
                  height={68}
                  fill={COLOR_BANDS[bMult]?.hex}
                />
                <rect x={330} y={26} width={20} height={68} fill={COLOR_BANDS[bTol]?.hex} />
              </svg>
            </div>

            {/* Quantitative Telemetry Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800">
              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3.5">
                <div className="text-[11px] text-slate-400 uppercase font-mono">NOMINAL VALUE</div>
                <div className="text-2xl font-mono font-bold text-slate-100 mt-1 tabular-nums">
                  {formatEngineeringUnit(resistorStats.nominalOhms, 'Ω')}
                </div>
                <div className="text-xs font-mono text-slate-400 mt-0.5">
                  ±{resistorStats.tol}% Tolerance Band
                </div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3.5">
                <div className="text-[11px] text-slate-400 uppercase font-mono">ACCEPTABLE BOUNDS</div>
                <div className="text-sm font-mono font-semibold text-slate-200 mt-1.5 tabular-nums">
                  Min: {formatEngineeringUnit(resistorStats.minOhms, 'Ω')}
                </div>
                <div className="text-sm font-mono font-semibold text-slate-200 mt-0.5 tabular-nums">
                  Max: {formatEngineeringUnit(resistorStats.maxOhms, 'Ω')}
                </div>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3.5">
                <div className="text-[11px] text-slate-400 uppercase font-mono">BENCH VERIFICATION</div>
                <div
                  className={`text-lg font-mono font-bold mt-1 tabular-nums ${
                    resistorStats.withinSpec ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {resistorStats.withinSpec ? '● PASS (In Spec)' : '✖ FAIL (Out of Spec)'}
                </div>
                <div className="text-xs font-mono text-slate-400 mt-0.5 tabular-nums">
                  Deviation: {resistorStats.errorPct >= 0 ? '+' : ''}
                  {resistorStats.errorPct.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: RLC IMPEDANCE & RESONANCE ANALYZER */}
      {activeTab === 'reactance_analyzer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
            <h3 className="text-base font-semibold text-slate-100">
              Reactive Network Parameters
            </h3>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Test Signal Frequency (f)</span>
                  <span className="font-mono text-cyan-400 tabular-nums">{reactFreqHz} Hz</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={5000}
                  step={10}
                  value={reactFreqHz}
                  onChange={(e) => setReactFreqHz(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Capacitance (C)</span>
                  <span className="font-mono text-cyan-400 tabular-nums">{reactCapUf.toFixed(2)} μF</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={10}
                  step={0.05}
                  value={reactCapUf}
                  onChange={(e) => setReactCapUf(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Inductance (L)</span>
                  <span className="font-mono text-amber-400 tabular-nums">{reactIndMh} mH</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={500}
                  step={1}
                  value={reactIndMh}
                  onChange={(e) => setReactIndMh(Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Series Resistance (R_ESR)</span>
                  <span className="font-mono text-slate-200 tabular-nums">{reactResOhms} Ω</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={1000}
                  step={5}
                  value={reactResOhms}
                  onChange={(e) => setReactResOhms(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-6">
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Phasor & Complex Impedance Readout
              </h3>
              <p className="text-xs text-slate-400">
                Real-time verification of inductive reactance (X_L), capacitive reactance (X_C), and resonant tank frequency (f_0).
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-mono text-slate-400">CAPACITIVE REACTANCE (X_C)</div>
                <div className="text-xl font-mono font-bold text-cyan-400 mt-1 tabular-nums">
                  {formatEngineeringUnit(reactanceStats.xc, 'Ω')}
                </div>
              </div>
              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-mono text-slate-400">INDUCTIVE REACTANCE (X_L)</div>
                <div className="text-xl font-mono font-bold text-amber-400 mt-1 tabular-nums">
                  {formatEngineeringUnit(reactanceStats.xl, 'Ω')}
                </div>
              </div>
              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-mono text-slate-400">TOTAL IMPEDANCE (|Z|)</div>
                <div className="text-xl font-mono font-bold text-slate-100 mt-1 tabular-nums">
                  {formatEngineeringUnit(reactanceStats.zTotal, 'Ω')}
                </div>
              </div>
              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-mono text-slate-400">RESONANT FREQUENCY (f_0)</div>
                <div className="text-xl font-mono font-bold text-emerald-400 mt-1 tabular-nums">
                  {reactanceStats.fResonant.toFixed(1)} Hz
                </div>
              </div>
              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-mono text-slate-400">PHASE ANGLE (θ)</div>
                <div className="text-xl font-mono font-bold text-slate-100 mt-1 tabular-nums">
                  {reactanceStats.phaseDeg >= 0 ? '+' : ''}
                  {reactanceStats.phaseDeg.toFixed(1)}°
                </div>
              </div>
              <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4">
                <div className="text-[11px] font-mono text-slate-400">QUALITY FACTOR (Q)</div>
                <div className="text-xl font-mono font-bold text-slate-100 mt-1 tabular-nums">
                  {reactanceStats.qFactor.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="bg-[#0B0E17] border border-slate-800 rounded-lg p-4 flex items-center justify-between text-xs">
              <span className="text-slate-400">Impedance Regime at {reactFreqHz} Hz:</span>
              <span className="font-mono font-semibold text-cyan-400">
                {Math.abs(reactanceStats.phaseDeg) < 5
                  ? '● Purely Resistive / Resonant Match'
                  : reactanceStats.phaseDeg > 0
                  ? '▲ Inductive Dominant (Current Lags Voltage)'
                  : '▲ Capacitive Dominant (Current Leads Voltage)'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
