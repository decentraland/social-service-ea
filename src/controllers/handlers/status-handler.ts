import { AppComponents } from '../../types'

export async function createStatusHandler(components: Pick<AppComponents, 'config'>) {
  const { config } = components
  const [commitHash, version] = await Promise.all([
    config.getString('COMMIT_HASH'),
    config.getString('CURRENT_VERSION')
  ])

  return {
    path: '/status',
    f: async () => {
      return {
        body: {
          version: version ?? '',
          currentTime: Date.now(),
          commitHash: commitHash ?? ''
        }
      }
    }
  }
}
