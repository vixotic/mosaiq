// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";

const authenticated = {
  authenticated: true,
  owner: { username: "owner" },
  expiresAt: "2026-08-06T12:00:00.000Z",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderApp(path = "/library") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("owner authentication", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("sends unauthenticated navigation to login and restores it after a successful sign-in", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/session")) return json({ authenticated: false });
      if (url.endsWith("/auth/login")) {
        expect(init?.credentials).toBe("include");
        return json(authenticated);
      }
      if (url.endsWith("/collections")) return json([]);
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderApp("/collections");

    expect(await screen.findByRole("heading", { name: "Open your library" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Username"), "owner");
    await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "Open Mosaiq" }));

    expect(await screen.findByRole("heading", { name: "Collections" })).toBeInTheDocument();
  });

  it("shows a restrained error and clears the password after invalid credentials", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      String(input).endsWith("/auth/session")
        ? json({ authenticated: false })
        : json({ message: "Invalid username or password." }, 401),
    );
    const user = userEvent.setup();
    renderApp();

    await user.type(await screen.findByLabelText("Username"), "owner");
    const password = screen.getByLabelText("Password");
    await user.type(password, "incorrect");
    await user.click(screen.getByRole("button", { name: "Open Mosaiq" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That username and password do not match.",
    );
    expect(password).toHaveValue("");
  });

  it("clears authenticated navigation after logout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/session")) return json(authenticated);
      if (url.endsWith("/library-items?direction=desc")) {
        return json({ items: [], page: 1, pageSize: 30, total: 0, hasNextPage: false });
      }
      if (url.endsWith("/auth/logout")) return new Response(null, { status: 204 });
      throw new Error(`Unexpected request: ${url}`);
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /sign out/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Open your library" })).toBeInTheDocument(),
    );
  });
});
