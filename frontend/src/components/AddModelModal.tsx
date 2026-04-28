import { useState } from 'react'
import { X } from 'lucide-react'
import type { ModelConfig, ModelProvider } from '../types'

interface Props {
  onClose: () => void
  onSave: (model: ModelConfig) => void
}

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  deepseek: 'DeepSeek / OpenAI-compatible',
  claude: 'Claude / Anthropic',
  'openai-compatible': 'OpenAI-compatible',
}

export function AddModelModal({ onClose, onSave }: Props) {
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<ModelProvider>('openai-compatible')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const needsBaseUrl = provider !== 'claude'

  const handleSave = () => {
    if (!name.trim()) return setError('Name is required')
    if (!model.trim()) return setError('Model ID is required')
    setError(null)
    onSave({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      provider,
      model: model.trim(),
      api_key: apiKey.trim() || undefined,
      base_url: baseUrl.trim() || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-900">Add New Model</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Custom Model"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ModelProvider)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {(Object.keys(PROVIDER_LABELS) as ModelProvider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Model ID</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === 'claude' ? 'claude-sonnet-4-6' : 'deepseek-chat'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {needsBaseUrl && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Base URL
              </label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Model
          </button>
        </div>
      </div>
    </div>
  )
}
