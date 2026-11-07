import { Dispatch, SetStateAction } from 'react';
import { BoardState, BoardConnection } from '../lib/collaboration';
import { BoardItem } from '../types/board';
import { t } from '../lib/content';
import { Menu } from './BoardMenus';
import { BoardPanel, Panel } from './BoardPanels';
import { Inspector } from './Inspector';
interface Props {
  panel: Panel | null;
  state: BoardState;
  board: { id: string };
  selected?: BoardItem;
  writable: boolean;
  editing: boolean;
  setPanel: Dispatch<SetStateAction<Panel | null>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  fit: (items: BoardItem[]) => void;
  connection: BoardConnection;
  duplicate: () => void;
}
export function BoardSidebar({
  panel,
  state,
  board,
  selected,
  writable,
  editing,
  setPanel,
  setSelectedId,
  fit,
  connection,
  duplicate,
}: Props) {
  return (
    <>
      {panel ? (
        <BoardPanel
          panel={panel}
          boardId={board.id}
          role={state.role}
          items={state.items}
          onClose={() => setPanel(null)}
          onSelect={(id) => {
            setSelectedId(id);
            const item = state.items.find((value) => value.id === id);
            if (item) fit([item]);
          }}
        />
      ) : (
        selected &&
        writable && (
          <Inspector
            item={selected}
            editing={editing}
            onChange={(item) => connection.set(item)}
            onDelete={() => {
              connection.remove(selected.id);
              setSelectedId(null);
            }}
            onDuplicate={duplicate}
            onFront={() =>
              connection.set({
                ...selected,
                zIndex: Math.max(0, ...state.items.map((item) => item.zIndex ?? 0)) + 1,
              })
            }
            onBack={() =>
              connection.set({
                ...selected,
                zIndex: Math.min(0, ...state.items.map((item) => item.zIndex ?? 0)) - 1,
              })
            }
          />
        )
      )}
    </>
  );
}
export function BoardEmpty({
  state,
  writable,
  setMenu,
}: {
  state: BoardState;
  writable: boolean;
  setMenu: Dispatch<SetStateAction<Menu | null>>;
}) {
  return (
    <>
      {!state.items.length && state.status === 'saved' && (
        <div className="canvas-empty">
          <span className="empty-mark">+</span>
          <h1>{t('board.empty')}</h1>
          <p>{t('board.emptyHelp')}</p>
          {writable && (
            <button className="text-button" onClick={() => setMenu('templates')}>
              {t('template.title')}
            </button>
          )}
        </div>
      )}
    </>
  );
}
