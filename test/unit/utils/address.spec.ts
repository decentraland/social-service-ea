import { normalizeAddress } from '../../../src/utils/address'

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
