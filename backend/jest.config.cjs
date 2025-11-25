/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js'],
  collectCoverageFrom: [
    'src/services/**/*.ts',
    '!src/services/serviceErrors.ts',
    '!src/services/index.ts',
  ],
  coverageDirectory: 'coverage',
  clearMocks: true,
};
