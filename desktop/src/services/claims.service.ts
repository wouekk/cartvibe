import { Injectable, inject } from "@angular/core";
import { map, Observable, take, tap } from 'rxjs';
import { UserService } from '../open-api/api/user.service';
import { AuthStore } from "../store/auth.store";

@Injectable({
  providedIn: 'root',
})
export class ClaimsService {
  private readonly authStore = inject(AuthStore);

  constructor(private userService: UserService) {}

  public getAndSetClaimsForLoggedInUser(): Observable<void> {
    return this.userService.getUserClaims().pipe(
      take(1),
      tap((claims) => this.authStore.setAuthState(claims)),
      map(() => undefined)
    );
  }
}
