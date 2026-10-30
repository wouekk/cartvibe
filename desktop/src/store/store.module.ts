import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { NgxsReduxDevtoolsPluginModule } from "@ngxs/devtools-plugin";
import { NgxsStoragePluginModule } from "@ngxs/storage-plugin";
import { NgxsModule } from "@ngxs/store";
import { environment } from "src/environments/environment.development";
import { AboutState } from "./about.state";
import { AuthState } from "./auth.state";
import { CategoryTableState } from "./category-table.state";
import { FeatureConfigState } from "./feature-config.state";
import { GroupTableState } from "./group-table.state";
import { GroupState } from "./group.state";
import { LayoutState } from "./layout.state";
import { ReceiptProcessingSettingsTaskTableState } from "./receipt-processing-settings-task-table.state";
import { ReceiptTableState } from "./receipt-table.state";
import { ShoppingListState } from "./shopping-list.state";
import { SystemSettingsState } from "./system-settings.state";
import { SystemTaskTableState } from "./system-task-table.state";
import { TagTableState } from "./tag-table.state";
import { UserState } from "./user.state";

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    NgxsModule.forRoot([
      AboutState,
      AuthState,
      CategoryTableState,
      FeatureConfigState,
      GroupState,
      GroupTableState,
      LayoutState,
      ReceiptProcessingSettingsTaskTableState,
      ReceiptTableState,
      // Not in the storage plugin's keys below: the server is the source of truth.
      ShoppingListState,
      SystemSettingsState,
      SystemTaskTableState,
      TagTableState,
      UserState,
    ]),
    NgxsReduxDevtoolsPluginModule.forRoot({
      disabled: environment.isProd,
    }),
    NgxsStoragePluginModule.forRoot({
      keys: [
        "about",
        "auth",
        "categoryTable",
        "groupTable",
        "groups",
        "layout",
        "receiptProcessingSettingsTaskTable",
        "receiptTable",
        "systemSettings",
        "systemTaskTable",
        "tagTable",
        "users",
      ],
    }),
  ],
})
export class StoreModule {}
