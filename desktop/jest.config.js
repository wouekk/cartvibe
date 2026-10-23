module.exports = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/src/open-api/',
    '<rootDir>/e2e/'
  ],
  // Performance optimizations
  maxWorkers: '50%',
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  // Transform configuration with isolatedModules for faster compilation
  transform: {
    '^.+\\.(ts|js|mjs|html|svg)$': [
      'jest-preset-angular',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        stringifyContentPathRegex: '\\.(html|svg)$',
      }
    ]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/open-api/**',
    '!src/environments/**'
  ],
  coverageDirectory: 'coverage/cartvibe-desktop',
  coverageReporters: ['html', 'lcov', 'cobertura', 'text-summary'],
  coverageThreshold: {
    global: {
      statements: 1,
      branches: 1,
      functions: 1,
      lines: 1
    }
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^@spartan-ng/helm/(.*)$': '<rootDir>/src/ui/$1',
    '^apexcharts$': '<rootDir>/src/testing/apexcharts.stub.ts'
  },
  transformIgnorePatterns: [
    'node_modules/(?!.*\\.mjs$|@angular|@ngxs|@spartan-ng|@ng-icons|rxjs|ngx-mask|pretty-print-json|lodash-es)'
  ],
  // Additional performance settings
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  },
  workerIdleMemoryLimit: '512MB'
};
