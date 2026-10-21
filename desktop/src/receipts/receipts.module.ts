import { DragDropModule } from "@angular/cdk/drag-drop";
import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";

import { ExpansionPanelComponent } from "../shared-ui/expansion-panel/expansion-panel.component";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { HlmBadge } from "@spartan-ng/helm/badge";
import { UploadProgressComponent } from "../shared-ui/upload-progress/upload-progress.component";
import { ShopMonogramComponent } from "../shared-ui/shop-monogram/shop-monogram.component";
import { HlmCheckboxImports } from "@spartan-ng/helm/checkbox";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { AutocompleteModule } from "src/autocomplete/autocomplete.module";
import { AvatarModule } from "src/avatar";
import { DatepickerModule } from "src/datepicker/datepicker.module";
import { PipesModule } from "src/pipes/pipes.module";
import { RadioGroupModule } from "src/radio-group/radio-group.module";
import { SelectModule } from "src/select/select.module";
import { SharedUiModule } from "src/shared-ui/shared-ui.module";
import { SlideToggleModule } from "src/slide-toggle/slide-toggle.module";
import { TableModule } from "src/table/table.module";
import { TextareaModule } from "src/textarea/textarea.module";
import { UserAutocompleteModule } from "src/user-autocomplete/user-autocomplete.module";
import { ButtonModule } from "../button";
import { CarouselModule as ReceiptWranglerCarousel } from "../carousel/carousel.module";
import { CategoryAutocompleteComponent } from "../category-autocomplete/category-autocomplete.component";
import { CheckboxModule } from "../checkbox/checkbox.module";
import { DirectivesModule } from "../directives";
import { InputModule } from "../input";
import { MonthStepperComponent } from "../shared-ui/month-stepper/month-stepper.component";
import { PeriodPickerComponent } from "../overview/period-picker/period-picker.component";
import { ReceiptCurrencyNoteComponent } from "./receipt-currency-note/receipt-currency-note.component";
import { ReceiptTotalsComponent } from "./receipt-totals/receipt-totals.component";
import { FilteredStatefulMenuComponent } from "../standalone/components/filtered-stateful-menu/filtered-stateful-menu.component";
import { TagAutocompleteComponent } from "../tag-autocomplete/tag-autocomplete.component";
import { BulkStatusUpdateComponent } from "./bulk-resolve-dialog/bulk-status-update-dialog.component";
import { ColumnConfigurationDialogComponent } from "./column-configuration-dialog/column-configuration-dialog.component";
import { CustomFieldCellComponent } from "./custom-field-cell/custom-field-cell.component";
import { CustomFieldComponent } from "./custom-field/custom-field.component";
import { ItemAddFormComponent } from "./item-add-form/item-add-form.component";
import { ItemListComponent } from "./item-list/item-list.component";

import { CustomFieldPipe } from "./pipes/custom-field.pipe";
import { QuickActionsDialogComponent } from "./quick-actions-dialog/quick-actions-dialog.component";
import { QuickScanDialogComponent } from "./quick-scan-dialog/quick-scan-dialog.component";
import { ReceiptCommentsComponent } from "./receipt-comments/receipt-comments.component";
import { ReceiptFormComponent } from "./receipt-form/receipt-form.component";
import { ReceiptsRoutingModule } from "./receipts-routing.module";
import { ReceiptsTableComponent } from "./receipts-table/receipts-table.component";
import { ShareListComponent } from "./share-list/share-list.component";
import { UploadImageComponent } from "./upload-image/upload-image.component";
import { ReceiptProductsComponent } from "./receipt-products/receipt-products.component";
import { UserTotalWithPercentagePipe } from "./user-total-with-percentage.pipe";

@NgModule({
  declarations: [
    BulkStatusUpdateComponent,
    ColumnConfigurationDialogComponent,
    CustomFieldCellComponent,
    ItemAddFormComponent,
    ItemListComponent,
    ShareListComponent,
    QuickActionsDialogComponent,
    ReceiptCommentsComponent,
    ReceiptFormComponent,
    ReceiptsTableComponent,
    UploadImageComponent,
    UserTotalWithPercentagePipe,
    QuickScanDialogComponent,
    CustomFieldComponent,
    CustomFieldPipe,
  ],
  imports: [
    UploadProgressComponent,
    AutocompleteModule,
    AvatarModule,
    ButtonModule,
    CategoryAutocompleteComponent,
    CommonModule,
    DatepickerModule,
    DirectivesModule,
    DragDropModule,
    InputModule,
    HlmBadge,
    ShopMonogramComponent,
    ...HlmCheckboxImports,
    HlmSpinner,
    ExpansionPanelComponent,
    AppIconComponent,
    ...HlmDropdownMenuImports,
    ...HlmInputGroupImports,
    ...HlmTooltipImports,
    PipesModule,
    RadioGroupModule,
    ReactiveFormsModule,
    ReceiptWranglerCarousel,
    ReceiptsRoutingModule,
    SelectModule,
    SharedUiModule,
    SlideToggleModule,
    TableModule,
    TagAutocompleteComponent,
    TextareaModule,
    UserAutocompleteModule,
    FilteredStatefulMenuComponent,
    CheckboxModule,
    MonthStepperComponent,
    PeriodPickerComponent,
    ReceiptCurrencyNoteComponent,
    ReceiptTotalsComponent,
    ReceiptProductsComponent,
  ],
  exports: [
    UploadImageComponent
  ]
})
export class ReceiptsModule {}
