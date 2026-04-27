import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'api.dart';

/// Reads the current GoRouter URL by grabbing a context from inside the
/// routed tree (`MaterialApp` itself sits above the GoRouter scope, so
/// its element fails the inherited-widget lookup with "No GoRouter
/// found in context").
String currentUrl(WidgetTester tester) {
  final scaffold = find.byType(Scaffold).evaluate();
  if (scaffold.isEmpty) return '';
  return GoRouter.of(scaffold.first)
      .routerDelegate
      .currentConfiguration
      .uri
      .toString();
}

/// Pumps until the current GoRouter URL matches [pattern], or [timeout]
/// elapses. Use this -- not `find.text(<receipt name>)` -- to verify
/// navigation: the add screen's form already shows the typed name, so
/// the text-finder assertion would pass before the user even hit Save.
Future<String> pumpUntilUrl(
  WidgetTester tester,
  RegExp pattern, {
  Duration timeout = const Duration(seconds: 15),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 100));
    final url = currentUrl(tester);
    if (pattern.hasMatch(url)) return url;
  }
  throw StateError(
    'Timed out after ${timeout.inSeconds}s waiting for URL matching '
    '$pattern. Last seen: ${currentUrl(tester)}',
  );
}

/// Extracts the receipt id from a `/receipts/<id>/view` URL produced by
/// the production save handler.
int receiptIdFromUrl(String url) {
  final match = RegExp(r'/receipts/(\d+)/view').firstMatch(url);
  if (match == null) {
    throw StateError('Expected /receipts/<id>/view URL, got: $url');
  }
  return int.parse(match.group(1)!);
}

/// Best-effort cleanup: log in via the API and DELETE the receipt at
/// end-of-test. Wrapped via [addTearDown] so it runs even if the test
/// body throws after the receipt was created.
void scheduleReceiptCleanup(int receiptId) {
  addTearDown(() async {
    final jwt = await apiLogin();
    await deleteReceipt(receiptId, jwt: jwt);
  });
}
