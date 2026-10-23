const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
const jestConfig = createJestConfig(customJestConfig)

module.exports = async () => {
  const config = await jestConfig()

  // next/jest solo permite *añadir* a transformIgnorePatterns, y su primera entrada
  // (`/node_modules/`) gana siempre. polylabel y su dependencia tinyqueue se publican
  // únicamente como ESM, así que hay que reemplazar la lista para poder transformarlos.
  config.transformIgnorePatterns = [
    '/node_modules/(?!.*(polylabel|tinyqueue)/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ]

  return config
}
