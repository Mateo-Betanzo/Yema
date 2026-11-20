import { act, render, screen } from "@testing-library/react-native";
import { useEffect, type ReactNode } from "react";
import { Text } from "react-native";

import ClientLayout from "@/app/client/_layout";
import { CartProvider, useCart } from "@/lib/cart";
import type { CartProduct } from "@/logic/cart";

// Spec 004 · T7: the cart lives in memory, in the client layout (RF-19). It survives moving between the
// client screens and is lost when the client group unmounts (closing the session or the app). The Stack
// of the layout needs a native host, so it is replaced with the screen each test chooses.
const mockScreen: { current: () => ReactNode } = { current: () => null };
jest.mock("expo-router", () => {
  const Stack = () => mockScreen.current();
  Stack.Screen = function Screen() {
    return null;
  };
  return { Stack };
});

const product = (id: number, overrides: Partial<CartProduct> = {}): CartProduct => ({
  id,
  name: `Producto ${id}`,
  price: 1000,
  units_available: 10,
  available: true,
  ...overrides,
});

// The cart of the last render, to call its functions from the tests.
const probe: { current: ReturnType<typeof useCart> | null } = { current: null };
function cartOf() {
  if (!probe.current) throw new Error("Probe was not rendered");
  return probe.current;
}
function Probe({ label = "carrito" }: { label?: string }) {
  const cart = useCart();
  useEffect(() => {
    probe.current = cart;
  });
  const text = cart.items.map((item) => `${item.productId}×${item.quantity}`).join(", ");
  return <Text testID={label}>{text || "vacío"}</Text>;
}

describe("CartProvider and useCart", () => {
  test("RF-8, RF-15: add and remove units; clear empties the cart", async () => {
    await render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    await act(async () => {
      expect(cartOf().add(product(1))).toBeUndefined();
    });
    await act(async () => {
      cartOf().add(product(1));
    });
    await act(async () => {
      cartOf().add(product(2));
    });
    expect(screen.getByTestId("carrito")).toHaveTextContent("1×2, 2×1");

    await act(async () => {
      cartOf().remove(2);
    });
    expect(screen.getByTestId("carrito")).toHaveTextContent("1×2");

    await act(async () => {
      cartOf().clear();
    });
    expect(screen.getByTestId("carrito")).toHaveTextContent("vacío");
  });

  test("RF-11, RF-12: add returns why a unit cannot be added and changes nothing", async () => {
    await render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    let error: unknown;
    await act(async () => {
      cartOf().add(product(1, { units_available: 1 }));
    });
    await act(async () => {
      error = cartOf().add(product(1, { units_available: 1 }));
    });
    expect(error).toBe("no_more_units");
    expect(screen.getByTestId("carrito")).toHaveTextContent("1×1");
  });

  // Spec 003 · T11 (cambio del 2026-11-18): the product screen adds the quantity it chose (RF-39, RF-40).
  test("add takes a quantity, with the same limits", async () => {
    await render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    await act(async () => {
      expect(cartOf().add(product(1), 3)).toBeUndefined();
    });
    expect(screen.getByTestId("carrito")).toHaveTextContent("1×3");
    let error: unknown;
    await act(async () => {
      error = cartOf().add(product(1), 3);
    });
    expect(error).toBe("max_per_product");
    expect(screen.getByTestId("carrito")).toHaveTextContent("1×3");
  });

  test("RF-19: the cart survives moving to another screen inside the provider", async () => {
    const view = await render(
      <CartProvider>
        <Probe label="tienda" />
      </CartProvider>,
    );
    await act(async () => {
      cartOf().add(product(3));
    });
    await view.rerender(
      <CartProvider>
        <Probe label="pantalla del carrito" />
      </CartProvider>,
    );
    expect(screen.getByTestId("pantalla del carrito")).toHaveTextContent("3×1");
  });

  test("useCart outside the provider is a programming error", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(render(<Probe />)).rejects.toThrow(/CartProvider/);
  });
});

describe("the client layout (RF-19)", () => {
  test("gives the cart to its screens, and loses it when the client group unmounts", async () => {
    mockScreen.current = () => <Probe />;
    const first = await render(<ClientLayout />);
    await act(async () => {
      cartOf().add(product(1));
    });
    expect(screen.getByTestId("carrito")).toHaveTextContent("1×1");

    await first.unmount();
    await render(<ClientLayout />);
    expect(screen.getByTestId("carrito")).toHaveTextContent("vacío");
  });
});
