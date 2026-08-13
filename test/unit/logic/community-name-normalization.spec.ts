import { normalizeNameForComparison } from '../../../src/logic/community/name-normalization'

// Every invisible code point in this file is written as an escape on purpose. A literal cannot be
// reviewed, which is the same property that makes these useful for slipping past a denylist.
describe('when reducing a community name for restricted-name comparison', () => {
  let reserved: string

  beforeEach(() => {
    reserved = normalizeNameForComparison('decentraland')
  })

  describe('and the name differs only by an invisible character', () => {
    let results: string[]

    beforeEach(() => {
      results = [
        'decentraland\u200B', // zero width space
        'decentraland\u2060', // word joiner
        'decentraland\u2800', // braille pattern blank
        'decentraland\u00AD', // soft hyphen
        'decentraland\u3164', // hangul filler
        'decentraland\uFEFF', // byte order mark
        'decentraland\u202E', // right-to-left override
        'decentraland\uFE0F', // variation selector 16
        'decentraland\u180F', // mongolian free variation selector 4
        'decentra\u200Bland' // inside the word, not only at the end
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
        'decentraland\u{E01EF}', // last supplementary variation selector
        'decentraland\u{1BCA0}', // shorthand format letter overlap
        'decentraland\u{1D173}' // musical symbol begin beam
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
        'dеcentraland', // Cyrillic ie
        'deсentraland', // Cyrillic es, which renders as c
        'decеntralаnd', // Cyrillic ie and a
        'dεcentraland', // Greek epsilon
        'decentraӏand', // Cyrillic palochka for the Latin l
        'decentraӀand' // uppercase palochka
      ].map(normalizeNameForComparison)
    })

    it('should reduce every one to the reserved name', () => {
      expect(results).toEqual(results.map(() => reserved))
    })
  })

  describe('and the name is built entirely from invisible characters', () => {
    let results: number[]

    beforeEach(() => {
      results = ['\u200B\u2060', '\u2800\u2800', '\u{E0041}', '\u3164', '\u{1D173}'].map(
        (name) => normalizeNameForComparison(name).length
      )
    })

    it('should reduce to nothing, which is what the non-empty check refuses', () => {
      expect(results).toEqual([0, 0, 0, 0, 0])
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
      results = ['дом', 'κοινότητα'].map(normalizeNameForComparison)
    })

    it('should not collide with a reserved name', () => {
      results.forEach((result) => expect(result).not.toBe(reserved))
    })

    it('should keep visible content', () => {
      results.forEach((result) => expect(result.length).toBeGreaterThan(0))
    })
  })
})
