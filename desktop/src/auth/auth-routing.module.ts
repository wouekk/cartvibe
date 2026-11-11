import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FeatureGuard } from '../guards/feature.guard';
import { AuthForm } from './sign-up/auth-form.component';

export const authRoutes: Routes = [
  {
    path: 'sign-up',
    component: AuthForm,
    data: {
      isSignUp: true,
      feature: 'enableLocalSignUp',
    },
    canActivate: [FeatureGuard],
  },
  {
    path: 'login',
    component: AuthForm,
  },
  {
    // Where the server sends the browser after a sign-in at an identity provider. It sits under /auth on purpose:
    // the auth guard lets a browser without a stored session through any address that contains "auth".
    path: 'callback',
    loadComponent: () => import('./oidc-callback/oidc-callback.component').then((m) => m.OidcCallbackComponent),
  },
];

@NgModule({
  imports: [RouterModule.forChild(authRoutes)],
  exports: [RouterModule],
})
export class AuthRoutingModule {}
