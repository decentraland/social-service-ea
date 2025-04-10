import { isValidAddress, normalizeAddress } from '../../../src/utils/address'

describe('normalizeAddress', () => {
  it.each([
    ['0xABCDEF1234567890', '0xabcdef1234567890'],
    ['0xabcdef1234567890', '0xabcdef1234567890'],
    ['0xAbCdEf1234567890', '0xabcdef1234567890']
  ])('should convert %s to %s', (address, expected) => {
    const normalized = normalizeAddress(address)
    expect(normalized).toBe(expected)
  })
})

describe('when checking if an address is valid', () => {
  let address: string

  describe('and the address does not have the correct length', () => {
    beforeEach(() => {
      address = '0x000'
    })

    it('should return false', () => {
      expect(isValidAddress(address)).toBe(false)
    })
  })

  describe('and the address does not start with 0x', () => {
    beforeEach(() => {
      address = 'abcdef1234567890'
    })

    it('should return false', () => {
      expect(isValidAddress(address)).toBe(false)
    })
  })

  describe('and the address has invalid characters', () => {
    beforeEach(() => {
      address = '0x000000000000000000000000000000000X0J0000'
    })

    it('should return false', () => {
      expect(isValidAddress(address)).toBe(false)
    })
  })

  describe('and the address contains the correct characters, length and prefix', () => {
    beforeEach(() => {
      address = '0x0000000000000000000000000000000000000000'
    })

    it('should return true', () => {
      expect(isValidAddress(address)).toBe(true)
    })
  })
})
