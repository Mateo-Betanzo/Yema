import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { PageScreen } from "@/components/page-screen";
import { TAB_BAR_SPACE } from "@/components/tab-bar";

// The frame of the screens with a header (spec 003). Spec 005 · T5: pulling the list down refreshes it
// (RF-6), only on the screens that ask for it.
jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
// An iPhone with home bar: 34 pt of safe area at the bottom (the library mock gives 0).
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context/jest/mock").default,
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

describe("page screen", () => {
  test("RF-6: with onRefresh, pulling down calls it and shows the spinner while refreshing", async () => {
    const onRefresh = jest.fn();
    await render(
      <PageScreen title="Hola" back={false} onRefresh={onRefresh} refreshing>
        <Text>lista</Text>
      </PageScreen>,
    );
    const refreshControl = screen.getByTestId("keyboard-scroll").props.refreshControl;
    expect(refreshControl.props.refreshing).toBe(true);
    refreshControl.props.onRefresh();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // /feature 2026-11-18: the floating tab bar sits over the safe area, so a tab root leaves that room too.
  test("a tab root leaves room for the tab bar and the safe area below it", async () => {
    await render(
      <PageScreen title="Hola" back={false} tabRoot>
        <Text>lista</Text>
      </PageScreen>,
    );
    const content = screen.getByTestId("keyboard-scroll").props.contentContainerStyle;
    expect(content).toEqual(expect.arrayContaining([expect.objectContaining({ paddingBottom: TAB_BAR_SPACE + 34 })]));
  });

  test("a tab root with something floating (a footer) adds its room on top", async () => {
    await render(
      <PageScreen title="Hola" back={false} tabRoot footerSpace={80}>
        <Text>lista</Text>
      </PageScreen>,
    );
    const content = screen.getByTestId("keyboard-scroll").props.contentContainerStyle;
    expect(content).toEqual(expect.arrayContaining([expect.objectContaining({ paddingBottom: TAB_BAR_SPACE + 34 + 80 })]));
  });

  test("without onRefresh, the screen cannot be pulled to refresh", async () => {
    await render(
      <PageScreen title="Hola">
        <Text>formulario</Text>
      </PageScreen>,
    );
    expect(screen.getByTestId("keyboard-scroll").props.refreshControl).toBeUndefined();
  });

  test("a screen that is not a tab root keeps its 40 pt at the bottom (its safe area is the SafeAreaView's)", async () => {
    await render(
      <PageScreen title="Editar">
        <Text>formulario</Text>
      </PageScreen>,
    );
    const content = screen.getByTestId("keyboard-scroll").props.contentContainerStyle;
    expect(content).toEqual(expect.arrayContaining([expect.objectContaining({ paddingBottom: 40 })]));
  });
});
