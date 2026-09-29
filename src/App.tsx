import { useRef, useState } from 'react';
import { TabBar, type TabId } from './components/TabBar';
import { pushHistoryEntry } from './lib/historyNav';
import { Onboarding } from './pages/Onboarding';
import { Foods } from './pages/Foods';
import { Plan } from './pages/Plan';
import { Profile } from './pages/Profile';
import { Progress } from './pages/Progress';
import { Today } from './pages/Today';
import { useStore } from './state/Store';

export function App() {
  const { profile } = useStore();
  const [tab, setTab] = useState<TabId>('today');
  const tabRef = useRef(tab);
  tabRef.current = tab;

  function changeTab(next: TabId) {
    const previous = tabRef.current;
    if (next === previous) return;
    pushHistoryEntry(() => {
      tabRef.current = previous;
      setTab(previous);
    });
    tabRef.current = next;
    setTab(next);
  }

  if (!profile) return <Onboarding />;

  return (
    <div className="app">
      <main className="app-main">
        {tab === 'today' ? <Today /> : null}
        {tab === 'foods' ? <Foods /> : null}
        {tab === 'plan' ? <Plan /> : null}
        {tab === 'progress' ? <Progress /> : null}
        {tab === 'profile' ? <Profile /> : null}
      </main>
      <TabBar tab={tab} onChange={changeTab} />
    </div>
  );
}
