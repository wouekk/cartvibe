import 'package:flutter_test/flutter_test.dart';

/// Pumps frames until [finder] matches at least one widget, or [timeout]
/// elapses. Use instead of [WidgetTester.pumpAndSettle] on screens that host
/// infinite animations (bootstrap loaders, shimmers, carousels) — those never
/// settle and `pumpAndSettle` will hang until its own timeout fires.
Future<void> pumpUntilFound(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 10),
  Duration step = const Duration(milliseconds: 100),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(step);
    if (finder.evaluate().isNotEmpty) return;
  }
  throw StateError(
    'Timed out after ${timeout.inSeconds}s waiting for $finder',
  );
}
