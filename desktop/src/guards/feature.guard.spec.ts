import { TestBed } from '@angular/core/testing';
import { FeatureGuard } from './feature.guard';

describe('FeatureGuard', () => {
  let guard: FeatureGuard;

  beforeEach(() => {
        guard = TestBed.inject(FeatureGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });
});
