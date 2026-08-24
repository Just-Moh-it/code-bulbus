import { useState } from 'react'
import type { ReactNode } from 'react'
import { observer } from 'mobx-react-lite'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Switch } from '#/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { UnitInput } from './UnitInput'
import { CodeEditorDrawer } from './CodeEditorDrawer'
import { SpiceDrawer } from './SpiceDrawer'
import {
  ArduinoUnoPart,
  BatteryPart,
  CapacitorPart,
  EightPinChipPart,
  LCD_I2C_ADDRESSES,
  Lcd1602I2cPart,
  PotentiometerPart,
  Tmp36Part,
  LED_COLORS,
  LedPart,
  NPN_MODEL_OPTIONS,
  NpnTransistorPart,
  PNP_MODEL_OPTIONS,
  PnpTransistorPart,
  ResistorPart,
  TactileSwitchPart,
  UnitParser,
  WIRE_COLORS,
  WIRE_HEIGHTS,
  WireEndPart,
} from '#/editor/models'
import type { EditorPart } from '#/editor/models'

/** Section chrome shared by every panel block. */
export function Section({
  title,
  children,
}: {
  title: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-border px-4 py-3.5">
      <h3 className="text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </div>
  )
}

export function Row({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <span className="text-[14px]">{label}</span>
      {children}
    </div>
  )
}

function SmallSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="max-w-[55%] text-[14px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const voltParser = new UnitParser({ units: ['v', 'V'], defaultUnit: 'V' })
const ohmParser = new UnitParser({
  units: ['ohm', 'kohm', 'k'],
  defaultUnit: 'kohm',
})
const capParser = new UnitParser({
  units: ['µF', 'uF', 'pF'],
  defaultUnit: 'µF',
})

const BatteryProps = observer(({ part }: { part: BatteryPart }) => {
  const push = () => part.circuit.project.pushSnapshotToHistory()
  return (
    <Section title="Battery Properties">
      <Row label="Voltage">
        <UnitInput
          value={part.voltage}
          stringify={(v) => `${v.toFixed(2)}V`}
          parse={(s) => {
            const { value, unit } = voltParser.parse(s)
            if (unit !== 'v' && unit !== 'V') throw new Error('Invalid unit')
            return value
          }}
          onChange={(v) => {
            part.setVoltage(v)
            push()
          }}
        />
      </Row>
    </Section>
  )
})

const ResistorProps = observer(({ part }: { part: ResistorPart }) => {
  const push = () => part.circuit.project.pushSnapshotToHistory()
  return (
    <Section title="Resistor Properties">
      <Row label="Resistance">
        <UnitInput
          value={part.kohm}
          stringify={(v) => `${v.toFixed(2)}kohm`}
          parse={(s) => {
            const { value, unit } = ohmParser.parse(s)
            return unit === 'ohm' ? value / 1000 : value
          }}
          onChange={(v) => {
            part.setKohm(v)
            push()
          }}
        />
      </Row>
    </Section>
  )
})

const SwitchProps = observer(({ part }: { part: TactileSwitchPart }) => (
  <Section title="Switch Properties">
    <Row label="Retain Press">
      <Switch
        checked={part.latching}
        onCheckedChange={(v) => {
          part.setLatching(v)
          part.circuit.project.pushSnapshotToHistory()
        }}
      />
    </Row>
  </Section>
))

const LedProps = observer(({ part }: { part: LedPart }) => (
  <Section title="LED Properties">
    <Row label="Color">
      <SmallSelect
        value={part.color}
        options={[...LED_COLORS]}
        onChange={(v) => {
          part.setColor(v)
          part.circuit.project.pushSnapshotToHistory()
        }}
      />
    </Row>
  </Section>
))

const TransistorProps = observer(
  ({
    part,
    title,
    options,
  }: {
    part: NpnTransistorPart | PnpTransistorPart
    title: string
    options: readonly string[]
  }) => (
    <Section title={title}>
      <Row label="Model">
        <SmallSelect
          value={part.model}
          options={options.map((m) => ({ value: m, label: m }))}
          onChange={(v) => {
            part.setModel(v)
            setTimeout(() => {
              part.updateConnections()
              part.circuit.project.pushSnapshotToHistory()
            }, 50)
          }}
        />
      </Row>
    </Section>
  ),
)

const CapacitorProps = observer(({ part }: { part: CapacitorPart }) => (
  <Section title="Capacitor Properties">
    <Row label="Capacitance">
      <UnitInput
        value={part.capacitance * 1e6}
        stringify={(v) => `${v.toFixed(6)}µF`}
        parse={(s) => {
          const { value, unit } = capParser.parse(s)
          return unit === 'pF' ? value / 1e6 : value
        }}
        onChange={(v) => {
          part.setCapacitance(v / 1e6)
          part.circuit.project.pushSnapshotToHistory()
        }}
      />
    </Row>
  </Section>
))

const WireProps = observer(({ part }: { part: WireEndPart }) => {
  const wire = part.wire
  if (!wire) return null
  const push = () => part.circuit.project.pushSnapshotToHistory()
  return (
    <Section title="Wire Properties">
      <Row label="Show Current">
        <Switch
          checked={wire.showCurrents}
          onCheckedChange={(v) => {
            wire.setShowCurrents(v)
            push()
          }}
        />
      </Row>
      <Row label="Color">
        <SmallSelect
          value={wire.color}
          options={[...WIRE_COLORS]}
          onChange={(v) => {
            wire.setColor(v)
            push()
          }}
        />
      </Row>
      <Row label="Height">
        <SmallSelect
          value={String(wire.height)}
          options={WIRE_HEIGHTS.map((h) => ({
            value: String(h.value),
            label: h.label,
          }))}
          onChange={(v) => {
            wire.setHeight(Number(v))
            push()
          }}
        />
      </Row>
    </Section>
  )
})

export const CompileStatusIcon = observer(
  ({
    part,
    variant = 'panel',
  }: {
    part: ArduinoUnoPart
    variant?: 'panel' | 'editor'
  }) => {
    const s = part.compilationStatus
    const labels =
      variant === 'panel'
        ? {
            success: 'Succesfully compiled',
            error: 'Compilation Error',
            'not-compiled': 'Project has not been compiled',
          }
        : {
            success: 'Compiled successfully',
            error: 'Compilation error',
            'not-compiled': 'Project has not been compiled',
          }
    if (s === 'compiling') return null
    const icon =
      s === 'success' ? (
        <CheckCircle2 className="size-4 text-primary" />
      ) : s === 'error' ? (
        <XCircle className="size-4 text-red-400" />
      ) : (
        <AlertTriangle className="size-4 text-orange-400" />
      )
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{icon}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{labels[s]}</TooltipContent>
      </Tooltip>
    )
  },
)

const ArduinoProps = observer(({ part }: { part: ArduinoUnoPart }) => {
  const [open, setOpen] = useState(false)
  return (
    <Section title="Arduino Uno Properties">
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Code Editor
        </Button>
        <CompileStatusIcon part={part} />
      </div>
      <CodeEditorDrawer
        part={part}
        open={open}
        onClose={() => setOpen(false)}
      />
    </Section>
  )
})

const ChipProps = observer(({ part }: { part: EightPinChipPart }) => {
  const [open, setOpen] = useState(false)
  const push = () => part.circuit.project.pushSnapshotToHistory()
  return (
    <Section title="8 Pin Chip Properties">
      <Button
        size="sm"
        variant="secondary"
        className="mb-0.5 w-full text-sm"
        onClick={() => setOpen(true)}
      >
        Edit Spice Code
      </Button>
      <Row label="Chip Name">
        <Input
          className="h-8 max-w-[50%] text-sm"
          maxLength={10}
          value={part.chipName}
          onChange={(e) => part.setChipName(e.target.value)}
          onBlur={push}
        />
      </Row>
      {['1', '2', '3', '4', '5', '6', '7', '8'].map((pin) => (
        <Row key={pin} label={`Pin ${pin} Label`}>
          <Input
            className="h-8 max-w-[50%] text-sm"
            maxLength={25}
            value={part.pinLabels[pin] ?? ''}
            onChange={(e) => part.setPinLabel(pin, e.target.value)}
            onBlur={push}
          />
        </Row>
      ))}
      <SpiceDrawer part={part} open={open} onClose={() => setOpen(false)} />
    </Section>
  )
})

const LcdI2cProps = observer(({ part }: { part: Lcd1602I2cPart }) => (
  <Section title="LCD Properties">
    <Row label="I2C Address">
      <SmallSelect
        value={String(part.i2cAddress)}
        options={LCD_I2C_ADDRESSES.map((a) => ({
          value: String(a),
          label: `0x${a.toString(16).toUpperCase()}`,
        }))}
        onChange={(v) => {
          part.setI2cAddress(Number(v))
          part.circuit.project.pushSnapshotToHistory()
        }}
      />
    </Row>
  </Section>
))

/** Native range input styled to match the panel (no shadcn slider installed). */
export function RangeRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
  onCommit?: () => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[14px]">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-primary"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </div>
  )
}

const PotProps = observer(({ part }: { part: PotentiometerPart }) => {
  const push = () => part.circuit.project.pushSnapshotToHistory()
  return (
    <Section title="Potentiometer Properties">
      <Row label="Resistance">
        <UnitInput
          value={part.kohm}
          stringify={(v) => `${v.toFixed(2)}kohm`}
          parse={(s) => {
            const { value, unit } = ohmParser.parse(s)
            return unit === 'ohm' ? value / 1000 : value
          }}
          onChange={(v) => {
            part.setKohm(v)
            push()
          }}
        />
      </Row>
      <RangeRow
        label="Position"
        value={part.wiper}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => part.setWiper(v)}
        onCommit={push}
      />
    </Section>
  )
})

const Tmp36Props = observer(({ part }: { part: Tmp36Part }) => (
  <Section title="TMP36 Properties">
    <RangeRow
      label="Temperature"
      value={part.temperature}
      min={-40}
      max={125}
      step={0.5}
      format={(c) => `${c.toFixed(1)}°C / ${((c * 9) / 5 + 32).toFixed(0)}°F`}
      onChange={(v) => part.setTemperature(v)}
      onCommit={() => part.circuit.project.pushSnapshotToHistory()}
    />
  </Section>
))

/** Per-type property panel (null for parts without one). */
export const PartProperties = observer(function PartProperties({
  part,
}: {
  part: EditorPart
}) {
  if (part instanceof BatteryPart) return <BatteryProps part={part} />
  if (part instanceof ResistorPart) return <ResistorProps part={part} />
  if (part instanceof TactileSwitchPart) return <SwitchProps part={part} />
  if (part instanceof LedPart) return <LedProps part={part} />
  if (part instanceof NpnTransistorPart)
    return (
      <TransistorProps
        part={part}
        title="NPN Transistor Properties"
        options={NPN_MODEL_OPTIONS}
      />
    )
  if (part instanceof PnpTransistorPart)
    return (
      <TransistorProps
        part={part}
        title="PNP Transistor Properties"
        options={PNP_MODEL_OPTIONS}
      />
    )
  if (part instanceof CapacitorPart) return <CapacitorProps part={part} />
  if (part instanceof WireEndPart) return <WireProps part={part} />
  if (part instanceof ArduinoUnoPart) return <ArduinoProps part={part} />
  if (part instanceof EightPinChipPart) return <ChipProps part={part} />
  if (part instanceof Lcd1602I2cPart) return <LcdI2cProps part={part} />
  if (part instanceof PotentiometerPart) return <PotProps part={part} />
  if (part instanceof Tmp36Part) return <Tmp36Props part={part} />
  return null
})
