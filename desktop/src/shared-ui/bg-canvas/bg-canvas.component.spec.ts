import { ComponentFixture, TestBed } from "@angular/core/testing";
import { BgCanvasComponent } from "./bg-canvas.component";

describe("BgCanvasComponent", () => {
  let fixture: ComponentFixture<BgCanvasComponent>;
  let reduceMotion: boolean;

  beforeEach(async () => {
    reduceMotion = false;
    // jsdom has no matchMedia, so it is defined here rather than spied on.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) =>
        ({
          get matches() {
            return query.includes("reduce") && reduceMotion;
          },
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    });
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    await TestBed.configureTestingModule({ imports: [BgCanvasComponent] }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "matchMedia");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(BgCanvasComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function scrollTo(y: number): void {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    window.dispatchEvent(new Event("scroll"));
  }

  it("is decoration only: hidden from assistive technology, with a glow and a grid", async () => {
    const el = await render();
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.querySelector(".glow")).not.toBeNull();
    expect(el.querySelector(".grid")).not.toBeNull();
  });

  it("glides the grid on scroll, wrapping inside one 48px cell", async () => {
    const el = await render();
    scrollTo(1000);
    const grid = el.querySelector(".grid") as HTMLElement;
    const offset = Number(/translate3d\(0(?:px)?, (-?[\d.]+)px/.exec(grid.style.transform)?.[1]);
    expect(offset).toBeLessThanOrEqual(0);
    expect(offset).toBeGreaterThan(-48);
    expect((el.querySelector(".glow") as HTMLElement).style.transform).toContain("translate3d");
  });

  it("keeps still under reduced motion", async () => {
    reduceMotion = true;
    const el = await render();
    scrollTo(1000);
    expect((el.querySelector(".grid") as HTMLElement).style.transform).toBe("");
    expect((el.querySelector(".glow") as HTMLElement).style.transform).toBe("");
  });

  it("stops listening once destroyed", async () => {
    await render();
    const remove = vi.spyOn(window, "removeEventListener");
    fixture.destroy();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
