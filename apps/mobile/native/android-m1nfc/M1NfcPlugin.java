package com.yanzhi.mobile.m1nfc;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.nfc.NfcAdapter;
import android.nfc.NfcManager;
import android.nfc.Tag;
import android.nfc.tech.MifareClassic;
import android.nfc.tech.NfcA;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.Locale;

/**
 * M1（MIFARE Classic）门禁卡读取插件 · Android。
 *
 * ★ 职责边界：原生只负责「拿 tag、认证扇区、读/写块」，不实现密钥恢复策略、
 *   不落盘、不上传、不缓存卡内容。密码本与逐扇区尝试、写入计划、逐块校验
 *   全部由 @yan-zhi/shared 的 m1 内核统一判定（模拟器与真机共用）。
 *
 * ★ 贴卡是异步的：点「开始」时卡还没贴上，插件必须挂起 waitForTag 调用，
 *   等 onTagDiscovered 真正拿到 tag 再 resolve；不能立刻回 NO_TAG 让前端报错退出。
 *
 * ★ 换卡：源卡读完 dump 后必须移开、贴上目标空白卡。waitForTag(requireNew=true)
 *   会丢弃当前连接并等下一次发现事件，readCard 再对新 tag 重新 connect。
 *   不换卡会把源卡内容写回源卡，既无意义也可能破坏原卡。
 *
 * ★ 机型兼容（high 风险）：MifareClassic 类是 Android 的可选实现，
 *   非 NXP NFC 芯片的机型 MifareClassic.get(tag) 会返回 null。
 *   此时 readCard 返回 mifareClassic=false，JS 侧必须降级到课程模拟器，
 *   绝不假装读到了卡。
 *
 * ★ 块 0：普通空白卡的卡号出厂后不可写。writeBlock 失败时如实返回 ok=false，
 *   不实现任何芯片私有后门指令；是否支持改写由目标卡与读卡器自行决定。
 */
@CapacitorPlugin(
    name = "M1Nfc",
    permissions = {
        @Permission(alias = "nfc", strings = { Manifest.permission.NFC })
    }
)
public class M1NfcPlugin extends Plugin implements NfcAdapter.ReaderCallback {

    private static final int FLAGS =
        NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;
    private static final int DEFAULT_TAG_TIMEOUT_MS = 60000;

    private NfcAdapter adapter;
    private Handler mainHandler;
    private Tag currentTag;
    private MifareClassic mifare;
    private boolean sessionActive = false;
    /** 挂起中的「等待贴卡」调用，onTagDiscovered 或超时回调负责收口 */
    private PluginCall pendingTagWait;
    private Runnable pendingTimeout;

    private static String toHex(byte[] bytes) {
        if (bytes == null) return "";
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format(Locale.US, "%02X", b & 0xff));
        return sb.toString();
    }

    private static byte[] parseKey(String value) {
        if (value == null || value.length() != 12) return null;
        byte[] key = new byte[6];
        try {
            for (int i = 0; i < 6; i++) {
                key[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
            }
            return key;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static byte[] parseData(String value) {
        if (value == null || value.length() != 32) return null;
        byte[] data = new byte[16];
        try {
            for (int i = 0; i < 16; i++) {
                data[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16);
            }
            return data;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private NfcAdapter nfcAdapter() {
        if (adapter == null) {
            NfcManager manager = (NfcManager) getContext().getSystemService(Context.NFC_SERVICE);
            if (manager != null) adapter = manager.getDefaultAdapter();
        }
        return adapter;
    }

    private Handler uiHandler() {
        if (mainHandler == null) mainHandler = new Handler(Looper.getMainLooper());
        return mainHandler;
    }

    private void cancelTimeout() {
        if (pendingTimeout != null) {
            uiHandler().removeCallbacks(pendingTimeout);
            pendingTimeout = null;
        }
    }

    /** 会话结束/重建时取消挂起调用，避免旧 Promise 永远不 resolve。 */
    private void cancelPendingWait() {
        cancelTimeout();
        PluginCall waiting = pendingTagWait;
        pendingTagWait = null;
        if (waiting != null) waiting.reject("SESSION_CLOSED", "NFC 会话已结束");
    }

    private void closeMifare() {
        if (mifare != null) {
            try { mifare.close(); } catch (Exception ignored) { /* 卡片已离开 */ }
            mifare = null;
        }
    }

    @PluginMethod
    public void getCapability(PluginCall call) {
        NfcAdapter nfc = nfcAdapter();
        JSObject out = new JSObject();
        out.put("nfcPresent", nfc != null);
        out.put("nfcEnabled", nfc != null && nfc.isEnabled());
        out.put("readerMode", nfc != null);
        // MIFARE Classic 是否可用必须拿到真实 tag 才能判定，见 readCard 的 mifareClassic 字段
        out.put("mifareClassicKnown", false);
        call.resolve(out);
    }

    @PluginMethod
    public void startSession(PluginCall call) {
        final NfcAdapter nfc = nfcAdapter();
        if (nfc == null) {
            call.reject("NO_NFC", "该设备没有 NFC 硬件");
            return;
        }
        if (!nfc.isEnabled()) {
            call.reject("NFC_DISABLED", "系统 NFC 开关未打开");
            return;
        }
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("NO_ACTIVITY", "无法取得前台 Activity");
            return;
        }
        cancelPendingWait();
        sessionActive = true;
        currentTag = null;
        closeMifare();
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                nfc.enableReaderMode(activity, M1NfcPlugin.this, FLAGS, new Bundle());
            }
        });
        JSObject out = new JSObject();
        out.put("active", true);
        call.resolve(out);
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        sessionActive = false;
        currentTag = null;
        cancelPendingWait();
        closeMifare();
        final NfcAdapter nfc = nfcAdapter();
        final Activity activity = getActivity();
        if (nfc != null && activity != null) {
            activity.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    nfc.disableReaderMode(activity);
                }
            });
        }
        JSObject out = new JSObject();
        out.put("active", false);
        call.resolve(out);
    }

    /**
     * 挂起等待贴卡。requireNew=true 用于「换目标卡」：先断开源卡连接，
     * 忽略当前 tag，等下一次发现事件（移开→重贴）才返回。
     */
    @PluginMethod
    public void waitForTag(PluginCall call) {
        if (!sessionActive) {
            call.reject("NO_SESSION", "请先开启 NFC 会话");
            return;
        }
        boolean requireNew = "true".equalsIgnoreCase(call.getString("requireNew", "false"));
        if (requireNew) {
            closeMifare();
            currentTag = null;
        } else if (currentTag != null) {
            JSObject ready = new JSObject();
            ready.put("uid", toHex(currentTag.getId()));
            call.resolve(ready);
            return;
        }
        cancelPendingWait();
        pendingTagWait = call;
        int timeoutMs = call.getInt("timeoutMs", DEFAULT_TAG_TIMEOUT_MS);
        if (timeoutMs <= 0) timeoutMs = DEFAULT_TAG_TIMEOUT_MS;
        pendingTimeout = new Runnable() {
            @Override
            public void run() {
                PluginCall waiting = pendingTagWait;
                pendingTagWait = null;
                pendingTimeout = null;
                if (waiting != null) {
                    waiting.reject("TAG_TIMEOUT", "等待贴卡超时，请把卡贴在手机 NFC 感应区");
                }
            }
        };
        uiHandler().postDelayed(pendingTimeout, timeoutMs);
    }

    @Override
    public void onTagDiscovered(Tag tag) {
        if (!sessionActive) return;
        // 换卡必须重连：旧连接的认证状态对新卡无效
        closeMifare();
        currentTag = tag;
        JSObject out = new JSObject();
        out.put("uid", toHex(tag.getId()));
        notifyListeners("m1TagDetected", out);

        PluginCall waiting = pendingTagWait;
        if (waiting != null) {
            pendingTagWait = null;
            cancelTimeout();
            JSObject ready = new JSObject();
            ready.put("uid", toHex(tag.getId()));
            waiting.resolve(ready);
        }
    }

    @PluginMethod
    public void readCard(PluginCall call) {
        if (!sessionActive || currentTag == null) {
            call.reject("NO_TAG", "请先把卡贴在手机 NFC 感应区");
            return;
        }
        JSObject out = new JSObject();
        out.put("uid", toHex(currentTag.getId()));
        // 换卡后的 readCard 是对新 tag 重连，先释放旧连接
        closeMifare();
        MifareClassic mc = MifareClassic.get(currentTag);
        if (mc == null) {
            // ★ 机型不支持 M1：如实返回，JS 侧降级到课程模拟器
            out.put("mifareClassic", false);
            out.put("reason", "该机型 NFC 芯片未提供 MIFARE Classic 实现");
            call.resolve(out);
            return;
        }
        try {
            mifare = mc;
            mc.connect();
            NfcA nfcA = NfcA.get(currentTag);
            out.put("mifareClassic", true);
            out.put("sak", nfcA == null ? "" : String.format(Locale.US, "%02X", nfcA.getSak() & 0xff));
            out.put("atqa", nfcA == null ? "" : toHex(nfcA.getAtqa()));
            out.put("sectorCount", mc.getSectorCount());
            out.put("blockCount", mc.getBlockCount());
            // BCC 由卡号四字节异或得出，与 shared 内核 m1ComputeBcc 同口径
            byte[] id = currentTag.getId();
            int bcc = 0;
            int take = Math.min(4, id.length);
            for (int i = 0; i < take; i++) bcc ^= (id[i] & 0xff);
            out.put("bcc", String.format(Locale.US, "%02X", bcc & 0xff));
            call.resolve(out);
        } catch (Exception e) {
            closeMifare();
            call.reject("CONNECT_FAILED", e.getMessage(), e);
        }
    }

    /** 认证失败（密钥不对）不是插件错误：返回 ok=false 让密码本继续试下一个候选。 */
    @PluginMethod
    public void authenticateSector(PluginCall call) {
        int sector = call.getInt("sector", -1);
        byte[] key = parseKey(call.getString("key"));
        String slot = call.getString("slot", "A");
        JSObject out = new JSObject();
        if (sector < 0 || key == null || mifare == null) {
            out.put("ok", false);
            call.resolve(out);
            return;
        }
        try {
            boolean ok = "B".equalsIgnoreCase(slot)
                ? mifare.authenticateSectorWithKeyB(sector, key)
                : mifare.authenticateSectorWithKeyA(sector, key);
            out.put("ok", ok);
        } catch (Exception e) {
            out.put("ok", false);
        }
        call.resolve(out);
    }

    private boolean authenticate(int sector, byte[] key, String slot) {
        if (mifare == null || key == null || sector < 0) return false;
        try {
            return "B".equalsIgnoreCase(slot)
                ? mifare.authenticateSectorWithKeyB(sector, key)
                : mifare.authenticateSectorWithKeyA(sector, key);
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void readBlock(PluginCall call) {
        int sector = call.getInt("sector", -1);
        int block = call.getInt("block", -1);
        String keyHex = call.getString("key");
        String slot = call.getString("slot", "A");
        if (mifare == null || sector < 0 || block < 0 || !authenticate(sector, parseKey(keyHex), slot)) {
            call.reject("AUTH_FAILED", "扇区认证失败");
            return;
        }
        try {
            int absolute = mifare.sectorToBlock(sector) + block;
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("data", toHex(mifare.readBlock(absolute)));
            call.resolve(out);
        } catch (Exception e) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", e.getMessage());
            call.resolve(out);
        }
    }

    /** 块 0 写入普通卡会失败：如实返回 ok=false，不伪造成功。 */
    @PluginMethod
    public void writeBlock(PluginCall call) {
        int sector = call.getInt("sector", -1);
        int block = call.getInt("block", -1);
        byte[] data = parseData(call.getString("data"));
        String keyHex = call.getString("key");
        String slot = call.getString("slot", "A");
        if (mifare == null || sector < 0 || block < 0 || data == null
                || !authenticate(sector, parseKey(keyHex), slot)) {
            call.reject("AUTH_FAILED", "扇区认证失败或数据非法");
            return;
        }
        try {
            int absolute = mifare.sectorToBlock(sector) + block;
            mifare.writeBlock(absolute, data);
            JSObject out = new JSObject();
            out.put("ok", true);
            call.resolve(out);
        } catch (Exception e) {
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("reason", e.getMessage() == null ? "写入被卡片拒绝" : e.getMessage());
            call.resolve(out);
        }
    }
}
