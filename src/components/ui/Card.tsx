import { useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  extra?: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function Card({
  title,
  extra,
  children,
  className,
  collapsible = false,
  defaultOpen = true,
}: PropsWithChildren<CardProps>) {
  const [open, setOpen] = useState(defaultOpen);
  const cardClassName = className ? `card ${className}` : 'card';
  if (collapsible) {
    return (
      <details
        className={`${cardClassName} card-collapsible`}
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="card-header card-collapsible-summary">
          <span className="title">{title}</span>
          {extra ? (
            <span
              className="card-collapsible-extra"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {extra}
            </span>
          ) : null}
          <span className="card-collapsible-chevron" aria-hidden="true" />
        </summary>
        <div className="card-collapsible-content">{children}</div>
      </details>
    );
  }
  return (
    <div className={cardClassName}>
      {(title || extra) && (
        <div className="card-header">
          <div className="title">{title}</div>
          {extra}
        </div>
      )}
      {children}
    </div>
  );
}
