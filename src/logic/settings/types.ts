import { SocialSettings } from '../../types'

export type ISettingsComponent = {
  getUsersSettings: (addresses: string[]) => Promise<SocialSettings[]>
}
