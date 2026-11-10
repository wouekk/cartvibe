import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { ShoppingListEvent } from "../open-api";
import { defaultEventSourceFactory, EventSourceFactory } from "./shopping-list-stream.service";

/** The event the API sends on a group's stream when the AI has finished with one of its receipts. */
export const RECEIPT_READ_EVENT = "RECEIPT_READ";

// EventSource.CLOSED, spelled out: jsdom (the unit-test DOM) has no EventSource global to read it from.
const EVENT_SOURCE_CLOSED = 2;

/**
 * Tells a receipt page the moment the AI has read its receipt, instead of the page asking every half minute. It
 * listens on the household's live stream (the one the shopping lists use) for `RECEIPT_READ`, which carries the
 * receipt id and nothing else: the page then reads the lines through the receipt's own, permission-checked call.
 */
@Injectable({ providedIn: "root" })
export class ReceiptReadStreamService {
  private eventSourceFactory: EventSourceFactory = defaultEventSourceFactory;

  public setEventSourceFactory(factory: EventSourceFactory): void {
    this.eventSourceFactory = factory;
  }

  /**
   * Emits whenever the receipt may have been read: on its `RECEIPT_READ`, and each time the stream opens (the event
   * may have gone by just before). The stream is closed on unsubscribe. It errors when the stream cannot be used
   * (no access to the household's lists, a browser without EventSource), and the caller falls back to asking.
   */
  public watch(groupId: number, receiptId: number): Observable<void> {
    return new Observable<void>((subscriber) => {
      let eventSource: EventSource;
      try {
        eventSource = this.eventSourceFactory(`/api/shopping-list/group/${groupId}/stream`);
      } catch (error) {
        subscriber.error(error);
        return undefined;
      }

      eventSource.addEventListener("open", () => subscriber.next());

      eventSource.addEventListener(RECEIPT_READ_EVENT, (message) => {
        try {
          const event = JSON.parse((message as MessageEvent).data) as ShoppingListEvent;
          if (event.receiptId === receiptId) {
            subscriber.next();
          }
        } catch {
          // A malformed frame is skipped.
        }
      });

      eventSource.addEventListener("error", () => {
        // CONNECTING means the browser is reconnecting by itself; CLOSED means it gave up (an HTTP error such as 403).
        if (eventSource.readyState === EVENT_SOURCE_CLOSED) {
          subscriber.error(new Error("The receipt stream is closed"));
        }
      });

      return () => eventSource.close();
    });
  }
}
