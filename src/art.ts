export interface Artwork {
  mime: string
  data: Uint8Array
}

const MAX_PARSABLE_BYTES = 40 * 1024 * 1024
const MAX_PICTURE_BYTES = 8 * 1024 * 1024

function clamp(value: number, size: number): number {
  return value >= 0 && value <= size ? value : size
}

function decodeUtf8(bytes: Uint8Array, start: number, end: number): string {
  return new TextDecoder().decode(bytes.subarray(clamp(start, bytes.length), clamp(end, bytes.length)))
}

function syncsafe(start: number, bytes: Uint8Array): number {
  return (bytes[start] << 21) | (bytes[start + 1] << 14) | (bytes[start + 2] << 7) | bytes[start + 3]
}

function plain(start: number, bytes: Uint8Array): number {
  return ((bytes[start] << 24) | (bytes[start + 1] << 16) | (bytes[start + 2] << 8) | bytes[start + 3]) >>> 0
}

function looksLikeJpegOrPng(data: Uint8Array): boolean {
  return (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8)
    || (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47)
}

/** Extracts pictures from an ID3v2.2/2.3/2.4 tag that starts at byte 0. */
function parseId3(bytes: Uint8Array): Artwork[] {
  if (bytes.length < 10 || bytes[5] & 0x40) return []
  const major = bytes[3]
  if (major !== 2 && major !== 3 && major !== 4) return []
  const tagEnd = Math.min(10 + syncsafe(6, bytes), bytes.length)
  if (tagEnd < 20) return []
  const pictures: Artwork[] = []
  const frameHeader = major === 2 ? 6 : 10

  let cursor = 10
  while (cursor + frameHeader <= tagEnd - 1) {
    if (major === 2) {
      const frameId = decodeUtf8(bytes, cursor, cursor + 3)
      const frameSize = (bytes[cursor + 3] << 16) | (bytes[cursor + 4] << 8) | bytes[cursor + 5]
      if (frameSize <= 0) break
      if (frameId === 'PIC') {
        const body = cursor + 6
        const mime = decodeUtf8(bytes, body + 1, body + 4).replace(/\x00/g, '') || 'image/jpeg'
        const data = bytes.subarray(body + 4, Math.min(body + frameSize, tagEnd))
        if (data.length > 4) pictures.push({ mime, data })
      }
      cursor += 6 + frameSize
      continue
    }

    const frameId = decodeUtf8(bytes, cursor, cursor + 4)
    const frameSize = major === 4 ? syncsafe(cursor + 4, bytes) : plain(cursor + 4, bytes)
    if (frameSize <= 4 || cursor + 10 + frameSize > tagEnd + 1) break
    if (frameId === 'APIC' && frameSize <= MAX_PICTURE_BYTES) {
      const body = cursor + 10
      const encoding = bytes[body]
      let mimeEnd = body + 1
      while (mimeEnd < bytes.length && bytes[mimeEnd] !== 0 && mimeEnd - (body + 1) < 48) mimeEnd++
      if (mimeEnd < bytes.length) {
        const mime = decodeUtf8(bytes, body + 1, mimeEnd) || 'image/jpeg'
        let dataStart = mimeEnd + 2
        if (encoding === 1 || encoding === 2) {
          dataStart = mimeEnd + 2
          while (dataStart + 1 < cursor + 10 + frameSize && !(bytes[dataStart] === 0 && bytes[dataStart + 1] === 0) && dataStart - mimeEnd < 1024) dataStart += 2
          dataStart += 2
        } else {
          dataStart = mimeEnd + 2
          while (dataStart < cursor + 10 + frameSize && bytes[dataStart] !== 0 && dataStart - mimeEnd < 1024) dataStart++
          dataStart++
        }
        const data = bytes.subarray(clamp(dataStart, bytes.length), clamp(cursor + 10 + frameSize, bytes.length))
        if (data.length > 4 && (looksLikeJpegOrPng(data) || mime.startsWith('image/'))) {
          pictures.push({ mime: mime.startsWith('image/') ? mime : 'image/jpeg', data })
        }
      }
    }
    cursor += 10 + frameSize
  }
  return pictures
}

function parseFlac(bytes: Uint8Array): Artwork | null {
  let cursor = 4
  while (cursor + 5 <= bytes.length) {
    const header = bytes[cursor]
    const isLast = (header & 0x80) !== 0
    const type = header & 0x7f
    const length = plain(cursor + 1, bytes)
    if (length <= 0) return null
    const body = cursor + 5
    const end = body + length
    if (end > bytes.length) return null
    if (type === 6) {
      let read = body + 4
      const mimeLength = plain(read, bytes)
      read += 4
      if (read + mimeLength > end || mimeLength <= 0) return null
      const mime = decodeUtf8(bytes, read, read + mimeLength)
      read += mimeLength
      const descriptionLength = plain(read, bytes)
      read += 4 + descriptionLength
      read += 16
      if (read + 4 > end) return null
      const dataLength = plain(read, bytes)
      read += 4
      if (dataLength <= 0 || dataLength > MAX_PICTURE_BYTES || read + dataLength > end) return null
      const data = bytes.subarray(read, read + dataLength)
      if (!looksLikeJpegOrPng(data) && !mime.startsWith('image/')) return null
      return { mime: mime.startsWith('image/') ? mime : 'image/jpeg', data }
    }
    cursor = end
    if (isLast) return null
  }
  return null
}

function parseM4a(bytes: Uint8Array): Artwork | null {
  const limit = Math.min(bytes.length, 2 * 1024 * 1024)
  for (let cursor = 4; cursor + 8 <= limit; cursor++) {
    const isMoov = bytes[cursor] === 0x6d && bytes[cursor + 1] === 0x6f && bytes[cursor + 2] === 0x6f && bytes[cursor + 3] === 0x76
    if (!isMoov) continue
    const scanEnd = Math.min(bytes.length, cursor + 4 * 1024 * 1024)
    for (let probe = cursor + 4; probe + 24 <= scanEnd; probe++) {
      const isCovr = bytes[probe] === 0x63 && bytes[probe + 1] === 0x6f && bytes[probe + 2] === 0x76 && bytes[probe + 3] === 0x72
      if (!isCovr) continue
      const dataSize = plain(probe + 4, bytes)
      const isData = bytes[probe + 8] === 0x64 && bytes[probe + 9] === 0x61 && bytes[probe + 10] === 0x74 && bytes[probe + 11] === 0x61
      const wellKnown = bytes[probe + 15] === 13 || bytes[probe + 15] === 14
      if (!isData || !wellKnown) continue
      if (dataSize < 20 || probe + 4 + dataSize > bytes.length) return null
      const data = bytes.subarray(probe + 20, probe + 4 + dataSize)
      if (data.length > 8 && data.length <= MAX_PICTURE_BYTES && looksLikeJpegOrPng(data)) {
        return { mime: bytes[probe + 15] === 14 ? 'image/png' : 'image/jpeg', data }
      }
      return null
    }
    return null
  }
  return null
}

/** Extracts embedded front-cover artwork from MP3 (ID3v2), FLAC or M4A files. */
export function extractArtwork(bytes: Uint8Array): Artwork | null {
  try {
    if (!bytes || bytes.byteLength < 16 || bytes.byteLength > MAX_PARSABLE_BYTES) return null
    const isId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
    if (isId3) {
      const picture = parseId3(bytes).find(item => item.mime.startsWith('image/') || looksLikeJpegOrPng(item.data))
      if (picture && picture.data.length <= MAX_PICTURE_BYTES) return picture
      if (picture) return null
    }
    const isFlac = bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43
    if (isFlac) return parseFlac(bytes)
    return parseM4a(bytes)
  } catch {
    return null
  }
}

function toBase64(data: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

/** Turns extracted artwork into a data URL usable in <img> and mediaSession artwork. */
export function artworkToDataUrl(artwork: Artwork): string {
  return `data:${artwork.mime};base64,${toBase64(artwork.data)}`
}
