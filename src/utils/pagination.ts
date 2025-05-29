import { PaginatedParameters } from '@dcl/schemas'

export function getPage(limit: number, offset: number = 0): number {
  return Math.ceil(offset / limit) + 1
}

export function getPages(total: number, limit: number): number {
  return Math.ceil(total / limit)
}

export function getPaginationResultProperties(
  total: number,
  paginationParams: Required<PaginatedParameters>
): {
  page: number
  pages: number
  limit: number
} {
  return {
    page: getPage(paginationParams.limit, paginationParams.offset),
    pages: getPages(total, paginationParams.limit),
    limit: paginationParams.limit
  }
}
