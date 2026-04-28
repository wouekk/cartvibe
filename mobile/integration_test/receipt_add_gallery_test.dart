// Gallery-image flow lives in its own test file because the top-level
// GoRouter in `mobile/lib/main.dart` is a final global -- its current
// location persists across testWidgets in the same `flutter drive`
// invocation. The manual-add test in `receipt_add_test.dart` ends at
// /receipts/<id>/view; running this test in the same file would boot
// `app.main()` against that location and 403 on the receipt fetch (the
// cleanup tearDown removes the receipt before the next test starts).
// Splitting per file gives this test a fresh process via the per-spec
// loop in `.github/workflows/mobile-e2e.yml`.

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
import 'helpers/users.dart';

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    if (Platform.isLinux) {
      installLinuxDesktopMocks();
    }
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
    // in the receipt form's Details header. Target the Tooltip wrapper
    // (mobile/lib/receipts/widgets/receipt_form.dart:411) by its message
    // rather than the inner Text -- tapping the Text's geometric center
    // can miss the InkWell hit-test region on iOS Simulator's narrower
    // viewport, where the Row's compact-button layout reflows.
    final imagesButton = find.byTooltip('View Images');
    await tester.ensureVisible(imagesButton);
    await tester.pump();
    await tester.tap(imagesButton);
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
    await selectDropdown(tester, 'paidByUserId', adminDisplayName(tester));

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
