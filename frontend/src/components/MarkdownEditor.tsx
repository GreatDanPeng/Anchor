import { useEffect, useRef, useState } from 'react'
import {
  Bold,
  Code,
  Image,
  Italic,
  Link,
  List,
  Loader2,
  Save,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { api } from '../api/client'

interface Props {
  content: string
  onSave: (newContent: string) => Promise<void>
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function wrapInline(
  value: string,
  ss: number,
  se: number,
  before: string,
  after: string,
) {
  const selected = value.slice(ss, se)
  return {
    value: value.slice(0, ss) + before + selected + after + value.slice(se),
    ss: ss + before.length,
    se: ss + before.length + selected.length,
  }
}

function prefixLine(value: string, ss: number, se: number, prefix: string) {
  const lineStart = value.lastIndexOf('\n', ss - 1) + 1
  return {
    value: value.slice(0, lineStart) + prefix + value.slice(lineStart),
    ss: ss + prefix.length,
    se: se + prefix.length,
  }
}

// ── Toolbar button ─────────────────────────────────────────────────────────

function TBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault() // keep textarea focused
        onClick()
      }}
      title={title}
      className="p-1.5 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
    >
      {children}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function MarkdownEditor({ content, onSave }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [draft, setDraft] = useState(content)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync draft when content changes externally (e.g. after regeneration)
  useEffect(() => {
    setDraft(content)
    setMode('view')
  }, [content])

  const enterEdit = () => {
    setMode('edit')
    setSaveError(null)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const handleDiscard = () => {
    setDraft(content)
    setMode('view')
    setSaveError(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(draft)
      setMode('view')
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Format helpers that operate on the live textarea ──────────────────────

  const applyFormat = (
    type: 'bold' | 'italic' | 'code' | 'link' | 'h2' | 'bullet',
  ) => {
    const ta = textareaRef.current
    if (!ta) return
    const { selectionStart: ss, selectionEnd: se, value } = ta
    let result: { value: string; ss: number; se: number }

    switch (type) {
      case 'bold':   result = wrapInline(value, ss, se, '**', '**'); break
      case 'italic': result = wrapInline(value, ss, se, '*', '*');   break
      case 'code':   result = wrapInline(value, ss, se, '`', '`');   break
      case 'link':   result = wrapInline(value, ss, se, '[', '](url)'); break
      case 'h2':     result = prefixLine(value, ss, se, '## ');      break
      case 'bullet': result = prefixLine(value, ss, se, '- ');       break
    }

    setDraft(result.value)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(result.ss, result.se)
    }, 0)
  }

  // ── Image upload ─────────────────────────────────────────────────────────

  const insertImageMarkdown = (url: string, name: string) => {
    const ta = textareaRef.current
    const ss = ta?.selectionStart ?? draft.length
    const se = ta?.selectionEnd ?? draft.length
    const md = `\n![${name}](${url})\n`
    const newDraft = draft.slice(0, ss) + md + draft.slice(se)
    setDraft(newDraft)
    setTimeout(() => {
      ta?.focus()
      ta?.setSelectionRange(ss + md.length, ss + md.length)
    }, 0)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const { url, name } = await api.upload(file)
      insertImageMarkdown(url, name)
    } catch {
      setSaveError('Image upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    const file = e.dataTransfer.files[0]
    if (!file?.type.startsWith('image/')) return
    e.preventDefault()
    setUploading(true)
    try {
      const { url, name } = await api.upload(file)
      insertImageMarkdown(url, name)
    } catch {
      setSaveError('Image upload failed')
    } finally {
      setUploading(false)
    }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const meta = e.metaKey || e.ctrlKey
    if (meta && e.key === 's') { e.preventDefault(); handleSave(); return }
    if (e.key === 'Escape') { handleDiscard(); return }
    if (meta && e.key === 'b') { e.preventDefault(); applyFormat('bold'); return }
    if (meta && e.key === 'i') { e.preventDefault(); applyFormat('italic'); return }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (mode === 'view') {
    return (
      <div
        onClick={enterEdit}
        className="group cursor-text rounded-lg hover:bg-white hover:shadow-sm transition-all p-1 -m-1"
        title="Click to edit"
      >
        <article className="prose prose-slate max-w-none prose-headings:font-bold prose-h2:text-base prose-h2:mt-6 prose-h2:mb-2 prose-p:text-gray-700 prose-li:text-gray-700">
          <ReactMarkdown
            components={{
              img: ({ src, alt }) => (
                <img
                  src={src?.startsWith('/uploads') ? `http://localhost:8000${src}` : src}
                  alt={alt}
                  className="max-w-full rounded-lg my-3 border border-gray-100"
                />
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
        <p className="text-xs text-gray-300 mt-4 opacity-0 group-hover:opacity-100 transition-opacity select-none">
          Click anywhere to edit · Drag &amp; drop images
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg flex-wrap">
        <TBtn onClick={() => applyFormat('bold')}   title="Bold (⌘B)">     <Bold size={14} /></TBtn>
        <TBtn onClick={() => applyFormat('italic')} title="Italic (⌘I)">   <Italic size={14} /></TBtn>
        <TBtn onClick={() => applyFormat('code')}   title="Inline code">    <Code size={14} /></TBtn>
        <TBtn onClick={() => applyFormat('link')}   title="Link">           <Link size={14} /></TBtn>
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <TBtn onClick={() => applyFormat('h2')}     title="Heading">
          <span className="text-xs font-bold leading-none">H2</span>
        </TBtn>
        <TBtn onClick={() => applyFormat('bullet')} title="Bullet list">    <List size={14} /></TBtn>
        <span className="w-px h-4 bg-gray-200 mx-1" />
        <TBtn
          onClick={() => fileInputRef.current?.click()}
          title="Upload image"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
        </TBtn>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-200 rounded transition-colors"
          >
            <X size={12} />
            Discard
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        rows={Math.max(16, draft.split('\n').length + 2)}
        className="w-full font-mono text-sm leading-relaxed px-4 py-3 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        placeholder="Write markdown here…"
        spellCheck={false}
        autoFocus
      />

      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      <p className="text-xs text-gray-400">
        ⌘S to save · Esc to discard · Drag &amp; drop images into the editor
      </p>
    </div>
  )
}
