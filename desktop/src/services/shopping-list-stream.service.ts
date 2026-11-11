import { DOCUMENT } from "@angular/common";
import { Inject, Injectable, OnDestroy, signal, inject } from "@angular/core";
import { ShoppingListEvent } from "../open-api";
import { ShoppingListStore } from "../store/shopping-list.store";
import { ShoppingListEventType } from "../store/shopping-list.store";

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

/** The API's heartbeat event (every 25 seconds, no data). */
const HEARTBEAT_EVENT = "PING";

/** Two heartbeats and some slack: an open stream that says nothing for this long is taken for lost. */
const SILENCE_LIMIT_MS = 70000;

// EventSource.OPEN and CLOSED, spelled out: jsdom (the unit-test DOM) has no EventSource global to read them from.
const EVENT_SOURCE_OPEN = 1;
const EVENT_SOURCE_CLOSED = 2;

/**
 * What the page may say about the live connection: "idle" (no group is being followed), "connecting" (the first
 * attempt), "live", or "reconnecting" (it was lost, or never came up, and is being tried again).
 */
export type ShoppingListStreamStatus = "idle" | "connecting" | "live" | "reconnecting";

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
  private readonly shoppingListStore = inject(ShoppingListStore);

  /** Whether changes made elsewhere arrive right now. The page shows it; the sync service sends on "live". */
  public readonly status = signal<ShoppingListStreamStatus>("idle");

  private eventSource?: EventSource;

  private groupId?: number;

  private hasOpened = false;

  private reconnectTimer?: ReturnType<typeof setTimeout>;

  private silenceTimer?: ReturnType<typeof setTimeout>;

  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;

  private eventSourceFactory: EventSourceFactory = defaultEventSourceFactory;

  /** The tab came back, or the browser says the connection did: catch up, and reopen a stream that gave up. */
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
    @Inject(DOCUMENT) private document: Document
  ) {}

  public setEventSourceFactory(factory: EventSourceFactory): void {
    this.eventSourceFactory = factory;
  }

  public connect(groupId: number): void {
    this.disconnect();

    this.groupId = groupId;
    this.document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.document.defaultView?.addEventListener("online", this.onVisibilityChange);
    this.status.set("connecting");
    this.open();
  }

  public disconnect(): void {
    this.document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.document.defaultView?.removeEventListener("online", this.onVisibilityChange);
    this.status.set("idle");
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

    // A source that is open the moment it is made (the demo's stand-in, which never fires "open") is live.
    if (eventSource.readyState === EVENT_SOURCE_OPEN) {
      this.status.set("live");
    }

    eventSource.addEventListener("open", () => {
      this.status.set("live");
      this.heard();
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      // The first open follows the page's own load; every later one means events may have been
      // missed while disconnected.
      if (this.hasOpened) {
        this.refetch();
      }
      this.hasOpened = true;
    });

    eventSource.addEventListener("error", () => {
      this.status.set("reconnecting");
      if (eventSource.readyState === EVENT_SOURCE_CLOSED) {
        this.scheduleReconnect();
      }
    });

    eventSource.addEventListener(HEARTBEAT_EVENT, () => this.heard());

    for (const type of Object.values(ShoppingListEventType)) {
      eventSource.addEventListener(type, (message) => this.applyMessage(message as MessageEvent));
    }
  }

  /**
   * Something arrived, so the stream is alive: the silence clock starts over. A phone that walks out of signal
   * leaves the stream "open" until the system notices, which can take minutes; the server's heartbeat is how the
   * page knows sooner. After `SILENCE_LIMIT_MS` without a word the stream counts as lost and is opened again.
   */
  private heard(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      this.status.set("reconnecting");
      this.open();
    }, SILENCE_LIMIT_MS);
  }

  private applyMessage(message: MessageEvent): void {
    this.heard();
    try {
      const event = JSON.parse(message.data) as ShoppingListEvent;
      this.shoppingListStore.applyEvent(event);
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
      this.shoppingListStore.load(this.groupId);
    }
  }

  private closeEventSource(): void {
    this.clearSilenceTimer();
    this.eventSource?.close();
    this.eventSource = undefined;
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer !== undefined) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = undefined;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}
