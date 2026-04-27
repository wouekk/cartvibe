import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:receipt_wrangler_mobile/shared/widgets/bottom_submit_button.dart';

import 'helpers/api.dart';
import 'helpers/file_selector_mock.dart';
import 'helpers/form_actions.dart';
import 'helpers/login.dart';
import 'helpers/platform_mocks.dart';
import 'helpers/pump.dart';
import 'helpers/receipt_test_helpers.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // Per-test install so each gets a fresh in-memory secure-storage map
  // (a leaked JWT from the previous test would skip the login screens).
  setUp(() {
    if (Platform.isLinux) {
      installLinuxDesktopMocks();
    }
  });

  testWidgets('admin can add a manual receipt', (tester) async {
    // The Linux desktop test window defaults to 1280x720 -- too short
    // to render the receipt form's persistent bottom sheet (Submit
    // button) inside the visible viewport. 1280x900 keeps the entire
    // form in view while staying close to a tablet-sized layout.
    await binding.setSurfaceSize(const Size(1280, 900));
    addTearDown(() => binding.setSurfaceSize(null));

    await loginAsAdmin(tester);

    final receiptName =
        'e2e-manual-${DateTime.now().millisecondsSinceEpoch}';

    // Open the bottom-nav Add popup menu and pick "Add Manual Receipt".
    await tester.tap(find.text('Add'));
    await pumpUntilFound(tester, find.text('Add Manual Receipt'));
    await tester.tap(find.text('Add Manual Receipt'));
    await pumpUntilFound(tester, find.text('Name'));

    // Fill required fields. Date defaults to now and status defaults to
    // OPEN via getDefaultReceipt() (mobile/lib/utils/receipts.dart:16),
    // so both pass validation without user interaction.
    await tester.enterText(formField('name'), receiptName);
    await tester.enterText(formField('amount'), '12.34');
    await selectDropdown(tester, 'groupId', 'My Receipts');
    // The admin's displayName from signup is 'ee', not 'e2e-admin'.
    await selectDropdown(tester, 'paidByUserId', 'ee');

    // Drain the dropdown overlay teardown -- the popup-route's overlay
    // entry can otherwise leave the Scaffold's bottom-sheet area in an
    // Offstage state and the BottomSubmitButton tap silently misses.
    await tester.pumpAndSettle(const Duration(seconds: 3));

    final submitFinder = find.byType(BottomSubmitButton);
    expect(submitFinder, findsOneWidget,
        reason: 'BottomSubmitButton should be rendered on /receipts/add');
    await tester.tap(submitFinder);
    final url = await pumpUntilUrl(tester, RegExp(r'/receipts/\d+/view'));

    scheduleReceiptCleanup(receiptIdFromUrl(url));
  });

  testWidgets(
      'admin can add a receipt with a gallery image',
      // mobile/lib/utils/scan.dart:58 throws "Unsupported platform" on
      // Linux -- the gallery picker path only handles Android/iOS.
      // On Linux we'd never reach our file_selector mock; skip the
      // test there. Runs on Android emulator + iOS simulator in CI.
      skip: Platform.isLinux,
      (tester) async {
    installFileSelectorMock();
    await binding.setSurfaceSize(const Size(1280, 900));
    addTearDown(() => binding.setSurfaceSize(null));

    await loginAsAdmin(tester);

    final receiptName =
        'e2e-image-${DateTime.now().millisecondsSinceEpoch}';

    await tester.tap(find.text('Add'));
    await pumpUntilFound(tester, find.text('Add Manual Receipt'));
    await tester.tap(find.text('Add Manual Receipt'));
    await pumpUntilFound(tester, find.text('Name'));

    // Open the Images sub-screen via the "Images" compact action button
    // in the receipt form's Details header.
    await tester.tap(find.text('Images'));
    await pumpUntilFound(tester, find.byIcon(Icons.more_vert));

    // Open the image-screen popup menu and pick "Upload from Gallery".
    await tester.tap(find.byIcon(Icons.more_vert));
    await pumpUntilFound(tester, find.text('Upload from Gallery'));
    await tester.tap(find.text('Upload from Gallery'));
    // Mocked openFiles() resolves immediately; the model's
    // imagesToUploadBehaviorSubject emits, the carousel updates.
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // Back to the form.
    await tester.tap(find.byIcon(Icons.arrow_back));
    await pumpUntilFound(tester, find.text('Name'));

    await tester.enterText(formField('name'), receiptName);
    await tester.enterText(formField('amount'), '12.34');
    await selectDropdown(tester, 'groupId', 'My Receipts');
    await selectDropdown(tester, 'paidByUserId', 'ee');

    await tester.pumpAndSettle(const Duration(seconds: 3));
    await tester.tap(find.byType(BottomSubmitButton));
    final url = await pumpUntilUrl(tester, RegExp(r'/receipts/\d+/view'));
    final receiptId = receiptIdFromUrl(url);

    // Verify server-side that the image upload sequence completed.
    // Bug-fix #2 means a partial-upload failure would NOT navigate to
    // /view, so reaching this assertion at all is half the verification;
    // the imageFiles count is the other half.
    final jwt = await apiLogin();
    final receipt = await getReceipt(receiptId, jwt: jwt);
    final imageFiles = receipt['imageFiles'] as List?;
    expect(imageFiles?.length ?? 0, 1,
        reason: 'Receipt should have exactly 1 imageFile after save');

    scheduleReceiptCleanup(receiptId);
  });
}
