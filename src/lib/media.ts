export type ClientMedia = {
  name: string;
  type: string;
  previewUrl: string;
};

export function hasMedia(file: ClientMedia | null | undefined) {
  return Boolean(file?.name);
}

export function isMediaComplete(
  engine: ClientMedia | null | undefined,
  odometer: ClientMedia | null | undefined,
  video: ClientMedia | null | undefined,
) {
  return hasMedia(engine) && hasMedia(odometer) && hasMedia(video);
}

export function persistableMedia(file: ClientMedia | null, kind: "image" | "video"): ClientMedia | null {
  if (!file) return null;
  if (kind === "video" && file.previewUrl.startsWith("blob:")) {
    return { name: file.name, type: file.type, previewUrl: "" };
  }
  return file;
}

export async function previewFromFile(file: File, kind: "image" | "video"): Promise<ClientMedia> {
  if (kind === "video") {
    return {
      name: file.name,
      type: file.type || "video/mp4",
      previewUrl: URL.createObjectURL(file),
    };
  }
  return {
    name: file.name,
    type: file.type || "image/jpeg",
    previewUrl: await compressImage(file),
  };
}

async function compressImage(file: File) {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return readAsDataUrl(file);
  }
  const bitmap = await createImageBitmap(file);
  const max = 640;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return readAsDataUrl(file);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.7);
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
