import { UserBan, UserWarning } from '../../../../src/logic/user-moderation/types'

export const makeBan = (overrides: Partial<UserBan> = {}): UserBan => ({
  id: 'ban-id',
  bannedAddress: '0xabc',
  bannedBy: '0xadmin',
  reason: 'Violation',
  customMessage: null,
  bannedAt: new Date('2025-01-01'),
  expiresAt: null,
  liftedAt: null,
  liftedBy: null,
  createdAt: new Date('2025-01-01'),
  ...overrides
})

export const makeWarning = (overrides: Partial<UserWarning> = {}): UserWarning => ({
  id: 'warning-id',
  warnedAddress: '0xabc',
  warnedBy: '0xadmin',
  reason: 'Minor violation',
  warnedAt: new Date('2025-01-01'),
  createdAt: new Date('2025-01-01'),
  ...overrides
})
