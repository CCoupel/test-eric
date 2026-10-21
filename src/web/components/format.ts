const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' });

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso)).replace(',', '');
export const formatDate = (iso: string): string => date.format(new Date(iso));

export function formatPlaces(count: number, capacity: number | null): string {
  return `${count} / ${capacity ?? 'illimité'}`;
}

/** ISO UTC → valeur d'un <input type="datetime-local"> (heure locale). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
