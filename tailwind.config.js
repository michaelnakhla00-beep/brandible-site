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
      },
    },
  },
  plugins: [],
}
