import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { CollectionPage } from './pages/CollectionPage'
import { NotesPage } from './pages/NotesPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CollectionPage />} />
        <Route path="/notes" element={<NotesPage />} />
      </Routes>
    </BrowserRouter>
  )
}
