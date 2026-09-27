# Motion and effects

## Terms

- **Motion** is the shared preference for animated UI: `normal` or `reduced`, represented by `ThemeTokens.motion`.
- **Animation** is the timed sequence of rendered frames used to create motion.
- **Effect** is the reusable visual treatment applied to content, such as `ShimmerText` applying a moving highlight to text.

Effects own their rendering and animation lifecycle. Product components choose when the effect represents meaningful state; for example, `TaskPanel` applies `ShimmerText` only to the active task.

## Contract

- Animate active work or attention only; keep the same state understandable without animation.
- Use semantic theme colors. Do not rely on color or motion as the only status signal.
- When motion is `reduced`, render the effect's static semantic appearance and do not schedule recurring updates.
- Clean up timers or subscriptions when an animated component unmounts or becomes inactive.
- Keep effect timing local until multiple effects demonstrate a need for shared duration tokens or an animation controller.

`ActivitySpinner` is the existing animated activity indicator. `ShimmerText` is the reusable text effect primitive; other product components can use it without implementing their own animation loop.
