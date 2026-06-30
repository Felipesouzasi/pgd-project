import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  onSearchChange?: (q: string) => void;
  /** Inline mode: the field IS the search input — no separate search box inside dropdown */
  inline?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  disabled = false,
  error = false,
  className = '',
  size = 'md',
  onSearchChange,
  inline = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropRect, setDropRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value ?? '')),
    [options, value],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => String(o.label).toLowerCase().includes(q));
  }, [options, search]);

  const openDropdown = useCallback(() => {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDropRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen(true);
  }, [disabled]);

  function closeDropdown() {
    setOpen(false);
    setSearch('');
    setDropRect(null);
  }

  useEffect(() => {
    if (!open) return;
    // In normal (non-inline) mode, focus the internal search box
    if (!inline) setTimeout(() => searchRef.current?.focus(), 30);

    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const portal = document.getElementById('ss-portal-root');
      if (portal?.contains(target)) return;
      closeDropdown();
    }
    function onScroll(e: Event) {
      const portal = document.getElementById('ss-portal-root');
      if (portal?.contains(e.target as Node)) return;
      closeDropdown();
    }
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, inline]);

  function handleSelect(opt: SelectOption) {
    onChange(opt.value);
    setSearch('');
    closeDropdown();
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
    setSearch('');
  }

  // ── Inline display value: show selected label when closed, search text when open
  const inlineDisplayValue = open ? search : (selected?.label ?? '');

  function handleInlineFocus() {
    if (disabled) return;
    setSearch(''); // clear so all options show on open
    openDropdown();
  }

  function handleInlineChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setSearch(v);
    onSearchChange?.(v);
    if (!open) openDropdown();
  }

  const py = size === 'sm' ? 'py-1.5' : 'py-2.5';
  const textSm = 'text-sm';

  const borderCls = error
    ? 'border-red-500/70 ring-1 ring-red-500/30'
    : open
    ? 'border-green-500/70 ring-1 ring-green-500/20'
    : 'border-white/10 hover:border-white/20';

  // ── Inline mode render ────────────────────────────────────────────────────────
  if (inline) {
    return (
      <>
        <div ref={triggerRef} className="relative">
          <input
            type="text"
            value={inlineDisplayValue}
            onFocus={handleInlineFocus}
            onChange={handleInlineChange}
            placeholder={placeholder}
            disabled={disabled}
            className={[
              `w-full px-3 ${py} rounded-xl border bg-white/5 ${textSm} text-white`,
              'placeholder-white/25 outline-none transition-all',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              borderCls,
              selected ? 'pr-8' : '',
              className,
            ].join(' ')}
          />
          {selected && !disabled && (
            <button
              type="button"
              onMouseDown={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {open && dropRect && createPortal(
          <div
            id="ss-portal-root"
            style={{ position: 'fixed', top: dropRect.top, left: dropRect.left, width: dropRect.width, zIndex: 9999 }}
            className="bg-gray-900 border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            <div className="max-h-56 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="px-4 py-4 text-sm text-white/25 text-center">
                  {search.length >= 2 ? 'Nenhum resultado' : 'Digite para buscar...'}
                </div>
              ) : (
                filtered.map((opt) => {
                  const isSel = String(opt.value) === String(value ?? '');
                  return (
                    <div
                      key={opt.value}
                      onMouseDown={() => handleSelect(opt)}
                      className={[
                        'px-3 py-2.5 text-sm cursor-pointer transition-colors',
                        isSel ? 'bg-green-600 text-white font-medium' : 'text-white/80 hover:bg-white/5 hover:text-white',
                      ].join(' ')}
                    >
                      {opt.label}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  // ── Normal (click-to-open) mode ───────────────────────────────────────────────
  return (
    <>
      <div
        ref={triggerRef}
        onClick={openDropdown}
        className={[
          `relative flex items-center gap-2 w-full px-3 ${py} rounded-xl border`,
          'bg-white/5 backdrop-blur-sm cursor-pointer transition-all duration-150',
          borderCls,
          disabled ? 'opacity-40 pointer-events-none' : '',
          className,
        ].join(' ')}
      >
        <span className={`flex-1 truncate ${textSm} ${selected ? 'text-white' : 'text-white/30'}`}>
          {selected ? selected.label : placeholder}
        </span>
        {selected && !disabled && (
          <X size={13} className="text-white/30 hover:text-white/70 flex-shrink-0 transition-colors" onClick={handleClear} />
        )}
        <ChevronDown size={13} className={`text-white/30 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && dropRect && createPortal(
        <div
          id="ss-portal-root"
          style={{ position: 'fixed', top: dropRect.top, left: dropRect.left, width: dropRect.width, zIndex: 9999 }}
          className="bg-gray-900 border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
        >
          {/* Internal search box — only in normal mode */}
          <div className="p-2 border-b border-white/5">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); onSearchChange?.(e.target.value); }}
                placeholder="Buscar..."
                className="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-white/30 hover:text-white/60">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto overscroll-contain">
            {filtered.length === 0 ? (
              <div className="px-4 py-4 text-sm text-white/25 text-center">Nenhum resultado</div>
            ) : (
              filtered.map((opt) => {
                const isSel = String(opt.value) === String(value ?? '');
                return (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt)}
                    className={[
                      'px-3 py-2.5 text-sm cursor-pointer transition-colors',
                      isSel ? 'bg-green-600 text-white font-medium' : 'text-white/80 hover:bg-white/5 hover:text-white',
                    ].join(' ')}
                  >
                    {opt.label}
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
