module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'test/tsconfig.json' }]
  },
  transformIgnorePatterns: ['/node_modules/(?!@dcl/protocol)'],
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: 'coverage',
  testMatch: ['**/test/unit/**/*.spec.(ts)'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/unit/setupTests.ts']
}
