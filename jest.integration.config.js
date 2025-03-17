module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'test/tsconfig.json' }]
  },
  transformIgnorePatterns: ['/node_modules/(?!@dcl/protocol)'],
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', 'src/**/*.js', '!src/migrations/**'],
  testMatch: ['**/test/integration/**/*.spec.(ts)'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/integration/setupTests.ts'],
  resetMocks: true
}
