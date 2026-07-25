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

## Latest Edit: Railway Port Compatibility

Codex GPT-5.5 updated the Docker entrypoint so the app can bind to Railway's injected `PORT`.

### What Changed

- Changed the Docker command from a fixed `--port 8000` to `--port ${PORT:-8000}`.
- Local Docker still defaults to port `8000`.
- Railway can now route traffic to the runtime-provided port.

### Files Modified

- `Dockerfile`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.

### Known Risk / Follow-Up

- Railway's filesystem is ephemeral unless a volume is attached. The current SQLite setup is fine for a take-home demo, but production should use a Railway volume or managed database.

## Latest Edit: Railway Deployment

Codex GPT-5.5 deployed the app to Railway and documented the live URL.

### What Changed

- Created Railway project `receipt-approval`.
- Created Railway service `web`.
- Set production variables:
  - `ANTHROPIC_API_KEY` from the local `.env` file, without printing the secret.
  - `RECEIPT_AI_PROVIDER=claude`.
- Deployed commit `953e5da` to Railway.
- Generated the Railway public domain: `https://web-production-4df88.up.railway.app`.
- Added the live demo URL to the README.

### Files Modified

- `README.md`
- `CODEX_HANDOFF.md`

### Verification

- Railway deployment `9c4e89de-cc67-4b9e-aada-9b3766ee8aa6` reported `SUCCESS`.
- Verified homepage: `GET /` returned `200`.
- Verified metadata: `GET /api/meta` returned `200` with `{"ai_provider":"claude"}`.

### Known Risk / Follow-Up

- Railway filesystem is ephemeral unless a volume is attached. Uploaded receipts and SQLite data may reset across redeploys/restarts; acceptable for a take-home demo, but production should attach persistent storage or move to Postgres/object storage.

## Latest Edit: Submission Audit Button + Manager Response Log

Codex GPT-5.5 added an explicit submission audit popup for employees and managers.

### What Changed

- Added an `Audit` button to receipt rows.
- The `Audit` button opens a popup showing:
  - Submitted time.
  - Manager reviewed time.
  - Receipt total.
  - Current status.
  - A highlighted manager response:
    - Waiting for manager response.
    - Approved by manager.
    - Rejected by manager with comment.
  - Full receipt audit timeline.
- Added readable labels for audit actions so the popup is understandable to both employee and manager users.
- Made backend audit details more descriptive for:
  - `submitted`
  - `approved`
  - `rejected`
- Added test assertions for descriptive submit/approve/reject audit details.

### Files Modified

- `app/main.py`
- `static/app.js`
- `static/styles.css`
- `tests/test_workflow.py`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.

### Known Risk / Follow-Up

- Existing historical audit rows still have their original shorter detail text. New submissions/manager responses will use the more descriptive audit detail text.

## Latest Edit: Tracked Synthetic Random Receipt Samples

Codex GPT-5.5 fixed the deployed `Try random receipt` feature by adding sample receipt assets to the repository.

### What Changed

- Removed the `.gitignore` rule that excluded `static/sample-receipts/`.
- Replaced the previous local-only sample receipt images with synthetic demo receipt images generated specifically for this repository.
- Added 12 tracked sample receipt JPG files plus `manifest.json`.
- Updated the README to note that included sample receipts are synthetic demo images and not real purchases.

### Files Modified

- `.gitignore`
- `README.md`
- `static/sample-receipts/manifest.json`
- `static/sample-receipts/synthetic-receipt-01.jpg` through `synthetic-receipt-12.jpg`
- `CODEX_HANDOFF.md`

### Verification

- Confirmed local manifest endpoint returned `200`.
- Confirmed a local sample image returned `200 image/jpeg`.
- Ran the project test suite with the local virtualenv: `8 passed`.

### Known Risk / Follow-Up

- None. The sample files are intentionally tracked so Railway includes them in the deployed static bundle.

## Latest Edit: Camera Permission Block Recovery

Codex GPT-5.5 improved the camera modal behavior when a browser has already hard-blocked camera permission.

### What Changed

- Added a browser permission-state check before retrying `getUserMedia`.
- If camera permission is already `denied`, the modal no longer implies the browser prompt can be reopened automatically.
- Renamed the retry action to `I changed settings - try camera`.
- Added an `Open site settings help` button that repeats clear recovery instructions.
- The help text now tells the user to use the address-bar camera icon or site settings, set Camera to Allow, then retry.
- `Choose image` remains available as the reliable fallback.

### Files Modified

- `static/app.js`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.
- Verified the static bundle contains the new blocked-permission controls.

### Known Risk / Follow-Up

- Browser JavaScript cannot force a permission prompt after a hard block. The user must change browser/site settings first, then retry.

## Latest Edit: Railway Upload Persistence + Stale Receipt Recovery

Codex GPT-5.5 fixed the deployed upload flow after a Railway redeploy exposed stale receipt IDs in the open browser tab.

### What Changed

- Added frontend recovery for stale/missing selected receipt IDs.
- If a selected receipt no longer exists, the app now:
  - Clears selected and expanded receipt state.
  - Closes any detail modal.
  - Resets the import card back to `Import file`.
  - Shows a clear message asking the user to upload or choose the file again.
- Added the same recovery path around extract errors so users no longer only see `Receipt not found`.
- Created a Railway volume:
  - Name: `web-volume`
  - Mount path: `/data`
  - Size: 5 GB
- Set Railway variable `RECEIPT_DATA_DIR=/data`, so SQLite and uploaded receipt files persist across redeploys.
- Updated the README Railway deployment note to document the persistent volume.

### Files Modified

- `static/app.js`
- `README.md`
- `CODEX_HANDOFF.md`

### Verification

- Confirmed live API upload and fetch worked on Railway before the fix, isolating the issue to stale UI state/persistence across deploys.
- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed Railway volume `web-volume` is attached to service `web` at `/data`.
- Deployed commit `a1217b2` to Railway.
- Verified live Railway upload/extract path:
  - `POST /api/receipts` returned `201`.
  - `GET /api/receipts/1` returned `200`.
  - `POST /api/receipts/1/extract` returned `200`.
  - Polling moved the receipt to `review` with merchant `Metro Office Supply`.
- Railway logs show the volume mounting before app startup.

### Known Risk / Follow-Up

- Any receipts uploaded before the volume was attached lived on the old ephemeral filesystem and may not be present in the new persistent database. New uploads should persist across future redeploys.

## Latest Edit: Dynamic File Type Under Receipt Preview

Codex GPT-5.5 added visible file-type metadata below receipt previews.

### What Changed

- Added a reusable file-type label helper for receipt previews.
- The preview now dynamically shows `File type: ...` below the receipt for:
  - Uploaded receipts from the API.
  - Staged files before upload.
  - PDF previews.
  - Image previews.
- Supported labels include PDF document, JPEG image, PNG image, HEIC image, WebP image, GIF image, generic image types, and unknown file.
- The label appears in the main import preview, employee extraction modal, and manager review modal because they all reuse the same preview rendering path.

### Files Modified

- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.
- Verified the static bundle contains `fileTypeLabel` and `.file-type-meta`.

### Known Risk / Follow-Up

- None.

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

## Latest Edit: Trimmed README to a Brief

Claude Code (Fable 5) rewrote the README to match the brief's "brief README" ask.

### What Changed

- Cut the README from ~147 lines to ~55: one-paragraph intro, a "What it does" section mapping to the brief's requirements, condensed Setup (local/Docker/tests/config table), tightened "AI tools used", and the three required sections only.
- Kept the Railway live-demo link near the top.
- Rewrote "Potential future improvements" to three items at the developer's direction: (1) user authentication, (2) clearer manager review criteria, (3) mostly-automated manager with human-in-the-loop escalation for exceptions over a defined parameter.
- Removed the long marketing-style feature lists and the standalone Architecture section (its essentials folded into Setup).

### Files Modified

- `README.md`
- `CODEX_HANDOFF.md`

### Verification

- Docs-only change; no application code touched.
- Ran the project test suite with the local virtualenv: `8 passed`.

### Known Risk / Follow-Up

- None. The removed feature detail is still discoverable in the app and in this handoff log.

## Latest Edit: Try Another Receipt Button

Codex GPT-5.5 added a reset button under the live receipt preview.

### What Changed

- Added `Try another receipt` under the receipt preview action area.
- Clicking it clears the current staged/selected preview.
- The import card returns to `Import file` with the upload/drop/photo controls visible again.
- Already-uploaded receipts are not deleted; this only resets the current preview/import workflow.

### Files Modified

- `static/index.html`
- `static/app.js`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.
- Verified the static bundle contains `try-another-btn` and `resetImportFlow`.

### Known Risk / Follow-Up

- None.

## Latest Edit: Rename Add Another Receipt Button

Codex GPT-5.5 changed the receipt preview reset button copy.

### What Changed

- Renamed the visible button from `Try another receipt` to `Add another receipt`.
- Kept the existing reset behavior and internal button ID.

### Files Modified

- `static/index.html`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.

### Known Risk / Follow-Up

- None.

## Latest Edit: Mobile Recently Reviewed Readability

Codex GPT-5.5 improved the manager `Recently reviewed` table on mobile only.

### What Changed

- Added mobile-only CSS scoped to `#manager-done-table`.
- On screens under 620px:
  - The table header hides.
  - Each reviewed receipt row becomes a compact stacked grid.
  - Merchant/file text can wrap instead of being truncated.
  - Date and total get their own readable row.
  - Stage and Audit button sit on the bottom row.
  - Text color/weight is strengthened for better contrast.
- Desktop layout and employee receipt tables are unchanged.

### Files Modified

- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.
- Verified CSS selectors target `#manager-done-table` specifically.

### Known Risk / Follow-Up

- None.

## Latest Edit: Mobile Employee Receipts Readability

Codex GPT-5.5 applied the mobile stacked-row treatment to the employee `My receipts` table.

### What Changed

- Added mobile-only CSS scoped to `#employee-table`.
- On screens under 620px:
  - The table header hides.
  - Each receipt row becomes a compact stacked grid.
  - Checkbox and receipt ID remain accessible on the left.
  - Merchant/file text can wrap instead of being truncated.
  - Date and total get their own readable row.
  - Stage spans the bottom-left.
  - Audit/Edit/Delete controls sit on the bottom-right and wrap as needed.
- Desktop layout and manager tables are unchanged.

### Files Modified

- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.
- Verified CSS selectors target `#employee-table` specifically.

### Known Risk / Follow-Up

- None.

## Latest Edit: README Source Code and DB Schema Section

Codex GPT-5.5 made the assignment deliverable language more explicit in the README.

### What Changed

- Added a `Source code & DB schema/migrations` section.
- Linked the backend source directory, frontend source directory, and numbered SQL migrations.
- Clarified that migrations are applied automatically at startup.

### Files Modified

- `README.md`
- `CODEX_HANDOFF.md`

### Verification

- Docs-only change; no application code touched.
- Confirmed the README now uses the assignment's requested wording.

### Known Risk / Follow-Up

- None.

## Latest Edit: README Readability Pass

Codex GPT-5.5 cleaned up the README formatting so the GitHub page is easier to scan as a job submission.

### What Changed

- Reworked the intro into a concise project summary.
- Added a small links table for the live demo and walkthrough video.
- Replaced longer bullets with clearer feature and AI-tools tables.
- Split setup into local, Docker, tests, and configuration sections.
- Standardized assignment-facing headings, including `Source Code & DB Schema/Migrations`, `AI Tools Used`, and `Potential Future Improvements`.

### Files Modified

- `README.md`
- `CODEX_HANDOFF.md`

### Verification

- Docs-only change; no application code touched.
- Reviewed the README headings and required deliverable sections after the edit.

### Known Risk / Follow-Up

- None.

## Latest Edit: README Mobile Support Note

Codex GPT-5.5 added a concise README feature note for mobile usability.

### What Changed

- Added a `Mobile support` row to the README feature table.
- Mentioned responsive employee/manager views.
- Mentioned mobile-friendly receipt upload and camera capture.

### Files Modified

- `README.md`
- `CODEX_HANDOFF.md`

### Verification

- Docs-only change; no application code touched.
- Confirmed the note is placed in the README feature table near the import methods row.

### Known Risk / Follow-Up

- None.

## Latest Edit: README Claude Extraction Prominence

Codex GPT-5.5 made the Claude receipt-processing path more prominent in the README.

### What Changed

- Added a dedicated `Claude-Powered Receipt Extraction` section near the top of the README.
- Clarified that uploaded receipt images/PDFs are sent to the Anthropic Claude API when `ANTHROPIC_API_KEY` is configured.
- Clarified that Claude returns structured JSON plus confidence metadata for the review UI.
- Renamed the feature table row from `AI extraction` to `Claude AI extraction`.

### Files Modified

- `README.md`
- `CODEX_HANDOFF.md`

### Verification

- Docs-only change; no application code touched.
- Confirmed the Claude extraction section appears before the feature table.

### Known Risk / Follow-Up

- None.

## Latest Edit: Receipt Preview Restart After Submit

Codex GPT-5.5 updated the employee receipt preview flow so employees can restart immediately after submitting a receipt for manager approval.

### What Changed

- Added a state-aware preview action helper for `Submit for AI extraction` and `Add another receipt`.
- After submitting a reviewed receipt for manager approval, the receipt preview remains visible instead of returning directly to the import card.
- In that submitted-preview state, `Submit for AI extraction` is hidden and `Add another receipt` remains visible.
- Selecting an existing receipt also shows `Add another receipt`, while uploaded/failed receipts still show the extraction button.

### Files Modified

- `static/app.js`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.
- Ran `node --check static/app.js` successfully.

### Known Risk / Follow-Up

- None expected; this is frontend state handling only.

## Latest Edit: Stage Tracker Readability

Codex GPT-5.5 simplified the receipt stage tracker styling so table rows are easier to read.

### What Changed

- Changed completed and inactive workflow stage pills to neutral grey.
- Changed the current workflow stage pill to blue across all statuses.
- Kept final approved/rejected outcomes visually distinct.
- Allowed the stage tracker to wrap inside its own column so it does not cover receipt details.
- Preserved the mobile behavior where only the current stage is shown.

### Files Modified

- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Confirmed the local server at `http://localhost:8080/` returned `200`.

### Known Risk / Follow-Up

- None expected; CSS-only change.

## Latest Edit: Prominent Claude Sending Status

Codex GPT-5.5 made the `Sending to Claude...` extraction status more visible in the receipt preview flow.

### What Changed

- Changed the extraction send state from plain small text to a larger glowing status pill.
- Added a spinning Claude-style circular mark next to the status text.
- Scoped the visual treatment to the `Sending to Claude...` state only; normal upload/status messages stay unchanged.

### Files Modified

- `static/app.js`
- `static/styles.css`
- `CODEX_HANDOFF.md`

### Verification

- Ran the project test suite with the local virtualenv: `8 passed`.
- Ran `node --check static/app.js` successfully.
- Confirmed the local server at `http://localhost:8080/` returned `200`.

### Known Risk / Follow-Up

- None expected; this is a focused frontend polish change.

## Latest Edit: README — video link + camera capture line

Claude Code (Fable 5) applied two doc-only additions from a README review.

### What Changed

- Added the YouTube walkthrough link under the live-demo line so the repo (not just the submission email) carries it.
- Noted phone-camera capture as an import method in the employee "What it does" bullet.

### Files Modified

- `README.md`
- `CODEX_HANDOFF.md`

### Verification

- Docs-only; no application code touched. Both facts verified against the app (Take-photo button is live; video URL from the submission email).

### Deliberately NOT added

- A "tested against a messy real-world corpus (crumpled/angled/low-light)" claim — no evidence that specific testing was done, so it would be an unverifiable claim. Add only if actually performed.
- `DESIGN_NOTES.md` — does not exist in the repo; not fabricated.

## Latest Edit: "Add another receipt" Made Visibly a Button

Claude Code (Fable 5) fixed the reported "can't add another receipt without refreshing" issue.

### What Changed

- Root cause: the reset control already existed (`#try-another-btn`) but was styled `btn-ghost` — borderless muted text under the preview that read as a heading, so users didn't recognize it as clickable and refreshed instead.
- Now a bordered `btn` with a "＋" prefix; `setPreviewActions` promotes it to `btn-primary` (solid navy) whenever it is the only action (post-extraction / post-submit), keeping it secondary next to the gold "Submit for AI extraction" CTA.

### Files Modified

- `static/index.html`
- `static/app.js`
- `CODEX_HANDOFF.md`

### Verification

- Reproduced the full flow headlessly via Chrome DevTools Protocol against a mock-provider instance: stage random receipt → Submit for AI extraction → Submit for approval → button visible as primary CTA → click resets card to "Import file". State assertions + screenshots at each step.
- `node --check` clean; test suite: `8 passed`.
- Deployed to Railway (`railway up`); confirmed the new bundle is serving on the live domain and `/api/meta` still reports `claude`.

### Known Risk / Follow-Up

- None. Frontend-only styling/affordance change; no workflow logic touched.

## Latest Edit: Varied Random-Receipt Pool + Local Real-Photo Pool

Claude Code (Fable 5) addressed "every random receipt looks the same".

### What Changed

- Root cause: the 12 tracked synthetic samples all used one visual template, so uniform-random picks looked identical.
- Added `scripts/generate_sample_receipts.py` — seeded generator producing 20 synthetic receipts across five distinct templates (thermal strip, cafe, restaurant, invoice, fuel) with varied merchants, currencies (USD/EUR/GBP/CAD), tax rates, and correct arithmetic; replaced the 12 look-alikes.
- The random button now merges two pools: tracked `manifest.json` (synthetics) plus optional gitignored `local-manifest.json` (30 real-photo web images, watermarked stock — kept out of the public repo/live deploy for licensing; local dev only).
- Added a no-immediate-repeat guard to the random pick.

### Files Modified

- `scripts/generate_sample_receipts.py` (new)
- `static/sample-receipts/` (12 -> 20 synthetics + manifest)
- `static/app.js`
- `.gitignore`
- `CODEX_HANDOFF.md`

### Verification

- `node --check` clean; test suite `8 passed`; local server serves both manifests (20 + 30).
- Deployed to Railway; live pool = the 20 varied synthetics.

### Known Risk / Follow-Up

- The scraped real-photo pool is local-only by design. If it should ship publicly, replace with license-cleared photos first.

## Latest Edit: Real Receipt Photos Replace Synthetic Samples

Claude Code (Fable 5) swapped the random-receipt pool to real-world photos per Jacob's request.

### What Changed

- Replaced the 20 synthetic generated receipts with 17 curated **real receipt photos** (Walmart, Home Depot, Sephora, Epic Steakhouse, Louis Vuitton, McDonald's, Marshalls, Target, Sam's Club, a UK receipt stack, a scanned invoice) — varied merchants, currencies, angles, and lighting; the messy real-world inputs that best demo extraction.
- Sourced via web image search; **dropped every watermarked-stock image** (Shutterstock/Alamy/Adobe), Freepik-attributed templates, and generic receipt-generator renders during curation, so nothing embarrassing is public. Files renamed `real-receipt-01..17`.
- Removed the now-unused synthetic generator (`scripts/generate_sample_receipts.py`) and the split local-manifest scheme; `manifest.json` now lists the real photos, and the folder is fully tracked (stale `.gitignore` rules removed).

### Files Modified

- `static/sample-receipts/` (synthetics + scraped set → 17 real photos + manifest)
- `.gitignore`; removed `scripts/generate_sample_receipts.py`
- `CODEX_HANDOFF.md`

### Verification

- `node --check` clean; test suite `8 passed`; local server serves manifest (17) and images (200).
- Deployed to Railway; live pool = the 17 real photos.

### Known Risk / Follow-Up

- The photos are real-world receipts sourced from the public web (no watermarks), used as demo fixtures. For a fully license-bulletproof public repo, swap for a CC-licensed receipt dataset — cosmetic, not blocking.
