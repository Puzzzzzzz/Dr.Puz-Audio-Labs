import { useEffect, useRef } from 'react'

interface Props {
  analyser: AnalyserNode | null
  active: boolean
  bars?: number
  className: string
}

/** Real analyser-driven VU meter. Updates bar heights directly, no React re-renders. */
export function MeterBars({ analyser, active, bars = 14, className }: Props) {
  const barsRef = useRef<Array<HTMLElement | null>>([])
  const analyserRef = useRef(analyser)
  const activeRef = useRef(active)
  analyserRef.current = analyser
  activeRef.current = active

  useEffect(() => {
    const frequencies = new Uint8Array(64)
    let frame = 0
    let smoothed = new Float32Array(bars)
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const source = analyserRef.current
      if (source && activeRef.current) source.getByteFrequencyData(frequencies)
      else frequencies.fill(0)
      for (let index = 0; index < bars; index++) {
        const start = Math.floor(index / bars * 44)
        const end = Math.max(start + 1, Math.floor((index + 1) / bars * 44))
        let sum = 0
        for (let i = start; i < end; i++) sum += frequencies[i]
        const level = sum / (end - start) / 255
        smoothed[index] = smoothed[index] * 0.72 + level * 0.28
        const element = barsRef.current[index]
        if (element) element.style.height = `${3 + smoothed[index] * 13}px`
      }
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [bars])

  return <div className={className} aria-hidden="true">
    {Array.from({ length: bars }, (_, index) => (
      <i key={index} ref={element => { barsRef.current[index] = element }} style={{ height: '3px' }}/>
    ))}
  </div>
}
