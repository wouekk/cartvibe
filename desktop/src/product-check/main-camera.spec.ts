import { pickMainCameraId } from "./main-camera";

const camera = (deviceId: string, label: string, kind: MediaDeviceKind = "videoinput") => ({ deviceId, label, kind }) as MediaDeviceInfo;

describe("pickMainCameraId", () => {
  it("picks the plain back camera over the virtual and extra lenses of an iPhone Pro", () => {
    const devices = [
      camera("front", "Front Camera"),
      camera("triple", "Back Triple Camera"),
      camera("dual", "Back Dual Wide Camera"),
      camera("ultra", "Back Ultra Wide Camera"),
      camera("tele", "Back Telephoto Camera"),
      camera("main", "Back Camera"),
    ];

    expect(pickMainCameraId(devices)).toBe("main");
  });

  it("picks the first back camera of an Android phone, which is its main lens", () => {
    const devices = [camera("front", "camera2 1, facing front"), camera("main", "camera2 0, facing back"), camera("ultra", "camera2 2, facing back")];

    expect(pickMainCameraId(devices)).toBe("main");
  });

  it("returns null when the labels are not known yet or no back lens is plain", () => {
    expect(pickMainCameraId([camera("a", ""), camera("b", "")])).toBeNull();
    expect(pickMainCameraId([camera("triple", "Back Triple Camera"), camera("front", "Front Camera")])).toBeNull();
    expect(pickMainCameraId([camera("mic", "Back Microphone", "audioinput")])).toBeNull();
    expect(pickMainCameraId([])).toBeNull();
  });
});
