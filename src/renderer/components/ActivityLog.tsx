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


function labelForType(type?: string): string {
  if (!type) return '';
  if (['observe_desktop','take_screenshot','open_path','list_directory','read_file','write_file','run_shell_command'].includes(type)) return `[desktop] ${type}`;
  if (['open_url','read_current_page','click_candidate','fill_field'].includes(type)) return `[browser] ${type}`;
  return type;
}

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
              {item.type && <span>{labelForType(item.type)} </span>}
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
