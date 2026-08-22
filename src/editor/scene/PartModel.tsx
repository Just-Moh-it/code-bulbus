import { observer } from 'mobx-react-lite'
import type { ComponentType } from 'react'
import * as M from './models'
import type { EditorPart } from '#/editor/models'
import {
  ArduinoUnoPart,
  BatteryPart,
  CapacitorPart,
  EightPinChipPart,
  LedPart,
  ResistorPart,
  TactileSwitchPart,
} from '#/editor/models'
import { PartType } from '#/sim/types'
import type { PartType as PartTypeT } from '#/sim/types'

/** Static model component per type (used by the stamp ghost). */
export const stampModels: Record<PartTypeT, ComponentType> = {
  [PartType.Breadboard]: M.BreadboardModel,
  [PartType.RaspberryPi]: M.RaspberryPiModel,
  [PartType.Resistor]: M.ResistorModel,
  [PartType.TactileSwitch]: M.TactileSwitchModel,
  [PartType.WireEnd]: M.WireEndModel,
  [PartType.Battery]: M.BatteryModel,
  [PartType.Led]: M.LedModel,
  [PartType.NpnTransistor]: M.TransistorModel,
  [PartType.PnpTransistor]: M.TransistorModel,
  [PartType.Capacitor]: M.CapacitorModel,
  [PartType.Timer]: M.TimerModel,
  [PartType.ArduinoUno]: M.ArduinoUnoModel,
  [PartType.Motor]: M.MotorModel,
  [PartType.EightPinChip]: M.EightPinChipModel,
  [PartType.Lcd1602]: M.Lcd1602Model,
  [PartType.Lcd1602I2c]: Lcd1602I2cStamp,
}

function Lcd1602I2cStamp() {
  return <M.Lcd1602Model i2c />
}

/** Editor-side model view: passes the part's observable props to its GLB component. */
export const EditorPartModel = observer(function EditorPartModel({
  part,
}: {
  part: EditorPart
}) {
  if (part instanceof BatteryPart)
    return <M.BatteryModel voltage={part.voltage} />
  if (part instanceof ResistorPart) return <M.ResistorModel kohms={part.kohm} />
  if (part instanceof LedPart) return <M.LedModel color={part.color} />
  if (part instanceof CapacitorPart)
    return <M.CapacitorModel capacitance={part.capacitance} />
  if (part instanceof EightPinChipPart)
    return <M.EightPinChipModel name={part.chipName} />
  if (part instanceof TactileSwitchPart) return <M.TactileSwitchModel />
  if (part instanceof ArduinoUnoPart) return <M.ArduinoUnoModel />
  const Model = stampModels[part.type]
  return <Model />
})
