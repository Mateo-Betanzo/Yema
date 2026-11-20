import type { ReactElement, ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type Props = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Pull to refresh (spec 005: the admin Home). */
  refreshControl?: ReactElement<RefreshControlProps>;
};

// A scroll view that keeps the focused field and the button above the keyboard, for every form
// (Login and Sign-up in spec 002, the admin forms in spec 003).
// iOS: the insets follow the keyboard and the focused field is scrolled into view, without re-laying
// out the form. A KeyboardAvoidingView there re-centered the short Login form while iOS scrolled the
// field, so the focused input jumped out of sync.
// Android: Expo apps are edge-to-edge, so the window no longer resizes for the keyboard and the form
// needs the padding (Expo's keyboard-handling guide).
export function KeyboardScroll({ children, contentContainerStyle, refreshControl }: Props) {
  const scroll = (
    <ScrollView
      testID="keyboard-scroll"
      contentContainerStyle={contentContainerStyle}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
    >
      {children}
    </ScrollView>
  );

  if (Platform.OS === "ios") return scroll;
  return (
    <KeyboardAvoidingView testID="keyboard-avoiding" style={styles.fill} behavior="padding">
      {scroll}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
