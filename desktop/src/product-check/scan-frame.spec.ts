import { centreInFrame, frameInVideo } from "./scan-frame";

describe("scan frame", () => {
  it("maps the frame straight onto a video that has the box's own shape", () => {
    const frame = frameInVideo({ clientWidth: 400, clientHeight: 300, videoWidth: 1600, videoHeight: 1200 });

    expect(frame?.left).toBeCloseTo(128);
    expect(frame?.top).toBeCloseTo(330);
    expect(frame?.right).toBeCloseTo(1472);
    expect(frame?.bottom).toBeCloseTo(870);
  });

  it("takes the crop of a wider video into account", () => {
    // A 16:9 video in a 4:3 box is scaled to the box's height (a third), so 66.7 box pixels are cropped from each side.
    const frame = frameInVideo({ clientWidth: 400, clientHeight: 300, videoWidth: 1600, videoHeight: 900 });

    expect(frame?.left).toBeCloseTo(296);
    expect(frame?.right).toBeCloseTo(1304);
    expect(frame?.top).toBeCloseTo(247.5);
    expect(frame?.bottom).toBeCloseTo(652.5);
  });

  it("has no frame until the video has a size", () => {
    expect(frameInVideo({ clientWidth: 400, clientHeight: 300, videoWidth: 0, videoHeight: 0 })).toBeNull();
  });

  it("counts a barcode whose middle is between the brackets", () => {
    const frame = { left: 100, top: 100, right: 500, bottom: 300 };

    expect(centreInFrame(frame, [{ x: 200, y: 200 }, { x: 400, y: 200 }])).toBe(true);
    expect(centreInFrame(frame, [{ x: 20, y: 200 }, { x: 80, y: 200 }])).toBe(false);
    expect(centreInFrame(frame, [{ x: 200, y: 20 }, { x: 400, y: 40 }])).toBe(false);
  });

  it("counts everything while there is no frame or no position", () => {
    expect(centreInFrame(null, [{ x: 1, y: 1 }])).toBe(true);
    expect(centreInFrame({ left: 100, top: 100, right: 500, bottom: 300 }, [])).toBe(true);
  });
});
