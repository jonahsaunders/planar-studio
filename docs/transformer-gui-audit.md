# Transformer GUI audit — 1.6 development

This audit applies Apple's Human Interface Guidelines to Planar Studio's
cross-platform browser/webview interface. It does not claim native AppKit
conformance or Apple certification.

| Audit area | Finding | Implemented change |
| --- | --- | --- |
| Layout and hierarchy | A crowded parameter rail carried every task; comparison had limited space. | Dedicated Requirements, Candidates, Verify and Export working areas; the winding stage keeps canvas, stack and analysis; secondary fields use disclosure. |
| Modality | Long studies, comparisons and measurement workflows obscured the design in dialogs. | These tasks now open inline with a clear Back to overview action; changing stages terminates their workers and releases charts. Short export selection remains a dialog. |
| Typography and contrast | Small labels and muted secondary text made long sessions harder to scan. | Main work-area text is 14 px, supporting text 13 px, larger headings, stronger secondary text, light/dark theme support and increased-contrast rules. |
| Controls and keyboard access | Stages had no keyboard movement; drawing operations depended on dragging. | Arrow/Home/End stage navigation, one active tab stop, selected-state semantics, visible focus rings, labeled inputs, and numeric terminal/placement alternatives. |
| Feedback and error recovery | Study results disappeared; invalid or changed configurations were difficult to distinguish. | Persistent revision-tagged reports, explicit Pass/Fail/Unknown/Outdated text, linked findings, inline validation, cancelable progress, repair previews and checkpoints. |
| Color and chart access | Curves and candidate colors alone could not convey exact outcomes. | Text status and margins, named legends, keyboard-focusable candidate points, exact-value candidate cards, and expandable data tables for study/comparison/measurement curves. |
| Adaptation and motion | Fixed sidebars squeezed smaller windows. | Work-area cards reflow to one column; narrow windows stack navigation; reduced-motion and increased-contrast preferences are respected. |

Apple references: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout),
[Modality](https://developer.apple.com/design/human-interface-guidelines/modality),
[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility),
[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), and
[Color](https://developer.apple.com/design/human-interface-guidelines/color).

## Validation and limits

Engineering regression tests exercise linked/overridden operating points,
dependency-based evidence validity, multiple outputs and named load cases,
fully refined candidate metrics, solver-checked repairs, terminal route/model
agreement, rotation/net isolation and prototype/calibration matching.
Whole-app DOM tests use real study workers and cover keyboard tabs, saved report
reopening without recalculation, chart data tables, repeated imports, selected
prototype comparison, calibration selection, invalid terminal recovery and
worker cleanup. Browser checks cover rendered layout, theme contrast and narrow
working areas; screenshots accompany the development package.

Measured theme-token contrast for secondary text against the darkest/lightest
raised control surface is 5.87:1 (dark) and 6.10:1 (light). Primary-action text
contrast is 6.64:1 (dark) and 5.49:1 (light). These exceed the 4.5:1 ordinary-text
threshold described by Apple's accessibility guidance. This is a check of the
chosen text/surface pairs, not a claim that every rendered pixel was audited.

The browser accessibility tree and keyboard behavior were inspected on Windows.
VoiceOver, native macOS webview behavior, switch control and screen-reader
announcements on physical Apple hardware have not been tested. This remains a
desktop engineering interface, with horizontally scrollable tables where the
data requires it. Live placement was kept disconnected from a real PCB during
testing; board-file previews and isolated RPC regression tests cover that path.
