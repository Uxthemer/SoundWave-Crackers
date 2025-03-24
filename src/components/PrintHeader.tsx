import { format } from 'date-fns';

interface PrintHeaderProps {
  title: string;
}

export function PrintHeader({ title }: PrintHeaderProps) {
  return (
    <div className="print-header">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <img 
            src="/assets/img/logo/logo_2.png" 
            alt="SoundWave Crackers" 
            className="h-16 w-auto"
          />
          <div>
            <h1 className="text-2xl font-bold text-primary-orange">{title}</h1>
            <p className="text-sm text-text/60">Generated on: {format(new Date(), 'PPpp')}</p>
          </div>
        </div>
      </div>
      <hr className="border-t border-card-border/10 mb-6" />
    </div>
  );
}