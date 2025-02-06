/** @type {import('tailwindcss').Config} */

// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#771A35", // Verde oscuro
        secondary: "#9B2548", // Verde claro
        background: "#F4FDF3", // Fondo claro
        accent: "#771A35",
        'custom-gold': '#BE955F',
      },
    },
  },
  plugins: [],
};
