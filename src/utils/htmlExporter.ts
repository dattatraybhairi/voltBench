import {
  CircuitComponent,
  WireSegment,
  CircuitSolution,
  formatEngineeringUnit,
} from '../engine/circuitSolver';

export const GITHUB_PAGES_WORKFLOW_YAML = `name: Deploy to GitHub Pages

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm install

      - name: Build static site with relative base for GitHub Pages
        run: npx vite build --base=./

      - name: Setup GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload build artifact (dist)
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4`;

export function generateStandaloneCircuitHtml(
  circuitTitle: string,
  components: CircuitComponent[],
  wires: WireSegment[],
  solution: CircuitSolution
): string {
  const bomRowsHtml = components
    .filter((c) => c.type !== 'ground' && c.type !== 'probe_ch1' && c.type !== 'probe_ch2')
    .map((c) => {
      const res = solution.componentResults.get(c.id);
      const vDrop = res ? `${res.vDrop.toFixed(2)} V` : '0.00 V';
      const curr = res ? `${(res.current * 1000).toFixed(2)} mA` : '0.00 mA';
      const pwr = res ? `${(res.power * 1000).toFixed(2)} mW` : '0.00 mW';
      const statusText = res ? res.statusMessage : 'Nominal';
      const statusColor =
        res?.status === 'fault'
          ? '#F43F5E'
          : res?.status === 'warning'
          ? '#F59E0B'
          : '#10B981';

      let specStr = '';
      if (c.type === 'resistor' || c.type === 'potentiometer') {
        specStr = formatEngineeringUnit(c.value, 'Ω');
      } else if (c.type === 'capacitor') {
        specStr = formatEngineeringUnit(c.value, 'F');
      } else if (c.type === 'inductor') {
        specStr = formatEngineeringUnit(c.value, 'H');
      } else if (c.type === 'dc_source') {
        specStr = `${c.value.toFixed(2)} V DC`;
      } else if (c.type === 'ac_source') {
        specStr = `${c.value.toFixed(1)} Vpk @ ${c.frequency ?? 50} Hz (${c.waveform ?? 'sine'})`;
      } else if (c.type === 'zener') {
        specStr = `Vz = ${c.zenerVoltage ?? 5.1} V`;
      } else if (c.type === 'led') {
        specStr = `Vf = ${c.forwardVoltage ?? 2.0} V (${c.ledColor ?? 'emerald'})`;
      } else if (c.type === 'diode') {
        specStr = `Vf = ${c.forwardVoltage ?? 0.7} V`;
      } else if (c.type === 'npn_bjt') {
        specStr = `β = ${c.bjtBeta ?? 100}`;
      } else if (c.type === 'nmos') {
        specStr = `Vth = ${c.mosfetVth ?? 2.0} V`;
      } else if (c.type === 'switch') {
        specStr = c.switchClosed ? 'Closed' : 'Open';
      }

      return `      <tr>
        <td class="mono">${c.label}</td>
        <td>${c.type.toUpperCase()}</td>
        <td class="mono">${specStr}</td>
        <td class="mono">${vDrop}</td>
        <td class="mono">${curr}</td>
        <td class="mono">${pwr}</td>
        <td class="mono" style="color: ${statusColor}">${statusText}</td>
      </tr>`;
    })
    .join('\n');

  const serializedCircuit = JSON.stringify({ components, wires }, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${circuitTitle} — VoltBench Standalone HTML Circuit Lab</title>
  <style>
    :root {
      --bg: #0B0E17;
      --panel: #111827;
      --border: #1E293B;
      --text: #F1F5F9;
      --muted: #94A3B8;
      --cyan: #06B6D4;
      --amber: #F59E0B;
      --emerald: #10B981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 24px;
      line-height: 1.5;
    }
    .container { max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
    header {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 16px; border-bottom: 1px solid var(--border);
    }
    h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
    .subtitle { font-size: 13px; color: var(--muted); }
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px;
    }
    .card-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text); }
    canvas, svg {
      width: 100%; background: #07090E; border: 1px solid var(--border); border-radius: 8px; display: block;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td {
      text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border);
    }
    th { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-variant-numeric: tabular-nums; }
    .controls { display: flex; flex-direction: column; gap: 12px; }
    .control-row { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
    .control-header { display: flex; justify-content: space-between; color: var(--muted); }
    input[type="range"] { width: 100%; accent-color: var(--cyan); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>${circuitTitle}</h1>
        <div class="subtitle">Standalone Interactive HTML Electronics Lab · Real-Time Nodal Telemetry</div>
      </div>
      <div class="mono" style="font-size: 13px; color: var(--cyan);">
        TOTAL POWER: ${(solution.totalPowerW * 1000).toFixed(2)} mW
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Interactive Schematic & Live Oscilloscope Trace</div>
        <canvas id="scopeCanvas" width="760" height="320"></canvas>
      </div>

      <div class="card">
        <div class="card-title">Live Parameter Tuning</div>
        <div class="controls">
          <div class="control-row">
            <div class="control-header">
              <span>Source Amplitude Scale</span>
              <span id="ampReadout" class="mono" style="color: var(--cyan)">100%</span>
            </div>
            <input id="ampSlider" type="range" min="20" max="200" value="100" />
          </div>
          <div class="control-row">
            <div class="control-header">
              <span>Sweep Frequency Multiplier</span>
              <span id="freqReadout" class="mono" style="color: var(--amber)">1.0x</span>
            </div>
            <input id="freqSlider" type="range" min="5" max="40" value="10" />
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Bill of Materials (BOM) & Real-Time Component Verification</div>
      <table>
        <thead>
          <tr>
            <th>Designator</th>
            <th>Component Type</th>
            <th>Nominal Rating</th>
            <th>Voltage Drop</th>
            <th>Branch Current</th>
            <th>Power Dissipation</th>
            <th>Verification Status</th>
          </tr>
        </thead>
        <tbody>
${bomRowsHtml}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    const CIRCUIT_DATA = ${serializedCircuit};
    const canvas = document.getElementById('scopeCanvas');
    const ctx = canvas.getContext('2d');
    const ampSlider = document.getElementById('ampSlider');
    const freqSlider = document.getElementById('freqSlider');
    const ampReadout = document.getElementById('ampReadout');
    const freqReadout = document.getElementById('freqReadout');

    let phase = 0;
    function renderLoop() {
      const ampScale = Number(ampSlider.value) / 100;
      const freqScale = Number(freqSlider.value) / 10;
      ampReadout.textContent = Math.round(ampScale * 100) + '%';
      freqReadout.textContent = freqScale.toFixed(1) + 'x';

      ctx.fillStyle = '#07090E';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw graticule grid
      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvas.width; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Draw CH1 (Cyan) and CH2 (Amber) traces
      const midY = canvas.height / 2;
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const t = (x / canvas.width) * Math.PI * 4 * freqScale + phase;
        const y = midY - Math.sin(t) * 85 * ampScale;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x++) {
        const t = (x / canvas.width) * Math.PI * 4 * freqScale + phase;
        const y = midY - Math.sin(t - 0.55) * 62 * ampScale;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      phase += 0.04 * freqScale;
      requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);
  </script>
</body>
</html>`;
}
