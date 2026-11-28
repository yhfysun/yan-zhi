import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CONSOLE_SHELL = readFileSync(
  resolve(__dirname, '../../components/console/ConsoleShell.vue'),
  'utf8',
);
const SHOP_CONSOLE = readFileSync(resolve(__dirname, 'ShopConsole.vue'), 'utf8');
const SHOP_TOOLBAR = readFileSync(resolve(__dirname, 'shop/ShopToolbar.vue'), 'utf8');
const SHOP_PURCHASE = readFileSync(resolve(__dirname, 'shop/ShopPurchaseDialog.vue'), 'utf8');
const SHOP_CSS = readFileSync(resolve(__dirname, 'shop/shop.css'), 'utf8');

describe('店铺移动端布局契约', () => {
  it('资源栏在移动端以抽屉覆盖，主工作区始终占满', () => {
    expect(CONSOLE_SHELL).toContain('mobileAside?: \'push\' | \'drawer\'');
    expect(CONSOLE_SHELL).toContain('class="cs-aside-scrim"');
    expect(CONSOLE_SHELL).toMatch(
      /\.cs-layout\.is-drawer \.cs-aside\s*\{[\s\S]*?position:\s*absolute[\s\S]*?width:\s*min\(86vw,\s*340px\)/,
    );
    expect(CONSOLE_SHELL).toMatch(
      /\.cs-layout\.is-drawer \.cs-main\s*\{[\s\S]*?flex-basis:\s*100%/,
    );
    expect(SHOP_CONSOLE).toContain('mobile-aside="drawer"');
    expect(SHOP_CONSOLE).toContain("'shop-console is-mobile-workbench'");
    expect(SHOP_TOOLBAR).toContain("@click=\"emit('open-projects')\"");
    expect(SHOP_CSS).toMatch(
      /\.shop-console\.is-mobile-workbench \.cs-layout\.is-drawer:not\(\.is-aside-open\) \.cs-aside-toggle\s*\{[\s\S]*?display:\s*none/,
    );
  });

  it('移动端不暴露内置浏览器与平台后台入口', () => {
    expect(SHOP_CONSOLE).toContain(':browser-available="browserAvailable"');
    expect(SHOP_CONSOLE).toContain(':platform-available="browserAvailable"');
    expect(SHOP_CONSOLE).toContain('<ChatPreviewPane v-if="!compactMobile" />');
    expect(SHOP_CONSOLE).toMatch(
      /platformInfo\.isMobile \|\| \(platformInfo\.isWeb && isMobileShell\.value\)/,
    );
    expect(SHOP_CONSOLE).toMatch(
      /<el-tab-pane v-if="platformAvailable" label="平台后台" name="platform">/,
    );
    expect(SHOP_TOOLBAR).toMatch(
      /v-if="browserAvailable"[^>]*>浏览器<\/el-button>/,
    );
    expect(SHOP_TOOLBAR).toMatch(
      /v-if="shop && isStore && platformAvailable"[^>]*>平台后台<\/el-button>/,
    );
    expect(SHOP_PURCHASE).toContain('useMobileShell');
    expect(SHOP_PURCHASE).toMatch(
      /if \(mobileBrowserUnavailable\.value\) \{[\s\S]*?window\.open\(r\.plan\.url,[\s\S]*?return;/,
    );
  });

  it('移动工具条按可用操作自适应列数，不留下半屏空按钮', () => {
    expect(SHOP_CSS).toMatch(
      /\.shop-toolbar-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(132px,\s*1fr\)\)/,
    );
  });

  it('移动端把店铺设置收成触屏工具条、页签和拇指区主操作', () => {
    expect(SHOP_CONSOLE).toContain(':compact-mobile="compactMobile"');
    expect(SHOP_CONSOLE).toContain('class="shop-mobile-setup-bar"');
    expect(SHOP_TOOLBAR).toContain('class="shop-toolbar shop-toolbar-mobile"');
    expect(SHOP_CSS).toMatch(
      /\.shop-console\.is-mobile-workbench \.shop-tabs \.el-tabs__item\s*\{[\s\S]*?height:\s*44px/,
    );
    expect(SHOP_CSS).toMatch(
      /\.shop-mobile-setup-bar\s*\{[\s\S]*?padding:\s*8px 12px/,
    );
    expect(SHOP_CSS).toMatch(
      /\.shop-console\.is-mobile-workbench \.shop-setup-fields \.el-input__wrapper,[\s\S]*?min-height:\s*48px/,
    );
  });
});
