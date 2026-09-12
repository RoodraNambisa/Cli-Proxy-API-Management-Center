import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconChevronDown, IconChevronUp } from '@/components/ui/icons';
import styles from './ConfigTable.module.scss';

export function ConfigTable({ label, columns, children }: {
  label: string; columns: string[]; children: ReactNode;
}) {
  return (
    <div className={styles.container}>
      <table className={styles.table} aria-label={label}>
        <thead><tr>{columns.map((column, index) => <th key={index} scope="col">{column}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function ConfigTableRow({ title, cells, labels, actions, children, toggleLabel, initialExpanded = false, invalid = false }: {
  title: string;
  cells: ReactNode[];
  labels: string[];
  actions?: ReactNode;
  children: ReactNode;
  toggleLabel?: string;
  initialExpanded?: boolean;
  invalid?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [expanded, setExpanded] = useState(initialExpanded || invalid);
  const [visited, setVisited] = useState(expanded);
  const editLabel = toggleLabel ?? t('config_management.visual.common.edit');
  return (
    <>
      <tr className={`${styles.row} ${expanded ? styles.expanded : ''}`}>
        {cells.map((cell, index) => <td key={index} data-label={labels[index]}><div className={styles.cell}>{cell}</div></td>)}
        <td className={styles.actionCell}>
          <div className={styles.actions}>
            {invalid && <span className={styles.invalid} title={t('config_management.visual.validation_blocked_short')}>!</span>}
            <Button type="button" variant="ghost" size="sm"
              aria-label={`${editLabel}: ${title}`} aria-expanded={expanded} aria-controls={id}
              onClick={() => { setExpanded(!expanded); setVisited(true); }}
            >
              {editLabel}{expanded ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
            </Button>
            {actions}
          </div>
        </td>
      </tr>
      {visited && <tr hidden={!expanded} className={styles.detailRow}>
        <td colSpan={cells.length + 1}><div id={id} className={styles.details}>{children}</div></td>
      </tr>}
    </>
  );
}
