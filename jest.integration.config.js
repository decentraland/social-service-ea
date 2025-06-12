module.exports = {
  preset: 'ts-jest',
  runInBand: true,
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'test/tsconfig.json' }]
  },
  transformIgnorePatterns: ['/node_modules/(?!@dcl/protocol)'],
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: 'coverage',
  testMatch: ['**/test/integration/**/*.spec.(ts)'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/integration/setupTests.ts'],
  resetMocks: true
}
