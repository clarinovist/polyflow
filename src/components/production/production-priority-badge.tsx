import { Badge } from "@/components/ui/badge";
import { getPriorityLabel } from "@/lib/labels/helpers";

export function ProductionPriorityBadge({ priority }: { priority: string }) {
  if (priority === "NORMAL" || !priority) return null;
  const isUrgent = priority === "URGENT";
  return (
    <Badge
      variant={isUrgent ? "destructive" : "outline"}
      className={
        isUrgent
          ? "text-[10px] py-0 h-4"
          : "text-[10px] py-0 h-4 text-muted-foreground"
      }
    >
      {getPriorityLabel(priority)}
    </Badge>
  );
}
