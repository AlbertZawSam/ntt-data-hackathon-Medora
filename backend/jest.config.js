/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // The first run compiles every handler with ts-jest and can take over a minute on a busy machine; a
  // test then exceeds Jest's 5-second default and fails at random (askHospitals, kb). 30 s is plenty.
  testTimeout: 30_000,
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { diagnostics: false, tsconfig: { module: 'commonjs', moduleResolution: 'node10', esModuleInterop: true, resolveJsonModule: true, target: 'es2022' } },
    ],
  },
};
