import { format as dateFormat } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';

export function getPeriodLabel(start: Date, end: Date): { label: string; hint: string } {
  const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    const month = dateFormat(start, 'LLLL yyyy', { locale: idLocale });
    const caps = month[0].toUpperCase() + month.slice(1);
    return {
      label: `Periode: ${caps} (${dateFormat(start, 'd', { locale: idLocale })}–${dateFormat(end, 'd MMM yyyy', { locale: idLocale })})`,
      hint: 'Scope ikut filter tanggal di atas • orderDate',
    };
  }
  return {
    label: `Periode: ${dateFormat(start, 'd MMM', { locale: idLocale })} – ${dateFormat(end, 'd MMM yyyy', { locale: idLocale })}`,
    hint: 'Scope ikut filter tanggal di atas • orderDate',
  };
}
