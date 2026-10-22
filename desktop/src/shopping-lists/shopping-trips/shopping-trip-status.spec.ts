import { ShoppingTripView } from "../../open-api";
import { describeShoppingTrip, nameUnplannedProducts } from "./shopping-trip-status";

function trip(overrides: Partial<ShoppingTripView>): ShoppingTripView {
  return {
    id: 1,
    shoppingListId: 1,
    createdAt: "2026-10-20T10:00:00Z",
    status: "PENDING",
    lastError: "",
    waitingForPhoto: false,
    plannedItemCount: 3,
    productCount: 0,
    unplannedProducts: [],
    ...overrides,
  };
}

describe("describeShoppingTrip", () => {
  it("names what was bought off the list", () => {
    const status = describeShoppingTrip(
      trip({ status: "DONE", productCount: 5, unplannedAmount: "4.98", unplannedProducts: ["Crisps", "Chocolate"] })
    );
    expect(status.kind).toBe("unplanned");
    expect(status.text).toBe("not on the list: {names}");
    expect(status.params).toEqual({ names: "Crisps, Chocolate" });
  });

  it("says when everything was planned", () => {
    expect(describeShoppingTrip(trip({ status: "DONE", unplannedAmount: "0" })).kind).toBe("planned");
  });

  it("tells a waiting photo from a photo waiting for the AI", () => {
    expect(describeShoppingTrip(trip({ waitingForPhoto: true })).text).toBe("Reading the photo…");
    expect(describeShoppingTrip(trip({ waitingForPhoto: true, status: "UNAVAILABLE" })).text).toContain(
      "as soon as the AI is available"
    );
  });

  it("shows why a trip failed", () => {
    const status = describeShoppingTrip(trip({ status: "FAILED", lastError: "The photo is no longer there" }));
    expect(status).toEqual({ kind: "failed", text: "The photo is no longer there" });
  });

  it("reads a status it does not know as still waiting", () => {
    expect(describeShoppingTrip(trip({ status: "SOMETHING_NEW" })).kind).toBe("waiting");
  });
});

describe("nameUnplannedProducts", () => {
  it("sums up a long list", () => {
    expect(nameUnplannedProducts(["A", "B", "C", "D", "E", "F"])).toBe("A, B, C, D and 2 more");
  });
});
