import { useEffect } from 'react';
import { useStore } from './store';
import { TopBar } from './components/TopBar';
import { OfficeCanvas } from './components/OfficeCanvas';
import { Sidebar } from './components/Sidebar';
import { ModalHost } from './components/ModalHost';

export function App() {
  const lang = useStore((s) => s.lang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <OfficeCanvas />
        <Sidebar />
      </main>
      <ModalHost />
    </div>
  );
}
