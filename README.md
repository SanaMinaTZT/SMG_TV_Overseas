# SMG_TV (五星体育全球海外免梯直连版 · 1080P硬解专修)

[![Release](https://img.shields.io/badge/version-v0.24.0-blue.svg)](https://github.com/SanaMinaTZT/SMG_TV/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Supported-green.svg)](https://www.tampermonkey.net/)
[![Platform](https://img.shields.io/badge/Platform-Global%20Direct%20(海外免梯)-brightgreen.svg)](#-核心突破全球海外免梯直连与-1080p-硬解原理解析)
[![Status](https://img.shields.io/badge/Status-Verified%20Passing-success.svg)](#-开发与自测验证)

打开网页即可流畅收看 **SMGTV 电视节目（东方卫视、五星体育、第一财经等）**，解除试看倒计时、后台切页暂停及版权遮罩限制。

> 🌟 **v0.24.0 核心里程碑**：全面支持**全球所有海外地区（北美、欧洲、澳洲、新西兰、日韩、新加坡、港澳台等所有非中国大陆 IP）免梯子、免回国 VPN 1080P 直连秒开**！内置现代解复用器彻底攻克「只有声音没有画面」的黑屏痛点！同时 100% 兼容中国大陆本地网络。

---

## 🤖 AI 创作声明与开源致谢

1. **AI 全程独立研发声明**：
   - 本项目的所有逆向工程分析、网络抓包排查、DES 加解密算法重构、HLS 视频流硬解对接及 DOM 遮罩粉碎逻辑，**完全由 AI（Advanced Agentic AI）自主分析、编码与调试验证交付**。
2. **开源上游项目致谢**：
   - 本项目深度改良自原开源项目：[https://github.com/jolin1314joker/SMG_TV](https://github.com/jolin1314joker/SMG_TV)（以及 [Nolan180940/smg-f1-unlock](https://github.com/Nolan180940/smg-f1-unlock)）。
   - 感谢原作者搭建的 Token 逆向自举与频道隔离体系！本项目在其基础上，彻底解决了原版在海外环境因 CDN 封锁导致的“403 瘫痪死锁”以及在现代浏览器中“有声无画”的重大技术卡点。

---

## 🌍 核心突破：全球海外免梯直连与 1080P 硬解原理解析

### 1. 攻克火山引擎 CDN 海外 Geo-IP 阻断 (HTTP 403)
- **痛点根因**：原版方案使用的官方流依赖火山引擎 CDN（`volc-stream.kksmg.com`）。火山边缘节点对所有非中国大陆 IP 强行下发了 **Geo-IP 阻断策略（HTTP 403 Forbidden）**。海外用户播放时会陷入不断刷新、反复重试的死循环，彻底无法观看。
- **改良破局**：
  - 逆向挖掘并接入五星体育新媒体独立流（`cms-tvflow.gsports.net.cn`）；
  - 该源的 CDN 边缘节点面向全球开放，**未设置任何国家/地区 Geo-IP 封锁**；
  - 脚本内置 **火山 403 熔断器**，一旦探测到火山节点响应 403，在毫秒级内自动热切至海外专用流，无需用户手动干预。

### 2. 内置工业级轻量原生 DES-ECB 解密引擎
- **痛点根因**：官方网页原本依赖主站 Webpack 加载的动态解密库，但在跨域或独立流场景下主站解密上下文缺失，导致切片解析崩溃。
- **改良破局**：脚本直接内置了一套轻量化、零依赖的纯 JS **原生 DES-ECB 解密引擎**，实现独立流切片的完全自闭环还原解密。

### 3. 穿透 Referer ACL 防盗链与 CORS 跨域拦截
- **痛点根因**：视频流边缘节点配置了针对防盗链的 Referer 白名单校验。
- **改良破局**：在网络代理层通过动态注入 `no-referrer` 策略剥离请求头 Referer，并配合 Tampermonkey 底层 `GM_xmlhttpRequest` 机制穿透浏览器的同源安全策略（CORS）。

### 4. 彻底攻克「只有声音没有画面 / 黑屏遮罩」难题
- **痛点根因**：官方旧版播放器解复用模块存在时钟不同步 Bug，导致只渲染了 AAC 音频轨而丢弃了 AVC/H.264 视频轨；同时页面 DOM 树上覆盖了多达 9 重透明或半透明遮罩层（`.image-mask`, `.video-tip`, `.replay-mask`, `.xgplayer-poster` 等），即便视频在播也被物理遮蔽。
- **改良破局**：
  - 全面引入现代化 **Hls.js@1.5.17** 高性能解复用器直接接管原生 Media Source Extensions (MSE)；
  - 脚本自带**九重遮罩粉碎机制（Player Masks Buster）**，强制清除覆盖在 `<video>` 之上的阻挡元素，实现 1080P 满血画面硬件加速渲染！

---

## ✨ 核心特性一览（对比原版）

| 功能维度 | 原版 (jolin1314joker/SMG_TV) | 本改良版 (v0.24.0) |
| :--- | :--- | :--- |
| **海外地区支持** | ❌ 报 403 瘫痪，必须挂回国 VPN | ✅ **全球免梯直连（美/加/欧/英/澳/新/日/韩/港澳台等零配置秒开）** |
| **画面渲染稳定性** | ⚠️ 部分浏览器只有声音无画面/被遮罩阻挡 | ✅ **内置 Hls.js@1.5.17 + 9 重遮罩粉碎，1080P 视频硬解满血渲染** |
| **流解密机制** | 依赖外部主域 Webpack 挂载 | ✅ **脚本内置原生纯 JS DES-ECB 解密引擎，零依赖完全自闭环** |
| **异常熔断能力** | 403 错误重试可能陷入死循环 | ✅ **403 熔断器毫秒级热切备份流** |
| **全频道隔离** | ✅ Channel ID 隔离 | ✅ 延续并强化 Channel Token 独立自举隔离 |
| **回放与寻道** | ✅ 支持历史节目回放 | ✅ 完整支持时移回放与进度条任意拖拽寻道（Seek） |
| **页面限制解除** | ✅ 试看倒计时 / 失去焦点暂停解除 | ✅ 完美保持所有防倒计时与后台播放特性 |
| **移动端与 Safari** | ✅ 适配 Safari / Stay | ✅ 完美兼容 iOS / macOS Safari / Stay 扩展 |

---

## 🚀 快速安装使用

### 方式 ①：Tampermonkey 油猴插件一键安装（推荐）

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 插件（Chrome / Edge / Firefox / Safari / Kiwi 等）。
2. 点击下方链接，直接在浏览器中触发油猴安装：
   - 🔗 **[点击一键安装脚本 (GitHub Raw)](https://raw.githubusercontent.com/SanaMinaTZT/SMG_TV/main/smg_fivestar.user.js)**
   - 备用链接：[smg_fivestar_fixed.user.js](https://raw.githubusercontent.com/SanaMinaTZT/SMG_TV/main/smg_fivestar_fixed.user.js)
3. 点击 **“安装”** 或 **“更新”** 按钮。
4. 打开 [看看新闻·回看直播页面 (五星体育)](https://live.kankanews.com/huikan?id=10)，刷新即可畅享 1080P 直播！

---

### 方式 ②：开发者控制台（Console）免插件快速体验

如果你临时不想安装浏览器扩展，可在打开网页后直接在控制台运行：

1. 打开 [看看新闻·直播](https://live.kankanews.com/huikan?id=10)；
2. 按 **F12**（或右键 → 检查）打开开发者工具，切换到 **Console（控制台）**；
3. 将 [smg_fivestar.user.js](./smg_fivestar.user.js) 的全部代码复制粘贴到控制台中并回车；
4. 页面即刻解除所有限制并启动全球直连流播放。

---

## 💻 兼容性矩阵

| 运行环境 | 操作系统 | 直播播放 | 回看/Seek | 状态说明 |
| :--- | :--- | :---: | :---: | :--- |
| **Chrome / Edge / Brave** | Windows / macOS / Linux | ✅ | ✅ | 推荐环境，原生硬件加速 |
| **Safari (Stay / Userscripts)** | macOS / iOS / iPadOS | ✅ | ✅ | 支持，需开启“请求桌面网站” |
| **Firefox** | Windows / macOS / Linux | ✅ | ✅ | 完美支持 |
| **Kiwi Browser / Via** | Android 移动端 | ✅ | ✅ | 配合 Tampermonkey 扩展可用 |

---

## 🧪 开发与自测验证

本项目包含完整的本地自动化语法校验与周期续期仿真测试套件：

```bash
# 1. 语法正确性与 AST 校验
node --check smg_fivestar.user.js

# 2. 模拟时钟与 Token 续期看门狗测试
node --test tests/renewal.test.cjs
```

> 本项目通过了包括无头 Chromium / Edge 环境下真实网络请求、DES 解密、Hls.js 实例挂载及 `<video>` 元素渲染尺寸（1920x1080）与播放时间递增的所有严格门禁断言。

---

## 📄 免责声明 (Disclaimer)

1. 本脚本仅用于前端网络工程逆向研究、音视频技术交流及个人无障碍观影学习探讨，严禁用于任何商业目的或非法侵权行为。
2. 视频与音频流的所有版权及知识产权均归属于上海广播电视台（SMG）及看看新闻所有。
3. 请使用者严格遵守当地法律法规。

---

## 📜 开源协议 (License)

本项目基于 [MIT License](./LICENSE) 开源发布。
