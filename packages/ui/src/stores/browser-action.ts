/** browser_download 的无参数调用是查询，不是触发下载。 */
export function normalizeBrowserDownloadAction(
  fullName: string,
  args: Record<string, unknown>,
  action: string | undefined,
): string | undefined {
  if (
    fullName === 'browser_download'
    && action === 'download'
    && !args?.url
    && !args?.selector
    && args?.index == null
  ) {
    return 'downloads';
  }
  return action;
}
