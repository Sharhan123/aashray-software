import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export type SearchableOption = {
  value: string;
  label: string;
  keywords?: string;
};

type SearchableSelectProps = {
  options: SearchableOption[];
  className?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  ariaLabel?: string;
  required?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
};

export function SearchableSelect({
  options,
  className = 'business-input',
  name,
  value,
  defaultValue = '',
  placeholder = 'Search or select...',
  ariaLabel,
  required = false,
  disabled = false,
  onChange,
}: SearchableSelectProps) {
  const id = useId();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedValue = value ?? internalValue;
  const selected = options.find((option) => option.value === selectedValue);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = normalizedQuery
    ? options.filter((option) => `${option.label} ${option.keywords ?? ''}`.toLocaleLowerCase().includes(normalizedQuery))
    : options;

  useEffect(() => {
    if (value !== undefined || options.some((option) => option.value === internalValue)) return;
    const nextValue = defaultValue && options.some((option) => option.value === defaultValue)
      ? defaultValue
      : options[0]?.value ?? '';
    setInternalValue(nextValue);
  }, [defaultValue, internalValue, options, value]);

  function select(option: SearchableOption) {
    if (value === undefined) setInternalValue(option.value);
    onChange?.(option.value);
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && filtered[activeIndex]) {
      event.preventDefault();
      select(filtered[activeIndex]!);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div className={`searchable-select ${disabled ? 'searchable-select-disabled' : ''}`}>
      <input
        className={className}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={open && filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
        aria-required={required}
        autoComplete="off"
        disabled={disabled}
        required={required && !selectedValue}
        placeholder={open ? placeholder : selected?.label ?? placeholder}
        value={open ? query : selected?.label ?? ''}
        onFocus={() => { setOpen(true); setQuery(''); setActiveIndex(0); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      <span className="searchable-select-icon" aria-hidden="true">{open ? <Search size={15} /> : <ChevronDown size={15} />}</span>
      {name && <input type="hidden" name={name} value={selectedValue} disabled={disabled} />}
      {open && !disabled && (
        <div className="searchable-select-options" id={`${id}-options`} role="listbox">
          {filtered.length ? filtered.map((option, index) => (
            <div
              id={`${id}-option-${index}`}
              className={`searchable-select-option ${option.value === selectedValue ? 'searchable-select-option-selected' : ''} ${index === activeIndex ? 'searchable-select-option-active' : ''}`}
              key={option.value}
              role="option"
              aria-selected={option.value === selectedValue}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(option)}
            >
              <span>{option.label}</span>
              {option.value === selectedValue && <Check size={15} aria-hidden="true" />}
            </div>
          )) : <div className="searchable-select-empty" role="status">No matching options</div>}
        </div>
      )}
    </div>
  );
}
