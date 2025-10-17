module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'test/tsconfig.json' }]
  },
  transformIgnorePatterns: ['/node_modules/(?!@dcl/protocol)'],
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: 'coverage',
  testMatch: ['**/test/integration/**/*.spec.(ts)'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/integration/setupTests.ts'],
  resetMocks: true,
  // Increase timeout for component initialization
  testTimeout: 60000,
  // Force sequential execution
  maxWorkers: 1,
  // Ensure proper cleanup
  forceExit: true,
  detectOpenHandles: true
}
