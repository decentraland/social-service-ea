export type IPeersStatsComponent = {
  getConnectedPeers(): Promise<string[]>
}
