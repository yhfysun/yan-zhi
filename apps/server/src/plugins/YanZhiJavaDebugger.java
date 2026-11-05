import com.sun.jdi.AbsentInformationException;
import com.sun.jdi.Bootstrap;
import com.sun.jdi.ArrayReference;
import com.sun.jdi.Field;
import com.sun.jdi.Location;
import com.sun.jdi.LocalVariable;
import com.sun.jdi.ObjectReference;
import com.sun.jdi.ReferenceType;
import com.sun.jdi.StackFrame;
import com.sun.jdi.ThreadReference;
import com.sun.jdi.Value;
import com.sun.jdi.VirtualMachine;
import com.sun.jdi.connect.AttachingConnector;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.event.BreakpointEvent;
import com.sun.jdi.event.ClassPrepareEvent;
import com.sun.jdi.event.Event;
import com.sun.jdi.event.EventQueue;
import com.sun.jdi.event.EventSet;
import com.sun.jdi.event.StepEvent;
import com.sun.jdi.event.VMDeathEvent;
import com.sun.jdi.event.VMDisconnectEvent;
import com.sun.jdi.request.BreakpointRequest;
import com.sun.jdi.request.ClassPrepareRequest;
import com.sun.jdi.request.EventRequest;
import com.sun.jdi.request.EventRequestManager;
import com.sun.jdi.request.StepRequest;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Minimal JDI bridge used by java-suite. It speaks a tab-separated command protocol
 * on stdin and JSON events/responses on stdout. JDK-only, no external debug server.
 */
public final class YanZhiJavaDebugger {
  private final VirtualMachine vm;
  private final EventRequestManager requests;
  private final BufferedReader input;
  private final PrintWriter output;
  private final Object stateLock = new Object();
  private final Set<String> pendingBreakpoints = new LinkedHashSet<>();
  private volatile ThreadReference activeThread;
  private volatile StackFrame activeFrame;
  private volatile boolean paused = false;
  private volatile boolean closed = false;
  private volatile StepRequest activeStep;
  private ClassPrepareRequest classPrepare;

  private YanZhiJavaDebugger(VirtualMachine vm) {
    this.vm = vm;
    this.requests = vm.eventRequestManager();
    this.input = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    this.output = new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8), true);
  }

  public static void main(String[] args) throws Exception {
    if (args.length < 2) {
      System.err.println("usage: YanZhiJavaDebugger <host> <port>");
      System.exit(2);
    }
    String host = args[0];
    int port = Integer.parseInt(args[1]);
    AttachingConnector connector = Bootstrap.virtualMachineManager().attachingConnectors().stream()
        .filter((candidate) -> "com.sun.jdi.SocketAttach".equals(candidate.name()))
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("JDI SocketAttach connector is unavailable"));
    Map<String, Connector.Argument> arguments = connector.defaultArguments();
    arguments.get("hostname").setValue(host);
    arguments.get("port").setValue(String.valueOf(port));
    VirtualMachine vm = attachWithRetry(connector, arguments);
    new YanZhiJavaDebugger(vm).run();
  }

  private static VirtualMachine attachWithRetry(
      AttachingConnector connector,
      Map<String, Connector.Argument> arguments) throws Exception {
    long deadline = System.currentTimeMillis() + 15_000;
    Throwable last = null;
    while (System.currentTimeMillis() < deadline) {
      try {
        return connector.attach(arguments);
      } catch (Throwable error) {
        last = error;
        Thread.sleep(150);
      }
    }
    throw new IllegalStateException("JDWP port did not become attachable in 15s", last);
  }

  private void run() throws Exception {
    classPrepare = requests.createClassPrepareRequest();
    classPrepare.setSuspendPolicy(EventRequest.SUSPEND_ALL);

    event("attached", "vm", vm.name() + " " + vm.version());
    Thread eventThread = new Thread(this::eventLoop, "yz-jdi-events");
    eventThread.setDaemon(true);
    eventThread.start();

    String line;
    while (!closed && (line = input.readLine()) != null) {
      if (line.isBlank()) continue;
      handleCommand(line);
    }
    close();
  }

  private void handleCommand(String line) {
    String[] parts = line.split("\\t", -1);
    String id = parts.length > 0 ? parts[0] : "";
    String command = parts.length > 1 ? parts[1] : "";
    try {
      switch (command) {
        case "break":
          requireParts(parts, 4);
          respond(id, true, installBreakpoint(decode(parts[2]), Integer.parseInt(parts[3])));
          return;
        case "continue":
          clearStep();
          vm.resume();
          paused = false;
          respond(id, true, "continued");
          return;
        case "step":
          requireParts(parts, 3);
          step(parts[2]);
          respond(id, true, "stepping " + parts[2]);
          return;
        case "eval":
          requireParts(parts, 3);
          respond(id, true, evaluate(decode(parts[2])));
          return;
        case "status":
          respond(id, true, statusText());
          return;
        case "stop":
          respond(id, true, "stopped");
          close();
          return;
        default:
          throw new IllegalArgumentException("unknown command: " + command);
      }
    } catch (Throwable error) {
      respond(id, false, errorMessage(error));
    }
  }

  private String installBreakpoint(String className, int line) throws Exception {
    synchronized (stateLock) {
      List<ReferenceType> classes = vm.classesByName(className);
      if (classes.isEmpty()) {
        pendingBreakpoints.add(className + "\t" + line);
        classPrepare.enable();
        return "pending " + className + ":" + line;
      }
      installLoadedBreakpoint(classes, line);
      return "installed " + className + ":" + line;
    }
  }

  private void installLoadedBreakpoint(List<ReferenceType> classes, int line) throws Exception {
    for (ReferenceType type : classes) {
      List<Location> locations = type.locationsOfLine(line);
      if (locations == null || locations.isEmpty()) continue;
      BreakpointRequest request = requests.createBreakpointRequest(locations.get(0));
      request.setSuspendPolicy(EventRequest.SUSPEND_ALL);
      request.enable();
      return;
    }
    throw new IllegalArgumentException("line " + line + " has no executable location");
  }

  private void step(String mode) throws Exception {
    ThreadReference thread = activeThread;
    if (thread == null) throw new IllegalStateException("no active thread; wait for a breakpoint first");
    if (!paused) throw new IllegalStateException("VM is not paused");
    int depth = "into".equals(mode) ? StepRequest.STEP_INTO
        : "out".equals(mode) ? StepRequest.STEP_OUT
        : StepRequest.STEP_OVER;
    synchronized (stateLock) {
      clearStep();
      activeStep = requests.createStepRequest(thread, StepRequest.STEP_LINE, depth);
      activeStep.addCountFilter(1);
      activeStep.setSuspendPolicy(EventRequest.SUSPEND_ALL);
      activeStep.enable();
      paused = false;
      vm.resume();
    }
  }

  private String evaluate(String expression) throws Exception {
    StackFrame frame = activeFrame;
    if (frame == null || !paused) throw new IllegalStateException("VM is not paused at a frame");
    Value value = valueOfExpression(frame, expression.trim());
    if (value == null) return "null";
    return value.type().name() + " = " + value;
  }

  /**
   * Vanilla JDI intentionally has no Java expression compiler. The lightweight
   * bridge supports the common inspection forms without bundling an evaluator:
   * identifier, this, this.field, array[index], and Type.staticField.
   */
  private Value valueOfExpression(StackFrame frame, String expression) throws Exception {
    if (expression.isEmpty()) throw new IllegalArgumentException("expression is empty");
    if ("this".equals(expression)) return frame.thisObject();

    String arrayExpression = expression;
    Integer arrayIndex = null;
    java.util.regex.Matcher array = java.util.regex.Pattern.compile("^(.+)\\[(\\d+)]$").matcher(expression);
    if (array.matches()) {
      arrayExpression = array.group(1);
      arrayIndex = Integer.parseInt(array.group(2));
    }

    Value value = resolveSimpleValue(frame, arrayExpression);
    if (arrayIndex == null) return value;
    if (!(value instanceof ArrayReference)) throw new IllegalArgumentException("expression is not an array: " + arrayExpression);
    ArrayReference arrayReference = (ArrayReference) value;
    if (arrayIndex < 0 || arrayIndex >= arrayReference.length()) {
      throw new IllegalArgumentException("array index out of range: " + arrayIndex);
    }
    return arrayReference.getValue(arrayIndex);
  }

  private Value resolveSimpleValue(StackFrame frame, String expression) throws Exception {
    if (expression.startsWith("this.")) {
      ObjectReference self = frame.thisObject();
      if (self == null) throw new IllegalArgumentException("current frame has no this");
      Field field = self.referenceType().fieldByName(expression.substring(5));
      if (field == null) throw new IllegalArgumentException("field not found: " + expression.substring(5));
      return self.getValue(field);
    }

    LocalVariable local = null;
    try {
      local = frame.visibleVariableByName(expression);
    } catch (AbsentInformationException ignored) {
      // The class may have been compiled without debug local-variable metadata.
    }
    if (local != null) return frame.getValue(local);

    int dot = expression.indexOf('.');
    if (dot > 0) {
      String className = expression.substring(0, dot);
      String fieldName = expression.substring(dot + 1);
      List<ReferenceType> types = vm.classesByName(className);
      if (!types.isEmpty()) {
        Field field = types.get(0).fieldByName(fieldName);
        if (field != null) return types.get(0).getValue(field);
      }
    }

    throw new IllegalArgumentException(
        "unsupported expression by lightweight JDI evaluator: " + expression
            + " (supported: local variable, this, this.field, array[index], Type.staticField)");
  }

  private String statusText() {
    if (closed) return "terminated";
    if (!paused) return "running";
    String threadName = activeThread == null ? "" : activeThread.name();
    String location = locationText(activeFrame);
    return "paused " + threadName + " " + location;
  }

  private void eventLoop() {
    EventQueue queue = vm.eventQueue();
    while (!closed) {
      EventSet events;
      try {
        events = queue.remove();
      } catch (Throwable error) {
        if (!closed) event("disconnect", "reason", errorMessage(error));
        return;
      }
      boolean resumeSet = true;
      for (Event event : events) {
        if (event instanceof ClassPrepareEvent) {
          ClassPrepareEvent prepare = (ClassPrepareEvent) event;
          installPendingFor(prepare.referenceType());
          continue;
        }
        if (event instanceof BreakpointEvent) {
          paused = true;
          resumeSet = false;
          captureFrame(((BreakpointEvent) event).thread(), "breakpoint");
          continue;
        }
        if (event instanceof StepEvent) {
          paused = true;
          resumeSet = false;
          captureFrame(((StepEvent) event).thread(), "step");
          continue;
        }
        if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) {
          closed = true;
          resumeSet = false;
          event("exited", "reason", "terminated");
        }
      }
      if (resumeSet && !closed) {
        try {
          events.resume();
        } catch (Throwable ignored) {
          // The VM may disconnect between event delivery and resume.
        }
      }
    }
  }

  private void installPendingFor(ReferenceType type) {
    synchronized (stateLock) {
      pendingBreakpoints.removeIf((entry) -> {
        String[] pieces = entry.split("\\t", 2);
        if (!type.name().equals(pieces[0])) return false;
        try {
          installLoadedBreakpoint(List.of(type), Integer.parseInt(pieces[1]));
          event("breakpointInstalled", "class", type.name(), "line", pieces[1]);
          return true;
        } catch (Throwable error) {
          event("breakpointError", "class", type.name(), "line", pieces[1], "error", errorMessage(error));
          return true;
        }
      });
      if (pendingBreakpoints.isEmpty()) classPrepare.disable();
    }
  }

  private void captureFrame(ThreadReference thread, String reason) {
    activeThread = thread;
    try {
      activeFrame = thread.frames().isEmpty() ? null : thread.frames().get(0);
      Map<String, String> fields = new java.util.LinkedHashMap<>();
      fields.put("thread", thread.name());
      if (activeFrame != null) {
        fields.put("class", activeFrame.location().declaringType().name());
        fields.put("method", activeFrame.location().method().name());
        fields.put("file", sourcePath(activeFrame.location()));
        fields.put("line", String.valueOf(activeFrame.location().lineNumber()));
        fields.put("column", "-1");
      }
      fields.put("reason", reason);
      event("paused", fields);
    } catch (Throwable error) {
      event("error", "message", errorMessage(error));
    }
  }

  private String locationText(StackFrame frame) {
    if (frame == null) return "";
    Location location = frame.location();
    return location.declaringType().name() + "." + location.method().name() + ":" + location.lineNumber();
  }

  private String sourcePath(Location location) {
    try {
      return location.sourcePath();
    } catch (AbsentInformationException ignored) {
      return "";
    }
  }

  private void clearStep() {
    if (activeStep == null) return;
    try {
      requests.deleteEventRequest(activeStep);
    } catch (Throwable ignored) {
      // ignore stale request
    }
    activeStep = null;
  }

  private void close() {
    if (closed) return;
    closed = true;
    try {
      vm.dispose();
    } catch (Throwable ignored) {
      // already disconnected
    }
  }

  private void respond(String id, boolean ok, String result) {
    output.println("{\"id\":" + json(id) + ",\"ok\":" + ok + ",\"result\":" + json(result) + "}");
  }

  private void event(String name, String... keyValues) {
    Map<String, String> fields = new java.util.LinkedHashMap<>();
    for (int i = 0; i + 1 < keyValues.length; i += 2) fields.put(keyValues[i], keyValues[i + 1]);
    event(name, fields);
  }

  private void event(String name, Map<String, String> fields) {
    StringBuilder json = new StringBuilder("{\"event\":").append(json(name));
    for (Map.Entry<String, String> field : fields.entrySet()) {
      json.append(',').append(json(field.getKey())).append(':').append(json(field.getValue()));
    }
    json.append('}');
    output.println(json);
  }

  private static String decode(String value) {
    return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
  }

  private static void requireParts(String[] parts, int count) {
    if (parts.length < count) throw new IllegalArgumentException("command arguments are incomplete");
  }

  private static String errorMessage(Throwable error) {
    String message = error.getMessage();
    return message == null || message.isBlank() ? error.getClass().getSimpleName() : message;
  }

  private static String json(String value) {
    if (value == null) return "null";
    StringBuilder out = new StringBuilder("\"");
    for (int i = 0; i < value.length(); i++) {
      char ch = value.charAt(i);
      switch (ch) {
        case '"': out.append("\\\""); break;
        case '\\': out.append("\\\\"); break;
        case '\b': out.append("\\b"); break;
        case '\f': out.append("\\f"); break;
        case '\n': out.append("\\n"); break;
        case '\r': out.append("\\r"); break;
        case '\t': out.append("\\t"); break;
        default:
          if (ch < 0x20) out.append(String.format("\\u%04x", (int) ch));
          else out.append(ch);
      }
    }
    return out.append('"').toString();
  }
}
