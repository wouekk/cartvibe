import { CommonModule, NgOptimizedImage } from "@angular/common";
import { NgModule } from "@angular/core";
import { ReactiveFormsModule } from "@angular/forms";
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { ButtonModule } from "../button/button.module";
import { DirectivesModule } from "../directives/directives.module";
import { InputModule } from "../input/input.module";
import { PipesModule } from "../pipes/pipes.module";
import { CartVibeLoaderComponent } from "../shared-ui/cartvibe-loader/cartvibe-loader.component";
import { CartVibeSplashComponent } from "../shared-ui/cartvibe-splash/cartvibe-splash.component";
import { CartVibeLogoComponent } from "../shared-ui/cartvibe-logo/cartvibe-logo.component";
import { LoginQrComponent } from "../shared-ui/login-qr/login-qr.component";
import { AuthRoutingModule } from "./auth-routing.module";
import { OidcCallbackComponent } from "./oidc-callback/oidc-callback.component";
import { AuthForm } from "./sign-up/auth-form.component";

@NgModule({
  declarations: [AuthForm, OidcCallbackComponent],
  imports: [
    AuthRoutingModule,
    ButtonModule,
    CommonModule,
    DirectivesModule,
    InputModule,
    PipesModule,
    ReactiveFormsModule,
    NgOptimizedImage,
    MatProgressSpinner,
    CartVibeLoaderComponent,
    CartVibeSplashComponent,
    CartVibeLogoComponent,
    LoginQrComponent,
  ],
  exports: [AuthForm],
})
export class AuthModule {
}
