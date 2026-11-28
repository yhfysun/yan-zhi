package com.yanzhi.mobile.storage;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Android 真实文件访问桥。
 *
 * Android 11+ 的公共目录不能靠普通运行时权限开放，必须让用户在系统页授予
 * MANAGE_EXTERNAL_STORAGE；旧版本仍走 READ/WRITE_EXTERNAL_STORAGE。
 * 授权后返回 /storage/emulated/0，前端目录树和嵌入式 Node 工具共用真实绝对路径。
 */
@CapacitorPlugin(
    name = "YzStorage",
    permissions = {
        @Permission(
            alias = "storage",
            strings = {
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            }
        )
    }
)
public class YzStoragePlugin extends Plugin {
    private boolean hasAccess() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return getPermissionState("storage") == PermissionState.GRANTED;
    }

    private JSObject result() {
        JSObject ret = new JSObject();
        ret.put("granted", hasAccess());
        ret.put("root", Environment.getExternalStorageDirectory().getAbsolutePath());
        ret.put("api", Build.VERSION.SDK_INT);
        return ret;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(result());
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (hasAccess()) {
            call.resolve(result());
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            startActivityForResult(call, intent, "accessResult");
            return;
        }
        requestPermissionForAlias("storage", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        call.resolve(result());
    }

    @ActivityCallback
    private void accessResult(PluginCall call, ActivityResult result) {
        call.resolve(result());
    }
}
