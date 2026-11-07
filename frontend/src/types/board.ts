export type ToolType =
  'select' | 'pan' | 'rectangle' | 'circle' | 'sticky' | 'arrow' | 'pen' | 'text' | 'frame' | 'image';
export type DrawingTool = Exclude<ToolType, 'select' | 'pan'>;

export interface Point {
  x: number;
  y: number;
}

export interface BoardItem {
  id: string;
  type: DrawingTool;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fillColor?: string;
  text?: string;
  points?: Point[];
  assetId?: string;
  zIndex?: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface CollaboratorCursor {
  userId: string;
  userName: string;
  color: string;
  x: number;
  y: number;
}
