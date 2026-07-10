import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '.output',
      '.wxt',
      'node_modules',
      'public',
      'dist',
      'out',
      '.agents',
      '.claude'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions
      }
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // Node build scripts + config files run in Node, not the browser.
    files: ['scripts/**', '**/*.config.{js,mjs,ts}'],
    languageOptions: { globals: { ...globals.node } }
  },
  prettier
)
