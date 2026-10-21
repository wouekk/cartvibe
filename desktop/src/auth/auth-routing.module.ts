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
    // Where the backend lands the browser after a successful OIDC sign-in. It
    // sits under /auth deliberately: AuthGuard lets an unauthenticated user
    // through any route whose URL contains "auth", and a first-ever OIDC login
    // has valid cookies but nothing in the store yet.
    path: 'callback',
  },
];

@NgModule({
  imports: [RouterModule.forChild(authRoutes)],
  exports: [RouterModule],
})
export class AuthRoutingModule {}
