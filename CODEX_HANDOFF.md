# Codex Handoff Notes

## Recent UI Update

Codex GPT-5.5 made minor modifications to the receipt approval app to add a CRM-inspired role selection login screen.

## Agentic Coordination Protocol

After each future edit, update this handoff file with:

- What changed.
- Which files were modified.
- What verification was run.
- Any known risk, follow-up, or reviewer-facing note.

Reason: this project is being coordinated across AI coding agents. Claude/Fable ran out of usable token budget, so this markdown file should act as the continuity layer between agents and preserve the working context without relying on chat history.

## What Changed

- Added a full-screen login gate styled after the Bala Chabad CRM login page.
- Added two Mac-style profile tiles side by side:
  - Employee: opens the employee upload/review/submission workflow.
  - Manager: opens the manager approval queue.
- Added a `Switch` button in the app header so the reviewer can return to the profile picker.
- Kept the existing lightweight role model: the frontend still sends `X-Role: employee|manager`, and manager-only actions remain enforced server-side.
- Preserved the existing receipt workflow, API behavior, tests, and database schema.

## Latest Edit: Upload Time + Delete Receipts

Codex GPT-5.5 added upload-time visibility and receipt deletion.

### What Changed

- Added `DELETE /api/receipts/{receipt_id}` to remove a receipt from SQLite and delete the uploaded file.
- Delete also clears `duplicate_of_id` references from other receipts before removing the target row.
- Added a `Delete` button to each row in the employee `My receipts` table.
- Deleting through the UI removes the entry from the page after the database delete succeeds.
- Added upload metadata to receipt details:
  - Uploaded time.
  - Original file name.
  - Last updated time.
- Added upload/submission metadata to the manager review modal.
- No database migration was needed for upload time because the schema already had `created_at` and `updated_at`.

### Files Modified

- `app/main.py`
- `static/app.js`
- `static/styles.css`
- `tests/test_workflow.py`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Verified the live server picked up the new delete route:
  - `DELETE /api/receipts/999999` now returns `404 Receipt not found` instead of `405 Method Not Allowed`.
- Ran a browser smoke test against `http://localhost:8080/`:
  - Employee view opens.
  - Delete buttons appear in `My receipts`.
  - Receipt details show uploaded-time metadata.
- Created a temporary receipt through the API, deleted it through the UI, and confirmed:
  - The row disappeared from the page.
  - `GET /api/receipts/{id}` returned `404`.

### Known Risk / Follow-Up

- Delete is available to the demo employee UI for all receipt statuses. If the app needs stricter business rules later, restrict deletion to draft-like states such as `uploaded`, `failed`, `review`, or `rejected`.
- The current demo auth model is still role-toggle/profile-selection based, not real authentication.

## Latest Edit: Sort My Receipts

Codex GPT-5.5 added frontend sorting controls to the employee `My receipts` section.

### What Changed

- Added a `Sort by` select in the `My receipts` table header.
- Supported sort modes:
  - Merchant A-Z.
  - Date newest first.
  - Date oldest first.
  - Total low to high.
  - Total high to low.
  - Stage order.
- Stage order is defined as:
  - `uploaded`
  - `processing`
  - `failed`
  - `review`
  - `rejected`
  - `submitted`
  - `approved`
- Sorting is frontend-only and operates on the already-loaded receipt list.

### Files Modified

- `static/index.html`
- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Ran a browser smoke test against `http://localhost:8080/`:
  - Employee view opens.
  - Sort control is visible.
  - All six sort options are present.
  - Each sort option can be selected while the receipt rows remain rendered.

### Known Risk / Follow-Up

- Date sorting uses `purchase_date` when present and falls back to `created_at` for unprocessed receipts.
- Total sorting places receipts without totals at the bottom for low-to-high.

## Latest Edit: Bulk Select + Delete Selected

Codex GPT-5.5 added multi-select deletion for receipts that were improperly added.

### What Changed

- Added a checkbox to each employee `My receipts` row.
- Added a conditional `Delete selected` button in the far-right action column after `Stage`.
- The bulk delete button appears only when one or more receipts are selected.
- The button label includes the selected count, for example `Delete selected (2)`.
- Bulk deletion calls the existing `DELETE /api/receipts/{id}` endpoint for each selected receipt, then refreshes the receipt table.
- If a selected receipt is open in the details panel or expanded inline, that state is cleared after deletion.
- Individual row-level `Delete` buttons remain available.

### Files Modified

- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Ran a browser smoke test against `http://localhost:8080/`:
  - Created two temporary receipts through the API.
  - Confirmed `Delete selected` is hidden before selection.
  - Checked both receipt checkboxes.
  - Confirmed `Delete selected (2)` appears.
  - Clicked `Delete selected` and accepted the confirmation dialog.
  - Confirmed both rows disappeared from the page.
  - Confirmed both receipt IDs returned `404` from the API.

### Known Risk / Follow-Up

- Bulk delete currently runs multiple existing single-delete API calls from the frontend. A future backend `DELETE /api/receipts` bulk endpoint could make this cleaner for large batches.

## Latest Edit: Message to Manager Popup

Codex GPT-5.5 changed the employee note flow from an inline textarea into a popup modal.

### What Changed

- Replaced the always-visible `Message to manager` textarea in receipt details with a single `Message to manager` button.
- Clicking the button opens a popup modal with:
  - A message textarea.
  - A 100-word counter and the same word-limit behavior.
  - `Submit message` and `Cancel` buttons.
- After a successful submit:
  - The message is saved through the existing `POST /api/receipts/{id}/message` endpoint.
  - The popup closes.
  - The receipt details panel refreshes.
  - The UI shows `Message sent.`
- Existing manager-view behavior still shows the employee note in the review modal.

### Files Modified

- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Ran a browser smoke test against `http://localhost:8080/`:
  - Created a temporary receipt through the API.
  - Opened the employee receipt details.
  - Confirmed `Message to manager` appears as a button.
  - Clicked the button and confirmed the popup appears.
  - Entered a message and clicked `Submit message`.
  - Confirmed the popup closed and receipt details showed `Message sent.`
  - Confirmed the API stored the note.
  - Deleted the temporary receipt afterward.

### Known Risk / Follow-Up

- The message popup reuses the existing global modal container used by manager review. This is fine for the current single-modal UI, but a future multi-modal design should split modal state by feature.

## Latest Edit: Camera Capture Import

Codex GPT-5.5 added a camera-friendly receipt import path.

### What Changed

- Added a `Take photo` button next to `Browse files` in the employee import card.
- Added a hidden camera-specific file input:
  - `accept="image/*,.heic,.heif"`
  - `capture="environment"`
- On mobile devices, the button should open the rear camera when supported by the browser.
- On desktop, the same button falls back to image file selection.
- Captured/selected photos use the existing staging flow:
  - The image appears in `Receipt preview`.
  - `Submit receipt` appears.
  - Nothing is saved to `My receipts` until `Submit receipt` is pressed.
- Updated validation so camera images with generic file names are accepted when the MIME type starts with `image/`.

### Files Modified

- `static/index.html`
- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Ran a browser smoke test against `http://localhost:8080/`:
  - Employee view opens.
  - `Take photo` button is visible.
  - Camera input has `capture="environment"`.
  - Setting an image file through the camera input stages it into the receipt preview.
  - `Submit receipt` becomes visible.

### Known Risk / Follow-Up

- Browser camera behavior depends on device/browser support. Mobile Safari/Chrome generally honor `capture="environment"`; desktop browsers usually open a file picker.

## Latest Edit: Drop Zone No Longer Acts As Browse Button

Codex GPT-5.5 fixed the import area so only explicit buttons open file/camera inputs.

### What Changed

- Removed the click handler from the entire drag-and-drop zone.
- The drop zone still supports drag/drop.
- `Browse files` is now the only control that opens the regular file picker.
- `Take photo` is now the only control that opens the camera/image input.
- Removed the pointer cursor from the drop zone so it does not look like one giant button.

### Files Modified

- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Ran a browser smoke test against `http://localhost:8080/`:
  - Clicking drop-zone text does not stage/open anything.
  - `Browse files` remains visible.
  - `Take photo` remains visible.
  - Camera input still has `capture="environment"`.
  - Setting a camera image stages it into the receipt preview.

### Known Risk / Follow-Up

- None. This keeps drag/drop behavior while making the two import buttons independent.

## Latest Edit: Real Camera Capture

Codex GPT-5.5 upgraded `Take photo` from a camera-friendly file picker to actual browser camera capture.

### What Changed

- `Take photo` now opens a camera popup using `navigator.mediaDevices.getUserMedia`.
- The popup shows a live camera preview.
- `Capture photo` grabs the current video frame into a JPEG file.
- The captured image uses the existing staging flow:
  - The popup closes.
  - The captured photo appears in `Receipt preview`.
  - `Submit receipt` becomes visible.
  - The receipt is not saved to `My receipts` until `Submit receipt` is clicked.
- Added camera cleanup so the video stream stops when the modal closes.
- Kept a `Choose image` fallback inside the camera popup for browsers/devices without camera support or permission.

### Files Modified

- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Ran a browser smoke test against `http://localhost:8080/` using Chrome's fake camera device:
  - `Take photo` opens the camera modal.
  - Camera status becomes `Camera ready.`
  - `Capture photo` becomes enabled.
  - Capturing a frame closes the modal.
  - The captured image appears in `Receipt preview`.

### Known Risk / Follow-Up

- Real camera access requires browser permission and a secure context. `localhost` is treated as secure by modern browsers, but deployed usage should be over HTTPS.

## Latest Edit: Camera Permission Recovery

Codex GPT-5.5 improved the camera popup for permission-denied states.

### What Changed

- The camera modal now explicitly shows `Requesting camera permission...` while asking the browser.
- If the browser denies camera access, the UI now shows:
  - `Camera permission is blocked for this site.`
  - A recovery note telling the user to allow camera access for localhost in the browser camera/site settings.
  - A `Request permission again` button.
  - The existing `Choose image` fallback.
- Added camera stream cleanup before each retry so repeated permission attempts do not leave stale tracks running.

### Files Modified

- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Ran browser smoke tests against `http://localhost:8080/`:
  - With fake camera permission allowed: camera reaches `Camera ready.` and captured image appears in receipt preview.
  - With camera permission denied: modal shows the blocked-permission message, `Request permission again`, and the help text.

### Known Risk / Follow-Up

- Browser APIs cannot force camera permission after a user or browser has blocked it. The user may need to use the browser camera icon or site settings to allow camera access for `localhost:8080`, then click `Request permission again`.

## Latest Edit: Single-Card Import to Preview Flow

Codex GPT-5.5 simplified the employee receipt import flow so import and preview are no longer separate cards.

### What Changed

- Removed the separate side-by-side `Receipt preview` card.
- The employee import card now starts as `Import file`.
- After a receipt file/photo is selected, photographed, dropped, or randomly staged:
  - The import controls hide.
  - The same card header changes to `Receipt preview`.
  - The receipt preview appears in the same location where import controls were.
  - The action button reads `Submit for AI extraction`.
- Updated the uploaded-state helper copy to reference `Submit for AI extraction`.

### Files Modified

- `static/index.html`
- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Ran a browser smoke test against `http://localhost:8080/`:
  - Initial employee view shows `Import file`.
  - Drop zone is visible initially.
  - Receipt preview is hidden initially.
  - Selecting an image through the file input changes the header to `Receipt preview`.
  - Drop zone hides after file selection.
  - Preview image appears in the same card.
  - Button text is `Submit for AI extraction`.

### Known Risk / Follow-Up

- The current flow hides import controls once a file is staged. To choose a different file before submitting, the user can refresh or select another receipt; a future `Choose different file` button could make that explicit.

## Latest Edit: Extracted Details Popup + Receipt Naming

Codex GPT-5.5 moved employee extracted-details review into a popup and added editable receipt names.

### What Changed

- Added a `receipt_name` database field via migration.
- Added `receipt_name` to the receipt update API so employees can rename receipts while reviewing/editing extracted data.
- After AI extraction or clicking `Edit`, the receipt preview stays in the import card and `Extracted details` now opens in the modal overlay.
- Replaced the visible `Extracted details — receipt #...` heading with a `Name receipt` section.
- Added a `Receipt name` input at the top of the extracted-fields form.
- Updated employee tables, sort-by-merchant behavior, manager modal titles, message modal titles, and delete confirmations to prefer the custom receipt name.
- Widened the extracted-details modal so the edit form has room to breathe.

### Files Modified

- `migrations/003_receipt_name.sql`
- `app/main.py`
- `static/app.js`
- `static/styles.css`
- `tests/test_workflow.py`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Restarted the local server and confirmed `http://localhost:8080/` returned `200`, applying migration `003_receipt_name.sql` to the live development database.
- Ran a live API smoke test against `http://localhost:8080/`:
  - Created a temporary receipt.
  - Put it into review status for editability.
  - Patched `receipt_name` to `Smoke Test Receipt`.
  - Confirmed the API returned `Smoke Test Receipt`.
  - Deleted the temporary receipt.
- In-app browser automation was unavailable in this thread, so the modal UI change was verified through code review plus the existing restarted local app.

### Known Risk / Follow-Up

- Existing receipts will have `receipt_name = NULL` until renamed, so the UI falls back to merchant, then original filename.

## Latest Edit: Receipt Preview Inside AI Extraction Popup

Codex GPT-5.5 added the source receipt preview into the employee AI extraction review popup.

### What Changed

- The `Extracted details` modal now includes a receipt preview panel in the same popup.
- The extracted fields and line items sit next to the receipt preview on desktop for easier comparison.
- On smaller screens, the preview stacks below the editable fields.
- PDF previews use the existing embedded PDF viewer; image receipts use the existing image preview path.

### Files Modified

- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.

### Known Risk / Follow-Up

- None. This reuses the existing `previewHtml` rendering path already used by the main receipt preview.

## Latest Edit: Reset Import Screen After Submit

Codex GPT-5.5 updated the employee submit flow so the workspace is ready for the next receipt immediately after submission.

### What Changed

- After `Submit for approval` succeeds from the extracted-details popup:
  - The popup closes.
  - The selected receipt is cleared.
  - The expanded receipt row is cleared.
  - The import card resets back to `Import file`.
  - The receipts list refreshes with the submitted item in its updated stage.

### Files Modified

- `static/app.js`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.

### Known Risk / Follow-Up

- None. Save/retry/override still keep the receipt detail popup open; only successful approval submission resets the import screen.

## Latest Edit: Clickable AI Confidence Explanations

Codex GPT-5.5 made the AI confidence scores interactive and explanatory.

### What Changed

- Every AI-extracted field in the review modal now shows a confidence badge:
  - Merchant name
  - Purchase date
  - Total amount
  - Currency
  - Tax
  - Line items
- Confidence badges are now clickable buttons instead of static text.
- Clicking a badge opens a small explanation popup over the existing receipt review modal.
- The popup explains:
  - The score value.
  - Whether it is high, medium, low, or unavailable.
  - That the number comes from the AI extractor's structured JSON response at `confidence.<field>`, scored from `0.0` to `1.0`.
  - What evidence the AI uses for that specific field.
- Missing confidence values display as `N/A` and still open an explanation.
- Manager read-only review fields also retain clickable confidence badges.

### Files Modified

- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.
- Verified the confidence UI hooks exist in the static bundle:
  - `data-conf-field`
  - `openConfidenceModal`
  - `.confidence-overlay`

### Known Risk / Follow-Up

- The AI returns one score for `line_items` as a whole rather than separate scores per individual line item, matching the current extraction schema.

## Latest Edit: Anonymized Employee Display Name

Codex GPT-5.5 replaced the personal employee display name in the UI with an anonymized employee label.

### What Changed

- Replaced the employee profile name with `Employee #427 - Parable, Stanley`.
- Replaced employee initials from `JG` to `SP`.
- Updated both the login tile and topbar fallback values.

### Files Modified

- `static/app.js`
- `static/index.html`
- `CODEX_HANDOFF.md`

### Verification

- Searched the app for the previous personal name/initials; no matches remain in the searched project files.
- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.

### Known Risk / Follow-Up

- None.

## Latest Edit: README Submission Coverage

Codex GPT-5.5 expanded the README so it directly covers the take-home deliverable checklist.

### What Changed

- Expanded the feature list into clear sections:
  - Employee workflow
  - Manager workflow
  - AI extraction
  - Bonus features implemented
- Clarified local setup steps, including optional `.env` usage.
- Clarified Docker setup with and without `ANTHROPIC_API_KEY`.
- Expanded the test coverage description.
- Expanded the AI tools section to separately document:
  - Claude Code / Claude Fable 5 for initial development
  - Codex GPT-5.5 for follow-up polish and verification
  - Anthropic Claude API / mock extractor for receipt processing
  - Agentic coordination docs
- Expanded potential future improvements.

### Files Modified

- `README.md`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.

### Known Risk / Follow-Up

- None. This was a documentation-only update.

## Files Modified

- `static/index.html`
- `static/styles.css`
- `static/app.js`

## Verification

- Ran the project test suite with the local virtualenv: `7 passed`.
- Ran a browser smoke test against `http://localhost:8080/`:
  - Login screen appears.
  - Manager profile opens the manager view.
  - Employee profile opens the employee view.

## Suggested README Note

In the AI tools section, mention:

> Development used Claude Code for the initial implementation. Codex GPT-5.5 made minor UI/workflow polish modifications, including the CRM-inspired role selection login screen and browser smoke verification.
