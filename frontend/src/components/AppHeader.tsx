import { NavLink } from 'react-router-dom'
import { Anchor } from 'lucide-react'

interface Props {
  rightSlot?: React.ReactNode
}

export function AppHeader({ rightSlot }: Props) {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
    }`

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 mr-2">
          <Anchor size={20} className="text-blue-600" />
          <span className="font-bold text-gray-900">Anchor</span>
        </div>

        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navClass}>
            Collection
          </NavLink>
          <NavLink to="/notes" className={navClass}>
            Notes
          </NavLink>
        </nav>

        {rightSlot && <div className="ml-auto">{rightSlot}</div>}
      </div>
    </header>
  )
}
