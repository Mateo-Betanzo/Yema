import { fireEvent, render, screen } from "@testing-library/react-native";

import { SegmentedControl } from "@/components/segmented-control";

// Spec 003 · T6: the two-option pill ("Productos · Stock", RF-25; later "Resumen · Historial").
const options = [
  { value: "products", label: "Productos" },
  { value: "stock", label: "Stock" },
] as const;

describe("segmented control", () => {
  test("each option is a tab with its label; the chosen one is selected", async () => {
    await render(<SegmentedControl options={options} value="stock" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Stock" })).toBeSelected();
    expect(screen.getByRole("tab", { name: "Productos" })).not.toBeSelected();
  });

  test("choosing another option reports its value; the chosen one reports nothing", async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl options={options} value="products" onChange={onChange} />);
    await fireEvent.press(screen.getByRole("tab", { name: "Stock" }));
    expect(onChange).toHaveBeenCalledWith("stock");
    await fireEvent.press(screen.getByRole("tab", { name: "Productos" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  test("each option is at least 48 pt tall", async () => {
    await render(<SegmentedControl options={options} value="products" onChange={() => {}} />);
    for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveStyle({ minHeight: 48 });
  });
});
