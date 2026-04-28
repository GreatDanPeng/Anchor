import { useRef, useState, useEffect } from 'react'
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react'
import type { ModelConfig } from '../types'

interface Props {
  models: ModelConfig[]
  selectedId: string
  onSelect: (model: ModelConfig) => void
  onAddNew: () => void
  onDelete: (modelId: string) => void
}

export function ModelSelector({ models, selectedId, onSelect, onAddNew, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selected = models.find((m) => m.id === selectedId) ?? models[0]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <span className="max-w-28 truncate">{selected?.name ?? 'Select model'}</span>
        <ChevronDown
          size={12}
          className={`flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1.5 overflow-hidden">
          {models.map((m) => (
            <div key={m.id} className="group flex items-center">
              <button
                onClick={() => { onSelect(m); setOpen(false) }}
                className="flex-1 flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left"
              >
                <Check
                  size={13}
                  className={m.id === selectedId ? 'text-blue-600 flex-shrink-0' : 'invisible flex-shrink-0'}
                />
                <span className="truncate">{m.name}</span>
              </button>
              {/* only allow deleting custom models */}
              {m.id.startsWith('custom-') && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(m.id) }}
                  className="px-2 py-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  title="Remove model"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={() => { setOpen(false); onAddNew() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
            >
              <Plus size={13} />
              Add New Model
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
