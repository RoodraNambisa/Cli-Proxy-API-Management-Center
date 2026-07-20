import type { ReactNode } from 'react';
import { IconChevronDown, IconChevronRight } from '@/components/ui/icons';
import styles from './ConfigDisclosure.module.scss';

type ConfigDisclosureProps = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  summary?: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  actions?: ReactNode;
  dirty?: boolean;
  errorCount?: number;
  children: ReactNode;
};

export function ConfigDisclosure({
  id,
  title,
  description,
  summary,
  expanded,
  onExpandedChange,
  actions,
  dirty = false,
  errorCount = 0,
  children,
}: ConfigDisclosureProps) {
  const contentId = `${id}-content`;

  return (
    <section id={id} className={styles.disclosure} data-config-target={id}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => onExpandedChange(!expanded)}
        >
          <span className={styles.chevron} aria-hidden="true">
            {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </span>
          <span className={styles.copy}>
            <span className={styles.titleRow}>
              <span className={styles.title}>{title}</span>
              {dirty ? <span className={styles.dirtyDot} aria-label="modified" /> : null}
              {errorCount > 0 ? <span className={styles.errorBadge}>{errorCount}</span> : null}
            </span>
            {description ? <span className={styles.description}>{description}</span> : null}
          </span>
        </button>
        <div className={styles.meta}>
          {summary ? <span className={styles.summary}>{summary}</span> : null}
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      </div>
      {expanded ? (
        <div id={contentId} className={styles.content}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
