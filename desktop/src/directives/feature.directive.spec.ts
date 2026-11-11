import { TemplateRef, ViewContainerRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FeatureDirective } from './feature.directive';

import type { Mocked } from "vitest";
describe('FeatureDirective', () => {
  let templateRef: Mocked<TemplateRef<any>>;
  let viewContainer: Mocked<ViewContainerRef>;

  beforeEach(() => {
    const templateSpy = { createEmbeddedView: vi.fn() };
    const viewContainerSpy = { createEmbeddedView: vi.fn(), clear: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: TemplateRef, useValue: templateSpy },
        { provide: ViewContainerRef, useValue: viewContainerSpy }
      ]
    });

    templateRef = TestBed.inject(TemplateRef) as Mocked<TemplateRef<any>>;
    viewContainer = TestBed.inject(ViewContainerRef) as Mocked<ViewContainerRef>;
  });

  it('should create an instance', () => {
    const directive = TestBed.runInInjectionContext(() => new FeatureDirective(templateRef, viewContainer));
    expect(directive).toBeTruthy();
  });
});
