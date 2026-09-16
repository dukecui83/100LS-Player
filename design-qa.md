# Design QA

- Source visual truth: `C:\Users\dukecui\AppData\Local\Temp\codex-clipboard-5ea831cc-085d-4ea2-8277-86b8748fe30e.png`, together with the user's request to reveal the correct answer near an incorrect dictation word.
- Implementation screenshot: `E:\Englisn learner player\output\design-qa\dictation-correct-answer-hint.png`
- Full-view comparison: `E:\Englisn learner player\output\design-qa\dictation-answer-hint-comparison.png`
- Focused comparison: `E:\Englisn learner player\output\design-qa\dictation-answer-hint-focus.png`
- Viewport: Windows Electron desktop window, 1482 x 941 CSS pixels at 1x density.
- Pixel dimensions: source 1482 x 941; implementation 1482 x 941. No size or density normalization was required for the full-view comparison. The focused comparison aligns equivalent dictation-panel crops.
- State: S01E01 cue `My name is Mary Alice Young.` loaded in dictation mode, paused after the cue, with five correct entries and `yuang` entered incorrectly for `Young`.

## Full-view comparison evidence

The existing player, transcript, transport, dictation actions, and six word fields retain their positions and visual hierarchy. The implementation adds only a compact answer hint beneath the incorrect field and grows the dictation content area enough to contain it without covering the shortcut strip or action buttons.

## Focused comparison evidence

Before the change, `yuang` was only outlined in red. After the change, the same red error state remains and a green `正确：Young` hint appears directly beneath that field. Correct fields do not receive redundant answer text.

## Required fidelity surfaces

- Fonts and typography: Existing input typography remains unchanged. The new hint uses a compact 10px semibold label that is readable without competing with the entered word.
- Spacing and layout rhythm: Word widths and gaps are preserved. A 5px vertical gap separates the incorrect input from its answer, and the scrollable input region can expand to 118px for wrapped or multi-row content.
- Colors and visual tokens: The existing red error state is preserved; the answer uses the established success-green token to communicate the correct form.
- Image quality and asset fidelity: Video, logo, control, and icon assets are unchanged.
- Copy and content: Existing copy is unchanged. Incorrect entries add `正确：{expected word}` using the original subtitle capitalization.

## Interaction checks

- Entered `my name is Mary alice yuang` and pressed Enter; only `yuang` displayed `正确：Young`.
- Edited an incorrect word; its old correctness styling and answer hint cleared immediately.
- Pressed Enter again after correction; the score and per-word correctness state updated normally.
- Existing user-owned player window was not used for testing.

## Findings

- No actionable P0, P1, or P2 visual or interaction differences remain for the requested answer-hint behavior.

## Comparison history

- Pass 1: The supplied screenshot showed an error state with no discoverable correct spelling.
- Fix: Wrapped each dictation input in a word slot and added a hidden per-word answer label, shown only when the checked result is incorrect.
- Pass 2: Live validation reproduced the supplied six-word sentence and confirmed the answer appears below only the incorrect word, without overlap or layout breakage.

## Follow-up polish

- No P3 polish is required for this scope.

final result: passed
