import { isPlatformServer } from '@angular/common';
import {
	afterNextRender,
	computed,
	DestroyRef,
	DOCUMENT,
	inject,
	Injectable,
	PLATFORM_ID,
	REQUEST,
	type Signal,
	signal,
} from '@angular/core';
import { injectHlmSidebarConfig } from './hlm-sidebar.token';

export type SidebarVariant = 'sidebar' | 'floating' | 'inset';

@Injectable({ providedIn: 'root' })
export class HlmSidebarService {
	private readonly _platformId = inject(PLATFORM_ID);
	private readonly _request = inject(REQUEST, { optional: true });
	private readonly _config = injectHlmSidebarConfig();
	private readonly _document = inject(DOCUMENT);
	private readonly _window = this._document.defaultView;
	private readonly _open = signal<boolean>(this._config.defaultOpen);
	private readonly _openMobile = signal<boolean>(false);
	private readonly _isMobile = signal<boolean>(false);
	private readonly _variant = signal<SidebarVariant>('sidebar');
	private _mediaQuery: MediaQueryList | null = null;

	public readonly open: Signal<boolean> = this._open.asReadonly();
	public readonly openMobile: Signal<boolean> = this._openMobile.asReadonly();
	public readonly isMobile: Signal<boolean> = this._isMobile.asReadonly();
	public readonly variant: Signal<SidebarVariant> = this._variant.asReadonly();

	public readonly state = computed<'expanded' | 'collapsed'>(() => (this._open() ? 'expanded' : 'collapsed'));

	constructor() {
		const destroyRef = inject(DestroyRef);
		this.restoreState();

		afterNextRender(() => {
			if (!this._window || typeof this._window.matchMedia !== 'function') return;

			// Initialize MediaQueryList
			this._mediaQuery = this._window.matchMedia(`(max-width: ${this._config.mobileBreakpoint})`);
			this._isMobile.set(this._mediaQuery.matches);

			// Add media query listener
			const mediaQueryHandler = (e: MediaQueryListEvent) => {
				this._isMobile.set(e.matches);
				// If switching from mobile to desktop, close mobile sidebar
				if (!e.matches) this._openMobile.set(false);
			};
			this._mediaQuery.addEventListener('change', mediaQueryHandler);

			// Add keyboard shortcut listener
			const keydownHandler = (event: KeyboardEvent) => {
				if (event.key === this._config.sidebarKeyboardShortcut && (event.ctrlKey || event.metaKey)) {
					event.preventDefault();
					this.toggleSidebar();
				}
			};
			this._window.addEventListener('keydown', keydownHandler);

			// Add resize listener with debounce
			let resizeTimeout: number;
			const resizeHandler = () => {
				if (!this._window) return;

				if (resizeTimeout) this._window.clearTimeout(resizeTimeout);
				resizeTimeout = this._window.setTimeout(() => {
					if (this._mediaQuery) this._isMobile.set(this._mediaQuery.matches);
				}, 100);
			};
			this._window.addEventListener('resize', resizeHandler);

			// Cleanup listeners on destroy
			destroyRef.onDestroy(() => {
				if (!this._window) return;

				if (this._mediaQuery) this._mediaQuery.removeEventListener('change', mediaQueryHandler);
				this._window.removeEventListener('keydown', keydownHandler);
				this._window.removeEventListener('resize', resizeHandler);
				if (resizeTimeout) this._window.clearTimeout(resizeTimeout);
			});
		});
	}

	public setOpen(open: boolean): void {
		this._open.set(open);
		this.saveState(open);
	}

	public setOpenMobile(open: boolean): void {
		if (this._isMobile()) {
			this._openMobile.set(open);
		}
	}

	public setVariant(variant: SidebarVariant): void {
		this._variant.set(variant);
	}

	public toggleSidebar(): void {
		if (this._isMobile()) {
			this._openMobile.update((value) => !value);
		} else {
			this.setOpen(!this._open());
		}
	}

	// CartVibe: the open state lives in localStorage, never in a cookie (the project site and the demo set no cookies).
	// Patched in by tools/spartan-add.cjs.
	private static readonly _storageKey = 'cartvibe.sidebarOpen';

	private saveState(open: boolean): void {
		try {
			this._window?.localStorage.setItem(HlmSidebarService._storageKey, String(open));
		} catch {
			// Storage blocked: the sidebar still toggles, it is just not remembered.
		}
	}

	private restoreState(): void {
		let stored: string | null = null;
		try {
			stored = this._window?.localStorage.getItem(HlmSidebarService._storageKey) ?? null;
		} catch {
			return;
		}
		if (stored !== null) {
			this._open.set(stored === 'true');
			return;
		}
		// A sidebar_state cookie from an older version: keep its choice once, then delete the cookie.
		if (isPlatformServer(this._platformId)) return;
		this.restoreStateFromCookie();
		if (this._document.cookie.includes(`${this._config.sidebarCookieName}=`)) {
			this.saveState(this._open());
			this._document.cookie = `${this._config.sidebarCookieName}=; path=/; max-age=0`;
		}
	}

	private restoreStateFromCookie(): void {
		const cookieString = isPlatformServer(this._platformId)
			? this._request?.headers.get('cookie')
			: this._document.cookie;

		if (!cookieString) return;

		const prefix = `${this._config.sidebarCookieName}=`;
		const cookieValue = cookieString
			.split(';')
			.map((c) => c.trim())
			.find((c) => c.startsWith(prefix))
			?.slice(prefix.length);

		if (cookieValue !== undefined) {
			this._open.set(cookieValue === 'true');
		}
	}
}
