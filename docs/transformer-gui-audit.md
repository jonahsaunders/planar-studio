# Transformer GUI audit — 1.6 development

This audit covers Planar Studio's cross-platform browser and webview interface.

| Audit area | Finding | Implemented change |
| --- | --- | --- |
| Layout and hierarchy | A crowded parameter rail carried every task; comparison had limited space. | Dedicated Requirements, Candidates, Verify and Export working areas; the winding stage keeps canvas, stack and analysis; secondary fields use disclosure. |
| Modality | Long studies, comparisons and measurement workflows obscured the design in dialogs. | These tasks now open inline with a clear Back to overview action; changing stages terminates their workers and releases charts. Short export selection remains a dialog. |
| Typography and contrast | Small labels and muted secondary text made long sessions harder to scan. | Main work-area text is 14 px, supporting text 13 px, larger headings, stronger secondary text, light/dark theme support and increased-contrast rules. |
| Controls and keyboard access | Stages had no keyboard movement; drawing operations depended on dragging. | Arrow/Home/End stage navigation, one active tab stop, selected-state semantics, visible focus rings, labeled inputs, and numeric terminal/placement alternatives. |
| Feedback and error recovery | Study results disappeared; invalid or changed configurations were difficult to distinguish. | Persistent revision-tagged reports, explicit Pass/Fail/Unknown/Outdated text, linked findings, inline validation, cancelable progress, repair previews and checkpoints. |
| Color and chart access | Curves and candidate colors alone could not convey exact outcomes. | Text status and margins, named legends, keyboard-focusable candidate points, exact-value candidate cards, and expandable data tables for study/comparison/measurement curves. |
| Adaptation and motion | Fixed sidebars squeezed smaller windows. | Work-area cards reflow to one column; narrow windows stack navigation; reduced-motion and increased-contrast preferences are respected. |

The shared dialog behavior now moves focus to the dialog heading, makes the
background inert, contains Tab navigation and returns focus to the opener.
Workspace shortcuts pause while dialogs are open. Shared buttons, selects and
file controls use a 28-pixel target height. Compact study dialogs keep their
navigation and close action visible while the study itself scrolls.

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

Measured theme-token contrast for muted text against the raised control
surface is 5.07:1 (dark) and 5.18:1 (light). Primary-action text
contrast is 6.64:1 (dark) and 5.49:1 (light). These exceed the 4.5:1 ordinary-text
threshold for ordinary text. The measurements cover the listed text and surface pairs.

The browser accessibility tree and keyboard behavior were inspected on Windows.
Native webview, screen-reader and switch-control behavior remain unverified.
Board-file previews and isolated RPC regression tests cover placement review.
