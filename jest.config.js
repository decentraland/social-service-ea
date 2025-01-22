module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'test/tsconfig.json' }]
  },
  transformIgnorePatterns: ['/node_modules/(?!@dcl/protocol)'],
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', 'src/**/*.js', '!src/migrations/**'],
  testMatch: ['**/*.spec.(ts)'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts']
}
