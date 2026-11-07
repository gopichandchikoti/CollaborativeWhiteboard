import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { List, MessageSquare, History, X } from 'lucide-react';
import { BoardHeader, BoardFooter, ZoomControls } from './BoardChrome';
import { boardShortcut } from '../lib/shortcuts';
import { Board, canEdit } from '../lib/contracts';
import { t } from '../lib/content';
import { BoardConnection, BoardState } from '../lib/collaboration';
import { BoardItem, ToolType, Viewport } from '../types/board';
import { Canvas } from './Canvas/Canvas';
import { fitViewport, worldPoint } from './Canvas/viewport';
import { moveItem } from './Canvas/geometry';
import { Toolbar } from './Toolbar/Toolbar';
import { ShareDialog } from './ShareDialog';
import { RemoteCursors } from './Cursors/RemoteCursors';
import { BoardSidebar, BoardEmpty } from './BoardSidebar';
import { Panel } from './BoardPanels';
import { BoardMenu, Menu } from './BoardMenus';
import { templateItems } from '../lib/templates';
import { uploadImage } from '../lib/uploads';
import { useTask } from '../lib/useTask';
import { ErrorNotice, IconButton } from './ui';
import { BoardRecovery } from './BoardRecovery';

interface SessionProps {
  board: Board;
  connection: BoardConnection;
  onBack: () => void;
  onRename: (title: string) => void;
}
export function BoardSession({ board, connection, onBack, onRename }: SessionProps) {
  const state = useSyncExternalStore(connection.subscribe, connection.snapshot);
  const [tool, setTool] = useState<ToolType>('select');
  const [color, setColor] = useState('#24332e');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [panel, setPanel] = useState<Panel | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [presenting, setPresenting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const { error, run } = useTask();
  const writable = isWritable(state);
  const selected = state.items.find((item) => item.id === selectedId);
  function fit(items = state.items) {
    const rect = container.current?.getBoundingClientRect();
    if (rect) setViewport(fitViewport(items, rect.width, rect.height));
  }
  function selectTool(next: ToolType) {
    if (next === 'image') fileInput.current?.click();
    else {
      setTool(next);
      setEditing(false);
    }
  }
  function duplicate() {
    if (!selected) return;
    const copy = { ...moveItem(selected, { x: 24, y: 24 }), id: crypto.randomUUID(), zIndex: undefined };
    connection.set(copy);
    setSelectedId(copy.id);
  }
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) =>
      boardShortcut(event, {
        connection,
        selected,
        writable,
        selectTool,
        clear: () => setSelectedId(null),
        escape: () => {
          setSelectedId(null);
          setPanel(null);
          setPresenting(false);
        },
      });
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [connection, selected, writable]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (state.status === 'saving' || state.status === 'offline' || state.status === 'cacheError')
        event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state.status]);
  const peers = state.peers.filter((peer) => peer.userId !== connection.userId);
  const zoom = (factor: number) => {
    const rect = container.current?.getBoundingClientRect();
    const center = { x: (rect?.width ?? 800) / 2, y: (rect?.height ?? 600) / 2 };
    const world = worldPoint(center, viewport);
    const scale = Math.min(4, Math.max(0.1, viewport.scale * factor));
    setViewport({ x: center.x - world.x * scale, y: center.y - world.y * scale, scale });
  };
  function addTemplate(type: 'retro' | 'flow') {
    const items = templateItems(type);
    connection.add(items);
    fit([...state.items, ...items]);
  }
  return (
    <main className={`board-editor ${presenting ? 'presenting' : ''}`} ref={container}>
      <div
        className="canvas-surface"
        style={{
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
        }}
      >
        <Canvas
          tool={writable || tool === 'pan' ? tool : 'select'}
          color={color}
          items={state.items}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setEditing(false);
          }}
          onCommit={(item) => {
            connection.set(item);
            setTool('select');
          }}
          onEditText={() => setEditing(true)}
          onPresence={(point) => connection.presence(point)}
          viewport={viewport}
          onViewport={setViewport}
          readOnly={!writable || presenting}
          boardId={board.id}
        />
      </div>
      <BoardHeader
        board={board}
        state={state}
        onBack={onBack}
        setMenu={setMenu}
        setPresenting={setPresenting}
        fit={fit}
      />
      {!presenting && (
        <>
          <Toolbar
            currentTool={tool}
            onSelectTool={selectTool}
            currentColor={color}
            onSelectColor={(value) => {
              setColor(value);
              if (selected && writable) connection.set({ ...selected, color: value });
            }}
            canUndo={state.canUndo}
            canRedo={state.canRedo}
            undo={() => connection.undo.undo()}
            redo={() => connection.undo.redo()}
            readOnly={!writable}
          />
          <div className="panel-tabs">
            {(
              [
                { id: 'objects', icon: List },
                { id: 'comments', icon: MessageSquare },
                { id: 'history', icon: History },
              ] as const
            ).map((entry) => (
              <IconButton
                key={entry.id}
                label={t(`board.${entry.id}`)}
                aria-pressed={panel === entry.id}
                onClick={() => setPanel(panel === entry.id ? null : entry.id)}
              >
                <entry.icon size={19} />
              </IconButton>
            ))}
          </div>
          <BoardSidebar
            panel={panel}
            state={state}
            board={board}
            selected={selected}
            writable={writable}
            editing={editing}
            setPanel={setPanel}
            setSelectedId={setSelectedId}
            fit={fit}
            connection={connection}
            duplicate={duplicate}
          />
          <BoardEmpty state={state} writable={writable} setMenu={setMenu} />
          <BoardFooter writable={writable} state={state} setMenu={setMenu} />
        </>
      )}
      <ZoomControls viewport={viewport} setViewport={setViewport} zoom={zoom} fit={fit} />
      <RemoteCursors peers={peers} viewport={viewport} />
      {presenting && (
        <IconButton
          className="exit-presentation"
          label={t('board.exitPresentation')}
          onClick={() => setPresenting(false)}
        >
          <X size={20} />
        </IconButton>
      )}
      <ErrorNotice message={error} />
      <BoardRecovery status={state.status} discard={() => connection.discardDraft()} onDone={onBack} />
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="visually-hidden"
        aria-label={t('tool.image')}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          run(async () => {
            const image = await uploadImage(board.id, file);
            const point = worldPoint({ x: 240, y: 200 }, viewport);
            const scale = Math.min(1, 480 / image.width, 480 / image.height);
            const item: BoardItem = {
              id: crypto.randomUUID(),
              type: 'image',
              color,
              ...point,
              assetId: image.assetId,
              width: image.width * scale,
              height: image.height * scale,
            };
            connection.set(item);
            setSelectedId(item.id);
            setTool('select');
          });
        }}
      />
      {menu === 'share' && <ShareDialog boardId={board.id} onClose={() => setMenu(null)} />}
      {menu && menu !== 'share' && (
        <BoardMenu
          menu={menu}
          board={board}
          onClose={() => setMenu(null)}
          onDelete={onBack}
          onRename={onRename}
          onTemplate={addTemplate}
          saved={state.status === 'saved'}
        />
      )}
    </main>
  );
}
function isWritable(state: BoardState) {
  return canEdit(state.role) && !['error', 'denied', 'restored'].includes(state.status);
}
