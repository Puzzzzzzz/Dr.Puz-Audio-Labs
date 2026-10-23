import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export const VISUALS = [
  { id: 'orb', name: 'Kula plazmy', color: '#1de8ff' },
  { id: 'tunnel', name: 'Neonowy tunel', color: '#f529d5' },
  { id: 'particles', name: 'Kosmiczny pył', color: '#23e8ff' },
  { id: 'waves', name: 'Fale widma', color: '#f529d5' },
  { id: 'rings', name: 'Orbitalne pierścienie', color: '#20e6ff' },
  { id: 'spectrum', name: 'Spektrum 3D', color: '#f42acb' }
] as const

export type VisualMode = typeof VISUALS[number]['id']

interface Props { mode: VisualMode; analyser: AnalyserNode | null; active: boolean }

export default function Visualizer({ mode, analyser, active }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const analyserRef = useRef(analyser)
  const activeRef = useRef(active)
  useEffect(() => { analyserRef.current = analyser }, [analyser])
  useEffect(() => { activeRef.current = active }, [active])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#060916')
    scene.fog = new THREE.FogExp2('#060916', 0.045)
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100)
    camera.position.set(0, 0, 8)
    const renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)
    scene.add(new THREE.AmbientLight('#a9eaff', 1.15))
    const cyan = new THREE.MeshBasicMaterial({ color: '#1de8ff', wireframe: true, transparent: true, opacity: 0.86 })
    const pink = new THREE.MeshBasicMaterial({ color: '#f329d1', wireframe: true, transparent: true, opacity: 0.82 })
    const group = new THREE.Group()
    scene.add(group)
    const bars: THREE.Mesh[] = []
    let particlePositions: Float32Array | null = null
    let particleGeometry: THREE.BufferGeometry | null = null

    if (mode === 'orb') {
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 3), cyan)
      group.add(orb)
      const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 2), pink)
      inner.scale.setScalar(0.72)
      group.add(inner)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.018, 6, 160), pink)
      ring.rotation.x = Math.PI / 2.7
      group.add(ring)
    } else if (mode === 'tunnel') {
      for (let i = 0; i < 16; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1 + i * 0.16, 0.014, 5, 88), i % 2 ? cyan : pink)
        ring.position.z = -i * 0.35
        ring.scale.set(1, 0.75, 1)
        group.add(ring)
      }
    } else if (mode === 'particles') {
      particlePositions = new Float32Array(2100)
      for (let i = 0; i < particlePositions.length; i += 3) {
        particlePositions[i] = (Math.random() - 0.5) * 10
        particlePositions[i + 1] = (Math.random() - 0.5) * 6
        particlePositions[i + 2] = (Math.random() - 0.5) * 8
      }
      particleGeometry = new THREE.BufferGeometry()
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
      group.add(new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: '#23dcff', size: 0.045, transparent: true, opacity: 0.85 })))
    } else if (mode === 'waves') {
      const geometry = new THREE.PlaneGeometry(9, 5, 55, 32)
      const mesh = new THREE.Mesh(geometry, cyan)
      mesh.rotation.x = -0.64
      mesh.position.y = -0.1
      group.add(mesh)
      const second = new THREE.Mesh(new THREE.PlaneGeometry(9, 5, 55, 32), pink)
      second.rotation.x = -0.64
      second.position.set(0, 0.02, -0.4)
      group.add(second)
    } else if (mode === 'rings') {
      for (let i = 0; i < 8; i++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55 + i * 0.2, 0.018, 6, 100), i % 2 ? cyan : pink)
        ring.rotation.set(0.3 + i * 0.16, 0.2 + i * 0.11, 0)
        group.add(ring)
      }
      group.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 18), new THREE.MeshBasicMaterial({ color: '#0bdfff', transparent: true, opacity: 0.15 })))
    } else {
      for (let i = 0; i < 48; i++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.105, 1, 0.13), i % 2 ? cyan : pink)
        bar.position.x = (i - 23.5) * 0.155
        bar.position.y = -1.1
        group.add(bar)
        bars.push(bar)
      }
    }

    const resize = () => {
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    const frequency = new Uint8Array(128)
    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const audio = analyserRef.current
      if (audio && activeRef.current) audio.getByteFrequencyData(frequency)
      else frequency.fill(0)
      const bass = frequency.slice(0, 18).reduce((a, b) => a + b, 0) / (18 * 255)
      const beat = bass > 0 ? bass : 0
      group.rotation.y += 0.0017 + beat * 0.008
      if (mode === 'orb') {
        group.scale.setScalar(1 + beat * 0.16)
        group.rotation.x += 0.002
      }
      if (mode === 'tunnel') {
        group.children.forEach((child, index) => { child.position.z += 0.018 + beat * 0.045; if (child.position.z > 0.8) child.position.z = -5.25 - (index % 3) * 0.25 })
      }
      if (mode === 'particles' && particlePositions && particleGeometry) {
        for (let i = 1; i < particlePositions.length; i += 3) {
          particlePositions[i] += 0.002 + beat * 0.025
          if (particlePositions[i] > 3.4) particlePositions[i] = -3.4
        }
        particleGeometry.attributes.position.needsUpdate = true
      }
      if (mode === 'waves') {
        for (const child of group.children) {
          if (!(child instanceof THREE.Mesh)) continue
          const position = child.geometry.attributes.position as THREE.BufferAttribute
          for (let i = 0; i < position.count; i++) {
            const x = position.getX(i)
            const y = position.getY(i)
            position.setZ(i, Math.sin(x * 1.6 + frame * 0.025) * 0.19 + Math.cos(y * 2 + frame * 0.018) * (0.16 + beat * 0.8))
          }
          position.needsUpdate = true
          child.geometry.computeVertexNormals()
        }
      }
      if (mode === 'rings') group.children.forEach((child, index) => { child.rotation.z += 0.001 + (index % 2) * 0.0016; child.scale.setScalar(1 + beat * (0.05 + index * 0.008)) })
      if (mode === 'spectrum') bars.forEach((bar, index) => {
        const amplitude = frequency[Math.min(127, Math.floor(index * 2.35))] / 255
        const height = 0.16 + amplitude * 2.5 + beat * 0.35
        bar.scale.y = height
        bar.position.y = -1.25 + height / 2
      })
      renderer.render(scene, camera)
    }
    animate()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach(material => material.dispose())
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [mode])

  return <div className="visualizer-canvas" ref={hostRef} aria-label={`Wizualizacja: ${VISUALS.find(item => item.id === mode)?.name}`} />
}
