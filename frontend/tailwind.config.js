/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#E8614A', light: '#FFF0EC', dark: '#C94A35' },
        success: { DEFAULT: '#3B6D11', light: '#EAF3DE' },
        warning: { DEFAULT: '#BA7517', light: '#FAEEDA' },
        danger:  { DEFAULT: '#A32D2D', light: '#FCEBEB' },
        teal:    { DEFAULT: '#0F6E56', light: '#E1F5EE' },
        purple:  { DEFAULT: '#534AB7', light: '#EEEDFE' },
      }
    }
  },
  plugins: []
};
