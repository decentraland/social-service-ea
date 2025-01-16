import { getPage } from '../../../src/utils/pagination'

describe('pagination', () => {
  describe('getPage', () => {
    it('should return the correct page number', () => {
      expect(getPage(10, 0)).toBe(1)
      expect(getPage(10, 10)).toBe(2)
      expect(getPage(10, 20)).toBe(3)
    })
  })
})
