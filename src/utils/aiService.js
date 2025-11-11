/**
 * AI服务工具模块
 * 提供与后端API交互的能力，获取AI生成的响应，包括流式响应处理
 */

/**
 * 创建 AI 聊天服务实例
 * 调用后端API路由，由后端处理与Kimi API的交互
 * @returns {Object} AI 服务实例
 */
export function createAIService() {
  /**
   * 发送消息并获取流式响应
   * 调用后端API路由，由后端处理与Kimi API的交互
   * @param {string} message - 用户消息
   * @param {Function} onChunk - 接收流式响应块的回调函数
   * @returns {Promise<string>} 完整的 AI 响应
   */
  async function sendMessageStream(message, onChunk) {
    try {
      // 调用后端API路由 - 使用相对路径，通过Vite代理转发到后端服务器
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(30000) // 30秒超时
      });
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }
      
      // 获取响应体的可读流
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      
      // 处理SSE格式的流式响应
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        // 解码接收到的数据
        const chunk = decoder.decode(value, { stream: true });
        
        // 处理SSE格式的响应块
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            
            // 处理流结束标志
            if (data === '[DONE]') {
              break;
            }
            
            try {
              // 解析JSON数据
              const parsedData = JSON.parse(data);
              
              // 检查是否包含错误信息
              if (parsedData.error) {
                throw new Error(parsedData.error);
              }
              
              // 提取内容并发送给回调函数
              if (parsedData.content) {
                fullResponse += parsedData.content;
                onChunk(parsedData.content);
              }
            } catch (jsonError) {
              console.error('解析JSON失败:', jsonError, '原始数据:', data);
            }
          }
        }
      }
      
      return fullResponse;
    } catch (error) {
      console.error("AI 服务错误:", error);
      throw error;
    }
  }

  return {
    sendMessageStream
  };
}

/**
 * 格式化错误消息
 * @param {Error} error - 错误对象
 * @returns {string} 格式化后的错误消息
 */
export function formatErrorMessage(error) {
  if (error.message.includes("401")) {
    return "认证失败，请检查您的 API Key 是否正确。";
  } else if (error.message.includes("403")) {
    return "权限不足，无法访问 AI 服务。";
  } else if (error.message.includes("429")) {
    return "请求过于频繁，请稍后再试。";
  } else if (error.message.includes("500")) {
    return "AI 服务内部错误，请稍后再试。";
  } else {
    return `AI 服务请求失败: ${error.message}`;
  }
}