/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#185FA5', light: '#E6F1FB', dark: '#0C447C' },
        success: { DEFAULT: '#3B6D11', light: '#EAF3DE' },
        warning: { DEFAULT: '#BA7517', light: '#FAEEDA' },
        danger: { DEFAULT: '#A32D2D', light: '#FCEBEB' },
        teal: { DEFAULT: '#0F6E56', light: '#E1F5EE' },
        purple: { DEFAULT: '#534AB7', light: '#EEEDFE' },
      }
    }
  },
  plugins: []
};
