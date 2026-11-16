package com.yanzhi.mobile.tts;

import android.content.Context;
import android.content.res.AssetManager;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.util.Log;

import com.k2fsa.sherpa.onnx.GeneratedAudio;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;

import java.util.concurrent.atomic.AtomicBoolean;

/**
 * APK 内置离线语音合成（sherpa-onnx 1.10.35 + piper en_US-amy-medium int8，~32MB assets）。
 *
 * ★ 为什么需要（2026-11-16 用户拍板「没有 TTS 引擎可以打包自带一个？？可以」）：
 *   部分国产 ROM（一加/ColorOS 实锤 tts_default_synth=null）**整机没有任何 TTS 引擎**，
 *   系统 TextToSpeech onInit 永不回调（超时闸 fail-fast）。内置引擎 = 不依赖设备
 *   不依赖云，所有安卓机统一出声；音色一般但「能发音就行」（用户原话）。
 *
 * ★ 只带英语模型（学习模式朗读主体是英语）：lang 非 en 时由调用方（TtsPlugin）
 *   走原有降级链。模型文件随 APK 打包在 assets/sherpa-en/（apply-native-sherpa.cjs
 *   从 native/android-sherpa/ 真相源铺设；二进制由 scripts/fetch-sherpa.cjs 下载）。
 *
 * ★ 用法：懒初始化（首次 speak ~2-5s 加载模型）；generate 在后台线程跑，AudioTrack
 *   播完 resolve；stop() 打断播放（generate 同步阻塞，停止在句间生效）。
 */
final class SherpaTts {
    private static final String TAG = "YZTTS";
    private static final String ASSET_DIR = "sherpa-en";
    private static final String MODEL_NAME = "en_US-amy-medium.onnx";

    private static volatile boolean initFailed = false;
    private static OfflineTts tts;
    private static AudioTrack track;
    /** 当前播放会话：stop() 换代 ⇒ 旧播放写完即弃、回调不再触发 */
    private static final AtomicBoolean playAbort = new AtomicBoolean(false);

    private SherpaTts() {
    }

    /** 模型资源是否随包可用（assets 里能直接读到 model 文件头）。 */
    static boolean isAvailable(Context ctx) {
        if (initFailed) return false;
        if (tts != null) return true;
        try (java.io.InputStream in = ctx.getAssets().open(ASSET_DIR + "/" + MODEL_NAME)) {
            byte[] head = new byte[2];
            int n = in.read(head);
            return n == 2 && head[0] != 0; // 占位读：文件存在即可
        } catch (Exception e) {
            Log.i(TAG, "sherpa 内置模型不可用: " + e.getMessage());
            return false;
        }
    }

    /** 懒初始化引擎（阻塞 2-5s，须在后台线程调用）。失败置 initFailed 永久短路。
     *  ★ 模型必须先从 assets 拷到 filesDir 再按**真实文件路径**加载：espeak-ng-data
     *    目录内部用标准文件 IO（fopen/opendir），AAssetManager 无法枚举/打开目录 ⇒
     *    直接 newFromAsset(assets) 会在 espeak 初始化时静默失败（2026-11-16 实锤）。 */
    private static synchronized boolean ensure(Context ctx) {
        if (tts != null) return true;
        if (initFailed) return false;
        try {
            java.io.File dir = new java.io.File(ctx.getFilesDir(), ASSET_DIR);
            java.io.File model = new java.io.File(dir, MODEL_NAME);
            java.io.File phontab = new java.io.File(dir, "espeak-ng-data/phontab");
            if (!model.exists() || model.length() <= 1024 * 1024 || !phontab.exists()) {
                Log.i(TAG, "sherpa 模型拷贝 assets → filesDir（首次 ~35MB）...");
                long t0 = System.currentTimeMillis();
                copyAssets(ctx, ASSET_DIR, dir);
                Log.i(TAG, "sherpa 模型拷贝完成: " + (System.currentTimeMillis() - t0) + "ms");
            }
            Log.i(TAG, "sherpa 内置引擎初始化（首次 2-5s）...");
            long t0 = System.currentTimeMillis();
            OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig(
                    model.getAbsolutePath(), "",
                    new java.io.File(dir, "tokens.txt").getAbsolutePath(),
                    new java.io.File(dir, "espeak-ng-data").getAbsolutePath(), "",
                    0.667f, 0.8f, 1.0f);
            OfflineTtsModelConfig mc = new OfflineTtsModelConfig(vits, 2, false, "cpu");
            OfflineTtsConfig config = new OfflineTtsConfig(mc, "", "", 1);
            tts = new OfflineTts(null, config); // null AssetManager ⇒ 走 newFromFile（真实路径）
            int sampleRate = tts.sampleRate();
            if (sampleRate <= 0) throw new IllegalStateException("invalid sample rate: " + sampleRate);
            Log.i(TAG, "sherpa 内置引擎就绪: " + (System.currentTimeMillis() - t0) + "ms, sr=" + sampleRate);
            return true;
        } catch (Throwable e) {
            initFailed = true;
            Log.w(TAG, "sherpa 内置引擎初始化失败: " + e);
            return false;
        }
    }

    /** 递归拷 assets 子目录到真实文件系统（espeak-ng-data 数百个小文件）。 */
    private static void copyAssets(Context ctx, String assetPath, java.io.File dest) throws Exception {
        AssetManager am = ctx.getAssets();
        String[] names = am.list(assetPath);
        if (names == null || names.length == 0) {
            // 文件：直接拷
            java.io.File out = new java.io.File(dest.getAbsolutePath());
            java.io.File parent = out.getParentFile();
            if (parent != null) parent.mkdirs();
            try (java.io.InputStream in = am.open(assetPath);
                 java.io.OutputStream out2 = new java.io.FileOutputStream(out)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) out2.write(buf, 0, n);
            }
            return;
        }
        dest.mkdirs();
        for (String name : names) {
            copyAssets(ctx, assetPath + "/" + name, new java.io.File(dest, name));
        }
    }

    /**
     * 合成并阻塞播放（后台线程调用）。完成/被 stop 打断后返回：
     * ok=true 播完；ok=false 打断或失败。
     */
    static SpeakResult speak(Context ctx, String text, float speed) {
        if (!ensure(ctx)) return new SpeakResult(false, "BUNDLED_INIT_FAILED");
        try {
            playAbort.set(false);
            long t0 = System.currentTimeMillis();
            Log.i(TAG, "sherpa 合成开始: len=" + text.length());
            GeneratedAudio audio = tts.generate(text, 0, speed);
            if (audio == null || audio.getSamples().length == 0) {
                return new SpeakResult(false, "BUNDLED_GENERATE_EMPTY");
            }
            Log.i(TAG, "sherpa 合成完成: " + (System.currentTimeMillis() - t0) + "ms, "
                    + audio.getSamples().length + " samples @ " + audio.getSampleRate());
            boolean played = play(audio.getSamples(), audio.getSampleRate());
            if (playAbort.get()) return new SpeakResult(false, "STOPPED");
            return new SpeakResult(played, played ? null : "BUNDLED_PLAY_FAILED");
        } catch (Throwable e) {
            Log.w(TAG, "sherpa 合成/播放失败: " + e);
            return new SpeakResult(false, "BUNDLED_ERROR");
        }
    }

    /** AudioTrack PCM 播放（float → 16bit PCM byte[]，兼容所有 compileSdk），写完/打断返回。 */
    private static boolean play(float[] samples, int sampleRate) {
        if (sampleRate <= 0) return false;
        // float [-1,1] → 16bit PCM 小端
        byte[] pcm = new byte[samples.length * 2];
        for (int i = 0; i < samples.length; i++) {
            float s = Math.max(-1f, Math.min(1f, samples[i]));
            short v = (short) (s * 32767f);
            pcm[i * 2] = (byte) (v & 0xff);
            pcm[i * 2 + 1] = (byte) ((v >> 8) & 0xff);
        }
        int minBuf = AudioTrack.getMinBufferSize(sampleRate,
                AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minBuf <= 0) return false;
        track = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build())
                .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(sampleRate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build())
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(Math.max(minBuf, pcm.length))
                .build();
        if (track.getState() != AudioTrack.STATE_INITIALIZED) {
            try { track.release(); } catch (Exception e) { /* ignore */ }
            track = null;
            return false;
        }
        int written = track.write(pcm, 0, pcm.length);
        if (written <= 0) return false;
        track.play();
        if (track.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) return false;
        // MODE_STATIC 静音期轮询：播完 / 被打断
        long total = (long) (samples.length * 1000L / sampleRate);
        long waited = 0;
        try {
            while (waited < total + 500) {
                if (playAbort.get()) return false;
                Thread.sleep(80);
                waited += 80;
                if (track.getPlayState() == AudioTrack.PLAYSTATE_PAUSED) break;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        } finally {
            try { track.stop(); } catch (Exception e) { /* ignore */ }
            try { track.release(); } catch (Exception e) { /* ignore */ }
            track = null;
        }
        return true;
    }

    /** 打断当前播放（generate 阻塞期间无法中断，停止在句间生效）。 */
    static void stop() {
        playAbort.set(true);
        AudioTrack t = track;
        if (t != null) {
            try { t.pause(); } catch (Exception e) { /* ignore */ }
            try { t.flush(); } catch (Exception e) { /* ignore */ }
        }
    }

    static final class SpeakResult {
        final boolean ok;
        final String reason;

        SpeakResult(boolean ok, String reason) {
            this.ok = ok;
            this.reason = reason;
        }
    }
}
