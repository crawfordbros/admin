import { useRef, type ChangeEvent } from "react";

/**
 * Two hidden file inputs: one opens the front camera on a phone, the other the photo library (on a
 * computer both open the file picker).
 */
export function usePhotoPicker(onFile: (file: File) => void) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const picked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onFile(file);
  };
  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="user" hidden onChange={picked} data-photo="camera" />
      <input ref={library} type="file" accept="image/*" hidden onChange={picked} data-photo="library" />
    </>
  );
  return { inputs, takePhoto: () => camera.current?.click(), choosePhoto: () => library.current?.click() };
}
