import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from './button'
import { cn } from '#/lib/utils.ts'

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n))

function readStored(key: string, fallback: number) {
  if (typeof localStorage === 'undefined') return fallback
  const raw = Number(localStorage.getItem(key))
  return Number.isFinite(raw) && raw > 0 ? raw : fallback
}

/** Title slot for an island header. */
export function IslandTitle({ children }: { children: ReactNode }) {
  return (
    <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
      {children}
    </span>
  )
}

/**
 * A floating panel over the canvas: draggable edge to resize, chevron to
 * collapse to its header. Width and collapsed state persist per `storageKey`,
 * so the layout survives reloads and simulation start/stop.
 */
export function Island({
  resizeEdge,
  storageKey,
  defaultWidth,
  minWidth = 208,
  maxWidth = 620,
  header,
  heightClass = 'h-full',
  anchor = 'top',
  children,
  className,
}: {
  /** Which edge carries the resize handle — the one facing the canvas. */
  resizeEdge: 'left' | 'right'
  storageKey: string
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
  /** Pass a function to render differently while collapsed. */
  header: ReactNode | ((collapsed: boolean) => ReactNode)
  /** Height while expanded; collapsed islands always hug their header. */
  heightClass?: string
  /** Bottom-anchored islands collapse toward the bottom edge and expand upward. */
  anchor?: 'top' | 'bottom'
  children: ReactNode
  className?: string
}) {
  const widthKey = `${storageKey}.width`
  const collapsedKey = `${storageKey}.collapsed`
  const [width, setWidth] = useState(() => readStored(widthKey, defaultWidth))
  const [collapsed, setCollapsed] = useState(
    () => readStored(collapsedKey, 0) === 1,
  )
  const drag = useRef<{ x: number; width: number } | null>(null)

  useEffect(() => {
    localStorage.setItem(widthKey, String(width))
  }, [width, widthKey])
  useEffect(() => {
    localStorage.setItem(collapsedKey, collapsed ? '1' : '0')
  }, [collapsed, collapsedKey])

  return (
    <aside
      style={{ width }}
      className={cn(
        'glass pointer-events-auto relative flex shrink-0 flex-col overflow-hidden rounded-md border',
        collapsed
          ? anchor === 'bottom'
            ? 'h-auto self-end'
            : 'h-auto self-start'
          : heightClass,
        className,
      )}
    >
      <header
        className={cn(
          'flex h-10 shrink-0 items-center gap-1 pr-1.5 pl-3',
          !collapsed && 'border-b border-border',
          collapsed && 'cursor-pointer',
        )}
        onClick={collapsed ? () => setCollapsed(false) : undefined}
      >
        {typeof header === 'function' ? header(collapsed) : header}
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          aria-expanded={!collapsed}
          onClick={(e) => {
            e.stopPropagation()
            setCollapsed((c) => !c)
          }}
        >
          {anchor === 'bottom' ? (
            <ChevronUp
              className={cn('transition-transform', !collapsed && 'rotate-180')}
            />
          ) : (
            <ChevronDown
              className={cn('transition-transform', !collapsed && 'rotate-180')}
            />
          )}
        </Button>
      </header>
      {!collapsed && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      )}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        onPointerDown={(e) => {
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, width }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const dx = e.clientX - drag.current.x
          setWidth(
            clamp(
              drag.current.width + (resizeEdge === 'right' ? dx : -dx),
              minWidth,
              maxWidth,
            ),
          )
        }}
        onPointerUp={(e) => {
          drag.current = null
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onDoubleClick={() => setWidth(defaultWidth)}
        className={cn(
          'absolute inset-y-0 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40',
          resizeEdge === 'right' ? 'right-0' : 'left-0',
        )}
      />
    </aside>
  )
}
