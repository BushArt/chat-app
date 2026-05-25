# ⚠️ SUPERSEDED — This document is historical reference only

**This feature plan has been superseded by [`PHASED_FEATURE_PLAN.md`](./PHASED_FEATURE_PLAN.md).**

All of the features outlined below have been incorporated into the phased plan with proper dependency sequencing, security hardening, and test requirements. Do not use this document for implementation guidance.

---

# Feature Plan (Historical)

## Goal
Add support for:
- file uploads in global/private chat
- voice message recording
- user avatars/profile pictures
- profile personalization (display name, bio/status, simple personal info)

These features should reuse the existing JWT auth, message routing, and Socket.IO event flow while introducing:
- an attachment subsystem
- profile metadata in the user model
- REST upload endpoints
- enhanced chat UI/UX

---

## Backend changes

### Data model
- `models/User.js`
  - add `displayName` (default to username)
  - add `bio` or `status`
  - add `avatarUrl`
- `models/Message.js`
  - add optional `attachment` object:
    - `type` (`image`, `audio`, `file`)
    - `filename`
    - `url`
    - `mimetype`
    - `size`
  - add optional `caption` or `messageType` if needed
  - add `senderDisplayName` (denormalized from User at message creation time) to preserve historical display names even if the user later changes their display name

### Routes
- `routes/auth.js`
  - add `GET /auth/me` to return current profile
  - add `PUT /auth/profile` to update display name, bio/status, personal info, **and optionally upload an avatar** (accepts `multipart/form-data` with an optional avatar file field alongside the text fields). If no avatar file is included in the request, the existing `avatarUrl` is preserved — not overwritten or nulled out.
  - *remove the separate `POST /auth/avatar` route*
- `routes/messages.js`
  - add file upload endpoint, e.g. `POST /messages/upload`
    - accept `room` or `receiver` + `isGlobal`
    - save attachment metadata
    - return attachment record or URL
  - optionally add `GET /messages/attachments/:fileId` for secure file access
- `app.js`
  - mount the new route(s)
  - add secure static serving or a file-download route
  - configure upload handling: use `multer` for parsing `multipart/form-data`, then upload files to a cloud service (Cloudinary recommended) and store the resulting URL
  - validate files:
    - allowed MIME types for images, audio, docs
    - size limits for attachment uploads and avatars
    - safe filenames / unique identifiers
- `sockets/handlers/globalMessage.js`
- `sockets/handlers/privateMessage.js`
  - allow `data.attachment` metadata in emitted payloads
  - preserve existing text-only message flow
  - emit `receive_global_message` / `receive_message` with attachment fields
- `sockets/index.js`
  - no major changes if uploads happen via HTTP and messages still emit metadata over sockets

### Storage
- **Due to the ephemeral filesystem on Railway (and similar platforms), files must be stored externally.** Use a cloud service such as Cloudinary (for images and audio) or Cloudflare R2 (for general files). The upload endpoint will parse the multipart form with `multer`, then upload the file to the cloud service and store the resulting URL in the database. This ensures persistence across deployments and scaling events.

### Cloudinary Configuration
- Create `config/cloudinary.js` with Cloudinary initialization using `cloudinary.v2`
- Add `CLOUDINARY_URL` (or separate `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) to `config/env.js` validation
- Example in README .env: `CLOUDINARY_URL=cloudinary://your-key`

---

## Frontend changes

### Client API
- `public/js/modules/api.js`
  - add `uploadAttachment()` using `FormData`
  - add `uploadAvatar()` using `FormData` (or combine with profile update)
  - add `fetchProfile()` and `updateProfile()`

### Client state
- `public/js/modules/state.js`
  - add profile fields: `displayName`, `bio`, `avatarUrl`
  - preserve them on session restore
  - add attachment metadata handling if needed

### UI
- `public/js/modules/ui.js`
  - render avatar images in message bubbles and online user list
  - render attachment previews:
    - image thumbnails
    - audio controls for voice messages
    - download links for documents
  - add profile edit view/modal
  - add message input controls:
    - file picker button
    - voice record button (with state machine: idle → recording → preview → send/discard)
    - caption field for attachments
- `public/js/app.js`
  - add new controls and button handlers
  - integrate avatar/profile load after login/restore
  - preserve the existing optimistic text flow and extend it for attachments where possible

### Voice message recording (client-side spec)
- Create a dedicated `recorder.js` module using the `MediaRecorder` API.
- Format decision: use `audio/webm;codecs=opus` for Chrome/Firefox; fall back to `audio/mp4` for Safari.
- Enforce a maximum duration (e.g., 2 minutes) client-side, with a visual indicator during recording.
- Implement a state machine for the record button: idle (ready to record), recording (capturing), paused (optional), preview (listen before sending), send/discard (final actions).
- This feature is substantial enough to be its own phase (Phase 4).

### Additional UI/UX
- profile panel with:
  - display name
  - bio/status
  - avatar upload preview
- chat header showing current user avatar and display name
- show sender avatars next to each message
- allow users to set a short personal status line

---

## Integration strategy

### File uploads + voice messages
- upload binary data through REST first
- then emit the socket event with the attachment reference
- this avoids binary transport complexity in socket event payloads
- message objects can still be created in DB with both text and attachment metadata

### Profile personalization
- store profile metadata on `User`
- return it from `GET /auth/me` and on login
- update local state and UI after profile changes
- use avatar URL in all user displays

---

## Phasing
To manage risk and dependencies, deliver these features in separate phases:

1. **Profiles** – Implement `displayName`, `bio`/`status` (no avatar). Requires only `User` model and profile routes. No new infrastructure.
2. **Avatars** – Add avatar upload via Cloudinary. Requires cloud service integration, `avatarUrl` storage, and UI for upload/preview. Builds on Phase 1.
3. **File attachments** – Add file upload endpoint, attachment metadata in messages, and UI previews (images, documents). Reuses the Cloudinary pipeline from Phase 2.
4. **Voice messages** – Add audio recording, `recorder.js` module, audio format handling, and UI state machine. Reuses the upload endpoint from Phase 3.
5. **Client unit tests for voice** – Add manual mocks for `MediaRecorder` in client-side unit tests (jest/jsdom) to cover voice recording behavior. Real E2E voice testing would require Playwright/Cypress, which isn't in the current test stack.

This sequencing ensures each phase delivers value and de-risks the next.

---

## Security and constraints
- enforce JWT auth for profile and upload endpoints
- verify private attachment uploads belong to the sender/receiver room
- restrict file types and max file sizes
- store files with generated safe filenames (Cloudinary handles this)
- if private attachments must remain private, use an authenticated download route rather than direct public static URLs; the download route must check the requesting JWT's username against the message's `sender` and `receiver` fields to ensure the user is a participant

---

## Test plan impact
The existing test suite (`__tests__/e2e/...` and `__tests__/integration/...`) will need significant extensions:

- Extend `globalMessage.test.js` and `privateMessage.test.js` to cover the `attachment` field (both text-only and attachment messages).
- Add new integration tests for the upload route (`POST /messages/upload`):
  - Authentication enforcement
  - MIME type validation (allowed types, rejection of disallowed types)
  - Size limits (within bounds, exceeding bounds)
  - Cloudinary failure handling (simulate network errors, service unavailable)
- Add unit tests for the new `recorder.js` module and any helper functions (using manual mocks for `MediaRecorder`).
- Ensure test coverage for the phasing order if integration tests depend on prior phases.

---

## Recommended files to update
- `models/User.js`
- `models/Message.js` (add `senderDisplayName` and `attachment` fields)
- `routes/auth.js` (update to combined profile/avatar route)
- `routes/messages.js` (upload endpoint)
- `app.js` (configure multer, cloud service upload middleware)
- `config/cloudinary.js` (new file for Cloudinary initialization)
- `config/env.js` (add Cloudinary URL validation)
- `public/js/modules/api.js`
- `public/js/modules/state.js`
- `public/js/modules/ui.js` (add recorder module, voice UI, attachment previews)
- `public/js/app.js`
- `sockets/handlers/globalMessage.js`
- `sockets/handlers/privateMessage.js`
- optional: new `routes/uploads.js` (if upload logic becomes complex enough to warrant its own module)
- new: `public/js/modules/recorder.js` (for voice recording)
- README.md: add .env example with `CLOUDINARY_URL`
