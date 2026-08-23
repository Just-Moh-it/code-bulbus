/**
 * The public showcase circuits. Each is laid out with the same helpers as the
 * thermostat: parts on the breadboard, wires as wire-end pairs, one Uno.
 *
 * LED channel geometry (rotation 0 / π/2, see sim/defs): a channel starting at
 * column n uses resistor E.(n+4)→E.n, LED +D.(n+4) −D.(n+5), Uno pin → A.n,
 * A.(n+5) → negative rail. Channels are 7 columns apart so they never overlap.
 */
import * as defs from '#/sim/defs'
import type { PartJSON, ProjectJSON, WireJSON } from '#/sim/types'
import {
  BB_ID,
  UNO_ID,
  bbEnd,
  onBreadboard,
  resetIds,
  unoEnd,
} from './thermostat'

const LED_COLORS = {
  red: 'Crimson',
  yellow: 'Gold',
  green: 'MediumSeaGreen',
  blue: 'DeepSkyBlue',
  white: 'White',
} as const

/** Nearest rail hole to a breadboard column, never reused within a build. */
function railHoles(prefix: string) {
  return defs.breadboardTerminals.filter((t) => t.name.startsWith(`${prefix}.`))
}
const COL_X = Object.fromEntries(
  defs.breadboardTerminals
    .filter((t) => t.name.startsWith('A.'))
    .map((t) => [t.name.slice(2), t.position.x]),
)

class Build {
  parts: PartJSON[] = []
  wires: WireJSON[] = []
  private usedRail = new Set<string>()
  constructor(sketch: string) {
    resetIds()
    this.parts.push({
      id: BB_ID,
      type: 'breadboard',
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      terminals: [],
    })
    this.parts.push({
      id: UNO_ID,
      type: 'arduino-uno',
      parentId: null,
      position: { x: -13, y: 0, z: 0 },
      rotation: 0,
      terminals: [],
      files: {
        'main.ino': { content: sketch, fileExtension: '.ino', order: 0 },
      },
      compilationStatus: 'not-compiled',
      compilationOutput: '',
      hexFile: '',
    })
    // Uno feeds the bottom rails (next to row A); the top rails (next to row J)
    // are bridged from them at the far right so the LCD can use them too.
    this.link(unoEnd('5v'), bbEnd('positive.b.1'), 'Crimson')
    this.link(unoEnd('gnd.1'), bbEnd('negative.b.1'), 'Black')
    this.link(bbEnd('positive.b.50'), bbEnd('positive.a.50'), 'Crimson')
    this.link(bbEnd('negative.b.49'), bbEnd('negative.a.49'), 'Black')
    for (const h of [
      'positive.b.1',
      'negative.b.1',
      'positive.b.50',
      'positive.a.50',
      'negative.b.49',
      'negative.a.49',
    ])
      this.usedRail.add(h)
  }
  link(a: PartJSON, b: PartJSON, color: string) {
    this.parts.push(a, b)
    this.wires.push({
      id: `w-${this.wires.length + 1}`,
      color,
      partOneId: a.id,
      partTwoId: b.id,
    })
  }
  /** Rail hole closest to column `col` on the given rail, skipping used ones. */
  rail(prefix: string, col: number) {
    const x = COL_X[String(col)]
    const free = railHoles(prefix)
      .filter((t) => !this.usedRail.has(t.name))
      .sort(
        (a, b) => Math.abs(a.position.x - x) - Math.abs(b.position.x - x),
      )[0]
    this.usedRail.add(free.name)
    return bbEnd(free.name)
  }
  /** Uno `pin` → 220 Ω → LED → GND, starting at breadboard column n (row A side). */
  led(pin: string, n: number, color: keyof typeof LED_COLORS) {
    this.parts.push(
      onBreadboard(
        'resistor',
        Math.PI / 2,
        { t1: `E.${n + 4}`, t2: `E.${n}` },
        { kohm: 0.22 },
      ),
      onBreadboard(
        'led',
        0,
        { '+': `D.${n + 4}`, '-': `D.${n + 5}` },
        { color: LED_COLORS[color] },
      ),
    )
    this.link(unoEnd(pin), bbEnd(`A.${n}`), 'DarkOrange')
    this.link(bbEnd(`A.${n + 5}`), this.rail('negative.b', n + 5), 'Black')
  }
  /** 10 kΩ pot at columns n..n+2, wiper → analog pin. */
  pot(pin: string, n: number) {
    this.parts.push(
      onBreadboard(
        'potentiometer',
        0,
        { '1': `E.${n}`, wiper: `E.${n + 1}`, '3': `E.${n + 2}` },
        { kohm: 10, wiper: 0.5 },
      ),
    )
    this.link(bbEnd(`A.${n}`), this.rail('positive.b', n), 'Crimson')
    this.link(bbEnd(`A.${n + 1}`), unoEnd(pin), 'DeepSkyBlue')
    this.link(bbEnd(`A.${n + 2}`), this.rail('negative.b', n + 2), 'Black')
  }
  /** TMP36 at columns n..n+2, Vout → analog pin. */
  tmp36(pin: string, n: number, temperature: number) {
    this.parts.push(
      onBreadboard(
        'tmp36',
        0,
        { vs: `E.${n}`, vout: `E.${n + 1}`, gnd: `E.${n + 2}` },
        { temperature },
      ),
    )
    this.link(bbEnd(`A.${n}`), this.rail('positive.b', n), 'Crimson')
    this.link(bbEnd(`A.${n + 1}`), unoEnd(pin), 'MediumSeaGreen')
    this.link(bbEnd(`A.${n + 2}`), this.rail('negative.b', n + 2), 'Black')
  }
  /** 16×2 LCD in row J from column n (4-bit: RS 12, E 11, D4–D7 = 5,4,3,2). */
  lcd(n: number) {
    const pins = [
      'VSS',
      'VDD',
      'V0',
      'RS',
      'RW',
      'E',
      'D0',
      'D1',
      'D2',
      'D3',
      'D4',
      'D5',
      'D6',
      'D7',
      'A',
      'K',
    ]
    this.parts.push(
      onBreadboard(
        'lcd1602',
        0,
        Object.fromEntries(pins.map((p, i) => [p, `J.${n + i}`])),
      ),
    )
    const f = (i: number) => bbEnd(`F.${n + i}`)
    this.link(f(0), this.rail('negative.a', n), 'Black')
    this.link(f(1), this.rail('positive.a', n + 1), 'Crimson')
    this.link(f(2), this.rail('negative.a', n + 2), 'Black')
    this.link(f(3), unoEnd('12'), 'Gold')
    this.link(f(4), this.rail('negative.a', n + 4), 'Black')
    this.link(f(5), unoEnd('~11'), 'Gold')
    this.link(f(10), unoEnd('~5'), 'MediumOrchid')
    this.link(f(11), unoEnd('4'), 'MediumOrchid')
    this.link(f(12), unoEnd('~3'), 'MediumOrchid')
    this.link(f(13), unoEnd('2'), 'MediumOrchid')
    this.link(f(14), this.rail('positive.a', n + 14), 'Crimson')
    this.link(f(15), this.rail('negative.a', n + 15), 'Black')
  }
  done(id: string, name: string): ProjectJSON {
    return {
      id,
      user_id: null,
      name,
      featured: false,
      camera: {
        position: { x: -14, y: 30, z: 34 },
        target: { x: -2, y: 0, z: 0 },
      },
      circuit: { parts: this.parts, wires: this.wires },
    }
  }
}

/** Standard bench: LCD J.20–35, dial E.40–42, TMP36 E.45–47, LED slots on the A side. */
const LED_SLOTS = [50, 57, 5, 12]
const LED_PINS = ['8', '~9', '~10', '~6']
function bench(
  sketch: string,
  opts: {
    temp: number
    dial?: boolean
    lcd?: boolean
    leds: (keyof typeof LED_COLORS)[]
  },
) {
  const b = new Build(sketch)
  if (opts.lcd !== false) b.lcd(20)
  if (opts.dial !== false) b.pot('a1', 40)
  b.tmp36('a0', 45, opts.temp)
  opts.leds.forEach((c, i) => b.led(LED_PINS[i], LED_SLOTS[i], c))
  return b
}

/** Shared sketch prelude: LCD, TMP36 in °C/°F, dial mapping, LED pins 8/9/10/6. */
const PRELUDE = `#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
const int LED1 = 8, LED2 = 9, LED3 = 10, LED4 = 6;
float readC() { return ((analogRead(A0) * 5.0 / 1023.0) - 0.5) * 100.0; }
float readF() { return readC() * 9.0 / 5.0 + 32.0; }
int dial(int lo, int hi) { return lo + (analogRead(A1) * (long)(hi - lo)) / 1023; }
bool blink(int ms) { return (millis() / ms) % 2; }
void line(int row, const char* text) { lcd.setCursor(0, row); lcd.print(text); lcd.print("                "); }
void setup() {
  lcd.begin(16, 2);
  pinMode(LED1, OUTPUT); pinMode(LED2, OUTPUT); pinMode(LED3, OUTPUT); pinMode(LED4, OUTPUT);
}
`

const SHOWCASE: [string, string, (id: string, name: string) => ProjectJSON][] =
  [
    [
      'Thermostat',
      'TMP36 + setpoint dial + LCD drive heat/cool LEDs with hysteresis',
      (id, name) =>
        bench(
          `${PRELUDE}
const float HYST = 1.0;
void loop() {
  float amb = readF();
  int set = dial(50, 80);
  bool heat = amb < set - HYST, cool = amb > set + HYST;
  digitalWrite(LED1, heat); digitalWrite(LED2, cool);
  lcd.setCursor(0, 0); lcd.print("Amb "); lcd.print((int)amb); lcd.print("F  Set "); lcd.print(set); lcd.print("F ");
  line(1, heat ? "HEATING" : cool ? "COOLING" : "IDLE");
  delay(200);
}
`,
          { temp: 22, leds: ['red', 'blue'] },
        ).done(id, name),
    ],

    [
      'Baby Room Monitor',
      'Keeps a nursery in the safe 68–72 °F band; alarm LED and LCD advice',
      (id, name) =>
        bench(
          `${PRELUDE}
float peak = -100, low = 200;
void loop() {
  float t = readF();
  if (t > peak) peak = t; if (t < low) low = t;
  int target = dial(66, 74);
  bool cold = t < target - 2, warm = t > target + 2, ok = !cold && !warm;
  digitalWrite(LED1, ok);                 // green: comfortable
  digitalWrite(LED2, !ok && blink(400));  // red: out of band, blinking
  lcd.setCursor(0, 0); lcd.print("Nursery "); lcd.print(t, 1); lcd.print("F   ");
  lcd.setCursor(0, 1);
  if (ok) { lcd.print("OK  lo"); lcd.print((int)low); lcd.print(" hi"); lcd.print((int)peak); lcd.print("  "); }
  else if (cold) lcd.print("TOO COLD add blanket");
  else lcd.print("TOO WARM open window");
  delay(250);
}
`,
          { temp: 21, leds: ['green', 'red'] },
        ).done(id, name),
    ],

    [
      'Greenhouse Controller',
      'Heater, vent and status LEDs from a vent-open threshold you set',
      (id, name) =>
        bench(
          `${PRELUDE}
void loop() {
  float t = readF();
  int vent = dial(70, 95);      // open the vent above this
  int heater = vent - 25;       // run the heater below this
  bool heat = t < heater, open = t > vent;
  digitalWrite(LED1, heat); digitalWrite(LED2, open); digitalWrite(LED3, !heat && !open);
  lcd.setCursor(0, 0); lcd.print("Air "); lcd.print((int)t); lcd.print("F  vent@"); lcd.print(vent); lcd.print(" ");
  line(1, heat ? "Heater ON" : open ? "Vent OPEN" : "Holding");
  delay(200);
}
`,
          { temp: 27, leds: ['red', 'blue', 'green'] },
        ).done(id, name),
    ],

    [
      'Sous-vide Controller',
      'Dial a water target 50–90 °C; heater LED with 0.5 °C hysteresis, READY when settled',
      (id, name) =>
        bench(
          `${PRELUDE}
bool heating = false;
void loop() {
  float w = readC();
  int target = dial(50, 90);
  if (w < target - 0.5) heating = true;
  if (w > target + 0.5) heating = false;
  bool ready = abs(w - target) <= 1.0;
  digitalWrite(LED1, heating); digitalWrite(LED2, ready);
  lcd.setCursor(0, 0); lcd.print("Water "); lcd.print(w, 1); lcd.print("C    ");
  lcd.setCursor(0, 1); lcd.print("Set "); lcd.print(target); lcd.print("C "); lcd.print(ready ? "READY  " : heating ? "HEATING" : "COOLING");
  delay(200);
}
`,
          { temp: 55, leds: ['red', 'green'] },
        ).done(id, name),
    ],

    [
      'Fridge Alarm',
      'Warns when the fridge drifts above a safe limit and counts how long it has',
      (id, name) =>
        bench(
          `${PRELUDE}
unsigned long overSince = 0;
void loop() {
  float t = readC();
  int limit = dial(2, 10);
  bool over = t > limit;
  if (over && overSince == 0) overSince = millis();
  if (!over) overSince = 0;
  digitalWrite(LED1, !over); digitalWrite(LED2, over && blink(300));
  lcd.setCursor(0, 0); lcd.print("Fridge "); lcd.print(t, 1); lcd.print("C max"); lcd.print(limit); lcd.print(" ");
  lcd.setCursor(0, 1);
  if (over) { lcd.print("WARM for "); lcd.print((millis() - overSince) / 1000); lcd.print("s    "); }
  else lcd.print("Food is safe    ");
  delay(200);
}
`,
          { temp: 4, leds: ['green', 'red'] },
        ).done(id, name),
    ],

    [
      'Server Rack Monitor',
      'Green / amber / red intake-temperature status with an adjustable warning point',
      (id, name) =>
        bench(
          `${PRELUDE}
void loop() {
  float t = readC();
  int warn = dial(22, 35);
  int crit = warn + 5;
  int level = t >= crit ? 2 : t >= warn ? 1 : 0;
  digitalWrite(LED1, level == 0); digitalWrite(LED2, level == 1); digitalWrite(LED3, level == 2 && blink(200));
  lcd.setCursor(0, 0); lcd.print("Intake "); lcd.print(t, 1); lcd.print("C     ");
  lcd.setCursor(0, 1);
  if (level == 2) lcd.print("CRITICAL shutdown");
  else if (level == 1) { lcd.print("WARN >"); lcd.print(warn); lcd.print("C fans up  "); }
  else { lcd.print("Nominal  warn@"); lcd.print(warn); lcd.print(" "); }
  delay(200);
}
`,
          { temp: 28, leds: ['green', 'yellow', 'red'] },
        ).done(id, name),
    ],

    [
      'Brewing Fermenter',
      'Holds beer at the yeast target with heat/cool control and a day counter',
      (id, name) =>
        bench(
          `${PRELUDE}
void loop() {
  float t = readC();
  int target = dial(15, 25);
  bool heat = t < target - 1, cool = t > target + 1;
  digitalWrite(LED1, heat); digitalWrite(LED2, cool); digitalWrite(LED3, !heat && !cool);
  unsigned long days = millis() / 86400000UL;
  lcd.setCursor(0, 0); lcd.print("Beer "); lcd.print(t, 1); lcd.print("C ->"); lcd.print(target); lcd.print("C ");
  lcd.setCursor(0, 1); lcd.print(heat ? "Heat pad ON " : cool ? "Chiller ON  " : "Holding     "); lcd.print("d"); lcd.print(days);
  delay(200);
}
`,
          { temp: 20, leds: ['red', 'blue', 'green'] },
        ).done(id, name),
    ],

    [
      'Kitchen Timer',
      'Set seconds with the dial; LCD counts down and the LED fires at zero',
      (id, name) =>
        bench(
          `${PRELUDE}
unsigned long started = 0; int total = 0;
void loop() {
  int d = dial(5, 60);
  if (d != total) { total = d; started = millis(); }
  long left = total - (millis() - started) / 1000;
  if (left < 0) left = 0;
  digitalWrite(LED1, left == 0 && blink(250));
  lcd.setCursor(0, 0); lcd.print("Timer "); lcd.print(total); lcd.print("s        ");
  lcd.setCursor(0, 1);
  if (left > 0) { lcd.print("Left  "); lcd.print(left); lcd.print("s        "); } else lcd.print("DING! turn dial ");
  delay(100);
}
`,
          { temp: 22, leds: ['red'] },
        ).done(id, name),
    ],

    [
      'Fever Thermometer',
      'Skin-contact reading with peak hold; fever flag above 100.4 °F',
      (id, name) =>
        bench(
          `${PRELUDE}
float peak = 0;
void loop() {
  float f = readF();
  if (f > peak) peak = f;
  bool fever = peak >= 100.4;
  digitalWrite(LED1, !fever); digitalWrite(LED2, fever && blink(300));
  lcd.setCursor(0, 0); lcd.print("Now  "); lcd.print(f, 1); lcd.print("F      ");
  lcd.setCursor(0, 1); lcd.print("Peak "); lcd.print(peak, 1); lcd.print(fever ? "F FEVER" : "F ok   ");
  delay(200);
}
`,
          { temp: 38.2, dial: false, leds: ['green', 'red'] },
        ).done(id, name),
    ],

    [
      'Wine Cellar Guard',
      'Keeps bottles at cellar temperature; warns when too warm or too cold',
      (id, name) =>
        bench(
          `${PRELUDE}
void loop() {
  float t = readC();
  int target = dial(10, 16);
  bool warm = t > target + 1.5, cold = t < target - 1.5;
  digitalWrite(LED1, !warm && !cold); digitalWrite(LED2, warm); digitalWrite(LED3, cold);
  lcd.setCursor(0, 0); lcd.print("Cellar "); lcd.print(t, 1); lcd.print("C     ");
  lcd.setCursor(0, 1); lcd.print(warm ? "Too warm  " : cold ? "Too cold  " : "Perfect   "); lcd.print("set"); lcd.print(target);
  delay(200);
}
`,
          { temp: 13, leds: ['green', 'yellow', 'blue'] },
        ).done(id, name),
    ],
  ]

export const SHOWCASE_ID = (i: number) =>
  `11111111-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`

export function showcaseProjects(): { project: ProjectJSON; blurb: string }[] {
  return SHOWCASE.map(([name, blurb, make], i) => ({
    project: make(SHOWCASE_ID(i), name),
    blurb,
  }))
}
