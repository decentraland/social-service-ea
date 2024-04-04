import { AppComponents } from '../types'

export interface IDBComponent {}

export function createDBComponent({ pg, logs }: Pick<AppComponents, 'pg' | 'logs'>): IDBComponent {
  return {}
}
