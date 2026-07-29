/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./Brandible/**/*.html",
    "./Brandible/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        'brand-blue': '#1D4ED8',
        'brand-blue-600': '#2563EB',
        'brand-indigo-600': '#4F46E5',
        'brand-yellow': '#FACC15',
        'brand-orange': '#F97316',
        'brand-orange-600': '#EA580C',
        'brand-sky': '#60A5FA',
        navy: {
          950: '#060D1F',
          900: '#0A1633',
          800: '#0F2149',
          700: '#16306B',
        },
        cloud: '#F5F7FA',
      },
      fontFamily: {
        display: ['"League Spartan"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
