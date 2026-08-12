import { hasVisibleContent, normalizeNameForComparison } from '../../../src/logic/community/name-normalization'

describe('when reducing a community name for restricted-name comparison', () => {
  let reserved: string

  beforeEach(() => {
    reserved = normalizeNameForComparison('decentraland')
  })

  describe('and the name differs only by an invisible character', () => {
    let results: string[]

    beforeEach(() => {
      results = [
        'decentraland​', // zero width space
        'decentraland⁠', // word joiner
        'decentraland⠀', // braille pattern blank
        'decentraland­', // soft hyphen
        'decentralandㅤ', // hangul filler
        'decentraland﻿', // byte order mark
        'decentraland‮', // right-to-left override
        'decentraland️', // variation selector
        'decentra​land' // inside the word, not only at the end
      ].map(normalizeNameForComparison)
    })

    it('should reduce every one to the reserved name', () => {
      expect(results).toEqual(results.map(() => reserved))
    })
  })

  describe('and the invisible character is outside the basic plane', () => {
    let results: string[]

    beforeEach(() => {
      results = [
        'decentraland\u{E0100}', // variation selector supplement
        'decentraland\u{E007F}', // cancel tag
        'decentraland\u{E0041}', // tag letter A
        'decentraland\u{E01EF}'
      ].map(normalizeNameForComparison)
    })

    it('should reduce every one to the reserved name', () => {
      expect(results).toEqual(results.map(() => reserved))
    })
  })

  describe('and the name uses compatibility forms', () => {
    let results: string[]

    beforeEach(() => {
      results = [
        'ｄｅｃｅｎｔｒａｌａｎｄ', // fullwidth
        'DECENTRALAND',
        '  decentraland  ',
        'decentraland'.normalize('NFD')
      ].map(normalizeNameForComparison)
    })

    it('should reduce every one to the reserved name', () => {
      expect(results).toEqual(results.map(() => reserved))
    })
  })

  describe('and the name substitutes letters from another script', () => {
    let results: string[]

    beforeEach(() => {
      results = [
        'dеcentraland', // Cyrillic e
        'deсentraland', // Cyrillic s, which renders as c
        'decеntralаnd', // Cyrillic e and a
        'dεcentraland', // Greek epsilon
        'decentraӏand', // Cyrillic palochka for the Latin l
        'decentraӀand' // uppercase palochka
      ].map(normalizeNameForComparison)
    })

    it('should reduce every one to the reserved name', () => {
      expect(results).toEqual(results.map(() => reserved))
    })
  })

  describe('and the name is a different name that merely contains the reserved one', () => {
    let results: string[]

    beforeEach(() => {
      results = ['decentraland fans', 'decentralands', 'decent raland', 'my community'].map(normalizeNameForComparison)
    })

    it('should leave it distinct, so the fold cannot merge names a reader tells apart', () => {
      results.forEach((result) => expect(result).not.toBe(reserved))
    })
  })

  describe('and the name is written in a non-Latin script of its own', () => {
    let results: string[]

    beforeEach(() => {
      // The skeleton is an internal comparison form, not a stored value, so a name in another script
      // may be partly folded. What matters is that it collides with nothing reserved.
      results = ['дом', 'сообщество', 'κοινότητα'].map(normalizeNameForComparison)
    })

    it('should not collide with a reserved name', () => {
      results.forEach((result) => expect(result).not.toBe(reserved))
    })
  })

  describe('and the name is built entirely from invisible characters', () => {
    let results: boolean[]

    beforeEach(() => {
      results = ['\u200B\u2060', '\u2800\u2800', '\u{E0041}', '\u3164'].map(hasVisibleContent)
    })

    it('should report no visible content, so the non-empty check refuses it', () => {
      expect(results).toEqual([false, false, false, false])
    })
  })

  describe('and the name has any visible content at all', () => {
    let results: boolean[]

    beforeEach(() => {
      results = ['a', 'дом', 'My Community', ' x '].map(hasVisibleContent)
    })

    it('should report it as present', () => {
      expect(results).toEqual([true, true, true, true])
    })
  })
})
