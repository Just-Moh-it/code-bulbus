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
import { Island, IslandTitle } from '#/components/ui/island'
import { PartProperties, RangeRow, Row, Section } from './Properties'
import { PALETTE, PART_LABELS } from '#/lib/projects'
import type { EditorPart, EditorProject, StampType } from '#/editor/models'
import type { Simulator } from '#/simulator/model'
import { ArduinoUno, Potentiometer, Tmp36 } from '#/sim'

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
        size="icon-sm"
        variant="outline"
        aria-label={label}
        onClick={onClick}
        className="text-muted-foreground hover:text-foreground"
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
/** Island title for a selection: clicking it deselects and returns to the palette. */
function BackTitle({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="-ml-1 flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 py-1 text-left text-[13px] font-semibold hover:bg-muted"
    >
      <ChevronLeft className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </button>
  )
}

const Palette = observer(function Palette({
  project,
}: {
  project: EditorProject
}) {
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 py-3">
      <h3 className="px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Parts
      </h3>
      <ul className="flex select-none flex-col gap-px">
        {PALETTE.map((p) => {
          const active = project.stampType === p.stampType
          return (
            <li
              key={p.stampType}
              className={`flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-[13px] ${active ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-muted'}`}
              onPointerDown={() =>
                project.setStampType(p.stampType as StampType)
              }
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-muted p-1">
                <img
                  src={p.img}
                  alt={p.label}
                  draggable={false}
                  className="max-h-full max-w-full object-contain"
                  style={{ mixBlendMode: 'darken' }}
                />
              </div>
              <span className="truncate">{p.label}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
})

const SelectionBody = observer(function SelectionBody({
  project,
  part,
}: {
  project: EditorProject
  part: EditorPart
}) {
  const push = () => project.pushSnapshotToHistory()
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
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
    <Island
      resizeEdge="right"
      storageKey="bulbus.panel.build"
      defaultWidth={256}
      heightClass="min-h-0 flex-1"
      header={
        part ? (
          <BackTitle
            label={PART_LABELS[part.type] ?? part.type}
            onBack={() => project.setSelection(null)}
          />
        ) : (
          <IslandTitle>Build</IslandTitle>
        )
      }
    >
      {part ? (
        <SelectionBody project={project} part={part} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <CameraSection target={project} multiple />
          <Palette project={project} />
        </div>
      )}
    </Island>
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
      <pre className="h-28 w-full overflow-auto rounded-sm border border-border bg-muted p-2 font-mono text-xs leading-4">
        {part.logs.length === 0 ? (
          <span className="text-muted-foreground">No logs.</span>
        ) : (
          part.logs
        )}
      </pre>
    </Section>
  )
})

/** Live knobs while a simulation runs: the engine reads these on the next window. */
function SimLiveControls({ part }: { part: Potentiometer | Tmp36 }) {
  const [, bump] = useState(0)
  const refresh = () => bump((n) => n + 1)
  if (part instanceof Potentiometer)
    return (
      <Section title="Potentiometer">
        <RangeRow
          label="Position"
          value={part.wiper}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => {
            part.setWiper(v)
            refresh()
          }}
        />
      </Section>
    )
  return (
    <Section title="TMP36">
      <RangeRow
        label="Ambient"
        value={part.temperature}
        min={-40}
        max={125}
        step={0.5}
        format={(c) => `${c.toFixed(1)}°C / ${((c * 9) / 5 + 32).toFixed(0)}°F`}
        onChange={(v) => {
          part.setTemperature(v)
          refresh()
        }}
      />
    </Section>
  )
}

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
    <Island
      resizeEdge="right"
      storageKey="bulbus.panel.sim"
      defaultWidth={256}
      heightClass="h-auto max-h-full self-start"
      header={
        part ? (
          <BackTitle
            label={PART_LABELS[part.type] ?? part.type}
            onBack={() => simulator.setSelection(null)}
          />
        ) : (
          <IslandTitle>Simulation</IslandTitle>
        )
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {part ? (
          <>
            <CameraSection
              target={{
                fitCamera: () => simulator.fitCameraTo(part),
                lookAtOnAxis: (a) => simulator.lookAtPartOnAxis(part, a),
              }}
              multiple={false}
            />
            {part instanceof ArduinoUno && <ArduinoLogs part={part} />}
            {(part instanceof Potentiometer || part instanceof Tmp36) && (
              <SimLiveControls part={part} />
            )}
          </>
        ) : (
          <CameraSection target={simulator} multiple />
        )}
      </div>
    </Island>
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
