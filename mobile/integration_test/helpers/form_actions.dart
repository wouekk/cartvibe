import 'package:flutter/cupertino.dart';
import 'package:flutter_form_builder/flutter_form_builder.dart';
import 'package:flutter_test/flutter_test.dart';

import 'pump.dart';

/// Locates a `FormBuilderTextField` (or `FormBuilderField` subclass) by its
/// `name`. The receipt-add form uses `name`-based identity rather than
/// `Key`, so `find.byKey` doesn't apply.
Finder formField(String name) => find.byWidgetPredicate(
      (w) => w is FormBuilderTextField && w.name == name,
    );

/// Locates a `CupertinoButton` (filled or otherwise) by its visible label.
/// Used for the homeserver/login screens where the action buttons are
/// `CupertinoButton.filled` with a `Text` child.
Finder filledButton(String text) =>
    find.widgetWithText(CupertinoButton, text);

/// Drives a `FormBuilderDropdown<T>` by tapping it open and then tapping
/// the menu item whose visible text matches [optionText].
///
/// Note: when the menu is open the option text appears in TWO places --
/// the closed-state child (still in the tree behind the menu) and the
/// menu item itself. `find.text(optionText).last` picks the menu's copy.
/// If two copies aren't enough disambiguation (e.g. the same text
/// renders elsewhere on screen), scope the call site with a `find.descendant`
/// rather than expanding this helper.
Future<void> selectDropdown(
  WidgetTester tester,
  String name,
  String optionText,
) async {
  await tester.tap(find.byWidgetPredicate(
    (w) => w is FormBuilderDropdown && w.name == name,
  ));
  await pumpUntilFound(tester, find.text(optionText).last);
  await tester.tap(find.text(optionText).last);
  // Wait for the menu's exit animation -- bounded so we don't reuse
  // pumpAndSettle (which would hang on the bootstrap loader if it ran
  // while the form is rebuilding). 800ms is empirical: shorter values
  // left the menu mid-animation and adjacent taps hit the menu's
  // overlay instead of the intended target.
  await tester.pump(const Duration(milliseconds: 800));
}
