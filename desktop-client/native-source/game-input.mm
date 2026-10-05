#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <node_api.h>
#include <string>
#include <vector>
#include <stdexcept>
#include <unistd.h>

static napi_value text(napi_env env, const std::string &value) {
  napi_value result; napi_create_string_utf8(env, value.c_str(), value.size(), &result); return result;
}
static std::string argument(napi_env env, napi_value value) {
  size_t size; if (napi_get_value_string_utf8(env, value, nullptr, 0, &size) != napi_ok) throw std::runtime_error("Expected text argument.");
  std::string result(size + 1, '\0'); napi_get_value_string_utf8(env, value, result.data(), result.size(), &size); result.resize(size); return result;
}
static napi_value permissions(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1]; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  bool request = false; if (count) napi_get_value_bool(env, args[0], &request);
  bool trusted;
  if (request) {
    NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
    trusted = AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
  } else trusted = AXIsProcessTrusted();
  napi_value result; napi_get_boolean(env, trusted, &result); return result;
}
struct Input {
  napi_env env; napi_deferred deferred; napi_async_work work;
  std::string expected, mode, status = "failed", message;
};
static void key(CGKeyCode code, bool down, CGEventFlags flags = 0) {
  CGEventRef event = CGEventCreateKeyboardEvent(nullptr, code, down);
  if (!event) throw std::runtime_error("Could not create keyboard event.");
  CGEventSetFlags(event, flags); CGEventPost(kCGHIDEventTap, event); CFRelease(event);
}
static void press(CGKeyCode code, CGEventFlags flags = 0) {
  key(code, true, flags); usleep(100000); key(code, false, flags);
}
static void control(CGKeyCode code) {
  key(59, true, kCGEventFlagMaskControl); usleep(50000);
  try { press(code, kCGEventFlagMaskControl); } catch (...) { key(59, false); throw; }
  key(59, false);
}
static void execute(napi_env env, void *data) {
  Input *input = static_cast<Input *>(data);
  @autoreleasepool {
    try {
      if (!AXIsProcessTrusted()) throw std::runtime_error("Enable MeowLingo in System Settings > Privacy & Security > Accessibility.");
      NSRunningApplication *app = NSWorkspace.sharedWorkspace.frontmostApplication;
      NSString *identity = [[NSString stringWithFormat:@"%@ %@ %@", app.localizedName, app.bundleIdentifier, app.bundleURL.path] lowercaseString];
      if (!app || ![[identity stringByReplacingOccurrencesOfString:@" " withString:@""] containsString:@"projectzomboid"]) {
        input->status = "not_focused"; input->message = "Project Zomboid must be the foreground application."; return;
      }
      pid_t pid = app.processIdentifier;
      NSString *expected = [[NSString alloc] initWithBytes:input->expected.data() length:input->expected.size() encoding:NSUTF8StringEncoding];
      auto check = [&]() {
        if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != pid) {
          input->status = "not_focused"; throw std::runtime_error("Focus changed; stopped keyboard input.");
        }
        if (![[NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString] isEqualToString:expected])
          throw std::runtime_error("Clipboard changed; stopped keyboard input.");
      };
      check(); press(17); usleep(600000); check(); control(0); usleep(300000); check();
      if (input->mode == "paste") { control(9); }
      else {
        __block NSUInteger index = 0;
        [expected enumerateSubstringsInRange:NSMakeRange(0, expected.length) options:NSStringEnumerationByComposedCharacterSequences
          usingBlock:^(NSString *substring, NSRange range, NSRange enclosingRange, BOOL *stop) {
            check();
            std::vector<UniChar> units(substring.length); [substring getCharacters:units.data() range:NSMakeRange(0, substring.length)];
            CGEventRef down = CGEventCreateKeyboardEvent(nullptr, 0, true);
            CGEventRef up = CGEventCreateKeyboardEvent(nullptr, 0, false);
            if (!down || !up) { if (down) CFRelease(down); if (up) CFRelease(up); throw std::runtime_error("Could not create text event."); }
            CGEventKeyboardSetUnicodeString(down, substring.length, units.data()); CGEventKeyboardSetUnicodeString(up, substring.length, units.data());
            CGEventSetFlags(down, 0); CGEventSetFlags(up, 0);
            CGEventPost(kCGHIDEventTap, down); usleep(10000); CGEventPost(kCGHIDEventTap, up);
            CFRelease(down); CFRelease(up); usleep(index++ < 16 ? 15000 : 5000);
          }];
      }
      usleep(500000); check(); press(36);
      input->status = "keys_sent";
      input->message = "MeowLingo process issued T, Ctrl+A, " + std::string(input->mode == "paste" ? "Ctrl+V" : "direct Unicode text") + ", Enter via CGEvent. Game delivery is not confirmed.";
    } catch (const std::exception &error) { input->message = error.what(); }
  }
}
static void complete(napi_env env, napi_status status, void *data) {
  Input *input = static_cast<Input *>(data); napi_value result; napi_create_object(env, &result);
  if (status != napi_ok) { input->status = "failed"; input->message = "Keyboard input was cancelled."; }
  napi_set_named_property(env, result, "gameSendStatus", text(env, input->status));
  napi_set_named_property(env, result, "gameSendMessage", text(env, input->message));
  napi_resolve_deferred(env, input->deferred, result); napi_delete_async_work(env, input->work); delete input;
}
static napi_value send(napi_env env, napi_callback_info info) {
  size_t count = 2; napi_value args[2]; napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  auto *input = new Input(); input->env = env;
  try {
    if (count != 2) throw std::runtime_error("Expected text and input mode.");
    input->expected = argument(env, args[0]); input->mode = argument(env, args[1]);
    if (input->mode != "paste" && input->mode != "typing") throw std::runtime_error("Invalid input mode.");
  } catch (const std::exception &error) { delete input; napi_throw_error(env, nullptr, error.what()); return nullptr; }
  napi_value promise; napi_create_promise(env, &input->deferred, &promise);
  napi_create_async_work(env, nullptr, text(env, "MeowLingo keyboard input"), execute, complete, input, &input->work);
  napi_queue_async_work(env, input->work); return promise;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"permissions", nullptr, permissions, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"send", nullptr, send, nullptr, nullptr, nullptr, napi_default, nullptr}
  };
  napi_define_properties(env, exports, 2, properties); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
