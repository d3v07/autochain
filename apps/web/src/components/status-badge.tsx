const COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  confirmed: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-800",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
  in_transit: "bg-blue-100 text-blue-700",
  exception: "bg-red-100 text-red-700",
  sent: "bg-blue-100 text-blue-700",
  received: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  active: "bg-green-100 text-green-700",
  disabled: "bg-red-100 text-red-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  paused: "bg-amber-100 text-amber-700",
  planned: "bg-slate-100 text-slate-700",
  waiting_approval: "bg-amber-100 text-amber-700",
  expired: "bg-orange-100 text-orange-700",
  admin: "bg-slate-100 text-slate-700",
  customer: "bg-blue-100 text-blue-700",
  text: "bg-slate-100 text-slate-700",
  voice: "bg-cyan-100 text-cyan-700",
  video: "bg-violet-100 text-violet-700",
  visual: "bg-violet-100 text-violet-700",
  agentic: "bg-indigo-100 text-indigo-700",
  manual: "bg-slate-100 text-slate-700",
  ask: "bg-amber-100 text-amber-700",
  agent: "bg-indigo-100 text-indigo-700",
  inactive: "bg-gray-100 text-gray-700",
  suspended: "bg-orange-100 text-orange-700",
  healthy: "bg-green-100 text-green-700",
  watch: "bg-amber-100 text-amber-700",
  risk: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${COLORS[status] ?? "bg-gray-100 text-gray-700"}`}
    >
      {status}
    </span>
  );
}
