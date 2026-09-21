module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/worker/'],
  clearMocks: true,
};
