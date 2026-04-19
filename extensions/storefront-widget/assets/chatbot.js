document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('chat-toggle-btn');
  const closeBtn = document.getElementById('chat-close-btn');
  const chatWindow = document.getElementById('chat-window');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const messagesContainer = document.getElementById('chat-messages');
  const chatbotWrapper = document.getElementById('shopify-ai-chatbot');
  
  const shopDomain = chatbotWrapper?.dataset.shop;

  // Toggle chat window
  toggleBtn.addEventListener('click', () => {
    chatWindow.classList.add('open');
    chatInput.focus();
  });

  closeBtn.addEventListener('click', () => {
    chatWindow.classList.remove('open');
  });

  const appendMessage = (text, type) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${type}-message`;
    msgDiv.textContent = text;
    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  };

  const sendMessage = async () => {
    const message = chatInput.value.trim();
    if (!message) return;

    // UI Updates
    appendMessage(message, 'user');
    chatInput.value = '';
    sendBtn.disabled = true;

    try {
      // The request hits the Shopify App Proxy which forwards to our backend
      const response = await fetch('/apps/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shop: shopDomain,
          message: message
        })
      });

      const data = await response.json();

      if (data.reply) {
        appendMessage(data.reply, 'ai');
      } else if (data.error) {
        appendMessage(`Error: ${data.error}`, 'ai');
      } else {
        appendMessage("Sorry, I couldn't understand that.", 'ai');
      }

    } catch (error) {
      console.error('Chatbot error:', error);
      appendMessage('Connection error. Please try again later.', 'ai');
    } finally {
      sendBtn.disabled = false;
      chatInput.focus();
    }
  };

  sendBtn.addEventListener('click', sendMessage);
  
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
});
