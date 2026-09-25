import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/400-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource-variable/source-serif-4/index.css'
import './styles.css'

import * as Tooltip from '@radix-ui/react-tooltip'
import { StrictMode, Suspense, lazy, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router'
import Home from './routes/Home'
import NotFound from './routes/NotFound'
import { ThemeProvider } from './theme/theme'

// Subject and topic pages load on demand, so the home page stays light.
// oxlint-disable-next-line react/only-export-components -- entry file, never hot-swapped
const Subject = lazy(() => import('./routes/Subject'))
// oxlint-disable-next-line react/only-export-components -- entry file, never hot-swapped
const Topic = lazy(() => import('./routes/topic/Topic'))

const page = (element: ReactNode) => <Suspense fallback={null}>{element}</Suspense>

const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/:subject', element: page(<Subject />) },
  { path: '/:subject/:topicSlug', element: page(<Topic />) },
  { path: '*', element: <NotFound /> },
]

// Dev routes: in `vite dev` and in Vercel preview builds, never in production.
if (import.meta.env.DEV || __DEV_ROUTES__) {
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
