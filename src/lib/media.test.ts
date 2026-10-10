import { describe, expect, it } from "vitest";
import { hasMedia, isMediaComplete, persistableMedia } from "./media";

describe("client media uploads", () => {
  it("requires engine, odometer, and video files", () => {
    const photo = { name: "engine.jpg", type: "image/jpeg", previewUrl: "data:image/jpeg;base64,x" };
    expect(isMediaComplete(photo, photo, null)).toBe(false);
    expect(isMediaComplete(photo, photo, { name: "sound.mp4", type: "video/mp4", previewUrl: "blob:1" })).toBe(true);
  });

  it("does not persist blob video URLs into storage", () => {
    const stored = persistableMedia(
      { name: "sound.mp4", type: "video/mp4", previewUrl: "blob:http://localhost/1" },
      "video",
    );
    expect(stored?.name).toBe("sound.mp4");
    expect(stored?.previewUrl).toBe("");
    expect(hasMedia(stored)).toBe(true);
  });
});
