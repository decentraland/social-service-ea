export function getPage(limit: number, offset: number = 0) {
  return Math.ceil(offset / limit) + 1
}
