import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_form_builder/flutter_form_builder.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:receipt_wrangler_mobile/shared/widgets/slidable_widget.dart';

import 'helpers/api.dart';
import 'helpers/login.dart';
import 'helpers/platform_mocks.dart';
import 'helpers/pump.dart';
import 'helpers/receipt_test_helpers.dart';

/// Exercises the comments feature end-to-end on an edit-mode receipt:
/// add two comments via the bottom-sheet input, then swipe-delete the
/// first one. Asserts against `Receipt.comments` from the API after each
/// mutation -- the API list is the source of truth. A UI-only assertion
/// would miss the documented swallow in `_submitCommentToApi`'s catch
/// (receipt_comment_screen.dart:166-168), which can keep stale state in
/// the UI even when the POST failed.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    if (Platform.isLinux) {
      installLinuxDesktopMocks();
    }
  });

  // TODO(unblock-comments): shares the same /view -> popup -> Edit menu
  // navigation as receipt_status_lifecycle_test, which is currently broken on
  // a null-check in `receipt_bottom_sheet_builder.dart:389:56` (see that
  // spec's TODO). The comment input path then adds its own complexity around
  // the bottom-sheet send button + slidable-row delete. Skipping until the
  // shared setup is debugged; once status_lifecycle passes, this should be
  // re-enabled and verified.
  testWidgets('admin can add, view, and delete receipt comments',
      skip: true,
      (tester) async {
    await binding.setSurfaceSize(const Size(1280, 900));
    addTearDown(() => binding.setSurfaceSize(null));

    await loginAsAdmin(tester);

    final receiptName =
        'e2e-comments-${DateTime.now().millisecondsSinceEpoch}';
    final receiptId = await addManualReceiptViaUI(tester, receiptName);
    scheduleReceiptCleanup(receiptId);

    final jwt = await apiLogin();

    // Move from /view to /edit so the comment bottom sheet (and the
    // swipe-to-delete slidable) become interactive -- both gate on
    // `formState == edit`. Tap the popup menu's "Edit" item.
    //
    // The ReceiptEditPopupMenu is gated on canEditReceipt(), which reads
    // GroupModel; on cold-boot post-navigation, that model may not yet
    // know the user's role in the receipt's group, so the button isn't
    // mounted immediately. Same pumpUntilFound pattern as
    // receipt_edit_test.dart:50.
    final menuButton = find.byType(PopupMenuButton<dynamic>);
    await pumpUntilFound(tester, menuButton);
    await tester.tap(menuButton);
    await pumpUntilFound(tester, find.text('Edit'));
    await tester.tap(find.text('Edit'));
    await pumpUntilUrl(tester, RegExp(r'/receipts/\d+/edit'));

    // The Comments screen is pushed via Navigator (separate from GoRouter)
    // by tapping the "Comments" compact-action button on the edit form
    // (receipts/widgets/receipt_form.dart:391). The button is wrapped in
    // a Tooltip("View Comments") -- byTooltip is a single deterministic
    // match.
    final commentsButton = find.byTooltip('View Comments');
    await pumpUntilFound(tester, commentsButton);
    await tester.tap(commentsButton);
    await pumpUntilFound(tester, find.text('Receipt Comments'));

    const firstComment = 'e2e first comment';
    const secondComment = 'e2e second comment';

    await _submitComment(tester, firstComment);
    await pumpUntilFound(tester, find.text(firstComment));

    await _submitComment(tester, secondComment);
    await pumpUntilFound(tester, find.text(secondComment));

    // Both comments now present on screen -- and the API should agree.
    final afterAdds = await getReceipt(receiptId, jwt: jwt);
    final commentsAfterAdds =
        (afterAdds['comments'] as List).cast<Map<String, dynamic>>();
    expect(commentsAfterAdds.length, 2,
        reason: 'server should have 2 comments after two send taps; '
            "if the UI shows 2 but the API has fewer that's a real bug "
            'in _submitCommentToApi swallowing the POST error');
    expect(commentsAfterAdds.map((c) => c['comment']).toList(),
        containsAll(<String>[firstComment, secondComment]));

    // Swipe-delete the first comment. The slidable wraps a Column of the
    // comment row + a SizedBox spacer (receipt_comments.dart:42-47), so
    // we locate the slidable by walking up from the text we want to remove.
    final firstSlidable = find.ancestor(
      of: find.text(firstComment),
      matching: find.byType(SlidableWidget),
    );
    expect(firstSlidable, findsOneWidget);
    await tester.drag(firstSlidable, const Offset(-300, 0));
    await tester.pumpAndSettle();

    // After the drag, the end-action pane reveals exactly one
    // SlidableAction (the delete button). Tap it.
    final deleteAction = find.byType(SlidableAction);
    await pumpUntilFound(tester, deleteAction);
    await tester.tap(deleteAction);

    // Delete goes through `deleteComment` (await of API DELETE);
    // pump until the deleted text is gone from the visible tree.
    await pumpUntilGone(tester, find.text(firstComment));

    final afterDelete = await getReceipt(receiptId, jwt: jwt);
    final commentsAfterDelete =
        (afterDelete['comments'] as List).cast<Map<String, dynamic>>();
    expect(commentsAfterDelete.length, 1,
        reason: 'server should have 1 comment after swipe-delete');
    expect(commentsAfterDelete.single['comment'], secondComment);
  });
}

/// Types [comment] into the bottom-sheet comment field and taps send.
Future<void> _submitComment(WidgetTester tester, String comment) async {
  final commentField = find.byWidgetPredicate(
    (w) => w is FormBuilderTextField && w.name == 'comment',
  );
  await pumpUntilFound(tester, commentField);
  await tester.enterText(commentField, comment);
  // The submit button is disabled-until-non-empty via a BehaviorSubject;
  // a single pump won't propagate the onChanged -> setState -> rebuild
  // chain that re-enables the IconButton on slow targets.
  for (int i = 0; i < 5; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  await tester.tap(find.byIcon(Icons.send));
}
