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
  | 'arduino_uno'
  | 'esp32_devkit'
  | 'rpi_pico'
  | 'ne555_timer'
  | 'ultrasonic_hcsr04'
  | 'ldr_sensor'
  | 'dht22_sensor'
  | 'ssd1306_oled'
  | 'dc_motor'
  | 'servo_motor'
  | 'relay_module'
  | 'piezo_buzzer'
  | 'switch'
  | 'potentiometer'
  | 'voltmeter'
  | 'ammeter'
  | 'ground'
  | 'probe_ch1'
  | 'probe_ch2';

export type WaveformType = 'sine' | 'square' | 'triangle';

export type ComponentHealthStatus = 'nominal' | 'warning' | 'fault';

export type McuProgramMode =
  | 'custom_code'
  | 'adc_threshold'
  | 'blink_pwm'
  | 'input_follower'
  | 'sine_lut_dac';

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
  frequency?: number;
  waveform?: WaveformType;
  dcOffset?: number;
  ledColor?: 'red' | 'emerald' | 'amber' | 'cyan';
  forwardVoltage?: number;
  zenerVoltage?: number;
  bjtBeta?: number;
  mosfetVth?: number;
  mosfetKp?: number;
  opampSupplyV?: number;
  switchClosed?: boolean;
  wiperPosition?: number;
  /** Microcontroller & IC simulation properties */
  mcuProgram?: McuProgramMode;
  mcuPwmDuty?: number; // 0 to 100 (%)
  mcuBlinkHz?: number; // Blink / Clock frequency in Hz
  mcuAdcThresholdV?: number; // Voltage threshold on A0 / ADC34 / ADC26
  mcuCustomCode?: string;
  /** Interactive Sensor & Actuator parameters */
  distanceCm?: number; // 2 to 400 cm for HC-SR04 Ultrasonic Sensor
  lightLux?: number; // 10 to 1000 lux for LDR Photoresistor Sensor
  tempC?: number; // -20 to 85 C for DHT22 Temp/Humidity Sensor
  humidityPct?: number; // 0 to 100 %RH for DHT22 Sensor
  servoAngleDeg?: number; // 0 to 180 deg for SG90 Servo
  oledLines?: string[];
  /** Interactive Module-Based Hardware Actions */
  mcuBootButtonPressed?: boolean;
  mcuSerialRxCommand?: string;
  radarAutoSweep?: boolean;
  motorStallLoad?: boolean;
  /** Ratings for real-time component verification */
  maxPowerW?: number;
  maxCurrentA?: number;
  maxVoltageV?: number;
  tolerancePct?: number;
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

export interface McuTelemetry {
  vcc: number;
  adcVoltage: number;
  adcRawCount: number;
  adcMaxCount: number;
  digitalInVoltage: number;
  digitalInHigh: boolean;
  bootBtnHigh: boolean;
  out1Voltage: number;
  out1High: boolean;
  out2Voltage: number;
  pwmDutyOut: number;
  servoAngleOut?: number;
  oledLines: string[];
  serialLine: string;
  serialRxLast: string;
  clockCycles: number;
  uptimeMs: number;
  tempC: number;
  humidityPct: number;
  codeError?: string;
}

export interface ComponentSimulationResult {
  id: string;
  vDrop: number;
  vNode1: number;
  vNode2: number;
  vNode3?: number;
  current: number;
  baseOrGateCurrent?: number;
  power: number;
  status: ComponentHealthStatus;
  statusMessage: string;
  loadRatio: number;
  mcuTelemetry?: McuTelemetry;
  motorRpm?: number;
  servoAngle?: number;
  oledDisplayLines?: string[];
  sensorValue?: number;
  relayClosed?: boolean;
  buzzerFreqHz?: number;
}

export interface CircuitSolution {
  nodeVoltages: Map<string, number>;
  componentResults: Map<string, ComponentSimulationResult>;
  wireCurrents: Map<string, number>;
  ch1Voltage: number | null;
  ch2Voltage: number | null;
  totalPowerW: number;
  hasGround: boolean;
  converged: boolean;
}

function rotateOffset(
  dx: number,
  dy: number,
  rotation: 0 | 90 | 180 | 270
): { dx: number; dy: number } {
  if (rotation === 90) return { dx: -dy, dy: dx };
  if (rotation === 180) return { dx: -dx, dy: -dy };
  if (rotation === 270) return { dx: dy, dy: -dx };
  return { dx, dy };
}

/**
 * Returns the grid terminal coordinates and pin names for any component.
 */
export function getComponentTerminals(comp: CircuitComponent): TerminalSpec[] {
  if (comp.type === 'ground' || comp.type === 'probe_ch1' || comp.type === 'probe_ch2') {
    return [{ name: 'PIN', x: comp.x, y: comp.y }];
  }

  if (comp.type === 'arduino_uno') {
    const rawPins = [
      { name: '5V', dx: -3, dy: -2 },
      { name: 'A0', dx: -3, dy: 0 },
      { name: 'GND', dx: -3, dy: 2 },
      { name: 'D13', dx: 3, dy: -2 },
      { name: 'D9', dx: 3, dy: 0 },
      { name: 'D2', dx: 3, dy: 2 },
    ];
    return rawPins.map((p) => {
      const r = rotateOffset(p.dx, p.dy, comp.rotation);
      return { name: p.name, x: comp.x + r.dx, y: comp.y + r.dy };
    });
  }

  if (comp.type === 'esp32_devkit') {
    const rawPins = [
      { name: '3V3', dx: -3, dy: -2 },
      { name: 'ADC34', dx: -3, dy: 0 },
      { name: 'GND', dx: -3, dy: 2 },
      { name: 'IO2', dx: 3, dy: -2 },
      { name: 'IO4', dx: 3, dy: 0 },
      { name: 'IO15', dx: 3, dy: 2 },
    ];
    return rawPins.map((p) => {
      const r = rotateOffset(p.dx, p.dy, comp.rotation);
      return { name: p.name, x: comp.x + r.dx, y: comp.y + r.dy };
    });
  }

  if (comp.type === 'rpi_pico') {
    const rawPins = [
      { name: '3V3', dx: -3, dy: -2 },
      { name: 'ADC26', dx: -3, dy: 0 },
      { name: 'GND', dx: -3, dy: 2 },
      { name: 'GP15', dx: 3, dy: -2 },
      { name: 'GP16', dx: 3, dy: 0 },
      { name: 'GP14', dx: 3, dy: 2 },
    ];
    return rawPins.map((p) => {
      const r = rotateOffset(p.dx, p.dy, comp.rotation);
      return { name: p.name, x: comp.x + r.dx, y: comp.y + r.dy };
    });
  }

  if (comp.type === 'ne555_timer') {
    const rawPins = [
      { name: 'VCC', dx: -2, dy: -1 },
      { name: 'TRIG', dx: -2, dy: 1 },
      { name: 'OUT', dx: 2, dy: -1 },
      { name: 'GND', dx: 2, dy: 1 },
    ];
    return rawPins.map((p) => {
      const r = rotateOffset(p.dx, p.dy, comp.rotation);
      return { name: p.name, x: comp.x + r.dx, y: comp.y + r.dy };
    });
  }

  if (
    comp.type === 'ultrasonic_hcsr04' ||
    comp.type === 'ldr_sensor' ||
    comp.type === 'dht22_sensor'
  ) {
    const rawPins = [
      { name: 'VCC', dx: -2, dy: -1 },
      { name: 'OUT', dx: 2, dy: 0 },
      { name: 'GND', dx: -2, dy: 1 },
    ];
    return rawPins.map((p) => {
      const r = rotateOffset(p.dx, p.dy, comp.rotation);
      return { name: p.name, x: comp.x + r.dx, y: comp.y + r.dy };
    });
  }

  if (comp.type === 'ssd1306_oled') {
    const rawPins = [
      { name: 'VCC', dx: -2, dy: -1 },
      { name: 'SDA', dx: -2, dy: 1 },
      { name: 'GND', dx: 2, dy: 1 },
    ];
    return rawPins.map((p) => {
      const r = rotateOffset(p.dx, p.dy, comp.rotation);
      return { name: p.name, x: comp.x + r.dx, y: comp.y + r.dy };
    });
  }

  if (comp.type === 'servo_motor' || comp.type === 'relay_module') {
    const rawPins = [
      { name: 'VCC', dx: -2, dy: -1 },
      { name: comp.type === 'relay_module' ? 'IN' : 'PWM', dx: -2, dy: 1 },
      { name: 'GND', dx: 2, dy: 1 },
    ];
    return rawPins.map((p) => {
      const r = rotateOffset(p.dx, p.dy, comp.rotation);
      return { name: p.name, x: comp.x + r.dx, y: comp.y + r.dy };
    });
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

function isPointOnWire(px: number, py: number, w: WireSegment): boolean {
  const minX = Math.min(w.x1, w.x2);
  const maxX = Math.max(w.x1, w.x2);
  const minY = Math.min(w.y1, w.y2);
  const maxY = Math.max(w.y1, w.y2);
  if (px < minX || px > maxX || py < minY || py > maxY) return false;
  if (w.x1 === w.x2) return px === w.x1;
  if (w.y1 === w.y2) return py === w.y1;
  return Math.abs((py - w.y1) * (w.x2 - w.x1) - (px - w.x1) * (w.y2 - w.y1)) === 0;
}

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
      const tri =
        phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : -4 + 4 * phase;
      return offset + amp * tri;
    }
  }
  return 0;
}

interface CompiledFnCache {
  source: string;
  fn: ((api: Record<string, unknown>) => void) | null;
  error?: string;
}

const codeCache = new Map<string, CompiledFnCache>();

/**
 * Transpiles Arduino C++ (.ino) / MicroPython / JS user code into a sandboxed function
 * so users can write `analogRead(A0)`, `digitalWrite(13, HIGH)`, `analogWrite(9, 180)`,
 * `readDistance()`, `readLight()`, `display.println(...)`, `servo.write(90)`, `Serial.println(...)`.
 */
function compileUserMcuCode(rawCode: string): {
  fn: ((api: Record<string, unknown>) => void) | null;
  error?: string;
} {
  let js = rawCode;

  // Strip C++ #include / #define directives
  js = js.replace(/^\s*#include.*$/gm, '');
  js = js.replace(/^\s*#define\s+(\w+)\s+(.+)$/gm, 'const $1 = $2;');

  // Unwrap void setup() { ... } and void loop() { ... } into sequential top-level statements
  js = js.replace(/void\s+setup\s*\(\s*\)\s*\{([\s\S]*?)\}/g, '$1');
  js = js.replace(/void\s+loop\s*\(\s*\)\s*\{([\s\S]*?)\}/g, '$1');

  // Replace C/C++ typed variable declarations with `let`
  js = js.replace(
    /\b(unsigned\s+long|unsigned\s+int|int|float|double|long|bool|boolean|byte|uint8_t|uint16_t|String|auto)\s+(?=[a-zA-Z_]\w*\s*[=;])/g,
    'let '
  );

  // Support simple Python-style comments if lines start with #
  js = js.replace(/^\s*#(.*)$/gm, '//$1');

  try {
    const fn = new Function(
      'api',
      `with (api) {\n${js}\n}`
    ) as (api: Record<string, unknown>) => void;
    return { fn };
  } catch (err) {
    return {
      fn: null,
      error: err instanceof Error ? err.message : 'Syntax error in user code',
    };
  }
}

export interface McuEvalResult {
  vVcc: number;
  vOut1: number;
  vOut2: number;
  out1High: boolean;
  pwmDutyPct: number;
  servoAngle?: number;
  oledLines: string[];
  serialLine: string;
  codeError?: string;
}

function evaluateMcuBoard(
  comp: CircuitComponent,
  allComponents: CircuitComponent[],
  timeSec: number,
  vAdcIn: number,
  vDigIn: number
): McuEvalResult {
  const isArduino = comp.type === 'arduino_uno';
  const vVcc = isArduino ? 5.0 : 3.3;
  const adcMax = isArduino ? 1023 : 4095;
  const adcRaw = Math.max(0, Math.min(adcMax, Math.round((vAdcIn / vVcc) * adcMax)));
  const bootPressed = Boolean(comp.mcuBootButtonPressed);
  const digInHigh = bootPressed || vDigIn >= vVcc * 0.45;
  const serialRxCmd = comp.mcuSerialRxCommand ?? '';

  // Read live environment values from any Ultrasonic, LDR, or DHT22 sensor on the canvas
  const sonarComp = allComponents.find((c) => c.type === 'ultrasonic_hcsr04');
  const ldrComp = allComponents.find((c) => c.type === 'ldr_sensor');
  const dhtComp = allComponents.find((c) => c.type === 'dht22_sensor');

  const rawSonarCm = sonarComp?.radarAutoSweep
    ? Math.round(140 + 125 * Math.sin(timeSec * 3.5))
    : sonarComp?.distanceCm;

  const distanceCm =
    rawSonarCm ?? Math.max(2, Math.min(400, Math.round((vAdcIn / vVcc) * 400)));
  const lightLux =
    ldrComp?.lightLux ?? Math.max(0, Math.min(1000, Math.round((vAdcIn / vVcc) * 1000)));
  const tempC = dhtComp?.tempC ?? 24.5;
  const humidityPct = dhtComp?.humidityPct ?? 48;

  const prog = comp.mcuProgram ?? 'adc_threshold';
  const freq = Math.max(1, comp.mcuBlinkHz ?? 20);
  const defaultDutyPct = Math.max(0, Math.min(100, comp.mcuPwmDuty ?? 60));
  const thresh = comp.mcuAdcThresholdV ?? (isArduino ? 2.5 : 1.65);
  const phase = (timeSec * freq) % 1;

  // Custom Code Execution Mode
  if (prog === 'custom_code' && comp.mcuCustomCode && comp.mcuCustomCode.trim().length > 0) {
    const codeKey = comp.id;
    const cached = codeCache.get(codeKey);
    let compiled: { fn: ((api: Record<string, unknown>) => void) | null; error?: string };

    if (cached && cached.source === comp.mcuCustomCode) {
      compiled = { fn: cached.fn, error: cached.error };
    } else {
      compiled = compileUserMcuCode(comp.mcuCustomCode);
      codeCache.set(codeKey, {
        source: comp.mcuCustomCode,
        fn: compiled.fn,
        error: compiled.error,
      });
    }

    if (compiled.error || !compiled.fn) {
      return {
        vVcc,
        vOut1: 0,
        vOut2: 0,
        out1High: false,
        pwmDutyPct: 0,
        oledLines: ['COMPILE ERROR:', (compiled.error ?? 'Syntax error').slice(0, 20)],
        serialLine: `[Compile Error] ${compiled.error}`,
        codeError: compiled.error,
      };
    }

    let out1State: boolean | null = null;
    let out2Pwm255: number | null = null;
    let out2VoltageDirect: number | null = null;
    let servoDeg: number | undefined = undefined;
    const oledBuffer: string[] = [];
    let serialMsg = '';

    const api: Record<string, unknown> = {
      HIGH: 1,
      LOW: 0,
      INPUT: 0,
      OUTPUT: 1,
      LED_BUILTIN: 13,
      A0: 0,
      A1: 1,
      ADC34: 34,
      ADC26: 26,
      D13: 13,
      D9: 9,
      D2: 2,
      IO2: 2,
      IO4: 4,
      IO15: 15,
      GP15: 15,
      GP16: 16,
      GP14: 14,
      PI: Math.PI,
      sin: Math.sin,
      cos: Math.cos,
      abs: Math.abs,
      round: Math.round,
      min: Math.min,
      max: Math.max,
      map: (x: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
        ((x - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin,
      constrain: (x: number, a: number, b: number) => Math.max(a, Math.min(b, x)),
      millis: () => Math.round(timeSec * 1000),
      delay: () => {},
      pinMode: () => {},
      analogRead: () => adcRaw,
      digitalRead: () => (digInHigh ? 1 : 0),
      readButton: () => (digInHigh ? 1 : 0),
      readDistance: () => distanceCm,
      readUltrasonicCm: () => distanceCm,
      readLight: () => lightLux,
      readLightLux: () => lightLux,
      readTempC: () => tempC,
      readHumidity: () => humidityPct,
      readCommand: () => serialRxCmd,
      distance: distanceCm,
      lux: lightLux,
      temp: tempC,
      humidity: humidityPct,
      button: digInHigh ? 1 : 0,
      adc: adcRaw,
      voltage: Number(vAdcIn.toFixed(2)),
      digitalWrite: (pin: number, val: number | boolean) => {
        const isHigh = Boolean(val) && val !== 0;
        if (pin === 9 || pin === 4 || pin === 16) {
          out2Pwm255 = isHigh ? 255 : 0;
        } else {
          out1State = isHigh;
        }
      },
      analogWrite: (_pin: number, val: number) => {
        out2Pwm255 = Math.max(0, Math.min(255, Number(val) || 0));
      },
      ledcWrite: (_pin: number, val: number) => {
        out2Pwm255 = Math.max(0, Math.min(255, Number(val) || 0));
      },
      dacWrite: (_pin: number, val: number) => {
        const clamped = Math.max(0, Math.min(255, Number(val) || 0));
        out2VoltageDirect = (clamped / 255) * vVcc;
      },
      servoWrite: (deg: number) => {
        const clampedDeg = Math.max(0, Math.min(180, Number(deg) || 0));
        servoDeg = clampedDeg;
        out2VoltageDirect = (clampedDeg / 180) * vVcc;
      },
      servo: {
        attach: () => {},
        write: (deg: number) => {
          const clampedDeg = Math.max(0, Math.min(180, Number(deg) || 0));
          servoDeg = clampedDeg;
          out2VoltageDirect = (clampedDeg / 180) * vVcc;
        },
      },
      sonar: {
        ping_cm: () => distanceCm,
        read: () => distanceCm,
      },
      dht: {
        readTemperature: () => tempC,
        readHumidity: () => humidityPct,
      },
      display: {
        clearDisplay: () => {
          oledBuffer.length = 0;
        },
        setTextSize: () => {},
        setTextColor: () => {},
        setCursor: () => {},
        print: (msg: unknown) => {
          if (oledBuffer.length === 0) oledBuffer.push(String(msg));
          else oledBuffer[oledBuffer.length - 1] += String(msg);
        },
        println: (msg: unknown) => {
          oledBuffer.push(String(msg));
        },
        display: () => {},
      },
      oled: {
        fill: () => {
          oledBuffer.length = 0;
        },
        text: (msg: unknown) => {
          oledBuffer.push(String(msg));
        },
        show: () => {},
      },
      Serial: {
        begin: () => {},
        available: () => (serialRxCmd.length > 0 ? serialRxCmd.length : 0),
        readString: () => serialRxCmd,
        print: (msg: unknown) => {
          serialMsg += String(msg);
        },
        println: (msg: unknown) => {
          serialMsg = String(msg);
        },
      },
      print: (msg: unknown) => {
        serialMsg = String(msg);
        oledBuffer.push(String(msg));
      },
    };

    try {
      compiled.fn(api);
    } catch (runtimeErr) {
      const errMsg = runtimeErr instanceof Error ? runtimeErr.message : 'Runtime error';
      return {
        vVcc,
        vOut1: 0,
        vOut2: 0,
        out1High: false,
        pwmDutyPct: 0,
        oledLines: ['RUNTIME ERR:', errMsg.slice(0, 20)],
        serialLine: `[Runtime Error] ${errMsg}`,
        codeError: errMsg,
      };
    }

    const finalOut1High = out1State !== null ? out1State : vAdcIn >= thresh;
    const vOut1 = finalOut1High ? vVcc : 0;

    let pwmDutyPct = defaultDutyPct;
    let vOut2 = 0;
    if (out2VoltageDirect !== null) {
      vOut2 = out2VoltageDirect;
      pwmDutyPct = Math.round((out2VoltageDirect / vVcc) * 100);
    } else if (out2Pwm255 !== null) {
      pwmDutyPct = Math.round((out2Pwm255 / 255) * 100);
      // Output average analog/PWM voltage so connected DC motors, Servos, and LEDs respond smoothly,
      // while adding a subtle PWM ripple for oscilloscope visibility
      const dutyFrac = out2Pwm255 / 255;
      vOut2 = vVcc * dutyFrac;
    } else {
      vOut2 = phase < defaultDutyPct / 100 ? vVcc : 0;
    }

    const finalOledLines =
      oledBuffer.length > 0
        ? oledBuffer.slice(0, 4)
        : [
            `${comp.label} RUN`,
            `Dist: ${distanceCm}cm Lux:${lightLux}`,
            `ADC:${adcRaw} PWM:${pwmDutyPct}%`,
          ];

    const finalSerial =
      serialMsg.trim().length > 0
        ? `[Serial] ${serialMsg}`
        : `[Serial] ADC=${adcRaw} | Dist=${distanceCm}cm | OUT1=${
            finalOut1High ? 'HIGH' : 'LOW'
          } | PWM=${pwmDutyPct}%`;

    return {
      vVcc,
      vOut1,
      vOut2,
      out1High: finalOut1High,
      pwmDutyPct,
      servoAngle: servoDeg,
      oledLines: finalOledLines,
      serialLine: finalSerial,
    };
  }

  // Built-in Preset Modes
  const dutyFrac = Math.max(0.05, Math.min(0.95, defaultDutyPct / 100));
  const pwmWave = phase < dutyFrac ? vVcc : 0;
  const blinkWave = ((timeSec * (freq / 2)) % 1) < 0.5 ? vVcc : 0;

  if (prog === 'adc_threshold') {
    const out1High = vAdcIn >= thresh;
    const vOut1 = out1High ? vVcc : 0;
    const propV = Math.max(0, Math.min(vVcc, vAdcIn));
    return {
      vVcc,
      vOut1,
      vOut2: propV,
      out1High,
      pwmDutyPct: Math.round((propV / vVcc) * 100),
      oledLines: [
        `MODE: ADC THRESHOLD`,
        `In: ${vAdcIn.toFixed(2)}V (${adcRaw})`,
        `Dist:${distanceCm}cm ${out1High ? 'ALARM!' : 'OK'}`,
      ],
      serialLine: `[Serial] ADC=${adcRaw} (${vAdcIn.toFixed(2)}V) | Dist=${distanceCm}cm | OUT=${
        out1High ? 'HIGH' : 'LOW'
      }`,
    };
  }

  if (prog === 'input_follower') {
    return {
      vVcc,
      vOut1: digInHigh ? vVcc : 0,
      vOut2: digInHigh ? 0 : vVcc,
      out1High: digInHigh,
      pwmDutyPct: digInHigh ? 0 : 100,
      oledLines: [
        `MODE: PIN FOLLOWER`,
        `DIN: ${digInHigh ? 'HIGH' : 'LOW'} (${vDigIn.toFixed(1)}V)`,
        `DOUT: ${digInHigh ? 'ACTIVE' : 'IDLE'}`,
      ],
      serialLine: `[Serial] DIN=${digInHigh ? 'HIGH' : 'LOW'} -> DOUT=${
        digInHigh ? 'HIGH' : 'LOW'
      }`,
    };
  }

  if (prog === 'sine_lut_dac') {
    const sineVal = 0.5 + 0.48 * Math.sin(2 * Math.PI * freq * timeSec);
    return {
      vVcc,
      vOut1: phase < 0.5 ? vVcc : 0,
      vOut2: vVcc * sineVal,
      out1High: phase < 0.5,
      pwmDutyPct: Math.round(sineVal * 100),
      oledLines: [
        `MODE: SINE LUT DAC`,
        `Freq: ${freq} Hz`,
        `V_DAC: ${(vVcc * sineVal).toFixed(2)} V`,
      ],
      serialLine: `[Serial] DAC_SINE=${(vVcc * sineVal).toFixed(2)}V @ ${freq}Hz`,
    };
  }

  // Default 'blink_pwm'
  return {
    vVcc,
    vOut1: blinkWave,
    vOut2: pwmWave,
    out1High: blinkWave > vVcc * 0.5,
    pwmDutyPct: defaultDutyPct,
    oledLines: [
      `MODE: BLINK + PWM`,
      `PWM: ${defaultDutyPct}% @ ${freq}Hz`,
      `ADC: ${adcRaw} (${vAdcIn.toFixed(2)}V)`,
    ],
    serialLine: `[Serial] PWM=${defaultDutyPct}% @ ${freq}Hz | ADC=${adcRaw}`,
  };
}

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

    // Unify every integer grid point along the wire segment so any crossing wire or component terminal pin connects automatically
    const steps = Math.max(Math.abs(w.x2 - w.x1), Math.abs(w.y2 - w.y1));
    for (let s = 0; s <= steps; s++) {
      const gx = w.x1 + ((w.x2 - w.x1) * s) / Math.max(1, steps);
      const gy = w.y1 + ((w.y2 - w.y1) * s) / Math.max(1, steps);
      if (Math.abs(gx - Math.round(gx)) < 1e-4 && Math.abs(gy - Math.round(gy)) < 1e-4) {
        const gk = pointKey(Math.round(gx), Math.round(gy));
        find(gk);
        union(k1, gk);
      }
    }
  }

  for (const comp of components) {
    const terms = getComponentTerminals(comp);
    for (const t of terms) {
      find(pointKey(t.x, t.y));
      allPinCoords.push({ x: t.x, y: t.y });
    }
  }

  // T-Junction continuity for any pin lying on any wire segment
  for (const pt of allPinCoords) {
    const pk = pointKey(pt.x, pt.y);
    for (const w of wires) {
      if (isPointOnWire(pt.x, pt.y, w)) {
        union(pk, pointKey(w.x1, w.y1));
      }
    }
  }

  // Identify ground reference roots
  const groundRoots = new Set<string>();
  for (const comp of components) {
    if (comp.type === 'ground') {
      const terms = getComponentTerminals(comp);
      groundRoots.add(find(pointKey(terms[0].x, terms[0].y)));
    } else if (
      comp.type === 'arduino_uno' ||
      comp.type === 'esp32_devkit' ||
      comp.type === 'rpi_pico' ||
      comp.type === 'ultrasonic_hcsr04' ||
      comp.type === 'ldr_sensor' ||
      comp.type === 'ssd1306_oled' ||
      comp.type === 'servo_motor'
    ) {
      const terms = getComponentTerminals(comp);
      groundRoots.add(find(pointKey(terms[2].x, terms[2].y)));
    } else if (comp.type === 'ne555_timer') {
      const terms = getComponentTerminals(comp);
      groundRoots.add(find(pointKey(terms[3].x, terms[3].y)));
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

    const stampNortonDriver = (nPin: number, nRef: number, vTarget: number, rOut: number) => {
      const gOut = 1 / Math.max(0.1, rOut);
      stampConductance(nPin, nRef, gOut);
      stampCurrentSource(nRef, nPin, vTarget * gOut);
    };

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

      // --- ARDUINO UNO R3, ESP32 DEVKIT V1, & RASPBERRY PI PICO SIMULATION ---
      if (
        comp.type === 'arduino_uno' ||
        comp.type === 'esp32_devkit' ||
        comp.type === 'rpi_pico'
      ) {
        const nVcc = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const nAdc = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const nGnd = rootToNodeIndex.get(find(pointKey(terms[2].x, terms[2].y))) ?? 0;
        const nOut1 = rootToNodeIndex.get(find(pointKey(terms[3].x, terms[3].y))) ?? 0;
        const nOut2 = rootToNodeIndex.get(find(pointKey(terms[4].x, terms[4].y))) ?? 0;
        const nDigIn = rootToNodeIndex.get(find(pointKey(terms[5].x, terms[5].y))) ?? 0;

        const vGnd = nGnd > 0 ? solutionVec[nGnd - 1] : 0;
        const vAdcIn =
          iter === 0
            ? comp.prevVoltage ?? 0
            : (nAdc > 0 ? solutionVec[nAdc - 1] : 0) - vGnd;
        const vDigIn = (nDigIn > 0 ? solutionVec[nDigIn - 1] : 0) - vGnd;

        const evalRes = evaluateMcuBoard(comp, components, timeSec, vAdcIn, vDigIn);

        stampNortonDriver(nVcc, nGnd, evalRes.vVcc, 0.5);
        stampConductance(nAdc, nGnd, 1e-7);
        stampConductance(nDigIn, nGnd, 1e-6);
        stampNortonDriver(nOut1, nGnd, evalRes.vOut1, 20.0);
        stampNortonDriver(nOut2, nGnd, evalRes.vOut2, 20.0);
        continue;
      }

      // --- HC-SR04 ULTRASONIC SONAR, LDR LIGHT SENSOR, & DHT22 TEMP/HUMIDITY ---
      if (
        comp.type === 'ultrasonic_hcsr04' ||
        comp.type === 'ldr_sensor' ||
        comp.type === 'dht22_sensor'
      ) {
        // [0]=VCC, [1]=OUT, [2]=GND
        const nVcc = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const nOut = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const nGnd = rootToNodeIndex.get(find(pointKey(terms[2].x, terms[2].y))) ?? 0;

        const vVccNode = nVcc > 0 ? solutionVec[nVcc - 1] : 5.0;
        const activeSupply = vVccNode > 1.8 ? vVccNode : 5.0;

        let frac = 0.5;
        if (comp.type === 'ultrasonic_hcsr04') {
          const rawDist = comp.radarAutoSweep
            ? Math.round(140 + 125 * Math.sin(timeSec * 3.5))
            : comp.distanceCm ?? 45;
          const dist = Math.max(2, Math.min(400, rawDist));
          frac = dist / 400;
        } else if (comp.type === 'ldr_sensor') {
          const lux = Math.max(10, Math.min(1000, comp.lightLux ?? 450));
          frac = lux / 1000;
        } else {
          // DHT22 maps -20..80C to 0..1 of activeSupply
          const tC = Math.max(-20, Math.min(80, comp.tempC ?? 25));
          frac = (tC + 20) / 100;
        }

        const vSensorOut = activeSupply * frac;
        stampConductance(nVcc, nGnd, 1 / 2500);
        stampNortonDriver(nOut, nGnd, vSensorOut, 50.0);
        continue;
      }

      // --- SSD1306 128x64 I2C OLED DISPLAY, SG90 SERVO MOTOR, & 5V RELAY MODULE ---
      if (
        comp.type === 'ssd1306_oled' ||
        comp.type === 'servo_motor' ||
        comp.type === 'relay_module'
      ) {
        const nVcc = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const nSig = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const nGnd = rootToNodeIndex.get(find(pointKey(terms[2].x, terms[2].y))) ?? 0;
        stampConductance(nVcc, nGnd, 1 / (comp.type === 'servo_motor' ? 180 : 1200));
        stampConductance(nSig, nGnd, 1 / (comp.type === 'relay_module' ? 470 : 10000));
        continue;
      }

      // --- NE555 PRECISION TIMER IC ---
      if (comp.type === 'ne555_timer') {
        const nVcc = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const nTrig = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const nOut = rootToNodeIndex.get(find(pointKey(terms[2].x, terms[2].y))) ?? 0;
        const nGnd = rootToNodeIndex.get(find(pointKey(terms[3].x, terms[3].y))) ?? 0;

        const vVccNode = nVcc > 0 ? solutionVec[nVcc - 1] : 9.0;
        const supplyV = vVccNode > 1.5 ? vVccNode : 9.0;
        const freq = Math.max(1, comp.mcuBlinkHz ?? comp.frequency ?? 25);
        const duty = Math.max(0.05, Math.min(0.95, (comp.mcuPwmDuty ?? 50) / 100));
        const phase = (timeSec * freq) % 1;
        const vOutTarget = phase < duty ? supplyV : 0;

        stampConductance(nVcc, nGnd, 1 / 2000);
        stampConductance(nTrig, nGnd, 1e-6);
        stampNortonDriver(nOut, nGnd, vOutTarget, 15.0);
        continue;
      }

      if (comp.type === 'npn_bjt') {
        const nB = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const nC = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const nE = rootToNodeIndex.get(find(pointKey(terms[2].x, terms[2].y))) ?? 0;
        const vB = nB > 0 ? solutionVec[nB - 1] : 0;
        const vC = nC > 0 ? solutionVec[nC - 1] : 0;
        const vE = nE > 0 ? solutionVec[nE - 1] : 0;
        const vBE = iter === 0 ? comp.prevVoltage ?? 0.65 : vB - vE;
        const vCE = vC - vE;
        const beta = comp.bjtBeta ?? (comp.value || 100);

        if (vBE >= 0.62) {
          const gBe = 1 / 150;
          stampConductance(nB, nE, gBe);
          stampCurrentSource(nB, nE, -gBe * 0.65);

          if (vCE > 0.2 || iter === 0) {
            const gm = beta * gBe;
            stampVCCS(nC, nE, nB, nE, gm);
            stampCurrentSource(nC, nE, -gm * 0.65);
            stampConductance(nC, nE, 1 / 5000);
          } else {
            stampConductance(nC, nE, 1 / 12);
          }
        } else {
          stampConductance(nB, nE, 1e-8);
          stampConductance(nC, nE, 1e-8);
        }
        continue;
      }

      if (comp.type === 'nmos') {
        const nG = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const nD = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const nS = rootToNodeIndex.get(find(pointKey(terms[2].x, terms[2].y))) ?? 0;
        const vG = nG > 0 ? solutionVec[nG - 1] : 0;
        const vS = nS > 0 ? solutionVec[nS - 1] : 0;
        const vGS = iter === 0 ? comp.prevVoltage ?? 2.5 : vG - vS;
        const vth = comp.mosfetVth ?? 2.0;

        stampConductance(nG, nS, 1e-9);
        if (vGS > vth) {
          const overdrive = Math.min(10, vGS - vth);
          const rOn = Math.max(2.0, 40 / (1 + overdrive * 4));
          stampConductance(nD, nS, 1 / rOn);
        } else {
          stampConductance(nD, nS, 1e-8);
        }
        continue;
      }

      if (comp.type === 'opamp') {
        const nPos = rootToNodeIndex.get(find(pointKey(terms[0].x, terms[0].y))) ?? 0;
        const nNeg = rootToNodeIndex.get(find(pointKey(terms[1].x, terms[1].y))) ?? 0;
        const nOut = rootToNodeIndex.get(find(pointKey(terms[2].x, terms[2].y))) ?? 0;
        stampConductance(nPos, nNeg, 1e-7);
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
      } else if (comp.type === 'dc_motor') {
        // DC Geared Hobby Motor armature resistance (default 36 Ohms, drops to 9 Ohms under stall)
        const baseR = Math.max(5, comp.value || 36);
        const rArmature = comp.motorStallLoad ? baseR * 0.25 : baseR;
        stampConductance(n1, n2, 1 / rArmature);
      } else if (comp.type === 'piezo_buzzer') {
        stampConductance(n1, n2, 1 / 320);
      } else if (comp.type === 'voltmeter') {
        stampConductance(n1, n2, 1e-7);
      } else if (comp.type === 'ammeter') {
        stampConductance(n1, n2, 1 / 0.01);
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

  const nodeVoltages = new Map<string, number>();
  for (const k of parent.keys()) {
    const r = find(k);
    const idx = rootToNodeIndex.get(r) ?? 0;
    const v = idx > 0 ? solutionVec[idx - 1] : 0;
    nodeVoltages.set(k, Number.isFinite(v) ? v : 0);
  }

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
  let latestMcuOledLines: string[] | null = null;
  let latestMcuServoAngle: number | undefined = undefined;

  // First pass: evaluate MCU boards so OLED displays and Servos can use MCU telemetry
  for (const comp of components) {
    if (
      comp.type === 'arduino_uno' ||
      comp.type === 'esp32_devkit' ||
      comp.type === 'rpi_pico'
    ) {
      const terms = getComponentTerminals(comp);
      const isArduino = comp.type === 'arduino_uno';
      const vVccPin = nodeVoltages.get(pointKey(terms[0].x, terms[0].y)) ?? (isArduino ? 5.0 : 3.3);
      const vAdcPin = nodeVoltages.get(pointKey(terms[1].x, terms[1].y)) ?? 0;
      const vGndPin = nodeVoltages.get(pointKey(terms[2].x, terms[2].y)) ?? 0;
      const vOut1Pin = nodeVoltages.get(pointKey(terms[3].x, terms[3].y)) ?? 0;
      const vOut2Pin = nodeVoltages.get(pointKey(terms[4].x, terms[4].y)) ?? 0;
      const vDigInPin = nodeVoltages.get(pointKey(terms[5].x, terms[5].y)) ?? 0;

      const vAdcRel = vAdcPin - vGndPin;
      const vDigRel = vDigInPin - vGndPin;
      comp.prevVoltage = vAdcRel;

      const evalRes = evaluateMcuBoard(comp, components, timeSec, vAdcRel, vDigRel);
      latestMcuOledLines = evalRes.oledLines;
      if (evalRes.servoAngle !== undefined) {
        latestMcuServoAngle = evalRes.servoAngle;
      }

      const iOut1 = (evalRes.vOut1 - (vOut1Pin - vGndPin)) / 20.0;
      const iOut2 = (evalRes.vOut2 - (vOut2Pin - vGndPin)) / 20.0;
      const totalPinCurr = Math.abs(iOut1) + Math.abs(iOut2);
      const power = evalRes.vVcc * (0.015 + totalPinCurr);
      totalPowerW += power;

      const adcMaxCount = isArduino ? 1023 : 4095;
      const adcRawCount = Math.max(
        0,
        Math.min(adcMaxCount, Math.round((vAdcRel / evalRes.vVcc) * adcMaxCount))
      );

      let status: ComponentHealthStatus = 'nominal';
      let statusMessage = `${
        comp.type === 'rpi_pico'
          ? 'RP2040 3.3V'
          : isArduino
          ? 'ATmega328P 5V'
          : 'ESP32 3.3V'
      } · ADC=${adcRawCount}`;

      if (evalRes.codeError) {
        status = 'warning';
        statusMessage = `Code Error: ${evalRes.codeError}`;
      } else if (!isArduino && vAdcRel > 3.6) {
        status = 'fault';
        statusMessage = `3.3V Pin Over-Voltage Fault! (${vAdcRel.toFixed(2)}V > 3.6V max)`;
      } else if (isArduino && vAdcRel > 5.5) {
        status = 'fault';
        statusMessage = `Arduino 5V Pin Over-Voltage Fault! (${vAdcRel.toFixed(2)}V > 5.5V max)`;
      } else if (Math.abs(iOut1) > 0.045 || Math.abs(iOut2) > 0.045) {
        status = 'fault';
        statusMessage = `GPIO Pin Over-Current (>45 mA max rating)`;
      }

      const dhtSensor = components.find((c) => c.type === 'dht22_sensor');
      const clockMhz = comp.type === 'esp32_devkit' ? 240 : comp.type === 'rpi_pico' ? 133 : 16;

      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: vOut1Pin - vGndPin,
        vNode1: vVccPin,
        vNode2: vOut1Pin,
        vNode3: vOut2Pin,
        current: totalPinCurr,
        power,
        status,
        statusMessage,
        loadRatio: totalPinCurr / 0.04,
        mcuTelemetry: {
          vcc: evalRes.vVcc,
          adcVoltage: vAdcRel,
          adcRawCount,
          adcMaxCount,
          digitalInVoltage: vDigRel,
          digitalInHigh: Boolean(comp.mcuBootButtonPressed) || vDigRel >= evalRes.vVcc * 0.45,
          bootBtnHigh: Boolean(comp.mcuBootButtonPressed),
          out1Voltage: vOut1Pin - vGndPin,
          out1High: vOut1Pin - vGndPin >= evalRes.vVcc * 0.45,
          out2Voltage: vOut2Pin - vGndPin,
          pwmDutyOut: evalRes.pwmDutyPct,
          servoAngleOut: evalRes.servoAngle,
          oledLines: evalRes.oledLines,
          serialLine: evalRes.serialLine,
          serialRxLast: comp.mcuSerialRxCommand ?? '',
          clockCycles: Math.round(timeSec * clockMhz * 1_000_000),
          uptimeMs: Math.round(timeSec * 1000),
          tempC: dhtSensor?.tempC ?? 24.5,
          humidityPct: dhtSensor?.humidityPct ?? 48,
          codeError: evalRes.codeError,
        },
      });
    }
  }

  for (const comp of components) {
    if (
      comp.type === 'arduino_uno' ||
      comp.type === 'esp32_devkit' ||
      comp.type === 'rpi_pico'
    ) {
      continue;
    }

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

    if (
      comp.type === 'ultrasonic_hcsr04' ||
      comp.type === 'ldr_sensor' ||
      comp.type === 'dht22_sensor'
    ) {
      const vOutPin = nodeVoltages.get(pointKey(terms[1].x, terms[1].y)) ?? 0;
      const vGndPin = nodeVoltages.get(pointKey(terms[2].x, terms[2].y)) ?? 0;
      const vOutRel = vOutPin - vGndPin;
      const isSonar = comp.type === 'ultrasonic_hcsr04';
      const isLdr = comp.type === 'ldr_sensor';
      const sonarVal = comp.radarAutoSweep
        ? Math.round(140 + 125 * Math.sin(timeSec * 3.5))
        : comp.distanceCm ?? 45;
      const sensorVal = isSonar
        ? sonarVal
        : isLdr
        ? comp.lightLux ?? 450
        : comp.tempC ?? 25;
      const power = 0.015;
      totalPowerW += power;

      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: vOutRel,
        vNode1: v1,
        vNode2: vOutPin,
        vNode3: vGndPin,
        current: 0.003,
        power,
        status: comp.type === 'dht22_sensor' && (comp.tempC ?? 25) > 60 ? 'warning' : 'nominal',
        statusMessage: isSonar
          ? `HC-SR04 Sonar: ${sensorVal} cm -> V_OUT=${vOutRel.toFixed(2)}V`
          : isLdr
          ? `LDR Light Sensor: ${sensorVal} lux -> V_OUT=${vOutRel.toFixed(2)}V`
          : `DHT22 Env: ${comp.tempC ?? 25}°C / ${comp.humidityPct ?? 48}%RH -> V_OUT=${vOutRel.toFixed(2)}V`,
        loadRatio: 0.15,
        sensorValue: sensorVal,
      });
      continue;
    }

    if (comp.type === 'ssd1306_oled') {
      const vSdaPin = nodeVoltages.get(pointKey(terms[1].x, terms[1].y)) ?? 0;
      const vGndPin = nodeVoltages.get(pointKey(terms[2].x, terms[2].y)) ?? 0;
      const vSupply = v1 - vGndPin;
      const isPowered = vSupply >= 2.2 || latestMcuOledLines !== null;
      const lines = isPowered
        ? latestMcuOledLines ??
          comp.oledLines ?? [
            'SSD1306 128x64',
            `V_SDA: ${(vSdaPin - vGndPin).toFixed(2)} V`,
            `VCC: ${vSupply.toFixed(2)} V`,
          ]
        : ['OLED OFF (No VCC)'];

      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: vSdaPin - vGndPin,
        vNode1: v1,
        vNode2: vSdaPin,
        vNode3: vGndPin,
        current: isPowered ? 0.008 : 0,
        power: isPowered ? 0.028 : 0,
        status: 'nominal',
        statusMessage: `SSD1306 OLED: "${lines[0] ?? ''}"`,
        loadRatio: 0.2,
        oledDisplayLines: lines,
      });
      continue;
    }

    if (comp.type === 'servo_motor' || comp.type === 'relay_module') {
      const vSigPin = nodeVoltages.get(pointKey(terms[1].x, terms[1].y)) ?? 0;
      const vGndPin = nodeVoltages.get(pointKey(terms[2].x, terms[2].y)) ?? 0;
      const vSigRel = Math.max(0, vSigPin - vGndPin);

      if (comp.type === 'relay_module') {
        const relayClosed = Boolean(comp.switchClosed) || vSigRel >= 2.0;
        const coilI = vSigRel / 470;
        componentResults.set(comp.id, {
          id: comp.id,
          vDrop: vSigRel,
          vNode1: v1,
          vNode2: vSigPin,
          vNode3: vGndPin,
          current: coilI,
          power: vSigRel * coilI,
          status: 'nominal',
          statusMessage: relayClosed
            ? `Relay Energized (NO Closed · V_IN=${vSigRel.toFixed(2)}V)`
            : `Relay De-Energized (NC · V_IN=${vSigRel.toFixed(2)}V)`,
          loadRatio: 0.2,
          relayClosed,
        });
        continue;
      }

      const angle =
        latestMcuServoAngle !== undefined
          ? latestMcuServoAngle
          : Math.max(0, Math.min(180, Math.round((vSigRel / 5.0) * 180)));

      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: vSigRel,
        vNode1: v1,
        vNode2: vSigPin,
        vNode3: vGndPin,
        current: 0.025,
        power: 0.12,
        status: 'nominal',
        statusMessage: `SG90 Servo Position: ${angle}° (V_PWM=${vSigRel.toFixed(2)}V)`,
        loadRatio: 0.25,
        servoAngle: angle,
      });
      continue;
    }

    if (comp.type === 'ne555_timer') {
      const vVccPin = v1;
      const vOutPin = nodeVoltages.get(pointKey(terms[2].x, terms[2].y)) ?? 0;
      const vGndPin = nodeVoltages.get(pointKey(terms[3].x, terms[3].y)) ?? 0;
      const vOutRel = vOutPin - vGndPin;
      const freq = Math.max(1, comp.mcuBlinkHz ?? comp.frequency ?? 25);
      const duty = comp.mcuPwmDuty ?? 50;
      const iOut = Math.abs(vOutRel) / 220;
      const power = Math.max(0.01, Math.abs(vVccPin * iOut));
      totalPowerW += power;

      componentResults.set(comp.id, {
        id: comp.id,
        vDrop: vOutRel,
        vNode1: vVccPin,
        vNode2: vOutPin,
        current: iOut,
        power,
        status: 'nominal',
        statusMessage: `555 Clock: ${freq}Hz @ ${duty}% Duty (V_OUT=${vOutRel.toFixed(2)}V)`,
        loadRatio: 0.2,
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
      const status: ComponentHealthStatus =
        power > maxP ? 'fault' : power > maxP * 0.75 ? 'warning' : 'nominal';
      const region =
        vBE < 0.62 ? 'Cut-off' : vCE <= 0.25 ? 'Saturated Switch' : `Forward Active (β=${beta})`;

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
        statusMessage:
          vGS > vth ? `Conducting (V_GS=${vGS.toFixed(2)}V)` : `Off (V_GS < ${vth}V)`,
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
        statusMessage: `V_out = ${clampedOut.toFixed(2)} V (ΔV_in = ${(
          (vPos - vNeg) *
          1000
        ).toFixed(1)} mV)`,
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
    } else if (comp.type === 'dc_motor') {
      const baseR = Math.max(5, comp.value || 36);
      const rArmature = comp.motorStallLoad ? baseR * 0.25 : baseR;
      current = vDrop / rArmature;
    } else if (comp.type === 'piezo_buzzer') {
      current = vDrop / 320;
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
    let motorRpm: number | undefined = undefined;
    let buzzerFreqHz: number | undefined = undefined;

    if (comp.type === 'dc_motor') {
      motorRpm = comp.motorStallLoad ? 0 : Math.round((vDrop / 5.0) * 3000);
      loadRatio = Math.abs(vDrop) / 12.0;
      if (comp.motorStallLoad && Math.abs(vDrop) > 1.5) {
        status = 'warning';
        statusMessage = `Mechanical Stall! I_stall=${(Math.abs(current) * 1000).toFixed(0)}mA (0 RPM)`;
      } else if (Math.abs(vDrop) > 12.0) {
        status = 'fault';
        statusMessage = `Motor Over-Voltage (${Math.abs(vDrop).toFixed(1)}V > 12V max)`;
      } else {
        statusMessage = `Spinning ${motorRpm >= 0 ? 'CW' : 'CCW'} at ${Math.abs(
          motorRpm
        )} RPM (${vDrop.toFixed(2)}V)`;
      }
    } else if (comp.type === 'piezo_buzzer') {
      const active = Math.abs(vDrop) >= 1.5;
      buzzerFreqHz = active ? Math.round(800 + Math.abs(vDrop) * 350) : 0;
      statusMessage = active
        ? `Sounding Acoustic Alarm @ ${buzzerFreqHz} Hz (${vDrop.toFixed(2)}V)`
        : `Silent (V < 1.5V threshold)`;
      loadRatio = Math.abs(vDrop) / 5.0;
    } else if (comp.type === 'resistor' || comp.type === 'potentiometer') {
      const maxP = comp.maxPowerW ?? 0.25;
      loadRatio = power / maxP;
      if (loadRatio > 1.0) {
        status = 'fault';
        statusMessage = `Over-Power Fault (${(power * 1000).toFixed(0)} mW > ${(
          maxP * 1000
        ).toFixed(0)} mW max)`;
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
        statusMessage = `LED Burnout Risk (${(current * 1000).toFixed(1)} mA > ${(
          maxI * 1000
        ).toFixed(0)} mA max)`;
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
      statusMessage = comp.switchClosed
        ? 'Switch Closed (Conducting)'
        : 'Switch Open (Isolated)';
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
      motorRpm,
      buzzerFreqHz,
    });
  }

  const wireCurrents = new Map<string, number>();
  for (const w of wires) {
    const k1 = pointKey(w.x1, w.y1);
    const k2 = pointKey(w.x2, w.y2);
    let netCurrent = 0;

    for (const comp of components) {
      if (comp.type === 'ground' || comp.type === 'probe_ch1' || comp.type === 'probe_ch2')
        continue;
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
        if (comp.type === 'ground' || comp.type === 'probe_ch1' || comp.type === 'probe_ch2')
          continue;
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

export interface LabTestCaseResult {
  id: string;
  name: string;
  category: 'Power & Netlist' | 'SOA & Thermal' | 'MCU Firmware' | 'Closed-Loop HIL';
  status: 'pass' | 'warn' | 'fail';
  measured: string;
  expected: string;
  detail: string;
}

/**
 * Automated Hardware-in-the-Loop (HIL) Lab Verification Suite.
 * Evaluates netlist connectivity, electrical SOA compliance, MCU firmware compilation,
 * and closed-loop sensor-to-actuator response across simulated stimulus vectors.
 */
export function runAutomatedLabSuite(
  components: CircuitComponent[],
  wires: WireSegment[],
  timeSec: number
): LabTestCaseResult[] {
  const sol = solveCircuitStep(components, wires, timeSec, 0.001);
  const results: LabTestCaseResult[] = [];

  // 1. Ground Reference & MNA Convergence Check
  const hasGnd = components.some((c) => c.type === 'ground');
  results.push({
    id: 'test_gnd_mna',
    name: 'Reference Ground & MNA Matrix Convergence',
    category: 'Power & Netlist',
    status: sol.converged && hasGnd ? 'pass' : sol.converged ? 'warn' : 'fail',
    measured: `${sol.converged ? 'Converged' : 'Singular'} · ${
      hasGnd ? 'Explicit 0V GND' : 'Implicit GND'
    }`,
    expected: 'Converged + Explicit 0V GND',
    detail: hasGnd
      ? `Modified Nodal Analysis solved ${sol.nodeVoltages.size} nodes with 0.00V ground reference.`
      : 'Circuit solved using fallback reference; add a 0V GND symbol for strict hardware reference.',
  });

  // 2. Pin Connectivity Audit
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
    for (let s = 0; s <= steps; s++) {
      inc(w.x1 + dx * s, w.y1 + dy * s);
    }
  }
  let openPins = 0;
  let totalPins = 0;
  for (const c of components) {
    if (
      c.type === 'arduino_uno' ||
      c.type === 'esp32_devkit' ||
      c.type === 'rpi_pico'
    ) {
      continue; // MCU boards often have unused spare GPIO headers
    }
    for (const t of getComponentTerminals(c)) {
      totalPins++;
      if ((pointCount.get(`${Math.round(t.x)},${Math.round(t.y)}`) ?? 0) <= 1) {
        openPins++;
      }
    }
  }
  results.push({
    id: 'test_pin_nets',
    name: 'Peripheral & Component Pin Continuity Check',
    category: 'Power & Netlist',
    status: openPins === 0 ? 'pass' : openPins <= 2 ? 'warn' : 'fail',
    measured: `${totalPins - openPins}/${totalPins} Pins Connected`,
    expected: '100% Peripheral Pins Wired',
    detail:
      openPins === 0
        ? 'Every peripheral, sensor, and passive component terminal is tied to an active net.'
        : `${openPins} peripheral terminal(s) are floating. Click "⚡ Auto-Wire Pins" in the toolbar to connect them.`,
  });

  // 3. Component Safe Operating Area (SOA) & Thermal Stress Test
  let faultCount = 0;
  let warnCount = 0;
  let maxLoadPct = 0;
  for (const r of sol.componentResults.values()) {
    if (r.status === 'fault') faultCount++;
    if (r.status === 'warning') warnCount++;
    if (r.loadRatio * 100 > maxLoadPct) maxLoadPct = Math.round(r.loadRatio * 100);
  }
  results.push({
    id: 'test_soa_thermal',
    name: 'Safe Operating Area (SOA) & Thermal Rating Audit',
    category: 'SOA & Thermal',
    status: faultCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass',
    measured: `Peak Load ${maxLoadPct}% · ${faultCount} Faults`,
    expected: 'Load < 80% · 0 Faults',
    detail:
      faultCount > 0
        ? `${faultCount} component(s) exceed maximum voltage, current, or power ratings.`
        : warnCount > 0
        ? `${warnCount} component(s) operating in elevated thermal zone (75–100% of rating).`
        : `All ${components.length} components are within safe electrical and thermal margins.`,
  });

  // 4. Microcontroller Firmware & Register Verification
  const mcu = components.find(
    (c) =>
      c.type === 'arduino_uno' ||
      c.type === 'esp32_devkit' ||
      c.type === 'rpi_pico'
  );
  if (mcu) {
    const mcuRes = sol.componentResults.get(mcu.id);
    const tel = mcuRes?.mcuTelemetry;
    const hasErr = Boolean(tel?.codeError);
    results.push({
      id: 'test_mcu_firmware',
      name: `${mcu.label} Firmware Execution & Logic Rail Check`,
      category: 'MCU Firmware',
      status: hasErr ? 'fail' : 'pass',
      measured: hasErr
        ? `Compile/Runtime Error`
        : `VCC=${tel?.vcc.toFixed(1)}V · PWM=${tel?.pwmDutyOut ?? 0}%`,
      expected: `Clean Execution @ ${mcu.type === 'arduino_uno' ? '5.0V' : '3.3V'}`,
      detail: hasErr
        ? `Error: ${tel?.codeError}`
        : `MCU running ${mcu.mcuProgram} mode (${tel?.clockCycles.toLocaleString()} cycles, Serial: "${tel?.serialLine.slice(0, 42)}").`,
    });

    // 5. Closed-Loop HIL Stimulus Sweep (Near Obstacle 15cm vs Far 180cm)
    const clonedNear = components.map((c) =>
      c.type === 'ultrasonic_hcsr04'
        ? { ...c, distanceCm: 15, radarAutoSweep: false }
        : c.type === 'ldr_sensor'
        ? { ...c, lightLux: 60 }
        : { ...c }
    );
    const clonedFar = components.map((c) =>
      c.type === 'ultrasonic_hcsr04'
        ? { ...c, distanceCm: 180, radarAutoSweep: false }
        : c.type === 'ldr_sensor'
        ? { ...c, lightLux: 850 }
        : { ...c }
    );
    const solNear = solveCircuitStep(clonedNear, wires, timeSec + 0.05, 0.001);
    const solFar = solveCircuitStep(clonedFar, wires, timeSec + 0.05, 0.001);
    const telNear = solNear.componentResults.get(mcu.id)?.mcuTelemetry;
    const telFar = solFar.componentResults.get(mcu.id)?.mcuTelemetry;

    const responseChanged =
      telNear &&
      telFar &&
      (telNear.out1High !== telFar.out1High ||
        telNear.pwmDutyOut !== telFar.pwmDutyOut ||
        telNear.serialLine !== telFar.serialLine);

    results.push({
      id: 'test_hil_stimulus',
      name: 'Closed-Loop HIL Stimulus Sweep (15cm/60lx vs 180cm/850lx)',
      category: 'Closed-Loop HIL',
      status: responseChanged ? 'pass' : 'warn',
      measured: `Near: D13=${telNear?.out1High ? 'HIGH' : 'LOW'}/PWM=${
        telNear?.pwmDutyOut ?? 0
      }% | Far: D13=${telFar?.out1High ? 'HIGH' : 'LOW'}/PWM=${
        telFar?.pwmDutyOut ?? 0
      }%`,
      expected: 'Dynamic Actuator / Serial Response to Sensor Sweep',
      detail: responseChanged
        ? 'Verified closed-loop response: MCU outputs/telemetry dynamically adapt when sensor stimulus sweeps from Near (15cm) to Far (180cm).'
        : 'MCU outputs remained static across sensor stimulus sweep (typical for fixed blink/LUT modes).',
    });
  } else {
    // Analog / Discrete Circuit Dynamic Signal Check
    results.push({
      id: 'test_analog_signal',
      name: 'Analog Node Signal & Power Dissipation Check',
      category: 'Closed-Loop HIL',
      status: sol.totalPowerW > 0 ? 'pass' : 'warn',
      measured: `P_total = ${formatEngineeringUnit(sol.totalPowerW, 'W')}`,
      expected: 'Active Signal / Current Flow (> 0 W)',
      detail: `Circuit dissipating ${formatEngineeringUnit(
        sol.totalPowerW,
        'W'
      )} across ${components.length} components.`,
    });
  }

  return results;
}

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
