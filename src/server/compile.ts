import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface SketchFile {
  content: string
  fileExtension?: string
  order?: number
}
export type SketchFiles = Record<string, SketchFile>

/** Same response shape diode's compile service returned. */
export interface CompileResponse {
  data?: string // Intel HEX
  stdout: string
  stderr: string
  error?: boolean
}

export const FQBN = 'arduino:avr:uno'
const ARDUINO_CLI = process.env.ARDUINO_CLI ?? 'arduino-cli'

/**
 * Compile a sketch with arduino-cli and return the HEX.
 * `main.ino` is renamed to `<sketch>.ino` as arduino-cli requires.
 */
export async function compileSketch(
  files: SketchFiles,
): Promise<CompileResponse> {
  const root = await mkdtemp(join(tmpdir(), 'bulbus-'))
  const sketchDir = join(root, 'sketch')
  const outDir = join(root, 'out')
  try {
    await mkdir(sketchDir)
    await mkdir(outDir)
    for (const [name, file] of Object.entries(files)) {
      const safe = name.replace(/[^\w.-]/g, '_')
      const target = safe === 'main.ino' ? 'sketch.ino' : safe
      await writeFile(join(sketchDir, target), file.content, 'utf8')
    }
    const { stdout, stderr } = await execFileAsync(
      ARDUINO_CLI,
      [
        'compile',
        '--fqbn',
        FQBN,
        '--output-dir',
        outDir,
        '--no-color',
        sketchDir,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    )
    const hex = await readFile(join(outDir, 'sketch.ino.hex'), 'utf8')
    return { data: hex, stdout, stderr }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return {
      error: true,
      stdout: e.stdout ?? '',
      stderr: e.stderr || e.message || String(err),
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
