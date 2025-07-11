/** @type {import('tailwindcss').Config} */

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        heading: ['Bebas Neue', 'sans-serif'],
        body: ['Roboto', 'sans-serif'],
        montserrat: ['Montserrat', 'sans-serif'],
        dancing: ["Dancing Script", "cursive"],
        greatvibes: ["Great Vibes", "cursive"],
      },
      colors: {
        primary: {
          red: '#FF0000',
          yellow: '#FFC107',
          orange: '#FF5722',
        },
        secondary: {
          blue: '#0D1B2A',
          purple: '#8A2BE2',
          dark: '#1E1E1E',
        },
        background: 'rgb(var(--background) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        'card-border': 'rgb(var(--card-border) / <alpha-value>)',
      },
      animation: {
        'sparkle': 'sparkle 1.5s linear infinite',
        'fadeIn': "fadeIn 2s ease-in-out",
        'fadeInOut': "fadeInOut 3s ease-in-out infinite",
        'marquee': "marquee 40s linear infinite",
      },
      keyframes: {
        sparkle: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
        fadeIn: {
          "0%": { opacity: 0, transform: "translateY(10px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        fadeInOut: {
          "0%, 100%": { opacity: 0, transform: "translateY(10px)" },
          "10%, 90%": { opacity: 1, transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(-100%)" },
        },
      },
      zIndex: {
        60: '60',
        70: '70',
        80: '80',
        90: '90',
        100: '100',
      }
    },
  },
  plugins: [],
};