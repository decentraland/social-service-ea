import { SQLStatement } from 'sql-template-strings'
import { escapeLikePattern, getUserFriendsCTE } from '../../../src/logic/queries'

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

describe('when building the friends CTE that annotates the community listing', () => {
  let sql: string

  beforeEach(() => {
    sql = (getUserFriendsCTE('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').query as SQLStatement).text.replace(
      /\s+/gu,
      ' '
    )
  })

  it('should exclude a counterparty either side has blocked', () => {
    // is_active alone is not enough: blocking deactivates the friendship in the same transaction,
    // but an ACCEPT racing a BLOCK can leave a blocks row beside is_active = true, and this CTE is
    // what puts a face and a name next to each community in the listing.
    expect(sql).toContain('NOT EXISTS')
    expect(sql).toContain('FROM blocks b')
  })

  it('should check the block in both directions', () => {
    expect(sql).toContain('b.blocker_address =')
    expect(sql).toContain('b.blocked_address =')
  })

  it('should still require the friendship to be active', () => {
    expect(sql).toContain('f.is_active = true')
  })
})
