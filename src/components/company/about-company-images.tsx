import Image from "next/image";
import { ABOUT_COMPANY_IMAGES } from "@/lib/storefront-assets";

export function AboutCompanyImages(): React.JSX.Element {
  return (
    <section aria-labelledby="about-company-images-heading" className="mt-8" data-testid="about-company-images">
      <h2
        id="about-company-images-heading"
        className="text-xl font-semibold text-neutral-900"
      >
        Từ xưởng đến từng đôi giày
      </h2>

      <div className="mt-4 space-y-6">
        <figure>
          <div
            className="overflow-hidden rounded-2xl border bg-neutral-100"
            style={{ borderColor: "var(--line)" }}
          >
            <Image
              src={ABOUT_COMPANY_IMAGES.hero.src}
              alt={ABOUT_COMPANY_IMAGES.hero.alt}
              width={ABOUT_COMPANY_IMAGES.hero.width}
              height={ABOUT_COMPANY_IMAGES.hero.height}
              sizes="(max-width: 832px) calc(100vw - 2rem), 736px"
              className="h-auto w-full object-cover"
            />
          </div>
          <figcaption className="mt-2 text-sm text-neutral-600">
            {ABOUT_COMPANY_IMAGES.hero.caption}
          </figcaption>
        </figure>

        <div className="grid gap-6 sm:grid-cols-2">
          {[ABOUT_COMPANY_IMAGES.production, ABOUT_COMPANY_IMAGES.showroom].map((image) => (
            <figure key={image.src}>
              <div
                className="overflow-hidden rounded-2xl border bg-neutral-100"
                style={{ borderColor: "var(--line)" }}
              >
                <Image
                  src={image.src}
                  alt={image.alt}
                  width={image.width}
                  height={image.height}
                  sizes="(max-width: 640px) calc(100vw - 2rem), 356px"
                  className="h-auto w-full object-cover"
                />
              </div>
              <figcaption className="mt-2 text-sm text-neutral-600">{image.caption}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
