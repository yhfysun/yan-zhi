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

    private TextToSpeech tts;
    private boolean engineReady = false;
    private boolean initFailed = false;
    /** init 进行中的暂存请求（首个 speak；后续 speak 在 init 期间到达也一并暂存） */
    private PendingSpeak initPending;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicInteger seq = new AtomicInteger(0);
    /** utteranceId → 等待完成回调的 call（speak 提交后保存，done/error/stop 时释放） */
    private final Map<String, PluginCall> active = new HashMap<>();

    @Override
    public void load() {
        // 挂载即预热：用户首次点读时引擎通常已就绪（init 约 100-400ms）
        Log.i(TAG, "plugin load: 预热引擎 init");
        ensureEngine(null);
    }

    /** 懒初始化引擎；call 非空时在其 onInit 后继续提交，否则只预热。 */
    private void ensureEngine(final PendingSpeak pending) {
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
        if (initFailed) {
            Log.w(TAG, "引擎此前已初始化失败，直接 fail-fast");
            if (pending != null) pending.call.reject("TTS_INIT_FAILED", "系统语音引擎初始化失败（此前已失败）");
            return;
        }
        final Context ctx = getContext();
        Log.i(TAG, "TextToSpeech 构造（异步 init，" + INIT_TIMEOUT_MS + "ms 超时闸）");
        tts = new TextToSpeech(ctx.getApplicationContext(), new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                Log.i(TAG, "onInit 回调: status=" + status);
                if (status == TextToSpeech.SUCCESS) {
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
                } else {
                    initFailed = true;
                    tts = null;
                    Log.w(TAG, "onInit 失败 status=" + status);
                    if (pending != null) {
                        pending.call.reject("TTS_INIT_FAILED", "系统语音引擎初始化失败（status=" + status + "）");
                    }
                    if (initPending != null) {
                        initPending.call.reject("TTS_INIT_FAILED", "系统语音引擎初始化失败（status=" + status + "）");
                        initPending = null;
                    }
                }
            }
        });
        // ★★ 超时闸：onInit 永不回调（设备无 TTS 引擎）时 fail-fast，绝不挂死调用方
        main.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (engineReady || initFailed) return; // 已就绪/已失败：闸作废
                initFailed = true;
                try { tts.shutdown(); } catch (Exception e) { /* ignore */ }
                tts = null;
                Log.w(TAG, "init 超时（" + INIT_TIMEOUT_MS + "ms 内 onInit 未回调）⇒ 设备无可用 TTS 引擎");
                if (pending != null) {
                    pending.call.reject("TTS_INIT_TIMEOUT", "设备没有可用的系统语音引擎（请在系统设置→文字转语音 安装/启用）");
                }
                if (initPending != null) {
                    initPending.call.reject("TTS_INIT_TIMEOUT", "设备没有可用的系统语音引擎（请在系统设置→文字转语音 安装/启用）");
                    initPending = null;
                }
            }
        }, INIT_TIMEOUT_MS);
    }

    private void finish(String utteranceId, boolean ok) {
        PluginCall call = active.remove(utteranceId);
        if (call == null) return; // 非 JS 提交的 utterance：忽略
        JSObject out = new JSObject();
        out.put("ok", ok);
        if (!ok) out.put("reason", "系统语音合成失败或被中断");
        call.resolve(out);
    }

    @PluginMethod
    public void speak(final PluginCall call) {
        final String text = call.getString("text", "");
        final String lang = call.getString("lang", "en-US");
        if (text == null || text.trim().isEmpty()) {
            call.reject("EMPTY_TEXT", "朗读内容为空");
            return;
        }
        ensureEngine(new PendingSpeak(call, text, lang));
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
            // 引擎不带目标语言：如实返回，JS 侧回落系统 speechSynthesis 或提示
            Log.w(TAG, "setLanguage 不支持: lang=" + pending.lang + " set=" + set + "（引擎缺该语言语音包）");
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
            active.put(id, pending.call);
        } else {
            Log.w(TAG, "speak 提交失败 code=" + r);
            pending.call.reject("TTS_SUBMIT_FAILED", "朗读提交失败（code=" + r + "）");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        for (PluginCall c : active.values()) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", "STOPPED");
            c.resolve(out);
        }
        active.clear();
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
