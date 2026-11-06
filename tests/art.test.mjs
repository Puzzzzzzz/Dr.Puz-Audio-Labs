import test from 'node:test'
import assert from 'node:assert/strict'
import { artworkToDataUrl, extractArtwork } from '../src/art.ts'

const JPEG_PAYLOAD = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04])
const PNG_PAYLOAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02])

test('extracts an APIC front cover from an ID3v2.3 MP3', () => {
  const frame = [
    0x03, 0x69, 0x6d, 0x61, 0x67, 0x65, 0x2f, 0x6a, 0x70, 0x65, 0x67, 0x00,
    0x03, 0x00, ...JPEG_PAYLOAD
  ]
  const tagPayload = [...ascii('APIC'), ...u32(frame.length), 0x00, 0x00, ...frame]
  const bytes = new Uint8Array([
    0x49, 0x44, 0x33, 0x03, 0x00, 0x00, ...syncsafe(tagPayload.length), ...tagPayload
  ])
  const artwork = extractArtwork(bytes)
  assert.ok(artwork)
  assert.equal(artwork.mime, 'image/jpeg')
  assert.deepEqual([...artwork.data], [...JPEG_PAYLOAD])
})

test('extracts a FLAC PICTURE block with a PNG payload', () => {
  const body = [
    ...u32(3),
    ...u32(9), ...ascii('image/png'),
    ...u32(0),
    ...u32(100), ...u32(100), ...u32(24), ...u32(0),
    ...u32(PNG_PAYLOAD.length), ...PNG_PAYLOAD
  ]
  const bytes = new Uint8Array([...ascii('fLaC'), 0x80 | 6, ...u32(body.length), ...body])
  const artwork = extractArtwork(bytes)
  assert.ok(artwork)
  assert.equal(artwork.mime, 'image/png')
  assert.deepEqual([...artwork.data], [...PNG_PAYLOAD])
})

test('extracts a covr atom from an M4A container', () => {
  const dataAtomSize = 16 + PNG_PAYLOAD.length
  const bytes = new Uint8Array([
    0x00, 0x00, 0x00, 0x08,
    ...ascii('moov'),
    0x00, 0x00, 0x00, 0x04,
    ...ascii('covr'),
    ...u32(dataAtomSize),
    ...ascii('data'),
    0x00, 0x00, 0x00, 14,
    0x00, 0x00, 0x00, 0x00,
    ...PNG_PAYLOAD
  ])
  const artwork = extractArtwork(bytes)
  assert.ok(artwork)
  assert.equal(artwork.mime, 'image/png')
  assert.deepEqual([...artwork.data], [...PNG_PAYLOAD])
})

test('returns null for files without artwork', () => {
  assert.equal(extractArtwork(new Uint8Array(64)), null)
  assert.equal(extractArtwork(new Uint8Array([0x00, 0x01])), null)
})

test('converts artwork into a data URL', () => {
  const url = artworkToDataUrl({ mime: 'image/jpeg', data: JPEG_PAYLOAD })
  assert.ok(url.startsWith('data:image/jpeg;base64,'))
  assert.ok(url.length > 24)
})

function ascii(text) {
  return [...text].map(char => char.charCodeAt(0))
}

function u32(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function syncsafe(value) {
  return [(value >>> 21) & 0x7f, (value >>> 14) & 0x7f, (value >>> 7) & 0x7f, value & 0x7f]
}
