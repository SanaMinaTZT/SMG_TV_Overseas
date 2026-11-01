# SMG_TV_Overseas

本脚本基于 [jolin1314joker/SMG_TV](https://github.com/jolin1314joker/SMG_TV) 修改（修改部分由 AI 协助完成），用于解除看看新闻（`live.kankanews.com`）五星体育等频道的网页观看限制，支持海外及国内直连观看直播与 6 天节目回看（含 F1 排位赛、正赛等受保护赛事）。

## 主要改动

1. **修复火山引擎 CDN `403 Forbidden`（海外/国内直连直播与回看）**：
   站点升级至 `2.45.x` 后，火山引擎 CDN（`volc-stream.kksmg.com`）开始校验流 Token 中的版本号（拒绝 `< 2.45.0` 的旧版 Token），且服务端会按设备 ID（`M-Uuid`）缓存旧 Token；同时回看流的时间窗参数由 `startTime` 改为 `start` + `end`。脚本现已支持动态跟随站点版本签名、遇到旧版缓存 Token 时自动轮换 `M-Uuid`，并改用 `/content/app/tv/...` 接口获取完整流地址，彻底解决 F1 直播与回看 `403` 问题。
2. **修复受保护赛事（如 F1 排位赛/正赛）无法点击回看与垫片遮挡**：
   解除节目单中 `is_shield`、`can_review` 及垫片图层（`is_exist_pad` / `pad_src`）限制，历史排期中的 F1 赛事可直接点击回看并支持拖拽进度条。
3. **内置双线路切换（官方原画源 + 新媒体 1080P 备用直播源）**：
   页面右上角提供快捷切换按钮：
   - **线路 1（默认）**：官方源直连，支持五星体育全部赛事（含 F1 直播与 6 天回看）。
   - **线路 2（备用）**：五星体育新媒体 1080P 直播源（`Hls.js` 驱动），若遇新媒体端赛事版权切流或点击回看节目时，会自动切回线路 1。

## 安装与使用

1. 浏览器安装 [Tampermonkey (油猴)](https://www.tampermonkey.net/) 扩展。
2. 点击下方链接一键安装脚本：
   👉 **[点击安装 smg_fivestar.user.js](https://raw.githubusercontent.com/SanaMinaTZT/SMG_TV_Overseas/main/smg_fivestar.user.js)**
3. 打开 [看看新闻 - 五星体育直播页](https://live.kankanews.com/huikan?id=10) 即可观看（若刚更新脚本，刷新一次页面即可生效）。

## 致谢

- 原项目作者：[jolin1314joker/SMG_TV](https://github.com/jolin1314joker/SMG_TV)

## 免责声明

1. 本脚本仅供音视频技术学习与交流使用，请勿用于商业用途。
2. 视频流及相关内容版权归属于上海广播电视台（SMG）及看看新闻所有。

## 开源协议

基于 [MIT License](./LICENSE) 开源发布。
