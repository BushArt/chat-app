/**
 * Minimal HTML scaffold matching public/index.html structure for client tests.
 */
function getAppHtml() {
  return `
<div id="auth-screen">
  <h1>Chat App</h1>
  <input type="text" id="username-input" />
  <input type="password" id="password-input" />
  <button id="btn-login">Log In</button>
  <button id="btn-register">Create Account</button>
  <p id="auth-error" role="alert" aria-live="polite"></p>
</div>
<div id="chat-screen" class="hidden">
  <div id="chat-header">
    <span id="logged-in-as">Logged in as:</span>
    <div id="header-actions">
      <button id="btn-time-format">Time: Relative</button>
      <button id="btn-theme-toggle">Theme</button>
      <button id="btn-edit-profile">Edit Profile</button>
      <button id="btn-logout">Log Out</button>
    </div>
  </div>
  <div id="connection-banner" class="hidden" role="status"></div>
  <div id="profile-panel" class="hidden">
    <div class="profile-header">
      <span id="profile-avatar-preview" class="avatar"></span>
      <div class="profile-info">
        <div class="profile-name" id="profile-display-name"></div>
        <div class="profile-detail" id="profile-detail"></div>
      </div>
    </div>
    <div class="profile-field">
      <label for="edit-display-name">Display Name</label>
      <input type="text" id="edit-display-name" maxlength="50" />
    </div>
    <div class="profile-field">
      <label for="edit-bio">Bio</label>
      <textarea id="edit-bio" maxlength="160" rows="2"></textarea>
    </div>
    <div class="profile-field">
      <label for="edit-status">Status</label>
      <select id="edit-status">
        <option value="online">Online</option>
        <option value="away">Away</option>
        <option value="busy">Busy</option>
      </select>
    </div>
    <div class="avatar-upload-wrapper">
      <span id="editor-avatar-preview" class="avatar"></span>
      <button id="btn-upload-avatar" type="button">Change Photo</button>
      <input type="file" id="avatar-file-input" accept="image/jpeg,image/png" class="hidden" />
    </div>
    <div class="profile-actions">
      <button id="btn-save-profile" class="btn-save">Save</button>
      <button id="btn-cancel-profile" class="btn-cancel">Cancel</button>
    </div>
  </div>
  <div id="main-layout">
    <div id="sidebar">
      <div id="sidebar-title">Online Users</div>
      <div id="online-list" role="listbox"></div>
    </div>
    <div id="chat-area">
      <div id="tabs" role="tablist">
        <button class="tab active" id="tab-global" role="tab" aria-controls="panel-global" aria-selected="true">
          Global <span id="global-tab-badge"></span>
        </button>
        <button class="tab" id="tab-private" role="tab" aria-controls="panel-private" aria-selected="false">
          Private <span id="private-tab-badge"></span>
        </button>
      </div>
      <section class="tab-panel" id="panel-global" role="tabpanel">
        <div class="messages" id="global-messages"></div>
        <div class="typing-indicator" id="global-typing"></div>
        <div class="input-area">
          <div class="input-toolbar">
            <button id="global-file-btn" class="file-attach-btn" type="button">Attach</button>
            <button id="global-voice-btn" class="voice-btn" type="button">Voice</button>
            <input type="file" id="global-file-input" class="hidden" />
          </div>
          <div id="global-attachment-preview" class="attachment-preview hidden"></div>
          <div id="global-voice-preview" class="voice-preview hidden"></div>
          <textarea id="global-input" rows="1"></textarea>
          <div class="char-counter" id="global-char-counter"></div>
          <button id="send-global" class="send-btn" disabled>Send</button>
        </div>
      </section>
      <section class="tab-panel hidden" id="panel-private" role="tabpanel">
        <div id="recipient-bar">
          <input type="text" id="recipient-input" />
          <button id="btn-open-chat">Open</button>
        </div>
        <div class="messages" id="private-messages"></div>
        <div class="typing-indicator" id="private-typing"></div>
        <div class="input-area">
          <div class="input-toolbar">
            <button id="private-file-btn" class="file-attach-btn" type="button">Attach</button>
            <button id="private-voice-btn" class="voice-btn" type="button">Voice</button>
            <input type="file" id="private-file-input" class="hidden" />
          </div>
          <div id="private-attachment-preview" class="attachment-preview hidden"></div>
          <div id="private-voice-preview" class="voice-preview hidden"></div>
          <textarea id="private-input" rows="1"></textarea>
          <div class="char-counter" id="private-char-counter"></div>
          <button id="send-private" class="send-btn" disabled>Send</button>
        </div>
      </section>
    </div>
  </div>
</div>`;
}

function mountAppHtml() {
  document.body.innerHTML = getAppHtml();
}

module.exports = { getAppHtml, mountAppHtml };
