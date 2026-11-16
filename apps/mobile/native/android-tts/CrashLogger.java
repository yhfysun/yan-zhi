package com.yanzhi.mobile.tts;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** 设备侧崩溃日志：ADB 不可用时仍能保留启动链证据。 */
public final class CrashLogger {
    private static final String TAG = "YZCRASH";
    private static volatile Context appContext;
    private static volatile boolean installed = false;

    private CrashLogger() {
    }

    public static synchronized void install(Context context) {
        appContext = context.getApplicationContext();
        if (installed) return;
        installed = true;
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable error) {
                record("uncaught:" + thread.getName(), error);
                if (previous != null) previous.uncaughtException(thread, error);
            }
        });
    }

    public static void record(String where, Throwable error) {
        Log.e(TAG, where, error);
        Context context = appContext;
        if (context == null) return;
        StringWriter stack = new StringWriter();
        error.printStackTrace(new PrintWriter(stack));
        String timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(new Date());
        String text = "\n[" + timestamp + "] " + where + "\n" + stack + "\n";
        append(new File(context.getFilesDir(), "crash.log"), text);
        File external = context.getExternalFilesDir(null);
        if (external != null) append(new File(external, "crash.log"), text);
    }

    private static void append(File file, String text) {
        try {
            File parent = file.getParentFile();
            if (parent != null) parent.mkdirs();
            try (FileWriter writer = new FileWriter(file, true)) {
                writer.write(text);
            }
        } catch (Throwable ignored) {
            // 日志失败不能再触发新崩溃。
        }
    }
}
