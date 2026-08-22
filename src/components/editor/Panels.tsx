import { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { ChevronLeft } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Switch } from '#/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { PartProperties, Row, Section } from './Properties'
import { PALETTE, PART_LABELS } from '#/lib/projects'
import type { EditorPart, EditorProject, StampType } from '#/editor/models'
import type { Simulator } from '#/simulator/model'
import { ArduinoUno } from '#/sim'

const PANEL = 'hidden h-full min-h-0 w-64 shrink-0 flex-col bg-white md:flex'

// ------------------------------------------------------------ icon buttons
const IconBtn = ({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        size="sm"
        variant="secondary"
        aria-label={label}
        onClick={onClick}
        className="h-8 w-8 p-0"
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">{label}</TooltipContent>
  </Tooltip>
)

const Cube = ({
  x = 0,
  y = 0,
  s = 8,
}: {
  x?: number
  y?: number
  s?: number
}) => (
  <g transform={`translate(${x} ${y})`}>
    <path
      d={`M${s / 2} 0 L${s} ${s / 4} L${s / 2} ${s / 2} L0 ${s / 4} Z`}
      fill="currentColor"
      opacity={0.9}
    />
    <path
      d={`M0 ${s / 4} L${s / 2} ${s / 2} L${s / 2} ${s} L0 ${s * 0.75} Z`}
      fill="currentColor"
      opacity={0.6}
    />
    <path
      d={`M${s} ${s / 4} L${s / 2} ${s / 2} L${s / 2} ${s} L${s} ${s * 0.75} Z`}
      fill="currentColor"
      opacity={0.4}
    />
  </g>
)
const FitIcon = ({ multiple }: { multiple: boolean }) => (
  <svg viewBox="0 0 33 26" className="size-5">
    <path
      d="M1 8V1h7M25 1h7v7M1 18v7h7M25 25h7v-7"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    />
    {multiple ? (
      <>
        <Cube x={7} y={7} s={9} />
        <Cube x={17} y={9} s={9} />
      </>
    ) : (
      <Cube x={11.5} y={7} s={10} />
    )}
  </svg>
)
const LookIcon = ({ dir }: { dir: 'left' | 'down' | 'right' }) => (
  <svg viewBox="0 0 20 13" className="size-5">
    {dir === 'left' && (
      <path
        d="M1 6.5h6M5 4l2 2.5L5 9"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    )}
    {dir === 'right' && (
      <path
        d="M19 6.5h-6M15 4l-2 2.5 2 2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    )}
    {dir === 'down' && (
      <path
        d="M10 0v5M8 3l2 2 2-2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      />
    )}
    <Cube
      x={dir === 'down' ? 6 : dir === 'left' ? 9 : 3}
      y={dir === 'down' ? 5 : 2}
      s={8}
    />
  </svg>
)
const RotateIcon = ({ cw }: { cw: boolean }) => (
  <svg
    viewBox="0 0 19 13"
    className="size-5"
    style={{ transform: cw ? undefined : 'scaleX(-1)' }}
  >
    <path
      d="M3 3a6 4 0 0 1 12 0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    />
    <path
      d="M13 1l2 2-2 2"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    />
    <Cube x={5.5} y={4} s={8} />
  </svg>
)

// --------------------------------------------------------- camera section
type CameraTarget = {
  fitCamera: () => void
  lookAtOnAxis: (a: 'x' | 'y' | 'z') => void
}

export function CameraSection({
  target,
  multiple,
}: {
  target: CameraTarget
  multiple: boolean
}) {
  return (
    <Section title="Camera">
      <div className="flex gap-2.5">
        <IconBtn
          label={multiple ? 'Fit to Scene' : 'Fit to Object'}
          onClick={() => target.fitCamera()}
        >
          <FitIcon multiple={multiple} />
        </IconBtn>
        <IconBtn label="Look at Side" onClick={() => target.lookAtOnAxis('x')}>
          <LookIcon dir="left" />
        </IconBtn>
        <IconBtn label="Look at Top" onClick={() => target.lookAtOnAxis('y')}>
          <LookIcon dir="down" />
        </IconBtn>
        <IconBtn label="Look at Side" onClick={() => target.lookAtOnAxis('z')}>
          <LookIcon dir="right" />
        </IconBtn>
      </div>
    </Section>
  )
}

// ------------------------------------------------------------ left panel
/** "< Back" header used when the panel shows a selection; clicking also deselects. */
function BackHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1 border-b border-border/60 px-4 py-3 text-left text-sm font-semibold hover:bg-gray-50"
    >
      <ChevronLeft className="size-4" />
      {label}
    </button>
  )
}

const Palette = observer(function Palette({
  project,
}: {
  project: EditorProject
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-5">
      <h3 className="ml-2 text-sm font-bold">Insert Part</h3>
      <ul className="flex select-none flex-col gap-1">
        {PALETTE.map((p) => (
          <li
            key={p.stampType}
            className={`cursor-pointer rounded-lg p-2 hover:bg-gray-100 ${project.stampType === p.stampType ? 'bg-gray-100' : ''}`}
            onPointerDown={() => project.setStampType(p.stampType as StampType)}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-gray-200 p-1.5">
                <img
                  src={p.img}
                  alt={p.label}
                  draggable={false}
                  className="max-h-full max-w-full object-contain"
                  style={{ mixBlendMode: 'darken' }}
                />
              </div>
              <span>{p.label}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
})

const SelectionPanel = observer(function SelectionPanel({
  project,
  part,
}: {
  project: EditorProject
  part: EditorPart
}) {
  const push = () => project.pushSnapshotToHistory()
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <BackHeader
        label={PART_LABELS[part.type] ?? part.type}
        onBack={() => project.setSelection(null)}
      />
      <CameraSection target={part} multiple={false} />
      <Section title="Rotation">
        <div className="flex gap-2.5">
          <IconBtn
            label="Rotate Clockwise"
            onClick={() => {
              part.rotate(-Math.PI / 2)
              push()
            }}
          >
            <RotateIcon cw />
          </IconBtn>
          <IconBtn
            label="Rotate Anticlockwise"
            onClick={() => {
              part.rotate(Math.PI / 2)
              push()
            }}
          >
            <RotateIcon cw={false} />
          </IconBtn>
        </div>
      </Section>
      {part.type !== 'breadboard' && (
        <Section title="Inspect">
          <Row label="Show Labels">
            <Switch
              checked={part.showLabels}
              onCheckedChange={(v) => {
                part.setShowLabels(v)
                push()
              }}
            />
          </Row>
          <Row label="Show Voltages">
            <Switch
              checked={part.showVoltages}
              onCheckedChange={(v) => {
                part.setShowVoltages(v)
                push()
              }}
            />
          </Row>
        </Section>
      )}
      <PartProperties key={part.id} part={part} />
    </div>
  )
})

/**
 * The authoritative left panel: the palette when nothing is selected,
 * the selection's properties (with a Back button that deselects) otherwise.
 */
export const EditorLeftPanel = observer(function EditorLeftPanel({
  project,
}: {
  project: EditorProject
}) {
  const part = project.selection
  return (
    <aside className={`${PANEL} border-r border-border`}>
      {part ? (
        <SelectionPanel project={project} part={part} />
      ) : (
        <>
          <CameraSection target={project} multiple />
          <Palette project={project} />
        </>
      )}
    </aside>
  )
})

// -------------------------------------------------------------- simulator
const ArduinoLogs = observer(function ArduinoLogs({
  part,
}: {
  part: ArduinoUno
}) {
  return (
    <Section title="Arduino Logs">
      <pre className="h-28 w-full overflow-auto rounded-md bg-muted p-2 font-mono text-sm leading-[0.8rem]">
        {part.logs.length === 0 ? (
          <span className="text-gray-400">No Logs.</span>
        ) : (
          part.logs
        )}
      </pre>
    </Section>
  )
})

/** Simulator left panel: scene camera, or the selected part's camera + readouts with a Back button. */
export const SimLeftPanel = observer(function SimLeftPanel({
  simulator,
}: {
  simulator: Simulator
}) {
  const part = simulator.selection
  const [, force] = useForceTick(simulator, 30)
  void force
  return (
    <aside className={`${PANEL} border-r border-border`}>
      {part ? (
        <div className="flex flex-1 flex-col overflow-y-auto">
          <BackHeader
            label={PART_LABELS[part.type] ?? part.type}
            onBack={() => simulator.setSelection(null)}
          />
          <CameraSection
            target={{
              fitCamera: () => simulator.fitCameraTo(part),
              lookAtOnAxis: (a) => simulator.lookAtPartOnAxis(part, a),
            }}
            multiple={false}
          />
          {part instanceof ArduinoUno && <ArduinoLogs part={part} />}
        </div>
      ) : (
        <CameraSection target={simulator} multiple />
      )}
    </aside>
  )
})

/** Re-render every N clock ticks (logs are plain strings on the engine part). */
function useForceTick(simulator: Simulator, every: number) {
  const s = useState(0)
  useEffect(
    () =>
      simulator.circuit.clock.onChange(() => {
        if (simulator.circuit.clock.tick % every === 0) s[1]((n) => n + 1)
      }),
    [simulator, every, s],
  )
  return s
}
