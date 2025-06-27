import { validateMetricsDeclaration } from '@well-known-components/metrics'
import { getDefaultHttpMetrics } from '@well-known-components/uws-http-server'
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
  },
  ws_connection_duration_seconds: {
    type: IMetricsComponent.HistogramType,
    help: 'Duration of WebSocket connections in seconds',
    buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600, 7200, 14400]
  },
  rpc_procedure_call_total: {
    type: IMetricsComponent.CounterType,
    help: 'Total number of RPC procedure calls',
    labelNames: ['code', 'procedure']
  },
  rpc_procedure_call_duration_seconds: {
    type: IMetricsComponent.HistogramType,
    help: 'Duration of RPC procedure calls in seconds',
    labelNames: ['code', 'procedure'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
  },
  rpc_in_procedure_call_size_bytes: {
    type: IMetricsComponent.HistogramType,
    help: 'Size of incoming RPC procedure call payloads in bytes',
    labelNames: ['procedure'],
    buckets: [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384]
  },
  rpc_out_procedure_call_size_bytes: {
    type: IMetricsComponent.HistogramType,
    help: 'Size of outgoing RPC procedure call payloads in bytes',
    labelNames: ['code', 'procedure'],
    buckets: [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384]
  },
  rpc_updates_sent_on_subscription: {
    type: IMetricsComponent.CounterType,
    help: 'Number of updates sent on RPC subscription streams',
    labelNames: ['event']
  },
  ws_backpressure_events: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket messages that encountered backpressure or were dropped',
    labelNames: ['result'] // 'backpressure' or 'dropped'
  },
  ws_drain_events: {
    type: IMetricsComponent.CounterType,
    help: 'Number of WebSocket drain events'
  },
  ws_message_size_bytes: {
    type: IMetricsComponent.HistogramType,
    help: 'Size of WebSocket messages in bytes',
    labelNames: ['result'], // 'success', 'backpressure', or 'dropped'
    buckets: [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384]
  },
  ws_queue_vs_backpressure_ratio: {
    type: IMetricsComponent.GaugeType,
    help: 'Ratio of message queue size to uWebSocket buffered amount',
    labelNames: ['transport_id']
  },
  ws_circuit_breaker_events: {
    type: IMetricsComponent.CounterType,
    help: 'Number of circuit breaker events (opened/closed)',
    labelNames: ['action', 'transport_id']
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
