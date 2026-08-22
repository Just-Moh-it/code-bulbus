import type { ArduinoUnoPart } from '#/editor/models'

/** Same flow as the reference: POST files → {data: hex} | {error, stderr}. Endpoint is our own /api/compile. */
export async function compileArduino(part: ArduinoUnoPart) {
  part.setCompilationStatus('compiling')
  part.setCompilationOutput('')
  try {
    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(part.files),
    })
    const data = (await res.json()) as {
      error?: boolean
      stderr?: string
      stdout?: string
      data?: string
    }
    if (data.error) {
      part.setCompilationStatus('error')
      part.setCompilationOutput(data.stderr ?? '')
    }
    if (data.data) {
      part.setCompilationStatus('success')
      part.setHexFile(data.data)
      part.setCompilationOutput(data.stdout ?? '')
    }
  } catch (e) {
    console.log(e)
    part.setCompilationStatus('error')
    part.setCompilationOutput('Could not reach compile endpoint.')
  }
}

export const FILE_EXTENSIONS = {
  arduino: '.ino',
  python: '.py',
  markdown: '.md',
} as const
export const VALID_EXTENSIONS: Record<string, string> = {
  '.ino': '.ino',
  '.md': '.md',
}
export const isValidExtension = (ext: string) => ext in VALID_EXTENSIONS
