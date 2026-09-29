import { Search, Star } from 'lucide-react';

export interface LibraryItem {
  id: string;
  name: string;
  subtitle: string;
  favorite?: boolean;
  tag?: string;
  onPick: () => void;
}

export function FoodLibrary({
  items,
  recents,
  query,
  onQuery,
  autoFocus = false,
  placeholder = 'Search foods',
  emptyLabel = 'No foods match that search.',
}: {
  items: LibraryItem[];
  recents: LibraryItem[];
  query: string;
  onQuery: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  emptyLabel?: string;
}) {
  return (
    <>
      <label className="search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
      </label>
      {!query && recents.length ? (
        <div className="chips" aria-label="Recent foods">
          {recents.map((item) => (
            <button key={item.id} type="button" onClick={item.onPick}>
              {item.favorite ? <Star size={12} fill="currentColor" aria-hidden="true" /> : null}
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="group sheet-group">
        {items.map((item) => (
          <button key={item.id} type="button" className="log-row" onClick={item.onPick}>
            <span className="choice-copy">
              <span className="name-line">
                <strong>{item.name}</strong>
                {item.tag ? <em className="tag">{item.tag}</em> : null}
              </span>
              <small>{item.subtitle}</small>
            </span>
            {item.favorite ? <Star size={16} className="check-icon" fill="currentColor" aria-hidden="true" /> : null}
          </button>
        ))}
        {!items.length ? <p className="empty-inline">{emptyLabel}</p> : null}
      </div>
    </>
  );
}
