// ==UserScript==
// @name             收看SMGTV电视节目 (五星体育海外直连修改版)
// @namespace        https://github.com/SanaMinaTZT/SMG_TV
// @version          0.24.0
// @description      SMGTV 电视直播与回放（基于 jolin1314joker/SMG_TV 修改）。解决海外 IP 访问火山引擎 CDN 报 403 Forbidden 问题，五星体育支持免代理直连播放，并支持动态获取回看节目提取 Token。
// @author           SanaMinaTZT (Based on jolin1314joker/SMG_TV)
// @homepageURL      https://github.com/SanaMinaTZT/SMG_TV
// @supportURL       https://github.com/SanaMinaTZT/SMG_TV/issues
// @downloadURL      https://raw.githubusercontent.com/SanaMinaTZT/SMG_TV/main/smg_fivestar.user.js
// @updateURL        https://raw.githubusercontent.com/SanaMinaTZT/SMG_TV/main/smg_fivestar.user.js
// @match            https://live.kankanews.com/*
// @match            https://m.kankanews.com/*
// @match            http://live.kankanews.com/*
// @match            http://m.kankanews.com/*
// @icon             https://live.kankanews.com/favicon.ico
// @require          https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js
// @grant            GM_xmlhttpRequest
// @grant            GM.xmlHttpRequest
// @grant            unsafeWindow
// @run-at           document-body
// @compatible       safari
// @compatible       stay
// ==/UserScript==

/* =========================================================================
 * 项目说明与致谢：
 * 1. 本脚本基于开源项目 https://github.com/jolin1314joker/SMG_TV 进行修改（修改部分由 AI 协助完成）。
 * 2. 主要解决海外网络环境下访问看看新闻五星体育直播时 CDN 报 403 Forbidden 的问题。
 * 3. 引入 hls.js 驱动新媒体直播流解码播放，并改为动态获取近期节目单提取回看 Token。
 * ========================================================================= */

(function() {
    "use strict";

    var _win = (typeof unsafeWindow !== "undefined" && unsafeWindow !== null) ? unsafeWindow : window;
    var _gmXhr = (typeof GM_xmlhttpRequest === "function") ? GM_xmlhttpRequest :
                 (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function") ? GM.xmlHttpRequest : null;
    var origFetch = (_win && _win.fetch) ? _win.fetch.bind(_win) : (typeof fetch !== "undefined" ? fetch : null);

    // ===== Modern Hls.js Loader & Double-Insurance Fallback =====
    function smgEnsureHlsJs() {
        var hlsObj = (typeof Hls !== "undefined") ? Hls : (_win && _win.Hls);
        if (hlsObj && hlsObj.isSupported && hlsObj.isSupported()) {
            return Promise.resolve(hlsObj);
        }
        if (window._smgHlsLoadingPromise) return window._smgHlsLoadingPromise;

        window._smgHlsLoadingPromise = new Promise(function(resolve, reject) {
            var script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
            script.crossOrigin = "anonymous";
            script.onload = function() {
                var h = (typeof Hls !== "undefined") ? Hls : (_win && _win.Hls);
                if (h) {
                    console.log("[SMGTV] Dynamic hls.js (jsdelivr) loaded successfully");
                    resolve(h);
                } else {
                    reject(new Error("Hls.js loaded but Hls global not found"));
                }
            };
            script.onerror = function() {
                var s2 = document.createElement("script");
                s2.src = "https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js";
                s2.crossOrigin = "anonymous";
                s2.onload = function() {
                    var h = (typeof Hls !== "undefined") ? Hls : (_win && _win.Hls);
                    if (h) {
                        console.log("[SMGTV] Dynamic hls.js (cdnjs fallback) loaded successfully");
                        resolve(h);
                    } else {
                        reject(new Error("Hls.js fallback loaded but Hls global not found"));
                    }
                };
                s2.onerror = function(err) {
                    reject(new Error("Failed to load Hls.js from all CDNs"));
                };
                (document.head || document.documentElement).appendChild(s2);
            };
            (document.head || document.documentElement).appendChild(script);
        });
        return window._smgHlsLoadingPromise;
    }

    // ===== Player Masks Buster (Guarantees zero obscuring layers above <video>) =====
    function smgClearPlayerMasks() {
        try {
            var maskSelectors = [
                ".image-mask",
                ".video-tip",
                ".replay-mask",
                ".xgplayer-poster",
                ".xg-poster",
                ".xg-enter",
                ".xg-enter-logo",
                ".player-mask",
                ".loading-mask"
            ];
            for (var m = 0; m < maskSelectors.length; m++) {
                var els = document.querySelectorAll(maskSelectors[m]);
                for (var i = 0; i < els.length; i++) {
                    els[i].style.setProperty("display", "none", "important");
                    els[i].style.setProperty("visibility", "hidden", "important");
                    els[i].style.setProperty("opacity", "0", "important");
                    els[i].style.setProperty("z-index", "-999", "important");
                    els[i].style.setProperty("pointer-events", "none", "important");
                }
            }
            var vList = document.querySelectorAll("#player video, .live-player video, .xgplayer video, video");
            for (var v = 0; v < vList.length; v++) {
                vList[v].style.setProperty("display", "block", "important");
                vList[v].style.setProperty("visibility", "visible", "important");
                vList[v].style.setProperty("opacity", "1", "important");
                vList[v].style.setProperty("position", "relative", "important");
                vList[v].style.setProperty("z-index", "20", "important");
                vList[v].style.setProperty("background", "#000", "important");
                vList[v].style.setProperty("object-fit", "contain", "important");
            }
        } catch(e) {
            console.warn("[SMGTV] Clear player masks warning:", e);
        }
    }

    // ===== Global Referrer Policy Enforcement (Bypasses Referer ACL without GM) =====
    function smgEnsureNoReferrerMeta() {
        try {
            if (typeof document === "undefined") return;
            var head = document.head || document.getElementsByTagName("head")[0] || document.documentElement;
            if (!head) return;
            var meta = document.querySelector('meta[name="referrer"]');
            if (meta) {
                if (meta.getAttribute("content") !== "no-referrer") {
                    meta.setAttribute("content", "no-referrer");
                    console.log("[SMGTV] Updated existing <meta name='referrer'> to 'no-referrer'");
                }
            } else {
                meta = document.createElement("meta");
                meta.name = "referrer";
                meta.content = "no-referrer";
                head.appendChild(meta);
                console.log("[SMGTV] Injected <meta name='referrer' content='no-referrer'>");
            }
        } catch(e) {
            console.warn("[SMGTV] Failed to inject no-referrer meta:", e);
        }
    }
    smgEnsureNoReferrerMeta();
    if (typeof document !== "undefined" && document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", smgEnsureNoReferrerMeta);
    }

    console.log("[SMGTV] ========== v0.23.1 (Fixed: smgGmFetch Recursion & Zero-GM Native No-Referrer Support) ==========");
    console.log("[SMGTV] URL:", (typeof location !== "undefined" ? location.href : ""));
    console.log("[SMGTV] UA:", (typeof navigator !== "undefined" ? navigator.userAgent : ""));
    console.log("[SMGTV] GM_xmlhttpRequest status:", _gmXhr ? "Ready" : "Unavailable (Fallback to native origFetch)");


    // ===== 0. Pure JavaScript DES-ECB Implementation (Zero Dependencies) =====
    var DES_PC1 = [
        57, 49, 41, 33, 25, 17,  9,  1, 58, 50, 42, 34, 26, 18,
        10,  2, 59, 51, 43, 35, 27, 19, 11,  3, 60, 52, 44, 36,
        63, 55, 47, 39, 31, 23, 15,  7, 62, 54, 46, 38, 30, 22,
        14,  6, 61, 53, 45, 37, 29, 21, 13,  5, 28, 20, 12,  4
    ];
    var DES_PC2 = [
        14, 17, 11, 24,  1,  5,  3, 28, 15,  6, 21, 10,
        23, 19, 12,  4, 26,  8, 16,  7, 27, 20, 13,  2,
        41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48,
        44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32
    ];
    var DES_SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
    var DES_IP = [
        58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
        62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
        57, 49, 41, 33, 25, 17,  9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
        61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7
    ];
    var DES_IP_INV = [
        40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
        38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
        36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
        34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41,  9, 49, 17, 57, 25
    ];
    var DES_E = [
        32,  1,  2,  3,  4,  5,  4,  5,  6,  7,  8,  9,
         8,  9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17,
        16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25,
        24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32,  1
    ];
    var DES_S_BOXES = [
        [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
        [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
        [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
        [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
        [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
        [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
        [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
        [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
    ];
    var DES_P = [
        16,  7, 20, 21, 29, 12, 28, 17,  1, 15, 23, 26,  5, 18, 31, 10,
         2,  8, 24, 14, 32, 27,  3,  9, 19, 13, 30,  6, 22, 11,  4, 25
    ];

    function desBytesToBits(bytes) {
        var bits = [];
        for (var i = 0; i < bytes.length; i++) {
            for (var j = 7; j >= 0; j--) bits.push((bytes[i] >> j) & 1);
        }
        return bits;
    }
    function desBitsToBytes(bits) {
        var bytes = [];
        for (var i = 0; i < bits.length; i += 8) {
            var b = 0;
            for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
            bytes.push(b);
        }
        return bytes;
    }
    function desPermute(src, table) {
        var out = [];
        for (var i = 0; i < table.length; i++) out.push(src[table[i] - 1]);
        return out;
    }
    function desGenerateSubkeys(keyBytes) {
        var keyBits = desBytesToBits(keyBytes.slice(0, 8));
        var permutedKey = desPermute(keyBits, DES_PC1);
        var c = permutedKey.slice(0, 28);
        var d = permutedKey.slice(28, 56);
        var subkeys = [];
        for (var i = 0; i < 16; i++) {
            var shift = DES_SHIFTS[i];
            c = c.slice(shift).concat(c.slice(0, shift));
            d = d.slice(shift).concat(d.slice(0, shift));
            subkeys.push(desPermute(c.concat(d), DES_PC2));
        }
        return subkeys;
    }
    function desFeistel(r, subkey) {
        var expanded = desPermute(r, DES_E);
        var xored = [];
        for (var i = 0; i < 48; i++) xored.push(expanded[i] ^ subkey[i]);
        var sOutput = [];
        for (var s = 0; s < 8; s++) {
            var chunk = xored.slice(s * 6, (s + 1) * 6);
            var row = (chunk[0] << 1) | chunk[5];
            var col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
            var val = DES_S_BOXES[s][row * 16 + col];
            for (var j = 3; j >= 0; j--) sOutput.push((val >> j) & 1);
        }
        return desPermute(sOutput, DES_P);
    }
    function desDecryptBlock(blockBytes, subkeys) {
        var blockBits = desBytesToBits(blockBytes);
        var permuted = desPermute(blockBits, DES_IP);
        var l = permuted.slice(0, 32);
        var r = permuted.slice(32, 64);
        for (var i = 15; i >= 0; i--) {
            var f = desFeistel(r, subkeys[i]);
            var nextL = r;
            var nextR = [];
            for (var j = 0; j < 32; j++) nextR.push(l[j] ^ f[j]);
            l = nextL;
            r = nextR;
        }
        return desBitsToBytes(desPermute(r.concat(l), DES_IP_INV));
    }
    function smgPureDesDecryptHex(hexStr, keyStr) {
        try {
            var keyBytes = [];
            for (var i = 0; i < Math.min(8, keyStr.length); i++) keyBytes.push(keyStr.charCodeAt(i));
            while (keyBytes.length < 8) keyBytes.push(0);
            var subkeys = desGenerateSubkeys(keyBytes);
            var hexClean = (hexStr || "").trim();
            var cipherBytes = [];
            for (var c = 0; c < hexClean.length; c += 2) {
                cipherBytes.push(parseInt(hexClean.slice(c, c + 2), 16));
            }
            var decryptedBytes = [];
            for (var b = 0; b < cipherBytes.length; b += 8) {
                var block = cipherBytes.slice(b, b + 8);
                if (block.length === 8) {
                    var dec = desDecryptBlock(block, subkeys);
                    for (var d = 0; d < dec.length; d++) decryptedBytes.push(dec[d]);
                }
            }
            var res = "";
            for (var r = 0; r < decryptedBytes.length; r++) {
                if (decryptedBytes[r] === 0) break;
                res += String.fromCharCode(decryptedBytes[r]);
            }
            return res.trim();
        } catch(e) {
            console.error("[SMGTV] Pure DES decrypt failed:", e);
            return "";
        }
    }

    // ===== GM & Clean Referer Proxy for Gsports CDN (Bypasses Referer ACL & CORS) =====
    function smgGmFetch(url, options) {
        return new Promise(function(resolve, reject) {
            smgEnsureNoReferrerMeta();

            // Native fetch fallback using unhooked origFetch with strict no-referrer policy
            function doNativeFetchFallback() {
                if (!origFetch) {
                    return reject(new Error("No native fetch available for fallback"));
                }
                var fallbackOpts = Object.assign({}, options || {}, {
                    referrer: "",
                    referrerPolicy: "no-referrer"
                });
                return origFetch(url, fallbackOpts).then(function(res) {
                    var isM3u8 = (url.indexOf(".m3u8") !== -1) ||
                                 (res.headers && res.headers.get && res.headers.get("content-type") && res.headers.get("content-type").indexOf("mpegurl") !== -1);
                    if (isM3u8) {
                        return res.text().then(function(text) {
                            if (text.indexOf("#EXTM3U") !== -1) {
                                var baseUrl = url.substring(0, url.lastIndexOf("/") + 1);
                                var rewritten = text.split("\n").map(function(l) {
                                    var trimL = l.trim();
                                    if (trimL && !trimL.startsWith("#") && !trimL.startsWith("http://") && !trimL.startsWith("https://")) {
                                        return baseUrl + trimL;
                                    }
                                    return l;
                                }).join("\n");
                                var newHeaders = new Headers(res.headers);
                                try {
                                    newHeaders.delete("content-length");
                                    newHeaders.delete("content-encoding");
                                } catch(e) {}
                                return new Response(rewritten, {
                                    status: res.status,
                                    statusText: res.statusText,
                                    headers: newHeaders
                                });
                            }
                            return new Response(text, {
                                status: res.status,
                                statusText: res.statusText,
                                headers: res.headers
                            });
                        });
                    }
                    return res;
                }).then(resolve).catch(reject);
            }

            if (!_gmXhr) {
                return doNativeFetchFallback();
            }

            var method = (options && options.method) || "GET";
            var headers = Object.assign({}, (options && options.headers) || {});
            // Strip headers that trigger Referer ACL on Alibaba / Tengine CDN
            delete headers["Referer"];
            delete headers["referer"];
            delete headers["Origin"];
            delete headers["origin"];

            try {
                _gmXhr({
                    method: method,
                    url: url,
                    headers: headers,
                    data: options && options.body,
                    responseType: "arraybuffer",
                    timeout: 15000,
                    onload: function(res) {
                        if (res.status >= 400 && res.status < 600) {
                            console.warn("[SMGTV] GM_xmlhttpRequest returned HTTP " + res.status + ", fallback to native origFetch...");
                            return doNativeFetchFallback();
                        }
                        var respHeaders = new Headers();
                        if (res.responseHeaders) {
                            var rawLines = res.responseHeaders.split("\r\n");
                            for (var i = 0; i < rawLines.length; i++) {
                                var line = rawLines[i];
                                var idx = line.indexOf(":");
                                if (idx > 0) {
                                    var k = line.substring(0, idx).trim();
                                    var v = line.substring(idx + 1).trim();
                                    try { respHeaders.append(k, v); } catch(e) {}
                                }
                            }
                        }

                        var buffer = res.response;
                        // Check if response is m3u8 playlist, rewrite relative TS paths to absolute URLs
                        var isM3u8 = (url.indexOf(".m3u8") !== -1) ||
                                     (respHeaders.get("content-type") && respHeaders.get("content-type").indexOf("mpegurl") !== -1);
                        if (isM3u8 && buffer && buffer.byteLength > 0) {
                            try {
                                var text = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
                                if (text.indexOf("#EXTM3U") !== -1) {
                                    var baseUrl = url.substring(0, url.lastIndexOf("/") + 1);
                                    var rewritten = text.split("\n").map(function(l) {
                                        var trimL = l.trim();
                                        if (trimL && !trimL.startsWith("#") && !trimL.startsWith("http://") && !trimL.startsWith("https://")) {
                                            return baseUrl + trimL;
                                        }
                                        return l;
                                    }).join("\n");
                                    buffer = new TextEncoder().encode(rewritten).buffer;
                                }
                            } catch(e) {
                                console.warn("[SMGTV] Failed to rewrite m3u8 URLs:", e);
                            }
                        }

                        var response = new Response(buffer, {
                            status: res.status,
                            statusText: res.statusText || "OK",
                            headers: respHeaders
                        });
                        resolve(response);
                    },
                    onerror: function(err) {
                        console.warn("[SMGTV] GM_xmlhttpRequest failed, fallback to native origFetch:", err);
                        doNativeFetchFallback();
                    },
                    ontimeout: function() {
                        console.warn("[SMGTV] GM_xmlhttpRequest timed out, fallback to native origFetch");
                        doNativeFetchFallback();
                    }
                });
            } catch(e) {
                console.warn("[SMGTV] GM_xmlhttpRequest invocation error, fallback to native origFetch:", e);
                doNativeFetchFallback();
            }
        });
    }

    // ===== Overseas Direct Stream (SMG Tech Dedicated Stream) =====
    var SMG_GSPORTS_DES_KEY = "7jKKND2V38eXvJEm";
    var _smgOverseasCache = { url: "", expiresAt: 0, fetching: null };

    function smgFetchOverseasStream(force) {
        var now = Date.now();
        if (!force && _smgOverseasCache.url && now < _smgOverseasCache.expiresAt) {
            return Promise.resolve(_smgOverseasCache.url);
        }
        if (_smgOverseasCache.fetching) return _smgOverseasCache.fetching;

        _smgOverseasCache.fetching = new Promise(function(resolve, reject) {
            var time = Math.floor(now / 1000);
            var appId = "5starsalt";
            var nonceStr = "z7cl7WR9";
            var secret = "ysc7mpeu6i39";
            var signRaw = "appId=" + appId + "&nonceStr=" + nonceStr + "&time=" + time + secret;
            var sign = smgMd5(signRaw);

            var body = "appId=" + encodeURIComponent(appId) +
                "&nonceStr=" + encodeURIComponent(nonceStr) +
                "&time=" + encodeURIComponent(time) +
                "&sign=" + encodeURIComponent(sign);

            var reqHeaders = {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            };

            var postPromise;
            if (_gmXhr) {
                postPromise = new Promise(function(resXhr, rejXhr) {
                    try {
                        _gmXhr({
                            method: "POST",
                            url: "https://gsports-api.smgtech.net/api/v1/channel/channel/list",
                            headers: reqHeaders,
                            data: body,
                            timeout: 10000,
                            onload: function(r) {
                                if (r.status >= 200 && r.status < 300) {
                                    resXhr(r.responseText);
                                } else {
                                    rejXhr(new Error("GM HTTP " + r.status));
                                }
                            },
                            onerror: function(e) { rejXhr(new Error("Network error contacting gsports API (GM)")); },
                            ontimeout: function() { rejXhr(new Error("Timeout contacting gsports API (GM)")); }
                        });
                    } catch(e) {
                        rejXhr(e);
                    }
                }).catch(function(err) {
                    console.warn("[SMGTV] GM POST failed, fallback to native origFetch:", err);
                    if (!origFetch) throw new Error("No origFetch available for fallback");
                    return origFetch("https://gsports-api.smgtech.net/api/v1/channel/channel/list", {
                        method: "POST",
                        headers: reqHeaders,
                        body: body,
                        referrer: "",
                        referrerPolicy: "no-referrer"
                    }).then(function(r) { return r.text(); });
                });
            } else {
                if (!origFetch) {
                    _smgOverseasCache.fetching = null;
                    return reject(new Error("No native origFetch available for overseas API"));
                }
                postPromise = origFetch("https://gsports-api.smgtech.net/api/v1/channel/channel/list", {
                    method: "POST",
                    headers: reqHeaders,
                    body: body,
                    referrer: "",
                    referrerPolicy: "no-referrer"
                }).then(function(r) { return r.text(); });
            }

            postPromise.then(function(responseText) {
                var data = JSON.parse(responseText);
                var list = (data && data.data) || [];
                var targetCipher = "";
                for (var i = 0; i < list.length; i++) {
                    if (list[i] && (list[i].id === 1 || list[i].name === "五星体育")) {
                        targetCipher = list[i].live_address || list[i].default_address;
                        break;
                    }
                }
                if (!targetCipher) {
                    throw new Error("No live_address in gsports response");
                }
                var decUrl = smgPureDesDecryptHex(targetCipher, SMG_GSPORTS_DES_KEY);
                if (decUrl && decUrl.indexOf("http") === 0) {
                    console.log("[SMGTV] [Overseas] Direct stream successfully unlocked:", decUrl);
                    _smgOverseasCache.url = decUrl;
                    _smgOverseasCache.expiresAt = now + 1800 * 1000; // 30 min cache
                    resolve(decUrl);
                } else {
                    throw new Error("DES decrypt produced invalid URL: " + decUrl);
                }
            }).catch(function(e) {
                _smgOverseasCache.fetching = null;
                reject(e);
            }).finally(function() {
                _smgOverseasCache.fetching = null;
            });
        });

        return _smgOverseasCache.fetching;
    }

    // Expose overseas helpers on window for console usage, debugging & automated tests
    if (_win) {
        _win.__smgOverseas = {
            fetchStream: smgFetchOverseasStream,
            gmFetch: smgGmFetch,
            ensureNoReferrer: smgEnsureNoReferrerMeta
        };
    }

    // ===== 1. CSS: hide copyright mask & video tips =====
    var style = document.createElement("style");
    style.textContent = [
        ".image-mask,.video-tip,.replay-mask,.xgplayer-poster,.xg-poster,.xg-enter,.xg-enter-logo,.player-mask,.loading-mask{display:none!important;visibility:hidden!important;opacity:0!important;z-index:-999!important;pointer-events:none!important;}",
        "#player video,.live-player video,.xgplayer video{display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;z-index:20!important;background:#000!important;object-fit:contain!important;}",
        "#smg-assistant-panel{position:fixed;top:14px;right:14px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;line-height:1.4;color:#f0f2f5;pointer-events:auto}",
        "#smg-assistant-panel *{box-sizing:border-box}",
        ".smg-pill{display:flex;align-items:center;gap:8px;padding:6px 12px;background:rgba(23,28,38,0.88);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.18);border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.35);transition:all .2s ease}",
        ".smg-pill:hover{border-color:rgba(255,255,255,0.35);background:rgba(28,34,48,0.95)}",
        ".smg-dot{width:8px;height:8px;border-radius:50%;display:inline-block}",
        ".smg-dot-green{background:#10b981;box-shadow:0 0 8px #10b981}",
        ".smg-dot-yellow{background:#f59e0b;box-shadow:0 0 8px #f59e0b}",
        ".smg-dot-red{background:#ef4444;box-shadow:0 0 8px #ef4444}",
        ".smg-btn{cursor:pointer;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;transition:all .15s}",
        ".smg-btn:hover{background:rgba(255,255,255,0.25);border-color:rgba(255,255,255,0.4)}",
        ".smg-alert-card{margin-top:8px;padding:10px 14px;background:rgba(35,18,22,0.92);backdrop-filter:blur(10px);border:1px solid #ef4444;border-radius:10px;max-width:340px;box-shadow:0 6px 20px rgba(0,0,0,0.45);animation:smgFadeIn .2s ease}",
        ".smg-alert-title{font-weight:600;color:#f87171;margin-bottom:4px;display:flex;align-items:center;gap:6px}",
        ".smg-alert-body{font-size:11px;color:#cbd5e1;line-height:1.5}",
        ".smg-modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.65);z-index:1000000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}",
        ".smg-modal{width:420px;max-width:92%;background:#1e2430;border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:20px;color:#fff;box-shadow:0 12px 36px rgba(0,0,0,0.5)}",
        ".smg-modal h3{margin:0 0 12px 0;font-size:16px;color:#60a5fa}",
        ".smg-modal input{width:100%;padding:8px 12px;background:#0f172a;border:1px solid rgba(255,255,255,0.25);border-radius:6px;color:#fff;font-size:13px;margin:8px 0 12px 0;outline:none}",
        ".smg-modal input:focus{border-color:#38bdf8;box-shadow:0 0 0 2px rgba(56,189,248,0.25)}",
        ".smg-modal-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}",
        "@keyframes smgFadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}"
    ].join("");
    (document.head || document.documentElement).appendChild(style);
    console.log("[SMGTV] CSS injected");

    // ===== Proxy Configuration & Diagnostic Helpers =====
    function smgGetProxy() {
        try {
            return (localStorage.getItem("smg_custom_proxy") || "").trim();
        } catch(e) {
            return "";
        }
    }
    function smgSetProxy(val) {
        try {
            if (val && val.trim()) localStorage.setItem("smg_custom_proxy", val.trim());
            else localStorage.removeItem("smg_custom_proxy");
        } catch(e) {}
    }
    function smgApplyProxy(url) {
        if (!url) return url;
        var proxy = smgGetProxy();
        if (!proxy) return url;
        if (proxy.indexOf("%s") !== -1) {
            return proxy.replace("%s", encodeURIComponent(url));
        }
        if (!proxy.startsWith("http://") && !proxy.startsWith("https://") && !proxy.includes("/")) {
            return url.replace("volc-stream.kksmg.com", proxy);
        }
        if (proxy.endsWith("=") || proxy.endsWith("/")) {
            return proxy + encodeURIComponent(url);
        }
        return proxy + "?url=" + encodeURIComponent(url);
    }

    var savedOverseasPref = null;
    try { savedOverseasPref = localStorage.getItem("smg_prefer_overseas"); } catch(e) {}
    // Default to true (overseas direct mode) for Five Star Sports unless user explicitly set to false
    var isNodeTestEnv = (typeof process !== "undefined" && Boolean(process.versions && process.versions.node)) || (typeof navigator !== "undefined" && navigator.userAgent === "test");
    var defaultOverseas = isNodeTestEnv ? false : ((savedOverseasPref === "false") ? false : true);

    var _smgCurrentState = {
        status: "idle",
        text: "初始化...",
        channelId: "10",
        activeUrl: "",
        isOverseasMode: defaultOverseas,
        showCard: false
    };

    function smgToggleStreamMode() {
        _smgCurrentState.isOverseasMode = !_smgCurrentState.isOverseasMode;
        try { localStorage.setItem("smg_prefer_overseas", _smgCurrentState.isOverseasMode ? "true" : "false"); } catch(e){}
        console.log("[SMGTV] Switched stream mode to:", _smgCurrentState.isOverseasMode ? "OVERSEAS" : "DOMESTIC");
        var vue = findVue();
        if (_smgCurrentState.isOverseasMode) {
            _smgCurrentState.status = "fetching";
            _smgCurrentState.text = "正在拉取海外免梯流...";
            smgRenderFloatingPanel();
            smgFetchOverseasStream(true).then(function(url) {
                _smgCurrentState.activeUrl = url;
                _smgCurrentState.status = "playing";
                _smgCurrentState.text = "🌏 海外免梯直连中";
                _smgCurrentState.showCard = false;
                smgRenderFloatingPanel();
                if (vue && typeof vue.initPlayer === "function") {
                    vue.__smgPendingInit = null;
                    try { vue.initPlayer(); } catch(e) { console.error("[SMGTV] initPlayer switch error:", e); }
                } else if (window._smgLastPlayer && typeof window._smgLastPlayer.switchURL === "function") {
                    window._smgLastPlayer.switchURL(url);
                } else {
                    location.reload();
                }
            }).catch(function(err) {
                _smgCurrentState.status = "error";
                _smgCurrentState.text = "海外源拉取失败: " + err.message;
                smgRenderFloatingPanel();
            });
        } else {
            // Switch back to domestic
            delete _smgTokenCache[_smgCurrentState.channelId];
            _smgCurrentState.status = "fetching";
            _smgCurrentState.text = "正在切回大陆官方源...";
            smgRenderFloatingPanel();
            if (vue && typeof vue.initPlayer === "function") {
                vue.__smgPendingInit = null;
                try { vue.initPlayer(); } catch(e) { console.error("[SMGTV] initPlayer switch error:", e); }
            } else {
                location.reload();
            }
        }
    }
    if (_win) {
        _win._smgCurrentState = _smgCurrentState;
        _win.smgToggleStreamMode = smgToggleStreamMode;
    }

    function smgRenderFloatingPanel() {
        if (typeof document === "undefined" || !document.body) return;
        var panel = document.getElementById("smg-assistant-panel");
        if (!panel) {
            panel = document.createElement("div");
            panel.id = "smg-assistant-panel";
            document.body.appendChild(panel);
        }

        var dotClass = "smg-dot-green";
        if (_smgCurrentState.status === "fetching") dotClass = "smg-dot-yellow";
        else if (_smgCurrentState.status === "geoblocked" || _smgCurrentState.status === "error") dotClass = "smg-dot-red";

        var proxyConfigured = !!smgGetProxy();
        var proxyBtnLabel = proxyConfigured ? "⚙️ 反代: 已开启" : "⚙️ 反代设置";
        var modeBtnLabel = _smgCurrentState.isOverseasMode ? "🌏 源: 海外免梯 (点击切回)" : "🇨🇳 源: 大陆官方 (点击切海外免梯)";

        var html = '<div class="smg-pill">' +
            '<span class="smg-dot ' + dotClass + '"></span>' +
            '<span><b>SMGTV</b> ' + _smgCurrentState.text + '</span>' +
            '<button class="smg-btn" id="smg-btn-mode" style="color:#6ee7b7;font-weight:600">' + modeBtnLabel + '</button>' +
            '<button class="smg-btn" id="smg-btn-proxy">' + proxyBtnLabel + '</button>' +
            '<button class="smg-btn" id="smg-btn-copy" title="复制当前播放的m3u8地址">📋 复制流</button>' +
            '<button class="smg-btn" id="smg-btn-refresh" title="重新获取流与Token">🔄 刷新</button>' +
            '</div>';

        if (_smgCurrentState.status === "geoblocked" && _smgCurrentState.showCard) {
            html += '<div class="smg-alert-card">' +
                '<div class="smg-alert-title"><span>⚠️</span> 海外地区版权限制 (403 Forbidden)</div>' +
                '<div class="smg-alert-body">' +
                '火山引擎 CDN 已识别海外客户端 IP 并阻断直连播放。<br>' +
                '本脚本已成功解密出<b>原生有效 Token</b> 与回看流！<br>' +
                '👉 <b>解决方案</b>：点击右上角【' + proxyBtnLabel + '】填入国内反代或自建 Cloudflare Worker 前缀即可秒播。' +
                '</div>' +
                '</div>';
        }

        panel.innerHTML = html;

        var btnMode = document.getElementById("smg-btn-mode");
        if (btnMode) btnMode.onclick = smgToggleStreamMode;

        var btnProxy = document.getElementById("smg-btn-proxy");
        if (btnProxy) btnProxy.onclick = smgOpenProxyModal;

        var btnCopy = document.getElementById("smg-btn-copy");
        if (btnCopy) btnCopy.onclick = function() {
            var url = _smgCurrentState.activeUrl || "";
            if (!url && _smgTokenCache[_smgCurrentState.channelId]) {
                url = smgBuildLiveUrl(_smgTokenCache[_smgCurrentState.channelId]);
            }
            if (url) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(function() {
                        alert("✅ 已复制完整 m3u8 流地址至剪贴板！可粘贴至 PotPlayer / VLC 播放。");
                    });
                } else {
                    prompt("请手动复制流地址：", url);
                }
            } else {
                alert("当前尚未就绪，未能生成完整流地址。");
            }
        };

        var btnRefresh = document.getElementById("smg-btn-refresh");
        if (btnRefresh) btnRefresh.onclick = function() {
            var vue = findVue();
            if (vue) {
                delete _smgTokenCache[getCurChannelId(vue)];
                smgEnsureToken(vue, function(t) {
                    if (vue.initPlayer) vue.initPlayer();
                }, true);
            }
        };

        var btnQuickOverseas = document.getElementById("smg-btn-quick-overseas");
        if (btnQuickOverseas) btnQuickOverseas.onclick = function() {
            if (!_smgCurrentState.isOverseasMode) smgToggleStreamMode();
        };
    }

    function smgUpdateStatus(status, text, showCard) {
        _smgCurrentState.status = status;
        _smgCurrentState.text = text;
        if (showCard !== undefined) _smgCurrentState.showCard = showCard;
        smgRenderFloatingPanel();
    }

    function smgOpenProxyModal() {
        var existing = document.getElementById("smg-proxy-modal-overlay");
        if (existing) existing.remove();

        var overlay = document.createElement("div");
        overlay.id = "smg-proxy-modal-overlay";
        overlay.className = "smg-modal-overlay";

        var currentProxy = smgGetProxy();
        overlay.innerHTML = '<div class="smg-modal">' +
            '<h3>⚙️ SMGTV 反代与海外免代理设置</h3>' +
            '<p style="font-size:12px;color:#94a3b8;margin:0 0 10px 0;">' +
            '火山引擎 CDN 对五星体育等频道实施了国内区域限制。海外直连时可通过输入国内反代域名或 CORS 代理前缀无缝播放：' +
            '</p>' +
            '<label style="font-size:11px;color:#cbd5e1;">反代前缀 / 目标域名：</label>' +
            '<input id="smg-input-proxy" type="text" placeholder="例如: https://your-cf-worker.workers.dev/?url=" value="' + currentProxy + '" />' +
            '<div style="font-size:11px;color:#64748b;line-height:1.5;">' +
            '• 格式 1 (URL 前缀): <code>https://my-proxy.com/?url=</code><br>' +
            '• 格式 2 (模板占位): <code>https://my-proxy.com/%s</code><br>' +
            '• 格式 3 (域名直接替换): <code>my-volc-reverse-proxy.com</code>' +
            '</div>' +
            '<div class="smg-modal-btns">' +
            '<button class="smg-btn" id="smg-modal-clear" style="padding:6px 12px;">清空恢复直连</button>' +
            '<button class="smg-btn" id="smg-modal-cancel" style="padding:6px 12px;">取消</button>' +
            '<button class="smg-btn" id="smg-modal-save" style="padding:6px 14px;background:#2563eb;border-color:#3b82f6;">保存并重载</button>' +
            '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        document.getElementById("smg-modal-cancel").onclick = function() { overlay.remove(); };
        document.getElementById("smg-modal-clear").onclick = function() {
            smgSetProxy("");
            overlay.remove();
            alert("已清空代理设置，恢复直连模式。");
            var vue = findVue();
            if (vue && vue.initPlayer) vue.initPlayer();
        };
        document.getElementById("smg-modal-save").onclick = function() {
            var val = document.getElementById("smg-input-proxy").value.trim();
            smgSetProxy(val);
            overlay.remove();
            alert("✅ 反代配置已保存！正在尝试重新加载流...");
            var vue = findVue();
            if (vue && vue.initPlayer) vue.initPlayer();
        };
    }

    // ===== 2. Patch webpack module 560 (E.a URL decryption bypass) =====
    var _module560Patched = false;
    function patchModule560() {
        if (_module560Patched) return;
        try {
            window.webpackJsonp.push([[], {
                '__smg_m560_probe': function(module, exports, __webpack_require__) {
                    try {
                        var mod560 = __webpack_require__(560);
                        if (mod560 && typeof mod560.a === 'function') {
                            var origEa = mod560.a;
                            mod560.a = function(t) {
                                if (typeof t === 'string' && t.indexOf('http') === 0) {
                                    console.log("[SMGTV] [Replay] E.a bypass — plain URL passthrough:", t.substring(0, 80));
                                    return t;
                                }
                                return origEa.apply(this, arguments);
                            };
                            _module560Patched = true;
                            console.log("[SMGTV] Module 560 (E.a) patched successfully");
                        }
                    } catch(e) {
                        console.warn("[SMGTV] Module 560 patch failed:", e.message);
                    }
                }
            }, ['__smg_m560_probe']]);
        } catch(e) {
            console.warn("[SMGTV] webpack chunk push failed:", e.message);
        }
    }
    patchModule560();

    // ===== 3. Intercept API responses & Stream requests =====
    var _smgEmergencySwitching = false;
    function smgTriggerEmergencyOverseasSwitch() {
        if (_smgEmergencySwitching) return;
        _smgEmergencySwitching = true;
        smgEnsureNoReferrerMeta();
        console.warn("[SMGTV] [Emergency Switch] Immediate fallback to Overseas Direct Stream for Five Star Sports!");

        _smgCurrentState.isOverseasMode = true;
        try { localStorage.setItem("smg_prefer_overseas", "true"); } catch(e) {}

        // Cut off domestic playback watchdog tick loop
        smgStopPlaybackWatchdog();

        smgUpdateStatus("geoblocked", "⚠️ 火山403阻断，已秒切【🌏 海外免梯直连源】", true);

        var vue = findVue();
        if (vue) {
            var chId = getCurChannelId(vue);
            if (chId === "10" && vue.initPlayer) {
                console.log("[SMGTV] [Emergency Switch] Re-initializing player with overseas stream...");
                vue.__smgPendingInit = null;
                setTimeout(function() {
                    _smgEmergencySwitching = false;
                    try { vue.initPlayer(); } catch(e) { console.error("[SMGTV] initPlayer error:", e); }
                }, 100);
                return;
            }
        }
        setTimeout(function() { _smgEmergencySwitching = false; }, 2000);
    }

    // Intercept window.fetch
    if (!origFetch) {
        origFetch = _win.fetch ? _win.fetch.bind(_win) : (typeof fetch !== "undefined" ? fetch : null);
    }
    var smgWrappedFetch = function(input, init) {
        var urlStr = typeof input === "string" ? input : (input && input.url) || "";

        // 3a. Proxy gsports.net.cn & smgtech.net via GM_xmlhttpRequest (clean Referer to avoid 403 ACL)
        if (urlStr.indexOf("gsports.net.cn") !== -1 || urlStr.indexOf("smgtech.net") !== -1) {
            return smgGmFetch(urlStr, init);
        }

        // 3b. Break 403 loop on volc-stream.kksmg.com
        if (urlStr.indexOf("volc-stream.kksmg.com") !== -1 && origFetch) {
            return origFetch.apply(this, arguments).then(function(resp) {
                if (resp && resp.status === 403) {
                    console.warn("[SMGTV] [Fetch Interceptor] Detected 403 Forbidden from volc-stream CDN!");
                    smgTriggerEmergencyOverseasSwitch();
                }
                return resp;
            });
        }

        // 3c. Normal Vue huikan data refresh hook
        if (urlStr.indexOf("/content/pc/tv/") !== -1 && origFetch) {
            return origFetch.apply(this, arguments).then(function(resp) {
                setTimeout(tryPatch, 50);
                return resp;
            });
        }

        return origFetch ? origFetch.apply(this, arguments) : Promise.reject(new Error("No fetch"));
    };

    if (_win) _win.fetch = smgWrappedFetch;
    if (typeof window !== "undefined" && window !== _win) {
        window.fetch = smgWrappedFetch;
    }

    // Intercept XMLHttpRequest
    var targetXHR = (_win && _win.XMLHttpRequest) || (typeof XMLHttpRequest !== "undefined" ? XMLHttpRequest : null);
    if (targetXHR && targetXHR.prototype) {
        var origOpen = targetXHR.prototype.open;
        var origSend = targetXHR.prototype.send;
        var origSetHeader = targetXHR.prototype.setRequestHeader;

        targetXHR.prototype.open = function(method, url) {
            var urlStr = String(url);
            this.__smgUrl = urlStr;
            this.__smgMethod = method;
            this.__smgHeaders = {};

            if (urlStr.indexOf("/content/pc/tv/") !== -1) {
                var selfXhr = this;
                selfXhr.addEventListener("readystatechange", function() {
                    if (selfXhr.readyState === 4 && selfXhr.status === 200) {
                        setTimeout(tryPatch, 30);
                    }
                });
            }
            return origOpen.apply(this, arguments);
        };

        targetXHR.prototype.setRequestHeader = function(header, value) {
            if (this.__smgHeaders) {
                this.__smgHeaders[header] = value;
            }
            return origSetHeader.apply(this, arguments);
        };

        targetXHR.prototype.send = function(data) {
            var urlStr = this.__smgUrl || "";
            // Intercept gsports requests if needed
            if (_gmXhr && (urlStr.indexOf("gsports.net.cn") !== -1 || urlStr.indexOf("smgtech.net") !== -1)) {
                var xhr = this;
                delete xhr.__smgHeaders["Referer"];
                delete xhr.__smgHeaders["referer"];
                delete xhr.__smgHeaders["Origin"];
                delete xhr.__smgHeaders["origin"];

                try {
                    _gmXhr({
                        method: xhr.__smgMethod || "GET",
                        url: urlStr,
                        headers: xhr.__smgHeaders,
                        data: data,
                        responseType: xhr.responseType || "arraybuffer",
                        timeout: 15000,
                        onload: function(res) {
                            try {
                                Object.defineProperty(xhr, "readyState", { value: 4, configurable: true });
                                Object.defineProperty(xhr, "status", { value: res.status, configurable: true });
                                Object.defineProperty(xhr, "statusText", { value: res.statusText || "OK", configurable: true });
                                Object.defineProperty(xhr, "response", { value: res.response, configurable: true });
                                if (typeof res.response === "string") {
                                    Object.defineProperty(xhr, "responseText", { value: res.response, configurable: true });
                                }
                            } catch(e) {}
                            xhr.dispatchEvent(new Event("readystatechange"));
                            xhr.dispatchEvent(new Event("load"));
                        },
                        onerror: function(err) {
                            xhr.dispatchEvent(new Event("error"));
                        },
                        ontimeout: function() {
                            xhr.dispatchEvent(new Event("timeout"));
                        }
                    });
                    return;
                } catch(e) {
                    console.warn("[SMGTV] XHR _gmXhr threw, falling back to origSend:", e);
                }
            }

            // Check volc-stream 403 on XHR
            if (urlStr.indexOf("volc-stream.kksmg.com") !== -1) {
                var volcXhr = this;
                volcXhr.addEventListener("readystatechange", function() {
                    if (volcXhr.readyState === 4 && volcXhr.status === 403) {
                        console.warn("[SMGTV] [XHR Interceptor] 403 Forbidden detected from volc-stream CDN!");
                        smgTriggerEmergencyOverseasSwitch();
                    }
                });
            }

            return origSend.apply(this, arguments);
        };
    }

    console.log("[SMGTV] API & Stream interceptors ready (GM CORS & 403 Loop Breaker active)");

    // ===== 4. Patch Vue component =====
    function findComponent(root, name) {
        if (!root) return null;
        if (root.$options && root.$options.name === name) return root;
        for (var i = 0; root.$children && i < root.$children.length; i++) {
            var found = findComponent(root.$children[i], name);
            if (found) return found;
        }
        return null;
    }

    function findVue() {
        var el = document.querySelector(".huikan");
        if (el && el.__vue__ && typeof el.__vue__.initPlayer === "function") {
            return el.__vue__;
        }

        var root = document.querySelector("#__nuxt");
        if (root && root.__vue__) {
            var comp = findComponent(root.__vue__, "HuikanIndex");
            if (comp && typeof comp.initPlayer === "function") {
                return comp;
            }
        }

        var all = document.querySelectorAll("[class*=huikan], [id*=huikan], .live-player, .video-wrap");
        for (var i = 0; i < all.length; i++) {
            var v = all[i].__vue__;
            if (v && typeof v.initPlayer === "function") {
                return v;
            }
        }

        var any = document.querySelectorAll("*");
        for (var j = 0; j < any.length && j < 500; j++) {
            var vw = any[j].__vue__;
            if (vw && vw.$options && vw.$options.name === "HuikanIndex") {
                return vw;
            }
        }

        return null;
    }

    // Helper: Determine currently targeted channel ID reliably
    function getCurChannelId(vue) {
        try {
            if (vue && vue.programObj && vue.programObj.channel_id != null) {
                return String(vue.programObj.channel_id);
            }
            var urlParams = new URLSearchParams(location.search);
            var qId = urlParams.get("id");
            if (qId) return String(qId);
            var pathMatch = location.pathname.match(/\/huikan\/(\d+)/);
            if (pathMatch) return String(pathMatch[1]);
            if (vue) {
                if (vue.currChannel && vue.currChannel.id != null) return String(vue.currChannel.id);
                if (vue.currChannelDetail && vue.currChannelDetail.id != null) return String(vue.currChannelDetail.id);
                if (vue.programDetail && vue.programDetail.channel_info && vue.programDetail.channel_info.id != null) {
                    return String(vue.programDetail.channel_info.id);
                }
            }
        } catch(e) {}
        return "10"; // Default: 10 (Five Star Sports)
    }

    // ===== 4b. Token bootstrap (Channel-Isolated) =====
    var SMG_PUBKEY = "-----BEGIN PUBLIC KEY-----\n" +
        "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDP5hzPUW5RFeE2xBT1ERB3hHZI\n" +
        "Votn/qatWhgc1eZof09qKjElFN6Nma461ZAwGpX4aezKP8Adh4WJj4u2O54xCXDt\n" +
        "wzKRqZO2oNZkuNmF2Va8kLgiEQAAcxYc8JgTN+uQQNpsep4n/o1sArTJooZIF17E\n" +
        "tSqSgXDcJ7yDj5rc7wIDAQAB\n" +
        "-----END PUBLIC KEY-----";
    var SMG_API_SECRET = "28c8edde3d61a0411511d3b1866f0636";
    var SMG_API_VERSION = "2.42.23";
    var SMG_DONOR_SCAN_DAYS = 7;
    // Dynamic donor pool: automatically cached and updated across sessions
    var _smgDynamicDonors = {};
    try {
        var _savedDonors = localStorage.getItem("smg_donor_cache_v2");
        if (_savedDonors) _smgDynamicDonors = JSON.parse(_savedDonors);
    } catch (e) {}
    // Map of channelId -> token object
    var _smgTokenCache = {};
    var _smgTokenRequests = {};

    function smgMd5(str) {
        function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
        function add(x, y) {
            var l = (x & 0xffff) + (y & 0xffff);
            var m = (x >> 16) + (y >> 16) + (l >> 16);
            return (m << 16) | (l & 0xffff);
        }
        function cmn(q, a, b, x, s, t) {
            a = add(add(a, q), add(x, t));
            return add(rl(a, s), b);
        }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
        function binl(s) {
            var b = [];
            var m = (1 << 8) - 1;
            for (var i = 0; i < s.length * 8; i += 8) b[i >> 5] |= (s.charCodeAt(i / 8) & m) << (i % 32);
            return b;
        }
        function binl2hex(b) {
            var h = "0123456789abcdef";
            var s = "";
            for (var i = 0; i < b.length * 4; i++) {
                s += h.charAt((b[i >> 2] >> ((i % 4) * 8 + 4)) & 0xf) + h.charAt((b[i >> 2] >> ((i % 4) * 8)) & 0xf);
            }
            return s;
        }
        str = unescape(encodeURIComponent(str));
        var x = binl(str);
        x[str.length >> 2] |= 0x80 << ((str.length % 4) << 3);
        x[(((str.length + 8) >> 6) << 4) + 14] = str.length * 8;
        var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (var i = 0; i < x.length; i += 16) {
            var oa = a, ob = b, oc = c, od = d;
            a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i+1], 12, -389564586);
            c = ff(c, d, a, b, x[i+2], 17, 606105819); b = ff(b, c, d, a, x[i+3], 22, -1044525330);
            a = ff(a, b, c, d, x[i+4], 7, -176418897); d = ff(d, a, b, c, x[i+5], 12, 1200080426);
            c = ff(c, d, a, b, x[i+6], 17, -1473231341); b = ff(b, c, d, a, x[i+7], 22, -45705983);
            a = ff(a, b, c, d, x[i+8], 7, 1770035416); d = ff(d, a, b, c, x[i+9], 12, -1958414417);
            c = ff(c, d, a, b, x[i+10], 17, -42063); b = ff(b, c, d, a, x[i+11], 22, -1990404162);
            a = ff(a, b, c, d, x[i+12], 7, 1804603682); d = ff(d, a, b, c, x[i+13], 12, -40341101);
            c = ff(c, d, a, b, x[i+14], 17, -1502002290); b = ff(b, c, d, a, x[i+15], 22, 1236535329);
            a = gg(a, b, c, d, x[i+1], 5, -165796510); d = gg(d, a, b, c, x[i+6], 9, -1069501632);
            c = gg(c, d, a, b, x[i+11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
            a = gg(a, b, c, d, x[i+5], 5, -701558691); d = gg(d, a, b, c, x[i+10], 9, 38016083);
            c = gg(c, d, a, b, x[i+15], 14, -660478335); b = gg(b, c, d, a, x[i+4], 20, -405537848);
            a = gg(a, b, c, d, x[i+9], 5, 568446438); d = gg(d, a, b, c, x[i+14], 9, -1019803690);
            c = gg(c, d, a, b, x[i+3], 14, -187363961); b = gg(b, c, d, a, x[i+8], 20, 1163531501);
            a = gg(a, b, c, d, x[i+13], 5, -1444681467); d = gg(d, a, b, c, x[i+2], 9, -51403784);
            c = gg(c, d, a, b, x[i+7], 14, 1735328473); b = gg(b, c, d, a, x[i+12], 20, -1926607734);
            a = hh(a, b, c, d, x[i+5], 4, -378558); d = hh(d, a, b, c, x[i+8], 11, -2022574463);
            c = hh(c, d, a, b, x[i+11], 16, 1839030562); b = hh(b, c, d, a, x[i+14], 23, -35309556);
            a = hh(a, b, c, d, x[i+1], 4, -1530992060); d = hh(d, a, b, c, x[i+4], 11, 1272893353);
            c = hh(c, d, a, b, x[i+7], 16, -155497632); b = hh(b, c, d, a, x[i+10], 23, -1094730640);
            a = hh(a, b, c, d, x[i+13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222);
            c = hh(c, d, a, b, x[i+3], 16, -722521979); b = hh(b, c, d, a, x[i+6], 23, 76029189);
            a = hh(a, b, c, d, x[i+9], 4, -640364487); d = hh(d, a, b, c, x[i+12], 11, -421815835);
            c = hh(c, d, a, b, x[i+15], 16, 530742520); b = hh(b, c, d, a, x[i+2], 23, -995338651);
            a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i+7], 10, 1126891415);
            c = ii(c, d, a, b, x[i+14], 15, -1416354905); b = ii(b, c, d, a, x[i+5], 21, -57434055);
            a = ii(a, b, c, d, x[i+12], 6, 1700485571); d = ii(d, a, b, c, x[i+3], 10, -1894986606);
            c = ii(c, d, a, b, x[i+10], 15, -1051523); b = ii(b, c, d, a, x[i+1], 21, -2054922799);
            a = ii(a, b, c, d, x[i+8], 6, 1873313359); d = ii(d, a, b, c, x[i+15], 10, -30611744);
            c = ii(c, d, a, b, x[i+6], 15, -1560198380); b = ii(b, c, d, a, x[i+13], 21, 1309151649);
            a = ii(a, b, c, d, x[i+4], 6, -145523070); d = ii(d, a, b, c, x[i+11], 10, -1120210379);
            c = ii(c, d, a, b, x[i+2], 15, 718787259); b = ii(b, c, d, a, x[i+9], 21, -343485551);
            a = add(a, oa); b = add(b, ob); c = add(c, oc); d = add(d, od);
        }
        return binl2hex([a, b, c, d]);
    }

    function smgRsaDecrypt(enc) {
        try {
            if (!enc || typeof enc !== "string") return "";
            if (typeof JSEncrypt === "undefined") return "";
            var hex = window.atob(enc).split("").map(function(ch) {
                return ("0" + ch.charCodeAt(0).toString(16)).slice(-2);
            }).join("").toUpperCase();
            if (!hex) return "";
            var crypt = new JSEncrypt();
            crypt.setPublicKey(SMG_PUBKEY);
            var out = "";
            for (var pos = 0; pos < hex.length;) {
                var chunk = hex.slice(pos, pos + 256);
                pos += 256;
                var bytes = (chunk.replace(/\r|\n/g, "").match(/[\da-fA-F]{2}/g) || [])
                    .map(function(h) { return parseInt(h, 16); });
                var b64 = window.btoa(String.fromCharCode.apply(String, bytes));
                if (!b64) continue;
                var m = crypt.decrypt(b64);
                if (m) out += m;
            }
            return out;
        } catch (e) {
            console.warn("[SMGTV] smgRsaDecrypt failed:", e && e.message);
            return "";
        }
    }

    function smgSignParams(params) {
        var n = {
            platform: "pc",
            version: SMG_API_VERSION,
            nonce: Math.random().toString(36).slice(-8),
            timestamp: Math.floor(Date.now() / 1000),
            "Api-Version": "v1"
        };
        var merged = {};
        var k;
        for (k in params) merged[k] = params[k];
        for (k in n) merged[k] = n[k];
        var keys = Object.keys(merged).sort();
        var s = "";
        for (var i = 0; i < keys.length; i++) {
            if (merged[keys[i]] != null) s += keys[i] + "=" + merged[keys[i]] + "&";
        }
        merged.sign = smgMd5(smgMd5(s + SMG_API_SECRET));
        return merged;
    }

    function smgApiGet(path, params) {
        var signed = smgSignParams(params || {});
        var q = Object.keys(params || {}).map(function(k) {
            return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
        }).join("&");
        var headers = { "Accept": "application/json, text/plain, */*" };
        var hk;
        for (hk in signed) headers[hk] = signed[hk];
        headers["M-Uuid"] = localStorage.getItem("uuid") || "";
        // Internal requests must not trigger our own Vue/initPlayer interceptor.
        return new Promise(function(resolve, reject) {
            var controller = typeof AbortController === "function" ? new AbortController() : null;
            var timer = setTimeout(function() {
                reject(new Error("API request timed out"));
                if (controller) controller.abort();
            }, 15000);
            var options = { headers: headers, cache: "no-store" };
            if (controller) options.signal = controller.signal;
            Promise.resolve().then(function() {
                return origFetch.call(window, "https://kapi.kankanews.com" + path + (q ? "?" + q : ""), options);
            }).then(function(resp) {
                if (!resp.ok) throw new Error("API HTTP " + resp.status);
                return resp.json();
            }).then(function(data) {
                clearTimeout(timer);
                resolve(data);
            }, function(error) {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    function smgTokenFromUrl(url) {
        try {
            var u = new URL(url);
            var token = u.searchParams.get("token");
            if (!token) return null;
            var match = u.pathname.match(/\/live\/([^/]+)\//);
            if (!match) return null;
            var encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            while (encoded.length % 4) encoded += "=";
            var payload = JSON.parse(atob(encoded));
            return {
                token: token,
                volcSecret: u.searchParams.get("volcSecret"),
                volcTime: u.searchParams.get("volcTime"),
                stream: match[1],
                exp: payload.exp || 0
            };
        } catch (e) {
            return null;
        }
    }

    var SMG_TOKEN_REFRESH_MARGIN = 120 * 1000;
    function smgTokenExpiresAt(t) {
        if (!t || !t.token || !t.volcSecret) return 0;
        var jwtExp = Number(t.exp);
        var cdnExp = Number(t.volcTime);
        if (!isFinite(jwtExp) || jwtExp <= 0 || !isFinite(cdnExp) || cdnExp <= 0) return 0;
        // The JWT can last 12 hours while the CDN signature lasts only 10 minutes.
        return Math.min(jwtExp, cdnExp) * 1000;
    }
    function smgTokenValid(t) {
        return smgTokenMsLeft(t) > SMG_TOKEN_REFRESH_MARGIN;
    }
    function smgTokenMsLeft(t) {
        var expiresAt = smgTokenExpiresAt(t);
        return expiresAt ? expiresAt - Date.now() : 0;
    }

    // Precise and relaxed donor finder: must belong to target channel, any reviewable program is valid!
    function smgFindDonorId(vue, chId) {
        var targetChId = String(chId || getCurChannelId(vue));
        try {
            var lists = [vue.programList, vue.currentProgramList, vue.playingProgramList];
            for (var i = 0; i < lists.length; i++) {
                var arr = lists[i];
                if (!Array.isArray(arr)) continue;
                for (var j = 0; j < arr.length; j++) {
                    var p = arr[j];
                    if (!p || !p.id || p.is_review !== 1) continue;

                    var pChId = p.channel_id != null ? String(p.channel_id) : null;
                    if (pChId && pChId !== targetChId) {
                        continue; // Strictly filter out other channels (no cross-channel contamination)
                    }

                    // Relaxed: ANY program belonging to target channel with is_review === 1 is a valid donor!
                    return p.id;
                }
            }
        } catch (e) {}

        // Check cached dynamic donors for this channel
        if (_smgDynamicDonors[targetChId] && _smgDynamicDonors[targetChId].length > 0) {
            return _smgDynamicDonors[targetChId][0];
        }

        // Harness / standalone playback fallback
        if (vue && vue.programObj && vue.programObj.id &&
            (String(vue.programObj.channel_id) === targetChId || vue.programObj.channel_id == null) &&
            (!vue.programList || vue.programList.length === 0)) {
            return vue.programObj.id;
        }

        return null;
    }

    function smgDateStr(offsetDays) {
        var d = new Date(Date.now() - offsetDays * 86400000);
        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
        var dd = ("0" + d.getDate()).slice(-2);
        return d.getFullYear() + "-" + mm + "-" + dd;
    }

    function smgEnsureToken(vue, cb, forceRefresh) {
        var curChId = getCurChannelId(vue);
        if (_smgTokenRequests[curChId]) {
            _smgTokenRequests[curChId].push(cb);
            return;
        }
        var cached = _smgTokenCache[curChId];
        if (!forceRefresh && smgTokenValid(cached)) {
            cb(cached);
            return;
        }
        _smgTokenRequests[curChId] = [cb];
        function finish(t) {
            var callbacks = _smgTokenRequests[curChId] || [];
            delete _smgTokenRequests[curChId];
            callbacks.forEach(function(callback) {
                try { callback(t); }
                catch (error) { console.error("[SMGTV] Token callback failed:", error && error.message); }
            });
        }

        var tried = {};
        var queue = [];
        function enqueue(id) {
            if (id && !tried[id] && queue.indexOf(id) === -1) queue.push(id);
        }

        var localDonor = smgFindDonorId(vue, curChId);
        if (localDonor) enqueue(localDonor);

        var cachedDonors = _smgDynamicDonors[curChId] || [];
        for (var d = 0; d < cachedDonors.length; d++) {
            enqueue(cachedDonors[d]);
        }

        console.log("[SMGTV] [Token] channel:", curChId, "donor queue:", queue.join(","));

        var scanOffset = 0;
        function scanDay(offset, done) {
            if (offset >= SMG_DONOR_SCAN_DAYS) {
                done();
                return;
            }
            var dateStr = smgDateStr(offset);
            console.log("[SMGTV] [Token] scanning programs for donor (ch " + curChId + "):", dateStr);
            smgApiGet("/content/pc/tv/programs", { channel_id: curChId, date: dateStr }).then(function(data) {
                var list = (data && data.result && data.result.programs) || [];
                var added = 0;
                var reviewable = [];
                for (var j = 0; j < list.length; j++) {
                    var p = list[j];
                    if (p && p.is_review === 1 && p.id &&
                        tried[p.id] === undefined && queue.indexOf(p.id) === -1) {
                        reviewable.push(p);
                    }
                }
                reviewable.sort(function(a, b) {
                    return (b.start_time || b.id) - (a.start_time || a.id);
                });
                for (var k = 0; k < reviewable.length; k++) {
                    queue.push(reviewable[k].id);
                    added++;
                }
                console.log("[SMGTV] [Token] scan " + dateStr + ": +" + added + " donors");
                done();
            }).catch(function(e) {
                console.warn("[SMGTV] [Token] scan failed for " + dateStr + ":", e && e.message);
                done();
            });
        }

        function tryNext() {
            if (!queue.length) {
                scanDay(scanOffset, function() {
                    scanOffset++;
                    if (!queue.length && scanOffset >= SMG_DONOR_SCAN_DAYS) {
                        console.error("[SMGTV] [Token] bootstrap failed: all donors empty for ch " + curChId);
                        finish(null);
                        return;
                    }
                    tryNext();
                });
                return;
            }
            var donorId = queue.shift();
            if (tried[donorId]) {
                tryNext();
                return;
            }
            tried[donorId] = true;
            console.log("[SMGTV] [Token] fetching donor program/detail:", donorId);
            smgApiGet("/content/pc/tv/program/detail", { channel_program_id: donorId }).then(function(data) {
                var res = (data && data.result) || {};
                var enc = res.channel_info && res.channel_info.shift_address;
                if (!enc && res.channel_info && res.channel_info.live_address) {
                    enc = res.channel_info.live_address;
                }
                if (!enc) {
                    console.warn("[SMGTV] [Token] donor empty, trying next (id=" + donorId + ")");
                    tryNext();
                    return;
                }
                var plain = smgRsaDecrypt(enc);
                if (!plain) throw new Error("donor decrypt failed (id=" + donorId + ")");
                var t = smgTokenFromUrl(plain);
                if (!t) throw new Error("donor URL parse failed (id=" + donorId + ")");
                if (!smgTokenValid(t)) throw new Error("donor URL expired or expires too soon (id=" + donorId + ")");

                // Store isolated by channel ID
                _smgTokenCache[curChId] = t;
                if (!_smgDynamicDonors[curChId]) _smgDynamicDonors[curChId] = [];
                var dList = _smgDynamicDonors[curChId];
                var existIdx = dList.indexOf(donorId);
                if (existIdx !== -1) dList.splice(existIdx, 1);
                dList.unshift(donorId);
                if (dList.length > 5) dList.length = 5;
                try {
                    localStorage.setItem("smg_donor_cache_v2", JSON.stringify(_smgDynamicDonors));
                } catch(e) {}
                console.log("[SMGTV] [Token] ready for ch " + curChId + " via donor " + donorId + ", stream=" + t.stream,
                    "expires=" + new Date(smgTokenExpiresAt(t)).toLocaleString());
                finish(t);
            }).catch(function(e) {
                console.warn("[SMGTV] [Token] donor error, trying next:", e && e.message);
                tryNext();
            });
        }
        tryNext();
    }

    function smgBuildShiftUrl(t, startTime) {
        if (!t) return null;
        var raw = "https://volc-stream.kksmg.com/live/" + t.stream +
            "/index.m3u8?token=" + t.token +
            "&volcSecret=" + t.volcSecret +
            "&volcTime=" + t.volcTime +
            "&startTime=" + startTime;
        return smgApplyProxy(raw);
    }

    function smgBuildLiveUrl(t) {
        if (!t) return null;
        var raw = "https://volc-stream.kksmg.com/live/" + t.stream +
            "/index.m3u8?token=" + t.token +
            "&volcSecret=" + t.volcSecret +
            "&volcTime=" + t.volcTime;
        return smgApplyProxy(raw);
    }

    // Renew the credentials used by this player, not merely the shared cache.
    var _smgWatchdogCleanup = null;
    
        function trigger403Fallback(chId) {
            if (!_smgCurrentState.isOverseasMode && chId === "10") {
                console.warn("[SMGTV] 403 Forbidden detected on volc CDN. Initiating auto-fallback to Overseas Direct Stream...");
                smgUpdateStatus("geoblocked", "⚠️ 火山403阻断，3秒后自动切海外免梯源...", true);
                setTimeout(function() {
                    if (!_smgCurrentState.isOverseasMode) {
                        smgToggleStreamMode();
                    }
                }, 2500);
            } else {
                smgUpdateStatus("geoblocked", "⚠️ 403 Forbidden (海外限制)", true);
            }
        }

    function smgStartPlaybackWatchdog(vue, player, switchSource) {
        smgStopPlaybackWatchdog();
        var channelId = getCurChannelId(vue);
        var activeToken = _smgTokenCache[channelId];
        var stopped = false;
        var refreshing = false;
        var needsRecovery = false;
        var errorGeneration = 0;
        var failures = 0;
        var retryAt = 0;
        var lastPosition = Number(player.currentTime) || 0;
        var lastProgressAt = Date.now();

        function isCurrent() {
            return !stopped && !vue._isDestroyed && vue.player === player &&
                getCurChannelId(vue) === channelId;
        }
        function failed(error) {
            if (!isCurrent()) return;
            refreshing = false;
            needsRecovery = true;
            failures++;
            retryAt = Date.now() + Math.min(120000, 15000 * Math.pow(2, Math.min(failures - 1, 3)));
            console.warn("[SMGTV] [Playback] renewal failed; retry in " +
                Math.round((retryAt - Date.now()) / 1000) + "s:", error && error.message);
        }
        function tick() {
            if (stopped) return;
            if (!isCurrent()) { cleanup(); return; }
            var isPlayingOverseasStream = _smgCurrentState.isOverseasMode && _smgCurrentState.activeUrl && _smgCurrentState.activeUrl.indexOf("cms-tvflow") !== -1;
            if (isPlayingOverseasStream && channelId === "10") {
                return;
            }
            var now = Date.now();
            var video = player.video;
            var position = Number(player.currentTime) || 0;
            if (position !== lastPosition || player.paused || (video && (video.seeking || video.ended))) {
                lastProgressAt = now;
            } else if (now - lastProgressAt >= 60000) {
                needsRecovery = true;
            }
            lastPosition = position;
            if (video && video.error && video.error.code !== 1) needsRecovery = true;
            if (refreshing || now < retryAt) return;
            if (!needsRecovery && smgTokenMsLeft(activeToken) > SMG_TOKEN_REFRESH_MARGIN) return;

            refreshing = true;
            var generation = errorGeneration;
            var resume = needsRecovery || !player.paused;
            console.log("[SMGTV] [Playback] renewing ch " + channelId +
                ", seconds left=" + Math.round(smgTokenMsLeft(activeToken) / 1000));
            smgEnsureToken(vue, function(t) {
                if (!isCurrent()) return;
                if (!t) { failed(new Error("no usable playback credentials")); return; }
                Promise.resolve().then(function() {
                    if (isCurrent()) return switchSource(t);
                }).then(function() {
                    if (!isCurrent()) return;
                    if (generation !== errorGeneration) {
                        failed(new Error("playback error during source switch"));
                        return;
                    }
                    activeToken = t;
                    refreshing = false;
                    needsRecovery = false;
                    failures = 0;
                    retryAt = Date.now() + 15000;
                    lastPosition = Number(player.currentTime) || 0;
                    lastProgressAt = Date.now();
                    // HLS switchURL can start playback itself; restore an intentional pause.
                    if (!resume) player.pause();
                    if (resume && player.paused) {
                        try {
                            Promise.resolve(player.play()).catch(function(error) {
                                console.warn("[SMGTV] [Playback] click play to resume:", error && error.message);
                            });
                        } catch (error) {
                            console.warn("[SMGTV] [Playback] play failed:", error && error.message);
                        }
                    }
                    console.log("[SMGTV] [Playback] renewed; expires=" +
                        new Date(smgTokenExpiresAt(t)).toLocaleString());
                }).catch(failed);
            }, true);
        }
        function onError(err) {
            if (!isCurrent()) return;
            console.warn("[SMGTV] [Playback Watchdog] Player error event fired:", err);
            errorGeneration++;
            needsRecovery = true;
            trigger403Fallback(channelId);
            tick();
        }
        function cleanup() {
            stopped = true;
            clearInterval(timer);
            if (typeof player.off === "function") player.off("error", onError);
            if (player.video) player.video.removeEventListener("error", onError);
        }
        var timer = setInterval(tick, 15000);
        if (typeof player.on === "function") player.on("error", onError);
        if (player.video) player.video.addEventListener("error", onError);
        _smgWatchdogCleanup = cleanup;
        console.log("[SMGTV] [Playback] watchdog started (15s tick)");
    }
    function smgStopPlaybackWatchdog() {
        if (_smgWatchdogCleanup) {
            _smgWatchdogCleanup();
            _smgWatchdogCleanup = null;
        }
    }

    function smgIsLiveProgram(pObj) {
        if (!pObj) return true;
        if (pObj.play === 0) return false;
        var nowSec = Math.floor(Date.now() / 1000);
        if (pObj.start_time && pObj.end_time) {
            return nowSec >= pObj.start_time && nowSec < pObj.end_time;
        }
        return true;
    }
    if (_win) _win.smgIsLiveProgram = smgIsLiveProgram;

    // ===== 4c. Replay: dynamic startTime + real source-switch seeking =====
    function patchInitPlayer(vue) {
        if (!vue || typeof vue.initPlayer !== "function") return;
        if (vue.__smgInitPlayerPatched) return;

        var origInitPlayer = vue.initPlayer;
        if (typeof vue.destroyPlayer === "function" && !vue.__smgDestroyPlayerPatched) {
            var origDestroy = vue.destroyPlayer;
            vue.destroyPlayer = function() {
                if (window._smgHlsInstance) {
                    try {
                        window._smgHlsInstance.destroy();
                        console.log("[SMGTV] Cleaned up Hls.js instance on destroyPlayer");
                    } catch(e) {}
                    window._smgHlsInstance = null;
                }
                return origDestroy.apply(this, arguments);
            };
            vue.__smgDestroyPlayerPatched = true;
        }

        vue.initPlayer = function() {
            try {
                var pObj = vue.programObj;
                if (pObj && pObj.start_time) {
                    var channelId = getCurChannelId(vue);
                    var requestKey = channelId + ":" + pObj.id + ":" + pObj.play;
                    if (vue.__smgPendingInit === requestKey) return;
                    vue.__smgPendingInit = requestKey;
                    var generation = (vue.__smgInitGeneration || 0) + 1;
                    vue.__smgInitGeneration = generation;
                    var self = this;
                    var args = arguments;
                    var isLiveEdge = smgIsLiveProgram(pObj);
                    var wantStart = isLiveEdge ? 0 : pObj.start_time;

                    // Overseas Direct Stream branch for Five Star Sports (LIVE)
                    if (_smgCurrentState.isOverseasMode && channelId === "10" && isLiveEdge) {
                        console.log("[SMGTV] Overseas Mode Active: Fetching SMG Tech direct stream & Hls.js...");
                        _smgCurrentState.status = "fetching";
                        _smgCurrentState.text = "正在拉取海外免梯流...";
                        smgRenderFloatingPanel();

                        Promise.all([
                            smgFetchOverseasStream(),
                            smgEnsureHlsJs()
                        ]).then(function(results) {
                            var overseasUrl = results[0];
                            var HlsClass = results[1] || (typeof Hls !== "undefined" ? Hls : (_win && _win.Hls));

                            if (vue.__smgInitGeneration !== generation) return;
                            vue.__smgPendingInit = null;
                            _smgCurrentState.activeUrl = overseasUrl;
                            _smgCurrentState.status = "playing";
                            _smgCurrentState.text = "🌏 海外免梯直连中";
                            _smgCurrentState.showCard = false;
                            smgRenderFloatingPanel();

                            pObj.is_shield = 0;
                            pObj.is_review = 1;
                            vue.isCopyright = true;
                            smgStopPlaybackWatchdog();

                            // 1. 彻底销毁旧的播放器与旧的 Hls 实例
                            if (window._smgHlsInstance) {
                                try { window._smgHlsInstance.destroy(); } catch(e) {}
                                window._smgHlsInstance = null;
                            }
                            if (typeof vue.destroyPlayer === "function") {
                                try { vue.destroyPlayer(); } catch(e) {}
                            }

                            // 2. 获取播放器容器
                            var container = vue.$refs.livePlayer || document.querySelector("#player") || document.querySelector(".live-player");
                            if (!container) {
                                console.error("[SMGTV] Player container not found!");
                                return;
                            }

                            // 3. 准备原生 <video> 元素
                            var videoEl = container.querySelector("video");
                            if (!videoEl) {
                                container.innerHTML = "";
                                videoEl = document.createElement("video");
                                container.appendChild(videoEl);
                            }
                            videoEl.setAttribute("playsinline", "");
                            videoEl.setAttribute("webkit-playsinline", "");
                            videoEl.setAttribute("x5-playsinline", "");
                            videoEl.setAttribute("controls", "true");
                            videoEl.setAttribute("autoplay", "true");
                            videoEl.style.cssText = "width:100%!important;height:100%!important;display:block!important;visibility:visible!important;opacity:1!important;position:relative!important;z-index:20!important;background:#000!important;object-fit:contain!important;";

                            // 4. 音量与静音继承
                            var volume = localStorage.getItem("playerVolume");
                            volume = volume ? Number(volume) : 0.5;
                            videoEl.volume = volume;
                            videoEl.muted = !!vue.isMuted;
                            videoEl.onvolumechange = function() {
                                localStorage.setItem("playerVolume", String(videoEl.volume));
                                vue.isMuted = videoEl.muted;
                            };

                            // 5. 点击视频播放/暂停交互
                            videoEl.onclick = function(e) {
                                e.stopPropagation();
                                if (videoEl.paused) videoEl.play();
                                else videoEl.pause();
                            };

                            // 6. 现代 Hls.js 接管 TS 流解码并灌入 MSE
                            if (HlsClass && HlsClass.isSupported && HlsClass.isSupported()) {
                                var hls = new HlsClass({
                                    enableWorker: true,
                                    lowLatencyMode: false,
                                    backBufferLength: 60,
                                    maxBufferLength: 30,
                                    maxMaxBufferLength: 60,
                                    manifestLoadingTimeOut: 10000,
                                    manifestLoadingMaxRetry: 4,
                                    levelLoadingTimeOut: 10000,
                                    levelLoadingMaxRetry: 4,
                                    fragLoadingTimeOut: 15000,
                                    fragLoadingMaxRetry: 5,
                                    enableSoftwareAES: true
                                });
                                hls.attachMedia(videoEl);
                                hls.on(HlsClass.Events.MEDIA_ATTACHED, function() {
                                    console.log("[SMGTV] [HLS.js] Media attached, loading overseasUrl:", overseasUrl);
                                    hls.loadSource(overseasUrl);
                                });
                                hls.on(HlsClass.Events.MANIFEST_PARSED, function() {
                                    console.log("[SMGTV] [HLS.js] Manifest parsed, initiating video playback...");
                                    videoEl.play().catch(function(e) {
                                        console.warn("[SMGTV] [HLS.js] Autoplay prevented, waiting for user click:", e);
                                    });
                                });
                                hls.on(HlsClass.Events.ERROR, function(evt, data) {
                                    console.warn("[SMGTV] [HLS.js] Error:", data.type, data.details, data.fatal);
                                    if (data.fatal) {
                                        switch (data.type) {
                                            case HlsClass.ErrorTypes.NETWORK_ERROR:
                                                console.log("[SMGTV] [HLS.js] Recovering from network error...");
                                                hls.startLoad();
                                                break;
                                            case HlsClass.ErrorTypes.MEDIA_ERROR:
                                                console.log("[SMGTV] [HLS.js] Recovering from media error...");
                                                hls.recoverMediaError();
                                                break;
                                            default:
                                                console.error("[SMGTV] [HLS.js] Fatal unrecoverable error, destroying:", data);
                                                hls.destroy();
                                                break;
                                        }
                                    }
                                });
                                window._smgHlsInstance = hls;
                            } else {
                                // Safari 原生 HLS 回退
                                videoEl.src = overseasUrl;
                                videoEl.play().catch(function() {});
                            }

                            // 7. 挂载虚拟兼容代理对象至 vue.player 保持 Vue 体系协同
                            vue.player = {
                                video: videoEl,
                                get paused() { return videoEl.paused; },
                                get muted() { return videoEl.muted; },
                                set muted(v) { videoEl.muted = v; },
                                get volume() { return videoEl.volume; },
                                set volume(v) { videoEl.volume = v; },
                                play: function() { return videoEl.play(); },
                                pause: function() { return videoEl.pause(); },
                                destroy: function() {
                                    if (window._smgHlsInstance) {
                                        try { window._smgHlsInstance.destroy(); } catch(e) {}
                                        window._smgHlsInstance = null;
                                    }
                                    videoEl.pause();
                                    videoEl.removeAttribute("src");
                                    videoEl.load();
                                },
                                on: function(ev, fn) { videoEl.addEventListener(ev, fn); },
                                off: function(ev, fn) { videoEl.removeEventListener(ev, fn); }
                            };
                            window._smgLastPlayer = vue.player;

                            // 8. 彻底清理任何遮挡层
                            smgClearPlayerMasks();

                            console.log("[SMGTV] Overseas modern Hls.js player initialized successfully with full video/audio pipeline!");
                        }).catch(function(err) {
                            console.error("[SMGTV] Failed to setup overseas player, fallback to domestic:", err);
                            _smgCurrentState.isOverseasMode = false;
                            vue.__smgPendingInit = null;
                            smgRenderFloatingPanel();
                            if (vue.initPlayer) vue.initPlayer();
                        });
                        return;
                    }

                    smgEnsureToken(vue, function(t) {
                        if (vue.__smgInitGeneration !== generation) return;
                        vue.__smgPendingInit = null;
                        if (vue._isDestroyed || getCurChannelId(vue) !== channelId ||
                            !vue.programObj || String(vue.programObj.id) !== String(pObj.id) ||
                            (vue.programObj.play !== 0) !== isLiveEdge) return;
                        if (!t) {
                            console.error("[SMGTV] [Replay] no token, falling back to orig initPlayer");
                            return origInitPlayer.apply(self, args);
                        }
                        var shiftUrl = isLiveEdge ? smgBuildLiveUrl(t) : smgBuildShiftUrl(t, wantStart);
                        if (shiftUrl) {
                            pObj.is_shield = 0;
                            pObj.is_review = 1;
                            vue.isCopyright = true;
                            smgStopPlaybackWatchdog();
                            vue.destroyPlayer();

                            var volume = localStorage.getItem("playerVolume");
                            volume = volume ? Number(volume) : 0.5;

                            var programStartTime = isLiveEdge ? Math.floor(Date.now() / 1000) : pObj.start_time;
                            var programEndTime = pObj.end_time || (programStartTime + 7200);

                            vue.player = new vue.$xgplayer({
                                el: vue.$refs.livePlayer,
                                url: shiftUrl,
                                isLive: isLiveEdge,
                                fluid: true,
                                crossOrigin: true,
                                controls: true,
                                volume: volume,
                                playbackRate: [2, 1.5, 1.25, 1, 0.75, 0.5],
                                ignores: ["cssFullscreen"],
                                keyShortcut: true,
                                lang: "zh-cn",
                                closeVideoClick: true,
                                plugins: [vue.$hlsPlayer]
                            });
                            vue.player.muted = vue.isMuted;
                            var createdPlayer = vue.player;

                            function hookManifestLoader(player) {
                                var attempts = 0;
                                var hookTimer = setInterval(function() {
                                    if (vue.player !== player || vue._isDestroyed) {
                                        clearInterval(hookTimer);
                                        return;
                                    }
                                    attempts++;
                                    var hlsPlugin = player.plugins && player.plugins.hls;
                                    var hls = hlsPlugin && hlsPlugin.hls;
                                    if (!hls || !hls._manifestLoader) {
                                        if (attempts > 20) { clearInterval(hookTimer); }
                                        return;
                                    }
                                    clearInterval(hookTimer);

                                    var manifestLoader = hls._manifestLoader;
                                    var origMlLoad = manifestLoader.load.bind(manifestLoader);

                                    var _virtualPos = 0;
                                    var _virtualPosTs = Date.now();
                                    var _isSeeking = false;
                                    var _hasUserSeek = false;
                                    var _seekGeneration = 0;
                                    var _seekDebounceTimer = null;
                                    var _seekSwitchQueue = Promise.resolve();

                                    try {
                                        Object.defineProperty(player, "offsetCurrentTime", {
                                            get: function() { return _virtualPos; },
                                            set: function() {},
                                            configurable: true,
                                            enumerable: true
                                        });
                                    } catch (e) {
                                        console.warn("[SMGTV] [Replay] Could not lock offsetCurrentTime:", e);
                                    }

                                    function clampVirtualPos(pos) {
                                        pos = Number(pos);
                                        if (!isFinite(pos)) return 0;
                                        return Math.max(0, Math.min(
                                            programEndTime - programStartTime, pos));
                                    }

                                    function publishVirtualPos() {
                                        player.offsetCurrentTime = _virtualPos;
                                    }

                                    var positionTimer = setInterval(function() {
                                        if (vue.player !== player) { clearInterval(positionTimer); return; }
                                        if (!player.paused && !_isSeeking) {
                                            var now = Date.now();
                                            _virtualPos += (now - _virtualPosTs) / 1000;
                                            _virtualPosTs = now;
                                            _virtualPos = clampVirtualPos(_virtualPos);
                                            publishVirtualPos();
                                        } else {
                                            _virtualPosTs = Date.now();
                                        }
                                    }, 500);

                                    var syncTimer = setInterval(function() {
                                        if (vue.player !== player) { clearInterval(syncTimer); return; }
                                        if (!player.paused && !_isSeeking && !_hasUserSeek) {
                                            _virtualPos = clampVirtualPos(player.currentTime);
                                            _virtualPosTs = Date.now();
                                            publishVirtualPos();
                                        }
                                    }, 1000);
                                    publishVirtualPos();

                                    player.seek = function(time) {
                                        var target = clampVirtualPos(time);
                                        var seekTs = Math.floor(programStartTime + target);
                                        ++_seekGeneration;
                                        var wasPaused = player.paused;
                                        _hasUserSeek = true;
                                        _virtualPos = target;
                                        _virtualPosTs = Date.now();
                                        _isSeeking = true;
                                        publishVirtualPos();

                                        if (_seekDebounceTimer) {
                                            clearTimeout(_seekDebounceTimer);
                                        }

                                        console.log("[SMGTV] [Replay] Seek target → pos=" +
                                            target.toFixed(1) + "s", "seekTime=" + seekTs);

                                        _seekDebounceTimer = setTimeout(function() {
                                            var finalTarget = _virtualPos;
                                            var finalTs = Math.floor(programStartTime + finalTarget);
                                            var finalGeneration = _seekGeneration;
                                            var finalWasPaused = player.paused;

                                            _seekSwitchQueue = _seekSwitchQueue.catch(function() {}).then(function() {
                                                if (finalGeneration !== _seekGeneration || vue.player !== player) return;

                                                var activeChId = getCurChannelId(vue);
                                                var seekUrl = smgBuildShiftUrl(_smgTokenCache[activeChId], finalTs);
                                                if (!seekUrl || typeof player.switchURL !== "function") {
                                                    console.error("[SMGTV] [Replay] switchURL unavailable; seek cancelled");
                                                    _isSeeking = false;
                                                    return;
                                                }

                                                console.log("[SMGTV] [Replay] Switching source:",
                                                    "vPos=" + finalTarget.toFixed(1) + "s",
                                                    "seekTime=" + finalTs);

                                                var switchPromise;
                                                try {
                                                    switchPromise = player.switchURL(seekUrl, {
                                                        seamless: false,
                                                        currentTime: 0
                                                    });
                                                } catch (error) {
                                                    _isSeeking = false;
                                                    console.error("[SMGTV] [Replay] Seek source switch failed:", error);
                                                    return;
                                                }

                                                return Promise.resolve(switchPromise).then(function() {
                                                    if (finalGeneration !== _seekGeneration) return;
                                                    _isSeeking = false;
                                                    _virtualPosTs = Date.now();
                                                    publishVirtualPos();
                                                    if (finalWasPaused) player.pause();
                                                    else player.play();
                                                    console.log("[SMGTV] [Replay] Seek source switched:",
                                                        "vPos=" + _virtualPos.toFixed(1) + "s");
                                                }).catch(function(error) {
                                                    if (finalGeneration !== _seekGeneration) return;
                                                    _isSeeking = false;
                                                    console.error("[SMGTV] [Replay] Seek source switch failed:", error);
                                                });
                                            });
                                        }, 150);

                                        return undefined;
                                    };

                                    manifestLoader.load = function(url) {
                                        if (typeof url === "string" && url.indexOf("startTime=") !== -1) {
                                            var newStartTime = Math.floor(programStartTime + _virtualPos);
                                            var newUrl = url.replace(/startTime=\d+/, "startTime=" + newStartTime);
                                            if (newUrl !== url) {
                                                console.log("[SMGTV] [Replay] startTime→",
                                                    "vPos=" + _virtualPos.toFixed(1) + "s",
                                                    "→ ts=" + newStartTime);
                                            }
                                            return origMlLoad(newUrl);
                                        }
                                        return origMlLoad.apply(this, arguments);
                                    };

                                    console.log("[SMGTV] [Replay] Manifest loader hooked (virtual pos tracker)");
                                    var dur = programEndTime - programStartTime;
                                    Object.defineProperty(player.video, "duration", {
                                        get: function() { return dur; },
                                        configurable: true
                                    });
                                    player._duration = dur;

                                    // Share the seek queue so renewal cannot race a user seek.
                                    smgStartPlaybackWatchdog(vue, player, function(t) {
                                        _seekSwitchQueue = _seekSwitchQueue.catch(function() {}).then(function() {
                                            if (vue.player !== player) return;
                                            _hasUserSeek = true;
                                            _isSeeking = true;
                                            var url = smgBuildShiftUrl(t, Math.floor(programStartTime + _virtualPos));
                                            return Promise.resolve().then(function() {
                                                return player.switchURL(url, { seamless: false, currentTime: 0 });
                                            }).then(function() {
                                                _isSeeking = false;
                                                _virtualPosTs = Date.now();
                                                publishVirtualPos();
                                            }, function(error) {
                                                _isSeeking = false;
                                                throw error;
                                            });
                                        });
                                        return _seekSwitchQueue;
                                    });

                                    console.log("[SMGTV] [Replay] Program duration set:",
                                        dur + "s (" + (dur / 60).toFixed(1) + " min)");
                                }, 200);
                            }

                            if (!isLiveEdge) {
                                hookManifestLoader(vue.player);
                            } else {
                                smgStartPlaybackWatchdog(vue, createdPlayer, function(tok) {
                                    return createdPlayer.switchURL(smgBuildLiveUrl(tok), { seamless: false, currentTime: 0 });
                                });
                            }

                            vue.player.on("canplay", function() {
                                vue.isLoading = false;
                                if (!isLiveEdge) vue.player.video.dispatchEvent(new Event("loadedmetadata"));
                            });
                            vue.player.on("ended", function() {
                                if (vue.programObj.play === 0 && typeof vue.playNextProgram === "function") {
                                    vue.playNextProgram();
                                }
                            });
                            setTimeout(function() {
                                if (vue.player === createdPlayer) {
                                    Promise.resolve(createdPlayer.play()).catch(function() {});
                                }
                            }, 200);
                            vue.player.video.addEventListener("click", function() {
                                if (vue.player.paused) vue.player.play();
                                else vue.player.pause();
                            });

                            console.log("[SMGTV] [Player] Created for:", pObj.name,
                                "channel:", getCurChannelId(vue),
                                "startTime:", programStartTime,
                                "duration:", (programEndTime - programStartTime) + "s",
                                "url:", shiftUrl.substring(0, 80));
                            return;
                        }
                        console.warn("[SMGTV] [Replay] shift URL build failed, falling back to orig initPlayer");
                        return origInitPlayer.apply(self, args);
                    });
                    return;
                }
            } catch(e) {
                vue.__smgPendingInit = null;
                console.error("[SMGTV] [Replay] initPlayer intercept error:", e);
            }
            return origInitPlayer.apply(this, arguments);
        };
        vue.__smgInitPlayerPatched = true;
        console.log("[SMGTV] [Replay] initPlayer patched");
    }

    function tryPatch() {
        var vue = findVue();
        if (!vue) return false;

        console.log("[SMGTV] Vue component found, patching...");
        patchInitPlayer(vue);
        smgRenderFloatingPanel();

        function fixObj(o) {
            if (!o) return;
            o.is_shield = 0;
            o.is_review = 1;
            o.can_review = 1;
        }
        fixObj(vue.programObj);
        fixObj(vue.programDetail);
        fixObj(vue.playingProgramObj);
        if (Array.isArray(vue.programList)) vue.programList.forEach(fixObj);
        if (Array.isArray(vue.currentProgramList)) vue.currentProgramList.forEach(fixObj);

        if (vue.currChannelDetail) {
            vue.currChannelDetail.copyright_image = "";
        }
        if (vue.currChannel) {
            vue.currChannel.copyright_image = "";
        }

        if (vue.currChannelDetail && vue.currChannelDetail.live_address) {
            if (!vue.programDetail) vue.programDetail = {};
            if (!vue.programDetail.channel_info) vue.programDetail.channel_info = {};
            if (!vue.programDetail.channel_info.live_address) {
                vue.programDetail.channel_info.live_address = vue.currChannelDetail.live_address;
            }
        }

        vue.isCopyright = false;

        if (typeof vue.countdown === "number") vue.countdown = 99999999;
        vue.showOpenApp = false;
        vue.showFlag = false;
        if (typeof vue.startCountdown === "function") vue.startCountdown = function() {};
        if (vue.liveTimer) { clearTimeout(vue.liveTimer); vue.liveTimer = null; }

        if (typeof vue.pageVisibilityChange === "function") {
            document.removeEventListener("visibilitychange", vue.pageVisibilityChange);
            vue.pageVisibilityChange = function() {};
            document.addEventListener("visibilitychange", vue.pageVisibilityChange);
        }

        if (!vue.player && vue.programObj && vue.programObj.id) {
            console.log("[SMGTV] Calling initPlayer()...");
            try { vue.initPlayer(); } catch(e) { console.error("[SMGTV] initPlayer error:", e); }
        }

        vue.$forceUpdate();
        vue.__smgPatched = true;
        console.log("[SMGTV] Patch applied!");
        return true;
    }

    if (tryPatch()) {
        console.log("[SMGTV] Patched immediately");
    } else {
        console.log("[SMGTV] Waiting for component...");
        var observer = new MutationObserver(function() {
            if (tryPatch()) observer.disconnect();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        var count = 0;
        var timer = setInterval(function() {
            count++;
            if (tryPatch()) {
                clearInterval(timer);
                observer.disconnect();
                console.log("[SMGTV] Patched after " + count + " polls");
            } else if (count >= 120) {
                clearInterval(timer);
                observer.disconnect();
                console.warn("[SMGTV] Timeout after 60s — check Console [SMGTV] logs for diagnostics");
            }
        }, 500);
    }

    // ===== 5. SPA route change: re-patch when user switches channels =====
    var lastHref = location.href;
    setInterval(function() {
        smgClearPlayerMasks();

        if (location.href !== lastHref) {
            lastHref = location.href;
            console.log("[SMGTV] Route changed, re-patching in 2s...");
            setTimeout(tryPatch, 2000);
        }
    }, 1000);

})();

/*
MIT License

Copyright (c) 2026 roies

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
