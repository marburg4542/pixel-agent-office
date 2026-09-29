import { useEffect } from 'react';
import { useStore, useT } from '../store';
import type { Modal } from '../types';
import { AgentDetail } from './AgentDetail';
import { AgentEditor } from './AgentEditor';
import { BoardModal } from './BoardModal';
import { ModelLibrary } from './ModelLibrary';
import { NoteEditor } from './NoteEditor';
import { TaskDetail } from './TaskDetail';
import { TaskEditor } from './TaskEditor';
import { SettingsWindow } from './SettingsWindow';
import { UsersWindow } from './UsersWindow';
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
        <ModalView key={i} modal={m} z={i} />
      ))}
    </>
  );
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
      return <AgentEditor z={z} onClose={onClose} agentId={modal.agentId} desk={modal.desk} />;
    case 'agent':
      return <AgentDetail z={z} onClose={onClose} agentId={modal.agentId} />;
    case 'models':
      return <ModelLibrary z={z} onClose={onClose} />;
    case 'settings':
      return <SettingsWindow z={z} onClose={onClose} tab={modal.tab} />;
    case 'users':
      return <UsersWindow z={z} onClose={onClose} />;
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
