import { shakeInvalid } from "./shake";

describe("shakeInvalid", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const field = (): HTMLElement => {
    const host = document.createElement("div");
    host.innerHTML = '<input type="text" />';
    document.body.appendChild(host);
    return host;
  };

  it("shakes and highlights the field, focuses its input, and clears the highlight after a moment", () => {
    const host = field();

    shakeInvalid(host);

    expect(host.classList.contains("cv-shake")).toBe(true);
    expect(host.classList.contains("cv-field-error")).toBe(true);
    expect(document.activeElement).toBe(host.querySelector("input"));

    jest.advanceTimersByTime(1700);

    expect(host.classList.contains("cv-shake")).toBe(false);
    expect(host.classList.contains("cv-field-error")).toBe(false);
  });

  it("can shake again straight away, and does nothing for a missing element", () => {
    const host = field();

    shakeInvalid(host);
    shakeInvalid(host);
    expect(host.classList.contains("cv-shake")).toBe(true);

    expect(() => shakeInvalid(null)).not.toThrow();
    expect(() => shakeInvalid(undefined)).not.toThrow();
  });
});
