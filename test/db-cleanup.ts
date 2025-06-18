import { IPgComponent } from '@well-known-components/pg-component'

export class TestCleanup {
  private tableData: Record<string, any[]> = {}

  constructor(private pg: IPgComponent) {}

  trackInsert(tableName: string, data: Record<string, any>) {
    if (!this.tableData[tableName]) {
      this.tableData[tableName] = []
    }
    this.tableData[tableName].push(data)
  }

  async cleanup() {
    await this.cleanupTableData()
    this.resetCollections()
  }

  private async cleanupTableData() {
    for (const tableName in this.tableData) {
      await Promise.all(this.tableData[tableName].map((data) => this.deleteFromTable(tableName, data)))
    }
  }

  private async deleteFromTable(tableName: string, data: Record<string, any>) {
    try {
      const conditions = Object.entries(data)
        .map(([key, value]) => `${key} = ${typeof value === 'string' ? `'${value}'` : value}`)
        .join(' AND ')

      const query = `DELETE FROM ${tableName} WHERE ${conditions}`
      await this.pg.query(query)
    } catch (error) {
      console.error(` >>> Error cleaning data from ${tableName}:`, error)
    }
  }

  private resetCollections() {
    this.tableData = {}
  }
}
