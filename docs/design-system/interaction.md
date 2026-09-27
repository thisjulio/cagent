# Interaction contract

Input is handled by the currently active surface before global shortcuts. Blocking prompts and pickers own their keys; the composer owns editing keys; global shortcuts run only when no surface claims the input.

| Key | Default intent |
| --- | --- |
| Esc | Close, cancel, or go back in the active surface. |
| Enter | Confirm, submit, or open in the active surface. |
| Up / Down | Navigate the active list or selection. |
| PageUp / PageDown | Page the transcript or active inspector. |
| Shift+Tab | Cycle permission mode when no overlay is active. |

The transcript follows new output until the user pages upward. While detached from the bottom, it preserves the reading position and reports accumulated output; PageDown back to the bottom resumes following. Inspectors route paging to their own `Scrollable` surface. The Session Picker reserves Tab for project/all scope. Help maps Ctrl+P to the Command Palette.

Visible shortcuts are part of the tested contract. Do not show a key hint unless the active input path implements it. Focus and selection must remain distinguishable without color alone; mouse support is additive.
