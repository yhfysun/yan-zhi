package com.yanzhi.mobile.tts;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 系统语音合成插件（Android TextToSpeech）。
 *
 * ★ 为什么需要（2026-11-15 用户实报「手机上喇叭没用/语音不行」）：
 *   Android WebView 的 speechSynthesis 依赖 WebView 实现 + ROM 语音包 —— 实测
 *   国产 ROM 上要么 voices 为空、要么只有中文 voice，英语朗读静默无声。
 *   系统级 TextToSpeech API 所有 ROM 都带（小爱/讯飞/Google TTS 均支持中英文），
 *   由原生层调用最可靠。
 *
 * ★ 协议：
 *   - speak({text, lang}) → { ok, reason? }；ok=true 时经 done 事件回传完成
 *     （{ id, ok }），JS 侧据此 resolve 等待中的朗读 Promise（口语陪练的
 *     「说完接着录音」依赖完成回调）；
 *   - stop()：打断当前朗读（active call 一并 resolve(false)）；
 *   - 引擎不带目标语言时 resolve({ok:false, reason:'LANG_NOT_SUPPORTED'})，
 *     JS 侧回落 speechSynthesis 或提示。
 *
 * ★ 初始化：TextToSpeech 构造即异步 init —— 首个 speak 调用挂起，onInit 成功后
 *   继续提交（避免「首次点击无声」）；init 失败 reject（TTS_INIT_FAILED）。
 *
 * ★★ init 超时闸（2026-11-16 真机实锤「还是没声音」）：部分 ROM（ColorOS 常见）
 *   没有预装/启用任何 TTS 引擎 ⇒ TextToSpeech 构造后 **onInit 永远不回调** ⇒
 *   pending.call 永远挂起 ⇒ 前端 await 卡死、降级链永远走不到（用户视角：
 *   无声且状态卡住）。init 后起 4s 定时，到点仍未就绪 ⇒ 如实 fail-fast
 *   （ENGINE_INIT_TIMEOUT），让前端回落并提示用户去系统设置装/启用语音引擎。
 *   ★ 全链路 Log 埋点（TAG=YZTTS）：此前一行日志都没有，LANG_NOT_SUPPORTED /
 *     init 挂起在 logcat 里完全不可见，排障全靠猜。
 */
@CapacitorPlugin(name = "YzTts")
public class TtsPlugin extends Plugin {

    private static final String TAG = "YZTTS";
    /** 引擎初始化超时：onInit 超过这个时间不回调 = 设备没有可用 TTS 引擎 */
    private static final long INIT_TIMEOUT_MS = 4000;
    /** 系统引擎接受 speak 后仍可能永不回调 onDone；按文本长度给单句超时并转内置引擎。 */
    private static final long SPEAK_TIMEOUT_BASE_MS = 8000L;
    private static final long SPEAK_TIMEOUT_PER_CHAR_MS = 180L;
    private static final long SPEAK_TIMEOUT_MAX_MS = 90000L;

    private TextToSpeech tts;
    private boolean engineReady = false;
    private boolean initFailed = false;
    /** init 进行中的暂存请求（首个 speak；后续 speak 在 init 期间到达也一并暂存） */
    private PendingSpeak initPending;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicInteger seq = new AtomicInteger(0);
    /** utteranceId → 等待完成回调的请求（speak 提交后保存，done/error/stop 时释放） */
    private final Map<String, PendingSpeak> active = new HashMap<>();
    private final Map<String, Runnable> activeTimeouts = new HashMap<>();

    // ★★ 内置离线引擎兜底（2026-11-16 用户拍板「没有 TTS 引擎可以打包自带一个」）：
    //    一加等 ROM 整机无 TTS 引擎（tts_default_synth=null）⇒ 系统链路必死。
    //    sherpa-onnx + piper 英语模型随 APK 打包（SherpaTts），所有安卓机统一出声。
    //    只兜英语（学习模式朗读主体）；中文仍走系统链路/前端降级。

    /** 系统链路失败后转内置引擎（后台线程合成+播放，完成 resolve）。 */
    private void fallbackToBundled(final PendingSpeak pending, String why) {
        final Context ctx = getContext();
        Log.w(TAG, "系统链路不可用(" + why + ")，尝试内置离线引擎: lang=" + pending.lang);
        if (!pending.lang.toLowerCase(Locale.ROOT).startsWith("en")) {
            Log.w(TAG, "内置引擎仅带英语模型，中文不兜底");
            pending.call.reject("TTS_INIT_FAILED", "系统语音引擎不可用且内置引擎仅支持英语");
            return;
        }
        if (!SherpaTts.isAvailable(ctx)) {
            pending.call.reject("TTS_INIT_FAILED", "系统语音引擎不可用且未打包内置模型");
            return;
        }
        final String text = pending.text;
        new Thread(new Runnable() {
            @Override
            public void run() {
                SherpaTts.SpeakResult r = SherpaTts.speak(ctx, text, 1.0f);
                if (r.ok) {
                    Log.i(TAG, "内置引擎朗读完成");
                    JSObject out = new JSObject();
                    out.put("ok", true);
                    out.put("engine", "bundled");
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            pending.call.resolve(out);
                        }
                    });
                } else if ("STOPPED".equals(r.reason)) {
                    JSObject out = new JSObject();
                    out.put("ok", false);
                    out.put("reason", "STOPPED");
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            pending.call.resolve(out);
                        }
                    });
                } else {
                    Log.w(TAG, "内置引擎失败: " + r.reason);
                    main.post(new Runnable() {
                        @Override
                        public void run() {
                            pending.call.reject("BUNDLED_TTS_FAILED", "内置离线引擎朗读失败（" + r.reason + "）");
                        }
                    });
                }
            }
        }, "yz-sherpa-tts").start();
    }

    @Override
    public void load() {
        // 挂载即预热：用户首次点读时引擎通常已就绪（init 约 100-400ms）
        try {
            Log.i(TAG, "plugin load: 预热引擎 init");
            ensureEngine(null);
        } catch (Throwable error) {
            initFailed = true;
            Log.e(TAG, "plugin load 预热失败，保持 App 可启动", error);
            CrashLogger.record("TtsPlugin.load", error);
        }
    }

    /** 懒初始化引擎；call 非空时在其 onInit 后继续提交，否则只预热。 */
    private void ensureEngine(final PendingSpeak pending) {
        // ★★ initFailed 闸必须排在 tts != null 之前：部分 ROM（一加/ColorOS 实锤）
        //   在无任何 TTS 引擎时，TextToSpeech 构造函数内**同步**回调 onInit(ERROR) ——
        //   此刻 `tts = new TextToSpeech(...)` 的赋值尚未执行，失败分支的 `tts = null`
        //   置了个寂寞，构造返回后字段被「复活」成非空但永不就绪的死引擎 ⇒ 后续 speak
        //   全部走进排队分支且永不冲掉（2026-11-16 真机实锤「还是没声音」的根因）。
        //   initFailed 优先 ⇒ 必 fail-fast 转内置引擎。
        if (initFailed) {
            TextToSpeech dead = tts;
            tts = null;
            if (dead != null) {
                try { dead.shutdown(); } catch (Exception e) { /* ignore */ }
            }
            Log.w(TAG, "引擎此前已初始化失败，直接 fail-fast → 内置引擎兜底");
            if (pending != null) fallbackToBundled(pending, "TTS_INIT_FAILED(此前已失败)");
            return;
        }
        if (tts != null) {
            if (engineReady) {
                if (pending != null) submitSpeak(pending);
            } else if (pending != null) {
                // init 进行中：排队，onInit 后统一提交
                if (initPending == null) initPending = pending;
                Log.i(TAG, "init 进行中，请求排队: lang=" + pending.lang);
            }
            return;
        }
        final Context ctx = getContext();
        Log.i(TAG, "TextToSpeech 构造（异步 init，" + INIT_TIMEOUT_MS + "ms 超时闸）");
        try {
            tts = new TextToSpeech(ctx.getApplicationContext(), new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
                    if (initFailed) {
                        Log.w(TAG, "忽略迟到的 onInit 回调: status=" + status);
                        return;
                    }
                    Log.i(TAG, "onInit 回调: status=" + status);
                    if (status == TextToSpeech.SUCCESS && tts != null) {
                        engineReady = true;
                        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            @Override
                            public void onStart(String utteranceId) { /* 无需通知 */ }

                            @Override
                            public void onDone(String utteranceId) {
                                Log.d(TAG, "utterance done: " + utteranceId);
                                finish(utteranceId, true);
                            }

                            @Override
                            public void onError(String utteranceId) {
                                Log.w(TAG, "utterance error: " + utteranceId);
                                finish(utteranceId, false);
                            }
                        });
                        if (initPending != null) { submitSpeak(initPending); initPending = null; }
                        if (pending != null) submitSpeak(pending);
                        return;
                    }
                    initFailed = true;
                    engineReady = false;
                    TextToSpeech failed = tts;
                    tts = null;
                    if (failed != null) {
                        try { failed.shutdown(); } catch (Exception e) { /* ignore */ }
                    }
                    Log.w(TAG, "onInit 失败 status=" + status + " → 内置引擎兜底");
                    if (pending != null) fallbackToBundled(pending, "onInit status=" + status);
                    if (initPending != null) {
                        fallbackToBundled(initPending, "onInit status=" + status);
                        initPending = null;
                    }
                }
            });
        } catch (Throwable e) {
            initFailed = true;
            engineReady = false;
            tts = null;
            Log.w(TAG, "TextToSpeech 构造异常 → 内置引擎兜底: " + e);
            if (pending != null) fallbackToBundled(pending, "CONSTRUCT_ERROR");
            if (initPending != null) {
                fallbackToBundled(initPending, "CONSTRUCT_ERROR");
                initPending = null;
            }
            return;
        }
        // ★★ 超时闸：onInit 永不回调（设备无 TTS 引擎）时 fail-fast，绝不挂死调用方
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (engineReady || initFailed) return; // 已就绪/已失败：闸作废
                initFailed = true;
                engineReady = false;
                TextToSpeech timedOut = tts;
                tts = null;
                if (timedOut != null) {
                    try { timedOut.shutdown(); } catch (Exception e) { /* ignore */ }
                }
                Log.w(TAG, "init 超时（" + INIT_TIMEOUT_MS + "ms 内 onInit 未回调）⇒ 设备无可用 TTS 引擎 → 内置引擎兜底");
                if (pending != null) {
                    fallbackToBundled(pending, "TTS_INIT_TIMEOUT");
                }
                if (initPending != null) {
                    fallbackToBundled(initPending, "TTS_INIT_TIMEOUT");
                    initPending = null;
                }
            }
        }, INIT_TIMEOUT_MS);
    }

    private void finish(String utteranceId, boolean ok) {
        PendingSpeak pending = active.remove(utteranceId);
        Runnable timeout = activeTimeouts.remove(utteranceId);
        if (timeout != null) main.removeCallbacks(timeout);
        if (pending == null) return; // 非 JS 提交 / 已超时的 utterance：忽略
        if (!ok) {
            failSystemSpeak(pending, "UTTERANCE_ERROR");
            return;
        }
        JSObject out = new JSObject();
        out.put("ok", true);
        pending.call.resolve(out);
    }

    private boolean isEnglish(String lang) {
        return lang != null && lang.toLowerCase(Locale.ROOT).startsWith("en");
    }

    /** 系统链路已接收但失败/超时：英语转内置引擎，其他语言如实回落前端。 */
    private void failSystemSpeak(PendingSpeak pending, String why) {
        Log.w(TAG, "系统朗读失败(" + why + ") → " + (isEnglish(pending.lang) ? "内置引擎" : "前端降级"));
        if (isEnglish(pending.lang)) {
            fallbackToBundled(pending, why);
            return;
        }
        JSObject out = new JSObject();
        out.put("ok", false);
        out.put("reason", why);
        out.put("lang", pending.lang);
        pending.call.resolve(out);
    }

    private void onUtteranceTimeout(String utteranceId) {
        PendingSpeak pending = active.remove(utteranceId);
        activeTimeouts.remove(utteranceId);
        if (pending == null) return;
        Log.w(TAG, "系统朗读超时，未收到 onDone: " + utteranceId);
        if (tts != null) {
            try { tts.stop(); } catch (Exception e) { /* ignore */ }
        }
        failSystemSpeak(pending, "UTTERANCE_TIMEOUT");
    }

    @PluginMethod
    public void speak(final PluginCall call) {
        final String text = call.getString("text", "");
        final String lang = call.getString("lang", "en-US");
        if (text == null || text.trim().isEmpty()) {
            call.reject("EMPTY_TEXT", "朗读内容为空");
            return;
        }
        try {
            ensureEngine(new PendingSpeak(call, text, lang));
        } catch (Throwable error) {
            CrashLogger.record("TtsPlugin.speak", error);
            call.reject("TTS_INTERNAL_ERROR", String.valueOf(error));
        }
    }

    /** 引擎就绪后真正提交合成。 */
    private void submitSpeak(PendingSpeak pending) {
        Locale locale;
        try {
            locale = Locale.forLanguageTag(pending.lang);
        } catch (Exception e) {
            locale = Locale.US;
        }
        int set = tts.setLanguage(locale);
        if (set == TextToSpeech.LANG_MISSING_DATA || set == TextToSpeech.LANG_NOT_SUPPORTED) {
            // 引擎不带目标语言：英语转内置引擎兜底，其余如实回落
            Log.w(TAG, "setLanguage 不支持: lang=" + pending.lang + " set=" + set + "（引擎缺该语言语音包）");
            if (pending.lang.toLowerCase(Locale.ROOT).startsWith("en")) {
                fallbackToBundled(pending, "LANG_NOT_SUPPORTED");
                return;
            }
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", "LANG_NOT_SUPPORTED");
            out.put("lang", pending.lang);
            pending.call.resolve(out);
            return;
        }
        final String id = "yz-" + seq.incrementAndGet();
        int r = tts.speak(pending.text, TextToSpeech.QUEUE_FLUSH, null, id);
        Log.i(TAG, "speak 提交: id=" + id + " lang=" + pending.lang + " len=" + pending.text.length() + " code=" + r);
        if (r == TextToSpeech.SUCCESS) {
            active.put(id, pending);
            long timeoutMs = Math.min(
                SPEAK_TIMEOUT_MAX_MS,
                Math.max(SPEAK_TIMEOUT_BASE_MS, pending.text.length() * SPEAK_TIMEOUT_PER_CHAR_MS)
            );
            Runnable watchdog = new Runnable() {
                @Override
                public void run() {
                    onUtteranceTimeout(id);
                }
            };
            activeTimeouts.put(id, watchdog);
            main.postDelayed(watchdog, timeoutMs);
        } else {
            Log.w(TAG, "speak 提交失败 code=" + r + " → 内置引擎兜底");
            fallbackToBundled(pending, "SUBMIT_FAILED code=" + r);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        SherpaTts.stop(); // 内置引擎播放一并打断（原生 stop 必须同步停内置，见 SKILL 音频铁律）
        if (tts != null) tts.stop();
        for (PendingSpeak pending : active.values()) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", "STOPPED");
            pending.call.resolve(out);
        }
        active.clear();
        for (Runnable timeout : activeTimeouts.values()) main.removeCallbacks(timeout);
        activeTimeouts.clear();
        if (initPending != null) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", "STOPPED");
            initPending.call.resolve(out);
            initPending = null;
        }
        call.resolve();
    }

    /** 待提交的朗读请求（init 完成前的暂存）。 */
    private static final class PendingSpeak {
        final PluginCall call;
        final String text;
        final String lang;

        PendingSpeak(PluginCall call, String text, String lang) {
            this.call = call;
            this.text = text;
            this.lang = lang;
        }
    }
}
