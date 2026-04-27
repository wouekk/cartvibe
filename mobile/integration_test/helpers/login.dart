import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:receipt_wrangler_mobile/groups/screens/group_select.dart';
import 'package:receipt_wrangler_mobile/main.dart' as app;

import 'env.dart';
import 'form_actions.dart';
import 'pump.dart';

/// Cold-boots the app and walks the SetHomeserverUrl + Login screens
/// using the admin credentials from `--dart-define=E2E_*`. Returns when
/// `GroupSelect` is on screen (= logged-in landing).
///
/// Pre-conditions:
/// - `IntegrationTestWidgetsFlutterBinding.ensureInitialized()` was
///   called by the caller's `main()`.
/// - On Linux, `installLinuxDesktopMocks()` was called by the caller's
///   `main()` (mobile-only plugins are stubbed there). On Android/iOS
///   the call should be skipped via `Platform.isLinux` so real plugin
///   channels run.
Future<void> loginAsAdmin(WidgetTester tester) async {
  E2eEnv.assertAdmin();

  // Wipe persisted secure storage before bootstrap on real-device
  // targets. iOS keychain entries survive app reinstalls, so without
  // this the JWT written by a prior `flutter drive` invocation leaks
  // into this process and short-circuits the login flow. Linux uses
  // installLinuxDesktopMocks() which already isolates state per test.
  if (!Platform.isLinux) {
    const channel =
        MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
    try {
      await channel.invokeMethod('deleteAll', <String, dynamic>{
        'options': const <String, dynamic>{},
      });
    } catch (_) {
      // Best-effort: empty storage or unwired channel both fall through.
    }
  }

  app.main();

  // The top-level GoRouter in main.dart is a final global, so its
  // current location persists across testWidgets in the same process.
  // After a previous test landed on /receipts/<id>/view, the router
  // restores there instead of '/' on the next test's app.main().
  // Explicitly send it back to '/' once a context is available.
  await pumpUntilFound(tester, find.byType(MaterialApp));
  for (final el in find.byType(Scaffold).evaluate()) {
    GoRouter.of(el).go('/');
    break;
  }

  await pumpUntilFound(tester, find.text('Server URL'));

  await tester.enterText(formField('url'), E2eEnv.baseUrl);
  await tester.tap(filledButton('Connect'));
  await pumpUntilFound(tester, find.text('Log In'));

  await tester.enterText(formField('username'), E2eEnv.adminUsername);
  await tester.enterText(formField('password'), E2eEnv.adminPassword);
  await tester.tap(filledButton('Log In'));

  await pumpUntilFound(
    tester,
    find.byType(GroupSelect),
    timeout: const Duration(seconds: 15),
  );
}
