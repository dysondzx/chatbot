<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { createAIService, formatErrorMessage } from './utils/aiService.js';

// 消息列表数据
const messages = ref([]);

// 输入框内容
const inputMessage = ref('');

// 聊天列表容器引用
const chatListRef = ref(null);

// 加载状态
const isLoading = ref(false);

// AI 服务实例
const aiService = createAIService();

/**
 * 自动滚动到底部
 */
const scrollToBottom = () => {
  nextTick(() => {
    if (chatListRef.value) {
      chatListRef.value.scrollTop = chatListRef.value.scrollHeight;
    }
  });
};

/**
 * 发送消息并获取 AI 流式响应
 */
const sendMessage = async () => {
  const message = inputMessage.value.trim();
  if (message && !isLoading.value) {
    // 创建用户消息对象
    const userMessage = {
      id: Date.now().toString(),
      content: message,
      type: 'user'
    };
    
    // 添加用户消息
    messages.value.push(userMessage);
    
    // 保存用户消息到数据库
    saveMessageToDatabase(userMessage);
    
    // 清空输入框
    inputMessage.value = '';
    
    // 滚动到底部
    scrollToBottom();
    
    // 设置加载状态
    isLoading.value = true;
    
    // 创建 AI 消息占位符
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage = {
      id: aiMessageId,
      content: '',
      type: 'ai'
    };
    messages.value.push(aiMessage);
    
    try {
      // 发送消息并处理流式响应
      await aiService.sendMessageStream(message, (chunk) => {
        // 查找 AI 消息并追加内容
        const aiMessage = messages.value.find(msg => msg.id === aiMessageId);
        if (aiMessage) {
          aiMessage.content += chunk;
          scrollToBottom(); // 每次接收到新内容都滚动到底部
        }
      });
      
      // AI回复完成后，保存AI消息到数据库
      const savedAiMessage = messages.value.find(msg => msg.id === aiMessageId);
      if (savedAiMessage) {
        saveMessageToDatabase(savedAiMessage);
      }
    } catch (error) {
      // 处理错误
      const aiMessage = messages.value.find(msg => msg.id === aiMessageId);
      if (aiMessage) {
        aiMessage.content = formatErrorMessage(error);
      }
      console.error("发送消息失败:", error);
    } finally {
      // 重置加载状态
      isLoading.value = false;
    }
  }
};

/**
 * 处理回车键发送消息
 */
const handleKeyPress = (event) => {
  // Ctrl+Enter 或 Shift+Enter 换行
  if (event.key === 'Enter' && !event.ctrlKey && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
};

/**
 * 从数据库获取聊天记录
 */
async function fetchMessages() {
  try {
    const response = await fetch('http://localhost:3000/api/messages');
    if (response.ok) {
      const data = await response.json();
      messages.value = data.length > 0 ? data : [
        {
          id: 1,
          content: '你好！我是AI助手，请问有什么可以帮助你的吗？',
          type: 'ai'
        }
      ];
    } else {
      // 如果获取失败，使用默认消息
      messages.value = [
        {
          id: 1,
          content: '你好！我是AI助手，请问有什么可以帮助你的吗？',
          type: 'ai'
        }
      ];
    }
  } catch (error) {
    console.error('获取聊天记录失败:', error);
    // 出错时使用默认消息
    messages.value = [
      {
        id: 1,
        content: '你好！我是AI助手，请问有什么可以帮助你的吗？',
        type: 'ai'
      }
    ];
  } finally {
    scrollToBottom();
  }
}

/**
 * 保存消息到数据库
 */
async function saveMessageToDatabase(message) {
  try {
    await fetch('http://localhost:3000/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });
  } catch (error) {
    console.error('保存消息失败:', error);
    // 保存失败不影响用户体验，仅记录错误
  }
}

/**
 * 组件挂载后获取聊天记录
 */
onMounted(() => {
  fetchMessages();
});
</script>

<template>
  <main>
    <!-- 聊天列表 -->
    <div class="chat-list" ref="chatListRef">
      <div 
        v-for="message in messages" 
        :key="message.id" 
        :class="message.type === 'user' ? 'user-message' : 'ai-message'"
      >
        <div 
          :class="message.type === 'user' ? 'user-message-content' : 'ai-message-content'"
        >
          {{ message.content }}
        </div>
      </div>
    </div>
    
    <!-- 输入区域 -->
    <div class="input-area">
      <textarea
        v-model="inputMessage"
        placeholder="你有什么要我帮助的吗？"
        @keydown="handleKeyPress"
        rows="1"
      ></textarea>
      <button 
        class="send-button" 
        @click="sendMessage"
        :disabled="!inputMessage.trim() || isLoading"
      >
        <template v-if="isLoading">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="40 40" stroke-dashoffset="0" class="animate-spin">
              <animate attributeName="stroke-dashoffset" from="0" to="-40" dur="1s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </template>
        <template v-else>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
          </svg>
        </template>
      </button>
    </div>
  </main>
</template>

<style scoped>
/* 此处无需额外样式，主要样式已在 style.css 中定义 */
</style>
