import { useState, useEffect, useCallback } from 'react'
import { Globe, Keyboard, Users, Info, KeyRound, Trash2, Link2, Link2Off, Save } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useTeamStore } from '@/stores/teamStore'
import { useGameTabStore } from '@/stores/gameTabStore'
import { useAccountStore } from '@/stores/accountStore'
import { captureSession, hasDeviceCertificate } from '@/mods/account-session'
import type { DofusWindow } from '@/types/dofus-window'
import { recordKeyCombo } from '@/hooks/use-hotkeys'
import { HOTKEY_ACTIONS, HOTKEY_ACTION_LABELS, HOTKEY_GROUPS, RESOLUTIONS, LANGUAGES } from '@nememu/shared'
import { colors } from '@/theme'
import type { HotkeyAction, Language } from '@nememu/shared'
import { useT } from '@/i18n'

const ghostBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: colors.textFaint,
  fontSize: 10, cursor: 'pointer',
}

function hoverColor(e: React.MouseEvent, color: string) {
  (e.currentTarget as HTMLElement).style.color = color
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
        background: checked ? colors.accent : colors.toggleOff,
        position: 'relative', transition: 'background 0.2s', flexShrink: 0, padding: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: 8, background: colors.white,
        transition: 'left 0.15s', boxShadow: colors.shadow,
      }} />
    </button>
  )
}

function Select({ value, onChange, options, width }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; width?: number }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        appearance: 'none', background: `${colors.input} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E") no-repeat right 10px center`,
        border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.textLight,
        fontSize: 12, padding: '6px 28px 6px 10px', outline: 'none', width: width || 'auto', minWidth: 140,
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function TextInput({ value, onChange, placeholder, type }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type || 'text'} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: colors.input, border: `1px solid ${colors.border}`, borderRadius: 6,
        color: colors.textLight, fontSize: 12, padding: '6px 10px', outline: 'none', width: '100%',
      }}
    />
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', minHeight: 36 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 1.3 }}>{label}</div>
        {desc && <div style={{ fontSize: 11, color: colors.textDesc, marginTop: 1, lineHeight: 1.2 }}>{desc}</div>}
      </div>
      <div style={{ marginLeft: 16, flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.accent, padding: '10px 0 3px', opacity: 0.7 }}>{title}</div>
      <div>{children}</div>
    </div>
  )
}


/**
 * The game's own fight options, surfaced here because they matter for comfort
 * and are buried in the game's menus. Values are read from the running game
 * rather than mirrored locally, so this never disagrees with what the game
 * actually applies.
 */

/**
 * The control bar toggles, as switches. They are readable and settable from
 * here so nothing depends on remembering a function key — the ones worth
 * flipping mid-game keep a shortcut as well.
 */
function GeneralTab() {
  const t = useT()
  const { language, window: win, proxy, game, autoPlay, setLanguage, setResolution, toggleAudioMute, toggleSoundOnFocus, setProxySettings, toggleAutoGroup, toggleAutoInvite, toggleNotifications, toggleFpsCounter, setAutoPlay } = useSettingsStore()

  return (
    <>
      <Section title={t('Language')}>
        <Row label={t('Interface language')}>
          <Select value={language} onChange={(v) => setLanguage(v as Language)} options={LANGUAGES.map((l) => ({ value: l.value, label: l.name }))} />
        </Row>
      </Section>
      {/* The same switch as the launcher's checkbox, reachable from inside the
          game. It only lived on the launcher before, which meant turning it on
          hid the one control that could turn it off. */}
      <Section title={t('Startup')}>
        <Row label={t('Launch the game automatically')} desc={t('Skip straight to the game when the launcher is ready')}>
          <Toggle checked={autoPlay} onChange={setAutoPlay} />
        </Row>
      </Section>
      <Section title={t('Display')}>
        <Row label={t('Resolution')} desc={t('Game rendering resolution')}>
          <Select value={`${win.resolution.width}x${win.resolution.height}`} onChange={(v) => { const [w, h] = v.split('x').map(Number); setResolution(w, h) }} options={RESOLUTIONS.map((r) => ({ value: r, label: r }))} />
        </Row>
      </Section>
      <Section title={t('Audio')}>
        <Row label={t('Mute audio')}><Toggle checked={win.audioMuted} onChange={toggleAudioMute} /></Row>
        <Row label={t('Sound only when focused')} desc={t('Mute when window is in background')}><Toggle checked={win.soundOnFocus} onChange={toggleSoundOnFocus} /></Row>
      </Section>
      <Section title={t('Game')}>
        <Row label={t('Auto-group')} desc={t('Followers auto-follow leader across maps')}><Toggle checked={game.autoGroupEnabled} onChange={toggleAutoGroup} /></Row>
        {game.autoGroupEnabled && (
          <Row label={t('Auto-invite')} desc={t('Automatically send and accept party invites')}><Toggle checked={game.autoInviteEnabled} onChange={toggleAutoInvite} /></Row>
        )}
        <Row label={t('Notifications')}><Toggle checked={game.notificationsEnabled} onChange={toggleNotifications} /></Row>
        <Row label={t('Show FPS')} desc={t('The game caps itself at 60')}>
          <Toggle checked={game.showFpsCounter} onChange={toggleFpsCounter} />
        </Row>
      </Section>
      <Section title={t('Proxy')}>
        <Row label={t('Enable proxy')}><Toggle checked={proxy.enabled} onChange={(v) => setProxySettings({ enabled: v })} /></Row>
        {proxy.enabled && (
          <div style={{ padding: '8px 0 12px', display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 80px', gap: 6 }}>
              <Select value={proxy.protocol} onChange={(v) => setProxySettings({ protocol: v as 'http' | 'https' | 'socks5' })} options={[{ value: 'http', label: 'HTTP' }, { value: 'https', label: 'HTTPS' }, { value: 'socks5', label: 'SOCKS5' }]} />
              <TextInput value={proxy.host} onChange={(v) => setProxySettings({ host: v })} placeholder={t('Host')} />
              <TextInput value={String(proxy.port)} onChange={(v) => setProxySettings({ port: parseInt(v) || 0 })} placeholder={t('Port')} type="number" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <TextInput value={proxy.username} onChange={(v) => setProxySettings({ username: v })} placeholder={t('Username (optional)')} />
              <TextInput value={proxy.password} onChange={(v) => setProxySettings({ password: v })} placeholder={t('Password (optional)')} type="password" />
            </div>
            <div style={{ fontSize: 11, color: colors.textFaint, lineHeight: 1.5 }}>
              {t('Applied to game traffic. The password is encrypted by your OS keychain before being written to disk.')}
            </div>
          </div>
        )}
      </Section>
    </>
  )
}

/**
 * Groups drive the layout, but any action missing from them still has to be
 * reachable — otherwise adding a hotkey and forgetting the group would silently
 * hide it from the settings.
 */
function buildHotkeyGroups() {
  const grouped = new Set(HOTKEY_GROUPS.flatMap((group) => group.actions))
  const ungrouped = HOTKEY_ACTIONS.filter((action) => !grouped.has(action))

  return ungrouped.length > 0
    ? [...HOTKEY_GROUPS, { title: 'Other', actions: ungrouped }]
    : HOTKEY_GROUPS
}

function HotkeysTab() {
  const t = useT()
  const groups = buildHotkeyGroups()
  const { hotkeys, setHotkey, resetHotkeys } = useSettingsStore()
  const [recording, setRecording] = useState<HotkeyAction | null>(null)

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!recording) return
    event.preventDefault()
    event.stopPropagation()
    const combo = recordKeyCombo(event)
    if (combo) { setHotkey(recording, combo); setRecording(null) }
  }, [recording, setHotkey])

  useEffect(() => {
    if (!recording) return
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [recording, handleKeyDown])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 0 8px' }}>
        <button
          onClick={resetHotkeys}
          style={{ background: 'none', border: 'none', color: colors.textDim, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
          onMouseEnter={(e) => hoverColor(e, colors.hoverLight)}
          onMouseLeave={(e) => hoverColor(e, colors.textDim)}
        >
          {t('Reset to defaults')}
        </button>
      </div>
      {groups.map((group) => (
        <Section key={group.title} title={t(group.title)}>
          {group.actions.map((action) => (
            <div key={action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${colors.borderFaint}` }}>
              <span style={{ fontSize: 13, color: colors.textSecondary }}>{t(HOTKEY_ACTION_LABELS[action])}</span>
              <button
                onClick={() => setRecording(recording === action ? null : action)}
                style={{
                  minWidth: 110, padding: '4px 12px', borderRadius: 5, fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer', textAlign: 'center',
                  background: recording === action ? colors.accentFocus : colors.input,
                  border: `1px solid ${recording === action ? colors.accentBorder : colors.border}`,
                  color: recording === action ? colors.accentText : colors.textMuted,
                }}
              >
                {recording === action ? t('Press keys...') : hotkeys[action] || t('None')}
              </button>
            </div>
          ))}
        </Section>
      ))}
    </>
  )
}

function TeamsTab() {
  const t = useT()
  const { characters, teams, activeTeamId, addCharacter, removeCharacter, createTeam, deleteTeam, duplicateTeam, renameTeam, addToTeam, removeFromTeam, setLeader, setActiveTeam } = useTeamStore()
  const [charName, setCharName] = useState('')
  const [charServer, setCharServer] = useState('')
  const [charAccount, setCharAccount] = useState('')
  const [teamName, setTeamName] = useState('')
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  return (
    <>
      {teams.length > 0 && (
        <Section title={t('Active team')}>
          <Row label={t('Quick switch')}>
            <Select
              value={activeTeamId || ''}
              onChange={(v) => setActiveTeam(v || undefined)}
              options={[{ value: '', label: t('None') }, ...teams.map((t) => ({ value: t.id, label: `${t.name} (${t.memberIds.length})` }))]}
            />
          </Row>
        </Section>
      )}

      <Section title={t('Characters')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 6, padding: '8px 0' }}>
          <TextInput value={charName} onChange={setCharName} placeholder={t('Name')} />
          <TextInput value={charServer} onChange={setCharServer} placeholder={t('Server')} />
          <TextInput value={charAccount} onChange={setCharAccount} placeholder={t('Account')} />
          <button
            onClick={() => { if (charName && charServer && charAccount) { addCharacter({ name: charName, server: charServer, accountId: charAccount }); setCharName(''); setCharServer(''); setCharAccount('') } }}
            style={{ background: colors.accent, border: 'none', borderRadius: 6, color: colors.white, fontSize: 14, width: 32, cursor: 'pointer' }}
          >+</button>
        </div>
        {characters.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${colors.borderFaint}` }}>
            <div>
              <div style={{ fontSize: 13, color: colors.textSecondary }}>{c.name}</div>
              <div style={{ fontSize: 10, color: colors.textFaint }}>{c.server} / {c.accountId}</div>
            </div>
            <button onClick={() => removeCharacter(c.id)} style={{ ...ghostBtn, fontSize: 11 }} onMouseEnter={(e) => hoverColor(e, colors.danger)} onMouseLeave={(e) => hoverColor(e, colors.textFaint)}>{t('Remove')}</button>
          </div>
        ))}
        {characters.length === 0 && <div style={{ color: colors.textDisabled, fontSize: 12, padding: 16, textAlign: 'center' }}>{t('No characters added yet')}</div>}
      </Section>

      <Section title={t('Teams')}>
        <div style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
          <div style={{ flex: 1 }}><TextInput value={teamName} onChange={setTeamName} placeholder={t('Team name')} /></div>
          <button onClick={() => { if (teamName) { createTeam(teamName); setTeamName('') } }} style={{ background: colors.accent, border: 'none', borderRadius: 6, color: colors.white, fontSize: 12, padding: '0 14px', cursor: 'pointer' }}>{t('Create')}</button>
        </div>
        {teams.map((team) => {
          const members = team.memberIds.map((id) => characters.find((c) => c.id === id)).filter(Boolean)
          const available = characters.filter((c) => !team.memberIds.includes(c.id))
          const active = activeTeamId === team.id
          const isEditing = editingTeamId === team.id
          return (
            <div key={team.id} style={{ border: `1px solid ${active ? colors.purpleBorder : colors.borderTeam}`, borderRadius: 8, padding: 10, marginBottom: 8, background: active ? colors.purpleBg : 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                {isEditing ? (
                  <div style={{ display: 'flex', gap: 4, flex: 1, marginRight: 8 }}>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && editName) { renameTeam(team.id, editName); setEditingTeamId(null) } if (e.key === 'Escape') setEditingTeamId(null) }}
                      autoFocus
                      style={{ background: colors.input, border: `1px solid ${colors.border}`, borderRadius: 4, color: colors.textBright, fontSize: 12, padding: '2px 6px', flex: 1, outline: 'none' }}
                    />
                    <button onClick={() => { if (editName) { renameTeam(team.id, editName); setEditingTeamId(null) } }} style={{ background: colors.accent, border: 'none', borderRadius: 4, color: colors.white, fontSize: 10, padding: '2px 8px', cursor: 'pointer' }}>{t('Save')}</button>
                  </div>
                ) : (
                  <span
                    style={{ fontSize: 13, fontWeight: 500, color: colors.textBright, cursor: 'pointer' }}
                    onDoubleClick={() => { setEditingTeamId(team.id); setEditName(team.name) }}
                  >
                    {team.name} <span style={{ color: colors.textFaint, fontWeight: 400, fontSize: 11 }}>{members.length} members</span>
                  </span>
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setActiveTeam(active ? undefined : team.id)} style={{ background: active ? colors.purple : colors.surfaceHover, border: 'none', borderRadius: 4, color: active ? colors.white : colors.textMuted, fontSize: 10, padding: '3px 10px', cursor: 'pointer' }}>{active ? t('Active') : t('Activate')}</button>
                  <button onClick={() => duplicateTeam(team.id)} style={ghostBtn} onMouseEnter={(e) => hoverColor(e, colors.hoverLight)} onMouseLeave={(e) => hoverColor(e, colors.textFaint)}>{t('Duplicate')}</button>
                  <button onClick={() => deleteTeam(team.id)} style={ghostBtn} onMouseEnter={(e) => hoverColor(e, colors.danger)} onMouseLeave={(e) => hoverColor(e, colors.textFaint)}>{t('Delete')}</button>
                </div>
              </div>
              {members.map((m) => m && (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderRadius: 4, background: colors.surface, marginBottom: 3, fontSize: 12 }}>
                  <span style={{ color: colors.textMember }}>{team.leaderId === m.id ? '\u2B50 ' : ''}{m.name}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {team.leaderId !== m.id && <button onClick={() => setLeader(team.id, m.id)} style={ghostBtn}>{t('Leader')}</button>}
                    <button onClick={() => removeFromTeam(team.id, m.id)} style={ghostBtn} onMouseEnter={(e) => hoverColor(e, colors.danger)} onMouseLeave={(e) => hoverColor(e, colors.textFaint)}>x</button>
                  </div>
                </div>
              ))}
              {available.length > 0 && (
                <Select value="" onChange={(v) => { if (v) addToTeam(team.id, v) }} options={[{ value: '', label: t('Add member...') }, ...available.map((c) => ({ value: c.id, label: `${c.name} (${c.server})` }))]} width={200} />
              )}
            </div>
          )
        })}
        {teams.length === 0 && <div style={{ color: colors.textDisabled, fontSize: 12, padding: 16, textAlign: 'center' }}>{t('No teams created yet')}</div>}
      </Section>
    </>
  )
}

function AboutTab() {
  const t = useT()
  return (
    <Section title="Nememu">
      {/* Read from package.json at build time. It was the string "0.1.0",
          written by hand and left behind at every release since. */}
      <Row label={t('Version')}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: colors.textMuted }}>{__APP_VERSION__}</span></Row>
      <Row label={t('Platform')}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: colors.textMuted }}>{navigator.platform}</span></Row>
      <Row label={t('Engine')}><span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: colors.textMuted }}>Electron</span></Row>
      <div style={{ padding: '16px 0 8px', fontSize: 12, color: colors.textFaint, lineHeight: 1.6 }}>Desktop client for Dofus Touch.</div>
    </Section>
  )
}


function SmallButton({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 9px', borderRadius: 6, cursor: 'pointer',
        border: `1px solid ${danger ? 'rgba(244,68,68,0.35)' : colors.border}`,
        background: danger ? 'rgba(244,68,68,0.08)' : colors.surface,
        color: danger ? colors.danger : colors.textSecondary,
        fontSize: 11, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function AccountsTab() {
  const t = useT()
  const { accounts, isHydrated, load, rename, forget, capture } = useAccountStore()
  const { tabs, activeTabId, setTabAccount, clearAccountFromTabs } = useGameTabStore()
  const [label, setLabel] = useState('')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')

  useEffect(() => { if (!isHydrated) void load() }, [isHydrated, load])

  const activeTab = tabs.find((t) => t.id === activeTabId)

  const saveCurrentSession = async () => {
    setFeedback(null)

    const gameWindow = (window.$gameWindows ?? []).find(
      (gw: DofusWindow) => gw.$game_id === activeTabId
    )

    if (!gameWindow) {
      setFeedback({ kind: 'error', text: t('No game loaded in the active tab.') })
      return
    }

    const name = label.trim() || activeTab?.characterName || activeTab?.name || 'Account'
    const captured = captureSession(gameWindow, name)

    if (!captured) {
      setFeedback({ kind: 'error', text: t('The active tab is not signed in yet — log in first, then save.') })
      return
    }

    const saved = await capture(captured)
    if (!saved) {
      setFeedback({ kind: 'error', text: t('Could not save: the OS refused to encrypt the credentials.') })
      return
    }

    if (activeTabId) setTabAccount(activeTabId, saved.id)
    setLabel('')
    setFeedback(
      hasDeviceCertificate(captured)
        ? { kind: 'ok', text: t('Saved as "{label}" and linked to this tab.', { label: saved.label }) }
        : {
            kind: 'warn',
            text: t(
              'Saved as "{label}", but no device certificate was found — Ankama may still email a code.',
              { label: saved.label }
            )
          }
    )
  }

  const forgetAccount = async (id: string) => {
    clearAccountFromTabs(id)
    await forget(id)
  }

  return (
    <>
      <Section title={t('Saved accounts')}>
        <div style={{ padding: '4px 0 10px', fontSize: 11, color: colors.textFaint, lineHeight: 1.6 }}>
          {t(
            'Saving an account keeps the Ankama device certificate of a session that is already signed in, so a linked tab reconnects on its own instead of asking for a new emailed code. Credentials are encrypted by your OS keychain and never leave this machine.'
          )}
        </div>

        {accounts.length === 0 && (
          <div style={{ padding: '10px 0', fontSize: 12, color: colors.textMuted }}>
            {t('No account saved yet.')}
          </div>
        )}

        {accounts.map((account) => {
          const linkedTab = tabs.find((t) => t.accountId === account.id)
          const isEditing = editingId === account.id

          return (
            <div
              key={account.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                borderBottom: `1px solid ${colors.borderSubtle}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <TextInput value={editLabel} onChange={setEditLabel} placeholder={t('Account name')} />
                ) : (
                  <div style={{ fontSize: 12, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {account.label}
                  </div>
                )}
                <div style={{ fontSize: 10, color: colors.textFaint, marginTop: 2 }}>
                  {linkedTab ? t('Linked to {name}', { name: linkedTab.characterName || linkedTab.name }) : t('Not linked to a tab')}
                  {account.hasSecrets ? '' : t(' — no stored credentials')}
                </div>
              </div>

              {isEditing ? (
                <SmallButton onClick={() => { void rename(account.id, editLabel); setEditingId(null) }}>
                  <Save size={12} /> {t('Save')}
                </SmallButton>
              ) : (
                <SmallButton onClick={() => { setEditingId(account.id); setEditLabel(account.label) }}>
                  {t('Rename')}
                </SmallButton>
              )}

              {linkedTab?.id === activeTabId ? (
                <SmallButton onClick={() => activeTabId && setTabAccount(activeTabId, undefined)}>
                  <Link2Off size={12} /> {t('Unlink')}
                </SmallButton>
              ) : (
                <SmallButton onClick={() => activeTabId && setTabAccount(activeTabId, account.id)}>
                  <Link2 size={12} /> {t('Use here')}
                </SmallButton>
              )}

              <SmallButton danger onClick={() => void forgetAccount(account.id)}>
                <Trash2 size={12} /> {t('Forget')}
              </SmallButton>
            </div>
          )
        })}
      </Section>

      <Section title={t('Save the active tab')}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, padding: '4px 0' }}>
          <TextInput
            value={label}
            onChange={setLabel}
            placeholder={activeTab?.characterName || activeTab?.name || t('Account name')}
          />
          <SmallButton onClick={() => void saveCurrentSession()}>
            <KeyRound size={12} /> {t('Save session')}
          </SmallButton>
        </div>

        {feedback && (
          <div
            style={{
              fontSize: 11, lineHeight: 1.5, padding: '6px 0 2px',
              color: feedback.kind === 'error' ? colors.danger : feedback.kind === 'warn' ? colors.accentText : colors.textSecondary,
            }}
          >
            {feedback.text}
          </div>
        )}
      </Section>
    </>
  )
}

const TABS = [
  { id: 'General', icon: Globe },
  { id: 'Accounts', icon: KeyRound },
  { id: 'Hotkeys', icon: Keyboard },
  { id: 'Teams', icon: Users },
  { id: 'About', icon: Info },
] as const

export function SettingsScreen() {
  const t = useT()
  const [tab, setTab] = useState('General')
  const { loadSettings, isHydrated } = useSettingsStore()
  useEffect(() => { if (!isHydrated) loadSettings() }, [isHydrated, loadSettings])

  // No font-family on the wrapper: it inherits --font-sans from the body like
  // everything else. It used to pin its own stack, which is how the settings
  // panel ended up on a different font from the window it opens over.
  return (
    <div>
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${colors.borderSubtle}`, marginBottom: 4 }}>
        {TABS.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 14px 8px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer',
                color: active ? colors.text : colors.textFaint, fontWeight: active ? 500 : 400,
                borderBottom: active ? `2px solid ${colors.accent}` : '2px solid transparent',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { if (!active) hoverColor(e, colors.hoverMid) }}
              onMouseLeave={(e) => { if (!active) hoverColor(e, colors.textFaint) }}
            >
              <Icon size={13} />
              {t(item.id)}
            </button>
          )
        })}
      </div>
      {tab === 'General' && <GeneralTab />}
      {tab === 'Accounts' && <AccountsTab />}
      {tab === 'Hotkeys' && <HotkeysTab />}
      {tab === 'Teams' && <TeamsTab />}
      {tab === 'About' && <AboutTab />}
    </div>
  )
}
