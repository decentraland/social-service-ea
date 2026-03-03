export interface UserBan {
  id: string
  bannedAddress: string
  bannedBy: string
  reason: string
  customMessage: string | null
  bannedAt: Date
  expiresAt: Date | null
  liftedAt: Date | null
  liftedBy: string | null
  createdAt: Date
}

export interface UserWarning {
  id: string
  warnedAddress: string
  warnedBy: string
  reason: string
  warnedAt: Date
  createdAt: Date
}

export type BanStatus = { isBanned: boolean; ban?: UserBan }

export type CreateBanInput = {
  bannedAddress: string
  bannedBy: string
  reason: string
  customMessage?: string
  expiresAt?: Date
}

export type CreateWarningInput = {
  warnedAddress: string
  warnedBy: string
  reason: string
}

export interface IUserModerationComponent {
  banPlayer(
    address: string,
    bannedBy: string,
    reason: string,
    duration?: number,
    customMessage?: string
  ): Promise<UserBan>
  liftBan(address: string, liftedBy: string): Promise<void>
  warnPlayer(address: string, reason: string, warnedBy: string): Promise<UserWarning>
  isPlayerBanned(address: string): Promise<BanStatus>
  getActiveBans(): Promise<UserBan[]>
  getPlayerWarnings(address: string): Promise<UserWarning[]>
}
