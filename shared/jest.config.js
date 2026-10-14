/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      // Jest runs CommonJS; the rest of the settings come from tsconfig.json.
      { tsconfig: { module: 'commonjs', moduleResolution: 'node10', esModuleInterop: true, resolveJsonModule: true } },
    ],
  },
};
