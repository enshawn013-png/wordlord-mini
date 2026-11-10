export default definePageConfig({
  // custom：和全站一致，导航栏由 components/nav-bar.tsx 自绘
  // disableScroll：这一页自己排版（输入框 + 结果列表 + 底部操作条），
  //   让 ScrollView 管滚动，页面不跟着一起滚 —— 否则键盘弹起时整页会跳。
  navigationStyle: 'custom',
  disableScroll: true
})
