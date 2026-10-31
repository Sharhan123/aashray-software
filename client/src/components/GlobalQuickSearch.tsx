import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, CreditCard, FileText, LayoutDashboard, Search, UserRound, Users, Wrench, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../state/useAuth';

type SearchItem = { id: string; type: 'action' | 'resident' | 'payment' | 'property'; title: string; subtitle: string; href: string; icon: typeof Search; keywords?: string };
type SearchResponse = {
  residents: { _id: string; fullName: string; residentId: string; mobile: string; status: string }[];
  payments: { _id: string; paymentDate: string; amountPaise: number; method: string; reference?: string; residentId?: { _id: string; fullName: string; residentId: string } }[];
  properties: { _id: string; name: string; address?: string; gender?: string | null }[];
};

const actions: SearchItem[] = [
  { id: 'dashboard', type: 'action', title: 'Dashboard', subtitle: 'Workspace overview', href: '/dashboard', icon: LayoutDashboard, keywords: 'home overview' },
  { id: 'add-resident', type: 'action', title: 'Add resident', subtitle: 'Start a new resident admission', href: '/residents?action=add', icon: UserRound, keywords: 'new tenant admission create' },
  { id: 'residents', type: 'action', title: 'Residents', subtitle: 'Find and manage residents', href: '/residents', icon: Users, keywords: 'tenant people directory' },
  { id: 'overdue-residents', type: 'action', title: 'Overdue residents', subtitle: 'Residents whose rent is past due', href: '/residents?status=ACTIVE&rentStatus=OVERDUE', icon: Users, keywords: 'late overdue arrears rent' },
  { id: 'grace-residents', type: 'action', title: 'Residents in due grace', subtitle: 'Rent due dates have started; grace period remains', href: '/residents?status=ACTIVE&rentStatus=DUE_GRACE', icon: Users, keywords: 'grace due follow up' },
  { id: 'record-payment', type: 'action', title: 'Record payment', subtitle: 'Capture a resident payment', href: '/payments?action=record', icon: CreditCard, keywords: 'pay collect rent money transaction' },
  { id: 'payments', type: 'action', title: 'Payments & receipts', subtitle: 'Payment ledger and receipt history', href: '/payments', icon: FileText, keywords: 'receipt recipt reciept transaction finance' },
  { id: 'add-utility', type: 'action', title: 'Add utility bill', subtitle: 'Create a resident utility charge', href: '/billing?action=utility', icon: Wrench, keywords: 'electricity water bill charge' },
  { id: 'billing', type: 'action', title: 'Rent & billing', subtitle: 'Charges, due balances, and billing runs', href: '/billing', icon: CreditCard, keywords: 'rent dues outstanding charges' },
  { id: 'add-property', type: 'action', title: 'Add property', subtitle: 'Create a property workspace', href: '/properties?action=add', icon: Building2, keywords: 'building home create' },
  { id: 'properties', type: 'action', title: 'Properties', subtitle: 'Property and occupancy overview', href: '/properties', icon: Building2, keywords: 'buildings homes' },
  { id: 'rooms', type: 'action', title: 'Rooms & beds', subtitle: 'Manage rooms, beds, and vacancies', href: '/rooms', icon: Building2, keywords: 'vacant availability' },
  { id: 'reports', type: 'action', title: 'Reports', subtitle: 'Build and download reports', href: '/reports', icon: FileText, keywords: 'export pdf csv' },
  { id: 'reminders', type: 'action', title: 'My reminders', subtitle: 'Create and manage reminders', href: '/reminders', icon: FileText, keywords: 'alarm snooze' },
  { id: 'messages', type: 'action', title: 'Reminders & messages', subtitle: 'Resident follow-up messages', href: '/messages', icon: FileText, keywords: 'follow up remind' },
  { id: 'staff', type: 'action', title: 'Staff & permissions', subtitle: 'Manage team access', href: '/staff', icon: Users, keywords: 'team users access' },
  { id: 'settings', type: 'action', title: 'Settings', subtitle: 'Workspace settings', href: '/settings', icon: Wrench, keywords: 'configuration' },
];

const permissionsByPath: Record<string, string> = {
  '/dashboard': 'dashboard:read', '/residents': 'residents:read', '/payments': 'payments:read', '/billing': 'billing:read',
  '/properties': 'rooms:read', '/rooms': 'rooms:read', '/reports': 'reports:read', '/messages': 'messages:read',
  '/reminders': '__owner_only__', '/staff': 'staff:read', '/settings': 'settings:read',
};
const permissionByAction: Record<string, string> = {
  'add-resident': 'residents:write', 'record-payment': 'payments:write', 'add-utility': 'utilities:write', 'add-property': 'rooms:write',
};
const labelFor = (type: SearchItem['type']) => ({ resident: 'RESIDENTS', payment: 'PAYMENTS & RECEIPTS', property: 'PROPERTIES', action: 'QUICK ACTIONS' })[type];
const isAllowed = (item: SearchItem, role: string, permissions: string[]) => {
  if (role === 'SUPER_ADMIN') return true;
  if (item.type === 'action' && permissionByAction[item.id]) return permissions.includes(permissionByAction[item.id]!);
  const permission = permissionsByPath[new URL(item.href, window.location.origin).pathname];
  return !permission || (permission === '__owner_only__' ? role === 'SUPER_ADMIN' : permissions.includes(permission));
};

export function GlobalQuickSearch() {
  const navigate = useNavigate();
  const { state } = useAuth();
  const user = state.status === 'authenticated' ? state.user : null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [records, setRecords] = useState<SearchResponse>({ residents: [], payments: [], properties: [] });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(true); }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery(''); setDebouncedQuery(''); setActiveIndex(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || debouncedQuery.length < 2) { setRecords({ residents: [], payments: [], properties: [] }); return; }
    let current = true;
    setRecords({ residents: [], payments: [], properties: [] });
    setLoading(true);
    api.get<SearchResponse>(`/quick-search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((result) => { if (current) setRecords(result); })
      .catch(() => { if (current) setRecords({ residents: [], payments: [], properties: [] }); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [open, debouncedQuery]);

  const visibleActions = useMemo(() => {
    if (!user) return [];
    const permitted = actions.filter((item) => isAllowed(item, user.role, user.permissions));
    if (!debouncedQuery) {
      const priority = ['dashboard', 'record-payment', 'add-resident', 'payments', 'add-utility', 'properties', 'reports'];
      return priority.map((id) => permitted.find((item) => item.id === id)).filter((item): item is SearchItem => Boolean(item));
    }
    const words = debouncedQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return permitted.map((item) => {
      const target = `${item.title} ${item.subtitle} ${item.keywords ?? ''}`.toLowerCase();
      const score = words.reduce((sum, word) => sum + (item.title.toLowerCase().includes(word) ? 4 : target.includes(word) ? 1 : 0), 0);
      return { item, score };
    }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(({ item }) => item);
  }, [debouncedQuery, user]);

  const grouped = useMemo(() => {
    if (!user) return [] as SearchItem[];
    const residentResults: SearchItem[] = records.residents.map((resident) => ({ id: `resident-${resident._id}`, type: 'resident', title: resident.fullName, subtitle: `${resident.residentId} · ${resident.mobile} · ${resident.status.toLowerCase()}`, href: `/residents/${resident._id}`, icon: UserRound }));
    const paymentResults: SearchItem[] = records.payments.map((payment) => ({ id: `payment-${payment._id}`, type: 'payment', title: `${payment.residentId?.fullName ?? 'Resident'} · ₹${(payment.amountPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, subtitle: `Receipt · ${payment.method.replace('_', ' ')} · ${new Date(payment.paymentDate).toLocaleDateString('en-IN')}${payment.reference ? ` · Ref ${payment.reference}` : ''}`, href: `/payments?receipt=${payment._id}`, icon: FileText }));
    const propertyResults: SearchItem[] = records.properties.map((property) => ({ id: `property-${property._id}`, type: 'property', title: property.name, subtitle: [property.gender?.toLowerCase(), property.address].filter(Boolean).join(' · ') || 'Property workspace', href: `/properties/${property._id}`, icon: Building2 }));
    let actionResults = visibleActions;
    if (debouncedQuery.toLowerCase().split(/\s+/).some((word) => ['receipt', 'receipts', 'recipt', 'reciept', 'payment', 'payments'].includes(word))) {
      const receiptAction = actions.find((item) => item.id === 'payments');
      if (receiptAction && isAllowed(receiptAction, user.role, user.permissions) && !actionResults.some((item) => item.id === receiptAction.id)) actionResults = [receiptAction, ...actionResults];
    }
    return [...residentResults, ...paymentResults, ...propertyResults, ...actionResults];
  }, [records, visibleActions, debouncedQuery, user]);

  useEffect(() => setActiveIndex(0), [debouncedQuery, grouped.length]);

  const choose = (item: SearchItem) => { setOpen(false); navigate(item.href); };
  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, grouped.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); }
    else if (event.key === 'Enter' && grouped[activeIndex]) { event.preventDefault(); choose(grouped[activeIndex]!); }
  };

  const trigger = <button type="button" className="quick-search-trigger" onClick={() => setOpen(true)} aria-label="Search workspace"><Search size={16}/><span>Search anything...</span><kbd>Ctrl K</kbd></button>;
  if (!open) return trigger;

  return <>{trigger}<div className="quick-search-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="quick-search-dialog" role="dialog" aria-modal="true" aria-label="Search workspace" onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
      <div className="quick-search-input-row"><Search size={20}/><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onInputKeyDown} placeholder="Search residents, receipts, properties, or actions..." aria-label="Search residents, receipts, properties, or actions"/><kbd>ESC</kbd><button type="button" aria-label="Close search" onClick={() => setOpen(false)}><X size={18}/></button></div>
      <div className="quick-search-content" role="listbox" aria-label="Search results">
        {debouncedQuery.length < 2 ? <><p className="quick-search-hint">QUICK ACCESS <span>Type a name, receipt, property, or task</span></p>{visibleActions.map((item, index) => <button type="button" role="option" aria-selected={activeIndex === index} key={item.id} className={`quick-search-result ${activeIndex === index ? 'is-active' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(item)}><span className="quick-search-result-icon"><item.icon size={17}/></span><span className="quick-search-result-copy"><b>{item.title}</b><small>{item.subtitle}</small></span><ArrowRight size={15}/></button>)}</> : <>
          {(debouncedQuery.toLowerCase().split(/\s+/).some((word) => ['receipt', 'receipts', 'recipt', 'reciept', 'payment', 'payments'].includes(word)) ? ['payment', 'resident', 'property', 'action'] as const : ['resident', 'payment', 'property', 'action'] as const).map((type) => {
            const items = grouped.filter((item) => item.type === type);
            if (!items.length) return null;
            const startIndex = grouped.findIndex((item) => item.type === type);
            return <div className="quick-search-group" key={type}><p className="quick-search-hint">{labelFor(type)}</p>{items.map((item, index) => { const resultIndex = startIndex + index; return <button type="button" role="option" aria-selected={activeIndex === resultIndex} key={item.id} className={`quick-search-result ${activeIndex === resultIndex ? 'is-active' : ''}`} onMouseEnter={() => setActiveIndex(resultIndex)} onClick={() => choose(item)}><span className="quick-search-result-icon"><item.icon size={17}/></span><span className="quick-search-result-copy"><b>{item.title}</b><small>{item.subtitle}</small></span><ArrowRight size={15}/></button>; })}</div>;
          })}
          {loading && <p className="quick-search-empty">Searching workspace…</p>}
          {!loading && grouped.length === 0 && <p className="quick-search-empty">No matching residents, receipts, properties, or actions.</p>}
        </>}
      </div>
      <footer className="quick-search-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open result</span><span><kbd>Ctrl K</kbd> Open search</span></footer>
    </section>
  </div></>;
}
