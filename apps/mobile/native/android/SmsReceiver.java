package com.yanzhi.mobile.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/**
 * 短信广播接收器：从 SMS_RECEIVED 广播里解析出短信，回调给插件。
 *
 * 与 SmsForwardPlugin 分开成独立类，是为了让"解析短信"这件事只有一个定义处
 * （插件内部的匿名回调只消费结果，不重复解析）。
 */
public class SmsReceiver extends BroadcastReceiver {

    public interface Listener {
        void onSms(String sender, String body);
    }

    private final Listener listener;

    public SmsReceiver(Listener listener) {
        this.listener = listener;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        try {
            SmsMessage[] messages = extractMessages(intent);
            if (messages == null || messages.length == 0) return;
            StringBuilder body = new StringBuilder();
            String sender = null;
            for (SmsMessage msg : messages) {
                if (msg == null) continue;
                if (sender == null) sender = msg.getDisplayOriginatingAddress();
                body.append(msg.getMessageBody() == null ? "" : msg.getMessageBody());
            }
            if (listener != null) listener.onSms(sender, body.toString());
        } catch (Exception ignored) {
            // 解析失败静默：短信广播是系统回调，不应因此崩溃
        }
    }

    private SmsMessage[] extractMessages(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            return Telephony.Sms.Intents.getMessagesFromIntent(intent);
        }
        return null;
    }
}