import React, { useState, useMemo } from 'react';

export interface ScopeSample {
  t: number;
  ch1: number;
  ch2: number;
}

interface OscilloscopeTrayProps {
  samples: ScopeSample[];
  isRunning: boolean;
  onToggleRun: () => void;
  onClearTrace: () => void;
}

export const OscilloscopeTray: React.FC<OscilloscopeTrayProps> = ({
  samples,
  isRunning,
  onToggleRun,
  onClearTrace,
}) => {
  const [voltsPerDiv, setVoltsPerDiv] = useState<number>(5);
  const [showCh1, setShowCh1] = useState<boolean>(true);
  const [showCh2, setShowCh2] = useState<boolean>(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const stats = useMemo(() => {
    if (samples.length === 0) {
      return {
        ch1Min: 0,
        ch1Max: 0,
        ch1Vpp: 0,
        ch1Rms: 0,
        ch2Min: 0,
        ch2Max: 0,
        ch2Vpp: 0,
        ch2Rms: 0,
      };
    }
    let ch1Min = Infinity;
    let ch1Max = -Infinity;
    let ch1SqSum = 0;
    let ch2Min = Infinity;
    let ch2Max = -Infinity;
    let ch2SqSum = 0;

    for (const s of samples) {
      if (s.ch1 < ch1Min) ch1Min = s.ch1;
      if (s.ch1 > ch1Max) ch1Max = s.ch1;
      ch1SqSum += s.ch1 * s.ch1;

      if (s.ch2 < ch2Min) ch2Min = s.ch2;
      if (s.ch2 > ch2Max) ch2Max = s.ch2;
      ch2SqSum += s.ch2 * s.ch2;
    }

    const n = samples.length;
    return {
      ch1Min,
      ch1Max,
      ch1Vpp: ch1Max - ch1Min,
      ch1Rms: Math.sqrt(ch1SqSum / n),
      ch2Min,
      ch2Max,
      ch2Vpp: ch2Max - ch2Min,
      ch2Rms: Math.sqrt(ch2SqSum / n),
    };
  }, [samples]);

  const width = 560;
  const height = 190;
  const midY = height / 2;
  const pxPerVolt = (height / 4) / voltsPerDiv;

  const ch1Points = useMemo(() => {
    if (samples.length < 2) return '';
    return samples
      .map((s, idx) => {
        const x = (idx / Math.max(1, samples.length - 1)) * width;
        const y = Math.max(5, Math.min(height - 5, midY - s.ch1 * pxPerVolt));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [samples, pxPerVolt]);

  const ch2Points = useMemo(() => {
    if (samples.length < 2) return '';
    return samples
      .map((s, idx) => {
        const x = (idx / Math.max(1, samples.length - 1)) * width;
        const y = Math.max(5, Math.min(height - 5, midY - s.ch2 * pxPerVolt));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [samples, pxPerVolt]);

  const activeSample =
    hoverIdx !== null && samples[hoverIdx]
      ? samples[hoverIdx]
      : samples[samples.length - 1];

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
      {/* Header & Scale Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-slate-100 whitespace-nowrap">
            Live Oscilloscope
          </h3>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded p-0.5 text-[11px] font-mono">
            {[2, 5, 10].map((vDiv) => (
              <button
                key={vDiv}
                onClick={() => setVoltsPerDiv(vDiv)}
                className={`px-1.5 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  voltsPerDiv === vDiv
                    ? 'bg-slate-700 text-slate-100 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {vDiv}V/d
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleRun}
            className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isRunning
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 hover:bg-amber-500/25'
                : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/25'
            }`}
          >
            {isRunning ? 'Pause' : 'Run'}
          </button>
          <button
            onClick={onClearTrace}
            className="px-2 py-1 text-[11px] font-medium text-slate-300 bg-slate-900 border border-slate-800 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Oscilloscope Graticule Canvas */}
      <div className="bg-[#07090E] border border-slate-800 rounded-lg overflow-hidden relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[175px] block cursor-crosshair"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setHoverIdx(Math.floor(ratio * Math.max(0, samples.length - 1)));
          }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((col) => (
            <line
              key={`v-${col}`}
              x1={(width / 10) * col}
              y1={0}
              x2={(width / 10) * col}
              y2={height}
              stroke="#1E293B"
              strokeWidth={1}
            />
          ))}
          {[1, 2, 3].map((row) => (
            <line
              key={`h-${row}`}
              x1={0}
              y1={(height / 4) * row}
              x2={width}
              y2={(height / 4) * row}
              stroke={row === 2 ? '#334155' : '#1E293B'}
              strokeWidth={row === 2 ? 1.5 : 1}
            />
          ))}

          <text x={6} y={midY - 4} className="fill-slate-500 text-[9px] font-mono">
            0V
          </text>
          <text x={6} y={12} className="fill-slate-500 text-[9px] font-mono">
            +{(voltsPerDiv * 2).toFixed(0)}V
          </text>
          <text x={6} y={height - 5} className="fill-slate-500 text-[9px] font-mono">
            -{(voltsPerDiv * 2).toFixed(0)}V
          </text>

          {showCh1 && ch1Points && (
            <polyline fill="none" stroke="#06B6D4" strokeWidth={2.2} points={ch1Points} />
          )}

          {showCh2 && ch2Points && (
            <polyline fill="none" stroke="#F59E0B" strokeWidth={2.2} points={ch2Points} />
          )}

          {hoverIdx !== null && samples.length > 1 && (
            <line
              x1={(hoverIdx / (samples.length - 1)) * width}
              y1={0}
              x2={(hoverIdx / (samples.length - 1)) * width}
              y2={height}
              stroke="#94A3B8"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          )}
        </svg>
      </div>

      {/* Compact Side-by-Side Channel Telemetry Strip */}
      <div className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
        <button
          onClick={() => setShowCh1((v) => !v)}
          className={`text-left p-2 rounded-lg border transition-colors cursor-pointer ${
            showCh1
              ? 'bg-cyan-500/10 border-cyan-500/40 text-slate-100'
              : 'bg-slate-900/50 border-slate-800 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-cyan-400">CH1 (IN)</span>
            <span className="font-bold text-slate-100">
              {activeSample ? activeSample.ch1.toFixed(2) : '0.00'}V
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {stats.ch1Vpp.toFixed(1)}Vpp · {stats.ch1Rms.toFixed(1)}Vrms
          </div>
        </button>

        <button
          onClick={() => setShowCh2((v) => !v)}
          className={`text-left p-2 rounded-lg border transition-colors cursor-pointer ${
            showCh2
              ? 'bg-amber-500/10 border-amber-500/40 text-slate-100'
              : 'bg-slate-900/50 border-slate-800 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-400">CH2 (OUT)</span>
            <span className="font-bold text-slate-100">
              {activeSample ? activeSample.ch2.toFixed(2) : '0.00'}V
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {stats.ch2Vpp.toFixed(1)}Vpp · {stats.ch2Rms.toFixed(1)}Vrms
          </div>
        </button>
      </div>
    </div>
  );
};
