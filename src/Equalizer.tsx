import { EQ_FREQUENCIES } from './presets'

interface Props { values: number[]; presetName: string; presets: { name: string; values: number[] }[]; onChange: (values: number[]) => void; onPreset: (name: string) => void; onSave: () => void }

export default function Equalizer({ values, presetName, presets, onChange, onPreset, onSave }: Props) {
  return <section className="eq-card">
    <div className="section-heading"><div><span className="eyebrow">KSZTAŁTUJ BRZMIENIE</span><h2>Equalizer spektralny</h2></div><div className="eq-actions"><label className="preset-label">PRESET<select value={presetName} onChange={event => onPreset(event.target.value)}>{presets.map(preset => <option key={preset.name}>{preset.name}</option>)}</select></label><button className="tiny-action" onClick={onSave}>Zapisz własny</button></div></div>
    <div className="eq-sliders">{EQ_FREQUENCIES.map((frequency, index) => <label className="eq-band" key={frequency}>
      <span className="eq-db">{values[index] > 0 ? '+' : ''}{values[index]} dB</span>
      <input aria-label={`${frequency} Hz`} type="range" min="-12" max="12" step="1" value={values[index] ?? 0} onChange={event => { const next = [...values]; next[index] = Number(event.target.value); onChange(next) }} />
      <span className="eq-freq">{frequency >= 1000 ? `${frequency / 1000}k` : frequency}</span>
    </label>)}</div>
  </section>
}
