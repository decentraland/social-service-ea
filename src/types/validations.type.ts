import { IHttpServerComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { IReferralDatabaseComponent } from './referral-db.type'

export interface IValidationComponents {
  db: IReferralDatabaseComponent
  logger: ILoggerComponent.ILogger
  request: IHttpServerComponent.IRequest
  fieldName?: string
  body?: Record<string, any>
}

export type ValidationRule<T extends InvalidRequestError> = {
  validate: (value: string, components: IValidationComponents) => Promise<boolean>
  error: new (value: string) => T
}

export type ValidationConfig = {
  field: string
  rules: ValidationRule<InvalidRequestError>[]
}[]
