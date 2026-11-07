import { Peer } from '../../lib/collaboration';
import { Viewport } from '../../types/board';
export function RemoteCursors({ peers, viewport }: { peers: Peer[]; viewport: Viewport }) {
  return (
    <>
      {' '}
      {peers.map(
        (peer) =>
          peer.cursor && (
            <div
              key={peer.id}
              className="remote-cursor"
              aria-hidden="true"
              style={{
                left: peer.cursor.x * viewport.scale + viewport.x,
                top: peer.cursor.y * viewport.scale + viewport.y,
              }}
            >
              <svg width="18" height="22" viewBox="0 0 18 22">
                <path d="M1 1L16 12L9 13L6 20Z" fill="#31705a" stroke="white" />
              </svg>
              <span>{peer.name}</span>
            </div>
          ),
      )}
    </>
  );
}
