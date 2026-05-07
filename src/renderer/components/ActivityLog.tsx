import React from 'react';

type ActivityItem = {
  id?: string;
  type?: string;
  status?: string;
  title?: string;
  summary?: string;
  observationSummary?: string;
  error?: string;
  at?: string;
  createdAt?: string;
  updatedAt?: string;
};

function getTimestamp(item: ActivityItem): string {
  return item.at ?? item.createdAt ?? item.updatedAt ?? '';
}

export default function ActivityLog({ items }: { items: ActivityItem[] }) {
  if (!items.length) return <div><h3>Activity</h3><div>No activity yet.</div></div>;

  const sorted = [...items].sort((a, b) => getTimestamp(a).localeCompare(getTimestamp(b)));

  return (
    <div>
      <h3>Activity</h3>
      <ul>
        {sorted.map((item, index) => {
          const timestamp = getTimestamp(item);
          const key = item.id ?? `${item.type ?? 'activity'}-${index}`;
          return (
            <li key={key}>
              {timestamp && <span>{timestamp} </span>}
              {item.type && <span>{item.type} </span>}
              {item.status && <span>{item.status} </span>}
              {(item.title || item.summary) && <span>{item.title ?? item.summary} </span>}
              {item.observationSummary && <span>{item.observationSummary} </span>}
              {item.error && <span>{item.error}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
