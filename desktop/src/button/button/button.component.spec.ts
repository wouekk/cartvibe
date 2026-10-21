import { TranslatePipe } from "../../i18n/translate.pipe";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ButtonComponent } from './button.component';
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { RouterTestingModule } from '@angular/router/testing';

describe('ButtonComponent', () => {
  let component: ButtonComponent;
  let fixture: ComponentFixture<ButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ButtonComponent],
      imports: [TranslatePipe, 
        HlmButton,
        ...HlmTooltipImports,
        RouterTestingModule,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('hides the badge for an empty count, but not for a real one', () => {
    for (const empty of [undefined, null, '', 0, '0']) {
      fixture.componentRef.setInput('matBadgeContent', empty);
      expect(component.matBadgeHidden()).toBe(true);
    }

    for (const shown of [1, 12, 'New']) {
      fixture.componentRef.setInput('matBadgeContent', shown);
      expect(component.matBadgeHidden()).toBe(false);
    }
  });
});
