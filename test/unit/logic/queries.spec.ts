import { SQLStatement } from 'sql-template-strings'
import { escapeLikePattern, getMutualFriendsBaseQuery, getUserFriendsCTE } from '../../../src/logic/queries'

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

describe('when building the mutual friends query', () => {
  let rowsSql: string
  let countSql: string

  // Each side's subquery already carries a NOT EXISTS against blocks, keyed on that side's own
  // address through a CASE. The pair predicate is the only one comparing two bare addresses, so
  // counting NOT EXISTS is what distinguishes it — asserting the text alone matches the per-side
  // ones and passes with the pair check absent.
  const pairPredicates = (sql: string) =>
    sql
      .split('NOT EXISTS')
      .slice(1)
      .filter((clause) => !clause.slice(0, 200).includes('CASE')).length

  beforeEach(() => {
    const a = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const b = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    rowsSql = getMutualFriendsBaseQuery(a, b, { onlyCount: false }).text.replace(/\s+/gu, ' ')
    countSql = getMutualFriendsBaseQuery(a, b, { onlyCount: true }).text.replace(/\s+/gu, ' ')
  })

  it('should exclude the pair when either has blocked the other', () => {
    expect(pairPredicates(rowsSql)).toBe(1)
  })

  it('should apply it to the count as well, so the total agrees with the rows', () => {
    expect(pairPredicates(countSql)).toBe(1)
  })

  it('should check the pair in both directions', () => {
    const pair = rowsSql
      .split('NOT EXISTS')
      .slice(1)
      .find((clause) => !clause.slice(0, 200).includes('CASE'))!
    expect(pair.match(/b\.blocker_address =/gu)).toHaveLength(2)
  })
})
