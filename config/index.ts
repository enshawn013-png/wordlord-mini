import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'wordlord-mini',
    date: '2026-9-26',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [
      '@tarojs/plugin-generator'
    ],
    defineConstants: {
    },
    copy: {
      patterns: [
      ],
      options: {
      }
    },
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: false
    },
    mini: {
      // 构建开始时**不要**清空 dist。
      // Taro 默认会在 setup 阶段把 dist 整个删掉（@tarojs/service/dist/platform-plugin-base/mini.js
      // —— 只有 output.clean 显式为 false 时才跳过），而微信开发者工具开着的时候，
      // 它监听到文件变化会自动重启小程序：正好落进 dist 被删空的那几秒，就会报
      //   dist/app.json: 根据 project.config.json 中 miniprogramRoot 指定的小程序目录 dist/，
      //   在该目录下未找到 app.json
      // 然后整个模拟器白屏（生词本 Tab 点开就是一片白）。
      // 不清空的话，构建期间 dist 里一直是上一次的完整产物，没有这个空窗期。
      // 代价：删掉/改名页面后 dist 里会残留旧文件，那种时候手动 `npm run clean` 一次。
      output: {
        clean: false
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {

          }
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
    },
    h5: {
      // 桌面版要能直接 file:// 打开（不跑本地服务器），所以资源路径用相对路径
      publicPath: './',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js'
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
        // 2026-11：PWA 走的是国际线路（workers.dev），每个 chunk 都要一次 RTT，
        // 23 个文件 = 十几秒。这里关掉 vendor 拆分和 runtime 拆分，尽量并成一个包。
        // Taro 的类型里 splitChunks 只接受对象，运行时传 false 是合法的（webpack 原生支持）
        ;(chain.optimization as any).splitChunks(false)
        ;(chain.optimization as any).runtimeChunk(false)
      }
    },
    rn: {
      appName: 'wordlord-mini',
      postcss: {
        cssModules: {
          enable: false
        }
      }
    }
  }

  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig)
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig)
})
