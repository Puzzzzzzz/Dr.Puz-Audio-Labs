import { useCallback, useEffect, useRef, useState } from 'react'

interface VirtualRange { start: number; end: number }

/**
 * Windowed rendering for fixed-height rows inside a scrolling container.
 * Renders only the visible slice plus overscan, padding the rest with spacers.
 */
export function useVirtualRows(count: number, rowHeight: number, overscan = 6) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [range, setRange] = useState<VirtualRange>({ start: 0, end: 0 })

  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const first = Math.max(0, Math.floor(container.scrollTop / rowHeight) - overscan)
    const visible = Math.ceil(container.clientHeight / rowHeight) + overscan * 2
    const last = Math.min(count, first + visible)
    setRange(previous => (previous.start === first && previous.end === last ? previous : { start: first, end: last }))
  }, [count, overscan, rowHeight])

  useEffect(() => {
    measure()
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [measure])

  const onScroll = measure

  return {
    containerRef,
    onScroll,
    slice: (index: number) => index * rowHeight,
    topOffset: range.start * rowHeight,
    bottomOffset: Math.max(0, (count - range.end) * rowHeight),
    startIndex: range.start,
    endIndex: range.end
  }
}
