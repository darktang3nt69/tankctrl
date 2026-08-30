import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LiveEventsProvider } from './ws/LiveEventsProvider'
import { ToastProvider } from './components/Toast'
import { AppShell } from './components/AppShell'
import { Overview } from './routes/Overview'
import { TankDetail } from './routes/TankDetail'
import { Alerts } from './routes/Alerts'
import { Settings } from './routes/Settings'
import { NotFound } from './routes/NotFound'
import { useGlobalLiveSync } from './ws/useGlobalLiveSync'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function GlobalLiveSync() {
  useGlobalLiveSync()
  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LiveEventsProvider>
          <ToastProvider>
            <GlobalLiveSync />
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Overview />} />
                <Route path="tanks/:deviceId" element={<TankDetail />} />
                <Route path="alerts" element={<Alerts />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </ToastProvider>
        </LiveEventsProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
