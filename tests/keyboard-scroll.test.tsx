import { render, screen } from "@testing-library/react-native";
import { Platform, Text } from "react-native";

import { AuthFormScreen } from "@/components/auth-form-screen";
import { KeyboardScroll } from "@/components/keyboard-scroll";

// How forms make room for the keyboard on each platform (Login, Sign-up and, from spec 003, the admin
// forms). iOS: the scroll view adjusts its insets and scrolls to the focused field without re-laying
// out the form. A KeyboardAvoidingView there re-centered the short Login form while iOS scrolled the
// field, so the focused input jumped out of sync. Android: Expo apps are edge-to-edge and the window
// does not resize, so KeyboardAvoidingView pads.
async function renderOn(os: "ios" | "android") {
  jest.replaceProperty(Platform, "OS", os);
  await render(
    <KeyboardScroll>
      <Text>campos</Text>
    </KeyboardScroll>,
  );
}

afterEach(() => jest.restoreAllMocks());

describe("keyboard scroll", () => {
  test("on iOS the scroll view adjusts its insets and there is no KeyboardAvoidingView", async () => {
    await renderOn("ios");
    expect(screen.getByTestId("keyboard-scroll")).toHaveProp("automaticallyAdjustKeyboardInsets", true);
    expect(screen.queryByTestId("keyboard-avoiding")).toBeNull();
  });

  test("on Android a KeyboardAvoidingView pads the form", async () => {
    await renderOn("android");
    expect(screen.getByTestId("keyboard-avoiding")).toBeOnTheScreen();
    expect(screen.getByTestId("keyboard-scroll")).not.toHaveProp("automaticallyAdjustKeyboardInsets", true);
  });

  test("taps on the fields and buttons work with the keyboard open", async () => {
    await renderOn("ios");
    expect(screen.getByTestId("keyboard-scroll")).toHaveProp("keyboardShouldPersistTaps", "handled");
  });

  test("Login and Sign-up use it", async () => {
    await render(
      <AuthFormScreen title="Iniciá sesión">
        <Text>campos</Text>
      </AuthFormScreen>,
    );
    expect(screen.getByRole("header", { name: "Iniciá sesión" })).toBeOnTheScreen();
    expect(screen.getByTestId("keyboard-scroll")).toBeOnTheScreen();
  });
});
