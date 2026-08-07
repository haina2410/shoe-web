# Admin UI and UX Handoff

Temporary implementation handoff. Remove this file after the approved design
has been implemented and reflected in the durable documentation.

## Goal

Make every existing admin surface easier to scan and safer to operate while
preserving the current routes, domain rules, and server actions. The admin must
feel like an operational interface rather than a smaller copy of the storefront.

## Scope

Apply the design to:

- the admin shell, navigation, and landing page;
- product list, create/edit form, stock editing, and deletion;
- order list and order detail;
- payment confirmation, order transitions, and refunds;
- bank-transaction reconciliation.

The storefront and public order pages are out of scope. No order, payment,
inventory, authorization, or reconciliation rule changes are included.

## Visual hierarchy

Use a balanced operational density:

- page titles are 28–32px and bold;
- important identifiers such as order codes are 20–24px;
- totals, received amounts, refunded amounts, and important stock values are
  20–24px with stronger weight;
- section headings are 18–20px;
- normal content is 15–16px;
- labels, metadata, and timestamps are 13–14px and visually secondary;
- primary workflow buttons are at least 40px tall;
- compact table text remains 14–15px, with stronger emphasis on codes, money,
  and status cells.

Use consistent white section cards with a hairline border, 20–24px padding, and
clear separation between headings and content. On order detail, display the
order status beside the order code, keep the creation time secondary, and place
the action section immediately below the header.

Tables retain horizontal scrolling where required. Add distinct headers,
comfortable row padding, row hover treatment, and visible keyboard focus.
Mobile layouts stack summaries and actions without shrinking touch targets.

## Semantic color system

Action colors communicate consequences:

- green: safe forward progress and ordinary saves;
- amber: financial or attention-sensitive actions;
- red: destructive actions;
- neutral outline: filters, dismissal, navigation, and secondary actions.

Specific action mappings:

| Action | Treatment |
|---|---|
| Save product or stock | Green |
| Move to shipping or mark complete | Green |
| Confirm payment | Amber |
| Record refund | Amber |
| Match bank transaction | Amber |
| Cancel order | Red |
| Delete product or remove destructive data | Red |

Status badges pair color with text:

| State | Treatment |
|---|---|
| Pending payment or review required | Amber |
| Paid or matched | Blue |
| Shipping | Violet |
| Completed or fully refunded | Green |
| Partially refunded or low stock | Amber |
| Cancelled or out of stock | Red |
| Expired, no refund, or neutral state | Gray |

Color is never the only signal. Every badge and action retains an explicit text
label and accessible focus treatment.

## Actions, confirmation, and feedback

Amber and red mutations require confirmation before calling their server
action. The confirmation dialog includes:

- a direct action title;
- the affected order code, product, transaction, or amount;
- a short statement of the consequence;
- a neutral cancel button;
- a semantic confirm button matching the initiating action.

Safe forward transitions and ordinary saves remain one-step actions.

During every mutation:

- the initiating button shows a spinner and action-specific pending text;
- all competing actions in the same group are disabled;
- submitted fields are disabled when applicable;
- repeated submission is blocked;
- the rest of the page stays readable without a full-page overlay.

After success, refresh or revalidate the displayed data and show a brief
accessible toast. Errors stay visible beside the action that failed and are
announced through an alert or live region. A success toast does not replace the
updated status, amount, stock value, or table row.

## Shared admin UI layer

Introduce focused, admin-only primitives:

- `AdminPageHeader` for titles, descriptions, statuses, and page actions;
- `AdminSection` for consistent card spacing and headings;
- `AdminStatusBadge` for semantic domain states;
- `AdminMetric` for important values;
- `ConfirmActionDialog` for amber and red mutations;
- `AdminToastProvider` and a toast region mounted by the admin layout.

Extend the existing button variants with solid warning and destructive styles.
Do not create a generic mutation framework. Existing mutation components retain
their action-specific data and error handling, and compose the shared dialog,
button, spinner, and toast primitives.

The admin navigation gains a visible active state, retains horizontal scrolling
when necessary, and uses touch targets of at least 40px.

## Data flow

The existing server actions remain the source of truth:

1. The operator initiates an action.
2. Warning and destructive actions open a confirmation dialog.
3. Confirmation starts the existing mutation and activates local pending state.
4. The server action applies its existing authorization and domain validation.
5. Success revalidates or refreshes the existing data and triggers a toast.
6. Failure closes no context, preserves useful input, and renders an inline
   error near the action.

There is no optimistic update for order, payment, refund, stock, or
reconciliation state.

## Accessibility and responsive behavior

- Dialog focus moves inside on open and returns to the trigger on close.
- Escape and the cancel action close dialogs when no mutation is pending.
- Pending controls expose their disabled state and readable loading text.
- Toasts use an appropriate live region without moving keyboard focus.
- Status and outcome information is understandable without color.
- Desktop and mobile layouts preserve reading order and 40–44px primary touch
  targets.

## Verification

Component coverage verifies:

- semantic button and badge variants;
- confirmation blocks mutation until explicitly approved;
- cancellation performs no mutation;
- pending labels, spinners, disabled fields, and double-submit protection;
- success toasts and inline errors;
- active navigation state and responsive rendering.

Existing admin workflow tests continue to cover authorization and domain
outcomes. Browser verification covers all admin routes at desktop and mobile
widths, including pending, success, error, empty, and populated states where
they can be reached safely.

## Durable documentation

Implementation updates `docs/05-design-direction.md` with the admin visual and
interaction rules. Update `docs/06-admin-order-domain.md` only where its admin
surface description needs to reflect confirmation and feedback behavior.
