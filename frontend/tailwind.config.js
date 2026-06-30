/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sidebar: { DEFAULT: '#1a1d23', hover: '#22262e' },
        brand: { DEFAULT: '#2563eb', hover: '#1d4ed8' },
      },
    },
  },
  plugins: [],
};
