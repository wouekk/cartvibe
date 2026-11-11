import { CommonModule, NgOptimizedImage } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { ButtonModule } from "../button/button.module";

import { InputModule } from "../input/input.module";

import { CartVibeLoaderComponent } from "../shared-ui/cartvibe-loader/cartvibe-loader.component";
import { CartVibeSplashComponent } from "../shared-ui/cartvibe-splash/cartvibe-splash.component";
import { CartVibeLogoComponent } from "../shared-ui/cartvibe-logo/cartvibe-logo.component";
import { AppIconComponent } from "../shared-ui/icon/icon.component";
import { AuthRoutingModule } from "./auth-routing.module";
import { AuthForm } from "./sign-up/auth-form.component";

@NgModule({
    imports: [
    AuthRoutingModule,
    ButtonModule,
    CommonModule,
    InputModule,
    ReactiveFormsModule,
    NgOptimizedImage,
    CartVibeLoaderComponent,
    CartVibeSplashComponent,
    CartVibeLogoComponent,
    HlmButton,
    AppIconComponent,
    AuthForm,
],
    exports: [AuthForm],
})
export class AuthModule {
}
