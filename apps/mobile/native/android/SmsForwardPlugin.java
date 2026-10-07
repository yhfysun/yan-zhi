package com.yanzhi.mobile.sms;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.telephony.SmsMessage;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 短信验证码转发插件（Android）。
 *
 * 职责单一：把收到的短信（提取出的验证码 + 短文本体 + 发件人）通过 Capacitor 通知
 * 推给 JS 侧，由 JS 侧决定上报到哪个后端地址（复用已有的 mobile_api_base / 局域网发现）。
 *
 * ★ 为什么"抓取逻辑"放在原生：Android 的 SMS 内容只能由原生 BroadcastReceiver 拿到，
 *   WebView 层无权限（WebOTP 也只在 https 源 + 特定短信格式下可用）。
 *
 * ★ 为什么不在原生直接发 HTTP：后端地址、配对令牌由用户在 JS 侧配置（且可能随局域网切换），
 *   原生再存一份必然与 JS 侧漂移 —— 就违反"被多处需要的推导逻辑只能有唯一定义处"。
 *   所以原生只负责"拿短信"，网络上报交给 JS。
 *
 * ★ 安全：
 *   - 需 RECEIVE_SMS 运行时权限，由用户显式授予；
 *   - 监听用 RECEIVER_NOT_EXPORTED（Android 13+），只收系统广播；
 *   - 不写日志、不落盘到原生侧，短信内容只在内存里过一遍。
 */
@CapacitorPlugin(
    name = "SmsForward",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.RECEIVE_SMS })
    }
)
public class SmsForwardPlugin extends Plugin {

    private static final String TAG = "SmsForward";

    /** 正则：关键词 + 4-8 位数字。与后端 services/verification-codes.ts 的 extractVerificationCode 同口径。 */
    private static final Pattern KW_CODE = Pattern.compile(
        "(?:验证码|校验码|动态码|验证口令|短信码|verification\\s*code|verify\\s*code|code|otp|pin)\\D{0,8}(\\d{4,8})",
        Pattern.CASE_INSENSITIVE);
    /** 兜底：独立的 4-8 位数字（先剔除 9 位以上的长数字，避免把手机号当验证码）。 */
    private static final Pattern BARE_CODE = Pattern.compile("(?<!\\d)(\\d{4,8})(?!\\d)");

    private SmsReceiver receiver;
    private boolean listening = false;

    /** 缓存最近一条短信：JS 侧可能晚于广播才注册监听（WebView 启动顺序问题）。 */
    private static JSObject lastSms;

    public static String extractCode(String text) {
        if (text == null) return "";
        String s = text.trim();
        if (s.isEmpty()) return "";
        Matcher m1 = KW_CODE.matcher(s);
        if (m1.find()) return m1.group(1);
        String stripped = s.replaceAll("\\d{9,}", " ");
        Matcher m2 = BARE_CODE.matcher(stripped);
        if (m2.find()) return m2.group(1);
        return "";
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sms", getPermissionState("sms").toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (getPermissionState("sms") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "permCallback");
        } else {
            JSObject ret = new JSObject();
            ret.put("sms", "granted");
            call.resolve(ret);
        }
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sms", getPermissionState("sms").toString());
        call.resolve(ret);
    }

    /** 开始监听短信。已授权才生效；返回 granted 状态与是否在监听。 */
    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("sms") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("尚未授予短信权限（RECEIVE_SMS）");
            return;
        }
        try {
            registerReceiver();
            JSObject ret = new JSObject();
            ret.put("listening", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("注册短信监听失败: " + e.getMessage());
        }
    }

    /** 停止监听。 */
    @PluginMethod
    public void stop(PluginCall call) {
        try {
            unregisterReceiver();
            JSObject ret = new JSObject();
            ret.put("listening", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("取消短信监听失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isListening(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("listening", listening);
        call.resolve(ret);
    }

    /** 取最近一条缓存的短信（WebView 晚于广播启动时补拿；取过不清，可重复读）。 */
    @PluginMethod
    public void getLast(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sms", lastSms == null ? JSONObject.NULL : lastSms);
        call.resolve(ret);
    }

    private void registerReceiver() {
        if (listening) return;
        receiver = new SmsReceiver(new SmsReceiver.Listener() {
            @Override
            public void onSms(String sender, String body) {
                JSObject payload = new JSObject();
                payload.put("sender", sender == null ? "" : sender);
                payload.put("body", body == null ? "" : body);
                payload.put("code", extractCode(body));
                payload.put("receivedAt", System.currentTimeMillis());
                lastSms = payload;
                notifyListeners("smsReceived", payload);
            }
        });
        IntentFilter filter = new IntentFilter("android.provider.Telephony.SMS_RECEIVED");
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            ContextCompat.registerReceiver(ctx, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
        }
        listening = true;
    }

    private void unregisterReceiver() {
        if (!listening || receiver == null) return;
        try {
            getContext().unregisterReceiver(receiver);
        } catch (Exception ignored) {
            // 未注册或已注销：忽略
        }
        listening = false;
    }

    @Override
    protected void handleOnDestroy() {
        unregisterReceiver();
        super.handleOnDestroy();
    }
}