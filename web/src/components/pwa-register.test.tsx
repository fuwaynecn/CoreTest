import { render } from "@testing-library/react";
import { PwaRegister } from "./pwa-register";

test("registers the service worker when the browser supports it", async () => {
  const register = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
  render(<PwaRegister />);
  await vi.waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
});

test("does not block rendering when registration fails", async () => {
  const register = vi.fn().mockRejectedValue(new Error("registration failed"));
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
  expect(() => render(<PwaRegister />)).not.toThrow();
  await vi.waitFor(() => expect(register).toHaveBeenCalled());
});
