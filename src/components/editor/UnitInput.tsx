import { useEffect, useState } from 'react'
import { Input } from '#/components/ui/input'

interface Props {
  value: number
  stringify: (v: number) => string
  parse: (s: string) => number
  onChange: (v: number) => void
  className?: string
}

/** Text input that commits a parsed numeric value on blur / Enter; reverts on parse error. */
export function UnitInput({
  value,
  stringify,
  parse,
  onChange,
  className,
}: Props) {
  const [text, setText] = useState(() => stringify(value))
  useEffect(() => setText(stringify(value)), [value, stringify])

  const commit = () => {
    try {
      const v = parse(text)
      try {
        onChange(v)
      } catch (e) {
        console.warn(e)
      }
    } catch {
      setText(stringify(value))
    }
  }

  return (
    <Input
      className={className ?? 'h-8 max-w-[50%] rounded-md text-sm'}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}
