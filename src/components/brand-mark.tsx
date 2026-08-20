import Image from "next/image";
import { BRAND_MARK_PATH } from "@/lib/storefront-assets";
import { STORE_INFO } from "@/lib/storefront-content";

type BrandMarkProps = {
  compact?: boolean;
  className?: string;
};

export function BrandMark({ compact = false, className }: BrandMarkProps): React.JSX.Element {
  return (
    <span className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}>
      <Image
        src={BRAND_MARK_PATH}
        alt=""
        aria-hidden="true"
        data-testid="leaf-mark"
        unoptimized
        width={compact ? 24 : 32}
        height={compact ? 24 : 32}
      />
      <span className={compact ? "text-base font-extrabold tracking-tight" : "text-xl font-extrabold tracking-tight"}>
        {STORE_INFO.brand}
      </span>
    </span>
  );
}
