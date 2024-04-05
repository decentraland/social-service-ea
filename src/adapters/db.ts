import { AppComponents } from '../types'

export interface IDatabaseComponent {}

export function createDBComponent({ pg, logs }: Pick<AppComponents, 'pg' | 'logs'>): IDatabaseComponent {
  return {}
}
