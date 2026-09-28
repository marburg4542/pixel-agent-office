import { useEffect, useReducer, type ReactNode } from 'react';
import type { Agent, Look, ProviderId } from '../types';
import { avatarUrl } from '../sprites/character';
import { PROVIDERS } from '../data/models';
import { useStore, useT } from '../store';
import { roleById } from '../data/roles';

/** Re-render every `ms` — for values that live in the simulation engine rather than the store. */
export function useTicker(ms: number, enabled = true): void {
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}

export function Window(props: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  className?: string;
  bodyClassName?: string;
  z: number;
}) {
  return (
    <div
      className="overlay"
      style={{ zIndex: 20 + props.z }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className={`window ${props.className ?? ''}`} style={{ width: props.width }} role="dialog" aria-modal="true">
        <div className="titlebar">
          <span>{props.title}</span>
          <button className="x" onClick={props.onClose} aria-label="close">✕</button>
        </div>
        <div className={`window-body ${props.bodyClassName ?? ''}`}>{props.children}</div>
        {props.footer && <div className="window-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

export function Avatar({ look, size = 34, className }: { look: Look; size?: number; className?: string }) {
  return <img className={`pixelated ${className ?? ''}`} src={avatarUrl(look)} width={size} height={Math.round((size * 17) / 16)} alt="" />;
}

export function ProviderDot({ provider }: { provider: ProviderId }) {
  return <span className="provider-dot" style={{ background: PROVIDERS[provider].color }} title={PROVIDERS[provider].name} />;
}

export function Progress({ value, color, thin }: { value: number; color?: string; thin?: boolean }) {
  return (
    <div className={`progress ${thin ? 'thin' : ''}`}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function Pips({ value, max = 5, color }: { value: number; max?: number; color?: string }) {
  return (
    <span className="pips" style={{ ['--c' as string]: color }}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < value ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Stars({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="stars" title={`${value}/5`}>
      {'★'.repeat(full)}
      {half ? '½' : ''}
      <span style={{ color: '#d9cfb8' }}>{'★'.repeat(5 - full - (half ? 1 : 0))}</span>
    </span>
  );
}

export function RoleLabel({ agent }: { agent: Agent }) {
  const t = useT();
  const r = roleById(agent.role);
  return (
    <span>
      {r.icon} {agent.role === 'custom' && agent.roleLabel ? agent.roleLabel : t(`role_${agent.role}`)}
    </span>
  );
}

export function ModelLabel({ modelId }: { modelId: string }) {
  const m = useStore((s) => s.models.find((x) => x.id === modelId));
  if (!m) return <span className="hint">{modelId}</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <ProviderDot provider={m.provider} /> {m.name}
    </span>
  );
}
