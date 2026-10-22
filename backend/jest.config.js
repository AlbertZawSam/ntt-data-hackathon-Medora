/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { diagnostics: false, tsconfig: { module: 'commonjs', moduleResolution: 'node10', esModuleInterop: true, resolveJsonModule: true, target: 'es2022' } },
    ],
  },
};
