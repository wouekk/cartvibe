/** The scan frame, as fractions of the viewfinder: the brackets the person puts the barcode between. */
export const SCAN_FRAME = { x: 0.08, y: 0.275, width: 0.84, height: 0.45 } as const;

export interface VideoBox {
  clientWidth: number;
  clientHeight: number;
  videoWidth: number;
  videoHeight: number;
}

export interface FrameRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The scan frame in the video's own pixels. The video fills its box with `object-fit: cover`, so part of the picture is
 * cropped and the frame has to be mapped back through that crop. Null while the video has no size yet.
 */
export function frameInVideo(video: VideoBox): FrameRect | null {
  const { clientWidth, clientHeight, videoWidth, videoHeight } = video;
  if (!clientWidth || !clientHeight || !videoWidth || !videoHeight) {
    return null;
  }

  const scale = Math.max(clientWidth / videoWidth, clientHeight / videoHeight);
  const cropX = (videoWidth * scale - clientWidth) / 2;
  const cropY = (videoHeight * scale - clientHeight) / 2;

  return {
    left: (SCAN_FRAME.x * clientWidth + cropX) / scale,
    top: (SCAN_FRAME.y * clientHeight + cropY) / scale,
    right: ((SCAN_FRAME.x + SCAN_FRAME.width) * clientWidth + cropX) / scale,
    bottom: ((SCAN_FRAME.y + SCAN_FRAME.height) * clientHeight + cropY) / scale,
  };
}

/** Whether the middle of a detected barcode, given by its corner points, lies between the brackets. Without a frame or points everything counts. */
export function centreInFrame(frame: FrameRect | null, points: readonly { x: number; y: number }[]): boolean {
  if (!frame || !points.length) {
    return true;
  }
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;

  return x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom;
}
