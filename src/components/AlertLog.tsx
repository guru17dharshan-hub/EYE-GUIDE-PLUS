import { Volume2 } from "lucide-react";

interface AlertLogProps {
  alerts: string[];
}

const AlertLog = ({ alerts }: AlertLogProps) => {
  return (
    <div className="space-y-2 max-h-32 overflow-y-auto" role="log" aria-label="Navigation alerts" aria-live="assertive">
      {alerts.map((alert, index) => (
        <div
          key={index}
          className={`flex items-start gap-2 text-sm rounded-lg p-2 ${
            index === 0
              ? "bg-primary/15 text-foreground border border-primary/30"
              : "text-muted-foreground"
          }`}
        >
          <Volume2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{alert}</span>
        </div>
      ))}
    </div>
  );
};

export default AlertLog;
