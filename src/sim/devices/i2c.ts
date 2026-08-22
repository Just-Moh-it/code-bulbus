import type { AVRTWI, TWIEventHandler } from 'avr8js'

/** A slave on the emulated I²C bus. */
export interface I2CDevice {
  /** Called on START/repeated START addressed to this device. */
  connect?: (write: boolean) => void
  writeByte: (value: number) => boolean
  readByte: (ack: boolean) => number
  stop?: () => void
}

/**
 * TWI event handler that multiplexes the ATmega's single bus across attached
 * devices by 7-bit address. Transactions complete synchronously (the real
 * peripheral is far slower than our devices, so ACKing immediately is fine).
 */
export class I2CBus implements TWIEventHandler {
  private devices = new Map<number, I2CDevice>()
  private active: I2CDevice | null = null

  constructor(private twi: AVRTWI) {}

  attach(address: number, device: I2CDevice) {
    this.devices.set(address & 0x7f, device)
    return () => {
      if (this.devices.get(address & 0x7f) === device)
        this.devices.delete(address & 0x7f)
    }
  }

  start() {
    this.twi.completeStart()
  }

  stop() {
    this.active?.stop?.()
    this.active = null
    this.twi.completeStop()
  }

  connectToSlave(addr: number, write: boolean) {
    const dev = this.devices.get(addr & 0x7f) ?? null
    this.active = dev
    dev?.connect?.(write)
    this.twi.completeConnect(!!dev)
  }

  writeByte(value: number) {
    const ack = this.active ? this.active.writeByte(value & 0xff) : false
    this.twi.completeWrite(ack)
  }

  readByte(ack: boolean) {
    this.twi.completeRead(this.active ? this.active.readByte(ack) & 0xff : 0xff)
  }
}

/**
 * PCF8574 8-bit quasi-bidirectional port expander. Every byte written becomes
 * the port value; reads return the port (we have no external drivers).
 */
export class PCF8574 implements I2CDevice {
  port = 0xff
  private listeners = new Set<(value: number, previous: number) => void>()

  onChange(fn: (value: number, previous: number) => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  writeByte(value: number) {
    const prev = this.port
    this.port = value
    if (prev !== value) this.listeners.forEach((l) => l(value, prev))
    return true
  }

  readByte() {
    return this.port
  }
}
