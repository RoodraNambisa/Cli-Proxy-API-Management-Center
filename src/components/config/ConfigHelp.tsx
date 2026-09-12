import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconInfo } from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import styles from './ConfigHelp.module.scss';

/** Keep settings compact while making the full explanation accessible on every input device. */
export function ConfigHelp({ title, text }: { title: string; text: string }) {
  const { t } = useTranslation();
  const tooltipId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean }>();
  const [open, setOpen] = useState(false);
  const cancelClose = () => clearTimeout(closeTimer.current);
  const hide = () => { cancelClose(); setPosition(undefined); };
  const show = () => {
    cancelClose();
    if (open || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(480, window.innerWidth - 24);
    const above = rect.bottom > window.innerHeight / 2;
    setPosition({
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      top: above ? rect.top - 8 : rect.bottom + 8,
      above,
    });
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPosition(undefined), 150);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!position) return;
    const dismiss = (event: Event) => {
      if (event.type === 'scroll' && event.target instanceof Node && tooltip.current?.contains(event.target)) return;
      clearTimeout(closeTimer.current);
      setPosition(undefined);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(event); };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [position]);

  return (
    <>
      <div className={styles.help} onMouseEnter={show} onMouseLeave={scheduleClose}>
        <span className={styles.preview}>{text}</span>
        <button
          ref={trigger}
          type="button"
          className={styles.trigger}
          aria-label={t('config_management.visual.common.read_details', { title })}
          aria-haspopup="dialog"
          aria-describedby={position ? tooltipId : undefined}
          onFocus={show}
          onBlur={hide}
          onClick={() => { hide(); setOpen(true); }}
        >
          <IconInfo size={15} />
        </button>
      </div>
      {position && createPortal(
        <div
          ref={tooltip}
          id={tooltipId}
          role="tooltip"
          className={styles.tooltip}
          style={{ left: position.left, top: position.top, transform: position.above ? 'translateY(-100%)' : undefined }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <strong>{title}</strong>
          <div>{text}</div>
        </div>,
        document.body
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={title} width={600}>
        <div className={styles.fullText}>{text}</div>
      </Modal>
    </>
  );
}
