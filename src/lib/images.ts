import { useQuery } from "@tanstack/react-query";
import { useApiBlob } from "./api";

export const IMAGE_TYPES = "image/png,image/jpeg,image/webp";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Crops an image to its centered square and re-encodes it as a 512 px WebP. Re-encoding also
 * drops the EXIF data (camera, location) a phone photo carries. The API accepts up to 1 MB.
 */
export async function squareWebp(file: Blob, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(size, side);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare images. Try another browser.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("The image couldn't be prepared. Try a PNG or JPG.");
  return blob;
}

/**
 * An object URL for an image the API serves to signed-in users; null while loading or when there's
 * none. URLs live for the session (each image is a ~40 kB WebP), keyed by its version, so a
 * replaced photo gets a new one.
 */
export function useAuthedImage(path: string | null, version: string | null) {
  const blob = useApiBlob();
  const { data } = useQuery({
    queryKey: ["image", path, version],
    queryFn: async () => {
      const b = await blob(path!);
      return b ? URL.createObjectURL(b) : null;
    },
    enabled: Boolean(path && version),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return path && version ? (data ?? null) : null;
}
