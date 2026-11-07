import './ui-setup';
import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { AuthScreen } from '../src/components/AuthScreen';
import { Library } from '../src/components/Library';
import { fixtureApi, board, user, workspace } from './ui-fixtures';
it('has no automated semantic accessibility violations in sign-in or board navigation', async () => {
  fixtureApi();
  document.title = 'Synthetic accessibility fixture';
  const auth = render(<AuthScreen onUser={vi.fn()} invitation={false} />);
  const authResults = await axe.run(auth.container, { rules: { 'color-contrast': { enabled: false } } });
  expect(authResults.violations.map((value) => value.id)).toEqual([]);
  auth.unmount();
  const library = render(
    <Library
      user={user}
      boards={[board]}
      workspaces={[workspace]}
      onOpen={vi.fn()}
      onRefresh={vi.fn()}
      onLogout={vi.fn()}
    />,
  );
  const result = await axe.run(library.container, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.map((value) => value.id)).toEqual([]);
});
