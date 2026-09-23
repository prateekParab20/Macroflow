import { useState } from 'react';
import { TabBar, type TabId } from './components/TabBar';
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
      <TabBar tab={tab} onChange={setTab} />
    </div>
  );
}
