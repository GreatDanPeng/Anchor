import * as pdfjsLib from 'pdfjs-dist'
// @ts-expect-error -- Vite's ?url import returns a string path, no type declaration for it.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB

async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    pages.push(text)
  }
  return pages.join('\n\n')
}

/** Extracts plain text from a user-attached file. Supports .txt/.md and .pdf. */
export async function extractFileText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name} is too large (max 15 MB).`)
  }
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(file)
  }
  return file.text()
}
