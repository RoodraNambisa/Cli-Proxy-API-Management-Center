import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconChevronDown, IconChevronUp } from '@/components/ui/icons';
import styles from './ConfigTable.module.scss';

const summaryLabels = new Set(['providers', 'priorities', 'sources', 'scope', 'cooldown-seconds', 'message-contains', 'per-auth-request-limit', 'per-auth-request-window-minutes', 'max-retry-credentials', 'plan-types', 'match', 'regex', 'code', 'type']);

export function ConfigTable({ label, columns, children, numbered = false }: {
  label: string; columns: string[]; children: ReactNode; numbered?: boolean;
}) {
  return (
    <div className={styles.container}>
      <table role="table" className={`${styles.table} ${numbered ? styles.numbered : ''}`} aria-label={label}>
        <thead role="rowgroup"><tr role="row">{columns.map((column, index) => <th role="columnheader" key={index} scope="col">{column}</th>)}</tr></thead>
        <tbody role="rowgroup">{children}</tbody>
      </table>
    </div>
  );
}

export function ConfigTableRow({ title, cells, labels, actions, children, toggleLabel, initialExpanded = false, invalid = false, expanded: controlledExpanded, onExpandedChange }: {
  title: string;
  cells: ReactNode[];
  labels: string[];
  actions?: ReactNode;
  children: ReactNode;
  toggleLabel?: string;
  initialExpanded?: boolean;
  invalid?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [localExpanded, setExpanded] = useState(initialExpanded || invalid);
  const expanded = controlledExpanded ?? localExpanded;
  const [visited, setVisited] = useState(expanded);
  if (expanded && !visited) setVisited(true);
  const editLabel = toggleLabel ?? t('config_management.visual.common.edit');
  return (
    <>
      <tr role="row" className={`${styles.row} ${expanded ? styles.expanded : ''}`}>
        {cells.map((cell, index) => <td role="cell" key={index} data-label={labels[index]}><div className={styles.cell}>{cell}</div></td>)}
        <td role="cell">
          <div className={styles.actions}>
            {invalid && <span className={styles.invalid} title={t('config_management.visual.validation_blocked_short')}>!</span>}
            <Button type="button" variant="ghost" size="sm"
              aria-label={`${editLabel}: ${title}`} aria-expanded={expanded} aria-controls={id}
              onClick={() => { setExpanded(!expanded); setVisited(true); onExpandedChange?.(!expanded); }}
            >
              {editLabel}{expanded ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
            </Button>
            {actions}
          </div>
        </td>
      </tr>
      {visited && <tr role="row" hidden={!expanded} className={styles.detailRow}>
        <td role="cell" colSpan={cells.length + 1}><div id={id} className={styles.details}>{children}</div></td>
      </tr>}
    </>
  );
}

export function ConfigSummary({ entries, empty = '—' }: { entries: [string, string | undefined][]; empty?: string }) {
  const { t } = useTranslation();
  const populated = entries.filter(([, value]) => value?.trim());
  return populated.length ? <dl className={styles.summary}>{populated.map(([label, value], index) =>
    <div key={`${label}-${index}`}><dt title={label}>{summaryLabels.has(label) ? t(`config_management.visual.common.summary_${label.replace(/-/g, '_')}`) : label}</dt><dd title={value}>{value}</dd></div>
  )}</dl> : <span>{empty}</span>;
}
