import type { LogEntry, Notification } from '@iris/types';
import type { EngineData } from './types';

export function addLog(d: EngineData, level: LogEntry['level'], source: string, message: string) {
  d.log.unshift({ id: `L${d.seq.log++}`, at: d.now, level, source, message });
  if (d.log.length > 200) d.log.length = 200;
}

export function notify(d: EngineData, level: Notification['level'], title: string, body: string, href?: string) {
  d.notifications.unshift({ id: `N${d.seq.notif++}`, at: d.now, level, title, body, href, read: false });
  if (d.notifications.length > 40) d.notifications.length = 40;
}

export const fmtTime = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour12: false });
