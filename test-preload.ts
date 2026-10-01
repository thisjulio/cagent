// ponytail: React ships act() only in the development build, and Bun defaults
// NODE_ENV to production, so every .tsx test that imports act fails to load.
// Preloads run before test modules are imported, which fixes the build react
// picks without changing the release build (bun start / bun run build stay
// production).
process.env.NODE_ENV = "development";
