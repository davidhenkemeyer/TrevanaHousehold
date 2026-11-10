# Titan Household icon

Drawn from the Titan Branding Suite spec (§7.3): the geometric "T" engine mark in a gear, surrounded by a co-op progress ring, on a 135° gradient from Warm Amber `#D97706` to Soft Emerald `#059669`. Artwork stays inside the 64 px safe zone of a 512 px canvas.

| File                      | Use                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `icon.svg`                | Master, full-bleed square. Export to the iOS App Store / Expo `icon` (1024×1024 PNG).                                            |
| `icon-preview.svg`        | Rounded (22.37% radius) preview for docs, the web app, and the favicon.                                                          |
| `adaptive-foreground.svg` | Android adaptive icon foreground (mark at 85% to fit the launcher's safe circle). Also works as the Android 13+ monochrome icon. |
| `adaptive-background.svg` | Android adaptive icon background (the gradient).                                                                                 |

Stores need PNGs. Step 5 adds an export script that renders these to the sizes Expo expects. Don't round `icon.svg`: iOS and Android apply their own masks.

The mark is drawn from simple shapes (circles and rounded rectangles), so a designer can refine it without re-tracing anything.
