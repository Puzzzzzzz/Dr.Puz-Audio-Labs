import test from 'node:test'
import assert from 'node:assert/strict'
import { crossfadeBarsLabel, filesLabel, plural, tracksLabel, watchedFoldersLabel } from '../src/labels.ts'

test('picks the Polish plural form from the count', () => {
  const form = count => plural(count, 'one', 'few', 'many')
  for (const count of [1]) assert.equal(form(count), 'one')
  for (const count of [2, 3, 4, 22, 23, 24, 102]) assert.equal(form(count), 'few')
  for (const count of [0, 5, 11, 12, 13, 14, 15, 21, 25, 112, 1000]) assert.equal(form(count), 'many')
})

test('formats the labels shown in the interface', () => {
  assert.equal(tracksLabel(1), '1 utwór')
  assert.equal(tracksLabel(2), '2 utwory')
  assert.equal(tracksLabel(7), '7 utworów')
  assert.equal(filesLabel(2), '2 pliki')
  assert.equal(watchedFoldersLabel(1), '1 obserwowany folder')
  assert.equal(watchedFoldersLabel(3), '3 obserwowane foldery')
  assert.equal(watchedFoldersLabel(0), '0 obserwowanych folderów')
  assert.equal(crossfadeBarsLabel(1), '1 takt')
  assert.equal(crossfadeBarsLabel(4), '4 takty')
  assert.equal(crossfadeBarsLabel(16), '16 taktów')
})
