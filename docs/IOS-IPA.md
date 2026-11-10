# 单词君 → iOS 未签名 .ipa

小程序不能直接变 iOS 应用，这条链路是：**Taro H5 构建 → Capacitor 壳（WKWebView）→ Xcode 编译 → 未签名 .ipa**。

编译在 GitHub Actions 的 macOS 机器上跑（免费），签名在你自己的 Windows 上用 Sideloadly + Apple ID 做。

## 一、仓库准备（一次性）

```bash
cd C:/Users/shawn/wordlord-mini
git init                      # 如果还没有仓库
git add -A
git commit -m "wordlord: 导出/导入 + iOS 构建链"
git remote add origin https://github.com/<你的账号>/wordlord-mini.git
git push -u origin main
```

推上去之后 GitHub 会自动识别 `.github/workflows/ios-unsigned-ipa.yml`。

## 二、出 IPA

1. 仓库 → **Actions** → 左侧 **ios-unsigned-ipa** → **Run workflow**
2. 等 10–15 分钟（首次要装 Capacitor + CocoaPods）
3. 跑完在 run 页面底部 **Artifacts** 下载 `wordlord-unsigned-ipa.zip`
4. 解压得到 `wordlord-unsigned.ipa`

`workflow_dispatch` 支持手动触发；以后推 `src/**` 的改动也会自动跑一次。

## 三、签名并装到 iPhone（Windows，全免费）

1. 装 [iTunes](https://www.apple.com/itunes/)（或 Microsoft Store 的「Apple 设备」）+ [Sideloadly](https://sideloadly.io/)
2. iPhone 用数据线连电脑，信任这台电脑
3. Sideloadly：拖入 `wordlord-unsigned.ipa`，Apple ID 填你自己的，点 Start
4. 手机上：设置 → 通用 → VPN与设备管理 → 信任你的开发者证书
5. **7 天后过期**，重复第 3 步重签即可（有 $99/年 开发者账号则 1 年）

## 四、已知差异（小程序 vs iOS 壳）

| 能力 | 小程序 | iOS 壳（H5） |
|---|---|---|
| 学习数据存储 | 微信本地缓存 | localStorage（**清 App 数据会丢**，所以先导出） |
| 导出备份 | 发到聊天 / 另存为 | 走剪贴板兜底（H5 无 `shareFileMessage`） |
| 导入词书（docx/pdf） | 支持 | H5 端解析能力有限，txt/csv 可用 |
| 发音 | 有道 TTS | 同（走网络，iOS 允许） |
| 深色模式 / 安全区 | 微信适配 | Capacitor `contentInset: always` |

要补齐分享/文件能力，后续加 `@capacitor/share`、`@capacitor/filesystem` 两个插件即可。

## 五、为什么不在这里签名

自动签名需要 **Apple 开发者证书（.p12）+ 描述文件 + 账号凭据** 存进 GitHub Secrets，这些只有 $99/年 开发者账号才有；免费 Apple ID 的签名必须发生在有 Xcode 登录态的机器上，无头 CI 做不了。

所以免费路线只有这一种组合：**CI 出未签名包 + 本机 Sideloadly 签**。
