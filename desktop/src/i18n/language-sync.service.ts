import { effect, inject, Injectable } from "@angular/core";
import { Store } from "@ngxs/store";
import { catchError, of, take } from "rxjs";
import { UserPreferences, UserPreferencesService } from "../open-api";
import { AuthState } from "../store/auth.state";
import { SetUserPreferences } from "../store/auth.state.actions";
import { AppLanguage, asLanguage, TranslationService } from "./translation.service";

/** Ties the interface language to the signed-in person's saved preference (kept apart so the pipe needs no store). */
@Injectable({ providedIn: "root" })
export class LanguageSyncService {
  private readonly store = inject(Store);
  private readonly userPreferencesService = inject(UserPreferencesService);
  private readonly translation = inject(TranslationService);

  private readonly preferences = this.store.selectSignal(AuthState.userPreferences);

  constructor() {
    effect(() => {
      this.translation.saved.set(asLanguage(this.preferences()?.language));
    });
  }

  /** Switches the language now and saves it with the preferences when signed in. */
  public choose(language: AppLanguage): void {
    this.translation.choose(language);

    const current = this.preferences();
    if (!current) {
      return;
    }

    this.userPreferencesService
      .updateUserPreferences({ ...current, language } as UserPreferences)
      .pipe(
        take(1),
        catchError(() => of(undefined))
      )
      .subscribe((saved) => {
        if (saved) {
          this.store.dispatch(new SetUserPreferences(saved));
        }
      });
  }
}
