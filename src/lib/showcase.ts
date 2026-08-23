/**
 * The public showcase circuits. Each is laid out with the same helpers as the
 * thermostat: parts on the breadboard, wires as wire-end pairs, one Uno.
 *
 * LED channel geometry (rotation 0 / π/2, see sim/defs): a channel starting at
 * column n uses resistor E.(n+4)→E.n, LED +D.(n+4) −D.(n+5), Uno pin → A.n,
 * A.(n+5) → negative rail. Channels are 7 columns apart so they never overlap.
 */
import type { PartJSON, ProjectJSON, WireJSON } from '#/sim/types'
import {
  BB_ID,
  THERMOSTAT_SKETCH,
  UNO_ID,
  bbEnd,
  onBreadboard,
  resetIds,
  thermostatProject,
  unoEnd,
} from './thermostat'

const LED_COLORS = {
  red: 'Crimson',
  yellow: 'Gold',
  green: 'MediumSeaGreen',
  blue: 'DeepSkyBlue',
  white: 'White',
} as const

class Build {
  parts: PartJSON[] = []
  wires: WireJSON[] = []
  rail = 0
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
    this.link(unoEnd('5v'), bbEnd('positive.a.1'), 'Crimson')
    this.link(unoEnd('gnd.1'), bbEnd('negative.a.1'), 'Black')
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
  /** next free rail hole (rails have 50 per side; 1 is used by the Uno feed) */
  nextRail() {
    this.rail += 1
    return 1 + this.rail
  }
  /** Uno `pin` → 220 Ω → LED → GND, starting at breadboard column n. */
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
    this.link(
      bbEnd(`A.${n + 5}`),
      bbEnd(`negative.a.${this.nextRail()}`),
      'Black',
    )
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
    const k = this.nextRail()
    this.link(bbEnd(`A.${n}`), bbEnd(`positive.a.${k}`), 'Crimson')
    this.link(bbEnd(`A.${n + 1}`), unoEnd(pin), 'DeepSkyBlue')
    this.link(bbEnd(`A.${n + 2}`), bbEnd(`negative.a.${k}`), 'Black')
  }
  /** TMP36 at columns n..n+2, Vout → analog pin. */
  tmp36(pin: string, n: number, temperature = 22) {
    this.parts.push(
      onBreadboard(
        'tmp36',
        0,
        { vs: `E.${n}`, vout: `E.${n + 1}`, gnd: `E.${n + 2}` },
        { temperature },
      ),
    )
    const k = this.nextRail()
    this.link(bbEnd(`A.${n}`), bbEnd(`positive.a.${k}`), 'Crimson')
    this.link(bbEnd(`A.${n + 1}`), unoEnd(pin), 'MediumSeaGreen')
    this.link(bbEnd(`A.${n + 2}`), bbEnd(`negative.a.${k}`), 'Black')
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
    const k = this.nextRail()
    this.link(f(0), bbEnd(`negative.a.${k}`), 'Black')
    this.link(f(1), bbEnd(`positive.a.${k}`), 'Crimson')
    this.link(f(2), bbEnd(`negative.a.${this.nextRail()}`), 'Black')
    this.link(f(3), unoEnd('12'), 'Gold')
    this.link(f(4), bbEnd(`negative.a.${this.nextRail()}`), 'Black')
    this.link(f(5), unoEnd('~11'), 'Gold')
    this.link(f(10), unoEnd('~5'), 'MediumOrchid')
    this.link(f(11), unoEnd('4'), 'MediumOrchid')
    this.link(f(12), unoEnd('~3'), 'MediumOrchid')
    this.link(f(13), unoEnd('2'), 'MediumOrchid')
    const k2 = this.nextRail()
    this.link(f(14), bbEnd(`positive.a.${k2}`), 'Crimson')
    this.link(f(15), bbEnd(`negative.a.${k2}`), 'Black')
  }
  done(id: string, name: string): ProjectJSON {
    return {
      id,
      user_id: null,
      name,
      featured: false,
      camera: {
        position: { x: -18, y: 14, z: 16 },
        target: { x: -2, y: 0, z: 0 },
      },
      circuit: { parts: this.parts, wires: this.wires },
    }
  }
}

const LCD_HEAD = `#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
`

const SHOWCASE: [string, string, (id: string, name: string) => ProjectJSON][] =
  [
    [
      'Thermostat',
      'TMP36 + setpoint dial + LCD drive heat/cool LEDs',
      (id, name) => thermostatProject(id, null, THERMOSTAT_SKETCH, name),
    ],
    [
      'Blink',
      'The hello world: one LED on pin 13',
      (id, name) => {
        const b = new Build(`void setup() { pinMode(13, OUTPUT); }
void loop() { digitalWrite(13, HIGH); delay(500); digitalWrite(13, LOW); delay(500); }
`)
        b.led('~13', 10, 'red')
        return b.done(id, name)
      },
    ],
    [
      'Traffic Light',
      'Red → green → yellow cycle on three LEDs',
      (id, name) => {
        const b = new Build(`const int RED = 8, YEL = 9, GRN = 10;
void setup() { pinMode(RED, OUTPUT); pinMode(YEL, OUTPUT); pinMode(GRN, OUTPUT); }
void show(int r, int y, int g, int ms) { digitalWrite(RED, r); digitalWrite(YEL, y); digitalWrite(GRN, g); delay(ms); }
void loop() { show(1, 0, 0, 2000); show(0, 0, 1, 2000); show(0, 1, 0, 700); }
`)
        b.led('8', 10, 'red')
        b.led('~9', 17, 'yellow')
        b.led('~10', 24, 'green')
        return b.done(id, name)
      },
    ],
    [
      'Dimmable Night Light',
      'A dial sets the brightness of a white LED (PWM)',
      (id, name) => {
        const b = new Build(`void setup() { pinMode(9, OUTPUT); }
void loop() { analogWrite(9, analogRead(A0) / 4); delay(20); }
`)
        b.pot('a0', 10)
        b.led('~9', 20, 'white')
        return b.done(id, name)
      },
    ],
    [
      'LED Chaser',
      'Five LEDs scan back and forth, Knight Rider style',
      (id, name) => {
        const b = new Build(`const int pins[] = {4, 5, 6, 7, 8};
void setup() { for (int i = 0; i < 5; i++) pinMode(pins[i], OUTPUT); }
void light(int i) { for (int j = 0; j < 5; j++) digitalWrite(pins[j], j == i); delay(120); }
void loop() { for (int i = 0; i < 5; i++) light(i); for (int i = 3; i > 0; i--) light(i); }
`)
        const colors = ['red', 'yellow', 'green', 'blue', 'white'] as const
        ;['4', '~5', '~6', '7', '8'].forEach((p, i) =>
          b.led(p, 10 + i * 7, colors[i]),
        )
        return b.done(id, name)
      },
    ],
    [
      'Temperature Alarm',
      'Green when the room is fine, red blinks above 80 °F',
      (id, name) => {
        const b = new Build(`const int OK = 8, HOT = 9;
void setup() { pinMode(OK, OUTPUT); pinMode(HOT, OUTPUT); }
void loop() {
  float f = ((analogRead(A0) * 5.0 / 1023.0) - 0.5) * 180.0 + 32.0;
  bool hot = f > 80;
  digitalWrite(OK, !hot);
  digitalWrite(HOT, hot && (millis() / 250) % 2);
  delay(50);
}
`)
        b.tmp36('a0', 10, 30)
        b.led('8', 20, 'green')
        b.led('~9', 27, 'red')
        return b.done(id, name)
      },
    ],
    [
      'Room Thermometer',
      'TMP36 readout in °C and °F on a 16×2 LCD',
      (id, name) => {
        const b = new Build(`${LCD_HEAD}void setup() { lcd.begin(16, 2); }
void loop() {
  float c = ((analogRead(A0) * 5.0 / 1023.0) - 0.5) * 100.0;
  lcd.setCursor(0, 0); lcd.print("Room temp       ");
  lcd.setCursor(0, 1); lcd.print(c, 1); lcd.print((char)223); lcd.print("C  "); lcd.print(c * 1.8 + 32, 1); lcd.print((char)223); lcd.print("F  ");
  delay(250);
}
`)
        b.lcd(20)
        b.tmp36('a0', 45)
        return b.done(id, name)
      },
    ],
    [
      'Level Meter',
      'Turn the dial and a five-LED bar graph follows',
      (id, name) => {
        const b = new Build(`const int pins[] = {4, 5, 6, 7, 8};
void setup() { for (int i = 0; i < 5; i++) pinMode(pins[i], OUTPUT); }
void loop() {
  int level = map(analogRead(A0), 0, 1023, 0, 5);
  for (int i = 0; i < 5; i++) digitalWrite(pins[i], i < level);
  delay(30);
}
`)
        b.pot('a0', 5)
        const colors = ['green', 'green', 'yellow', 'yellow', 'red'] as const
        ;['4', '~5', '~6', '7', '8'].forEach((p, i) =>
          b.led(p, 12 + i * 7, colors[i]),
        )
        return b.done(id, name)
      },
    ],
    [
      'Kitchen Timer',
      'Set seconds with the dial; LCD counts down, LED fires at zero',
      (id, name) => {
        const b = new Build(`${LCD_HEAD}unsigned long started; int total;
void setup() { lcd.begin(16, 2); pinMode(8, OUTPUT); started = millis(); total = 0; }
void loop() {
  int dial = map(analogRead(A0), 0, 1023, 5, 60);
  if (dial != total) { total = dial; started = millis(); }
  long left = total - (millis() - started) / 1000;
  if (left < 0) left = 0;
  lcd.setCursor(0, 0); lcd.print("Timer "); lcd.print(total); lcd.print("s      ");
  lcd.setCursor(0, 1); lcd.print(left > 0 ? "Left: " : "DONE!      "); if (left > 0) { lcd.print(left); lcd.print("s     "); }
  digitalWrite(8, left == 0);
  delay(100);
}
`)
        b.lcd(20)
        b.pot('a0', 45)
        b.led('8', 50, 'red')
        return b.done(id, name)
      },
    ],
    [
      'Mood Lamp',
      'Three LEDs cross-fade through colours with PWM',
      (id, name) => {
        const b = new Build(`const int R = 9, G = 10, B = 11;
void setup() { pinMode(R, OUTPUT); pinMode(G, OUTPUT); pinMode(B, OUTPUT); }
void loop() {
  float t = millis() / 1000.0;
  analogWrite(R, 127 + 127 * sin(t));
  analogWrite(G, 127 + 127 * sin(t + 2.1));
  analogWrite(B, 127 + 127 * sin(t + 4.2));
  delay(20);
}
`)
        b.led('~9', 10, 'red')
        b.led('~10', 17, 'green')
        b.led('~11', 24, 'blue')
        return b.done(id, name)
      },
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
