import { NgModule } from "@angular/core";
import { NgxsStoragePluginModule } from "@ngxs/storage-plugin";
import { NgxsModule } from "@ngxs/store";
import { ngxsStates, ngxsStorageKeys } from "./ngxs-states";

/**
 * The app's store for specs. The app itself provides the store in `app.config.ts`; both read the states and the
 * stored slices from `ngxs-states.ts`, so there is one definition.
 */
@NgModule({
  imports: [
    NgxsModule.forRoot(ngxsStates),
    NgxsStoragePluginModule.forRoot({ keys: ngxsStorageKeys }),
  ],
})
export class StoreModule {}
