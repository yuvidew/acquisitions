export default {
  testEnvironment: 'node',
  // The project is native ESM, so no transform is needed.
  transform: {},
  testMatch: ['<rootDir>/test/**/*.test.js'],
  clearMocks: true,
};
