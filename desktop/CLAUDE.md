# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm start` - Start development server with proxy configuration (serves on localhost:4200, proxies /api to localhost:8081)
- `npm run build` - Build production application
- `npm run watch` - Build in watch mode for development
- `npm test` - Run unit tests with coverage
- `npm test:ci` - Run tests in CI mode with ChromeHeadless

### Build Configuration
- Production builds go to `dist/receipt-wrangler/`
- Development server uses proxy configuration in `proxy.conf.json` to route API calls to backend
- Angular CLI configuration in `angular.json`

## Code Architecture

### Application Structure
Receipt Wrangler Desktop is an Angular 19 application with modular architecture using:

- **State Management**: NGXS store with persistent storage for application state
- **API Layer**: Auto-generated OpenAPI client in `src/open-api/` (do not manually edit these files)
- **Component Architecture**: Feature modules with lazy-loaded routing
- **UI Framework**: Angular Material + Bootstrap 5 + custom shared components

### Key Architectural Patterns

#### Module Organization
- Feature modules (receipts, dashboard, groups, etc.) with their own routing
- Shared UI components in `src/shared-ui/` for reusable elements
- Lazy-loaded modules for performance optimization
- Centralized store management with NGXS states

#### State Management (NGXS)
- All application state managed through NGXS store
- State persistence configured for key data (auth, user preferences, table states)
- Individual state files for each feature (receipt-table.state.ts, group.state.ts, etc.)
- Actions and state updates follow NGXS patterns

#### Component Structure
- Feature components organized by domain (receipts/, dashboard/, groups/)
- Shared UI components provide consistent design patterns
- Form components use reactive forms with custom validation
- Table components use base table service pattern for pagination and filtering

### Key Directories

#### Core Application
- `src/app/` - Main application module and routing
- `src/store/` - NGXS state management (18+ state files)
- `src/services/` - Application services and business logic
- `src/guards/` - Route guards for authentication and authorization

#### Features
- `src/receipts/` - Receipt management (forms, tables, processing)
- `src/dashboard/` - Customizable dashboard widgets and views
- `src/groups/` - Group management and member administration
- `src/categories/` and `src/tags/` - Receipt organization features
- `src/auth/` - Authentication and user management

#### Shared Infrastructure
- `src/shared-ui/` - 30+ reusable UI components (buttons, forms, tables, dialogs)
- `src/pipes/` - Custom Angular pipes for data transformation
- `src/utils/` - Utility functions and helpers
- `src/open-api/` - Generated API client (auto-generated, do not edit)

### Testing Strategy
- Unit tests use Jasmine/Karma framework
- Code coverage reporting with minimum thresholds
- Tests exclude auto-generated API code (`src/open-api/`)
- CI tests run in headless Chrome

### Development Environment
- Angular CLI 21 with TypeScript 5.9
- Bootstrap 5 + Angular Material for UI components
- NGXS for state management with Redux DevTools integration
- Strict TypeScript configuration with comprehensive compiler options

### API Integration
- Backend API proxied through development server
- OpenAPI client generated from backend specification
- API base path configurable through environment
- HTTP interceptors handle authentication and error responses

### Code Conventions
- SCSS for styling with component-scoped styles
- TypeScript strict mode enabled
- Angular style guide followed for component organization
- Lazy loading for feature modules to optimize bundle size

## Signals & Zoneless Change Detection

This application uses Angular's signal-based reactivity model with zoneless change detection (`provideZonelessChangeDetection()`). All new code MUST follow these patterns.

### Signal Primitives — Decision Guide

| Need | Use | NOT |
|------|-----|-----|
| Mutable state | `signal()` | Plain class properties |
| Read-only derived value | `computed()` | `effect()` that copies signals |
| Writable derived state (resets on dependency change, can be overridden) | `linkedSignal()` | `effect()` that sets a signal |
| Sync signal state to imperative/external APIs (DOM, localStorage, canvas, analytics) | `effect()` | — |
| DOM measurement/manipulation after render | `afterRenderEffect()` | `effect()` + `setTimeout` |
| Async data fetching | `resource()` | Manual subscribe + signal set |
| Observable → Signal bridge | `toSignal()` | `subscribe()` + signal set |
| Signal → Observable bridge | `toObservable()` | — |

### signal() — Writable State
- Use for mutable, source-of-truth state in components or services.
- Prefer `signal()` over plain class properties — signals automatically notify Angular's change detection.
- Provide a custom equality function when needed to avoid unnecessary updates.

```typescript
count = signal(0);
items = signal<Item[]>([]);
```

### computed() — Derived State
- Use whenever a value is derived from other signals. Always prefer over `effect()` for derivations.
- Computed signals are lazy (not evaluated until read) and cached (not recalculated until dependencies change).
- Safe to perform expensive operations (e.g., filtering arrays) inside computed.

```typescript
fullName = computed(() => `${this.firstName()} ${this.lastName()}`);
filteredItems = computed(() => this.items().filter(i => i.active));
```

### linkedSignal() — Writable Derived State
- Use when a value normally follows a computation but can be manually overridden.
- Resets to the computed value when dependencies change, but allows `set()`/`update()`.
- Perfect for selections that reset when options change.

```typescript
// Resets to first option when options change, but user can select manually
selectedOption = linkedSignal(() => this.options()[0]);
```

### effect() — Side Effects (Last Resort)
- **NEVER** use `effect()` to derive state or copy signal values between signals. Use `computed()` or `linkedSignal()` instead.
- **ONLY** use for syncing to non-reactive/imperative APIs: logging, localStorage, canvas rendering, third-party UI libraries.
- Effects run during change detection. They do not need `allowSignalWrites` (removed in Angular 19).
- Use `afterRenderEffect()` instead when you need to read DOM properties (offsetWidth, etc.) after rendering.

```typescript
// GOOD: Syncing to localStorage
effect(() => {
  localStorage.setItem('theme', this.theme());
});

// BAD: Deriving state — use computed() instead
effect(() => {
  this.fullName.set(`${this.firstName()} ${this.lastName()}`); // ❌ NEVER DO THIS
});
```

### Signal Inputs — input() and input.required()
- Use `input()` for optional inputs with defaults. Use `input.required()` for required inputs.
- Signal inputs are read-only (`InputSignal`). Template binding syntax `[prop]="value"` is unchanged.
- Use `computed()` to derive values from inputs. Use `effect()` only for imperative side effects triggered by input changes.
- Use `model()` for two-way binding (component modifies a value based on user interaction, e.g., custom form controls).

```typescript
// Required input — no undefined in type
mode = input.required<FormMode>();

// Optional input with default
disabled = input(false);

// Optional input without default
tooltip = input<string>();

// Two-way binding
value = model<string>('');

// Deriving from inputs — use computed, NOT effect
displayText = computed(() => this.mode() === FormMode.Edit ? 'Save' : 'Create');
```

**Replacing ngOnChanges:** Convert input-watching logic from `ngOnChanges` to `computed()` (for derived values) or `effect()` (for imperative side effects like loading data).

```typescript
// Before (ngOnChanges)
ngOnChanges(changes: SimpleChanges) {
  if (changes['groupId']) this.loadData();
}

// After (effect for imperative side effect)
constructor() {
  effect(() => {
    const id = this.groupId();
    if (id) this.loadData(id);
  });
}
```

### Signal Outputs — output()
- Use `output()` instead of `@Output() + EventEmitter`. Template syntax `(event)="handler($event)"` is unchanged.
- Use `outputFromObservable()` when the source is an Observable.

```typescript
clicked = output<MouseEvent>();
// Emit: this.clicked.emit(event);
```

### Signal Queries — viewChild() / viewChildren()
- Use `viewChild()` / `viewChildren()` instead of `@ViewChild` / `@ViewChildren`.
- Access via signal call: `this.paginator()` instead of `this.paginator`.
- Use `viewChild.required()` when the element is guaranteed to exist (not behind `@if`).

```typescript
paginator = viewChild.required(MatPaginator);
optionalEl = viewChild<ElementRef>('myEl');
items = viewChildren(ItemComponent);
```

### RxJS Interop
- **`toSignal(observable)`**: Converts Observable to Signal. Creates a subscription — call once and reuse the signal, never call repeatedly. Automatically unsubscribes on destroy.
  - Provide `initialValue` for Observables that don't emit synchronously.
  - Use `requireSync: true` for BehaviorSubject or other synchronous sources.
- **`toObservable(signal)`**: Converts Signal to Observable. Only emits the latest stabilized value.
- **`takeUntilDestroyed()`**: Replaces `@UntilDestroy()` / `untilDestroyed(this)`. Use in constructor or pass `DestroyRef`.
- **`outputFromObservable()`**: Declares an output from an Observable source.

```typescript
// NGXS selector → signal (preferred pattern)
groups = this.store.selectSignal(GroupState.groups);

// HTTP Observable → signal
data = toSignal(this.http.get<Data>('/api/data'), { initialValue: [] });

// Cleanup subscriptions
constructor() {
  this.someObservable$.pipe(
    takeUntilDestroyed(),
  ).subscribe(val => this.doSomething(val));
}
```

### NGXS State Access
- Use `store.selectSignal()` instead of `@Select` decorator for template-bound state. Returns a `Signal<T>`.
- `store.selectSnapshot()` remains valid for synchronous one-time reads in methods.
- Remove `| async` pipe from templates — use signal reads `()` instead.

```typescript
// Before
@Select(AuthState.isLoggedIn) isLoggedIn!: Observable<boolean>;
// Template: *ngIf="isLoggedIn | async"

// After
isLoggedIn = this.store.selectSignal(AuthState.isLoggedIn);
// Template: @if (isLoggedIn()) { ... }
```

### Zoneless Change Detection Rules
Angular no longer uses zone.js. Change detection is triggered ONLY by:
1. **Signal writes** — `signal.set()`, `signal.update()`, `computed()` recalculation
2. **`ChangeDetectorRef.markForCheck()`** — for non-signal reactive patterns (AsyncPipe calls this automatically)
3. **Template event bindings** — `(click)="handler()"` automatically triggers CD
4. **`ComponentRef.setInput()`** — programmatic input setting

**Key implications:**
- Plain property mutations (`this.foo = 'bar'`) in async callbacks (subscribe, setTimeout, Promise.then) will NOT trigger change detection. Always use signals for state that affects templates.
- `ChangeDetectorRef.detectChanges()` still works but is rarely needed — prefer signals.
- `setTimeout` still works for delays but won't auto-trigger CD. The callback must write to a signal if the template needs updating.
- All `@HostListener` handlers automatically trigger CD (same as template events).

### Testing with Zoneless
- Add `provideZonelessChangeDetection()` to `TestBed.configureTestingModule` providers.
- Prefer `await fixture.whenStable()` over `fixture.detectChanges()` for most realistic test behavior.
- Use `TestBed.flushEffects()` when testing effect-based logic.

## Testing Requirements

**All new code must have accompanying unit tests.**

Before considering any work complete:

1. Write unit tests for all new components, services, and pipes
2. Use Angular TestBed for component testing
3. Mock services and HTTP calls appropriately
4. Run the full test suite: `npm test`
5. Ensure all tests pass before submitting changes

Tests should cover:

- Component rendering and user interactions
- Component method inputs and outputs
- Service method behavior
- Form validation logic
- Error handling scenarios