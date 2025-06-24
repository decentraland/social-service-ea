import { IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'

export interface IAnalyticsDependencies {
  logs: ILoggerComponent
  fetcher: IFetchComponent
}

export type AnalyticsEvent = {
  event: string
  body: Record<string, any>
}

export type Environment = 'prd' | 'stg' | 'dev'

export interface IAnalyticsComponent<T extends Record<string, any> = Record<string, any>> {
  sendEvent: (name: keyof T, body: T[keyof T]) => Promise<void>
}
