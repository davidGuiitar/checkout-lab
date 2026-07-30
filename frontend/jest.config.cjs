module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'vue'],
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
    '.*\\.vue$': '@vue/vue3-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/lib/**/*.ts',
    'src/store/**/*.ts',
    'src/views/**/*.vue',
    '!src/**/*.spec.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
}
