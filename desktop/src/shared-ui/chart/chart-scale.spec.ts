import { chartFontSize, uiScale } from "./chart-scale";

describe("chart scale", () => {
  afterEach(() => {
    document.documentElement.style.fontSize = "";
  });

  it("is 1 at the browser's 16px root size", () => {
    document.documentElement.style.fontSize = "16px";

    expect(uiScale()).toBe(1);
    expect(chartFontSize(12)).toBe(12);
  });

  it("follows a larger root size, as on a wide screen", () => {
    document.documentElement.style.fontSize = "32px";

    expect(uiScale()).toBe(2);
    expect(chartFontSize(11)).toBe(22);
  });

  it("rounds to a tenth of a pixel", () => {
    document.documentElement.style.fontSize = "21.3333px";

    expect(chartFontSize(12)).toBe(16);
  });
});
