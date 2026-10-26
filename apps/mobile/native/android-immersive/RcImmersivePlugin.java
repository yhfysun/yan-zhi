package com.yanzhi.mobile.immersive;

import android.app.Activity;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 远控全屏（沉浸式）：隐藏状态栏与导航栏，边缘滑动可临时唤出。
 *
 * 为什么不用 @capacitor/status-bar：它只能隐藏状态栏，且为了一个开关多一个 npm 原生依赖；
 * 这里用本地插件（与短信插件同一套 apply-native-* 铺法，重建工程也不会丢）。
 */
@CapacitorPlugin(name = "RcImmersive")
public class RcImmersivePlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", Boolean.TRUE));
        final Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(window, window.getDecorView());
            if (c == null) return;
            if (on) {
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                c.show(WindowInsetsCompat.Type.systemBars());
            }
        });
        call.resolve();
    }
}
