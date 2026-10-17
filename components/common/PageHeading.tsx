import React from 'react';

/** Shared visual hierarchy; actions and data remain owned by each screen. */
export default function PageHeading({ title, description, children }: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="crm-page-heading flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
