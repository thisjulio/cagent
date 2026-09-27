# Accessibility

- Pair important state colors with a symbol and a text label.
- Keep focus visible and keyboard operation complete.
- Maintain legibility in dark and light terminal themes; leave the terminal background transparent.
- Use centralized state symbols and provide plain text around them so meaning survives limited Unicode rendering.
- Keep primary information available in compact layouts; remove metadata before truncating meaning.
- Motion communicates active work or attention only. Reduced-motion mode must disable persistent animation. See [motion and effects](motion-effects.md).

Terminal renderers do not expose the same screen-reader semantics as browsers. Prefer concise, stable text and avoid conveying information through position, color, or animation alone.
