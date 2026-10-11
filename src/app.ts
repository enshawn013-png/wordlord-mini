import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import './app.css'
import { initCloud } from './cloud/init'
import { initSync } from './services/sync'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    // 先 init 云开发（没填环境 ID 时是空操作），再启动同步：
    // 静默登录拿 openid → 拉云端数据合并进本地。
    // 全程不 await，不阻塞启动；失败也只是本地用，不影响任何已有功能。
    initCloud()
    void initSync()
  })

  // children 是将要渲染的页面
  return children
}

export default App
