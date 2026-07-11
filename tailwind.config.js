/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#e0eaff',
          500: '#3b5bdb',
          600: '#364fc7',
          700: '#2f44ad',
          900: '#1a237e',
        },
        surface: {
          0:   '#ffffff',
          50:  '#f8f9fa',
          100: '#f1f3f5',
          200: '#e9ecef',
          800: '#1c1e26',
          900: '#12131a',
        },
        danger:  '#e03131',
        warning: '#f08c00',
        success: '#2f9e44',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
