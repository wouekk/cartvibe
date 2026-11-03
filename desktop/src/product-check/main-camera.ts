const BACK = /back|rear|environment/i;
const FRONT = /front|user|selfie/i;
/** The lenses that are not the main one, and the "triple" / "dual" virtual cameras that hop between lenses on their own. */
const OTHER_LENS = /ultra|wide|tele|triple|dual|macro|depth|zoom/i;

/**
 * The device id of the phone's main back lens, or null when the labels do not tell (they are empty until the camera
 * permission is given). `facingMode: "environment"` alone lets the browser pick: on an iPhone Pro it is the virtual
 * triple camera, which switches between the ultra-wide, wide and telephoto lenses while it focuses, so a barcode held
 * still keeps jumping in the frame. A single physical lens does not.
 */
export function pickMainCameraId(devices: readonly MediaDeviceInfo[]): string | null {
  const back = devices.filter((device) => device.kind === "videoinput" && !!device.deviceId && BACK.test(device.label) && !FRONT.test(device.label));

  return back.find((device) => !OTHER_LENS.test(device.label))?.deviceId ?? null;
}
