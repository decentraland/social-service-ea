import { escapeLikePattern } from '../../../src/logic/queries'

describe('when escaping a LIKE/ILIKE search pattern', () => {
  describe('and the input contains no wildcard characters', () => {
    it('should return the input unchanged', () => {
      expect(escapeLikePattern('decentraland')).toBe('decentraland')
    })

    it('should return an empty string unchanged', () => {
      expect(escapeLikePattern('')).toBe('')
    })
  })

  describe('and the input contains LIKE wildcards', () => {
    it('should escape percent signs so they match literally', () => {
      expect(escapeLikePattern('50%')).toBe('50\\%')
    })

    it('should escape underscores so they match literally', () => {
      expect(escapeLikePattern('a_b')).toBe('a\\_b')
    })

    it('should escape a lone wildcard so it does not match everything', () => {
      expect(escapeLikePattern('%')).toBe('\\%')
    })
  })

  describe('and the input contains the escape character itself', () => {
    it('should escape backslashes before other characters', () => {
      expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
    })

    it('should escape a mix of backslashes, percent signs and underscores', () => {
      expect(escapeLikePattern('a\\%_b')).toBe('a\\\\\\%\\_b')
    })
  })
})
