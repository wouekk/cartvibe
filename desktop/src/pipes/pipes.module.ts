import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { AppDatePipe } from "./app-date.pipe";
import { CustomCurrencyPipe } from "./custom-currency.pipe";
import { DurationPipe } from "./duration.pipe";
import { FormArrayLastPipe } from "./form-array-last.pipe";
import { FormGetPipe } from "./form-get.pipe";
import { GroupPipe } from "./group.pipe";
import { ImagePipe } from "./image.pipe";
import { InputReadonlyPipe } from "./input-readonly.pipe";
import { MapGetPipe } from "./map-get.pipe";
import { MapKeyPipe } from "./map-key.pipe";
import { PluralPipe, TranslatePipe } from "../i18n/translate.pipe";
import { NamePipe } from "./name.pipe";
import { RoleNamePipe } from "./role-name.pipe";
import { StatusPipe } from "./status.pipe";
import { UserPipe } from "./user.pipe";

@NgModule({
  declarations: [
    CustomCurrencyPipe,
    DurationPipe,
    FormArrayLastPipe,
    FormGetPipe,
    GroupPipe,
    ImagePipe,
    InputReadonlyPipe,
    MapGetPipe,
    MapKeyPipe,
    NamePipe,
    RoleNamePipe,
    StatusPipe,
    UserPipe,
  ],
  imports: [CommonModule, AppDatePipe, TranslatePipe, PluralPipe],
  exports: [
    TranslatePipe,
    PluralPipe,
    AppDatePipe,
    CustomCurrencyPipe,
    DurationPipe,
    FormArrayLastPipe,
    FormGetPipe,
    GroupPipe,
    ImagePipe,
    InputReadonlyPipe,
    MapGetPipe,
    MapKeyPipe,
    NamePipe,
    RoleNamePipe,
    StatusPipe,
    UserPipe,
  ],
})
export class PipesModule {}
