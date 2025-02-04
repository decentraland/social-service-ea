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
  ws_active_connections: {
    type: IMetricsComponent.GaugeType,
    help: 'Number of WebSocket active connections',
    labelNames: ['type']
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
  ws_transport_errors: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket transport errors',
    labelNames: ['address']
  },
  ws_auth_errors: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket authentication errors',
    labelNames: ['address']
  },
  ws_idle_timeouts: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket idle timeouts',
    labelNames: ['id']
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
