import { Lifecycle } from '@well-known-components/interfaces'
import { setupRoutes } from './controllers/routes'
import { AppComponents, TestComponents } from './types'

// this function wires the business logic (adapters & controllers) with the components (ports)
export async function main(program: Lifecycle.EntryPointParameters<AppComponents | TestComponents>) {
  const { components, startComponents } = program

  await setupRoutes(components)

  await startComponents()
}
