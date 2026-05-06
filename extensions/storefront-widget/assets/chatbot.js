(function () {
  'use strict';

  // ── DOM ──────────────────────────────────────────────────────────
  var root       = document.getElementById('shopify-ai-chatbot');
  if (!root) return;

  var toggleBtn  = document.getElementById('chat-toggle-btn');
  var closeBtn   = document.getElementById('chat-close-btn');
  var chatWindow = document.getElementById('chat-window');
  var chatInput  = document.getElementById('chat-input');
  var sendBtn    = document.getElementById('chat-send-btn');
  var msgBox     = document.getElementById('chat-messages');
  var badge      = document.getElementById('chat-unread-badge');

  // ── Config from Liquid data attributes ───────────────────────────
  var shop     = root.dataset.shop     || window.Shopify && Shopify.shop || '';
  var botName  = root.dataset.botName  || 'Store Assistant';
  var greeting = root.dataset.greeting || 'Hi there! \uD83D\uDC4B How can I help you today?';
  var accent   = root.dataset.accent   || '#075E54';

  // Apply CSS variable for accent color
  root.style.setProperty('--chatbot-accent', accent);

  // ── State ────────────────────────────────────────────────────────
  var isOpen    = false;
  var isWaiting = false;
  var unreadCount = 0;
  var SESSION_KEY = 'chatbot_session_' + shop;

  // ── Helpers ──────────────────────────────────────────────────────
  function timeNow() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function scrollBottom() {
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  // ── Persist messages in sessionStorage ──────────────────────────
  function saveSession() {
    try {
      var nodes = [].slice.call(msgBox.querySelectorAll('.chat-msg-wrap'));
      var data = nodes.map(function(n) {
        return {
          t: n.classList.contains('user-wrap') ? 'user' : 'ai',
          m: n.querySelector('.chat-message').textContent,
          ts: (n.querySelector('.chat-timestamp') || {}).textContent || ''
        };
      });
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.slice(-50)));
    } catch(e) {}
  }

  function loadSession() {
    try {
      var stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
      if (stored.length) {
        stored.forEach(function(item) {
          appendMsg(item.m, item.t, item.ts, false);
        });
        return true;
      }
    } catch(e) {}
    return false;
  }

  // ── Append a chat bubble ─────────────────────────────────────────
  function appendMsg(text, type, timestamp, persist) {
    var wrap = document.createElement('div');
    wrap.className = 'chat-msg-wrap ' + type + '-wrap';

    var bubble = document.createElement('div');
    bubble.className = 'chat-message';
    bubble.textContent = text;

    var ts = document.createElement('div');
    ts.className = 'chat-timestamp';
    ts.textContent = timestamp || timeNow();

    wrap.appendChild(bubble);
    wrap.appendChild(ts);
    msgBox.appendChild(wrap);
    scrollBottom();
    if (persist !== false) saveSession();
  }

  // ── Typing indicator ─────────────────────────────────────────────
  function showTyping() {
    removeTyping();
    var wrap = document.createElement('div');
    wrap.className = 'chat-typing-wrap';
    wrap.id = 'chat-typing';
    wrap.innerHTML = '<div class="chat-typing"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
    msgBox.appendChild(wrap);
    scrollBottom();
  }

  function removeTyping() {
    var el = document.getElementById('chat-typing');
    if (el) el.parentNode.removeChild(el);
  }

  // ── Unread badge ─────────────────────────────────────────────────
  function setUnread(n) {
    unreadCount = n;
    if (n > 0) {
      badge.textContent = n > 9 ? '9+' : String(n);
      badge.classList.add('visible');
    } else {
      badge.classList.remove('visible');
    }
  }

  // ── Toggle open/close ────────────────────────────────────────────
  function openChat() {
    isOpen = true;
    chatWindow.classList.add('open');
    chatWindow.setAttribute('aria-hidden', 'false');
    toggleBtn.setAttribute('aria-expanded', 'true');
    toggleBtn.querySelector('.bubble-icon--open').style.display  = 'none';
    toggleBtn.querySelector('.bubble-icon--close').style.display = 'flex';
    toggleBtn.classList.remove('pulse');
    setUnread(0);
    setTimeout(function() { chatInput.focus(); }, 260);
  }

  function closeChat() {
    isOpen = false;
    chatWindow.classList.remove('open');
    chatWindow.setAttribute('aria-hidden', 'true');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.querySelector('.bubble-icon--open').style.display  = 'flex';
    toggleBtn.querySelector('.bubble-icon--close').style.display = 'none';
  }

  toggleBtn.addEventListener('click', function() { isOpen ? closeChat() : openChat(); });
  closeBtn.addEventListener('click', closeChat);

  // Close on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen) closeChat();
  });

  // ── Send message ─────────────────────────────────────────────────
  function sendMessage() {
    var text = chatInput.value.trim();
    if (!text || isWaiting) return;

    appendMsg(text, 'user');
    chatInput.value = '';
    isWaiting = true;
    sendBtn.disabled = true;
    showTyping();

    // POST to Shopify App Proxy → /api/chat on our backend
    fetch('/apps/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop: shop, message: text })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      removeTyping();
      var reply = data.reply || data.error || "Sorry, I couldn't get a response. Please try again.";
      appendMsg(reply, 'ai');
      // Show unread badge if window is closed
      if (!isOpen) {
        setUnread(unreadCount + 1);
        toggleBtn.classList.add('pulse');
      }
    })
    .catch(function() {
      removeTyping();
      appendMsg('Connection error. Please check your internet and try again.', 'ai');
    })
    .finally(function() {
      isWaiting = false;
      sendBtn.disabled = false;
      if (isOpen) chatInput.focus();
    });
  }

  sendBtn.addEventListener('click', sendMessage);
  chatInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ── Init ─────────────────────────────────────────────────────────
  var hasHistory = loadSession();
  if (!hasHistory) {
    appendMsg(greeting, 'ai');
  }

  // Pulse bubble to draw attention after 3 seconds (first visit only)
  if (!hasHistory) {
    setTimeout(function() {
      if (!isOpen) toggleBtn.classList.add('pulse');
    }, 3000);
  }

})();
