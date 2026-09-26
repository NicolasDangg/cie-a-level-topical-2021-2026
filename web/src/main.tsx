import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
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
// oxlint-disable-next-line react/only-export-components -- entry file, never hot-swapped
const Picker = lazy(() => import('./practice/Picker'))
// oxlint-disable-next-line react/only-export-components -- entry file, never hot-swapped
const SetPage = lazy(() => import('./practice/SetPage'))
// oxlint-disable-next-line react/only-export-components -- entry file, never hot-swapped
const Results = lazy(() => import('./practice/Results'))

const page = (element: ReactNode) => <Suspense fallback={null}>{element}</Suspense>

const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  // Practice sets come before /:subject so "practice" isn't read as a subject.
  { path: '/practice', element: page(<Picker />) },
  { path: '/practice/set', element: page(<SetPage />) },
  { path: '/practice/results', element: page(<Results />) },
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

// The extraction review tool saves through the dev server, so it only exists there.
if (import.meta.env.DEV) {
  // oxlint-disable-next-line react/only-export-components -- entry file, never hot-swapped
  const Review = lazy(() => import('./routes/dev/Review'))
  routes.push({ path: '/dev/review/:subject?/:topicSlug?', element: page(<Review />) })
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
