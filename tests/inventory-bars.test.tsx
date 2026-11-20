import { render, screen, within } from "@testing-library/react-native";

import { InventoryBars } from "@/components/inventory-bars";
import type { StockType } from "@/logic/admin-dashboard";
import { theme } from "@/theme";

// Spec 007 · T6: "Inventario" of the Dashboard (RF-13): per active type, its name and its stock in
// maples and packs above, and a bar of its color below, scaled to the type with most stock.
const type = (id: number, name: string, stock: number, active = true): StockType => ({ id, name, active, stock });
const TYPES = [type(1, "Medianos", 3000), type(2, "Grandes", 4200), type(3, "Super", 1740), type(4, "Viejos", 900, false)];

describe("inventory bars", () => {
  test("RF-13: the section and a row per active type, read as one text", async () => {
    await render(<InventoryBars types={TYPES} />);
    expect(screen.getByRole("header", { name: "Inventario" })).toBeOnTheScreen();
    const medianos = screen.getByLabelText("Medianos, 100 maples, 16 packs");
    expect(within(medianos).getByText("Medianos")).toBeOnTheScreen();
    expect(within(medianos).getByText("100 maples · 16 packs")).toBeOnTheScreen();
    expect(screen.getByLabelText("Grandes, 140 maples, 23 packs")).toBeOnTheScreen();
    expect(screen.getByLabelText("Super, 58 maples, 9 packs")).toBeOnTheScreen();
    expect(screen.queryByText("Viejos")).toBeNull();
  });

  test("RF-13: each bar is as long as its stock against the type with most, in the color of its type", async () => {
    await render(<InventoryBars types={TYPES} />);
    expect(screen.getByTestId("stock-bar-2")).toHaveStyle({ width: "100%", backgroundColor: theme.colors.categories[1] });
    expect(screen.getByTestId("stock-bar-1")).toHaveStyle({
      width: `${(3000 / 4200) * 100}%`,
      backgroundColor: theme.colors.categories[0],
    });
    expect(screen.getByTestId("stock-bar-3")).toHaveStyle({ backgroundColor: theme.colors.categories[2] });
  });

  test("RF-13: from the 5th type the colors start again", async () => {
    const six = [1, 2, 3, 4, 5, 6].map((id) => type(id, `Tipo ${id}`, 30));
    await render(<InventoryBars types={six} />);
    expect(screen.getByTestId("stock-bar-5")).toHaveStyle({ backgroundColor: theme.colors.categories[0] });
    expect(screen.getByTestId("stock-bar-6")).toHaveStyle({ backgroundColor: theme.colors.categories[1] });
  });

  test("a type without stock has an empty bar", async () => {
    await render(<InventoryBars types={[type(1, "Medianos", 0), type(2, "Grandes", 30)]} />);
    expect(screen.getByTestId("stock-bar-1")).toHaveStyle({ width: "0%" });
    expect(screen.getByLabelText("Medianos, 0 maples, 0 packs")).toBeOnTheScreen();
  });

  test("no active types: it says so", async () => {
    await render(<InventoryBars types={[type(4, "Viejos", 900, false)]} />);
    expect(screen.getByRole("header", { name: "Inventario" })).toBeOnTheScreen();
    expect(screen.getByText("No hay tipos activos")).toBeOnTheScreen();
  });
});
