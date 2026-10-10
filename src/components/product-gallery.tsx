"use client";

import Image from "next/image";
import { useState } from "react";

export type ProductImageSetView = {
  id: string;
  color: string;
  position: number;
  isDefault: boolean;
  images: Array<{
    id: string;
    url: string;
    position: number;
  }>;
};

export function selectImageSet(
  imageSets: ProductImageSetView[],
  selectedColor: string | null,
): ProductImageSetView | null {
  return (
    (selectedColor
      ? imageSets.find((imageSet) => imageSet.color === selectedColor)
      : undefined) ??
    imageSets.find((imageSet) => imageSet.isDefault) ??
    imageSets[0] ??
    null
  );
}

function shouldSkipOptimization(url: string) {
  return url.startsWith("/api/uploads/") || url.startsWith("/uploads/");
}

export function ProductGallery({
  productName,
  imageSets,
  selectedColor,
  onColorChange,
}: {
  productName: string;
  imageSets: ProductImageSetView[];
  selectedColor: string | null;
  onColorChange: (color: string) => void;
}) {
  const activeSet = selectImageSet(imageSets, selectedColor);
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const [selection, setSelection] = useState<{
    imageSetId: string;
    imageId: string;
  } | null>(null);
  const selectedImageId =
    selection && selection.imageSetId === activeSet?.id
      ? selection.imageId
      : null;
  const selectedImage =
    activeSet?.images.find((image) => image.id === selectedImageId) ??
    activeSet?.images[0] ??
    null;

  function thumbnails(className: string) {
    if (!imageSets.some((imageSet) => imageSet.images.length > 0)) return null;

    return (
      <div className={className} aria-label="Ảnh sản phẩm">
        {imageSets.flatMap((imageSet) =>
          imageSet.images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              aria-label={`Xem ảnh ${index + 1} của màu ${imageSet.color}`}
              aria-pressed={selectedImage?.id === image.id}
              onClick={() => {
                setSelection({ imageSetId: imageSet.id, imageId: image.id });
                onColorChange(imageSet.color);
              }}
              className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-[var(--sage)] focus-visible:outline-2 focus-visible:outline-offset-2 lg:w-full"
              style={{
                borderColor:
                  selectedImage?.id === image.id
                    ? "var(--evergreen)"
                    : "transparent",
              }}
            >
              <Image
                src={image.url}
                alt=""
                fill
                sizes="64px"
                unoptimized={shouldSkipOptimization(image.url)}
                className="object-contain"
              />
            </button>
          )),
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="lg:grid lg:grid-cols-[5rem_minmax(0,1fr)] lg:gap-4">
        {thumbnails(
          "hidden max-h-[min(46rem,70vh)] flex-col gap-3 overflow-y-auto pr-1 lg:flex",
        )}
        <div
          className="relative w-full self-start overflow-hidden rounded-2xl"
          style={{
            backgroundColor: "var(--sage)",
            aspectRatio: selectedImage
              ? (imageRatios[selectedImage.url] ?? 1)
              : 1,
          }}
        >
          {selectedImage && activeSet ? (
            <Image
              key={selectedImage.id}
              src={selectedImage.url}
              alt={`${productName} - ${activeSet.color}`}
              fill
              sizes="(max-width: 1023px) 100vw, 50vw"
              unoptimized={shouldSkipOptimization(selectedImage.url)}
              className="object-contain"
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0) {
                  setImageRatios((ratios) => ({
                    ...ratios,
                    [selectedImage.url]: naturalWidth / naturalHeight,
                  }));
                }
              }}
            />
          ) : (
            <div
              data-testid="product-image-fallback"
              className="flex h-full w-full items-center justify-center text-5xl"
              aria-hidden="true"
            >
              🌿
            </div>
          )}
        </div>
      </div>
      {thumbnails("mt-4 flex gap-3 overflow-x-auto pb-1 lg:hidden")}
    </div>
  );
}
