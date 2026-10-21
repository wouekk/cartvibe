import { TranslatePipe } from "../../i18n/translate.pipe";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsComponent } from './settings.component';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { NgxsModule, Store } from '@ngxs/store';
import { Permission } from '../../open-api';
import { AuthState } from '../../store';
import { SetPermissions } from '../../store/auth.state.actions';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let store: Store;

  const tabNames = () => component.tabs().map((t) => t.name);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SettingsComponent],
      imports: [TranslatePipe, 
        ...HlmTooltipImports,
        NgxsModule.forRoot([AuthState]),
        ReactiveFormsModule,
        RouterModule,
      ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {},
        },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    store = TestBed.inject(Store);
    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('renders only the Theme tab when the user can read none of the others', () => {
    store.dispatch(new SetPermissions([], {}));
    fixture.detectChanges();

    expect(tabNames()).toEqual(['theme']);
  });

  it('gates the User Profile tab on app.account.read', () => {
    store.dispatch(new SetPermissions([Permission.AppAccountRead], {}));
    fixture.detectChanges();

    expect(tabNames()).toEqual(['user-profile', 'theme']);
  });

  it('gates the User Preferences tab on app.user-preferences.read', () => {
    store.dispatch(
      new SetPermissions([Permission.AppUserPreferencesRead], {})
    );
    fixture.detectChanges();

    expect(tabNames()).toEqual(['user-preferences', 'theme']);
  });

  it('renders the tabs in order when all read permissions are present', () => {
    store.dispatch(
      new SetPermissions(
        [
          Permission.AppAccountRead,
          Permission.AppUserPreferencesRead,
          Permission.AppApiKeysRead,
        ],
        {}
      )
    );
    fixture.detectChanges();

    expect(tabNames()).toEqual([
      'user-profile',
      'user-preferences',
      'theme',
      'api-keys',
    ]);
  });

  it('hides the API Keys tab without app.api-keys.read', () => {
    store.dispatch(
      new SetPermissions(
        [Permission.AppAccountRead, Permission.AppUserPreferencesRead],
        {}
      )
    );
    fixture.detectChanges();

    expect(tabNames()).not.toContain('api-keys');
  });
});
