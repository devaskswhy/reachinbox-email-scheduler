import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * DESIGN TOKENS
 *
 * Two rules drive everything below, and both are enforced by making the token
 * the *default* rather than an opt-in variant:
 *
 * 1. ONE ACCENT. A single hue is bound to --primary and --ring. Every
 *    interactive element - buttons, focus rings, the active tab, links -
 *    resolves to it through shadcn's variable contract, so nothing has to
 *    remember which colour to use and no second accent can drift in.
 *
 * 2. ONE EASING CURVE. `transitionTimingFunction.DEFAULT` is overridden, so a
 *    bare `transition-colors` already uses the brand curve. Components never
 *    specify easing, which is what stops per-component curves mixing.
 *
 * Motion durations are short by default (200ms), with named steps for small UI
 * (150-300ms) and page-level transitions (600ms).
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: 'hsl(var(--success))',
        info: 'hsl(var(--info))',
        warning: 'hsl(var(--warning))',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tighter: '-0.03em',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // The single brand curve. Overriding DEFAULT means `transition-colors`,
      // `transition-opacity` etc. pick it up with no extra class.
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.32, 0.72, 0, 1)',
        brand: 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
        page: '600ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(18px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 300ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'fade-in': 'fade-in 600ms cubic-bezier(0.32, 0.72, 0, 1) both',
        rise: 'rise 600ms cubic-bezier(0.32, 0.72, 0, 1) both',
      },
    },
  },
  plugins: [animate],
};

export default config;
