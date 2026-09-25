import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/400-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource-variable/source-serif-4/index.css'
import './styles.css'

import * as Tooltip from '@radix-ui/react-tooltip'
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router'
import Home from './routes/Home'
import NotFound from './routes/NotFound'
import { ThemeProvider } from './theme/theme'

const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '*', element: <NotFound /> },
]

// Dev-only routes are left out of production builds entirely.
if (import.meta.env.DEV) {
  // oxlint-disable-next-line react/only-export-components -- entry file, never hot-swapped
  const DevCard = lazy(() => import('./routes/dev/DevCard'))
  routes.push({
    path: '/dev/card',
    element: (
      <Suspense fallback={null}>
        <DevCard />
      </Suspense>
    ),
  })
}

const router = createBrowserRouter(routes, { basename: '/app' })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Tooltip.Provider delayDuration={300}>
        <RouterProvider router={router} />
      </Tooltip.Provider>
    </ThemeProvider>
  </StrictMode>,
)
