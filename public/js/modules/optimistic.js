/* eslint-env browser */
import * as state from './state.js';
import * as utils from './utils.js';
import { appendMessage } from './ui.js';

export function addOptimisticMessage(channel, text) {
  if (!state.FEATURE_FLAGS.optimisticSend) return null;
  const clientId = utils.createClientId();
  state.pushOptimisticMessage(channel, { clientId, text });
  const containerId = channel === "global" ? "global-messages" : "private-messages";
  appendMessage(containerId, state.getCurrentUser(), text, new Date().toISOString(), "sent", { pending: true, clientId });
  return clientId;
}

export function resolveOptimistic(channel, incoming) {
  if (!state.FEATURE_FLAGS.optimisticSend) return false;
  
  // Cancel failure timeout when message is successfully confirmed
  const clientId = incoming?.clientId;
  if (clientId && state.hasOptimisticTimeout(clientId)) {
    state.deleteOptimisticTimeout(clientId);
  }

  const idx = state.findOptimisticIndex(channel, clientId, incoming.message);
  if (idx === -1) return false;

  state.spliceOptimistic(channel, idx);

  // Actually update the DOM element
  const container = channel === "global" 
    ? document.getElementById("global-messages") 
    : document.getElementById("private-messages");
  
  const selector = clientId 
    ? `.message.pending[data-client-id="${clientId}"]` 
    : ".message.pending";
  
  const pending = container?.querySelector(selector);
  if (pending) {
    pending.classList.remove("pending");
    pending.removeAttribute("data-client-id");

    const meta = pending.querySelector(".meta");
    if (meta && incoming.createdAt) {
      meta.dataset.time = incoming.createdAt;
      meta.textContent = utils.displayTime(incoming.createdAt, state.getTimeFormat());
      meta.title = utils.formatTime(incoming.createdAt);
    }

    // Scroll after DOM update in case layout shifted
    if (container) {
      utils.maybeScrollToBottom(container);
    }
  }

  return true;
}

export function clearOptimisticPending(channel, clientId) {
  // Clean up timeout if it still exists
  state.deleteOptimisticTimeout(clientId);

  const index = state.findOptimisticIndex(channel, clientId, null);
  if (index !== -1) state.spliceOptimistic(channel, index);

  if (channel === "global") state.setSendingGlobal(false);
  else state.setSendingPrivate(false);
}