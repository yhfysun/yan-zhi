package com.yanzhi.mobile.immersive;

import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

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
 *
 * 2026-10-27 追加（用户实测「横屏最右侧有白条、画面显示不全」）：
 *  - windowLayoutInDisplayCutoutMode=shortEdges：横屏时挖孔摄像头落在短边（左右），
 *    默认 DEFAULT 模式下系统会把窗口 letterbox 缩开 → 露出一条系统底色（白条）。
 *    shortEdges 允许内容延伸进短边挖孔区，窗口恢复满屏。
 *  - 边到边 + 窗口背景纯黑：远控画面是视频流，全屏黑底就是正确底色。
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
            // 挖孔屏：允许内容画进短边 cutout 区（横屏时挖孔在左右短边）
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(lp);
            }
            WindowCompat.setDecorFitsSystemWindows(window, false);
            window.setBackgroundDrawableResource(android.R.color.black);
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
