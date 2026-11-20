// Runs before every test file (package.json → jest.setupFilesAfterEnv).

// Icon fonts load through expo-font, which has no native module in Jest: icons render nothing.
// Tests find icon buttons by their accessible label, never by the glyph.
// Reanimated needs its native UI runtime, which Jest does not have. "Reduce motion" is "off",
// Animated.View is a plain View with its style props (CSS animations included) and cubicBezier a
// string; a test that needs more (reduce motion on) mocks the module itself.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { View },
    cubicBezier: (...points: number[]) => `cubic-bezier(${points.join(", ")})`,
    useReducedMotion: () => false,
  };
});

// expo-image draws through a native view that hides its props in Jest: the stand-in is a View with the
// same props, so tests can check the SVG (`source`) and the color (`tintColor`) of an Icon.
jest.mock("expo-image", () => {
  const { createElement } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return { Image: (props: object) => createElement(View, props) };
});

jest.mock("@expo/vector-icons/Feather", () => ({
  __esModule: true,
  default: function Feather() {
    return null;
  },
}));

// The safe area comes from a provider that expo-router renders in the app; Jest has no native host
// for it, so the library's own mock gives zero insets (it is what its documentation recommends).
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
