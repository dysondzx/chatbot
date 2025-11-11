import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // 配置代理，将API请求转发到后端服务
  server: {
    proxy: {
      // 匹配所有以/api开头的请求路径
      '/api': {
        target: 'http://localhost:3000', // 后端服务地址
        changeOrigin: true, // 开启跨域
        // 不需要重写路径，因为后端路由也以/api开头
      }
    }
  }
})
