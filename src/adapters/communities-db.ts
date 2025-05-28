import { AppComponents, ICommunitiesDatabaseComponent } from '../types'

export function createCommunitiesDBComponent(
  components: Pick<AppComponents, 'pg' | 'logs'>
): ICommunitiesDatabaseComponent {
  const { pg, logs } = components

  const logger = logs.getLogger('communities-db-component')

  return {}
}
