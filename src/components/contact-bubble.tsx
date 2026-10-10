"use client";

import { Popover } from "@base-ui/react/popover";
import { ExternalLink, MessageCircle, Phone, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { STORE_INFO } from "@/lib/storefront-content";

function ContactPopover() {
  const actionsRef = useRef<Popover.Root.Actions>(null);
  const phoneRef = useRef<HTMLAnchorElement>(null);

  return (
    <Popover.Root actionsRef={actionsRef}>
      <Popover.Trigger
        className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--evergreen)] px-5 text-sm font-semibold text-white shadow-lg hover:bg-[var(--accent)]"
      >
        <MessageCircle aria-hidden="true" className="size-5" />
        Liên hệ
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="end" sideOffset={12} className="z-50">
          <Popover.Popup initialFocus={phoneRef} className="w-72 max-w-[calc(100vw-2rem)] rounded-2xl border bg-[var(--paper)] p-4 text-[var(--ink)] shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-2">
              <Popover.Title className="font-semibold">Liên hệ leafshoes</Popover.Title>
              <Popover.Close
                aria-label="Đóng liên hệ"
                className="inline-flex size-11 items-center justify-center rounded-full hover:bg-[var(--sage)]"
              >
                <X aria-hidden="true" className="size-5" />
              </Popover.Close>
            </div>
            <div className="space-y-2">
              <a
                ref={phoneRef}
                href={`tel:${STORE_INFO.phoneDigits}`}
                onClick={() => actionsRef.current?.close()}
                className="flex min-h-14 items-center gap-3 rounded-xl border p-3 hover:bg-[var(--sage)]"
              >
                <Phone aria-hidden="true" className="size-5 shrink-0 text-[var(--evergreen)]" />
                <span>
                  <span className="block text-sm font-semibold">Điện thoại</span>
                  <span className="block text-sm text-neutral-600">{STORE_INFO.phoneDisplay}</span>
                </span>
              </a>
              <a
                href={STORE_INFO.facebookUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => actionsRef.current?.close()}
                className="flex min-h-14 items-center gap-3 rounded-xl border p-3 hover:bg-[var(--sage)]"
              >
                <ExternalLink aria-hidden="true" className="size-5 shrink-0 text-[var(--evergreen)]" />
                <span>
                  <span className="block text-sm font-semibold">Facebook fanpage</span>
                  <span className="block text-sm text-neutral-600">leafshoes Việt Nam</span>
                </span>
                <span className="sr-only"> (mở trong tab mới)</span>
              </a>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ContactBubble() {
  const pathname = usePathname();

  if (pathname === "/admin" || pathname.startsWith("/admin/")) return null;

  return <ContactPopover key={pathname} />;
}
