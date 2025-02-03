import { validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/http-server'
import { metricDeclarations as logsMetricsDeclarations } from '@well-known-components/logger'
import { IMetricsComponent } from '@well-known-components/interfaces'

export const metricDeclarations = {
  ...getDefaultHttpMetrics(),
  ...logsMetricsDeclarations,
  ws_connections: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket connections',
    labelNames: ['address']
  },
  ws_messages_received: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket messages received',
    labelNames: ['address']
  },
  ws_messages_sent: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket messages sent',
    labelNames: ['address']
  },
  ws_errors: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket errors',
    labelNames: ['address']
  },
  ws_heartbeats_missed: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket heartbeats missed',
    labelNames: ['address']
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
