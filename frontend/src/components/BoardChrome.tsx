import { Dispatch, SetStateAction } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  HelpCircle,
  Layers3,
  Maximize2,
  Minus,
  Plus,
  Presentation,
  Share2,
} from 'lucide-react';
import { Board } from '../lib/contracts';
import { BoardState } from '../lib/collaboration';
import { Viewport } from '../types/board';
import { t } from '../lib/content';
import { Menu } from './BoardMenus';
import { IconButton } from './ui';
interface HeaderProps {
  board: Board;
  state: BoardState;
  onBack: () => void;
  setMenu: Dispatch<SetStateAction<Menu | null>>;
  setPresenting: Dispatch<SetStateAction<boolean>>;
  fit: () => void;
}
export function BoardHeader({ board, state, onBack, setMenu, setPresenting, fit }: HeaderProps) {
  return (
    <header className="board-header">
      <div className="board-title-surface">
        <IconButton label={t('board.back')} onClick={onBack}>
          <ArrowLeft size={20} />
        </IconButton>
        <Layers3 size={22} className="brand-mark" />
        <button className="board-title" disabled={state.role !== 'owner'} onClick={() => setMenu('settings')}>
          {board.title}
          <ChevronDown size={14} />
        </button>
        <span className="board-status" role="status" data-status={state.status}>
          <i />
          {t(`status.${state.status}`)}
        </span>
      </div>
      <div className="board-actions-surface">
        <div className="presence-avatars" aria-label={t('status.online', { count: state.peers.length })}>
          {state.peers.slice(0, 4).map((peer) => (
            <span className="avatar" key={peer.id} title={peer.name}>
              {peer.name.slice(0, 1)}
            </span>
          ))}
        </div>
        <IconButton
          label={t('board.present')}
          onClick={() => {
            setPresenting(true);
            fit();
          }}
        >
          <Presentation size={19} />
        </IconButton>
        <IconButton label={t('board.export')} onClick={() => setMenu('export')}>
          <Download size={19} />
        </IconButton>
        {state.role === 'owner' && (
          <button className="primary-button" onClick={() => setMenu('share')}>
            <Share2 size={16} />
            <span>{t('board.share')}</span>
          </button>
        )}
      </div>
    </header>
  );
}
interface ZoomProps {
  viewport: Viewport;
  setViewport: Dispatch<SetStateAction<Viewport>>;
  zoom: (factor: number) => void;
  fit: () => void;
}
export function ZoomControls({ viewport, setViewport, zoom, fit }: ZoomProps) {
  return (
    <div className="zoom-controls">
      <IconButton label={t('zoom.out')} onClick={() => zoom(0.8)}>
        <Minus size={17} />
      </IconButton>
      <button
        className="zoom-value"
        aria-label={t('zoom.reset')}
        title={t('zoom.reset')}
        onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}
      >
        {new Intl.NumberFormat(undefined, { style: 'percent' }).format(viewport.scale)}
      </button>
      <IconButton label={t('zoom.in')} onClick={() => zoom(1.25)}>
        <Plus size={17} />
      </IconButton>
      <IconButton label={t('zoom.fit')} onClick={() => fit()}>
        <Maximize2 size={17} />
      </IconButton>
    </div>
  );
}
export function BoardFooter({
  writable,
  state,
  setMenu,
}: Pick<HeaderProps, 'state' | 'setMenu'> & { writable: boolean }) {
  return (
    <div className="board-footer">
      <span className="canvas-hint">
        {t(writable ? 'board.hint' : 'board.readOnly', { role: t(`role.${state.role}`) })}
      </span>
      <IconButton label={t('board.help')} onClick={() => setMenu('help')}>
        <HelpCircle size={19} />
      </IconButton>
    </div>
  );
}
