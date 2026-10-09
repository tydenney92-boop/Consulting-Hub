import React, { useId, useState } from 'react';
import { Search, X } from 'lucide-react';
import { searchWorkspace, type SearchResult } from './workspace-search-model';

export function WorkspaceSearch({ data, onOpen }: { data: Record<string, any[]>; onOpen: (result: SearchResult) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const matches = searchWorkspace(data, query);
  const results = matches.slice(0, 10);
  const visible = open && Boolean(query.trim());
  const choose = (result: SearchResult) => { onOpen(result); setOpen(false); setQuery(''); };
  return <div className="workspace-search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <div className="workspace-search-input"><Search size={18} aria-hidden="true"/>
      <input type="search" role="combobox" aria-label="Search recruiting workspace" placeholder="Search firms, roles, contacts…" aria-expanded={visible} aria-controls={id} aria-autocomplete="list" aria-activedescendant={visible && results[active] ? `${id}-${active}` : undefined} value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }} onKeyDown={e => {
        if (e.key === 'Escape') setOpen(false);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(current => Math.max(0, Math.min(results.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1)))); }
        if (e.key === 'Enter' && visible && results[active]) { e.preventDefault(); choose(results[active]); }
      }}/>
      {query && <button type="button" className="icon" aria-label="Clear search" onClick={() => { setQuery(''); setActive(0); }}><X size={16}/></button>}
    </div>
    {visible && <div className="workspace-search-popover"><div id={id} role="listbox" aria-label="Matching records">{results.map((result, index) => <button type="button" role="option" aria-selected={index === active} id={`${id}-${index}`} key={`${result.kind}-${result.id}`} onMouseEnter={() => setActive(index)} onClick={() => choose(result)}><strong>{result.title}</strong><span>{result.context}</span></button>)}</div><p role="status">{matches.length ? `${matches.length} matching records${matches.length > 10 ? ' · Showing first 10; refine your search' : ''}` : 'No matching records. Try a firm, role, or contact name.'}</p></div>}
  </div>;
}
