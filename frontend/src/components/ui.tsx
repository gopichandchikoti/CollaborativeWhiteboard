import { ButtonHTMLAttributes, ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { t } from '../lib/content';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}
export function IconButton({ label, children, className = '', ...props }: IconButtonProps) {
  return (
    <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const previous = useRef(document.activeElement);
  useEffect(() => {
    const element = ref.current;
    const previousElement = previous.current;
    element?.showModal();
    return () => {
      element?.close();
      if (previousElement instanceof HTMLElement) previousElement.focus();
    };
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={title} onCancel={onClose}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <IconButton label={t('common.close')} onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p className="error-notice" role="alert">
      {message}
    </p>
  ) : null;
}
