/* eslint-disable react-refresh/only-export-components -- test helpers, not app code */
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { vi } from "vitest";

// Clerk is mocked in setup.ts: useAuth().getToken() resolves to "session-token".

export type FetchCall = { url: string; method: string; body: unknown; auth: string | null };

/** Routes fetch calls to `handler`, which returns [status, body]. */
export function mockFetch(handler: (url: string, method: string, body: unknown) => [number, unknown]) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body, auth: new Headers(init.headers).get("Authorization") });
      const [status, json] = handler(url, method, body);
      return status === 204 ? new Response(null, { status }) : Response.json(json, { status });
    }),
  );
  return calls;
}

function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

export function renderRoute(path: string, url: string, element: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<p>Elsewhere</p>} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
