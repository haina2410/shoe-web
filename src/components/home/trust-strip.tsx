import { CreditCard, MessageCircle, Truck } from "lucide-react";
import { TRUST_ITEMS } from "@/lib/storefront-content";

const TRUST_ICONS = [CreditCard, Truck, MessageCircle] as const;

export function TrustStrip(): React.JSX.Element {
  return (
    <section
      data-testid="home-section"
      data-section="trust"
      aria-labelledby="trust-strip-heading"
      className="border-y bg-[var(--sage)]"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
        <h2 id="trust-strip-heading" className="sr-only">
          Mua sắm an tâm
        </h2>
        <ul className="grid gap-6 sm:grid-cols-3">
          {TRUST_ITEMS.map((item, index) => {
            const Icon = TRUST_ICONS[index];

            return (
              <li key={item.title} className="flex gap-3">
                <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-[var(--evergreen)]" />
                <div>
                  <p className="font-bold text-[var(--evergreen)]">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-neutral-600">{item.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
