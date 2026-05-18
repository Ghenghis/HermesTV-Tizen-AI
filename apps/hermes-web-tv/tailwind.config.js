export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // night-blue theme
        'nb-bg': '#0d1117',
        'nb-surface': '#161b22',
        'nb-accent': '#1f6feb',
        'nb-text': '#e6edf3',
        'nb-muted': '#8b949e',
        // mom-calm theme
        'mc-bg': '#1a1410',
        'mc-surface': '#2a201a',
        'mc-accent': '#e07b39',
        'mc-text': '#f5ede6',
        'mc-muted': '#c4a882',
      },
      fontSize: {
        'tv-xs': '0.875rem',
        'tv-sm': '1rem',
        'tv-base': '1.25rem',
        'tv-lg': '1.5rem',
        'tv-xl': '2rem',
        'tv-2xl': '2.5rem',
      },
    },
  },
  plugins: [],
};
