/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Golos Text"', 'system-ui', 'sans-serif'],
        display: ['Unbounded', '"Golos Text"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
