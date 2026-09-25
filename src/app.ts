import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    console.log('单词君 launched')
  })

  // children 是将要渲染的页面
  return children
}

export default App
