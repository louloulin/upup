/**
 * Time Formatting Utilities
 *
 * Common time formatting functions used across the application.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format a duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) {
    const secs = Math.floor(ms / SECOND);
    return `${secs}s`;
  }
  if (ms < HOUR) {
    const mins = Math.floor(ms / MINUTE);
    return `${mins}m`;
  }
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    const mins = Math.floor((ms % HOUR) / MINUTE);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/**
 * Format a date as a relative time string (e.g., "5 minutes ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const then = date.getTime();
  const diff = now - then;

  if (diff < MINUTE) {
    return 'just now';
  }
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins}m ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours}h ago`;
  }
  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
  }
  if (diff < 30 * DAY) {
    const weeks = Math.floor(diff / (7 * DAY));
    return `${weeks}w ago`;
  }
  if (diff < 365 * DAY) {
    const months = Math.floor(diff / (30 * DAY));
    return `${months}mo ago`;
  }
  const years = Math.floor(diff / (365 * DAY));
  return `${years}y ago`;
}
