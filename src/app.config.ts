export default defineAppConfig({
  // 三层结构：词书列表 → 档次 → 翻书页；「我的上传」和「生词本」是旁支页面。
  //
  // 这里**没有** tabBar 字段：微信原生 tabBar 是编译期写死的，而翻书页必须带
  // `?bookId=&level=` 才知道翻哪本书，原生 tab 给不了参数（switchTab 还会清空页面栈，
  // 返回就废了）。所以底部 Tab 栏是自绘的页面内组件：components/tab-bar.tsx，
  // 由翻书页和生词本各自渲染一个。
  pages: [
    'pages/index/index',
    'pages/uploads/index',
    'pages/levels/index',
    'pages/reader/index',
    'pages/vocab/index'
  ],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTitleText: '单词君',
    navigationBarTextStyle: 'black'
  }
})
