import { Component, useEffect, type ReactNode } from 'react';
import { useStore, useT } from '../store';
import type { Modal } from '../types';
import { translate } from '../../shared/i18n';
import { AgentDetail } from './AgentDetail';
import { AgentEditor } from './AgentEditor';
import { BoardModal } from './BoardModal';
import { ModelLibrary } from './ModelLibrary';
import { AiSettingsWindow } from './AiSettingsWindow';
import { NoteEditor } from './NoteEditor';
import { TaskDetail } from './TaskDetail';
import { TaskEditor } from './TaskEditor';
import { SettingsWindow } from './SettingsWindow';
import { UsersWindow } from './UsersWindow';
import { HelpWindow } from './HelpWindow';
import { NewsroomWindow, WatchlistEditor } from './Newsroom';
import { StatsWindow } from './StatsWindow';
import { Window } from './ui';

export function ModalHost() {
  const modals = useStore((s) => s.modals);
  const closeModal = useStore((s) => s.closeModal);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useStore.getState().modals.length) closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal]);

  return (
    <>
      {modals.map((m, i) => (
        <WindowBoundary key={i} z={i} onClose={closeModal}>
          <ModalView modal={m} z={i} />
        </WindowBoundary>
      ))}
    </>
  );
}

/** A window that fails to render shows an error in its place instead of blanking the whole office. */
class WindowBoundary extends Component<{ z: number; onClose: () => void; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('window crashed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const lang = useStore.getState().settings.lang;
    return (
      <Window z={this.props.z} width={420} title="⚠️" onClose={this.props.onClose}>
        <p style={{ marginTop: 0 }}>{translate(lang, 'windowCrashed')}</p>
        <code className="blocked-reason">{this.state.error.message}</code>
      </Window>
    );
  }
}

function ModalView({ modal, z }: { modal: Modal; z: number }) {
  const closeModal = useStore((s) => s.closeModal);
  const onClose = closeModal;
  switch (modal.kind) {
    case 'board':
      return <BoardModal z={z} onClose={onClose} />;
    case 'task':
      return <TaskDetail z={z} onClose={onClose} taskId={modal.taskId} />;
    case 'taskEdit':
      return <TaskEditor z={z} onClose={onClose} taskId={modal.taskId} preset={modal.preset} />;
    case 'noteEdit':
      return <NoteEditor z={z} onClose={onClose} noteId={modal.noteId} preset={modal.preset} />;
    case 'agentEdit':
      return <AgentEditor z={z} onClose={onClose} agentId={modal.agentId} desk={modal.desk} room={modal.room} />;
    case 'agent':
      return <AgentDetail z={z} onClose={onClose} agentId={modal.agentId} />;
    case 'models':
      return <ModelLibrary z={z} onClose={onClose} />;
    case 'aiSettings':
      return <AiSettingsWindow z={z} onClose={onClose} />;
    case 'settings':
      return <SettingsWindow z={z} onClose={onClose} tab={modal.tab} />;
    case 'users':
      return <UsersWindow z={z} onClose={onClose} />;
    case 'help':
      return <HelpWindow z={z} onClose={onClose} step={modal.step} />;
    case 'newsroom':
      return <NewsroomWindow z={z} onClose={onClose} watchlistId={modal.watchlistId} />;
    case 'watchEdit':
      return <WatchlistEditor z={z} onClose={onClose} watchlistId={modal.watchlistId} />;
    case 'stats':
      return <StatsWindow z={z} onClose={onClose} />;
    case 'confirm':
      return <Confirm z={z} modal={modal} onClose={onClose} />;
  }
}

function Confirm({ z, modal, onClose }: { z: number; modal: Extract<Modal, { kind: 'confirm' }>; onClose: () => void }) {
  const t = useT();
  return (
    <Window
      z={z}
      width={400}
      title="❓"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} autoFocus>{t('no')}</button>
          <button
            className={`btn ${modal.danger ? 'danger' : 'primary'}`}
            onClick={() => {
              onClose();
              modal.onYes();
            }}
          >
            {t('yes')}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{modal.message}</p>
    </Window>
  );
}
