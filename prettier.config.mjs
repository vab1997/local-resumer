export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
  plugins: ['prettier-plugin-organize-imports', 'prettier-plugin-tailwindcss'],
  // Tailwind v4 has no tailwind.config: point the class-sorting plugin at the CSS entry.
  tailwindStylesheet: './entrypoints/sidepanel/style.css'
}
