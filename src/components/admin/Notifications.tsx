import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, errorMessage, useApi, type AppNotification } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { Icon } from "../icons";
import { Popover } from "../Popover";
import { cx } from "../styles";

const KEY = ["notifications"];

/** The bell in the top bar: notes that mention you, reports near their reply target, quote requests and more. */
export function Notifications() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { data, error } = useQuery({
    queryKey: KEY,
    queryFn: () => api<{ items: AppNotification[]; unread: number }>("/notifications"),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api("/notifications/read", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const unread = data?.unread ?? 0;
  const notReady = error instanceof ApiError && error.status === 404;

  return (
    <Popover
      label="Notifications"
      align="end"
      width={360}
      trigger={(p) => (
        <button
          type="button"
          {...p}
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative flex size-10 flex-none items-center justify-center rounded-[10px] border border-line bg-white text-ink hover:bg-canvas"
        >
          <Icon name="bell" />
          {unread > 0 && <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-[9px] rounded-full border-2 border-white bg-alert-dot" />}
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="m-0 text-[16px] text-navy-ink">Notifications</h2>
            {unread > 0 && (
              <button type="button" onClick={() => markRead.mutate(undefined)} className="text-[13px] font-bold text-navy hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {error && (
            <p className="m-0 px-4 py-6 text-center text-[14px] text-muted">
              {notReady ? "Notifications aren't available yet. They turn on once the API adds them." : errorMessage(error)}
            </p>
          )}
          {data && data.items.length === 0 && <p className="m-0 px-4 py-6 text-center text-[14px] text-muted">You're all caught up.</p>}
          {data && data.items.length > 0 && (
            <ul className="m-0 max-h-[60vh] list-none overflow-y-auto p-1.5">
              {data.items.map((n) => (
                <li key={n.id}>
                  <Link
                    to={n.link}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate([n.id]);
                      close();
                    }}
                    className="flex gap-3 rounded-lg px-2.5 py-2.5 text-ink no-underline hover:bg-canvas hover:text-ink"
                  >
                    <span aria-hidden="true" className={cx("mt-1.5 size-2 flex-none rounded-full", n.readAt ? "bg-transparent" : "bg-alert-dot")} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold">
                        {n.title}
                        {!n.readAt && <span className="sr-only"> (unread)</span>}
                      </span>
                      {n.body && <span className="block text-[13px] text-muted">{n.body}</span>}
                      <span className="block text-[12px] text-muted">{timeAgo(n.createdAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}
