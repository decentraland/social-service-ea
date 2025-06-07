import { IValidationComponents, ValidationConfig, ValidationRule } from '../types/validations.type'
import { InvalidRequestError } from '@dcl/platform-server-commons'
import { validationRules } from './validation-rules'

async function validateValueWithRules(
  value: string | undefined,
  rules: ValidationRule<InvalidRequestError>[],
  components: IValidationComponents,
  fieldName: string
): Promise<string> {
  for (const rule of rules) {
    try {
      await rule.validate(value || '', { ...components, fieldName })
    } catch (error) {
      throw error
    }
  }

  return value as string
}

export async function validateRequestBody<T extends Record<string, string>>(
  body: T,
  components: IValidationComponents,
  validations: ValidationConfig
): Promise<T> {
  const { logger } = components

  if (typeof body !== 'object' || body === null) {
    logger.debug('Invalid body')
    throw new InvalidRequestError('Invalid body')
  }

  const validatedBody = {} as T

  for (const validation of validations) {
    const { field, rules } = validation
    const value = body[field as keyof T]
    validatedBody[field as keyof T] = (await validateValueWithRules(
      value,
      rules,
      { ...components, body },
      field
    )) as T[keyof T]
  }

  return validatedBody
}

export { validationRules }
