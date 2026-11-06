import type { CSSProperties } from 'react'
import { EQ_FREQUENCIES } from './presets'

/** Track fill runs from the 0 dB line to the current value, so a flat band shows no fill. */
function fillRange(value: number) {
  const position = (value + 12) / 24 * 100
  return { '--eq-low': `${Math.min(50, position)}%`, '--eq-high': `${Math.max(50, position)}%` } as CSSProperties
}

interface Props { values: number[]; presetName: string; presets: { name: string; values: number[] }[]; onChange: (values: number[]) => void; onPreset: (name: string) => void; onSave: () => void }

export default function Equalizer({ values, presetName, presets, onChange, onPreset, onSave }: Props) {
  return <section className="eq-card">
    <div className="section-heading"><div className="eq-heading"><h2>Equalizer</h2></div><div className="eq-actions"><label className="preset-label">Preset<select value={presetName} onChange={event => onPreset(event.target.value)}>{presets.map(preset => <option key={preset.name}>{preset.name}</option>)}</select></label><button className="tiny-action" onClick={onSave}>Zapisz własny</button></div></div>
    <div className="eq-sliders">{EQ_FREQUENCIES.map((frequency, index) => <label className="eq-band" key={frequency}>
      <span className="eq-db">{values[index] > 0 ? '+' : ''}{values[index]} dB</span>
      <input aria-label={`${frequency} Hz`} style={fillRange(values[index] ?? 0)} type="range" min="-12" max="12" step="1" value={values[index] ?? 0} onChange={event => { const next = [...values]; next[index] = Number(event.target.value); onChange(next) }} />
      <span className="eq-freq">{frequency >= 1000 ? `${frequency / 1000}k` : frequency}</span>
    </label>)}</div>
  </section>
}
