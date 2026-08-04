import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/outreach/admin/managed-exec")({
  component: () => <Outlet />,
});
