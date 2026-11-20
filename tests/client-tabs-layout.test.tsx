import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Text } from "react-native";

import ClientTabsLayout from "@/app/client/(tabs)/_layout";
import { CartProvider, useCart } from "@/lib/cart";
import type { Cart } from "@/logic/cart";

// Spec 010 · T5: the tabs of the client (RF-1) and the cart kept empty while there is an active order
// (RF-34). The navigator is replaced: each screen shows its name and title, which is what the tab bar
// uses as the accessible name. The cart is the real one, read by a probe.
jest.mock("expo-router/js-tabs", () => {
  const { Text: MockText } = jest.requireActual("react-native");
  function Tabs({ children }: { children: ReactNode }) {
    return <>{children}</>;
  }
  Tabs.Screen = function Screen({ name, options }: { name: string; options: { title: string } }) {
    return <MockText testID="tab">{`${name}:${options.title}`}</MockText>;
  };
  return { Tabs };
});

const mockActiveOrder: { current: { data: { id: number; status: string } | null; refetch: jest.Mock } } = {
  current: { data: null, refetch: jest.fn() },
};
jest.mock("@/lib/orders", () => ({ useActiveOrder: () => mockActiveOrder.current }));

function CartProbe() {
  const cart = useCart();
  return <Text testID="cart-items">{cart.items.length}</Text>;
}

const ITEMS: Cart = [
  { productId: 1, name: "Pack Mediano", quantity: 2 },
  { productId: 3, name: "Media docena", quantity: 1 },
];

const tree = (items: Cart) => (
  <CartProvider initialItems={items}>
    <ClientTabsLayout />
    <CartProbe />
  </CartProvider>
);
const cartItems = () => screen.getByTestId("cart-items").props.children;

beforeEach(() => {
  mockActiveOrder.current = { data: null, refetch: jest.fn() };
});

describe("client tabs", () => {
  test("RF-1: Home, Carrito and Perfil, in this order", async () => {
    await render(tree([]));
    expect(screen.getAllByTestId("tab").map((tab) => tab.props.children)).toEqual([
      "index:Home",
      "cart:Carrito",
      "profile:Perfil",
    ]);
  });

  test("RF-34: with an active order, the products of the cart are taken out", async () => {
    mockActiveOrder.current = { data: { id: 187, status: "pending" }, refetch: jest.fn() };
    await render(tree(ITEMS));
    expect(cartItems()).toBe(0);
  });

  test("RF-34: when an order becomes active (confirmed on another phone), the cart empties", async () => {
    const view = await render(tree(ITEMS));
    expect(cartItems()).toBe(2);
    mockActiveOrder.current = { data: { id: 188, status: "accepted" }, refetch: jest.fn() };
    await view.rerender(tree(ITEMS));
    expect(cartItems()).toBe(0);
  });

  test("RF-34: without an active order, or while it loads, the cart stays as it is", async () => {
    await render(tree(ITEMS));
    expect(cartItems()).toBe(2);
  });
});
