/**
 * AI服务工具模块
 * 提供与Kimi API交互的能力，包括流式响应处理
 */

/**
 * 创建 AI 聊天服务实例
 * 使用原生fetch API直接调用Kimi API，避免LangChain封装的问题
 * @returns {Object} AI 服务实例
 */
export function createAIService() {
  // 从环境变量获取配置
  const apiKey = import.meta.env.VITE_API_KEY;
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const model = import.meta.env.VITE_MODEL || "moonshot-v1-8k";

  /**
   * 发送消息并获取流式响应
   * 使用原生fetch API直接调用Kimi API的chat/completions接口
   * @param {string} message - 用户消息
   * @param {Function} onChunk - 接收流式响应块的回调函数
   * @returns {Promise<string>} 完整的 AI 响应
   */
  async function sendMessageStream(message, onChunk) {
    try {
      // 构建请求体
      const requestBody = {
        model: model,
        messages: [
          { role: "user", content: message }
        ],
        stream: true, // 启用流式响应
        temperature: 0.7
      };
      
      // 构建完整的API URL
      const apiUrl = `${apiBaseUrl}/chat/completions`;
      
      // 使用fetch发送POST请求
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
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
              
              // 提取内容并发送给回调函数
              if (parsedData.choices && parsedData.choices[0] && parsedData.choices[0].delta) {
                const content = parsedData.choices[0].delta.content || '';
                if (content) {
                  fullResponse += content;
                  onChunk(content);
                }
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