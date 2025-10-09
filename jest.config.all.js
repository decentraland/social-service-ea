const unitConfig = require('./jest.config.js')
const integrationConfig = require('./jest.integration.config.js')

module.exports = {
  ...unitConfig,
  // Combine test patterns from both configs
  testMatch: [...(unitConfig.testMatch || []), ...(integrationConfig.testMatch || [])],
  // Combine test environments if they're different
  testEnvironment: unitConfig.testEnvironment,
  // Ensure coverage is collected from all tests
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.js',
    '!src/migrations/**',
    '!src/utils/instrument.ts',
    '!src/adapters/tracing.ts',
    ...(unitConfig.collectCoverageFrom || []),
    ...(integrationConfig.collectCoverageFrom || [])
  ],
  // Run integration tests serially
  maxWorkers: 1,
  // Ensure proper cleanup
  forceExit: true,
  detectOpenHandles: true
}
