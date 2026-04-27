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
    // Some finders (e.g. `.last`, `.first`) throw StateError when the
    // parent matches nothing -- they call `iterable.last` directly. Treat
    // any exception during evaluation as "not found yet" so polling
    // continues until the parent populates or the timeout fires.
    try {
      if (finder.evaluate().isNotEmpty) return;
    } catch (_) {
      // Keep polling.
    }
  }
  throw StateError(
    'Timed out after ${timeout.inSeconds}s waiting for $finder',
  );
}
