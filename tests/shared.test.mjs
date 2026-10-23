import test from 'node:test'
import assert from 'node:assert/strict'
import { formatTime, pathToFileUrl } from '../shared/format.ts'
import { defaultState, getKind, makeTrack, MEDIA_EXTENSIONS } from '../shared/types.ts'

test('formats elapsed time with hours only when needed', () => {
  assert.equal(formatTime(0), '00:00')
  assert.equal(formatTime(125), '02:05')
  assert.equal(formatTime(3723), '1:02:03')
  assert.equal(formatTime(Number.NaN), '00:00')
})

test('converts Windows paths to encoded file URLs', () => {
  assert.equal(pathToFileUrl('C:\\Music\\my song.mp3'), 'file:///C:/Music/my%20song.mp3')
})

test('classifies scanner-recognized media extensions', () => {
  assert.equal(getKind('C:\\Video\\clip.MP4'), 'video')
  assert.equal(getKind('/Music/live.flac'), 'audio')
  assert.ok(MEDIA_EXTENSIONS.includes('mkv'))
  assert.ok(MEDIA_EXTENSIONS.includes('opus'))
})

test('derives basic artist and title from Artist - Title filenames', () => {
  const track = makeTrack('C:\\Music\\Daft Punk - Voyager.flac', 1024, 10)
  assert.equal(track.artist, 'Daft Punk')
  assert.equal(track.title, 'Voyager')
  assert.equal(track.kind, 'audio')
  assert.equal(track.id, 'c:\\music\\daft punk - voyager.flac')
})

test('starts with an empty persistent library and a ten-band flat EQ', () => {
  assert.deepEqual(defaultState.folders, [])
  assert.deepEqual(defaultState.tracks, [])
  assert.equal(defaultState.eqValues.length, 10)
  assert.ok(defaultState.eqValues.every(value => value === 0))
})
