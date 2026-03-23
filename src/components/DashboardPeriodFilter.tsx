import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toISODate } from '@/lib/helpers';

export interface PeriodRange {
  from: string;
  to: string;
  label: string;
}

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '15d', days: 15 },
  { label: '30d', days: 30 },
  { label: '45d', days: 45 },
  { label: '60d', days: 60 },
];

interface Props {
  value: PeriodRange;
  onChange: (range: PeriodRange) => void;
}

export default function DashboardPeriodFilter({ value, onChange }: Props) {
  const [calOpen, setCalOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  const handlePreset = (days: number, label: string) => {
    const today = new Date();
    const to = new Date();
    to.setDate(today.getDate() + days);
    onChange({ from: toISODate(today), to: toISODate(to), label });
  };

  const handleCalendarSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range) return;
    setDateRange(range);
    if (range.from && range.to) {
      onChange({
        from: toISODate(range.from),
        to: toISODate(range.to),
        label: 'Personalizado',
      });
      setCalOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
      {PRESETS.map(p => (
        <Button
          key={p.label}
          size="sm"
          variant={value.label === p.label ? 'default' : 'ghost'}
          className="h-8 px-2 sm:px-3 text-xs font-medium min-w-[36px] min-h-[36px]"
          onClick={() => handlePreset(p.days, p.label)}
        >
          {p.label}
        </Button>
      ))}
      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={value.label === 'Personalizado' ? 'default' : 'outline'}
            className={cn('h-8 px-2 sm:px-3 text-xs gap-1 sm:gap-1.5 min-h-[36px]', value.label === 'Personalizado' && 'font-medium')}
          >
            <CalendarIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">
              {value.label === 'Personalizado'
                ? `${new Date(value.from + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} – ${new Date(value.to + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
                : 'Período'}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={dateRange as any}
            onSelect={handleCalendarSelect as any}
            numberOfMonths={1}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
