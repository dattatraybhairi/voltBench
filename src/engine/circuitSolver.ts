export type ComponentType =
  | 'dc_source'
  | 'ac_source'
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'diode'
  | 'led'
  | 'zener'
  | 'npn_bjt'
  | 'nmos'
  | 'opamp'
  | 'switch'
  | 'potentiometer'
  | 'voltmeter'
  | 'ammeter'
  | 'ground'
  | 'probe_ch1'
  | 'probe_ch2';

export type WaveformType = 'sine' | 'square' | 'triangle';

export type ComponentHealthStatus = 'nominal' | 'warning' | 'fault';

export interface TerminalSpec {
  name: string;
  x: number;
  y: number;
}

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  label: string;
  /** Grid coordinate of center or primary reference */
  x: number;
  y: number;
  /** Rotation in degrees: 0, 90, 180, 270 */
  rotation: 0 | 90 | 180 | 270;
  /** Primary value: V for sources, Ohms for R, Farads for C, Henries for L, Vz for Zener, Beta for BJT */
  value: number;
  /** Secondary parameters */
  frequency?: number; // Hz for AC source
  waveform?: WaveformType;
  dcOffset?: number;
  ledColor?: 'red' | 'emerald' | 'amber' | 'cyan';
  forwardVoltage?: number; // Vf for Diode / LED
  zenerVoltage?: number; // Vz for Zener
  bjtBeta?: number; // hFE current gain for NPN BJT (e.g. 100)
  mosfetVth?: number; // Vgs threshold for NMOS (e.g. 2.0V)
  mosfetKp?: number; // Transconductance parameter A/V^2
  opampSupplyV?: number; // +/- rail saturation voltage for Op-Amp (e.g. 12V)
  switchClosed?: boolean; // For SPST switch
  wiperPosition?: number; // 0.05 to 0.95 for potentiometer
  /** Ratings for real-time component verification */
  maxPowerW?: number; // e.g., 0.25W resistor
  maxCurrentA?: number; // e.g., 0.030A (30mA) for LED
  maxVoltageV?: number; // e.g., 25V for electrolytic capacitor
  tolerancePct?: number; // e.g., 1% or 5%
  /** Dynamic state across timesteps */
  prevVoltage?: number;
  prevCurrent?: number;
}

export interface WireSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ComponentSimulationResult {
  id: string;
  vDrop: number; // V(p1) - V(p2) or V_CE / V_DS / V_out
  vNode1: number;
  vNode2: number;
  vNode3?: number;
  current: number; // Amps flowing in primary path
  baseOrGateCurrent?: number;
  power: number; // Watts dissipated
  status: ComponentHealthStatus;
  statusMessage: string;
  loadRatio: number;
}

export interface CircuitSolution {
  nodeVoltages: Map<string, number>; // key: "x,y" -> Voltage
  componentResults: Map<string, ComponentSimulationResult>;
  wireCurrents: Map<string, number>;
  ch1Voltage: number | null;
  ch2Voltage: number | null;
  totalPowerW: number;
  hasGround: boolean;
  converged: boolean;
}

function rotateOffset(dx: number, dy: number, rotation: 0 | 90 | 180 | 270): { dx: number; dy: number } {
  if (rotation === 90) return { dx: -dy, dy: dx };
  if (rotation === 180) return { dx: -dx, dy: -dy };
  if (rotation === 270) return { dx: dy, dy: -dx };
  return { dx, dy };
}

/**
 * Returns the grid terminal coordinates and pin labels for any component.
 * - 1-terminal: ground, probe_ch1, probe_ch2 -> [(x,y)]
 * - 2-terminal: span +/- 2 grid units along rotation axis
 * - 3-terminal (npn_bjt, nmos): Base/Gate at (-2, 0), Collector/Drain at (+1, -2), Emitter/Source at (+1, +2)
 * - 3-terminal (opamp): IN+ at (-2, -1), IN- at (-2, +1), OUT at (+2, 0)
 */
export function getComponentTerminals(comp: CircuitComponent): TerminalSpec[] {
  if (comp.type === 'ground' || comp.type === 'probe_ch1' || comp.type === 'probe_ch2') {
    return [{ name: 'PIN', x: comp.x, y: comp.y }];
  }

  if (comp.type === 'npn_bjt' || comp.type === 'nmos') {
    const isBjt = comp.type === 'npn_bjt';
    const rawPins = [
      { name: isBjt ? 'B' : 'G', dx: -2, dy: 0 },
      { name: isBjt ? 'C' : 'D', dx: 1, dy: -2 },
      { name: isBjt ? 'E' : 'S', dx: 1, dy: 2 },
    ];
    return rawPins.map((p) => {
      const r = rotateOffset(p.dx, p.dy, comp.rotation);
      return { name: p.name, x: comp.x + r.dx, y: comp.y + r.dy };
    });
  }

  if (comp.type === 'opamp') {
    const rawPins = [
      { name: 'IN+', dx: -2, dy: -1 },
      { name: 'IN-', dx: -2, dy: 1 },
      { name: 'OUT', dx: 2, dy: 0 },
    ];
    return rawPins.map((p) => {
      const r = rotateOffset(p.dx, p.dy, comp.rotation);
      return { name: p.name, x: comp.x + r.dx, y: comp.y + r.dy };
    });
  }

  const span = 2;
  const p1 = rotateOffset(-span, 0, comp.rotation);
  const p2 = rotateOffset(span, 0, comp.rotation);
  return [
    { name: 'P1', x: comp.x + p1.dx, y: comp.y + p1.dy },
    { name: 'P2', x: comp.x + p2.dx, y: comp.y + p2.dy },
  ];
}

function pointKey(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`;
}

/**
 * Checks if integer grid point (px, py) lies strictly on an orthogonal or diagonal wire segment
 */
function isPointOnWire(px: number, py: number, w: WireSegment): boolean {
  const minX = Math.min(w.x1, w.x2);
  const maxX = Math.max(w.x1, w.x2);
  const minY = Math.min(w.y1, w.y2);
  const maxY = Math.max(w.y1, w.y2);
  if (px < minX || px > maxX || py < minY || py > maxY) return false;
  if (w.x1 === w.x2) return px === w.x1;
  if (w.y1 === w.y2) return py === w.y1;
  // Cross product check for collinearity
  return Math.abs((py - w.y1) * (w.x2 - w.x1) - (px - w.x1) * (w.y2 - w.y1)) === 0;
}

/**
 * Gaussian Elimination with partial pivoting for solving A * x = b
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, idx) => [...row, b[idx]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const absVal = Math.abs(M[row][col]);
      if (absVal > maxVal) {
        maxVal = absVal;
        maxRow = row;
      }
    }

    if (maxVal < 1e-14) {
      M[col][col] = 1e-12;
    } else if (maxRow !== col) {
      const tmp = M[col];
      M[col] = M[maxRow];
      M[maxRow] = tmp;
    }

    const pivot = M[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot;
      if (Math.abs(factor) > 0) {
        for (let k = col; k <= n; k++) {
          M[row][k] -= factor * M[col][k];
        }
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let col = row + 1; col < n; col++) {
      sum -= M[row][col] * x[col];
    }
    const diag = M[row][row];
    x[row] = Math.abs(diag) > 1e-15 ? sum / diag : 0;
  }
  return x;
}

/**
 * Computes the instantaneous voltage of an AC or DC source at simulation time t (seconds)
 */
export function getSourceInstantVoltage(comp: CircuitComponent, timeSec: number): number {
  if (comp.type === 'dc_source') {
    return comp.value;
  }
  if (comp.type === 'ac_source') {
    const freq = comp.frequency ?? 50;
    const offset = comp.dcOffset ?? 0;
    const amp = comp.value;
    const phase = (timeSec * freq) % 1;
    const waveform = comp.waveform ?? 'sine';
    if (waveform === 'sine') {
      return offset + amp * Math.sin(2 * Math.PI * freq * timeSec);
    } else if (waveform === 'square') {
      return offset + (phase < 0.5 ? amp : -amp);
    } else {
      const tri = phase < 0.25
        ? 4 * phase
        : phase < 0.75
        ? 2 - 4 * phase
        : -4 + 4 * phase;
      return offset + amp * tri;
    }
  }
  return 0;
}

/**
 * Solves a single time-step of the circuit using Modified Nodal Analysis (MNA)
 * with T-junction wire detection and active semiconductor convergence.
 */
export function solveCircuitStep(
  components: CircuitComponent[],
  wires: WireSegment[],
  timeSec: number,
  dt: number
): CircuitSolution {
  const parent = new Map<string, string>();
  const allPinCoords: Array<{ x: number; y: number }> = [];

  const find = (k: string): string => {
    let p = parent.get(k);
    if (!p) {
      parent.set(k, k);
      return k;
    }
    if (p !== k) {
      p = find(p);
      parent.set(k, p);
    }
    return p;
  };
  const union = (k1: string, k2: string) => {
    const r1 = find(k1);
    const r2 = find(k2);
    if (r1 !== r2) parent.set(r1, r2);
  };

  for (const w of wires) {
    const k1 = pointKey(w.x1, w.y1);
    const k2 = pointKey(w.x2, w.y2);
    find(k1);
    find(k2);
    union(k1, k2);
    allPinCoords.push({ x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
  }

  for (const comp of components) {
    const terms = getComponentTerminals(comp);
    for (const t of terms) {
      find(pointKey(t.x, t.y));
      allPinCoords.push({ x: t.x, y: t.y });
    }
  }

  // Automatic T-Junction continuity: if any terminal or wire endpoint lies along another wire segment, union them!
  for (const pt of allPinCoords) {
    const pk = pointKey(pt.x, pt.y);
    for (const w of wires) {
      if (isPointOnWire(pt.x, pt.y, w)) {
        union(pk, pointKey(w.x1, w.y1));
      }
    }
  }

  // Identify ground reference root
  const groundRoots = new Set<string>();
  for (const comp of components) {
    if (comp.type === 'ground') {
      const terms = getComponentTerminals(comp);
      groundRoots.add(find(pointKey(terms[0].x, terms[0].y)));
    }
  }

  const hasExplicitGround = groundRoots.size > 0;
  if (!hasExplicitGround) {
    const firstSource = components.find((c) => c.type === 'dc_source' || c.type === 'ac_source');
    if (firstSource) {
      const terms = getComponentTerminals(firstSource);
      groundRoots.add(find(pointKey(terms[1].x, terms[1].y)));
    } else if (components.length > 0) {
      const terms = getComponentTerminals(components[0]);
      groundRoots.add(find(pointKey(terms[0].x, terms[0].y)));
    }
  }

  // Assign integer indices 1..N to all non-ground electrical nodes
  const rootToNodeIndex = new Map<string, number>();
  let nextNodeIdx = 1;
  for (const k of parent.keys()) {
    const r = find(k);
    if (groundRoots.has(r)) {
      rootToNodeIndex.set(r, 0);
    } else if (!rootToNodeIndex.has(r)) {
      rootToNodeIndex.set(r, nextNodeIdx++);
    }
  }

  const numNodes = nextNodeIdx - 1;
  const voltageSources = components.filter(
    (c) => c.type === 'dc_source' || c.type === 'ac_source'
  );
  const numVSources = voltageSources.length;
  const matrixSize = numNodes + numVSources;

  // Nonlinear diode/zener state tracking
  const diodeStates = new Map<string, 'off' | 'forward' | 'zener'>();
  for (const c of components) {
    if (c.type === 'diode' || c.type === 'led' || c.type === 'zener') {
      const prevV = c.prevVoltage ?? 0;
      const vf = c.forwardVoltage ?? (c.type === 'led' ? 2.0 : 0.7);
      const vz = c.zenerVoltage ?? 5.1;
      if (prevV >= vf - 0.05) {
        diodeStates.set(c.id, 'forward');
      } else if (c.type === 'zener' && prevV <= -vz + 0.05) {
        diodeStates.set(c.id, 'zener');
      } else {
        diodeStates.set(c.id, 'off');
      }
    }
  }

  let solutionVec: number[] = new Array(matrixSize).fill(0);
  let converged = true;

  for (let iter = 0; iter < 8; iter++) {
    const A: number[][] = Array.from({ length: matrixSize }, () =>
      new Array(matrixSize).fill(0)
    );
    const b: number[] = new Array(matrixSize).fill(0);

    for (let i = 0; i < numNodes; i++) {
      A[i][i] += 1e-9;
    }

    const stampConductance = (n1: number, n2: number, g: number) => {
      if (n1 > 0) A[n1 - 1][n1 - 1] += g;
      if (n2 > 0) A[n2 - 1][n2 - 1] += g;
      if (n1 > 0 && n2 > 0) {
        A[n1 - 1][n2 - 1] -= g;
        A[n2 - 1][n1 - 1] -= g;
      }
    };

    const stampCurrentSource = (n1: number, n2: number, current: number) => {
      if (n1 > 0) b[n1 - 1] -= current;
      if (n2 > 0) b[n2 - 1] += current;
    };

    // Voltage-Controlled Current Source (VCCS): I flows from nOutPos -> nOutNeg equal to gm * (V(nCtrlPos) - V(nCtrlNeg))
    const stampVCCS = (
      nOutPos: number,
      nOutNeg: number,
      nCtrlPos: number,
      nCtrlNeg: number,
      gm: number
    ) => {
      if (nOutPos > 0 && nCtrlPos > 0) A[nOutPos - 1][nCtrlPos - 1] += gm;
      if (nOutPos > 0 && nCtrlNeg > 0) A[nOutPos - 1][nCtrlNeg - 1] -= gm;
      if (nOutNeg > 0 && nCtrlPos > 0) A[nOutNeg - 1][nCtrlPos - 1] -= gm;
      if (nOutNeg > 0 && nCtrlNeg > 0) A[nOutNeg - 1][nCtrlNeg - 1] += gm;
    };

    for (const comp of components) {
      if (comp.type === 'ground' || comp.type === 'probe_ch1' || comp.type === 'probe_ch2') {
        continue;
      }

      const terms = getComponentTerminals(comp);

      if (comp.type === 'npn_bjt') {
        // 3 terminals: [0]=Base, [1]=Collector, [2]=Emitter
        const nB = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const nC = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const nE = rootToNodeIndex.get(find(pointKey(terms[2].x, terms[2].y))) ?? 0;
        const vB = nB > 0 ? solutionVec[nB - 1] : 0;
        const vC = nC > 0 ? solutionVec[nC - 1] : 0;
        const vE = nE > 0 ? solutionVec[nE - 1] : 0;
        const vBE = iter === 0 ? (comp.prevVoltage ?? 0.65) : vB - vE;
        const vCE = vC - vE;
        const beta = comp.bjtBeta ?? (comp.value || 100);

        if (vBE >= 0.62) {
          // Base-Emitter forward conducting with input resistance r_pi = 150 Ohms
          const gBe = 1 / 150;
          stampConductance(nB, nE, gBe);
          stampCurrentSource(nB, nE, -gBe * 0.65);

          if (vCE > 0.2 || iter === 0) {
            // Active forward amplification: I_C = beta * I_B
            const gm = beta * gBe;
            stampVCCS(nC, nE, nB, nE, gm);
            stampCurrentSource(nC, nE, -gm * 0.65);
            stampConductance(nC, nE, 1 / 5000); // Early effect output resistance
          } else {
            // Saturation region: low R_CE_sat
            stampConductance(nC, nE, 1 / 12);
          }
        } else {
          stampConductance(nB, nE, 1e-8);
          stampConductance(nC, nE, 1e-8);
        }
        continue;
      }

      if (comp.type === 'nmos') {
        // 3 terminals: [0]=Gate, [1]=Drain, [2]=Source
        const nG = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const nD = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const nS = rootToNodeIndex.get(find(pointKey(terms[2].x, terms[2].y))) ?? 0;
        const vG = nG > 0 ? solutionVec[nG - 1] : 0;
        const vS = nS > 0 ? solutionVec[nS - 1] : 0;
        const vGS = iter === 0 ? (comp.prevVoltage ?? 2.5) : vG - vS;
        const vth = comp.mosfetVth ?? 2.0;

        // Insulated gate leakage
        stampConductance(nG, nS, 1e-9);
        if (vGS > vth) {
          // Conducting channel R_DS(on) inversely proportional to overdrive (V_GS - V_th)
          const overdrive = Math.min(10, vGS - vth);
          const rOn = Math.max(2.0, 40 / (1 + overdrive * 4));
          stampConductance(nD, nS, 1 / rOn);
        } else {
          stampConductance(nD, nS, 1e-8);
        }
        continue;
      }

      if (comp.type === 'opamp') {
        // 3 terminals: [0]=IN+, [1]=IN-, [2]=OUT
        const nPos = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const nNeg = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const nOut = rootToNodeIndex.get(find(pointKey(terms[2].x, terms[2].y))) ?? 0;
        // High input impedance (10 MOhm)
        stampConductance(nPos, nNeg, 1e-7);
        // High open-loop gain A_OL = 5000 with 10 Ohm output impedance modeled as Norton equivalent to ground
        const rOut = 10;
        const gOut = 1 / rOut;
        const gain = 5000;
        stampConductance(nOut, 0, gOut);
        stampVCCS(0, nOut, nPos, nNeg, gain * gOut);
        continue;
      }

      const n1 = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
      const n2 = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;

      if (comp.type === 'resistor') {
        const r = Math.max(0.01, comp.value);
        stampConductance(n1, n2, 1 / r);
      } else if (comp.type === 'voltmeter') {
        stampConductance(n1, n2, 1e-7); // 10 MΩ DMM input impedance
      } else if (comp.type === 'ammeter') {
        stampConductance(n1, n2, 1 / 0.01); // 10 mΩ current shunt
      } else if (comp.type === 'potentiometer') {
        const ratio = Math.max(0.01, Math.min(1, comp.wiperPosition ?? 0.5));
        const rEff = Math.max(0.5, comp.value * ratio);
        stampConductance(n1, n2, 1 / rEff);
      } else if (comp.type === 'switch') {
        const rSwitch = comp.switchClosed ? 0.005 : 1e9;
        stampConductance(n1, n2, 1 / rSwitch);
      } else if (comp.type === 'capacitor') {
        const cVal = Math.max(1e-12, comp.value);
        const gEq = cVal / Math.max(1e-6, dt);
        const vPrev = comp.prevVoltage ?? 0;
        stampConductance(n1, n2, gEq + 1e-9);
        stampCurrentSource(n1, n2, -gEq * vPrev);
      } else if (comp.type === 'inductor') {
        const lVal = Math.max(1e-6, comp.value);
        const gEq = Math.max(1e-6, dt) / lVal;
        const iPrev = comp.prevCurrent ?? 0;
        stampConductance(n1, n2, gEq);
        stampCurrentSource(n1, n2, iPrev);
      } else if (comp.type === 'diode' || comp.type === 'led' || comp.type === 'zener') {
        const state = diodeStates.get(comp.id) ?? 'off';
        const vf = comp.forwardVoltage ?? (comp.type === 'led' ? 2.0 : 0.7);
        const vz = comp.zenerVoltage ?? 5.1;
        const rOn = comp.type === 'led' ? 8.0 : 2.0;
        const gOn = 1 / rOn;
        const gOff = 1e-8;

        if (state === 'forward') {
          stampConductance(n1, n2, gOn);
          stampCurrentSource(n1, n2, -gOn * vf);
        } else if (state === 'zener' && comp.type === 'zener') {
          stampConductance(n1, n2, gOn);
          stampCurrentSource(n1, n2, gOn * vz);
        } else {
          stampConductance(n1, n2, gOff);
        }
      }
    }

    voltageSources.forEach((vs, idx) => {
      const terms = getComponentTerminals(vs);
      const nPos = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
      const nNeg = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
      const row = numNodes + idx;
      const vTarget = getSourceInstantVoltage(vs, timeSec);

      if (nPos > 0) {
        A[row][nPos - 1] += 1;
        A[nPos - 1][row] += 1;
      }
      if (nNeg > 0) {
        A[row][nNeg - 1] -= 1;
        A[nNeg - 1][row] -= 1;
      }
      A[row][row] -= 0.01;
      b[row] = vTarget;
    });

    const solved = solveLinearSystem(A, b);
    if (!solved) {
      converged = false;
      break;
    }
    solutionVec = solved;

    let stateChanged = false;
    for (const comp of components) {
      if (comp.type === 'diode' || comp.type === 'led' || comp.type === 'zener') {
        const terms = getComponentTerminals(comp);
        const n1 = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const n2 = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const v1 = n1 > 0 ? solutionVec[n1 - 1] : 0;
        const v2 = n2 > 0 ? solutionVec[n2 - 1] : 0;
        const vDrop = v1 - v2;

        const vf = comp.forwardVoltage ?? (comp.type === 'led' ? 2.0 : 0.7);
        const vz = comp.zenerVoltage ?? 5.1;
        const prevState = diodeStates.get(comp.id) ?? 'off';
        let nextState: 'off' | 'forward' | 'zener' = 'off';

        if (vDrop >= vf) {
          nextState = 'forward';
        } else if (comp.type === 'zener' && vDrop <= -vz) {
          nextState = 'zener';
        } else {
          nextState = 'off';
        }

        if (nextState !== prevState) {
          diodeStates.set(comp.id, nextState);
          stateChanged = true;
        }
      }
    }

    if (!stateChanged && iter >= 1) break;
  }

  // Build coordinate voltage map
  const nodeVoltages = new Map<string, number>();
  for (const k of parent.keys()) {
    const r = find(k);
    const idx = rootToNodeIndex.get(r) ?? 0;
    const v = idx > 0 ? solutionVec[idx - 1] : 0;
    nodeVoltages.set(k, Number.isFinite(v) ? v : 0);
  }

  // Also populate intermediate grid points on wires so hovering any point on a wire shows its voltage
  for (const w of wires) {
    const vWire = nodeVoltages.get(pointKey(w.x1, w.y1)) ?? 0;
    const steps = Math.max(Math.abs(w.x2 - w.x1), Math.abs(w.y2 - w.y1));
    for (let s = 0; s <= steps; s++) {
      const gx = Math.round(w.x1 + ((w.x2 - w.x1) * s) / Math.max(1, steps));
      const gy = Math.round(w.y1 + ((w.y2 - w.y1) * s) / Math.max(1, steps));
      nodeVoltages.set(pointKey(gx, gy), vWire);
    }
  }

  const componentResults = new Map<string, ComponentSimulationResult>();
  let totalPowerW = 0;
  let ch1Voltage: number | null = null;
  let ch2Voltage: number | null = null;

  for (const comp of components) {
    const terms = getComponentTerminals(comp);
    const k1 = pointKey(terms[0].x, terms[0].y);
    const v1 = nodeVoltages.get(k1) ?? 0;

    if (comp.type === 'ground') {
      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: 0,
        vNode1: 0,
        vNode2: 0,
        current: 0,
        power: 0,
        status: 'nominal',
        statusMessage: '0.00 V Reference',
        loadRatio: 0,
      });
      continue;
    }

    if (comp.type === 'probe_ch1') {
      ch1Voltage = v1;
      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: v1,
        vNode1: v1,
        vNode2: 0,
        current: 0,
        power: 0,
        status: 'nominal',
        statusMessage: `CH1: ${v1.toFixed(2)} V`,
        loadRatio: 0,
      });
      continue;
    }

    if (comp.type === 'probe_ch2') {
      ch2Voltage = v1;
      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: v1,
        vNode1: v1,
        vNode2: 0,
        current: 0,
        power: 0,
        status: 'nominal',
        statusMessage: `CH2: ${v1.toFixed(2)} V`,
        loadRatio: 0,
      });
      continue;
    }

    if (comp.type === 'npn_bjt') {
      const vB = v1;
      const vC = nodeVoltages.get(pointKey(terms[1].x, terms[1].y)) ?? 0;
      const vE = nodeVoltages.get(pointKey(terms[2].x, terms[2].y)) ?? 0;
      const vBE = vB - vE;
      const vCE = vC - vE;
      const beta = comp.bjtBeta ?? (comp.value || 100);
      const iB = vBE >= 0.62 ? (vBE - 0.65) / 150 : 0;
      const iC = vBE >= 0.62 ? (vCE > 0.2 ? Math.max(0, beta * iB) : vCE / 12) : 0;
      const power = Math.abs(vCE * iC) + Math.abs(vBE * iB);
      comp.prevVoltage = vBE;
      comp.prevCurrent = iC;
      totalPowerW += power;

      const maxP = comp.maxPowerW ?? 0.625;
      const status: ComponentHealthStatus = power > maxP ? 'fault' : power > maxP * 0.75 ? 'warning' : 'nominal';
      const region = vBE < 0.62 ? 'Cut-off' : vCE <= 0.25 ? 'Saturated Switch' : `Forward Active (β=${beta})`;

      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: vCE,
        vNode1: vB,
        vNode2: vC,
        vNode3: vE,
        current: iC,
        baseOrGateCurrent: iB,
        power,
        status,
        statusMessage: `${region} · I_C=${(iC * 1000).toFixed(1)}mA`,
        loadRatio: power / maxP,
      });
      continue;
    }

    if (comp.type === 'nmos') {
      const vG = v1;
      const vD = nodeVoltages.get(pointKey(terms[1].x, terms[1].y)) ?? 0;
      const vS = nodeVoltages.get(pointKey(terms[2].x, terms[2].y)) ?? 0;
      const vGS = vG - vS;
      const vDS = vD - vS;
      const vth = comp.mosfetVth ?? 2.0;
      let iD = 0;
      if (vGS > vth) {
        const overdrive = Math.min(10, vGS - vth);
        const rOn = Math.max(2.0, 40 / (1 + overdrive * 4));
        iD = vDS / rOn;
      }
      const power = Math.abs(vDS * iD);
      comp.prevVoltage = vGS;
      comp.prevCurrent = iD;
      totalPowerW += power;

      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: vDS,
        vNode1: vG,
        vNode2: vD,
        vNode3: vS,
        current: iD,
        power,
        status: power > 0.5 ? 'fault' : 'nominal',
        statusMessage: vGS > vth ? `Conducting (V_GS=${vGS.toFixed(2)}V)` : `Off (V_GS < ${vth}V)`,
        loadRatio: power / 0.5,
      });
      continue;
    }

    if (comp.type === 'opamp') {
      const vPos = v1;
      const vNeg = nodeVoltages.get(pointKey(terms[1].x, terms[1].y)) ?? 0;
      const vOut = nodeVoltages.get(pointKey(terms[2].x, terms[2].y)) ?? 0;
      const rail = comp.opampSupplyV ?? 12;
      const clampedOut = Math.max(-rail, Math.min(rail, vOut));
      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: clampedOut,
        vNode1: vPos,
        vNode2: vNeg,
        vNode3: clampedOut,
        current: (vPos - vNeg) * 0.001,
        power: 0.015,
        status: Math.abs(vOut) >= rail ? 'warning' : 'nominal',
        statusMessage: `V_out = ${clampedOut.toFixed(2)} V (ΔV_in = ${((vPos - vNeg) * 1000).toFixed(1)} mV)`,
        loadRatio: 0.1,
      });
      continue;
    }

    const k2 = pointKey(terms[1].x, terms[1].y);
    const v2 = nodeVoltages.get(k2) ?? 0;
    const vDrop = v1 - v2;
    let current = 0;

    if (comp.type === 'resistor') {
      current = vDrop / Math.max(0.01, comp.value);
    } else if (comp.type === 'voltmeter') {
      current = vDrop * 1e-7;
    } else if (comp.type === 'ammeter') {
      current = vDrop / 0.01;
    } else if (comp.type === 'potentiometer') {
      const ratio = Math.max(0.01, Math.min(1, comp.wiperPosition ?? 0.5));
      current = vDrop / Math.max(0.5, comp.value * ratio);
    } else if (comp.type === 'switch') {
      current = vDrop / (comp.switchClosed ? 0.005 : 1e9);
    } else if (comp.type === 'capacitor') {
      const cVal = Math.max(1e-12, comp.value);
      const gEq = cVal / Math.max(1e-6, dt);
      const vPrev = comp.prevVoltage ?? 0;
      current = gEq * (vDrop - vPrev);
      comp.prevVoltage = vDrop;
      comp.prevCurrent = current;
    } else if (comp.type === 'inductor') {
      const lVal = Math.max(1e-6, comp.value);
      const gEq = Math.max(1e-6, dt) / lVal;
      const iPrev = comp.prevCurrent ?? 0;
      current = iPrev + gEq * vDrop;
      comp.prevVoltage = vDrop;
      comp.prevCurrent = current;
    } else if (comp.type === 'diode' || comp.type === 'led' || comp.type === 'zener') {
      const state = diodeStates.get(comp.id) ?? 'off';
      const vf = comp.forwardVoltage ?? (comp.type === 'led' ? 2.0 : 0.7);
      const vz = comp.zenerVoltage ?? 5.1;
      const rOn = comp.type === 'led' ? 8.0 : 2.0;
      if (state === 'forward') {
        current = (vDrop - vf) / rOn;
      } else if (state === 'zener' && comp.type === 'zener') {
        current = (vDrop + vz) / rOn;
      } else {
        current = vDrop * 1e-8;
      }
      comp.prevVoltage = vDrop;
      comp.prevCurrent = current;
    } else if (comp.type === 'dc_source' || comp.type === 'ac_source') {
      const vsIdx = voltageSources.findIndex((v) => v.id === comp.id);
      if (vsIdx >= 0) {
        current = -(solutionVec[numNodes + vsIdx] ?? 0);
      }
    }

    const power = Math.abs(vDrop * current);
    if (comp.type !== 'dc_source' && comp.type !== 'ac_source') {
      totalPowerW += power;
    }

    let status: ComponentHealthStatus = 'nominal';
    let statusMessage = 'Nominal Operation';
    let loadRatio = 0;

    if (comp.type === 'resistor' || comp.type === 'potentiometer') {
      const maxP = comp.maxPowerW ?? 0.25;
      loadRatio = power / maxP;
      if (loadRatio > 1.0) {
        status = 'fault';
        statusMessage = `Over-Power Fault (${(power * 1000).toFixed(0)} mW > ${(maxP * 1000).toFixed(0)} mW max)`;
      } else if (loadRatio > 0.75) {
        status = 'warning';
        statusMessage = `High Thermal Load (${Math.round(loadRatio * 100)}% of ${maxP}W rating)`;
      } else {
        statusMessage = `Nominal (${Math.round(loadRatio * 100)}% of ${maxP}W rating)`;
      }
    } else if (comp.type === 'led') {
      const maxI = comp.maxCurrentA ?? 0.03;
      const absI = Math.abs(current);
      loadRatio = absI / maxI;
      if (current > maxI) {
        status = 'fault';
        statusMessage = `LED Burnout Risk (${(current * 1000).toFixed(1)} mA > ${(maxI * 1000).toFixed(0)} mA max)`;
      } else if (current > 0.022) {
        status = 'warning';
        statusMessage = `High Drive Current (${(current * 1000).toFixed(1)} mA)`;
      } else if (current > 0.001) {
        statusMessage = `Illuminated (${(current * 1000).toFixed(1)} mA forward)`;
      } else if (vDrop < -5.0) {
        status = 'warning';
        statusMessage = `Reverse Bias Stress (${vDrop.toFixed(1)} V < -5V PIV)`;
      } else {
        statusMessage = 'Cut-off (Below Vf threshold)';
      }
    } else if (comp.type === 'capacitor') {
      const maxV = comp.maxVoltageV ?? 25;
      loadRatio = Math.abs(vDrop) / maxV;
      if (loadRatio > 1.0) {
        status = 'fault';
        statusMessage = `Dielectric Breakdown (${Math.abs(vDrop).toFixed(1)}V > ${maxV}V rating)`;
      } else if (loadRatio > 0.8) {
        status = 'warning';
        statusMessage = `Near Voltage Limit (${Math.abs(vDrop).toFixed(1)}V / ${maxV}V)`;
      } else {
        statusMessage = `Charged to ${vDrop.toFixed(2)} V`;
      }
    } else if (comp.type === 'zener') {
      const maxP = comp.maxPowerW ?? 0.5;
      loadRatio = power / maxP;
      const vz = comp.zenerVoltage ?? 5.1;
      if (loadRatio > 1.0) {
        status = 'fault';
        statusMessage = `Zener Thermal Overload (${(power * 1000).toFixed(0)} mW > 500 mW)`;
      } else if (vDrop <= -vz + 0.05) {
        statusMessage = `Zener Regulating at ${Math.abs(vDrop).toFixed(2)} V`;
      } else if (vDrop >= 0.65) {
        statusMessage = `Forward Conducting (${vDrop.toFixed(2)} V)`;
      } else {
        statusMessage = 'Reverse Blocking';
      }
    } else if (comp.type === 'diode') {
      if (vDrop >= 0.6) {
        statusMessage = `Forward Conducting (${(current * 1000).toFixed(1)} mA)`;
      } else {
        statusMessage = `Reverse Blocking (${vDrop.toFixed(2)} V)`;
      }
    } else if (comp.type === 'voltmeter') {
      statusMessage = `DMM Reading: ${vDrop.toFixed(3)} V`;
    } else if (comp.type === 'ammeter') {
      statusMessage = `DMM Current: ${(current * 1000).toFixed(2)} mA`;
    } else if (comp.type === 'switch') {
      statusMessage = comp.switchClosed ? 'Switch Closed (Conducting)' : 'Switch Open (Isolated)';
    }

    componentResults.set(comp.id, {
      id: comp.id,
      vDrop,
      vNode1: v1,
      vNode2: v2,
      current,
      power,
      status,
      statusMessage,
      loadRatio,
    });
  }

  // Estimate wire currents for animated current flow particles
  const wireCurrents = new Map<string, number>();
  for (const w of wires) {
    const k1 = pointKey(w.x1, w.y1);
    const k2 = pointKey(w.x2, w.y2);
    let netCurrent = 0;

    for (const comp of components) {
      if (comp.type === 'ground' || comp.type === 'probe_ch1' || comp.type === 'probe_ch2') continue;
      const terms = getComponentTerminals(comp);
      const res = componentResults.get(comp.id);
      if (!res) continue;
      const tk0 = pointKey(terms[0].x, terms[0].y);
      const tk1 = terms[1] ? pointKey(terms[1].x, terms[1].y) : '';

      if (tk1 === k1 || tk0 === k2) {
        netCurrent += res.current;
      } else if (tk0 === k1 || tk1 === k2) {
        netCurrent -= res.current;
      }
    }

    if (Math.abs(netCurrent) < 1e-6) {
      const rWire = find(k1);
      for (const comp of components) {
        if (comp.type === 'ground' || comp.type === 'probe_ch1' || comp.type === 'probe_ch2') continue;
        const terms = getComponentTerminals(comp);
        const r0 = find(pointKey(terms[0].x, terms[0].y));
        const r1 = terms[1] ? find(pointKey(terms[1].x, terms[1].y)) : '';
        if (r0 === rWire || r1 === rWire) {
          const res = componentResults.get(comp.id);
          if (res && Math.abs(res.current) > Math.abs(netCurrent)) {
            netCurrent = r1 === rWire ? res.current : -res.current;
          }
        }
      }
    }

    wireCurrents.set(w.id, netCurrent);
  }

  return {
    nodeVoltages,
    componentResults,
    wireCurrents,
    ch1Voltage,
    ch2Voltage,
    totalPowerW,
    hasGround: hasExplicitGround,
    converged,
  };
}

/**
 * Formats engineering units cleanly (e.g., 4700 -> "4.70 kΩ", 0.00001 -> "10.0 μF")
 */
export function formatEngineeringUnit(value: number, unit: string, decimals = 2): string {
  if (!Number.isFinite(value)) return `0.00 ${unit}`;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs === 0) return `0.${'0'.repeat(decimals)} ${unit}`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(decimals)} M${unit}`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(decimals)} k${unit}`;
  if (abs >= 1) return `${sign}${abs.toFixed(decimals)} ${unit}`;
  if (abs >= 1e-3) return `${sign}${(abs * 1e3).toFixed(decimals)} m${unit}`;
  if (abs >= 1e-6) return `${sign}${(abs * 1e6).toFixed(decimals)} μ${unit}`;
  if (abs >= 1e-9) return `${sign}${(abs * 1e9).toFixed(decimals)} n${unit}`;
  return `${sign}${(abs * 1e12).toFixed(decimals)} p${unit}`;
}
