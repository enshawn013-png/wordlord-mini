export default defineAppConfig({
  // 四层结构：**主界面**（pages/home，封面 + 背单词）→ 词书列表（pages/index）→ 档次 → 翻书页；
  // 「我的上传」「生词本」「熟练掌握词汇」是旁支页面。
  // 生词本自己不显示单词，它底下挂着三个子页：
  //   「全部生词」（一次性列出整个生词库，入口是生词本页最下面那行小字）、
  //   「复习记录」（按标记 7~1 分档的目录）、
  //   「标记档位」（复习记录里点某一档进去的子页：全档单词 + 随机抽查）。
  // 另外「复习」（卡片式一屏一词）也是生词本的子页。
  //
  // ⚠️ **数组第一项就是启动页**：2026-10 用户要求在最开始那个「六级词汇 / 我的上传」
  // 界面前面再加一个主界面，所以 pages/home/index 排在第一位，词书列表降成第二层
  // （它的导航栏因此需要返回箭头，见 components/nav-bar.tsx 的 big + back）。
  // 统计类的东西全在 pages/stats：封面只留「要动手的事」，数据单独一页看。
  //
  // 「我的」页（登录 / 同步 / 今日统计）2026-10 按用户要求**整个删掉**了：
  // 页面文件、这里的注册、底部 Tab 栏和首页的入口一起没的。
  // 云同步本身没动——它是在 app.ts 里静默跑的，不依赖「我的」页。
  //
  // 这里**没有** tabBar 字段：微信原生 tabBar 是编译期写死的，而翻书页必须带
  // `?bookId=&level=` 才知道翻哪本书，原生 tab 给不了参数（switchTab 还会清空页面栈，
  // 返回就废了）。所以底部 Tab 栏是自绘的页面内组件：components/tab-bar.tsx，
  // 由翻书页、生词本、「熟练掌握词汇」各自渲染一个。
  pages: [
    'pages/home/index',
    'pages/stats/index',
    'pages/plan/index',
    'pages/index/index',
    'pages/uploads/index',
    'pages/levels/index',
    'pages/reader/index',
    'pages/vocab/index',
    'pages/mastered/index',
    'pages/review/index',
    'pages/review-log/index',
    'pages/review-level/index',
    'pages/vocab-all/index',
    // 查词（R5）：首页「查词」那一行的落点。放在数组最后是因为它是个工具页，
    // 启动页永远是第一项（pages/home/index），顺序不影响导航。
    'pages/search/index',
    // 设置（2026-11）：只管操作 —— 惯用手、字号、震动。
    'pages/settings/index'
  ],
  // 声明这个小程序要用云开发（用云能力必须写，否则开发者工具里没有云开发入口）。
  // 真正的初始化在 app.ts 里调 wx.cloud.init，环境 ID 在 src/cloud/config.ts。
  cloud: true,
  window: {
    backgroundTextStyle: 'light',
    /**
     * 2026-11：用户手机上「往下拉 / 内容比屏幕短」时，底下会露出一大块**黑色**。
     *
     * 那是 page 的默认底色（默认跟随系统深色），不是页面自己画的。
     * 三个颜色一起给：
     *   backgroundColor       → 页面本身的底色（内容不够高时露出来的就是它）
     *   backgroundColorTop    → 顶部下拉回弹时露出的颜色
     *   backgroundColorBottom → 底部上拉回弹时露出的颜色
     * 全部填暖米白，和 STYLE.container 的渐变首尾同色，滚到边上分不出边界。
     */
    backgroundColor: '#F4F1E9',
    backgroundColorTop: '#F4F1E9',
    backgroundColorBottom: '#F4F1E9',
    navigationBarBackgroundColor: '#F4F1E9',
    navigationBarTitleText: '单词君',
    navigationBarTextStyle: 'black'
  }
  // 上面这个 cloud 字段要保留 —— 末尾的 `as` 只是因为 **Taro 的类型声明漏了它**：
  // defineAppConfig 的签名是 (config: Taro.AppConfig) => Taro.AppConfig，
  // 而 AppConfig 里没写 cloud。运行时是原样透传的，产物 dist/app.json 里
  // 确实写进了 "cloud": true（实测过），所以断言一下绕开类型，别把它删掉。
} as Taro.AppConfig & { cloud: boolean })
