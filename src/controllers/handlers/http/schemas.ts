import { Schema } from 'ajv'
import { CommunityRole } from '../../../types/entities'
import { CommunityRequestType, CommunityRequestStatus } from '../../../logic/community/types'

// TypeScript types derived from schemas
export type UpdateMemberRoleRequestBody = {
  role: CommunityRole
}

export type UpdateCommunityPartiallyRequestBody = {
  editorsChoice: boolean
}

export type AddCommunityPlacesRequestBody = {
  placeIds: string[]
}

export type CreateCommunityPostRequestBody = {
  content: string
}

export type CreateReferralRequestBody = {
  referrer: string
}

export type AddReferralEmailRequestBody = {
  email: string
}

export type CreateCommunityRequestRequestBody = {
  targetedAddress: string
  type: CommunityRequestType
}

export type UpdateCommunityRequestStatusRequestBody = {
  intention: Exclude<CommunityRequestStatus, CommunityRequestStatus.Pending>
}

// AJV Schemas
export const UpdateMemberRoleSchema: Schema = {
  type: 'object',
  required: ['role'],
  additionalProperties: false,
  properties: {
    role: {
      type: 'string',
      enum: ['owner', 'moderator', 'member', 'none']
    }
  }
}

export const UpdateCommunityPartiallySchema: Schema = {
  type: 'object',
  required: ['editorsChoice'],
  additionalProperties: false,
  properties: {
    editorsChoice: {
      type: 'boolean'
    }
  }
}

export const AddCommunityPlacesSchema: Schema = {
  type: 'object',
  required: ['placeIds'],
  additionalProperties: false,
  properties: {
    placeIds: {
      type: 'array',
      items: {
        type: 'string'
      },
      minItems: 1
    }
  }
}

export const CreateCommunityPostSchema: Schema = {
  type: 'object',
  required: ['content'],
  additionalProperties: false,
  properties: {
    content: {
      type: 'string',
      minLength: 1,
      maxLength: 1000
    }
  }
}

export const CreateReferralSchema: Schema = {
  type: 'object',
  required: ['referrer'],
  additionalProperties: false,
  properties: {
    referrer: {
      type: 'string',
      minLength: 1
    }
  }
}

export const AddReferralEmailSchema: Schema = {
  type: 'object',
  required: ['email'],
  additionalProperties: false,
  properties: {
    email: {
      type: 'string',
      format: 'email',
      minLength: 1
    }
  }
}

export const CreateCommunityRequestSchema: Schema = {
  type: 'object',
  required: ['targetedAddress', 'type'],
  additionalProperties: false,
  properties: {
    targetedAddress: {
      type: 'string',
      pattern: '^0x[a-fA-F0-9]{40}$'
    },
    type: {
      type: 'string',
      enum: ['invite', 'request_to_join']
    }
  }
}

export const UpdateCommunityRequestStatusSchema: Schema = {
  type: 'object',
  required: ['intention'],
  additionalProperties: false,
  properties: {
    intention: {
      type: 'string',
      enum: ['accepted', 'rejected', 'cancelled']
    }
  }
}
