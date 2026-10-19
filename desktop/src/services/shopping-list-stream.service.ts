import { DOCUMENT } from "@angular/common";
import { Inject, Injectable, OnDestroy } from "@angular/core";
import { Store } from "@ngxs/store";
import { ShoppingListEvent } from "../open-api";
import { ApplyShoppingListEvent, LoadShoppingLists } from "../store/shopping-list.state.actions";
import { ShoppingListEventType } from "../store/shopping-list.state";

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

// EventSource.CLOSED, spelled out: jsdom (the unit-test DOM) has no EventSource global to read it from.
const EVENT_SOURCE_CLOSED = 2;

/** Factory seam so specs can substitute a fake EventSource. */
export type EventSourceFactory = (url: string) => EventSource;

export const defaultEventSourceFactory: EventSourceFactory = (url) => new EventSource(url);

/**
 * Keeps one live SSE connection to a group's shopping list stream and applies its events to the
 * store. The server sends no replay, so whatever was missed while disconnected is recovered by
 * refetching: on every REconnect, and whenever the tab becomes visible again — the fallback for
 * phones that drop the stream on a cellular network.
 *
 * EventSource reconnects on its own after a clean server close (the API ends each stream after 15
 * minutes) and after a network blip. It gives up for good only on an HTTP error such as a 403, and
 * that is the one case this service schedules its own reconnect for, with backoff.
 */
@Injectable({
  providedIn: "root",
})
export class ShoppingListStreamService implements OnDestroy {
  private eventSource?: EventSource;

  private groupId?: number;

  private hasOpened = false;

  private reconnectTimer?: ReturnType<typeof setTimeout>;

  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;

  private eventSourceFactory: EventSourceFactory = defaultEventSourceFactory;

  private readonly onVisibilityChange = () => {
    if (this.document.visibilityState !== "visible" || this.groupId === undefined) {
      return;
    }

    this.refetch();
    if (!this.eventSource || this.eventSource.readyState === EVENT_SOURCE_CLOSED) {
      this.open();
    }
  };

  constructor(
    private store: Store,
    @Inject(DOCUMENT) private document: Document
  ) {}

  public setEventSourceFactory(factory: EventSourceFactory): void {
    this.eventSourceFactory = factory;
  }

  public connect(groupId: number): void {
    this.disconnect();

    this.groupId = groupId;
    this.document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.open();
  }

  public disconnect(): void {
    this.document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.clearReconnectTimer();
    this.closeEventSource();
    this.groupId = undefined;
    this.hasOpened = false;
    this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  }

  public ngOnDestroy(): void {
    this.disconnect();
  }

  private open(): void {
    if (this.groupId === undefined) {
      return;
    }

    this.clearReconnectTimer();
    this.closeEventSource();

    const eventSource = this.eventSourceFactory(`/api/shopping-list/group/${this.groupId}/stream`);
    this.eventSource = eventSource;

    eventSource.addEventListener("open", () => {
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      // The first open follows the page's own load; every later one means events may have been
      // missed while disconnected.
      if (this.hasOpened) {
        this.refetch();
      }
      this.hasOpened = true;
    });

    eventSource.addEventListener("error", () => {
      if (eventSource.readyState === EVENT_SOURCE_CLOSED) {
        this.scheduleReconnect();
      }
    });

    for (const type of Object.values(ShoppingListEventType)) {
      eventSource.addEventListener(type, (message) => this.applyMessage(message as MessageEvent));
    }
  }

  private applyMessage(message: MessageEvent): void {
    try {
      const event = JSON.parse(message.data) as ShoppingListEvent;
      this.store.dispatch(new ApplyShoppingListEvent(event));
    } catch {
      // A malformed frame is skipped; the next refetch reconciles the list.
    }
  }

  private scheduleReconnect(): void {
    this.closeEventSource();
    this.clearReconnectTimer();

    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private refetch(): void {
    if (this.groupId !== undefined) {
      this.store.dispatch(new LoadShoppingLists(this.groupId));
    }
  }

  private closeEventSource(): void {
    this.eventSource?.close();
    this.eventSource = undefined;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}
