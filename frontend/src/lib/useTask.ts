import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText } from './content';

export function useTask() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const run = useCallback((work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError('');
    void work()
      .catch((reason) => {
        if (active.current) setError(errorText(reason));
      })
      .finally(() => {
        running.current = false;
        if (active.current) setPending(false);
      });
  }, []);
  return { pending, error, run };
}
