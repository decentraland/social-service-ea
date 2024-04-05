import { AppComponents } from '../types'

export interface IDatabaseComponent {}

export function createDBComponent(_components: Pick<AppComponents, 'pg' | 'logs'>): IDatabaseComponent {
  return {}
}
