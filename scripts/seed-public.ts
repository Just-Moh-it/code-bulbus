/**
 * Seed the 10 public showcase projects (all on the thermostat hardware:
 * TMP36 on A0, pot on A1, 16x2 LCD, red LED 8, blue LED 9) and delete every
 * other project.  `bun scripts/seed-public.ts`
 */
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { THERMOSTAT_SKETCH, thermostatProject } from '../src/lib/thermostat'

const HEAD = `#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
const int SENSOR = A0, SETPOT = A1, RED = 8, BLUE = 9;
float readF() { return ((analogRead(SENSOR) * 5.0 / 1023.0) - 0.5) * 100.0 * 9.0 / 5.0 + 32.0; }
int pot(int lo, int hi) { return lo + (analogRead(SETPOT) * (long)(hi - lo)) / 1023; }
void setup() { lcd.begin(16, 2); pinMode(RED, OUTPUT); pinMode(BLUE, OUTPUT); }
`
const twoLine = (
  title: string,
  l1: string,
  l2: string,
  red: string,
  blue: string,
) =>
  `${HEAD}
void loop() {
  float t = readF();
  ${l1}
  lcd.setCursor(0, 0); lcd.print("${title}"); lcd.print("        ");
  lcd.setCursor(0, 1); ${l2} lcd.print("        ");
  digitalWrite(RED, ${red});
  digitalWrite(BLUE, ${blue});
  delay(200);
}
`

const SHOWCASE: [string, string, string][] = [
  ['11111111-0000-4000-8000-000000000001', 'Thermostat', THERMOSTAT_SKETCH],
  [
    '11111111-0000-4000-8000-000000000002',
    'Fridge Alarm',
    twoLine(
      'Fridge',
      'int limit = pot(33, 50);',
      'lcd.print((int)t); lcd.print("F max "); lcd.print(limit);',
      't > limit',
      't <= limit',
    ),
  ],
  [
    '11111111-0000-4000-8000-000000000003',
    'Sous-vide Monitor',
    twoLine(
      'Sous-vide',
      'int target = pot(120, 160); bool heat = t < target;',
      'lcd.print((int)t); lcd.print("F -> "); lcd.print(target);',
      'heat',
      '!heat',
    ),
  ],
  [
    '11111111-0000-4000-8000-000000000004',
    'Greenhouse Controller',
    twoLine(
      'Greenhouse',
      'int vent = pot(70, 95);',
      'lcd.print((int)t); lcd.print(t > vent ? "F VENT OPEN" : "F vent shut");',
      't > vent',
      't < vent - 10',
    ),
  ],
  [
    '11111111-0000-4000-8000-000000000005',
    'Baby Room Monitor',
    twoLine(
      'Nursery',
      'bool ok = t >= 68 && t <= 72;',
      'lcd.print((int)t); lcd.print(ok ? "F comfy" : (t < 68 ? "F too cold" : "F too warm"));',
      't > 72',
      't < 68',
    ),
  ],
  [
    '11111111-0000-4000-8000-000000000006',
    'Server Rack Alert',
    twoLine(
      'Rack temp',
      'int trip = pot(75, 100);',
      'lcd.print((int)t); lcd.print("F trip "); lcd.print(trip);',
      't > trip',
      'millis() / 500 % 2',
    ),
  ],
  [
    '11111111-0000-4000-8000-000000000007',
    'Reptile Tank Heater',
    twoLine(
      'Terrarium',
      'int basking = pot(85, 100); bool lamp = t < basking;',
      'lcd.print((int)t); lcd.print(lamp ? "F lamp ON" : "F lamp off");',
      'lamp',
      '!lamp',
    ),
  ],
  [
    '11111111-0000-4000-8000-000000000008',
    'Wine Cellar Guard',
    twoLine(
      'Cellar',
      'bool good = t >= 50 && t <= 59;',
      'lcd.print((int)t); lcd.print(good ? "F perfect" : "F ADJUST");',
      '!good',
      'good',
    ),
  ],
  [
    '11111111-0000-4000-8000-000000000009',
    'Fever Thermometer',
    twoLine(
      'Body temp',
      'bool fever = t >= 100.4;',
      'lcd.print(t, 1); lcd.print(fever ? "F FEVER" : "F normal");',
      'fever',
      '!fever',
    ),
  ],
  [
    '11111111-0000-4000-8000-000000000010',
    'Brewing Fermenter',
    twoLine(
      'Fermenter',
      'int ideal = pot(60, 75);',
      'lcd.print((int)t); lcd.print("F ideal "); lcd.print(ideal);',
      't > ideal + 3',
      't < ideal - 3',
    ),
  ],
]

const c = new ConvexHttpClient(process.env.VITE_CONVEX_URL!)
const keep = new Set(SHOWCASE.map(([id]) => id))
for (const p of await c.query(api.projects.list, {})) {
  if (!keep.has(p.id)) {
    await c.mutation(api.projects.remove, { id: p.id })
    console.log('removed', p.name)
  }
}
for (const [id, name, sketch] of SHOWCASE) {
  await c.mutation(api.projects.remove, { id })
  const j = thermostatProject(id, null, sketch, name)
  await c.mutation(api.projects.create, {
    id,
    name,
    camera: j.camera,
    parts: j.circuit.parts,
    wires: j.circuit.wires,
  })
  await c.mutation(api.projects.setPublic, { id, isPublic: true })
  console.log('seeded', name)
}
