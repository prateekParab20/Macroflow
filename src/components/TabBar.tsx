import { Apple, CalendarDays, CircleUser, Gauge, TrendingUp } from 'lucide-react';

export type TabId = 'today' | 'foods' | 'plan' | 'progress' | 'profile';

const TABS: { id: TabId; label: string; icon: typeof Gauge }[] = [
  { id: 'today', label: 'Today', icon: Gauge },
  { id: 'foods', label: 'Foods', icon: Apple },
  { id: 'plan', label: 'Plan', icon: CalendarDays },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
  { id: 'profile', label: 'Profile', icon: CircleUser },
];

export function TabBar({ tab, onChange }: { tab: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((item) => {
        const Icon = item.icon;
        const current = tab === item.id;
        return (
          <button key={item.id} type="button" aria-current={current ? 'page' : undefined} onClick={() => onChange(item.id)}>
            <Icon size={22} strokeWidth={current ? 2.25 : 1.75} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
