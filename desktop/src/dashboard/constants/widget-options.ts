import { FormOption } from "../../interfaces/form-option.interface";
import { WidgetType } from "../../open-api/index";

// No "Group Summary" (who owes whom) for a new widget (Phase 3 C4); an existing one still renders.
export const widgetTypeOptions: FormOption[] = [
  {
    value: WidgetType.FilteredReceipts,
    displayValue: "Filtered Receipts",
  },
  {
    value: WidgetType.GroupActivity,
    displayValue: "Activity",
  },
  {
    value: WidgetType.PieChart,
    displayValue: "Pie Chart",
  },
  {
    value: WidgetType.Report,
    displayValue: "Report",
  }
];
