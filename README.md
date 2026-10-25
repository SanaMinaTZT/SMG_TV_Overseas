# SMG_TV_Overseas

本脚本基于 [jolin1314joker/SMG_TV](https://github.com/jolin1314joker/SMG_TV) 修改（修改部分由 AI 协助完成），主要用于解决海外 IP 访问看看新闻（`live.kankanews.com`）收看五星体育时出现 `403 Forbidden` 的问题。

## 主要改动

1. **支持海外 IP 免梯子直连（五星体育直播）**：
   看看新闻网页端默认使用的火山引擎 CDN（`volc-stream.kksmg.com`）新增了海外 IP 限制，非中国大陆 IP 直连会返回 `403 Forbidden`。本修改版针对五星体育直播接入了未限制海外 IP 的官方新媒体流，适用于所有海外地区免梯子直连观看（国内网络同样可用，也可在页面右上角手动切换源）。
2. **引入 `hls.js` 播放**：
   由于替换后的新媒体直播流需要新版解复用支持（类似高规格媒体流解码兼容），脚本在海外直连模式下使用 `hls.js` 驱动原生 `<video>` 播放。
3. **动态获取回看供体 ID**：
   移除了原脚本中写死且已过期的几个历史节目 ID（404），改为自动从频道近期节目单中动态查找可用回看节目来提取 Token。

## 安装与使用

1. 浏览器安装 [Tampermonkey (油猴)](https://www.tampermonkey.net/) 扩展。
2. 点击下方链接一键安装脚本：
   👉 **[点击安装 smg_fivestar.user.js](https://raw.githubusercontent.com/SanaMinaTZT/SMG_TV_Overseas/main/smg_fivestar.user.js)**
3. 打开 [看看新闻 - 五星体育直播页](https://live.kankanews.com/huikan?id=10) 即可观看。
   - 首次打开若油猴提示跨域请求授权（`gsports-api.smgtech.net` / `cms-tvflow.gsports.net.cn`），点击“始终允许”即可。

## 致谢

- 原项目作者：[jolin1314joker/SMG_TV](https://github.com/jolin1314joker/SMG_TV)

## 免责声明

1. 本脚本仅供音视频技术学习与交流使用，请勿用于商业用途。
2. 视频流及相关内容版权归属于上海广播电视台（SMG）及看看新闻所有。

## 开源协议

基于 [MIT License](./LICENSE) 开源发布。
