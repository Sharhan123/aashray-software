import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { SearchableSelect, type SearchableOption } from './SearchableSelect';

type Resident = {
  _id: string;
  fullName: string;
  residentId?: string;
  mobile?: string;
  status?: string;
};

type ResidentSearchSelectProps = {
  className?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onResidentChange?: (resident?: Resident) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  propertyId?: string;
  includeInactive?: boolean;
  status?: 'ACTIVE' | 'NOTICE' | 'INACTIVE';
  extraResidents?: Resident[];
};
const EMPTY_RESIDENTS: Resident[] = [];

/** Searches the server's full resident set instead of filtering only a paginated page in the browser. */
export function ResidentSearchSelect({
  className,
  name,
  value,
  defaultValue,
  onChange,
  onResidentChange,
  required,
  disabled,
  placeholder = 'Search residents',
  propertyId,
  status,
  includeInactive = false,
  extraResidents = EMPTY_RESIDENTS,
}: ResidentSearchSelectProps) {
  const [query, setQuery] = useState<string | null>(null);
  const [residents, setResidents] = useState<Resident[]>(extraResidents);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (query === null) return;
    const timer = window.setTimeout(() => {
      const currentRequest = ++requestId.current;
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (query.trim()) params.set('search', query.trim());
      if (propertyId) params.set('propertyId', propertyId);
      if (status) params.set('status', status);
      api.get<{ residents: Resident[]; pages?: number }>(`/residents?${params}`)
        .then(async (result) => {
          let matches = result.residents ?? [];
          const pages = query.trim() ? result.pages ?? 1 : 1;
          for (let firstPage = 2; firstPage <= pages; firstPage += 5) {
            const pageNumbers = Array.from({ length: Math.min(5, pages - firstPage + 1) }, (_, index) => firstPage + index);
            const nextPages = await Promise.all(pageNumbers.map((page) => {
              const pageParams = new URLSearchParams(params);
              pageParams.set('page', String(page));
              return api.get<{ residents: Resident[] }>(`/residents?${pageParams}`);
            }));
            matches = matches.concat(...nextPages.map((page) => page.residents ?? []));
          }
          if (currentRequest === requestId.current) setResidents((current) => {
            const selected = current.find((resident) => resident._id === value);
            return selected && !matches.some((resident) => resident._id === selected._id) ? [selected, ...matches] : matches;
          });
        })
        .catch(() => {
          if (currentRequest === requestId.current) setResidents([]);
        })
        .finally(() => {
          if (currentRequest === requestId.current) setLoading(false);
        });
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query, propertyId, status]);

  useEffect(() => {
    if (!value) return;
    let active = true;
    api.get<{ resident: Resident }>(`/residents/${value}`)
      .then((result) => {
        if (active && result.resident) setResidents((current) => [result.resident, ...current.filter((resident) => resident._id !== value)]);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [value]);

  const uniqueResidents = new Map<string, Resident>();
  for (const resident of [...extraResidents, ...residents]) {
    if (includeInactive || resident.status !== 'INACTIVE') uniqueResidents.set(resident._id, resident);
  }
  const options: SearchableOption[] = [
    { value: '', label: 'Choose resident' },
    ...[...uniqueResidents.values()].map((resident) => ({
      value: resident._id,
      label: `${resident.fullName} - ${resident.residentId ?? resident.mobile ?? ''}`.trim(),
      keywords: `${resident.mobile ?? ''} ${resident.residentId ?? ''}`,
    })),
  ];

  return <SearchableSelect
    className={className}
    name={name}
    value={value}
    defaultValue={defaultValue}
    onChange={(nextValue) => {
      onChange?.(nextValue);
      onResidentChange?.(uniqueResidents.get(nextValue));
    }}
    onSearchChange={setQuery}
    loading={loading}
    required={required}
    disabled={disabled}
    placeholder={placeholder}
    options={options}
  />;
}
