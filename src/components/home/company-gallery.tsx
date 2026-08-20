"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import {
  COMPANY_GALLERY_IMAGES,
  type CompanyImage,
} from "@/lib/storefront-assets";

export function CompanyGallery({
  images = COMPANY_GALLERY_IMAGES,
}: {
  images?: readonly CompanyImage[];
}): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const image = images[index];

  if (!image) {
    return <></>;
  }

  const showNext = () =>
    setIndex((current) => (current + 1) % images.length);
  const showPrevious = () =>
    setIndex((current) => (current - 1 + images.length) % images.length);

  return (
    <section
      data-testid="home-section"
      data-section="company"
      className="border-y bg-[var(--sage)]"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
            Từ xưởng đến cửa hàng
          </p>
          <h2
            id="company-gallery-heading"
            className="mt-2 text-2xl font-bold text-[var(--evergreen)] sm:text-3xl"
          >
            Khoảnh khắc tại leafshoes
          </h2>
          <p className="mt-3 leading-7 text-neutral-600">
            Mỗi đôi giày bắt đầu từ sự chăm chút của đội ngũ leafshoes Việt Nam.
          </p>
        </div>

        <div
          role="region"
          aria-roledescription="carousel"
          aria-labelledby="company-gallery-heading"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              showNext();
            }

            if (event.key === "ArrowLeft") {
              event.preventDefault();
              showPrevious();
            }
          }}
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const startX = touchStartX.current;
            const endX = event.changedTouches[0]?.clientX;
            touchStartX.current = null;

            if (startX === null || endX === undefined) return;

            const distance = startX - endX;

            if (distance > 50) showNext();
            if (distance < -50) showPrevious();
          }}
          className="mt-7 touch-pan-y rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--evergreen)]"
        >
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <Image
              key={image.src}
              src={image.src}
              alt={image.alt}
              width={image.width}
              height={image.height}
              sizes="(max-width: 1215px) calc(100vw - 2rem), 1152px"
              className="h-auto w-full object-cover transition-opacity motion-reduce:transition-none"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <button
              type="button"
              aria-label="Ảnh trước đó"
              onClick={showPrevious}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border bg-white text-[var(--evergreen)] transition-colors hover:bg-[var(--evergreen)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--evergreen)] motion-reduce:transition-none"
              style={{ borderColor: "var(--line)" }}
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="font-semibold text-[var(--evergreen)]">{image.caption}</p>
              <p aria-live="polite" aria-atomic="true" className="mt-1 text-sm text-neutral-600">
                {index + 1} / {images.length}
              </p>
            </div>
            <button
              type="button"
              aria-label="Ảnh tiếp theo"
              onClick={showNext}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border bg-white text-[var(--evergreen)] transition-colors hover:bg-[var(--evergreen)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--evergreen)] motion-reduce:transition-none"
              style={{ borderColor: "var(--line)" }}
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
