import { ArrowUpRight, BedDouble, Building2, CircleDollarSign, Clock3, Users, WalletCards } from 'lucide-react';
import { PageHeading, EmptyState, StatusBadge } from '../components/ui';

const metrics = [
  { title: 'Active residents', icon: Users, note: 'Resident records', tint: 'blue' },
  { title: 'Occupied beds', icon: BedDouble, note: 'Room occupancy', tint: 'violet' },
  { title: 'Rent outstanding', icon: CircleDollarSign, note: 'Open balances', tint: 'amber' },
  { title: 'Payments received', icon: WalletCards, note: 'Current period', tint: 'teal' },
];

export function DashboardPage() {
  const today = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase();
  return <div className="dashboard-page">
    <PageHeading eyebrow={today} title="Your workspace" description="A clear view of your Aashray operations, at a glance." action={<StatusBadge>Workspace ready</StatusBadge>} />
    <div className="data-notice"><span className="notice-icon"><Clock3 size={17} /></span><span><b>Your workspace is ready for its first records.</b> Dashboard figures will appear once resident, room and payment data is connected.</span></div>
    <section className="metric-grid" aria-label="Dashboard sections">{metrics.map(({ title, icon: Icon, note, tint }) => <article key={title} className="metric-card"><div className="metric-card-top"><span className={`metric-icon metric-${tint}`}><Icon size={19} /></span><ArrowUpRight size={16} className="metric-arrow" /></div><div className="metric-title">{title}</div><div className="metric-value metric-empty">—</div><div className="metric-note">{note} <span>·</span> awaiting data</div></article>)}</section>
    <div className="dashboard-lower">
      <section className="dashboard-panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Updates across your property</p></div><button className="text-action" disabled>View all <ArrowUpRight size={14} /></button></div><EmptyState title="A fresh start" body="When your workspace has activity, the latest updates will be collected here." icon={<Building2 size={20} />} /></section>
      <section className="dashboard-panel quick-panel"><div className="panel-heading"><div><h2>Getting started</h2><p>Your setup, at your pace</p></div></div><div className="setup-progress"><div className="setup-progress-label"><span>Workspace setup</span><b>Ready to begin</b></div><div className="progress-track"><span /></div></div><div className="setup-row"><span className="setup-check"><Building2 size={15} /></span><span><b>Workspace created</b><small>Your secure space is ready</small></span><span className="complete-label">READY</span></div><div className="setup-row setup-pending"><span className="setup-check"><Users size={15} /></span><span><b>Add resident records</b><small>Resident management is coming next</small></span><span className="pending-label">NEXT</span></div><div className="setup-row setup-pending"><span className="setup-check"><BedDouble size={15} /></span><span><b>Set up rooms and beds</b><small>Property inventory is coming next</small></span><span className="pending-label">LATER</span></div></section>
    </div>
  </div>;
}

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <div className="placeholder-page"><PageHeading eyebrow="WORKSPACE MODULE" title={title} description={description} /><div className="placeholder-card"><div className="placeholder-icon"><Building2 size={24} /></div><div className="coming-chip">PHASE 1 · FOUNDATION</div><h2>This space is being prepared.</h2><p>{title} tools will be added in a future phase. Your workspace shell and access controls are ready for this module.</p></div></div>;
}
