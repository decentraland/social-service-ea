import { PaginatedParameters } from '@dcl/schemas'

export function getPage(limit: number, offset: number = 0) {
  return limit ? Math.ceil(offset / limit) + 1 : 1
}

export function getPages(total: number, limit: number): number {
  return limit > 0 ? Math.ceil(total / limit) : 0
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
