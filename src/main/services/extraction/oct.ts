/**
 * oct.ts — extract MCA `.OCT` downloads.
 *
 * Per the MCA portal's own note: downloaded documents have an `.OCT` extension
 * and must be extracted with a 7-zip-compatible tool, then opened as PDF.
 * In practice `.OCT` is a ZIP or 7z archive wrapping the real PDF. We use the
 * `7zip-bin` prebuilt binary (ships for win/mac/linux, no compilation) which
 * handles both formats, and we spawn it directly for full control + logging.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface ExtractionResult {
  outputDir: string
  files: string[] // absolute paths of every extracted file
  pdfs: string[] // just the PDFs (the artefacts we care about)
}

/** Resolve the bundled 7za binary path (overridable for tests). */
export function sevenZipPath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('7zip-bin') as { path7za: string }
  return mod.path7za
}

export async function extractOct(
  octPath: string,
  outputDir: string,
  binPath?: string
): Promise<ExtractionResult> {
  if (!existsSync(octPath)) throw new Error(`OCT file not found: ${octPath}`)
  mkdirSync(outputDir, { recursive: true })
  const bin = binPath ?? sevenZipPath()

  // `x` = extract with full paths; `-o<dir>` output; `-y` assume yes; `-bd` no progress
  await run(bin, ['x', octPath, `-o${outputDir}`, '-y', '-bd'])

  const files = walkFiles(outputDir)
  const pdfs = files.filter((f) => f.toLowerCase().endsWith('.pdf'))
  return { outputDir, files, pdfs }
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`7z exited ${code}: ${stderr.trim() || 'unknown error'}`))
    })
  })
}

function walkFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walkFiles(full))
    else out.push(full)
  }
  return out
}
