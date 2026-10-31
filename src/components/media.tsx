import { useId, useRef, useState, type DragEvent } from "react";
import { Icon } from "./icons";
import { cx } from "./styles";

export type Photo = { url: string; caption: string; takenAt?: string | null; gps?: string | null };

/** One large photo with thumbnails beneath; the large one opens full size in a new tab. */
export function PhotoGallery({ photos, label }: { photos: Photo[]; label: string }) {
  const [at, setAt] = useState(0);
  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl bg-navy-night text-[14px] text-nav-pill">
        <Icon name="camera" size={28} />
        No photos
      </div>
    );
  }
  const photo = photos[Math.min(at, photos.length - 1)];
  return (
    <figure aria-label={label} className="m-0 flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl bg-navy-night">
        <img src={photo.url} alt={photo.caption} className="block aspect-[4/3] w-full object-contain" />
        <div className="absolute top-3 right-3 flex gap-2">
          <a href={photo.url} target="_blank" rel="noreferrer" aria-label="Open full size" className="flex size-9 items-center justify-center rounded-[10px] bg-white/90 text-ink hover:bg-white">
            <Icon name="zoom-in" size={18} />
          </a>
          <a href={photo.url} download aria-label="Download photo" className="flex size-9 items-center justify-center rounded-[10px] bg-white/90 text-ink hover:bg-white">
            <Icon name="download" size={18} />
          </a>
        </div>
      </div>
      <figcaption className="text-[13px] text-muted">
        {[photo.takenAt, photo.gps].filter(Boolean).join(", ") || photo.caption}
      </figcaption>
      {photos.length > 1 && (
        <div role="group" aria-label="Photos" className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={p.url}
              type="button"
              aria-label={`Photo ${i + 1} of ${photos.length}`}
              aria-pressed={i === at}
              onClick={() => setAt(i)}
              className={cx("size-16 flex-none overflow-hidden rounded-lg border-2", i === at ? "border-navy" : "border-transparent opacity-80 hover:opacity-100")}
            >
              <img src={p.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </figure>
  );
}

const MB = 1024 * 1024;

/** Drag files onto it or choose them with the button. Files that are too big are refused here. */
export function FileDrop({
  accept,
  maxBytes,
  onFiles,
  label,
  hint,
  multiple,
}: {
  accept: string;
  maxBytes: number;
  onFiles: (files: File[]) => void;
  label: string;
  hint?: string;
  multiple?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = (list: FileList | null) => {
    const files = [...(list ?? [])].slice(0, multiple ? undefined : 1);
    const big = files.find((f) => f.size > maxBytes);
    if (big) return setError(`${big.name} is over ${Math.round(maxBytes / MB)} MB. Choose a smaller file.`);
    setError(null);
    if (files.length) onFiles(files);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cx("flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center", over ? "border-navy bg-tint-2" : "border-field bg-subtle")}
      >
        <Icon name="upload" size={22} className="text-navy" />
        <p className="m-0 text-[14px] font-semibold">
          Drag a file here or{" "}
          <button type="button" onClick={() => input.current?.click()} className="font-bold text-navy underline underline-offset-2">
            choose one
          </button>
        </p>
        {hint && (
          <p id={`${id}-hint`} className="m-0 text-[12.5px] text-muted">
            {hint}
          </p>
        )}
        <input
          ref={input}
          type="file"
          accept={accept}
          multiple={multiple}
          aria-label={label}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-1.5 mb-0 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
