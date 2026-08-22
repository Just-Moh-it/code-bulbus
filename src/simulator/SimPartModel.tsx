import { useEffect, useRef, useState } from 'react'
import * as M from '#/editor/scene/models'
import type {
  IntensityHandle,
  LcdHandle,
  SpeedHandle,
} from '#/editor/scene/models'
import { stampModels } from '#/editor/scene/PartModel'
import type { Part } from '#/sim/part'
import {
  ArduinoUno,
  Battery,
  Capacitor,
  EightPinChip,
  Lcd1602,
  Lcd1602I2c,
  Led,
  Motor,
  Resistor,
  TactileSwitch,
} from '#/sim'

/** Subscribe a callback to the playback clock for this part's circuit. */
function useClock(part: Part, fn: () => void) {
  useEffect(() => part.circuit.clock.onChange(fn), [part, fn])
}

function LedView({ part }: { part: Led }) {
  const ref = useRef<IntensityHandle>(null)
  useClock(part, () => ref.current?.setIntensity(part.intensity))
  return <M.LedModel ref={ref} color={part.color} />
}

function ArduinoView({ part }: { part: ArduinoUno }) {
  const ref = useRef<IntensityHandle>(null)
  useClock(part, () => ref.current?.setIntensity(part.onboardLedIntensity))
  return <M.ArduinoUnoModel ref={ref} isOn />
}

function MotorView({ part }: { part: Motor }) {
  const ref = useRef<SpeedHandle>(null)
  useClock(part, () => ref.current?.setSpeed(part.speed))
  return <M.MotorModel ref={ref} />
}

function SwitchView({ part }: { part: TactileSwitch }) {
  const [pressed, setPressed] = useState(false)
  useEffect(() => {
    part.setPressed(pressed)
    part.samplers.pressed.setCollector(() => pressed)
  }, [part, pressed])
  return (
    <M.TactileSwitchModel
      pressed={pressed}
      onPress={() => (part.latching ? setPressed((p) => !p) : setPressed(true))}
      onRelease={() => {
        if (!part.latching) setPressed(false)
      }}
    />
  )
}

/** Redraw the glass whenever the controller's version changes (checked per clock tick). */
function LcdView({ part, i2c }: { part: Lcd1602 | Lcd1602I2c; i2c: boolean }) {
  const ref = useRef<LcdHandle>(null)
  const seen = useRef(-1)
  useClock(part, () => {
    if (part.lcd.version === seen.current) return
    seen.current = part.lcd.version
    ref.current?.update(part.snapshot)
  })
  return <M.Lcd1602Model ref={ref} i2c={i2c} />
}

/** Simulator-side model view: live values drive emissives / rotation / the switch cap. */
export function SimPartModel({ part }: { part: Part }) {
  if (part instanceof Led) return <LedView part={part} />
  if (part instanceof ArduinoUno) return <ArduinoView part={part} />
  if (part instanceof Motor) return <MotorView part={part} />
  if (part instanceof TactileSwitch) return <SwitchView part={part} />
  if (part instanceof Battery) return <M.BatteryModel voltage={part.voltage} />
  if (part instanceof Resistor) return <M.ResistorModel kohms={part.kohm} />
  if (part instanceof Capacitor) return <M.CapacitorModel />
  if (part instanceof EightPinChip)
    return <M.EightPinChipModel name={part.chipName} />
  if (part instanceof Lcd1602) return <LcdView part={part} i2c={false} />
  if (part instanceof Lcd1602I2c) return <LcdView part={part} i2c />
  const Model = stampModels[part.type]
  return <Model />
}
