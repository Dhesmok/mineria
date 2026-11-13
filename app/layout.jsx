import { Inter, Newsreader } from 'next/font/google'
import { cn } from '@/lib/utils'
import './globals.css'

const fontHeading = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-heading',
})

const fontBody = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
})

// La serif editorial de los títulos. Solo los títulos: en el cuerpo de un panel
// lleno de cifras una serif se lee peor que una sans.
const fontDisplay = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-display',
})

export const viewport = {
  themeColor: "#f5f5f7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
}

export const metadata = {
  title: "Visor Geológico y Minero - Colombia",
  description: "Visor de información geoespacial minera y territorial de Colombia",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Visor Minero",
  },
}

export default function Layout({ children }) {
  return (
    <html lang="es">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body 
        className={cn(
          'antialiased',
          fontHeading.variable,
          fontBody.variable,
          fontDisplay.variable
        )}
      >
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.warn('Error al registrar Service Worker:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
