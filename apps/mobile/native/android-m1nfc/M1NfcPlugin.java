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

import java.io.IOException;
import java.util.Arrays;
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
 * ★ 机型兼容（high 风险）：MifareClassic 是 Android 的可选实现，部分机型
 *   MifareClassic.get(tag) 返回 null。此时不能直接判死——先用「裸 NfcA 回退」：
 *   MIFARE Classic 的认证(60/61)/读(30)/写(A0) 指令走 NfcA.transceive 照样能发，
 *   Crypto1 加解密由 NFC 芯片硬件执行。探测方式 = 用默认密钥 A 对 0 扇区认证：
 *   - 返回 nt（4 字节）或 NAK（1 字节）都证明芯片能执行 MIFARE 指令
 *     （NAK 只说明默认密钥不对，卡是活的）→ 进入裸帧模式，照常读写；
 *   - 超时/异常才判定芯片真不支持 → 如实返回 mifareClassic=false。
 *   一加这类芯片确实不支持的机型会在探测步失败，仍然如实报不支持。
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
    /** 出厂默认密钥，仅用于裸帧模式探测芯片是否支持 MIFARE 指令集 */
    private static final byte[] PROBE_KEY = {
        (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF, (byte) 0xFF,
    };
    private static final int RAW_AUTH_TIMEOUT_MS = 300;

    private NfcAdapter adapter;
    private Handler mainHandler;
    private Tag currentTag;
    private MifareClassic mifare;
    /** 裸帧模式：MifareClassic tech 缺失但芯片能透传 MIFARE 指令时启用 */
    private NfcA rawNfcA;
    private boolean rawMode = false;
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

    private static String techListOf(Tag tag) {
        String[] list = tag.getTechList();
        if (list == null || list.length == 0) return "";
        StringBuilder sb = new StringBuilder();
        for (String t : list) {
            if (sb.length() > 0) sb.append(',');
            sb.append(t);
        }
        return sb.toString();
    }

    /** SAK → 扇区数（裸帧模式没有 MifareClassic 帮我们算，只能按 SAK 映射） */
    private static int sakSectorCount(int sak) {
        switch (sak) {
            case 0x09: return 5;            // MIFARE Classic 320B
            case 0x18:
            case 0x38: return 40;           // MIFARE Classic 4K
            default: return 16;             // 1K（0x08 / 0x88 / 兼容卡）
        }
    }

    private static int sakBlockCount(int sectors) {
        int blocks = 0;
        for (int s = 0; s < sectors; s++) blocks += (s < 32 ? 4 : 16);
        return blocks;
    }

    private static boolean isM1Sak(int sak) {
        return sak == 0x08 || sak == 0x09 || sak == 0x18 || sak == 0x38 || sak == 0x88;
    }

    /** 裸帧模式的扇区 → 起始块号（1K 每扇区 4 块，4K 后 8 扇区每扇区 16 块） */
    private static int rawSectorToBlock(int sector) {
        return sector < 32 ? sector * 4 : 128 + (sector - 32) * 16;
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
        if (rawNfcA != null) {
            try { rawNfcA.close(); } catch (Exception ignored) { }
            rawNfcA = null;
        }
        rawMode = false;
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
        out.put("techList", techListOf(currentTag));
        // 换卡后的 readCard 是对新 tag 重连，先释放旧连接
        closeMifare();
        MifareClassic mc = MifareClassic.get(currentTag);
        if (mc == null) {
            // ★ MifareClassic tech 缺失不等于读不了：先走裸 NfcA 回退探测
            resolveRawFallback(call, out);
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

    /**
     * MifareClassic.get 为 null 时的回退判定。
     * 用默认密钥 A 对 0 扇区发认证指令：芯片能执行 MIFARE 指令就进裸帧模式；
     * NAK（1 字节应答）说明卡活着只是密钥不对，同样算支持；超时/异常才判不支持。
     */
    private void resolveRawFallback(PluginCall call, JSObject out) {
        NfcA a = NfcA.get(currentTag);
        if (a == null) {
            out.put("mifareClassic", false);
            out.put("reason", "这张卡不是 ISO 14443-A 卡，不是 M1 卡");
            call.resolve(out);
            return;
        }
        int sak = a.getSak() & 0xff;
        out.put("sak", String.format(Locale.US, "%02X", sak));
        out.put("atqa", toHex(a.getAtqa()));
        try {
            a.connect();
            a.setTimeout(RAW_AUTH_TIMEOUT_MS);
            int probe = rawAuth(a, 0, PROBE_KEY, true);
            if (probe >= 0) {
                // 芯片能跑 MIFARE 指令（NAK 也证明协议活着，只是默认密钥不对）
                rawNfcA = a;
                rawMode = true;
                int sectors = sakSectorCount(sak);
                out.put("mifareClassic", true);
                out.put("rawMode", true);
                out.put("sectorCount", sectors);
                out.put("blockCount", sakBlockCount(sectors));
                byte[] id = currentTag.getId();
                int bcc = 0;
                int take = Math.min(4, id.length);
                for (int i = 0; i < take; i++) bcc ^= (id[i] & 0xff);
                out.put("bcc", String.format(Locale.US, "%02X", bcc & 0xff));
                call.resolve(out);
                return;
            }
            try { a.close(); } catch (Exception ignored) { }
            out.put("mifareClassic", false);
            out.put("reason", isM1Sak(sak)
                ? "该机型 NFC 芯片不支持 MIFARE Classic（认证指令被芯片拒绝）"
                : "这张卡不是 MIFARE Classic（M1）卡");
            call.resolve(out);
        } catch (Exception e) {
            try { a.close(); } catch (Exception ignored) { }
            out.put("mifareClassic", false);
            out.put("reason", "该机型 NFC 芯片未提供 MIFARE Classic 实现（MIFARE 裸指令也不支持）");
            call.resolve(out);
        }
    }

    /**
     * 裸帧 MIFARE Classic 认证：60/61 + 块号 + 密钥 + UID，Crypto1 由芯片硬件执行。
     *
     * @return 1=认证成功（应答 4 字节 nt）；0=卡回 NAK（密钥不对，协议活着）；
     *         -1=指令异常（芯片不支持 MIFARE 指令 / 卡已离开）
     */
    private int rawAuth(NfcA a, int sector, byte[] key, boolean slotA) {
        byte[] cmd = new byte[12];
        cmd[0] = (byte) (slotA ? 0x60 : 0x61);
        cmd[1] = (byte) rawSectorToBlock(sector);
        System.arraycopy(key, 0, cmd, 2, 6);
        byte[] id = currentTag.getId();
        for (int i = 0; i < 4; i++) cmd[8 + i] = i < id.length ? id[i] : (byte) 0;
        try {
            byte[] resp = a.transceive(cmd);
            if (resp == null || resp.length == 1) return 0;
            return 1;
        } catch (Exception e) {
            return -1;
        }
    }

    private byte[] rawReadBlock(int absolute) throws IOException {
        try {
            byte[] resp = rawNfcA.transceive(new byte[]{(byte) 0x30, (byte) absolute});
            if (resp == null || resp.length < 16) throw new IOException("读块数据不足 16 字节");
            // 应答可能带 2 字节 CRC（18 字节），统一截取前 16 字节
            return Arrays.copyOf(resp, 16);
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e.getMessage() == null ? "读块失败" : e.getMessage());
        }
    }

    private void rawWriteBlock(int absolute, byte[] data) throws IOException {
        try {
            byte[] ack = rawNfcA.transceive(new byte[]{(byte) 0xA0, (byte) absolute});
            if (ack == null || ack.length != 1 || ack[0] != 0x0A) {
                throw new IOException("写入指令未被卡片确认");
            }
            byte[] ack2 = rawNfcA.transceive(data);
            if (ack2 == null || ack2.length != 1 || ack2[0] != 0x0A) {
                throw new IOException("写入数据被卡片拒绝");
            }
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException(e.getMessage() == null ? "写入失败" : e.getMessage());
        }
    }

    /** 认证失败（密钥不对）不是插件错误：返回 ok=false 让密码本继续试下一个候选。 */
    @PluginMethod
    public void authenticateSector(PluginCall call) {
        int sector = call.getInt("sector", -1);
        byte[] key = parseKey(call.getString("key"));
        String slot = call.getString("slot", "A");
        JSObject out = new JSObject();
        if (sector < 0 || key == null || (mifare == null && !rawMode)) {
            out.put("ok", false);
            call.resolve(out);
            return;
        }
        out.put("ok", authenticate(sector, key, slot));
        call.resolve(out);
    }

    private boolean authenticate(int sector, byte[] key, String slot) {
        if (key == null || sector < 0) return false;
        if (rawMode) {
            if (rawNfcA == null) return false;
            return rawAuth(rawNfcA, sector, key, !"B".equalsIgnoreCase(slot)) == 1;
        }
        if (mifare == null) return false;
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
        if ((mifare == null && !rawMode) || sector < 0 || block < 0
                || !authenticate(sector, parseKey(keyHex), slot)) {
            call.reject("AUTH_FAILED", "扇区认证失败");
            return;
        }
        try {
            int absolute = rawMode
                ? rawSectorToBlock(sector) + block
                : mifare.sectorToBlock(sector) + block;
            JSObject out = new JSObject();
            out.put("ok", true);
            out.put("data", toHex(rawMode ? rawReadBlock(absolute) : mifare.readBlock(absolute)));
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
        if ((mifare == null && !rawMode) || sector < 0 || block < 0 || data == null
                || !authenticate(sector, parseKey(keyHex), slot)) {
            call.reject("AUTH_FAILED", "扇区认证失败或数据非法");
            return;
        }
        try {
            int absolute = rawMode
                ? rawSectorToBlock(sector) + block
                : mifare.sectorToBlock(sector) + block;
            if (rawMode) {
                rawWriteBlock(absolute, data);
            } else {
                mifare.writeBlock(absolute, data);
            }
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
