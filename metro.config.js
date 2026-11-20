// Metro, as Expo's default plus the .wasm of wa-sqlite, which expo-sqlite imports on web (docs of
// SDK 58, "Web setup"; /feature 2026-11-19). Without COEP and COOP headers on purpose: the app opens no
// SQLite database on web (its localStorage is a no-op there), and COOP "same-origin" cuts the popup of
// "Continuar con Google" off from the app (bug of 2026-11-19).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");

module.exports = config;
