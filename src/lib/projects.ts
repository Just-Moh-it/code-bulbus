import type { ProjectJSON } from '#/sim/types'

export const PALETTE: { label: string; stampType: string; img: string }[] = [
  {
    label: 'Arduino Uno',
    stampType: 'arduino-uno',
    img: '/parts/arduino-uno.webp',
  },
  { label: 'Wire', stampType: 'wire', img: '/parts/wire.webp' },
  { label: 'Resistor', stampType: 'resistor', img: '/parts/resistor.webp' },
  { label: 'Led', stampType: 'led', img: '/parts/led.webp' },
  { label: 'Motor', stampType: 'motor', img: '/parts/motor.webp' },
  { label: '555 Timer', stampType: 'timer', img: '/parts/timer.webp' },
  {
    label: '8 Pin Custom Chip',
    stampType: '8-pin-chip',
    img: '/parts/timer.webp',
  },
  {
    label: 'Tactile Switch',
    stampType: 'tactile-switch',
    img: '/parts/switch.webp',
  },
  { label: 'Capacitor', stampType: 'capacitor', img: '/parts/capacitor.webp' },
  {
    label: 'NPN Transistor',
    stampType: 'npn-transistor',
    img: '/parts/bjt-transistor.webp',
  },
  {
    label: 'PNP Transistor',
    stampType: 'pnp-transistor',
    img: '/parts/bjt-transistor.webp',
  },
  {
    label: 'Breadboard',
    stampType: 'breadboard',
    img: '/parts/breadboard.webp',
  },
  { label: 'Battery', stampType: 'battery', img: '/parts/battery.webp' },
]

/** The reference's blank template: breadboard + 9V battery wired to the top rails. */
export function defaultProject(
  id: string,
  userId?: string | null,
): ProjectJSON {
  return {
    id,
    user_id: userId ?? null,
    name: 'Untitled',
    featured: false,
    circuit: {
      parts: [
        {
          id: 'd1b481ad-66ed-414d-b956-de981a3baaad',
          type: 'breadboard',
          parentId: null,
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
          terminals: [],
          showLabels: false,
        },
        {
          id: 'ecc16412-1c5d-4436-bd45-91d3b7eca244',
          type: 'battery',
          voltage: 9,
          parentId: null,
          position: { x: 12.260855926250155, y: 0, z: -0.022582433790346634 },
          rotation: 1.5707963267948966,
          terminals: [],
          showLabels: false,
        },
        {
          id: '216a67ad-944b-4523-80b1-3c79121406ab',
          type: 'wire-end',
          parentId: 'd1b481ad-66ed-414d-b956-de981a3baaad',
          position: {
            x: 7.368539999996322,
            y: 0.84973808070585,
            z: -2.158604100404944,
          },
          rotation: 0,
          terminals: [{ name: 't1', connections: ['positive.a.50'] }],
          showLabels: false,
        },
        {
          id: 'f1be325f-c092-4708-9e88-0cba9d6e5de3',
          type: 'wire-end',
          parentId: 'ecc16412-1c5d-4436-bd45-91d3b7eca244',
          position: {
            x: -0.12447561564445486,
            y: 1.5003962936994435,
            z: -1.396274147033692,
          },
          rotation: 2.4492935982947064e-16,
          terminals: [{ name: 't1', connections: ['+'] }],
          showLabels: false,
        },
        {
          id: 'bdbfa103-0c4b-4107-824f-854049e3b329',
          type: 'wire-end',
          parentId: 'd1b481ad-66ed-414d-b956-de981a3baaad',
          position: {
            x: 7.368539999996322,
            y: 0.84973808070585,
            z: -2.412604100404944,
          },
          rotation: 0,
          terminals: [{ name: 't1', connections: ['negative.a.50'] }],
          showLabels: false,
        },
        {
          id: '776bc371-f794-4e60-a3b7-4a7b48b19081',
          type: 'wire-end',
          parentId: 'ecc16412-1c5d-4436-bd45-91d3b7eca244',
          position: {
            x: 0.12447561564445486,
            y: 1.5003962936994435,
            z: -1.396274147033692,
          },
          rotation: 2.4492935982947064e-16,
          terminals: [{ name: 't1', connections: ['-'] }],
          showLabels: false,
        },
      ],
      wires: [
        {
          id: '75799a0b-1e50-4994-972e-59973a2c5404',
          color: 'Crimson',
          partOneId: '216a67ad-944b-4523-80b1-3c79121406ab',
          partTwoId: 'f1be325f-c092-4708-9e88-0cba9d6e5de3',
        },
        {
          id: '9304dad3-5076-4818-b535-ec7daae3cabe',
          color: 'Black',
          partOneId: 'bdbfa103-0c4b-4107-824f-854049e3b329',
          partTwoId: '776bc371-f794-4e60-a3b7-4a7b48b19081',
        },
      ],
    },
  }
}

/** True when every Arduino in the circuit has a successful compile. */
export function allArduinosCompiled(
  parts: ProjectJSON['circuit']['parts'] | undefined,
) {
  if (!parts) return false
  return parts.every(
    (p) => p.type !== 'arduino-uno' || p.compilationStatus === 'success',
  )
}

export const EMBED_BASE =
  typeof window !== 'undefined' ? window.location.origin : ''
export const embedUrl = (id: string) => `${EMBED_BASE}/embed/${id}`
export const embedCode = (id: string, name: string) =>
  `<iframe src="${embedUrl(id)}" style="width:100%; height:500px; border:1px solid rgba(0,0,0,0.1); border-radius: 0.5rem; overflow:hidden;" title="${name}" allow="accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; hid; microphone; midi; payment; usb; vr; xr-spatial-tracking" sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts" ></iframe>`

export function debounce<TArgs extends unknown[]>(
  fn: (...a: TArgs) => void,
  ms: number,
) {
  let t: ReturnType<typeof setTimeout> | null = null
  return (...args: TArgs) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}
