import { Pagination } from '../../types/entities'

export interface IUserMutesComponent {
  muteUser(muterAddress: string, mutedAddress: string): Promise<void>
  unmuteUser(muterAddress: string, mutedAddress: string): Promise<void>
  getMutedUsers(
    muterAddress: string,
    pagination: Required<Pagination>,
    options?: { address?: string; addresses?: string[] }
  ): Promise<{ mutes: { address: string; muted_at: Date }[]; total: number }>
}
