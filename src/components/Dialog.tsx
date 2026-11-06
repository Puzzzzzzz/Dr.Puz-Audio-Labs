import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Playlist } from '../../shared/types'
import { tracksLabel } from '../labels'

interface TextDialogProps {
  title: string
  eyebrow: string
  label: string
  confirmText: string
  onClose: () => void
  onSubmit: (value: string) => void
}

export function TextDialog({ title, eyebrow, label, confirmText, onClose, onSubmit }: TextDialogProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <form className="playlist-dialog" onSubmit={submit}>
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <label htmlFor="dialog-value">{label}</label>
      <input id="dialog-value" ref={inputRef} autoFocus maxLength={80} value={value} onChange={event => setValue(event.target.value)} placeholder="Wpisz nazwę"/>
      <div className="dialog-actions">
        <button type="button" className="outline-button" onClick={onClose}>Anuluj</button>
        <button type="submit" className="primary-button" disabled={!value.trim()}>{confirmText}</button>
      </div>
    </form>
  </div>
}

interface PlaylistPickerProps {
  trackTitle: string
  playlists: Playlist[]
  onPick: (playlist: Playlist) => void
  onCreate: (name: string) => void
  onClose: () => void
}

export function PlaylistPickerDialog({ trackTitle, playlists, onPick, onCreate, onClose }: PlaylistPickerProps) {
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="playlist-dialog playlist-picker">
      <span className="eyebrow">Playlisty</span>
      <h2>Dodaj do playlisty</h2>
      <p className="picker-track">{trackTitle}</p>
      {playlists.length > 0 && <div className="picker-list">
        {playlists.map(playlist => <button type="button" key={playlist.id} onClick={() => onPick(playlist)}>
          <b>{playlist.name}</b><small>{tracksLabel(playlist.trackIds.length)}</small>
        </button>)}
      </div>}
      <NewPlaylistInline onCreate={onCreate}/>
      <div className="dialog-actions">
        <button type="button" className="outline-button" onClick={onClose}>Anuluj</button>
      </div>
    </div>
  </div>
}

function NewPlaylistInline({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  return <form className="picker-new" onSubmit={event => { event.preventDefault(); const trimmed = name.trim(); if (trimmed) onCreate(trimmed) }}>
    <input autoFocus maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Nowa playlista"/>
    <button type="submit" className="outline-button" disabled={!name.trim()}>Utwórz</button>
  </form>
}
