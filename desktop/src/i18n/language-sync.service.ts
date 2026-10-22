import { effect, inject, Injectable, untracked } from "@angular/core";
import { Store } from "@ngxs/store";
import { catchError, of, take } from "rxjs";
import { UserPreferences, UserPreferencesService } from "../open-api";
import { AuthState } from "../store/auth.state";
import { SetUserPreferences } from "../store/auth.state.actions";
import { TranslationLoader } from "./translation-loader";
import { AppLanguage, TranslationService } from "./translation.service";

/**
 * Ties the interface language to the signed-in person's saved preference (kept apart so the pipe needs no store).
 * Signed out means English: the browser's language is never consulted.
 */
@Injectable({ providedIn: "root" })
export class LanguageSyncService {
  private readonly store = inject(Store);
  private readonly userPreferencesService = inject(UserPreferencesService);
  private readonly translation = inject(TranslationService);
  private readonly loader = inject(TranslationLoader);

  private readonly preferences = this.store.selectSignal(AuthState.userPreferences);

  /** Only the latest request may switch the language, so a slow load cannot overwrite a newer choice. */
  private requested = 0;

  constructor() {
    // Before the first render: a stale cache from a session that ended without a logout must not show on the login page.
    if (!this.store.selectSnapshot(AuthState.userPreferences)) {
      this.translation.forget();
    }

    effect(() => {
      const preferences = this.preferences();
      const language = this.translation.asLanguage(preferences?.language);
      untracked(() => {
        if (!preferences) {
          this.requested++;
          this.translation.forget();
        } else {
          void this.follow(language);
        }
      });
    });
  }

  /** Loads the account's language, then switches, so the interface changes once. A failed load stays English. */
  private async follow(language: AppLanguage | undefined): Promise<void> {
    const request = ++this.requested;
    if (language && !(await this.loader.ensure(language))) {
      return;
    }

    if (request === this.requested) {
      this.translation.adoptSaved(language);
    }
  }

  /** Switches the language now and saves it with the preferences when signed in. */
  public async choose(language: AppLanguage): Promise<void> {
    const code = this.translation.asLanguage(language);
    if (!code || !(await this.loader.ensure(code))) {
      return;
    }

    this.requested++;
    this.translation.choose(code);

    const current = this.preferences();
    if (!current) {
      return;
    }

    this.userPreferencesService
      .updateUserPreferences({ ...current, language: code } as UserPreferences)
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
