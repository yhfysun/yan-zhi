# Android 固定签名

公司电脑和家里电脑必须使用同一份 `yan-zhi-release.jks` 与 `keystore.properties`。
这两个文件含私钥和密码，已被 `.gitignore` 忽略，禁止提交到 Git。

## 本地使用

将以下两个文件放到本目录：

```text
apps/mobile/signing/yan-zhi-release.jks
apps/mobile/signing/keystore.properties
```

`keystore.properties` 格式参考 `keystore.properties.example`。构建 APK 时会自动：

1. 将固定签名配置写入 Capacitor 生成的 `android/app/build.gradle`；
2. 使用同一 keystore 签署 debug/release APK；
3. 在复制 APK 前通过 `apksigner` 校验证书 SHA-256 是否等于 `cert-sha256.txt`。

任何一台电脑如果没有这两个文件，构建会直接失败，不会静默回退到机器各自的
`~/.android/debug.keystore`。

## CI

在 GitHub Actions 中配置以下 Secrets：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_SIGNING_PROPERTIES_BASE64`

PowerShell 生成示例：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('apps/mobile/signing/yan-zhi-release.jks'))
[Convert]::ToBase64String([IO.File]::ReadAllBytes('apps/mobile/signing/keystore.properties'))
```

## 签名变更

如果手机上已安装旧 debug 证书或其它证书签名的 APK，切换到本签名后首次安装必须先卸载旧包。
Android 不允许同包名、不同证书的 APK 直接覆盖安装。
