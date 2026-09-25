// babel-preset-taro 更多选项和默认值：
// https://docs.taro.zone/docs/next/babel-config
module.exports = {
  presets: [
    ['taro', {
      framework: 'react',
      ts: true,
      compiler: 'webpack5'
    }]
  ],
  // 微信小程序引擎（project.config.json 里 es6:false）不支持 ES2020 的 ?? / ?. 和 ES2019 的 catch{}，
  // 显式降级，避免真机/模拟器报 SyntaxError: Unexpected token ?
  plugins: [
    '@babel/plugin-transform-nullish-coalescing-operator',
    '@babel/plugin-transform-optional-chaining',
    '@babel/plugin-transform-optional-catch-binding'
  ]
}
