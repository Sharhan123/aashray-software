import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AlarmClock, BedDouble, Bell, BellRing, Building2, ChartNoAxesCombined, ChevronLeft, ChevronRight, CircleDollarSign, Command, CreditCard, LayoutDashboard, LogOut, Menu, MessageSquareText, Settings, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { AashrayLogo, BrandMark } from '../components/BrandMark';
import { useAuth } from '../state/useAuth';
import { CloseButton, ProfileButton, ThemeToggle } from '../components/ui';
import { api } from '../lib/api';

type OwnerReminderData = { _id: string; title: string; notes?: string; dueAt: string; repeatEveryHours?: number | null };

const mainItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, permission: 'dashboard:read' },
  { label: 'Properties', path: '/properties', icon: Building2, permission: 'rooms:read' },
  { label: 'Residents', path: '/residents', icon: Users, permission: 'residents:read' },
  { label: 'Payments', path: '/payments', icon: CreditCard, permission: 'payments:read' },
];
const moreItems = [
  { label: 'Rooms & Beds', path: '/rooms', icon: BedDouble, permission: 'rooms:read' },
  { label: 'Rent & Billing', path: '/billing', icon: CircleDollarSign, permission: 'billing:read' },
  { label: 'Reminders & Messages', path: '/messages', icon: MessageSquareText, permission: 'messages:read' },
  { label: 'My reminders', path: '/reminders', icon: AlarmClock, permission: '__owner_only__' },
  { label: 'Reports', path: '/reports', icon: ChartNoAxesCombined, permission: 'reports:read' },
  { label: 'Staff & Permissions', path: '/staff', icon: ShieldCheck, permission: 'staff:read' },
  { label: 'Settings', path: '/settings', icon: Settings, permission: 'settings:read' },
];

export function AppShell() {
  const { state, signOut } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const user = state.status === 'authenticated' ? state.user : null;
  const [collapsed, setCollapsed] = useState(false); const [drawerOpen, setDrawerOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false); const [moreOpen, setMoreOpen] = useState(false);
  const [dueReminder, setDueReminder] = useState<OwnerReminderData | null>(null); const [dueReminderCount, setDueReminderCount] = useState(0); const [alarmBusy, setAlarmBusy] = useState(false); const [alarmError, setAlarmError] = useState(''); const [suppressedReminderKey, setSuppressedReminderKey] = useState('');
  const [soundActive, setSoundActive] = useState(false); const [soundBlocked, setSoundBlocked] = useState(false); const [snoozeMinutes, setSnoozeMinutes] = useState(10);
  const audioContextRef = useRef<AudioContext | null>(null); const ringtoneIntervalRef = useRef<number | null>(null);
  const isOwner = user?.role === 'SUPER_ADMIN';
  const allowed = (item: { permission: string }) => user?.role === 'SUPER_ADMIN' || Boolean(user?.permissions.includes(item.permission));
  const visibleMain = mainItems.filter(allowed); const visibleMore = moreItems.filter(allowed);
  const active = [...mainItems, ...moreItems].find((item) => item.path === location.pathname || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`)));
  const doLogout = async () => { await signOut(); navigate('/login', { replace: true }); };
  useEffect(() => {
    if (!isOwner) { setDueReminder(null); setDueReminderCount(0); return; }
    let active = true;
    const poll = async () => {
      try {
        const result = await api.get<{ reminders: OwnerReminderData[] }>('/reminders/due');
        if (!active) return;
        setDueReminderCount(result.reminders.length);
        const next = result.reminders.find((reminder) => `${reminder._id}:${reminder.dueAt}` !== suppressedReminderKey) ?? null;
        setDueReminder((current) => current ?? next);
      } catch { /* Keep the rest of the workspace usable while reminders are unavailable. */ }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 60_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [isOwner, suppressedReminderKey]);
  async function acknowledgeDueReminder() {
    if (!dueReminder) return;
    setAlarmBusy(true); setAlarmError('');
    try {
      await api.post(`/reminders/${dueReminder._id}/acknowledge`, {});
      const result = await api.get<{ reminders: OwnerReminderData[] }>('/reminders/due');
      setSuppressedReminderKey(''); setDueReminderCount(result.reminders.length); setDueReminder(result.reminders[0] ?? null);
    } catch (error) { setAlarmError((error as Error).message); }
    finally { setAlarmBusy(false); }
  }
  const playRingtone = useCallback(async () => {
    try {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      const chime = () => {
        if (context.state !== 'running') return;
        [880, 660, 880, 660].forEach((frequency, index) => {
          const startAt = context.currentTime + index * 0.22;
          const oscillator = context.createOscillator(); const gain = context.createGain();
          oscillator.type = 'sine'; oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0.0001, startAt); gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.025); gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.19);
          oscillator.connect(gain); gain.connect(context.destination); oscillator.start(startAt); oscillator.stop(startAt + 0.2);
        });
      };
      if (ringtoneIntervalRef.current !== null) window.clearInterval(ringtoneIntervalRef.current);
      chime(); ringtoneIntervalRef.current = window.setInterval(chime, 2600); setSoundActive(true); setSoundBlocked(false);
    } catch { setSoundActive(false); setSoundBlocked(true); }
  }, []);
  const silenceRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current !== null) { window.clearInterval(ringtoneIntervalRef.current); ringtoneIntervalRef.current = null; }
    if (audioContextRef.current?.state === 'running') void audioContextRef.current.suspend();
    setSoundActive(false);
  }, []);
  useEffect(() => {
    if (dueReminder) { setSoundBlocked(false); void playRingtone(); }
    else silenceRingtone();
    return () => silenceRingtone();
  }, [dueReminder?._id, dueReminder?.dueAt, playRingtone, silenceRingtone]);
  useEffect(() => () => { if (audioContextRef.current) void audioContextRef.current.close(); }, []);
  async function snoozeDueReminder() {
    if (!dueReminder) return;
    setAlarmBusy(true); setAlarmError('');
    try {
      await api.post(`/reminders/${dueReminder._id}/snooze`, { minutes: snoozeMinutes });
      silenceRingtone();
      const result = await api.get<{ reminders: OwnerReminderData[] }>('/reminders/due');
      setDueReminderCount(result.reminders.length); setDueReminder(result.reminders[0] ?? null);
    } catch (error) { setAlarmError((error as Error).message); }
    finally { setAlarmBusy(false); }
  }
  async function stopDueReminder() {
    if (!dueReminder) return;
    setAlarmBusy(true); setAlarmError('');
    try {
      await api.post(`/reminders/${dueReminder._id}/stop`, {});
      silenceRingtone();
      const result = await api.get<{ reminders: OwnerReminderData[] }>('/reminders/due');
      setDueReminderCount(result.reminders.length); setDueReminder(result.reminders[0] ?? null);
    } catch (error) { setAlarmError((error as Error).message); }
    finally { setAlarmBusy(false); }
  }
  const sidebar = <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <div className="sidebar-brand"><AashrayLogo className="sidebar-brand-logo" /><span className="sidebar-compact-logo"><BrandMark /></span>{drawerOpen && <CloseButton onClick={() => setDrawerOpen(false)} />}</div>
    <NavLink to="/properties" className="workspace-select"><span className="workspace-icon"><Building2 size={16} /></span><span className="workspace-label"><b>All properties</b><small>Property workspace</small></span><ChevronRight size={14} /></NavLink>
    <nav className="side-nav" aria-label="Main navigation">{visibleMain.map((item) => <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={() => setDrawerOpen(false)} title={collapsed ? item.label : undefined}><item.icon size={18} strokeWidth={1.9} /><span>{item.label}</span></NavLink>)}{visibleMore.length > 0 && <><button type="button" className={`nav-link nav-more-toggle ${visibleMore.some((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)) ? 'nav-link-active' : ''}`} onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} title={collapsed ? 'More' : undefined}><Menu size={18} strokeWidth={1.9} /><span>More</span><ChevronRight size={14} className={moreOpen ? 'more-chevron-open' : 'more-chevron'} /></button>{moreOpen && <div className="nav-more-items">{visibleMore.map((item) => <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-link nav-link-sub ${isActive ? 'nav-link-active' : ''}`} onClick={() => setDrawerOpen(false)} title={collapsed ? item.label : undefined}><item.icon size={17} strokeWidth={1.9} /><span>{item.label}</span></NavLink>)}</div>}</>}</nav>
    <div className="sidebar-bottom"><div className="help-panel"><div className="help-icon"><Command size={16} /></div><div className="help-copy"><b>Need a hand?</b><span>We're here to help.</span></div><ChevronRight size={14} /></div><div className="sidebar-footer"><span>AH</span><small>AASHRAY HOSPITALITY<br />SURAT · GUJARAT</small><button aria-label="Collapse sidebar" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button></div></div>
  </aside>;
  return <div className="app-shell">
    <div className={`mobile-backdrop ${drawerOpen ? 'backdrop-visible' : ''}`} onClick={() => setDrawerOpen(false)} />
    <div className={`sidebar-wrap ${drawerOpen ? 'drawer-open' : ''}`}>{sidebar}</div>
    <div className="shell-main">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}><Menu size={21} /></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><b>{active?.label ?? 'Dashboard'}</b></div></div><div className="topbar-actions"><span className="topbar-date"><span /> Workspace ready</span><ThemeToggle /><button className="top-icon" aria-label={dueReminderCount ? `${dueReminderCount} due reminders; open reminder list` : 'Open reminders'} onClick={() => navigate('/reminders')}><Bell size={18} />{dueReminderCount > 0 && <i className="reminder-bell-dot"/>}</button><div className="profile-wrap"><ProfileButton name={user?.name ?? 'Team'} email={user?.email ?? ''} onClick={() => setProfileOpen(!profileOpen)} />{profileOpen && <div className="profile-menu"><div className="profile-menu-head"><b>{user?.name}</b><span>{user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Staff account'}</span></div><button onClick={doLogout}><LogOut size={16} /> Sign out</button></div>}</div></div></header>
      <main className="workspace-main"><Outlet /></main>
      <footer className="shell-footer"><span>© {new Date().getFullYear()} Aashray Hospitality</span><span>Built for thoughtful living <Sparkles size={10} className="footer-mark" /></span></footer>
    </div>
    {isOwner && dueReminder && <div className="owner-reminder-alarm-backdrop"><section className="owner-reminder-alarm" role="alertdialog" aria-modal="true" aria-labelledby="owner-reminder-alarm-title"><header><span className="owner-reminder-alarm-icon"><BellRing size={22}/></span><button type="button" aria-label="Dismiss reminder alert" onClick={() => { setSuppressedReminderKey(`${dueReminder._id}:${dueReminder.dueAt}`); setDueReminder(null); }}><X size={18}/></button></header><span className="dashboard-section-kicker">REMINDER DUE</span><h2 id="owner-reminder-alarm-title">{dueReminder.title}</h2>{dueReminder.notes && <p>{dueReminder.notes}</p>}<small>Scheduled for {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(dueReminder.dueAt))}{dueReminder.repeatEveryHours ? ` · Repeats every ${dueReminder.repeatEveryHours} hours` : ''}</small><div className="owner-reminder-alarm-sound"><span>{soundActive ? 'Ringtone is playing' : soundBlocked ? 'Sound was blocked by the browser' : 'Ringtone is off'}</span><button type="button" className="business-secondary" onClick={() => soundActive ? silenceRingtone() : void playRingtone()}>{soundActive ? 'Silence' : soundBlocked ? 'Enable ringtone' : 'Play ringtone'}</button></div><div className="owner-reminder-snooze"><label htmlFor="reminder-snooze-minutes">Snooze for</label><select id="reminder-snooze-minutes" className="business-input" value={snoozeMinutes} onChange={(event) => setSnoozeMinutes(Number(event.target.value))}><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>1 hour</option><option value={120}>2 hours</option></select><button type="button" className="business-secondary" onClick={() => void snoozeDueReminder()} disabled={alarmBusy}>{alarmBusy ? 'Saving…' : 'Snooze'}</button></div>{alarmError && <p className="owner-reminder-alarm-error" role="alert">{alarmError}</p>}<footer><button type="button" className="business-secondary" onClick={() => { setSuppressedReminderKey(`${dueReminder._id}:${dueReminder.dueAt}`); setDueReminder(null); navigate('/reminders'); }} disabled={alarmBusy}>Open reminders</button><button type="button" className="business-destructive" onClick={() => void stopDueReminder()} disabled={alarmBusy}>Stop reminder</button><button type="button" className="business-primary" onClick={() => void acknowledgeDueReminder()} disabled={alarmBusy}><AlarmClock size={16}/>{alarmBusy ? 'Saving…' : dueReminder.repeatEveryHours ? 'Acknowledge' : 'Mark complete'}</button></footer></section></div>}
  </div>;
}
