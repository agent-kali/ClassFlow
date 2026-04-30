export function getInitials(name: string | null | undefined): string {
  const cleanedName = (name ?? '').replace(/^\s*\[[^\]]+\]\s*/, '').trim();

  if (!cleanedName) return '?';

  const initials = cleanedName
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return initials || '?';
}
