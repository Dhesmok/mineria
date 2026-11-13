import { fontFamily } from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // En un Mac o un iPhone se usa la San Francisco del sistema; en lo
        // demás, Inter, que es la que más se le parece.
        sans: ['-apple-system', 'BlinkMacSystemFont', 'var(--font-body)', ...fontFamily.sans],
        heading: ['-apple-system', 'BlinkMacSystemFont', 'var(--font-heading)', ...fontFamily.sans],
        body: ['-apple-system', 'BlinkMacSystemFont', 'var(--font-body)', ...fontFamily.sans],
        // La serif de los títulos de panel: el acento editorial.
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif']
      },
      colors: {
        // `<alpha-value>` deja escribir `bg-primary/10`: el mismo token con
        // transparencia, sin inventar un color nuevo para cada tono.
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)'
        },
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)'
        },
        // La escala de texto de Apple: principal (foreground), secundario,
        // terciario, cuaternario. Ver app/globals.css.
        label: {
          2: 'hsl(var(--label-2) / <alpha-value>)',
          3: 'hsl(var(--label-3) / <alpha-value>)',
          4: 'hsl(var(--label-4) / <alpha-value>)',
          5: 'hsl(var(--label-5) / <alpha-value>)',
        },
        fill: {
          DEFAULT: 'hsl(var(--fill) / <alpha-value>)',
          strong: 'hsl(var(--fill-strong) / <alpha-value>)',
        },
        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
      },
      borderRadius: {
        xl: `calc(var(--radius) + 4px)`,
        lg: `var(--radius)`,
        md: `calc(var(--radius) - 2px)`,
        sm: `calc(var(--radius) - 4px)`
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" }
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out"
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
