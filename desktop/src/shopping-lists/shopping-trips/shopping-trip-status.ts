import { ShoppingTripView } from "../../open-api";
import { marker } from "../../i18n/marker";

/** Unplanned products named on a trip before the rest are summed up as "and N more". */
export const MAX_NAMED_UNPLANNED_PRODUCTS = 4;

export interface ShoppingTripStatus {
  /**
   * waiting: still being worked on; planned: nothing was off the list; unplanned: something was;
   * failed: given up, a person can try again.
   */
  kind: "waiting" | "planned" | "unplanned" | "failed";
  text: string;
}

/**
 * What a trip's state means to the person shopping. Statuses are plain strings on the API, so one
 * this build does not know reads as still waiting.
 */
export function describeShoppingTrip(trip: ShoppingTripView): ShoppingTripStatus {
  if (trip.status === "FAILED") {
    return { kind: "failed", text: trip.lastError || "The receipt could not be compared with the list." };
  }

  if (trip.waitingForPhoto) {
    return trip.status === "UNAVAILABLE"
      ? { kind: "waiting", text: marker("Photo saved. It will be read as soon as the AI is available.") }
      : { kind: "waiting", text: marker("Reading the photo…") };
  }

  if (trip.status === "DONE") {
    if (trip.unplannedProducts.length === 0) {
      return { kind: "planned", text: marker("Everything bought was on the list.") };
    }
    return { kind: "unplanned", text: `not on the list: ${nameUnplannedProducts(trip.unplannedProducts)}` };
  }

  if (trip.status === "UNAVAILABLE") {
    return { kind: "waiting", text: marker("Waiting for the AI. Counted as planned until then.") };
  }

  return { kind: "waiting", text: marker("Comparing with the list…") };
}

export function nameUnplannedProducts(names: string[]): string {
  if (names.length <= MAX_NAMED_UNPLANNED_PRODUCTS) {
    return names.join(", ");
  }
  const rest = names.length - MAX_NAMED_UNPLANNED_PRODUCTS;
  return `${names.slice(0, MAX_NAMED_UNPLANNED_PRODUCTS).join(", ")} and ${rest} more`;
}
