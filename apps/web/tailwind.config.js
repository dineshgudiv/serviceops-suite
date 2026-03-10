/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        slate950: '#0b0e15',
        slate900: '#10131b',
        slate850: '#141824',
      },
      boxShadow: {
        glow: '0 0 20px rgba(72,106,255,0.12)',
      },
    },
  },
  plugins: [],
};
