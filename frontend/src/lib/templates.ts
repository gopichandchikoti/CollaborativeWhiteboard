import { BoardItem } from '../types/board';
import { t } from './content';
export function templateItems(type: 'retro' | 'flow'): BoardItem[] {
  const labels =
    type === 'retro'
      ? [t('template.well'), t('template.improve'), t('template.next')]
      : [t('template.start'), t('template.explore'), t('template.decide')];
  const items: BoardItem[] = labels.map((text, index) => ({
    id: crypto.randomUUID(),
    type: type === 'retro' ? 'sticky' : 'rectangle',
    x: 160 + index * 300,
    y: 200,
    width: 240,
    height: type === 'retro' ? 220 : 120,
    color: '#315c4f',
    fillColor: ['#f9e7a1', '#cce5da', '#e9d7ee'][index],
    text,
  }));
  if (type === 'flow')
    for (let index = 0; index < 2; index++)
      items.push({
        id: crypto.randomUUID(),
        type: 'arrow',
        x: 408 + index * 300,
        y: 260,
        width: 44,
        height: 0,
        color: '#315c4f',
        points: [
          { x: 408 + index * 300, y: 260 },
          { x: 452 + index * 300, y: 260 },
        ],
      });
  return items;
}
