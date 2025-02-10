import { validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/http-server'
import { metricDeclarations as logsMetricsDeclarations } from '@well-known-components/logger'
import { IMetricsComponent } from '@well-known-components/interfaces'

export const metricDeclarations = {
  ...getDefaultHttpMetrics(),
  ...logsMetricsDeclarations,
  ws_active_connections: {
    type: IMetricsComponent.GaugeType,
    help: 'Number of WebSocket active connections',
    labelNames: ['type']
  },
  ws_messages_received: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket messages received'
  },
  ws_messages_sent: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket messages sent'
  },
  ws_errors: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket errors'
  },
  ws_transport_errors: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket transport errors'
  },
  ws_auth_errors: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket authentication errors'
  },
  ws_idle_timeouts: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket idle timeouts'
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
