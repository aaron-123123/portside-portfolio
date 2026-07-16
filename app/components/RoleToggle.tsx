import { setRoleAction } from "@/app/actions";
import type { Role } from "@/lib/types";

const TIERS: { value: Role; label: string; title: string }[] = [
  { value: "em", label: "EM", title: "Delivery team — full access" },
  {
    value: "client_exec",
    label: "Sponsor",
    title: "Client sponsor — one-glance status only",
  },
  {
    value: "client_contact",
    label: "Lead",
    title: "Client project lead — full shared view",
  },
];

/**
 * View switch across the three access tiers. Each button posts to a Server
 * Action that writes the httpOnly role cookie — a real server round-trip that
 * changes what the database will return, not a UI filter.
 */
export function RoleToggle({ role }: { role: Role }) {
  return (
    <div className="toggle-wrap">
      <span className="toggle-label" title="Demo control — access is enforced by database Row Level Security, not this switch">
        Demo · view as
      </span>
      <div className="toggle">
        {TIERS.map((tier) => (
          <form action={setRoleAction} key={tier.value}>
            <input type="hidden" name="role" value={tier.value} />
            <button
              type="submit"
              title={tier.title}
              className={`toggle-btn${role === tier.value ? " active" : ""}`}
              disabled={role === tier.value}
              aria-current={role === tier.value ? "true" : undefined}
            >
              {tier.label}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
