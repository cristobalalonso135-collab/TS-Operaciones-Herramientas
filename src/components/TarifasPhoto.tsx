'use client';

import { useState } from 'react';
import { Download, X } from 'lucide-react';

export function TarifasPhoto({
  src,
  alt,
  className,
  onOpen,
}: {
  src: string | null;
  alt: string;
  className?: string;
  onOpen?: (src: string, alt: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-neutral-50 ${className || ''}`}>
        <span className="font-display text-3xl font-semibold tracking-tight text-neutral-300">
          {alt.slice(0, 1).toUpperCase()}
        </span>
      </div>
    );
  }
  const img = (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`bg-white object-contain object-center ${className || ''} ${onOpen ? 'h-full w-full' : ''}`}
    />
  );
  if (!onOpen) return img;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(src, alt);
      }}
      className="block h-full w-full cursor-zoom-in"
      aria-label={alt}
    >
      {img}
    </button>
  );
}

export function PhotoLightbox({
  src,
  alt,
  downloadLabel,
  closeLabel,
  onClose,
}: {
  src: string;
  alt: string;
  downloadLabel: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-neutral-950/90 p-4" onClick={onClose}>
      <div className="relative flex max-h-full max-w-[min(1100px,100%)] flex-col items-center" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-1 -top-1 rounded-full bg-white p-1.5 text-neutral-700 shadow"
          aria-label={closeLabel}
        >
          <X className="h-4 w-4" />
        </button>
        <img
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          className="max-h-[78vh] max-w-full rounded-lg bg-white object-contain"
        />
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          download
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-neutral-900"
        >
          <Download className="h-4 w-4" /> {downloadLabel}
        </a>
      </div>
    </div>
  );
}
