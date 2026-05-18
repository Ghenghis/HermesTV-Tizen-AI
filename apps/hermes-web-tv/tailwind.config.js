export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
      'tv-hd': '1920px',
      'tv-4k': '3840px',
    },
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
        // QN QLED accent colors
        'qn-gold': '#FFD700',
        'qn-glow': 'rgba(255,215,0,0.3)',
      },
      fontSize: {
        'tv-xs': '0.875rem',
        'tv-sm': '1rem',
        'tv-base': '1.25rem',
        'tv-lg': '1.5rem',
        'tv-xl': '2rem',
        'tv-2xl': '2.5rem',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(255,215,0,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(255,215,0,0.7)' },
        },
      },
      blur: {
        'tv-blur': '12px',
      },
    },
  },
  plugins: [],
};
