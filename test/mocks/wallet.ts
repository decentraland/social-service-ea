import { randomBytes } from 'crypto'

/**
 * Generates a random Ethereum-like wallet address
 * @returns A random address starting with '0x' followed by 40 hex characters
 */
export function generateRandomWalletAddress(): string {
  // Generate 20 bytes (40 hex characters) of random data
  const randomBytesBuffer = randomBytes(20)
  // Convert to hex string and ensure it starts with '0x'
  return '0x' + randomBytesBuffer.toString('hex')
}

/**
 * Generates multiple random Ethereum-like wallet addresses
 * @param count Number of addresses to generate
 * @returns Array of random addresses
 */
export function generateRandomWalletAddresses(count: number): string[] {
  return Array.from({ length: count }, () => generateRandomWalletAddress())
}
