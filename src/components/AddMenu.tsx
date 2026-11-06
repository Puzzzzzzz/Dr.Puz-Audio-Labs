import { useEffect, useRef, useState } from 'react'
import { FileAudio, FolderInput, Plus } from 'lucide-react'

interface Props {
  onAddFiles: () => void
  onAddFolder: () => void
}

/** The one global way to add media: a single button that offers files or a watched folder. */
export function AddMenu({ onAddFiles, onAddFolder }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (action: () => void) => { setOpen(false); action() }

  return <div className="add-menu" ref={rootRef}>
    <button className="outline-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><Plus size={16}/> Dodaj</button>
    {open && <div className="add-menu-list" role="menu">
      <button role="menuitem" onClick={() => choose(onAddFiles)}><FileAudio size={16}/> Pliki</button>
      <button role="menuitem" onClick={() => choose(onAddFolder)}><FolderInput size={16}/> Folder</button>
    </div>}
  </div>
}
