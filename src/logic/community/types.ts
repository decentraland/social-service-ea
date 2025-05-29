import { CommunityRole } from '../../types/entities'

export type CommunityDB = {
  id?: string
  name: string
  description: string
  owner_address: string
  private: boolean
  active: boolean
  created_at?: string
  updated_at?: string
}

export type Community = {
  id: string
  name: string
  description: string
  ownerAddress: string
  role: CommunityRole
  privacy: 'public' | 'private'
  active: boolean
}

export type CommunityWithMembersCount = Community & {
  membersCount: number
}
