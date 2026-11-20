import { fireEvent, render, screen, within } from "@testing-library/react-native";

import { BAR_COLUMN_MAX_WIDTH, BAR_MAX_HEIGHT, BAR_MIN_HEIGHT, SalesChart } from "@/components/sales-chart";
import type { SalesRow } from "@/logic/admin-dashboard";
import { theme } from "@/theme";

// Spec 007 · T5: "Ventas por tipo" (RF-7 to RF-12), as the orange card of the Figma: a bar per type
// with its name, maples and packs below, the best seller marked, and the period chips.
const ROWS: SalesRow[] = [
  { egg_type_id: 1, name: "Medianos", active: true, eggs_week: 240, eggs_month: 390, eggs_year: 900 },
  { egg_type_id: 2, name: "Grandes", active: true, eggs_week: 90, eggs_month: 195, eggs_year: 900 },
  { egg_type_id: 3, name: "Super", active: true, eggs_week: 0, eggs_month: 0, eggs_year: 30 },
];

describe("sales chart", () => {
  test("RF-8: the title and what the period counts", async () => {
    await render(<SalesChart rows={ROWS} period="month" onChange={() => {}} />);
    expect(screen.getByRole("header", { name: "Ventas por tipo" })).toBeOnTheScreen();
    expect(screen.getByText("Maples y packs vendidos este mes")).toBeOnTheScreen();
  });

  test.each([
    ["week", "Maples y packs vendidos esta semana"],
    ["year", "Maples y packs vendidos este año"],
  ] as const)("RF-8: the subtitle of %s", async (period, text) => {
    await render(<SalesChart rows={ROWS} period={period} onChange={() => {}} />);
    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  test("RF-7, RF-10: a bar per type with its name, maples and packs below, read as one text", async () => {
    await render(<SalesChart rows={ROWS} period="month" onChange={() => {}} />);
    const medianos = screen.getByLabelText("Medianos, 13 maples, 2 packs, más vendido");
    expect(within(medianos).getByText("Medianos")).toBeOnTheScreen();
    expect(within(medianos).getByText("13 maples")).toBeOnTheScreen();
    expect(within(medianos).getByText("2 packs")).toBeOnTheScreen();
    expect(within(medianos).getByText("Más vendido")).toBeOnTheScreen();
    expect(screen.getByLabelText("Grandes, 6 maples, 1 pack")).toBeOnTheScreen();
    expect(screen.getByLabelText("Super, 0 maples, 0 packs")).toBeOnTheScreen();
    expect(screen.getAllByText("Más vendido")).toHaveLength(1);
  });

  test("RF-7: the height of each bar follows its eggs; a bar at 0 is a thin line", async () => {
    await render(<SalesChart rows={ROWS} period="month" onChange={() => {}} />);
    expect(screen.getByTestId("bar-1")).toHaveStyle({ height: BAR_MAX_HEIGHT });
    expect(screen.getByTestId("bar-2")).toHaveStyle({ height: BAR_MAX_HEIGHT / 2 });
    expect(screen.getByTestId("bar-3")).toHaveStyle({ height: BAR_MIN_HEIGHT });
  });

  test("RF-10: the best seller is black, the others dark", async () => {
    await render(<SalesChart rows={ROWS} period="month" onChange={() => {}} />);
    expect(screen.getByTestId("bar-1")).toHaveStyle({ backgroundColor: theme.colors.black });
    expect(screen.getByTestId("bar-2")).toHaveStyle({ backgroundColor: theme.colors.primaryShade });
  });

  test("RF-10: in a tie, every type that sold most is marked", async () => {
    await render(<SalesChart rows={ROWS} period="year" onChange={() => {}} />);
    expect(screen.getAllByText("Más vendido")).toHaveLength(2);
  });

  test("the bars scroll sideways in their own row when there are many types", async () => {
    await render(<SalesChart rows={ROWS} period="month" onChange={() => {}} />);
    expect(screen.getByTestId("sales-bars")).toHaveProp("horizontal", true);
  });

  test("RF-8, RF-9: the period chips show the chosen one, and choosing another reports it", async () => {
    const onChange = jest.fn();
    await render(<SalesChart rows={ROWS} period="month" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Mes" })).toBeSelected();
    await fireEvent.press(screen.getByRole("button", { name: "Año" }));
    expect(onChange).toHaveBeenCalledWith("year");
  });

  test("RF-12: nothing sold in the period: no bars, it says so, and the chips stay", async () => {
    await render(<SalesChart rows={ROWS.map((row) => ({ ...row, eggs_week: 0 }))} period="week" onChange={() => {}} />);
    expect(screen.getByText("Sin ventas esta semana")).toBeOnTheScreen();
    expect(screen.queryByTestId("sales-bars")).toBeNull();
    expect(screen.getByRole("button", { name: "Semana" })).toBeSelected();
  });

  // T9 (audit and harden): with large text, "Más vendido" stays on one line above the bar instead of
  // growing over the subtitle; with one or two types, a bar stays a bar instead of filling the card.
  test("'Más vendido' stays on one line, shrinking with large text", async () => {
    await render(<SalesChart rows={ROWS} period="month" onChange={() => {}} />);
    const best = screen.getByText("Más vendido");
    expect(best.props.numberOfLines).toBe(1);
    expect(best.props.adjustsFontSizeToFit).toBe(true);
  });

  test("with few types, each bar keeps a bar's width, centered in the card", async () => {
    await render(<SalesChart rows={ROWS.slice(0, 1)} period="month" onChange={() => {}} />);
    expect(screen.getByLabelText(/^Medianos,/)).toHaveStyle({ maxWidth: BAR_COLUMN_MAX_WIDTH });
    expect(screen.getByTestId("sales-bars").props.contentContainerStyle).toEqual(
      expect.objectContaining({ justifyContent: "space-around" }),
    );
  });
});
