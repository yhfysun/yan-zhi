const CONTROL_HEADER = 'x-yz-control-token';
const REQUEST_TIMEOUT_MS = 1_500;

const VISUAL_TOOLS = new Set([
  'computer_screenshot',
  'computer_get_ui_tree',
  'computer_click_element',
  'computer_set_value',
  'computer_wait_for_element',
  'computer_mouse_click',
  'computer_mouse_move',
  'computer_mouse_drag',
  'computer_scroll',
  'computer_type',
  'computer_press_key',
  'computer_activate_window',
  'computer_open_app',
  'computer_control_start',
  'computer_control_observe',
  'computer_control_act',
  'computer_control_handoff',
]);

export function shouldShowComputerControl(toolName: string): boolean {
  return VISUAL_TOOLS.has(String(toolName || ''));
}

export function computerControlOverlayAvailable(): boolean {
  return !!(process.env.YZ_COMPUTER_CONTROL_URL && process.env.YZ_COMPUTER_CONTROL_TOKEN);
}

export function computerControlSessionId(context: {
  userId?: string;
  conversationId?: string;
  taskId?: string;
}): string {
  const userId = String(context.userId || 'guest');
  const scope = String(context.taskId || context.conversationId || 'desktop');
  return `${userId}:${scope}`.slice(0, 120);
}

async function postControl(body: Record<string, unknown>): Promise<boolean> {
  if (!computerControlOverlayAvailable()) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(process.env.YZ_COMPUTER_CONTROL_URL as string, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [CONTROL_HEADER]: process.env.YZ_COMPUTER_CONTROL_TOKEN as string,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const result = await response.json().catch(() => null) as { ok?: boolean } | null;
    return result?.ok !== false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function pulseComputerControl(input: {
  sessionId: string;
  toolName: string;
  phase?: 'before' | 'after';
  preview?: boolean;
  paused?: boolean;
  cursor?: { x: number; y: number };
  click?: boolean;
}): Promise<boolean> {
  return postControl({
    op: 'pulse',
    sessionId: String(input.sessionId || ''),
    toolName: String(input.toolName || ''),
    phase: input.phase || 'before',
    ...(typeof input.preview === 'boolean' ? { preview: input.preview } : {}),
    ...(typeof input.paused === 'boolean' ? { paused: input.paused } : {}),
    ...(Number.isFinite(input.cursor?.x) && Number.isFinite(input.cursor?.y)
      ? { cursor: { x: Number(input.cursor!.x), y: Number(input.cursor!.y) } }
      : {}),
    ...(input.click === true ? { click: true } : {}),
  });
}

export function stopComputerControl(sessionId: string): Promise<boolean> {
  return postControl({
    op: 'stop',
    sessionId: String(sessionId || ''),
  });
}
