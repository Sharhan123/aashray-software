import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BedDouble, Bell, Building2, ChartNoAxesCombined, ChevronLeft, ChevronRight, CircleDollarSign, Command, CreditCard, LayoutDashboard, LogOut, Menu, MessageSquareText, Settings, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { AashrayLogo, BrandMark } from '../components/BrandMark';
import { useAuth } from '../state/useAuth';
import { CloseButton, ProfileButton, ThemeToggle } from '../components/ui';

const mainItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, permission: 'dashboard:read' },
  { label: 'Properties', path: '/', icon: Building2, permission: 'rooms:read' },
  { label: 'Residents', path: '/residents', icon: Users, permission: 'residents:read' },
  { label: 'Payments', path: '/payments', icon: CreditCard, permission: 'payments:read' },
];
const moreItems = [
  { label: 'Rooms & Beds', path: '/rooms', icon: BedDouble, permission: 'rooms:read' },
  { label: 'Rent & Billing', path: '/billing', icon: CircleDollarSign, permission: 'billing:read' },
  { label: 'Reminders & Messages', path: '/messages', icon: MessageSquareText, permission: 'messages:read' },
  { label: 'Reports', path: '/reports', icon: ChartNoAxesCombined, permission: 'reports:read' },
  { label: 'Staff & Permissions', path: '/staff', icon: ShieldCheck, permission: 'staff:read' },
  { label: 'Settings', path: '/settings', icon: Settings, permission: 'settings:read' },
];

export function AppShell() {
  const { state, signOut } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const user = state.status === 'authenticated' ? state.user : null;
  const [collapsed, setCollapsed] = useState(false); const [drawerOpen, setDrawerOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false); const [moreOpen, setMoreOpen] = useState(false);
  const allowed = (item: { permission: string }) => user?.role === 'SUPER_ADMIN' || Boolean(user?.permissions.includes(item.permission));
  const visibleMain = mainItems.filter(allowed); const visibleMore = moreItems.filter(allowed);
  const active = [...mainItems, ...moreItems].find((item) => item.path === location.pathname || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`)));
  const doLogout = async () => { await signOut(); navigate('/login', { replace: true }); };
  const sidebar = <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <div className="sidebar-brand"><AashrayLogo className="sidebar-brand-logo" /><span className="sidebar-compact-logo"><BrandMark /></span>{drawerOpen && <CloseButton onClick={() => setDrawerOpen(false)} />}</div>
    <NavLink to="/" className="workspace-select"><span className="workspace-icon"><Building2 size={16} /></span><span className="workspace-label"><b>All properties</b><small>Property workspace</small></span><ChevronRight size={14} /></NavLink>
    <nav className="side-nav" aria-label="Main navigation">{visibleMain.map((item) => <NavLink key={item.path} to={item.path} end={item.path === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`} onClick={() => setDrawerOpen(false)} title={collapsed ? item.label : undefined}><item.icon size={18} strokeWidth={1.9} /><span>{item.label}</span></NavLink>)}{visibleMore.length > 0 && <><button type="button" className={`nav-link nav-more-toggle ${visibleMore.some((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)) ? 'nav-link-active' : ''}`} onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} title={collapsed ? 'More' : undefined}><Menu size={18} strokeWidth={1.9} /><span>More</span><ChevronRight size={14} className={moreOpen ? 'more-chevron-open' : 'more-chevron'} /></button>{moreOpen && <div className="nav-more-items">{visibleMore.map((item) => <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-link nav-link-sub ${isActive ? 'nav-link-active' : ''}`} onClick={() => setDrawerOpen(false)} title={collapsed ? item.label : undefined}><item.icon size={17} strokeWidth={1.9} /><span>{item.label}</span></NavLink>)}</div>}</>}</nav>
    <div className="sidebar-bottom"><div className="help-panel"><div className="help-icon"><Command size={16} /></div><div className="help-copy"><b>Need a hand?</b><span>We're here to help.</span></div><ChevronRight size={14} /></div><div className="sidebar-footer"><span>AH</span><small>AASHRAY HOSPITALITY<br />SURAT · GUJARAT</small><button aria-label="Collapse sidebar" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button></div></div>
  </aside>;
  return <div className="app-shell">
    <div className={`mobile-backdrop ${drawerOpen ? 'backdrop-visible' : ''}`} onClick={() => setDrawerOpen(false)} />
    <div className={`sidebar-wrap ${drawerOpen ? 'drawer-open' : ''}`}>{sidebar}</div>
    <div className="shell-main">
      <header className="topbar"><div className="topbar-left"><button className="mobile-menu" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}><Menu size={21} /></button><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><b>{active?.label ?? 'Dashboard'}</b></div></div><div className="topbar-actions"><span className="topbar-date"><span /> Workspace ready</span><ThemeToggle /><button className="top-icon" aria-label="Notifications"><Bell size={18} /><i /></button><div className="profile-wrap"><ProfileButton name={user?.name ?? 'Team'} email={user?.email ?? ''} onClick={() => setProfileOpen(!profileOpen)} />{profileOpen && <div className="profile-menu"><div className="profile-menu-head"><b>{user?.name}</b><span>{user?.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Staff account'}</span></div><button onClick={doLogout}><LogOut size={16} /> Sign out</button></div>}</div></div></header>
      <main className="workspace-main"><Outlet /></main>
      <footer className="shell-footer"><span>© {new Date().getFullYear()} Aashray Hospitality</span><span>Built for thoughtful living <Sparkles size={10} className="footer-mark" /></span></footer>
    </div>
  </div>;
}
