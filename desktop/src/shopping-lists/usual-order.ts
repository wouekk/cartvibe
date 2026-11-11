import { ShoppingList } from "../open-api";

/**
 * The household's usual order in the shop, learned from how its lists were crossed off before.
 *
 * Nobody tells the app where things are. But the order in which a list gets crossed off is the order of a walk
 * through the shop, so every finished trip is a lesson: vegetables early, milk in the middle, bread near the
 * tills. Each item gets a place between 0 (crossed off first) and 1 (crossed off last), averaged over the trips
 * it was bought on, and Shop mode sorts what is left to buy by it.
 *
 * One order for the household, whatever the shop (the owner's choice, 2026-11): a list does not know its shop
 * while it is being shopped from, and asking for it is a tap nobody wants in the aisle.
 *
 * Everything here is worked out on the device from the lists it already holds, so it also works with no signal.
 */

/** Ticks further apart than this belong to two trips: nobody shops for three hours without crossing anything off. */
export const TRIP_GAP_MS = 3 * 60 * 60 * 1000;

/** A trip teaches an order only when at least this many items were crossed off one by one. */
const MIN_TRIP_ITEMS = 3;

/** What two spellings of one item share: "Milk", " milk " and "MILK" are the same thing to buy. */
export function usualOrderKey(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export interface TripUnderWay {
  /** The list being shopped from. */
  listId: number;
  /** Ticks on that list from this moment on (milliseconds since the epoch) are the trip under way, not history. */
  since: number;
}

interface Tick {
  key: string;
  at: number;
}

/**
 * Where each item is usually crossed off: its name's key, and a place from 0 (first) to 1 (last).
 *
 * What counts as a lesson:
 * - ticks close in time are one trip; a gap of three hours starts another (a list that is reused keeps the ticks
 *   of several days);
 * - ticks that share their moment with another were not made by a finger in an aisle ("Mark as complete" crosses
 *   off the rest at once) and say nothing about order;
 * - a trip needs three items crossed off one by one;
 * - the trip under way is left out, or every tick would reshuffle what is still to buy.
 */
export function learnUsualOrder(lists: ShoppingList[], underWay?: TripUnderWay): Map<string, number> {
  const places = new Map<string, { sum: number; count: number }>();

  for (const list of lists) {
    const ticks: Tick[] = (list.items ?? [])
      .filter((item) => item.isChecked && !!item.checkedAt)
      .map((item) => ({ key: usualOrderKey(item.name), at: Date.parse(item.checkedAt as string) }))
      .filter((tick) => tick.key !== "" && !Number.isNaN(tick.at))
      .filter((tick) => !(underWay && list.id === underWay.listId && tick.at >= underWay.since))
      .sort((a, b) => a.at - b.at);

    for (const trip of splitIntoTrips(ticks)) {
      const oneByOne = withoutSharedMoments(trip);
      if (oneByOne.length < MIN_TRIP_ITEMS) {
        continue;
      }
      oneByOne.forEach((tick, index) => {
        const place = places.get(tick.key) ?? { sum: 0, count: 0 };
        place.sum += index / (oneByOne.length - 1);
        place.count += 1;
        places.set(tick.key, place);
      });
    }
  }

  return new Map([...places].map(([key, place]) => [key, place.sum / place.count]));
}

function splitIntoTrips(ticks: Tick[]): Tick[][] {
  const trips: Tick[][] = [];
  for (const tick of ticks) {
    const current = trips[trips.length - 1];
    if (current && tick.at - current[current.length - 1].at <= TRIP_GAP_MS) {
      current.push(tick);
    } else {
      trips.push([tick]);
    }
  }
  return trips;
}

function withoutSharedMoments(trip: Tick[]): Tick[] {
  const perMoment = new Map<number, number>();
  for (const tick of trip) {
    perMoment.set(tick.at, (perMoment.get(tick.at) ?? 0) + 1);
  }
  return trip.filter((tick) => perMoment.get(tick.at) === 1);
}

/**
 * The items in the household's usual order: those with a known place first, by it; the rest after them, in the
 * order they came in (an item never bought before has no place yet).
 */
export function sortByUsualOrder<T extends { name: string }>(items: T[], order: Map<string, number>): T[] {
  return items
    .map((item, index) => ({ item, index, place: order.get(usualOrderKey(item.name)) }))
    .sort((a, b) => {
      if (a.place === undefined || b.place === undefined) {
        return a.place === b.place ? a.index - b.index : a.place === undefined ? 1 : -1;
      }
      return a.place - b.place || a.index - b.index;
    })
    .map((entry) => entry.item);
}

/** True when at least one of the items has a place in the usual order, so sorting by it changes something. */
export function anyInUsualOrder(items: { name: string }[], order: Map<string, number>): boolean {
  return items.some((item) => order.has(usualOrderKey(item.name)));
}
