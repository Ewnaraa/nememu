import { useEffect, useState, createContext, useContext } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { LauncherScreen } from '@/screens/LauncherScreen'
import { GameScreen } from '@/screens/GameScreen'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { colors } from '@/theme'
import { useT } from '@/i18n'

const SettingsContext = createContext<{
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
}>({ settingsOpen: false, setSettingsOpen: () => {} })

export const useSettings = () => useContext(SettingsContext)

function SettingsOverlay() {
  const t = useT()
  const { settingsOpen, setSettingsOpen } = useSettings()
  if (!settingsOpen) return null

  return (
    <div
      style={{
        position: 'fixed', top: 32, left: 0, right: 0, bottom: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: colors.modalOverlay, backdropFilter: 'blur(4px)'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false) }}
    >
      <div
        style={{
          width: 460, maxHeight: '80vh',
          background: colors.bg, border: `1px solid ${colors.brandBorderFaint}`,
          borderRadius: 10, overflow: 'hidden', boxShadow: colors.modalShadow,
          display: 'flex', flexDirection: 'column'
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px 8px',
        }}>
          {/* No font-family here: it repeated an older, shorter version of the
              stack in index.css, so this one heading quietly diverged from the
              rest of the app every time that stack was touched. */}
          <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{t('Settings')}</span>
          <button
            onClick={() => setSettingsOpen(false)}
            style={{ background: 'none', border: 'none', color: colors.textFaint, cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = colors.white; e.currentTarget.style.background = colors.surfaceHover }}
            onMouseLeave={(e) => { e.currentTarget.style.color = colors.textFaint; e.currentTarget.style.background = 'none' }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 18px 16px' }}>
          <SettingsScreen />
        </div>
      </div>
    </div>
  )
}

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => { window.nememu.appReadyToShow() }, [])

  return (
    <SettingsContext.Provider value={{ settingsOpen, setSettingsOpen }}>
      <HashRouter>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/launcher" replace />} />
            <Route path="/launcher" element={<LauncherScreen />} />
            <Route path="/game" element={<GameScreen />} />
          </Routes>
          <SettingsOverlay />
        </div>
      </HashRouter>
    </SettingsContext.Provider>
  )
}
